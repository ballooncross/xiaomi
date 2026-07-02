import { enhanceItemWithAi, generateDigestWithAi } from './ai';
import { clusterForBackfill, dedupeBatch } from './dedup';
import { buildTemplateDigest, renderTelegramDigest } from './digest';
import { getDb } from './db';
import { fetchBandsintownConcerts } from './fetchers/bandsintown';
import { fetchTicketmasterConcerts } from './fetchers/ticketmaster';
import { buildTrendSearchItems } from './fetchers/trends';
import { sortReminders, todayInSingapore } from './lunar';
import { getAllUpcomingMilestones } from './milestones';
import { scoreItem } from './scoring';
import { sendTelegramMessage } from './telegram';
import type { DateReminder, Env, JobResult, RadarItem } from './types';

export async function runConcertFetchJob(env: Env): Promise<JobResult> {
  const db = getDb(env);
  const topics = await db.listTopics();
  const fetched = [
    ...(await fetchTicketmasterConcerts(env, topics)),
    ...(await fetchBandsintownConcerts(env, topics))
  ];

  let inserted = 0;
  let updated = 0;

  for (const item of fetched) {
    const scored = scoreItem(item, topics);
    const enhanced = await maybeEnhance(env, scored);
    const result = await db.upsertItem({ ...scored, summary: enhanced.summary, score: Math.max(scored.score, enhanced.relevance) });
    if (result === 'inserted') inserted += 1;
    else updated += 1;
  }

  const detail = `concert fetch considered ${fetched.length} items`;
  await db.logJob({ jobName: 'fetch-concerts', status: 'ok', detail });
  return { inserted, updated, considered: fetched.length, notified: 0, detail };
}

export async function runTrendFetchJob(env: Env): Promise<JobResult> {
  const db = getDb(env);
  const topics = await db.listTopics();
  const fetched = await buildTrendSearchItems(topics);
  const scored = fetched.map((item) => scoreItem(item, topics));

  // Pull recent items once, dedup the whole batch locally before writing
  const existing = await db.listItemsForDedup(14);
  const { toInsert, merges, duplicateCount } = dedupeBatch(scored, existing);

  let inserted = 0;
  let updated = 0;
  for (const item of toInsert) {
    const result = await db.upsertItem(item);
    if (result === 'inserted') inserted += 1;
    else updated += 1;
  }
  for (const merge of merges) {
    await db.applyItemMerge(merge);
  }

  const detail = `trend fetch considered ${fetched.length} items; ${duplicateCount} merged as duplicate coverage`;
  await db.logJob({ jobName: 'fetch-trends', status: 'ok', detail });
  return { inserted, updated: updated + merges.length, considered: fetched.length, notified: 0, detail };
}

export async function runItemDedupJob(env: Env): Promise<JobResult> {
  const db = getDb(env);
  const items = await db.listItemsForDedup(90, 1000);
  const { merges, deleteIds } = clusterForBackfill(items);

  for (const merge of merges) {
    await db.applyItemMerge(merge);
  }
  await db.deleteItemsByIds(deleteIds);

  const detail = `dedup backfill scanned ${items.length} items, merged ${merges.length} clusters, removed ${deleteIds.length} duplicates`;
  await db.logJob({ jobName: 'dedup-items', status: 'ok', detail });
  return { inserted: 0, updated: merges.length, considered: items.length, notified: 0, detail };
}

export async function runDailyDigestJob(env: Env, type: 'daily_digest' | 'manual_digest' = 'daily_digest'): Promise<JobResult> {
  const db = getDb(env);
  const [items, reminders] = await Promise.all([db.listItems(12), db.listReminders()]);
  const digest = env.AI_ENABLED ? await generateDigestWithAi(env, items) : buildTemplateDigest(items);
  const message = appendReminderDigest(renderTelegramDigest(digest), reminders);
  const telegram = await sendTelegramMessage(env, message);
  await db.logNotification({
    channel: 'telegram',
    type,
    status: telegram.ok ? 'sent' : 'skipped',
    message
  });
  await db.logJob({
    jobName: type === 'manual_digest' ? 'manual-digest' : 'daily-digest',
    status: telegram.ok ? 'ok' : 'skipped',
    detail: telegram.detail
  });
  return { inserted: 0, updated: 0, considered: items.length, notified: telegram.ok ? 1 : 0, detail: telegram.detail };
}

function appendReminderDigest(message: string, reminders: DateReminder[]): string {
  const sorted = sortReminders(reminders);
  const upcoming = sorted
    .filter((reminder) => reminder.remindDaysBefore.includes(reminder.daysLeft))
    .slice(0, 6);

  const today = todayInSingapore();
  const milestones = getAllUpcomingMilestones(sorted, today, 1)
    .slice(0, 4);

  if (upcoming.length === 0 && milestones.length === 0) return message;

  const lines: string[] = ['', '生日与纪念日'];
  for (const reminder of upcoming) {
    const dayText = reminder.daysLeft === 0 ? '今天' : `${reminder.daysLeft} 天后`;
    const ageText = reminder.ageLabel ? ` · ${reminder.ageLabel}` : '';
    lines.push(`${reminder.title} · ${dayText} · ${reminder.dateLabel}${ageText}`);
  }

  if (milestones.length > 0) {
    lines.push('');
    lines.push('里程碑');
    for (const m of milestones) {
      const dayText = m.daysFromNow === 0 ? '今天' : `${m.daysFromNow} 天后`;
      lines.push(`${m.reminderTitle} · ${m.label} · 第${m.dayNumber}天 · ${dayText}`);
    }
  }

  return `${message}\n${lines.join('\n')}`;
}

export async function runAllFetchJobs(env: Env): Promise<JobResult> {
  const concerts = await runConcertFetchJob(env);
  const trends = await runTrendFetchJob(env);
  return {
    inserted: concerts.inserted + trends.inserted,
    updated: concerts.updated + trends.updated,
    considered: concerts.considered + trends.considered,
    notified: concerts.notified + trends.notified,
    detail: `${concerts.detail}; ${trends.detail}`
  };
}

async function maybeEnhance(env: Env, item: RadarItem) {
  if (item.score < 70) return { summary: item.summary, relevance: item.score };
  return enhanceItemWithAi(env, item);
}
