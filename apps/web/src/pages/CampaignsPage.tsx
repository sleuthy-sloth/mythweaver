import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Campaign } from '@mythweaver/contracts';
import { Button, Field, Panel, TextInput } from '../components/ui';
import { describeError, useAuth } from '../lib/auth';
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
