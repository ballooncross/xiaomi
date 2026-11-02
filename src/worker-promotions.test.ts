import { expect, it, vi } from 'vitest';
import worker from './worker';
const mocks = vi.hoisted(() => ({ promotions: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./lib/server/promotions/service', () => ({ runPromotionJob: mocks.promotions }));
vi.mock('./lib/server/ica-appointment', () => ({ runIcaAppointmentCheckJob: vi.fn() }));
vi.mock('./lib/server/jobs', () => ({ runAllFetchJobs: vi.fn(), runCoeCheckJob: vi.fn(), runDailyDigestJob: vi.fn() }));
vi.mock('./lib/server/context-compiler', () => ({ compileContext: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./lib/server/db', () => ({ getDb: vi.fn() }));
vi.mock('./lib/server/package-tracking/service', () => ({ refreshPackageLocally: vi.fn(), runPackageTrackingJob: vi.fn() }));
it('checks promotions only on the daily 08:30 Singapore trigger', async () => {
  const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
  await worker.scheduled({ cron: '30 0 * * *', scheduledTime: Date.UTC(2026, 9, 4, 0, 30) } as ScheduledEvent, {}, ctx);
  expect(mocks.promotions).toHaveBeenCalledTimes(1);
  await worker.scheduled({ cron: '15 * * * *', scheduledTime: Date.UTC(2026, 9, 4, 0, 15) } as ScheduledEvent, {}, ctx);
  await worker.scheduled({ cron: '30 4,8,12 * * *', scheduledTime: Date.UTC(2026, 9, 4, 4, 30) } as ScheduledEvent, {}, ctx);
  expect(mocks.promotions).toHaveBeenCalledTimes(1);
});
it('runs a manual promotion check only with the admin token', async () => {
  mocks.promotions.mockClear();
  const check = (token?: string) => worker.fetch(new Request('https://cron.local/promotion-check',
    { method: 'POST', headers: token ? { 'x-admin-token': token } : {} }), { ADMIN_TOKEN: 'secret' });
  expect((await check()).status).toBe(401);
  expect((await check('wrong')).status).toBe(401);
  expect((await check('secret')).status).toBe(200);
  expect(mocks.promotions).toHaveBeenCalledTimes(1);
});
