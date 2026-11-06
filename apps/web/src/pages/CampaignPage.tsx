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
  OutcomeBadge,
  Panel,
  StatCell,
  Stepper,
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
      const updated = await api.updateCampaign(id, { archived: !campaign.archivedAt });
      setCampaign(updated);
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
        <p role="alert" className="text-sm text-danger">
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/" className="text-xs text-muted underline underline-offset-2 hover:text-ink">
            ← Campaigns
          </Link>
          <h1 className="mt-1 font-display text-3xl leading-tight">{campaign.name}</h1>
          <p className="mt-1 text-xs text-muted">
            {campaign.rulesetId} · {campaign.archivedAt ? 'archived' : 'active'}
          </p>
        </div>
        <Button variant="secondary" onClick={toggleArchive}>
          {campaign.archivedAt ? 'Unarchive' : 'Archive'}
        </Button>
      </div>

      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}

      {!character ? (
        <Panel title="Who are you?" subtitle="Create a character sheet to start playing.">
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
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Panel title={character.name} subtitle={`Momentum reset +${reset} · max +${momentumCap}`}>
            <div className="grid grid-cols-5 gap-1.5">
              {STATS.map((key) => (
                <StatCell key={key} label={STAT_LABEL[key]} value={character.stats[key]} />
              ))}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <Stepper
                label="Health"
                value={character.health}
                min={0}
                max={5}
                onChange={(health) => void patchCharacter({ health })}
              />
              <Stepper
                label="Spirit"
                value={character.spirit}
                min={0}
                max={5}
                onChange={(spirit) => void patchCharacter({ spirit })}
              />
              <Stepper
                label="Supply"
                value={character.supply}
                min={0}
                max={5}
                onChange={(supply) => void patchCharacter({ supply })}
              />
              <Stepper
                label="Momentum"
                value={character.momentum}
                min={MIN_MOMENTUM}
                max={momentumCap}
                onChange={(momentum) => void patchCharacter({ momentum })}
              />
            </div>

            <fieldset className="mt-4">
              <legend className="text-xs uppercase tracking-wide text-muted">Debilities</legend>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {DEBILITIES.map((key) => {
                  const marked = debilities.includes(key);
                  return (
                    <label
                      key={key}
                      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${
                        marked ? 'border-danger text-danger' : 'border-border text-muted'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-current"
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
            </fieldset>

            <p className="mt-3 text-xs text-muted">
              Revision {character.revision} · XP {character.xp}
            </p>
          </Panel>

          <Panel title="Roll" subtitle="Pick the stat the move uses. The server rolls.">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Stat">
              {STATS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={stat === key}
                  onClick={() => setStat(key)}
                  className={stat === key ? 'chip-selected' : 'chip'}
                >
                  {STAT_LABEL[key]}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-end gap-3">
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
                className={`mb-1 flex min-h-11 flex-1 items-center gap-2 rounded-lg border px-3 text-sm ${
                  canBurn ? 'border-border' : 'border-border text-muted'
                }`}
              >
                <input
                  type="checkbox"
                  className="size-4"
                  checked={burn}
                  disabled={!canBurn}
                  onChange={(event) => setBurn(event.target.checked)}
                />
                Burn momentum{' '}
                {canBurn ? `(${character.momentum} → +${reset})` : '(needs positive momentum)'}
              </label>
            </div>

            <div className="mt-3">
              <Button variant="primary" onClick={() => void doRoll()} busy={rolling}>
                Roll {STAT_LABEL[stat]}
              </Button>
            </div>

            <div className="mt-4" role="status" aria-live="polite" aria-label="Latest roll">
              {lastRoll ? (
                <div className="inset p-3">
                  <div className="flex items-center justify-between">
                    <OutcomeBadge outcome={lastRoll.outcome} />
                    <span className="text-xs text-muted">
                      {STAT_LABEL[lastRoll.stat]} + {lastRoll.adds}
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
                <p className="text-sm text-muted">No roll yet this session.</p>
              )}
            </div>
          </Panel>
        </div>
      )}

      <Panel title="Roll history" subtitle="Newest first. Rolls are permanent.">
        {rolls.length === 0 ? (
          <p className="text-sm text-muted">Nothing rolled yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rolls.map((roll) => (
              <li key={roll.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2 text-sm">
                  <OutcomeBadge outcome={roll.outcome} />
                  <span className="text-muted">
                    {STAT_LABEL[roll.stat]}
                    {roll.adds !== 0 ? ` ${roll.adds > 0 ? '+' : ''}${roll.adds}` : ''}
                  </span>
                </span>
                <span className="font-mono text-xs text-muted">
                  {roll.actionDie} vs {roll.challenge[0]}/{roll.challenge[1]} = {roll.actionScore}
                  {roll.match ? ' · match' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <details className="rounded-xl border border-border bg-surface p-5">
        <summary className="cursor-pointer text-sm font-medium text-muted">Danger zone</summary>
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted">
            Deleting hides the campaign and its rolls immediately. Type the name to confirm.
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
