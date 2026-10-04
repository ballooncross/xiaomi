import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Env } from '../types';
import { deliverPromotions, getPromotionData, recordPromotions, runPromotionJob, savePromotionWatch } from './service';

const mocks = vi.hoisted(() => ({ send: vi.fn(), fetch: vi.fn(), logJob: vi.fn() }));
vi.mock('../telegram', () => ({ sendTelegramMessage: mocks.send }));
vi.mock('./fetcher', () => ({ fetchPromotions: mocks.fetch }));
vi.mock('../db', () => ({ getDb: () => ({ logJob: mocks.logJob, listUsersWithTelegram: async () => [
  { id: 'owner', email: 'tofu.hike@gmail.com', telegramChatId: 'owner-chat' },
  { id: 'other', email: 'other@example.com', telegramChatId: 'other-chat' }
] }) }));
let sqlite: DatabaseSync;
let env: Env;
const offer = { evidence: 'Early bird pre-order 10% off', discount: 10, scope: 'seasonal' };
const day1 = '2026-10-04T00:30:00.000Z';
const day2 = '2026-10-05T00:30:00.000Z';

beforeEach(() => {
  vi.clearAllMocks(); mocks.send.mockResolvedValue({ ok: true });
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE users(id TEXT, email TEXT);
    INSERT INTO users VALUES ('owner', 'tofu.hike@gmail.com'), ('other', 'other@example.com');
    CREATE TABLE sources(id TEXT PRIMARY KEY, type TEXT, name TEXT, config_json TEXT, frequency_minutes INTEGER, enabled INTEGER DEFAULT 1);`);
  sqlite.exec(readFileSync('migrations/0031_promotion_tracking.sql', 'utf8'));
  const db = {
    prepare(sql: string) {
      let values: SQLInputValue[] = [];
      const statement = {
        bind(...params: SQLInputValue[]) { values = params; return statement; },
        async run() { const result = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; },
        async first() { return sqlite.prepare(sql).get(...values) ?? null; }
      };
      return statement;
    },
    async batch(statements: { run(): Promise<unknown> }[]) {
      sqlite.exec('BEGIN');
      try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; }
      catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    }
  };
  env = { DB: db as unknown as D1Database };
});
afterEach(() => sqlite.close());

it('seeds only the personal owner and scopes settings per account', async () => {
  expect(await getPromotionData(env, 'owner')).toMatchObject({ enabled: true, minDiscount: 10 });
  expect(await getPromotionData(env, 'other')).toMatchObject({ enabled: false });
  await savePromotionWatch(env, 'other', true, 20);
  expect(await getPromotionData(env, 'owner')).toMatchObject({ enabled: true, minDiscount: 10 });
  expect(await getPromotionData(env, 'other')).toMatchObject({ enabled: true, minDiscount: 20 });
});
it('persists observations, deduplicates daily alerts, applies thresholds and detects returning campaigns', async () => {
  await savePromotionWatch(env, 'other', true, 20);
  await recordPromotions(env.DB!, [offer], day1, true);
  expect(await deliverPromotions(env, day1)).toEqual({ notified: 1, failed: 0 });
  expect(mocks.send.mock.calls[0][2]).toBe('owner-chat');
  await recordPromotions(env.DB!, [offer], day2, true);
  expect(await deliverPromotions(env, day2)).toEqual({ notified: 0, failed: 0 });
  expect((await getPromotionData(env, 'owner')).promotions).toHaveLength(1);
  await recordPromotions(env.DB!, [], day2, true);
  await recordPromotions(env.DB!, [offer], '2026-11-01T00:30:00.000Z', true);
  expect((await getPromotionData(env, 'owner')).promotions).toHaveLength(2);
  expect(await deliverPromotions(env, '2026-11-01T00:30:00.000Z')).toEqual({ notified: 1, failed: 0 });
});
it('retries failed deliveries, stops paused watches and never sends unseen stale offers', async () => {
  await recordPromotions(env.DB!, [offer], day1, true);
  mocks.send.mockResolvedValueOnce({ ok: false });
  expect(await deliverPromotions(env, day1)).toEqual({ notified: 0, failed: 1 });
  expect(await deliverPromotions(env, day2)).toEqual({ notified: 0, failed: 0 });
  await recordPromotions(env.DB!, [offer], day2, false);
  expect(await deliverPromotions(env, day2)).toEqual({ notified: 1, failed: 0 });
  await savePromotionWatch(env, 'owner', false, 10);
  await recordPromotions(env.DB!, [{ ...offer, evidence: 'Boots 30% off', discount: 30 }], day2, true);
  expect(await deliverPromotions(env, day2)).toEqual({ notified: 0, failed: 0 });
});
it('does not retire or re-alert on incomplete image reads', async () => {
  await recordPromotions(env.DB!, [offer], day1, true);
  await deliverPromotions(env, day1);
  await recordPromotions(env.DB!, [], day2, false);
  await recordPromotions(env.DB!, [offer], day2, true);
  expect((await getPromotionData(env, 'owner')).promotions).toHaveLength(1);
  expect(await deliverPromotions(env, day2)).toEqual({ notified: 0, failed: 0 });
});
it('logs fetch failures durably and releases the check lease without retiring history', async () => {
  await recordPromotions(env.DB!, [offer], day1, true);
  mocks.fetch.mockRejectedValueOnce(new Error('Source HTTP 503'));
  await runPromotionJob(env);
  expect((await getPromotionData(env, 'owner')).check?.error).toBe('Source HTTP 503');
  expect((await getPromotionData(env, 'owner')).promotions[0].active).toBe(1);
  expect(sqlite.prepare('SELECT lease_until FROM promotion_checks').get()?.lease_until).toBeNull();
  expect(mocks.logJob).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
});
it('runs the check with subscriber notifications and rejects overlapping runs', async () => {
  mocks.fetch.mockResolvedValue({ offers: [offer], warning: null });
  await runPromotionJob(env);
  expect(mocks.logJob).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok' }));
  expect(mocks.send).toHaveBeenCalledTimes(1);
  sqlite.exec("UPDATE promotion_checks SET lease_until = '9999-01-01'");
  await runPromotionJob(env);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});
