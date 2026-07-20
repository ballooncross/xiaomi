import { enhanceItemWithAi, generateDigestWithAi } from './ai';
import { runCoeCheckJob } from './coe';
import { clusterForBackfill, dedupeBatch } from './dedup';
import { buildTemplateDigest, renderTelegramDigest } from './digest';
import { getDb } from './db';
import { fetchBandsintownConcerts } from './fetchers/bandsintown';
import { fetchTicketmasterConcerts } from './fetchers/ticketmaster';
import { buildTrendSearchItems } from './fetchers/trends';
import { sortReminders, todayInSingapore } from './lunar';
import { getAllUpcomingMilestones } from './milestones';
import { isCronJobFeatureEnabled } from './features';
import { isStaleItem, scoreItem } from './scoring';
import { sendTelegramMessage } from './telegram';
import type { DateReminder, Env, JobResult, RadarItem } from './types';

export { runCoeCheckJob } from './coe';

export async function runConcertFetchJob(env: Env): Promise<JobResult> {
  const db = getDb(env);
  const topics = await db.listTopicsForIngestion();
  const fetched = [
    ...(await fetchTicketmasterConcerts(env, topics)),
    ...(await fetchBandsintownConcerts(env, topics))
  ];

  let inserted = 0;
  let updated = 0;

  for (const item of fetched) {
    const scored = scoreItem(item, topics);
    const enhanced = await maybeEnhance(env, scored);
    const result = await db.upsertItem({
      ...scored,
      summary: enhanced.summary,
      score: Math.max(scored.score, enhanced.relevance),
      // Catalog is shared across users: ingest never carries a personal engagement state.
      status: 'new',
      savedAt: undefined,
      trackingAt: undefined,
      viewedAt: undefined
    });
    if (result === 'inserted') inserted += 1;
    else updated += 1;
  }

  const detail = `concert fetch considered ${fetched.length} items`;
  await db.logJob({ jobName: 'fetch-concerts', status: 'ok', detail });
  return { inserted, updated, considered: fetched.length, notified: 0, detail };
}

export async function runTrendFetchJob(env: Env): Promise<JobResult> {
  const db = getDb(env);
  const topics = await db.listTopicsForIngestion();
  const fetched = await buildTrendSearchItems(topics);
  const scored = fetched.map((item) => scoreItem(item, topics)).filter((item) => !isStaleItem(item));

  // Pull recent items once, dedup the whole batch locally before writing
  const existing = await db.listItemsForDedup(14);
  const adaptiveThreshold = await db.getAdaptiveDedupThreshold();
  const { toInsert, merges, duplicateCount } = dedupeBatch(scored, existing, adaptiveThreshold);

  let inserted = 0;
  let updated = 0;
  for (const item of toInsert) {
    // Catalog is shared across users: ingest never carries a personal engagement state.
    const result = await db.upsertItem({ ...item, status: 'new', savedAt: undefined, trackingAt: undefined, viewedAt: undefined });
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
  const base = getDb(env);
  if (!(await isCronJobFeatureEnabled(base, 'daily-digest'))) {
    const detail = 'feature telegram_digest disabled';
    await base.logJob({ jobName: type === 'manual_digest' ? 'manual-digest' : 'daily-digest', status: 'skipped', detail });
    return { inserted: 0, updated: 0, considered: 0, notified: 0, detail };
  }

  const linked = await base.listUsersWithTelegram();

  if (linked.length === 0) {
    const detail = 'no users have linked Telegram';
    await base.logJob({
      jobName: type === 'manual_digest' ? 'manual-digest' : 'daily-digest',
      status: 'skipped',
      detail
    });
    return { inserted: 0, updated: 0, considered: 0, notified: 0, detail };
  }

  let notified = 0;
  const details: string[] = [];
  for (const user of linked) {
    const result = await sendDigestForUser(env, user.id, user.telegramChatId, type, base, false);
    notified += result.notified;
    details.push(`${user.email}:${result.detail}`);
  }

  const detail = `fan-out users=${linked.length} notified=${notified}; ${details.join('; ')}`;
  await base.logJob({
    jobName: type === 'manual_digest' ? 'manual-digest' : 'daily-digest',
    status: notified > 0 ? 'ok' : 'skipped',
    detail
  });
  return { inserted: 0, updated: 0, considered: linked.length, notified, detail };
}

/** Manual digest for one signed-in user (their feed → their Telegram). */
export async function runUserDigestJob(env: Env, userId: string): Promise<JobResult> {
  const base = getDb(env);
  const chatId = await base.getUserTelegramChatId(userId);
  if (!chatId) {
    return {
      inserted: 0,
      updated: 0,
      considered: 0,
      notified: 0,
      detail: 'Telegram 尚未连接。请先在「我的」里连接。'
    };
  }
  return sendDigestForUser(env, userId, chatId, 'manual_digest', base, true);
}

async function sendDigestForUser(
  env: Env,
  userId: string | undefined,
  chatId: string | null | undefined,
  type: 'daily_digest' | 'manual_digest',
  logDb = getDb(env),
  logJob = true
): Promise<JobResult> {
  const db = getDb(env, userId);
  const [items, reminders] = await Promise.all([db.listItems(12), db.listReminders()]);
  const digest = env.AI_ENABLED ? await generateDigestWithAi(env, items) : buildTemplateDigest(items);
  const message = appendReminderDigest(renderTelegramDigest(digest), reminders);
  if (!chatId) {
    return { inserted: 0, updated: 0, considered: items.length, notified: 0, detail: 'missing telegram chat id' };
  }
  const telegram = await sendTelegramMessage(env, message, chatId);
  await logDb.logNotification({
    channel: 'telegram',
    type: userId ? `${type}:${userId}` : type,
    status: telegram.ok ? 'sent' : 'skipped',
    message
  });
  if (logJob) {
    await logDb.logJob({
      jobName: type === 'manual_digest' ? 'manual-digest' : 'daily-digest',
      status: telegram.ok ? 'ok' : 'skipped',
      detail: telegram.detail
    });
  }
  return {
    inserted: 0,
    updated: 0,
    considered: items.length,
    notified: telegram.ok ? 1 : 0,
    detail: telegram.detail
  };
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
  const coe = await runCoeCheckJob(env);
  return {
    inserted: concerts.inserted + trends.inserted + coe.inserted,
    updated: concerts.updated + trends.updated + coe.updated,
    considered: concerts.considered + trends.considered + coe.considered,
    notified: concerts.notified + trends.notified + coe.notified,
    detail: `${concerts.detail}; ${trends.detail}; ${coe.detail}`
  };
}

async function maybeEnhance(env: Env, item: RadarItem) {
  if (item.score < 70) return { summary: item.summary, relevance: item.score };
  return enhanceItemWithAi(env, item);
}
