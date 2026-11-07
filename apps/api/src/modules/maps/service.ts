import type { CampaignMap, MapMarker } from '@mythweaver/contracts';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { campaignMaps, locations, mapMarkers } from '../../db/schema';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { getCampaignForUser } from '../campaigns/service';

export const MAX_MAP_BYTES = 2 * 1024 * 1024;

type Row = typeof campaignMaps.$inferSelect;

export function toMapDto(row: Row): CampaignMap {
  return {
    id: row.id,
    campaignId: row.campaignId,
    name: row.name,
    mimeType: row.mimeType as CampaignMap['mimeType'],
    width: row.width,
    height: row.height,
    attribution: row.attribution,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMarkerDto(row: typeof mapMarkers.$inferSelect): MapMarker {
  return {
    id: row.id,
    campaignId: row.campaignId,
    x: row.x,
    y: row.y,
    label: row.label,
    locationId: row.locationId,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Identifies the image from its bytes, not from the declared type: a client can claim anything.
 * Only the three formats we can also measure are accepted.
 */
export function sniffImage(
  bytes: Buffer,
): { mimeType: 'image/png' | 'image/jpeg'; width: number; height: number } | null {
  if (bytes.length < 24) return null;

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    // PNG: IHDR is always the first chunk; width and height are big-endian at 16 and 20.
    return {
      mimeType: 'image/png',
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    // JPEG: walk the segments until a start-of-frame, which carries the dimensions.
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1] ?? 0;
      const length = bytes.readUInt16BE(offset + 2);
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        return {
          mimeType: 'image/jpeg',
          width: bytes.readUInt16BE(offset + 7),
          height: bytes.readUInt16BE(offset + 5),
        };
      }
      offset += 2 + length;
    }
  }

  return null;
}

async function requireEditor(db: Database, userId: string, campaignId: string): Promise<void> {
  const { role } = await getCampaignForUser(db, userId, campaignId);
  if (role === 'viewer') throw forbidden('You can read this campaign but not change it');
}

export async function getMap(
  db: Database,
  userId: string,
  campaignId: string,
): Promise<{ map: CampaignMap | null; markers: MapMarker[] }> {
  await getCampaignForUser(db, userId, campaignId);

  const [map] = await db
    .select()
    .from(campaignMaps)
    .where(eq(campaignMaps.campaignId, campaignId))
    .limit(1);

  if (!map) return { map: null, markers: [] };

  const markers = await db
    .select()
    .from(mapMarkers)
    .where(eq(mapMarkers.campaignId, campaignId))
    .orderBy(asc(mapMarkers.createdAt));

  return { map: toMapDto(map), markers: markers.map(toMarkerDto) };
}

export async function putMap(
  db: Database,
  userId: string,
  campaignId: string,
  input: { bytes: Buffer; name?: string; attribution?: string },
): Promise<CampaignMap> {
  await requireEditor(db, userId, campaignId);

  if (input.bytes.length > MAX_MAP_BYTES) {
    throw badRequest('That image is larger than 2 MB');
  }

  const sniffed = sniffImage(input.bytes);
  if (!sniffed) throw badRequest('That file is not a PNG or JPEG image');

  const [row] = await db
    .insert(campaignMaps)
    .values({
      campaignId,
      name: (input.name ?? 'Map').slice(0, 120),
      mimeType: sniffed.mimeType,
      width: sniffed.width,
      height: sniffed.height,
      attribution: input.attribution?.slice(0, 400) || null,
      image: input.bytes,
    })
    .onConflictDoUpdate({
      target: campaignMaps.campaignId,
      set: {
        name: (input.name ?? 'Map').slice(0, 120),
        mimeType: sniffed.mimeType,
        width: sniffed.width,
        height: sniffed.height,
        attribution: input.attribution?.slice(0, 400) || null,
        image: input.bytes,
        updatedAt: new Date(),
        revision: sql`${campaignMaps.revision} + 1`,
      },
    })
    .returning();

  if (!row) throw new Error('map upsert returned no row');
  return toMapDto(row);
}

export async function updateMap(
  db: Database,
  userId: string,
  campaignId: string,
  input: { name?: string; attribution?: string | null },
): Promise<CampaignMap> {
  await requireEditor(db, userId, campaignId);

  const [row] = await db
    .update(campaignMaps)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.attribution !== undefined ? { attribution: input.attribution } : {}),
      updatedAt: new Date(),
      revision: sql`${campaignMaps.revision} + 1`,
    })
    .where(eq(campaignMaps.campaignId, campaignId))
    .returning();

  if (!row) throw notFound('This campaign has no map');
  return toMapDto(row);
}

