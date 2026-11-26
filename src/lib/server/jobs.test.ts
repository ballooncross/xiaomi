import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, expect, it, vi } from 'vitest';
import { getDb } from './db';
import { runDailyDigestJob, runUserDigestJob } from './jobs';
import { demoItems } from './seed';
import type { Env } from './types';

const send = vi.hoisted(() => vi.fn());
vi.mock('./telegram', () => ({ sendTelegramMessage: send }));
let sqlite: DatabaseSync;
afterEach(() => { sqlite?.close(); vi.useRealTimers(); vi.clearAllMocks(); });

it('delivers unseen items per user across days, retries failed sends and drains past the original top results', async () => {
  sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((file) => file.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  }
  const env: Env = { DB: {
    prepare(sql: string) {
      let values: SQLInputValue[] = [];
      const statement = {
        bind(...params: SQLInputValue[]) { values = params; return statement; },
        async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; },
        async first() { return sqlite.prepare(sql).get(...values) ?? null; }
      };
      return statement;
    }
  } as unknown as D1Database };
  const db = getDb(env, 'digest-owner');
  await db.createUser({ id: 'digest-owner', email: 'digest@example.com', name: '', picture: '' });
  await db.setUserTelegramChatId('digest-owner', 'chat-owner');
  for (let i = 0; i < 13; i++) {
    await db.upsertItem({
      ...demoItems[0], id: `digest-concert-${i}`, externalId: `digest-concert-${i}`,
      title: `演出 ${i}`, kind: 'concert', status: 'new',
      startsAt: new Date(Date.now() + 60 * 86400000).toISOString()
    });
  }
  await db.upsertItem({
    ...demoItems[0], id: 'digest-news', externalId: 'digest-news',
    title: '新资讯', summary: '', description: '', artists: [], topics: [],
    kind: 'news', status: 'new', startsAt: undefined,
    publishedAt: new Date().toISOString()
  });
  send.mockResolvedValue({ ok: true, detail: 'sent' });
  await runDailyDigestJob(env);
  expect(send).toHaveBeenCalledTimes(1);
  const first = send.mock.calls[0][1];
  expect(first).toContain('新资讯');
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 86400000);
  send.mockResolvedValueOnce({ ok: false, detail: 'network failure' });
  await runDailyDigestJob(env);
  const failed = send.mock.calls[1][1];
  expect(failed).not.toBe(first);
  await runDailyDigestJob(env);
  expect(send.mock.calls[2][1]).toBe(failed);
  await runDailyDigestJob(env);
  await runDailyDigestJob(env);
  expect(send).toHaveBeenCalledTimes(5);
  const successfulMessages = [0, 2, 3, 4].map((index) => send.mock.calls[index][1] as string);
  const titles = successfulMessages.flatMap((message) => message.split('\n').filter((line) => /^\d+\. 演出/.test(line)).map((line) => line.replace(/^\d+\. /, '')));
  expect(titles).toHaveLength(13);
  expect(new Set(titles).size).toBe(13);
  await runUserDigestJob(env, 'digest-owner');
  expect(send).toHaveBeenCalledTimes(5);
  await db.upsertItem({
    ...demoItems[0], id: 'digest-new-arrival', externalId: 'digest-new-arrival',
    title: '刚发布的演出', status: 'new',
    startsAt: new Date(Date.now() + 60 * 86400000).toISOString()
  });
  await runDailyDigestJob(env);
  expect(send).toHaveBeenCalledTimes(6);
  expect(send.mock.calls[5][1]).toContain('刚发布的演出');
  await db.createUser({ id: 'digest-other', email: 'other-digest@example.com', name: '', picture: '' });
  await db.setUserTelegramChatId('digest-other', 'chat-other');
  await runUserDigestJob(env, 'digest-other');
  expect(send).toHaveBeenCalledTimes(7);
  expect(send.mock.calls[6][2]).toBe('chat-other');
});
