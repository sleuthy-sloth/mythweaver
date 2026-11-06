import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Campaign, Character, Roll } from '@mythweaver/contracts';
import {
  DEBILITIES,
  MIN_MOMENTUM,
  maxMomentum,
  momentumReset,
  resolveActionDice,
  STATS,
} from '@mythweaver/rules-ironsworn';
import {
  Button,
  DiceRow,
  Field,
  MomentumGauge,
  OutcomeMark,
  Panel,
  PipMeter,
  RollLine,
  StatFigure,
  TextInput,
} from '../components/ui';
import SyncBar from '../components/SyncBar';
import { describeError, useAuth } from '../lib/auth';
import {
  getCampaign as readCachedCampaign,
  getCharacters as readCachedCharacters,
  getRolls as readCachedRolls,
  putCampaign,
  putCharacter,
  putRoll,
} from '../lib/db';
import { ApiError, api } from '../lib/http';
import { enqueue } from '../lib/sync';

const STAT_LABEL: Record<(typeof STATS)[number], string> = {
  edge: 'Edge',
  heart: 'Heart',
  iron: 'Iron',
  shadow: 'Shadow',
  wits: 'Wits',
};

const DEBILITY_LABEL: Record<(typeof DEBILITIES)[number], string> = {
  wounded: 'Wounded',
  shaken: 'Shaken',
  unprepared: 'Unprepared',
};

