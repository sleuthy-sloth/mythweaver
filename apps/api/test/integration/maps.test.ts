import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { authedHeaders, signUp, TEST_PASSWORD } from '../helpers/api';
import { createTestContext, resetDatabase, type TestContext } from '../helpers/db';

/** A real 1×1 PNG: the sniffer reads its IHDR, so a fake would be caught. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let context: TestContext;
let app: FastifyInstance;

beforeAll(async () => {
  context = await createTestContext();
  app = await buildApp({
    config: loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: context.databaseUrl,
      REGISTRATION_OPEN: 'true',
      RATE_LIMIT_ENABLED: 'false',
      COOKIE_SECURE: 'false',
    }),
    db: context.db,
  });
});

afterAll(async () => {
  await app.close();
  await context.close();
});

beforeEach(async () => {
  await resetDatabase(context.sql);
});

async function fixture(email = 'ada@example.com') {
  const { cookies } = await signUp(app, { email, password: TEST_PASSWORD });
  const headers = authedHeaders(cookies);
  const campaign = await app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    headers,
    payload: { name: 'The Iron Vow' },
  });
  return { headers, campaignId: campaign.json().id as string };
}

async function uploadMap(headers: Record<string, string>, campaignId: string) {
  return app.inject({
    method: 'PUT',
    url: `/api/v1/campaigns/${campaignId}/map?name=The Reach&attribution=Drawn by me`,
    headers: { ...headers, 'content-type': 'image/png' },
    payload: PNG_1PX,
  });
}

describe('map upload', () => {
  it('accepts a PNG, reports its size, and serves the bytes back', async () => {
    const { headers, campaignId } = await fixture();

    const uploaded = await uploadMap(headers, campaignId);
    expect(uploaded.statusCode).toBe(200);
    expect(uploaded.json()).toMatchObject({
      name: 'The Reach',
      mimeType: 'image/png',
      width: 1,
      height: 1,
      attribution: 'Drawn by me',
      revision: 1,
    });

    const view = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/map`,
      headers,
    });
    expect(view.json().map.mimeType).toBe('image/png');
    expect(view.json().markers).toEqual([]);

    const image = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/map/image`,
      headers,
    });
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toContain('image/png');
    expect(Buffer.from(image.rawPayload)).toEqual(PNG_1PX);
  });

  it('rejects a file that is not an image, whatever it claims to be', async () => {
    const { headers, campaignId } = await fixture();
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/campaigns/${campaignId}/map`,
      headers: { ...headers, 'content-type': 'image/png' },
      payload: Buffer.from('this is not a png, it is a sentence'),
    });
    expect(response.statusCode).toBe(400);
  });

  it('replaces the image and keeps one map per campaign', async () => {
    const { headers, campaignId } = await fixture();
    await uploadMap(headers, campaignId);
    const second = await uploadMap(headers, campaignId);
    expect(second.json().revision).toBe(2);

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/map`,
      headers,
    });
    expect(list.json().map.revision).toBe(2);
  });

  it("refuses another account's map", async () => {
    const ada = await fixture('ada@example.com');
    const grace = await fixture('grace@example.com');
    await uploadMap(ada.headers, ada.campaignId);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${ada.campaignId}/map/image`,
      headers: grace.headers,
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('markers', () => {
  it('places a marker and links it to a place', async () => {
    const { headers, campaignId } = await fixture();
    await uploadMap(headers, campaignId);

    const place = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/locations`,
      headers,
      payload: { name: 'Waystone Inn' },
    });

    const marker = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/map/markers`,
      headers,
      payload: { x: 0.42, y: 0.61, label: 'The inn', locationId: place.json().id },
    });

    expect(marker.statusCode).toBe(201);
    expect(marker.json()).toMatchObject({ x: 0.42, y: 0.61, label: 'The inn' });

    const view = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/map`,
      headers,
    });
    expect(view.json().markers).toHaveLength(1);
  });

  it('refuses coordinates off the image', async () => {
    const { headers, campaignId } = await fixture();
    await uploadMap(headers, campaignId);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/map/markers`,
      headers,
      payload: { x: 1.4, y: 0.5, label: 'Nowhere' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('refuses a place from another campaign', async () => {
    const ada = await fixture('ada@example.com');
    const grace = await fixture('grace@example.com');
    await uploadMap(ada.headers, ada.campaignId);

    const alienPlace = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${grace.campaignId}/locations`,
      headers: grace.headers,
      payload: { name: 'Not Yours' },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${ada.campaignId}/map/markers`,
      headers: ada.headers,
      payload: { x: 0.5, y: 0.5, label: 'Smuggled', locationId: alienPlace.json().id },
    });
    expect(response.statusCode).toBe(400);
  });

  it('needs a map before it accepts markers', async () => {
    const { headers, campaignId } = await fixture();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/map/markers`,
      headers,
      payload: { x: 0.5, y: 0.5, label: 'Nowhere' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('drops markers when the map is removed', async () => {
    const { headers, campaignId } = await fixture();
    await uploadMap(headers, campaignId);
    await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/map/markers`,
      headers,
      payload: { x: 0.5, y: 0.5, label: 'A pin' },
    });

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/campaigns/${campaignId}/map`,
      headers,
    });

    const view = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/map`,
      headers,
    });
    expect(view.json().map).toBeNull();
    expect(view.json().markers).toEqual([]);
  });
});
