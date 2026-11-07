import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Campaign, ImportPreview } from '@mythweaver/contracts';
import { Button, Field, Panel, TextInput } from '../components/ui';
import { describeError, useAuth } from '../lib/auth';
import { ApiError, api } from '../lib/http';

export default function CampaignsPage() {
  const { user, handleUnauthorized } = useAuth();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { campaigns: list } = await api.listCampaigns();
      setCampaigns(list);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(describeError(caught));
      setCampaigns([]);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCampaign(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createCampaign({ name: name.trim(), rulesetId: 'ironsworn' });
      setCampaigns((current) => [created, ...(current ?? [])]);
      setName('');
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  const list = campaigns ?? [];

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Your table</p>
        <h1 className="mt-0.5 text-3xl leading-tight">Campaigns</h1>
        <p className="mt-1 text-sm text-muted">
          Welcome back, {user?.displayName}. Everything here is private to your account.
        </p>
      </header>

      <Panel eyebrow="New" title="Start a campaign">
        <form onSubmit={createCampaign} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Campaign name" htmlFor="campaign-name">
              <TextInput
                id="campaign-name"
                value={name}
                onChange={setName}
                placeholder="The Iron Vow"
                required
              />
            </Field>
          </div>
          <Button type="submit" variant="primary" busy={busy} disabled={!name.trim()}>
            Create
          </Button>
        </form>
      </Panel>

      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}

      <ImportPanel
        onImported={async (campaignId) => {
          await load();
          navigate(`/campaigns/${campaignId}`);
        }}
        onUnauthorized={handleUnauthorized}
      />

      <section aria-labelledby="list-heading" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="list-heading" className="text-xl">
            {campaigns === null
              ? 'Loading…'
              : list.length === 0
                ? 'No campaigns yet'
                : 'Open a campaign'}
          </h2>
          {list.length > 0 ? (
            <span className="eyebrow">
              {list.length} {list.length === 1 ? 'campaign' : 'campaigns'}
            </span>
          ) : null}
        </div>

        {campaigns !== null && list.length === 0 ? (
          <p className="max-w-prose text-sm text-muted">
            Create your first campaign above. A campaign holds your character, the rolls you make,
            and — soon — the vows and world around them.
          </p>
        ) : null}

        <ul className="space-y-2">
          {list.map((campaign, index) => (
            <li key={campaign.id}>
              <Link to={`/campaigns/${campaign.id}`} className="ledger-row">
                <span className="flex items-baseline gap-3">
                  <span className="eyebrow mono-figures w-6 shrink-0">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>
                    <span className="display text-lg leading-tight">{campaign.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {campaign.rulesetId} · {campaign.archivedAt ? 'archived' : 'active'} ·{' '}
                      {campaign.role}
                    </span>
                  </span>
                </span>
                <span aria-hidden="true" className="text-muted">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * Import is two steps on purpose: the file is checked and summarized first, and nothing is written
 * until the player confirms what they are about to add.
 */
function ImportPanel({
  onImported,
  onUnauthorized,
}: {
  onImported: (campaignId: string) => Promise<void>;
  onUnauthorized: () => void;
}) {
  const [bundle, setBundle] = useState<unknown>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    setBundle(null);
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      setPreview(await api.previewImport(parsed));
      setBundle(parsed);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        onUnauthorized();
        return;
      }
      setError(
        caught instanceof SyntaxError ? 'That file is not valid JSON.' : describeError(caught),
      );
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!bundle) return;
    setBusy(true);
    try {
      const result = await api.importCampaign(bundle);
      setPreview(null);
      setBundle(null);
      await onImported(result.campaignId);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        onUnauthorized();
        return;
      }
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel eyebrow="Bring one in" title="Import a campaign file">
      <p className="m-0 mb-3 text-sm text-muted">
        A Mythweaver export becomes a new campaign you own. Nothing in it can run code or touch an
        existing campaign.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="btn btn-secondary cursor-pointer" htmlFor="import-file">
          {busy ? 'Checking…' : 'Choose a file'}
        </label>
        <input
          id="import-file"
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => void choose(event.target.files?.[0])}
        />
      </div>

      {error ? (
        <p className="alert mt-3" role="alert">
          {error}
        </p>
      ) : null}

      {preview ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-rule pt-3">
          <p className="m-0 text-sm">
            <strong>{preview.campaignName}</strong> — {preview.counts.characters} characters,{' '}
            {preview.counts.npcs} people, {preview.counts.factions} factions,{' '}
            {preview.counts.locations} places, {preview.counts.journal} journal entries,{' '}
            {preview.counts.rolls} rolls.
          </p>
          {preview.warnings.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs text-muted">
              {preview.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void confirm()} busy={busy}>
              Import it
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPreview(null);
                setBundle(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
