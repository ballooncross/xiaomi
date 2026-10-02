import { describe, expect, it, vi } from 'vitest';
vi.mock('$env/dynamic/private', () => ({ env: {} }));
import { POST } from './+server';
import { load } from '../../admin/performance/+page.server';
import { getDb } from '$lib/server/db';

function event(body: unknown, origin = 'https://radar.example') {
  return {
    request: new Request('https://radar.example/api/usage', {
      method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body)
    }), url: new URL('https://radar.example/api/usage'), locals: {}
  } as Parameters<typeof POST>[0];
}

describe('usage ingestion and reporting access', () => {
  it('accepts guest nutrition without requiring a session', async () => {
    expect((await POST(event({ audience: 'guest', view: 'nutrition', metric: 'calculation' }))).status).toBe(204);
  });
  it('rejects cross-origin and malformed events', async () => {
    expect((await POST(event({}, 'https://other.example'))).status).toBe(403);
    expect((await POST(event({}))).status).toBe(400);
  });
  it('requires a session for member counts', async () => {
    expect((await POST(event({ audience: 'member', view: 'home', metric: 'visit' }))).status).toBe(401);
  });
  it('respects guest gym access', async () => {
    await getDb().upsertFeatureFlag('gym_page', true, 'member');
    expect((await POST(event({ audience: 'guest', view: 'gym', metric: 'visit' }))).status).toBe(403);
  });
  it('reports write failures without pretending they were recorded', async () => {
    const input = event({ audience: 'guest', view: 'nutrition', metric: 'visit' });
    input.platform = { env: { DB: { prepare() { throw new Error('missing table'); } } } } as unknown as typeof input.platform;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try { expect((await POST(input)).status).toBe(503); } finally { log.mockRestore(); }
  });
  it('restricts the monitoring page to admins', async () => {
    await expect(load({ locals: {} } as Parameters<typeof load>[0])).rejects.toMatchObject({ status: 401 });
    await expect(load({ locals: { user: { id: 'member', isAdmin: false } } } as Parameters<typeof load>[0])).rejects.toMatchObject({ status: 403 });
  });
  it('normalizes ranges and exposes unavailable storage instead of fake zeroes', async () => {
    const data = await load({ locals: { user: { id: 'admin', isAdmin: true } },
      url: new URL('https://radar.example/admin/performance?days=9999'), setHeaders: vi.fn()
    } as unknown as Parameters<typeof load>[0]);
    expect(data).toMatchObject({ period: 7, unavailable: true, rows: [] });
  });
});