export default function CampaignPage() {
  const { id = '' } = useParams();
  const { handleUnauthorized } = useAuth();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [lastRoll, setLastRoll] = useState<Roll | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Network failed and this campaign was never cached: different problem from a 404. */
  const [unavailableOffline, setUnavailableOffline] = useState(false);

  const [newName, setNewName] = useState('');
  const [stat, setStat] = useState<(typeof STATS)[number]>('iron');
  const [adds, setAdds] = useState(0);
  const [burn, setBurn] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  const character = characters[0] ?? null;

  // React 18 warns when a late response updates an unmounted tree; this page loads from cache and
  // network in sequence, so it can finish after navigation.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fail = useCallback(
    (caught: unknown) => {
      if (caught instanceof ApiError && caught.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(describeError(caught));
    },
    [handleUnauthorized],
  );

  /**
   * Cache first, network second. The sheet paints from IndexedDB immediately and the fresh copy
   * replaces it when it arrives; offline, the cached copy is simply what you play from.
   */
  const load = useCallback(async () => {
    // The cache is an optimisation, never a requirement: if IndexedDB is unavailable (private
    // mode, storage disabled) the page still works straight from the network.
    try {
      const [cachedCampaign, cachedCharacters, cachedRolls] = await Promise.all([
        readCachedCampaign(id),
        readCachedCharacters(id),
        readCachedRolls(id),
      ]);

      if (cachedCampaign && mounted.current) {
        setCampaign(cachedCampaign);
        setCharacters(cachedCharacters);
        setRolls(cachedRolls);
        setLoading(false);
      }
    } catch {
      /* no local database: continue with the network request below */
    }

    try {
      const [campaignResult, characterResult, rollResult] = await Promise.all([
        api.getCampaign(id),
        api.listCharacters(id),
        api.listRolls(id),
      ]);
      if (!mounted.current) return;
      setCampaign(campaignResult);
      setCharacters(characterResult.characters);
      setRolls(rollResult.rolls);

      await Promise.all([
        putCampaign(campaignResult),
        ...characterResult.characters.map((entry) => putCharacter(entry)),
        ...rollResult.rolls.map((entry) => putRoll(entry)),
      ]);
    } catch (caught) {
      // A network failure with a cached copy is not an error worth shouting about; without one,
      // say plainly that the campaign has never been stored on this device.
      if (caught instanceof ApiError) {
        fail(caught);
      } else {
        // No server answer at all. Logged because the alternative is a silent blank page.
        console.error('campaign load failed', caught);
        if (mounted.current) setUnavailableOffline(true);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [id, fail]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCharacter(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    try {
      const created = await api.createCharacter(id, { name: newName.trim() });
      setCharacters([created]);
      setNewName('');
    } catch (caught) {
      fail(caught);
    }
  }

  /**
   * Applies the edit locally first. Online it is confirmed by the server; offline (or on a dropped
   * connection) the change is queued with the revision it was based on, so the server can refuse it
   * later rather than let it silently overwrite someone else's edit.
   */
  async function patchCharacter(patch: Parameters<typeof api.updateCharacter>[2]) {
    if (!character) return;

    const optimistic: Character = {
      ...character,
      ...patch,
      ...(patch.stats ? { stats: { ...character.stats, ...patch.stats } } : {}),
    };
    setCharacters((current) =>
      current.map((item) => (item.id === character.id ? optimistic : item)),
    );
    await putCharacter(optimistic);

    try {
      const updated = await api.updateCharacter(id, character.id, {
        ...patch,
        baseRevision: character.revision,
      });
      setCharacters((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      await putCharacter(updated);
    } catch (caught) {
      if (caught instanceof ApiError) {
        fail(caught);
        // The server said no: put the confirmed sheet back.
        await load();
        return;
      }
      await enqueue({
        kind: 'update-character',
        campaignId: id,
        label: `${character.name}: ${Object.keys(patch)
          .filter((key) => key !== 'baseRevision')
          .join(', ')}`,
        payload: {
          characterId: character.id,
          patch: { ...patch, baseRevision: character.revision },
        },
      });
    }
  }

  /** Unbiased dN from the platform CSPRNG, for rolls made without a connection. */
  function rollDie(sides: number): number {
    const buffer = new Uint32Array(1);
    const limit = Math.floor(0xffffffff / sides) * sides;
    let value = 0;
    do {
      crypto.getRandomValues(buffer);
      value = buffer[0] ?? 0;
    } while (value >= limit);
    return (value % sides) + 1;
  }

  /** Rolls locally, stores the result as pending, and queues it for the server to verify. */
  async function rollOffline() {
    if (!character) return;
    const localId = crypto.randomUUID();
    const actionDie = rollDie(6);
    const challenge: [number, number] = [rollDie(10), rollDie(10)];

    const resolved = resolveActionDice({
      base: character.stats[stat] + adds,
      momentum: character.momentum,
      debilities: character.debilities,
      burn,
      actionDie,
      challenge,
    });

    const queued: Roll = {
      id: localId,
      campaignId: id,
      characterId: character.id,
      moveId: null,
      stat,
      adds,
      actionDie: resolved.actionDie,
      challenge: resolved.challenge,
      actionScore: resolved.actionScore,
      outcome: resolved.outcome,
      match: resolved.match,
      burned: resolved.burned,
      source: 'client',
      momentumBefore: resolved.momentumBefore,
      momentumAfter: resolved.momentumAfter,
      createdAt: new Date().toISOString(),
    };

    setRolls((current) => [queued, ...current].slice(0, 20));
    setLastRoll(queued);
    await putRoll(queued, true);

    await enqueue({
      kind: 'roll',
      campaignId: id,
      label: `Roll ${stat}`,
      payload: {
        characterId: character.id,
        stat,
        adds,
        burnMomentum: burn,
        dice: { actionDie, challenge },
        localRollId: localId,
      },
    });

    if (resolved.burned) {
      const next = { ...character, momentum: resolved.momentumAfter };
      setCharacters([next]);
      await putCharacter(next);
    }
    setBurn(false);
  }

  async function doRoll() {
    if (!character) return;
    setRolling(true);
    setError(null);

    if (!navigator.onLine) {
      await rollOffline();
      setRolling(false);
      return;
    }

    try {
      const result = await api.roll(id, {
        characterId: character.id,
        stat,
        adds,
        burnMomentum: burn,
      });
      setRolls((current) => [result, ...current].slice(0, 20));
      setLastRoll(result);
      setBurn(false);
      if (result.burned) {
        // Burning resets momentum on the server; pull the canonical sheet rather than guess.
        const refreshed = await api.listCharacters(id);
        setCharacters(refreshed.characters);
      }
    } catch (caught) {
      if (caught instanceof ApiError) {
        fail(caught);
      } else {
        // The connection dropped mid-roll: keep playing, and let the outbox catch up.
        await rollOffline();
      }
    } finally {
      setRolling(false);
    }
  }

  async function toggleArchive() {
    if (!campaign) return;
    try {
      setCampaign(await api.updateCampaign(id, { archived: !campaign.archivedAt }));
    } catch (caught) {
      fail(caught);
    }
  }

  async function removeCampaign() {
    if (!campaign) return;
    try {
      await api.deleteCampaign(id, confirmName);
      window.location.assign('/');
    } catch (caught) {
      fail(caught);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted">Opening the campaign…</p>;
  }

  if (!campaign) {
    return (
      <div className="space-y-3">
        <p role="alert" className="alert">
          {error ??
            (unavailableOffline
              ? 'This campaign is not stored on this device yet. Connect once to load it.'
              : 'Campaign not found.')}
        </p>
        <div className="flex items-center gap-3">
          {unavailableOffline ? (
            <Button variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          ) : null}
          <Link to="/" className="text-sm underline underline-offset-2">
            Back to campaigns
          </Link>
        </div>
      </div>
    );
  }

  const debilities = character?.debilities ?? [];
  const reset = momentumReset(debilities);
  const momentumCap = maxMomentum(debilities);
  const canBurn = (character?.momentum ?? 0) > 0;

  return (
    <div className="space-y-4">
      <header>
        <Link to="/" className="eyebrow hover:text-ink">
          ← Campaigns
        </Link>
        <div className="mt-1.5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">
              {campaign.rulesetId} · {campaign.archivedAt ? 'archived' : 'active'}
            </p>
            <h1 className="mt-0.5 text-3xl leading-tight">{campaign.name}</h1>
          </div>
          <Button variant="secondary" onClick={toggleArchive}>
            {campaign.archivedAt ? 'Unarchive' : 'Archive'}
          </Button>
        </div>
      </header>

      <SyncBar onFlushed={() => void load()} />

      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}

      {!character ? (
        <Panel eyebrow="Character" title="Who are you?">
          <p className="mb-4 text-sm text-muted">
            A sheet holds your stats, your meters, and the momentum you carry between scenes.
          </p>
          <form onSubmit={createCharacter} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field label="Character name" htmlFor="character-name">
                <TextInput
                  id="character-name"
                  value={newName}
                  onChange={setNewName}
                  placeholder="Sabine"
                  required
                />
              </Field>
            </div>
            <Button type="submit" variant="primary" disabled={!newName.trim()}>
              Create sheet
            </Button>
          </form>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="panel">
            <div className="panel-head">
              <p className="eyebrow">Character</p>
              <div className="mt-0.5 flex items-baseline justify-between gap-3">
                <h2 className="text-2xl leading-tight">{character.name}</h2>
                <span className="eyebrow">rev {character.revision}</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Momentum reset +{reset} · max +{momentumCap}
              </p>
            </div>

            <div className="flex border-y border-border">
              {STATS.map((key) => (
                <StatFigure key={key} name={STAT_LABEL[key]} value={character.stats[key]} />
              ))}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <PipMeter
                label="Health"
                value={character.health}
                min={0}
                max={5}
                onChange={(health) => void patchCharacter({ health })}
              />
              <PipMeter
                label="Spirit"
                value={character.spirit}
                min={0}
                max={5}
                onChange={(spirit) => void patchCharacter({ spirit })}
              />
              <PipMeter
                label="Supply"
                value={character.supply}
                min={0}
                max={5}
                onChange={(supply) => void patchCharacter({ supply })}
              />
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <MomentumGauge
                value={character.momentum}
                reset={reset}
                max={momentumCap}
                min={MIN_MOMENTUM}
                onChange={(momentum) => void patchCharacter({ momentum })}
              />
            </div>

            <div className="mt-4 border-t border-border pt-3">
              <p className="eyebrow">Debilities</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {DEBILITIES.map((key) => {
                  const marked = debilities.includes(key);
                  return (
                    <label
                      key={key}
                      className={`chip chip-danger cursor-pointer ${marked ? 'chip-on' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={marked}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? [...debilities, key]
                            : debilities.filter((entry) => entry !== key);
                          void patchCharacter({ debilities: next });
                        }}
                      />
                      {DEBILITY_LABEL[key]}
                    </label>
                  );
                })}
              </div>
            </div>

            <p className="mt-3 text-[11px] text-muted">XP {character.xp}</p>
          </section>

          <section className="panel">
            <div className="panel-head">
              <p className="eyebrow">Move</p>
              <h2 className="mt-0.5 text-xl leading-tight">Roll</h2>
            </div>

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Stat">
              {STATS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={stat === key}
                  onClick={() => setStat(key)}
                  className={`chip flex-1 justify-center ${stat === key ? 'chip-on' : ''}`}
                >
                  {STAT_LABEL[key]}
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-end gap-3">
              <div className="w-24">
                <Field label="Adds" htmlFor="adds">
                  <TextInput
                    id="adds"
                    type="number"
                    value={adds}
                    onChange={(value) => setAdds(Number(value) || 0)}
                    min={-5}
                    max={10}
                    inputMode="numeric"
                  />
                </Field>
              </div>
              <label
                className={`chip mb-0.5 flex-1 ${burn ? 'chip-on' : ''} ${
                  canBurn ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                }`}
              >
                <input
                  type="checkbox"
                  className="size-4"
                  checked={burn}
                  disabled={!canBurn}
                  onChange={(event) => setBurn(event.target.checked)}
                />
                <span className="text-[13px] leading-tight">
                  Burn momentum
                  <span className="block text-[11px] opacity-80">
                    {canBurn ? `${character.momentum} → +${reset}` : 'needs positive momentum'}
                  </span>
                </span>
              </label>
            </div>

            <Button
              variant="primary"
              onClick={() => void doRoll()}
              busy={rolling}
              className="mt-4 w-full"
            >
              Roll {STAT_LABEL[stat]}
            </Button>

            <div
              className="mt-4 border-t border-border pt-4"
              role="status"
              aria-live="polite"
              aria-label="Latest roll"
            >
              {lastRoll ? (
                <div>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <OutcomeMark outcome={lastRoll.outcome} />
                    <span className="eyebrow">
                      {STAT_LABEL[lastRoll.stat]}
                      {lastRoll.adds !== 0
                        ? ` ${lastRoll.adds > 0 ? '+' : ''}${lastRoll.adds}`
                        : ''}
                      {lastRoll.match ? ' · match' : ''}
                    </span>
                  </div>
                  <div className="mt-3">
                    <DiceRow roll={lastRoll} />
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {lastRoll.burned
                      ? `Momentum burned: ${lastRoll.momentumBefore} → ${lastRoll.momentumAfter}.`
                      : 'Momentum unchanged.'}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Pick a stat and roll. The dice come from the server and are kept.
                </p>
              )}
            </div>
          </section>
        </div>
      )}

      <Panel eyebrow="Record" title="Roll history">
        {rolls.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing rolled yet. The ledger starts with your first move.
          </p>
        ) : (
          <ul>
            {rolls.map((roll) => (
              <RollLine key={roll.id} roll={roll} />
            ))}
          </ul>
        )}
      </Panel>

      <details className="panel">
        <summary className="eyebrow cursor-pointer">Danger zone</summary>
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted">
            Deleting hides this campaign and its rolls immediately. Type the name to confirm.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <TextInput
              id="confirm-name"
              value={confirmName}
              onChange={setConfirmName}
              placeholder={campaign.name}
            />
            <Button
              variant="danger"
              disabled={confirmName !== campaign.name}
              onClick={() => void removeCampaign()}
            >
              Delete campaign
            </Button>
          </div>
        </div>
      </details>
    </div>
  );
}
