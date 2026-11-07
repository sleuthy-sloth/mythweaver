import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { CampaignMap, MapMarker, WorldLocation } from '@mythweaver/contracts';
import { Button, Field, Panel, TextInput } from '../components/ui';
import { api } from '../lib/http';

/**
 * One image per campaign, with markers placed by tapping. Coordinates are stored 0..1, so a marker
 * lands in the same place whether the map is drawn 390px or 1400px wide.
 */
export default function MapTab({
  campaignId,
  places,
  onError,
}: {
  campaignId: string;
  places: WorldLocation[];
  onError: (caught: unknown) => void;
}) {
  const [map, setMap] = useState<CampaignMap | null>(null);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<MapMarker | null>(null);
  const [attribution, setAttribution] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await api.getMap(campaignId);
      setMap(result.map);
      setMarkers(result.markers);
      setAttribution(result.map?.attribution ?? '');
    } catch (caught) {
      onError(caught);
    } finally {
      setLoading(false);
    }
  }, [campaignId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const uploaded = await api.uploadMap(campaignId, file, file.name.replace(/\.[a-z]+$/i, ''));
      setMap(uploaded);
      setMarkers([]);
      setAttribution(uploaded.attribution ?? '');
    } catch (caught) {
      onError(caught);
    } finally {
      setBusy(false);
    }
  };

  const saveAttribution = async () => {
    setBusy(true);
    try {
      setMap(await api.updateMap(campaignId, { attribution: attribution.trim() || null }));
    } catch (caught) {
      onError(caught);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteMap(campaignId);
      setMap(null);
      setMarkers([]);
    } catch (caught) {
      onError(caught);
    } finally {
      setBusy(false);
    }
  };

  const placeMarker = async (event: FormEvent) => {
    event.preventDefault();
    if (!pending) return;
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    setBusy(true);
    try {
      const marker = await api.createMarker(campaignId, {
        x: pending.x,
        y: pending.y,
        label: String(data.get('label') ?? 'Marker'),
        locationId: data.get('locationId') ? String(data.get('locationId')) : null,
      });
      setMarkers((current) => [...current, marker]);
      setPending(null);
      form.reset();
    } catch (caught) {
      onError(caught);
    } finally {
      setBusy(false);
    }
  };

  const removeMarker = async (marker: MapMarker) => {
    setBusy(true);
    try {
      await api.deleteMarker(campaignId, marker.id);
      setMarkers((current) => current.filter((item) => item.id !== marker.id));
      setSelected(null);
    } catch (caught) {
      onError(caught);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-muted">Looking for a map…</p>;

  if (!map) {
    return (
      <Panel eyebrow="Map" title="No map yet">
        <p className="m-0 mb-3 text-sm text-muted">
          Upload a drawing or a photo of your own. PNG or JPEG, up to 2 MB. Nothing is downloaded
          from anywhere.
        </p>
        <label className="btn btn-secondary cursor-pointer" htmlFor="map-file">
          {busy ? 'Uploading…' : 'Choose an image'}
        </label>
        <input
          id="map-file"
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          onChange={(event) => void upload(event.target.files?.[0])}
        />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        eyebrow="Map"
        title={map.name}
        actions={
          <Button variant="ghost" onClick={() => void remove()} busy={busy}>
            Remove
          </Button>
        }
      >
        <p className="m-0 mb-2 text-xs text-muted">
          {map.width} × {map.height} · tap the map to drop a marker
        </p>
        <div className="relative overflow-hidden rounded-sm border border-rule">
          <img
            src={`/api/v1/campaigns/${campaignId}/map/image?v=${map.revision}`}
            alt={`Map: ${map.name}`}
            className="block w-full"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setPending({
                x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
                y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
              });
              setSelected(null);
            }}
          />
          {markers.map((marker) => (
            <button
              key={marker.id}
              type="button"
              aria-label={`Marker: ${marker.label}`}
              className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-paper bg-ink text-xs font-bold text-paper shadow"
              style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
              onClick={(event) => {
                event.stopPropagation();
                setSelected(marker);
                setPending(null);
              }}
            >
              •
            </button>
          ))}
        </div>

        {pending ? (
          <form className="mt-3 flex flex-col gap-2" onSubmit={(event) => void placeMarker(event)}>
            <Field label="What is here?" htmlFor="marker-label">
              {/* Uncontrolled on purpose: the form is submitted once, then discarded. */}
              <input id="marker-label" name="label" className="input" required maxLength={120} />
            </Field>
            {places.length > 0 ? (
              <Field label="Linked place" htmlFor="marker-place" hint="Optional.">
                <select id="marker-place" name="locationId" className="input" defaultValue="">
                  <option value="">Not linked</option>
                  {places.map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" variant="primary" busy={busy}>
                Place marker
              </Button>
              <Button variant="ghost" onClick={() => setPending(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {selected ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-3">
            <p className="m-0 text-sm">
              <strong>{selected.label}</strong>
              {selected.locationId
                ? ` — ${places.find((place) => place.id === selected.locationId)?.name ?? 'a place'}`
                : ''}
            </p>
            <Button variant="danger" onClick={() => void removeMarker(selected)} busy={busy}>
              Delete marker
            </Button>
          </div>
        ) : null}
      </Panel>

      <Panel eyebrow="Provenance" title="Where this image came from">
        <p className="m-0 mb-2 text-sm text-muted">
          Recorded with the map and carried in exports. Leave it empty for something you drew.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Attribution" htmlFor="map-attribution">
              <TextInput
                id="map-attribution"
                value={attribution}
                maxLength={400}
                onChange={setAttribution}
                placeholder="Artist, source, licence"
              />
            </Field>
          </div>
          <Button variant="secondary" onClick={() => void saveAttribution()} busy={busy}>
            Save
          </Button>
        </div>
      </Panel>
    </div>
  );
}
