import { expect, it, vi } from 'vitest';
import { GET, PUT } from './+server';
const mocks = vi.hoisted(() => ({ get: vi.fn().mockResolvedValue({ enabled: false }), save: vi.fn() }));
vi.mock('$lib/server/promotions/service', () => ({ getPromotionData: mocks.get, savePromotionWatch: mocks.save }));
vi.mock('$env/dynamic/private', () => ({ env: {} }));

function event(body: unknown, userId = 'signed-in-user') {
  return {
    locals: { user: userId ? { id: userId } : undefined }, platform: { env: { DB: {} } },
    request: new Request('https://radar.test/api/promotions', { method: 'PUT', body: JSON.stringify(body) })
  } as unknown as Parameters<typeof PUT>[0];
}
it('requires a session for reads and changes', async () => {
  await expect(GET(event({}, ''))).rejects.toMatchObject({ status: 401 });
  await expect(PUT(event({}, ''))).rejects.toMatchObject({ status: 401 });
});
it.each([null, {}, { enabled: 'yes', minDiscount: 10 }, { enabled: true, minDiscount: 0 },
  { enabled: true, minDiscount: 100 }, { enabled: true, minDiscount: 10.5 }])('rejects invalid settings: %j', async (body) => {
  expect((await PUT(event(body))).status).toBe(400);
});
it('always applies changes to the session user', async () => {
  expect((await PUT(event({ enabled: true, minDiscount: 15, userId: 'victim' }))).status).toBe(200);
  expect(mocks.save).toHaveBeenCalledWith(expect.anything(), 'signed-in-user', true, 15);
});
