import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Campaign } from '@mythweaver/contracts';
import { Button, Field, Panel, TextInput } from '../components/ui';
import { useAuth, describeError } from '../lib/auth';
import { ApiError, api } from '../lib/http';

export default function CampaignsPage() {
  const { user, handleUnauthorized } = useAuth();
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

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Your table</p>
        <h1 className="mt-1 font-display text-3xl leading-tight">Campaigns</h1>
        <p className="mt-1 text-sm text-muted">
          Welcome back, {user?.displayName}. Everything here is private to your account.
        </p>
      </div>

      <Panel
        title="Start a campaign"
        subtitle="One world, one character, as many sessions as you like."
      >
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

      <section aria-labelledby="list-heading" className="space-y-3">
        <h2 id="list-heading" className="font-display text-xl">
          {campaigns === null
            ? 'Loading…'
            : campaigns.length === 0
              ? 'No campaigns yet'
              : 'Open a campaign'}
        </h2>

        {campaigns !== null && campaigns.length === 0 ? (
          <p className="text-sm text-muted">
            Create your first campaign above. A campaign holds your character, rolls and — soon —
            the vows and world around them.
          </p>
        ) : null}

        <ul className="space-y-2">
          {(campaigns ?? []).map((campaign) => (
            <li key={campaign.id}>
              <Link
                to={`/campaigns/${campaign.id}`}
                className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:border-accent"
              >
                <span>
                  <span className="font-display text-lg">{campaign.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {campaign.rulesetId} · {campaign.archivedAt ? 'archived' : 'active'} ·{' '}
                    {campaign.role}
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
