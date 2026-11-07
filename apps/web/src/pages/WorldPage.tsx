import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  Faction,
  JournalEntry,
  Npc,
  Relationship,
  WorldKind,
  WorldLocation,
} from '@mythweaver/contracts';
import { Button, Field, Panel, Select, TextArea, TextInput } from '../components/ui';
import { describeError, useAuth } from '../lib/auth';
import { ApiError, api, type WorldEntity } from '../lib/http';

type Tab = 'npc' | 'faction' | 'location' | 'journal';

const TABS: { id: Tab; label: string }[] = [
  { id: 'npc', label: 'People' },
  { id: 'faction', label: 'Factions' },
  { id: 'location', label: 'Places' },
  { id: 'journal', label: 'Journal' },
];

const LOCATION_KINDS = ['settlement', 'site', 'wilds', 'other'] as const;

function isNpc(entity: WorldEntity): entity is Npc {
  return 'role' in entity && !('kind' in entity);
}

function isLocation(entity: WorldEntity): entity is WorldLocation {
  return 'kind' in entity;
}

function kindOf(entity: WorldEntity): WorldKind {
  return isNpc(entity) ? 'npc' : isLocation(entity) ? 'location' : 'faction';
}

export default function WorldPage() {
  const { id = '' } = useParams();
  const { handleUnauthorized } = useAuth();

  const [tab, setTab] = useState<Tab>('npc');
  const [entities, setEntities] = useState<WorldEntity[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);

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
      const [npcs, factions, locations, links, journal] = await Promise.all([
        api.listWorld(id, 'npc'),
        api.listWorld(id, 'faction'),
        api.listWorld(id, 'location'),
        api.listRelationships(id),
        api.listJournal(id),
      ]);
      setEntities([...npcs, ...factions, ...locations]);
      setRelationships(links.relationships);
      setEntries(journal.entries);
      setError(null);
    } catch (caught) {
      fail(caught);
    } finally {
      setLoading(false);
    }
  }, [id, fail]);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = useMemo(() => {
    const map = new Map<string, WorldEntity>();
    for (const entity of entities) map.set(entity.id, entity);
    return map;
  }, [entities]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (tab === 'journal') {
      if (!term) return entries;
      return entries.filter(
        (entry) =>
          entry.title.toLowerCase().includes(term) || entry.body.toLowerCase().includes(term),
      );
    }
    const kindEntities = entities.filter((entity) => kindOf(entity) === tab);
    if (!term) return kindEntities;
    return kindEntities.filter(
      (entity) =>
        entity.name.toLowerCase().includes(term) ||
        (entity.description ?? '').toLowerCase().includes(term) ||
        entity.tags.some((tag) => tag.toLowerCase().includes(term)),
    );
  }, [entities, entries, query, tab]);

  const connectionsFor = useCallback(
    (entityId: string) =>
      relationships.filter((link) => link.sourceId === entityId || link.targetId === entityId),
    [relationships],
  );

  const removeEntity = useCallback(
    async (kind: WorldKind, entityId: string) => {
      try {
        await api.deleteWorld(id, kind, entityId);
        await load();
      } catch (caught) {
        fail(caught);
      }
    },
    [id, load, fail],
  );

  const removeEntry = useCallback(
    async (entryId: string) => {
      try {
        await api.deleteJournalEntry(id, entryId);
        await load();
      } catch (caught) {
        fail(caught);
      }
    },
    [id, load, fail],
  );

  const labelFor = (entityId: string) => byId.get(entityId)?.name ?? 'something removed';

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="ledger-number text-xs uppercase tracking-[0.18em] text-muted">Campaign</p>
          <h1 className="font-display text-2xl">World</h1>
        </div>
        <Link
          to={`/campaigns/${id}`}
          className="rounded-sm border border-rule px-3 py-2 text-sm text-ink no-underline hover:bg-paper-sunk"
        >
          Back to play
        </Link>
      </header>

      <div
        role="tablist"
        aria-label="World sections"
        className="flex flex-wrap gap-1 border-b border-rule pb-1"
      >
        {TABS.map((entry) => {
          const selected = tab === entry.id;
          return (
            <button
              key={entry.id}
              role="tab"
              type="button"
              aria-selected={selected}
              className={`min-h-11 rounded-t-sm px-3 text-sm ${
                selected ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
              }`}
              onClick={() => {
                setTab(entry.id);
                setQuery('');
                setAdding(false);
              }}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <Field label={tab === 'journal' ? 'Search the journal' : 'Search'} htmlFor="world-search">
            <TextInput
              id="world-search"
              value={query}
              placeholder={tab === 'journal' ? 'A word you remember' : 'Name, detail or tag'}
              onChange={setQuery}
            />
          </Field>
        </div>
        <Button variant="secondary" onClick={() => setAdding((open) => !open)}>
          {adding ? 'Close' : tab === 'journal' ? 'Write an entry' : 'Add'}
        </Button>
      </div>

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      {adding &&
        (tab === 'journal' ? (
          <JournalForm
            campaignId={id}
            entities={entities}
            onDone={async () => {
              setAdding(false);
              await load();
            }}
            onError={fail}
          />
        ) : (
          <EntityForm
            campaignId={id}
            kind={tab}
            factions={entities.filter((entity) => kindOf(entity) === 'faction') as Faction[]}
            onDone={async () => {
              setAdding(false);
              await load();
            }}
            onError={fail}
          />
        ))}

      {loading ? (
        <p className="text-sm text-muted">Reading the notes…</p>
      ) : visible.length === 0 ? (
        <Panel>
          <p className="m-0 text-sm text-muted">
            {query
              ? 'Nothing matches that.'
              : tab === 'journal'
                ? 'No entries yet. Write down what happened while it is fresh.'
                : 'Nothing here yet. Add the first one.'}
          </p>
        </Panel>
      ) : tab === 'journal' ? (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {(visible as JournalEntry[]).map((entry) => (
            <li key={entry.id}>
              <Panel>
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="m-0 font-display text-lg">{entry.title}</h2>
                      <p className="ledger-number m-0 text-xs text-muted">
                        {new Date(entry.createdAt).toLocaleString()}
                        {entry.revision > 1 ? ' · edited' : ''}
                      </p>
                    </div>
                    <DangerButton label="entry" onConfirm={() => void removeEntry(entry.id)} />
                  </div>
                  {entry.body && <p className="m-0 whitespace-pre-wrap text-sm">{entry.body}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    {entry.tags.map((tag) => (
                      <span key={tag} className="chip">
                        {tag}
                      </span>
                    ))}
                    {entry.links.map((link) => (
                      <span key={`${link.type}-${link.id}`} className="chip">
                        {link.label}
                      </span>
                    ))}
                  </div>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {(visible as WorldEntity[]).map((entity) => {
            const kind = kindOf(entity);
            const subtitle = isNpc(entity)
              ? (entity.role ?? 'Person')
              : isLocation(entity)
                ? entity.kind
                : 'Faction';
            const links = connectionsFor(entity.id);
            return (
              <li key={entity.id}>
                <Panel>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="m-0 font-display text-lg">{entity.name}</h2>
                        <p className="m-0 text-xs uppercase tracking-[0.14em] text-muted">
                          {subtitle}
                        </p>
                      </div>
                      <DangerButton
                        label={kind === 'npc' ? 'person' : kind === 'faction' ? 'faction' : 'place'}
                        onConfirm={() => void removeEntity(kind, entity.id)}
                      />
                    </div>
                    {entity.description && <p className="m-0 text-sm">{entity.description}</p>}
                    {entity.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {entity.tags.map((tag) => (
                          <span key={tag} className="chip">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <LinkForm
                      campaignId={id}
                      entity={entity}
                      others={entities.filter((other) => other.id !== entity.id)}
                      onDone={load}
                      onError={fail}
                    />
                    {links.length > 0 && (
                      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-muted">
                        {links.map((link) => {
                          const other = link.sourceId === entity.id ? link.targetId : link.sourceId;
                          return (
                            <li key={link.id}>
                              {link.kind} — {labelFor(other)}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DangerButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button variant="ghost" onClick={() => setConfirming(true)}>
        Delete
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <Button variant="danger" onClick={onConfirm}>
        Delete {label}
      </Button>
      <Button variant="ghost" onClick={() => setConfirming(false)}>
        Keep
      </Button>
    </span>
  );
}

function EntityForm({
  campaignId,
  kind,
  factions,
  onDone,
  onError,
}: {
  campaignId: string;
  kind: 'npc' | 'faction' | 'location';
  factions: Faction[];
  onDone: () => Promise<void>;
  onError: (caught: unknown) => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [factionId, setFactionId] = useState('');
  const [locationKind, setLocationKind] = useState<string>('settlement');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await api.createWorld(campaignId, kind, {
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(kind === 'npc' && role.trim() ? { role: role.trim() } : {}),
        ...(kind === 'npc' && factionId ? { factionId } : {}),
        ...(kind === 'location' ? { kind: locationKind } : {}),
      });
      await onDone();
    } catch (caught) {
      onError(caught);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel>
      <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
        <Field label="Name" htmlFor="entity-name">
          <TextInput id="entity-name" value={name} required maxLength={120} onChange={setName} />
        </Field>

        {kind === 'npc' && (
          <Field label="Role" htmlFor="entity-role" hint="Optional. What they are to you.">
            <TextInput id="entity-role" value={role} maxLength={60} onChange={setRole} />
          </Field>
        )}

        {kind === 'npc' && factions.length > 0 && (
          <Field label="Faction" htmlFor="entity-faction" hint="Optional.">
            <Select id="entity-faction" value={factionId} onChange={setFactionId}>
              <option value="">Unaffiliated</option>
              {factions.map((faction) => (
                <option key={faction.id} value={faction.id}>
                  {faction.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {kind === 'location' && (
          <Field label="Kind" htmlFor="entity-kind">
            <Select id="entity-kind" value={locationKind} onChange={setLocationKind}>
              {LOCATION_KINDS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          label="Notes"
          htmlFor="entity-notes"
          hint="Optional. What you would forget otherwise."
        >
          <TextArea
            id="entity-notes"
            value={description}
            maxLength={4000}
            onChange={setDescription}
          />
        </Field>

        <div>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function JournalForm({
  campaignId,
  entities,
  onDone,
  onError,
}: {
  campaignId: string;
  entities: WorldEntity[];
  onDone: () => Promise<void>;
  onError: (caught: unknown) => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const target = entities.find((entity) => entity.id === link);
      await api.createJournalEntry(campaignId, {
        title: title.trim(),
        body: body.trim(),
        ...(target ? { links: [{ type: kindOf(target), id: target.id, label: target.name }] } : {}),
      });
      await onDone();
    } catch (caught) {
      onError(caught);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel>
      <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
        <Field label="Title" htmlFor="journal-title">
          <TextInput
            id="journal-title"
            value={title}
            required
            maxLength={160}
            onChange={setTitle}
          />
        </Field>
        <Field label="What happened" htmlFor="journal-body">
          <TextArea id="journal-body" rows={8} value={body} maxLength={20000} onChange={setBody} />
        </Field>
        {entities.length > 0 && (
          <Field
            label="Link to"
            htmlFor="journal-link"
            hint="Optional. Keeps the entry next to who or where it happened."
          >
            <Select id="journal-link" value={link} onChange={setLink}>
              <option value="">Nothing in particular</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save entry'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

/**
 * Edges are drawn from a card rather than a separate screen: in play you are looking at a person
 * and remember they owe someone, so the action belongs next to them.
 */
function LinkForm({
  campaignId,
  entity,
  others,
  onDone,
  onError,
}: {
  campaignId: string;
  entity: WorldEntity;
  others: WorldEntity[];
  onDone: () => Promise<void>;
  onError: (caught: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [kind, setKind] = useState('knows');
  const [saving, setSaving] = useState(false);

  if (others.length === 0) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!target || saving) return;
    setSaving(true);
    try {
      const other = others.find((candidate) => candidate.id === target);
      if (!other) return;
      await api.createRelationship(campaignId, {
        sourceType: kindOf(entity),
        sourceId: entity.id,
        targetType: kindOf(other),
        targetId: other.id,
        kind: kind.trim() || 'knows',
      });
      setOpen(false);
      setTarget('');
      await onDone();
    } catch (caught) {
      onError(caught);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div>
        <Button variant="ghost" onClick={() => setOpen(true)}>
          Link someone or somewhere
        </Button>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={(event) => void submit(event)}>
      <Field label="How are they connected?" htmlFor={`link-kind-${entity.id}`}>
        <TextInput
          id={`link-kind-${entity.id}`}
          value={kind}
          maxLength={40}
          onChange={setKind}
          placeholder="knows, owes, guards, member"
        />
      </Field>
      <Field label="To" htmlFor={`link-target-${entity.id}`}>
        <Select id={`link-target-${entity.id}`} value={target} onChange={setTarget}>
          <option value="">Choose…</option>
          {others.map((other) => (
            <option key={other.id} value={other.id}>
              {other.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={saving || !target}>
          {saving ? 'Linking…' : 'Link'}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
