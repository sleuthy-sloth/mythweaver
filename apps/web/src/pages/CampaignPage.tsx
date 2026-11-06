import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Campaign, Character, Roll } from '@mythweaver/contracts';
import {
  DEBILITIES,
  MIN_MOMENTUM,
  maxMomentum,
  momentumReset,
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
import { describeError, useAuth } from '../lib/auth';
import { ApiError, api } from '../lib/http';

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

  const [newName, setNewName] = useState('');
  const [stat, setStat] = useState<(typeof STATS)[number]>('iron');
  const [adds, setAdds] = useState(0);
  const [burn, setBurn] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  const character = characters[0] ?? null;

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

  const load = useCallback(async () => {
    try {
      const [campaignResult, characterResult, rollResult] = await Promise.all([
        api.getCampaign(id),
        api.listCharacters(id),
        api.listRolls(id),
      ]);
      setCampaign(campaignResult);
      setCharacters(characterResult.characters);
      setRolls(rollResult.rolls);
    } catch (caught) {
      fail(caught);
    } finally {
      setLoading(false);
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

  async function patchCharacter(patch: Parameters<typeof api.updateCharacter>[2]) {
    if (!character) return;
    try {
      const updated = await api.updateCharacter(id, character.id, patch);
      setCharacters((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught) {
      fail(caught);
    }
  }

  async function doRoll() {
    if (!character) return;
    setRolling(true);
    setError(null);
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
      fail(caught);
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
          {error ?? 'Campaign not found.'}
        </p>
        <Link to="/" className="text-sm underline underline-offset-2">
          Back to campaigns
        </Link>
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
