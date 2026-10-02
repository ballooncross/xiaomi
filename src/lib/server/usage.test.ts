import { describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { parseUsageEvent } from '$lib/usage';
import { readUsage, recordUsage, usageDays } from './usage';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('migrations/0030_usage_daily.sql', 'utf8'));
  const db = { prepare(sql: string) {
    return { bind(...values: string[]) {
      return {
        run: async () => sqlite.prepare(sql).run(...values),
        all: async () => ({ results: sqlite.prepare(sql).all(...values) })
      };
    } };
  } } as unknown as D1Database;
  return { sqlite, db };
}

describe('usage counters', () => {
  it('validates combinations and discards all extra data', () => {
    expect(parseUsageEvent({ audience: 'guest', view: 'nutrition', metric: 'calculation', weight: 60 }))
      .toEqual({ audience: 'guest', view: 'nutrition', metric: 'calculation' });
    for (const value of [null, {}, { audience: 'guest', view: 'home', metric: 'visit' },
      { audience: 'member', view: 'gym', metric: 'calculation' },
      { audience: 'member', view: 'gym', metric: 'unknown' }]) expect(parseUsageEvent(value)).toBeNull();
  });

  it('uses Singapore calendar days across UTC midnight and month boundaries', () => {
    expect(usageDays(2, new Date('2026-09-30T16:01:00Z'))).toEqual(['2026-09-30', '2026-10-01']);
    expect(usageDays(1, new Date('2026-09-30T15:59:00Z'))).toEqual(['2026-09-30']);
  });

  it('increments atomically, separates audiences/actions, and limits read dates', async () => {
    const { sqlite, db } = database();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T16:00:00Z'));
    try {
      const visit = { audience: 'guest', view: 'gym', metric: 'visit' } as const;
      await recordUsage(db, visit);
      await recordUsage(db, visit);
      await recordUsage(db, { ...visit, audience: 'member' });
      await recordUsage(db, { ...visit, metric: 'search' });
      const rows = await readUsage(db, ['2026-10-02']);
      expect(rows).toHaveLength(3);
      expect(rows).toContainEqual({ ...visit, day: '2026-10-02', count: 2 });
      expect(await readUsage(db, ['2026-10-01'])).toEqual([]);
    } finally { sqlite.close(); vi.useRealTimers(); }
  });
});
