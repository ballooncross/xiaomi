import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { expect, it } from 'vitest';
import type { Env } from '../types';
import {
  createPackageTracking, getPackageTracking, listPackageTrackings,
  listPendingPackageNotifications, markPackageDelivered, recordPackageLookup
} from './repository';

it('repairs stored completion statuses without duplicating acknowledged events in SQL storage', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('CREATE TABLE feature_flags (id TEXT PRIMARY KEY, enabled INTEGER, min_role TEXT)');
    for (const migration of ['0024_package_tracking', '0026_package_frequent_checks', '0028_package_provider_ids']) {
      sqlite.exec(readFileSync(`migrations/${migration}.sql`, 'utf8'));
    }
    // Exercise the repository SQL against SQLite, with the asynchronous D1 interface.
    const db = {
      prepare(sql: string) {
        let values: SQLInputValue[] = [];
        const query = {
          bind(...params: SQLInputValue[]) { values = params; return query; },
          async run() { return sqlite.prepare(sql).run(...values); },
          async all() { return { results: sqlite.prepare(sql).all(...values) }; },
          async first() { return sqlite.prepare(sql).get(...values) ?? null; }
        };
        return query;
      },
      async batch(statements: { run(): Promise<unknown> }[]) {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        return results;
      }
    };
    const env = { DB: db as unknown as D1Database } satisfies Env;
    const { item } = await createPackageTracking(env, 'owner', 'YD123456');
    const result = {
      providerId: 'mh56' as const, sourceUrl: 'https://example.test', found: true,
      events: [{ status: 'unknown' as const, providerStatus: 'Completed', message: 'Completed', eventAt: '2026-09-20T02:00:00.000Z' }]
    };
    await recordPackageLookup(env, item, result);
    sqlite.exec("UPDATE package_trackings SET status = 'unknown'; UPDATE package_tracking_events SET status = 'unknown', notified_at = '2026-09-20T03:00:00.000Z'");
    expect((await listPackageTrackings(env, 'owner'))[0].status).toBe('delivered');
    const stored = (await getPackageTracking(env, 'owner', item.id))!;
    const updated = await recordPackageLookup(env, stored, result);
    expect(updated).toMatchObject({ status: 'delivered', state: 'archived' });
    expect(sqlite.prepare('SELECT status, state FROM package_trackings').get()).toMatchObject({ status: 'delivered', state: 'archived' });
    expect(sqlite.prepare('SELECT status, notified_at FROM package_tracking_events').all()).toEqual([
      { status: 'delivered', notified_at: '2026-09-20T03:00:00.000Z' }
    ]);
    expect(await listPendingPackageNotifications(env, 'owner')).toEqual([]);

    const unresolved = await createPackageTracking(env, 'owner', 'UNKNOWN123');
    expect(await markPackageDelivered(env, 'other-user', unresolved.item.id)).toBeNull();
    const completed = await markPackageDelivered(env, 'owner', unresolved.item.id);
    expect(completed).toMatchObject({ status: 'delivered', state: 'archived' });
    expect(await listPendingPackageNotifications(env, 'owner')).toEqual([]);
    expect(await recordPackageLookup(env, completed!, result)).toMatchObject({ status: 'delivered', state: 'archived' });
  } finally {
    sqlite.close();
  }
});
