import type { UsageEvent } from '$lib/usage';
import { todayInSingapore } from './lunar';

export type UsageRow = UsageEvent & { day: string; count: number };

export function usageDays(days: number, now = new Date()): string[] {
  const today = todayInSingapore(now);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - (days - index - 1));
    return date.toISOString().slice(0, 10);
  });
}

export async function recordUsage(db: D1Database, event: UsageEvent) {
  await db.prepare(`INSERT INTO usage_daily (day, audience, view, metric, count)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT (day, audience, view, metric) DO UPDATE SET count = count + 1`)
    .bind(usageDays(1)[0], event.audience, event.view, event.metric).run();
}

export async function readUsage(db: D1Database, days: string[]): Promise<UsageRow[]> {
  const result = await db.prepare(`SELECT day, audience, view, metric, count FROM usage_daily
    WHERE day >= ? AND day <= ? ORDER BY day DESC`).bind(days[0], days[days.length - 1]).all<UsageRow>();
  return result.results;
}