export async function deleteMap(db: Database, userId: string, campaignId: string): Promise<void> {
  await requireEditor(db, userId, campaignId);
  // Markers cascade with the map, so a new upload starts clean rather than inheriting pins.
  const deleted = await db
    .delete(campaignMaps)
    .where(eq(campaignMaps.campaignId, campaignId))
    .returning({ id: campaignMaps.id });
  if (deleted.length === 0) throw notFound('This campaign has no map');
}

export async function readMapImage(
  db: Database,
  userId: string,
  campaignId: string,
): Promise<{ bytes: Buffer; mimeType: string; revision: number }> {
  await getCampaignForUser(db, userId, campaignId);
  const [row] = await db
    .select({
      image: campaignMaps.image,
      mimeType: campaignMaps.mimeType,
      revision: campaignMaps.revision,
    })
    .from(campaignMaps)
    .where(eq(campaignMaps.campaignId, campaignId))
    .limit(1);
  if (!row) throw notFound('This campaign has no map');
  return { bytes: Buffer.from(row.image), mimeType: row.mimeType, revision: row.revision };
}

async function assertLocation(
  db: Database,
  campaignId: string,
  locationId: string | null | undefined,
): Promise<void> {
  if (!locationId) return;
  const [row] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.campaignId, campaignId)))
    .limit(1);
  if (!row) throw badRequest('That place is not in this campaign');
}

export async function createMarker(
  db: Database,
  userId: string,
  campaignId: string,
  input: { x: number; y: number; label: string; locationId?: string | null },
): Promise<MapMarker> {
  await requireEditor(db, userId, campaignId);

  const [map] = await db
    .select({ id: campaignMaps.id })
    .from(campaignMaps)
    .where(eq(campaignMaps.campaignId, campaignId))
    .limit(1);
  if (!map) throw badRequest('Add a map before placing markers');

  await assertLocation(db, campaignId, input.locationId);

  const [row] = await db
    .insert(mapMarkers)
    .values({
      campaignId,
      mapId: map.id,
      x: input.x,
      y: input.y,
      label: input.label,
      locationId: input.locationId ?? null,
    })
    .returning();

  if (!row) throw new Error('marker insert returned no row');
  return toMarkerDto(row);
}

export async function updateMarker(
  db: Database,
  userId: string,
  campaignId: string,
  markerId: string,
  input: { x?: number; y?: number; label?: string; locationId?: string | null },
): Promise<MapMarker> {
  await requireEditor(db, userId, campaignId);
  if (input.locationId !== undefined) await assertLocation(db, campaignId, input.locationId);

  const [row] = await db
    .update(mapMarkers)
    .set({
      ...(input.x !== undefined ? { x: input.x } : {}),
      ...(input.y !== undefined ? { y: input.y } : {}),
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.locationId !== undefined ? { locationId: input.locationId } : {}),
    })
    .where(and(eq(mapMarkers.id, markerId), eq(mapMarkers.campaignId, campaignId)))
    .returning();

  if (!row) throw notFound('Marker not found');
  return toMarkerDto(row);
}

export async function deleteMarker(
  db: Database,
  userId: string,
  campaignId: string,
  markerId: string,
): Promise<void> {
  await requireEditor(db, userId, campaignId);
  const deleted = await db
    .delete(mapMarkers)
    .where(and(eq(mapMarkers.id, markerId), eq(mapMarkers.campaignId, campaignId)))
    .returning({ id: mapMarkers.id });
  if (deleted.length === 0) throw notFound('Marker not found');
}
