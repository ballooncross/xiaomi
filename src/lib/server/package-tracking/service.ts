import { getDb } from '../db';
import { isFeatureEnabled } from '../features';
import { sendTelegramMessage } from '../telegram';
import type { Env, JobResult, PackageTracking } from '../types';
import {
  PACKAGE_PROVIDER_LABELS,
  PACKAGE_STATUS_LABELS,
  normalizeTrackingNumber,
  providerCandidates
} from './domain';
import { lookupWithProvider } from './providers';
import {
  createPackageTracking,
  deletePackageTracking,
  getPackageTracking,
  listDuePackageTrackings,
  listPackageTrackings,
  listPendingPackageNotifications,
  markPackageNotificationsSent,
  recordPackageFailure,
  recordPackageLookup,
  recordPackageNoData
} from './repository';

export async function addTrackedPackage(
  env: Env,
  userId: string,
  rawTrackingNumber: string,
  label?: string
): Promise<{ item: PackageTracking; created: boolean }> {
  const trackingNumber = normalizeTrackingNumber(rawTrackingNumber);
  const created = await createPackageTracking(env, userId, trackingNumber, label);
  if (!created.created) return created;
  try {
    return { ...created, item: await triggerPackageRefresh(env, userId, created.item.id) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Initial package refresh failed';
    return { ...created, item: await recordPackageFailure(env, created.item, message) };
  }
}

export async function removeTrackedPackage(env: Env, userId: string, packageId: string): Promise<boolean> {
  return deletePackageTracking(env, userId, packageId);
}

export async function triggerPackageRefresh(env: Env, userId: string, packageId: string): Promise<PackageTracking> {
  if (env.CRON_WORKER && env.ADMIN_TOKEN?.trim()) {
    const response = await env.CRON_WORKER.fetch(
      'https://personal-radar-cron.local/package-refresh',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': env.ADMIN_TOKEN },
        body: JSON.stringify({ userId, packageId })
      }
    );
    const payload: { item?: PackageTracking; error?: string } =
      await response.json<{ item?: PackageTracking; error?: string }>().catch(() => ({}));
    if (response.ok && payload.item) return payload.item;
  }
  return refreshPackageLocally(env, userId, packageId);
}

export async function refreshPackageLocally(env: Env, userId: string, packageId: string): Promise<PackageTracking> {
  const item = await getPackageTracking(env, userId, packageId);
  if (!item) throw new Error('Package tracking item was not found.');
  const candidates = item.providerId ? [item.providerId] : providerCandidates(item.trackingNumber);
  const errors: string[] = [];
  let hadNoData = false;
  for (const providerId of candidates) {
    try {
      const result = await lookupWithProvider(env, providerId, item.trackingNumber);
      if (result.found) return recordPackageLookup(env, item, result);
      hadNoData = true;
    } catch (error) {
      errors.push(`${providerId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (hadNoData) return recordPackageNoData(env, item);
  return recordPackageFailure(env, item, errors.join('; ') || 'All package providers failed');
}

export async function runPackageTrackingJob(env: Env): Promise<JobResult> {
  const db = getDb(env);
  if (!(await isFeatureEnabled(db, 'package_tracking'))) {
    const detail = 'feature package_tracking disabled';
    await db.logJob({ jobName: 'package-tracking', status: 'skipped', detail });
    return { inserted: 0, updated: 0, considered: 0, notified: 0, detail };
  }

  const due = await listDuePackageTrackings(env);
  const refreshed: PackageTracking[] = [];
  const refreshErrors: string[] = [];
  for (const item of due) {
    try {
      refreshed.push(await refreshPackageLocally(env, item.userId, item.id));
    } catch (error) {
      refreshErrors.push(`${item.trackingNumber}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const linked = await db.listUsersWithTelegram();
  const linkedIds = new Set(linked.map((user) => user.id));
  let notified = 0;
  const notificationDetails: string[] = [];
  for (const user of linked) {
    const pending = await listPendingPackageNotifications(env, user.id);
    if (pending.length === 0) continue;
    const message = renderPackageTelegramUpdate(pending);
    const result = await sendTelegramMessage(env, message, user.telegramChatId);
    notificationDetails.push(`${user.email}:${result.detail}`);
    await db.logNotification({
      channel: 'telegram',
      type: `package_tracking:${user.id}`,
      status: result.ok ? 'sent' : 'failed',
      message
    });
    if (result.ok) {
      notified += 1;
      await markPackageNotificationsSent(env, user.id, pending.map((item) => item.id));
    }
  }

  const unlinkedByUser = new Map<string, string[]>();
  for (const item of refreshed) {
    if (linkedIds.has(item.userId)) continue;
    const ids = unlinkedByUser.get(item.userId) ?? [];
    ids.push(item.id);
    unlinkedByUser.set(item.userId, ids);
  }
  for (const [userId, packageIds] of unlinkedByUser) {
    await markPackageNotificationsSent(env, userId, packageIds);
  }

  const detail = [
    `checked=${due.length}`,
    `notified=${notified}`,
    refreshErrors.length ? `errors=${refreshErrors.join(' | ')}` : '',
    notificationDetails.length ? notificationDetails.join('; ') : ''
  ].filter(Boolean).join('; ');
  await db.logJob({ jobName: 'package-tracking', status: refreshErrors.length ? 'partial' : 'ok', detail });
  return { inserted: 0, updated: refreshed.length, considered: due.length, notified, detail };
}

export function renderPackageTelegramUpdate(packages: PackageTracking[]): string {
  const lines = ['个人雷达 · 包裹更新', ''];
  for (const item of packages) {
    const latestPending = [...(item.events ?? [])]
      .filter((event) => !event.notifiedAt)
      .sort((a, b) => b.eventAt.localeCompare(a.eventAt))[0];
    lines.push(`${item.label || item.trackingNumber} · ${PACKAGE_STATUS_LABELS[item.status]}`);
    if (item.label) lines.push(`单号：${item.trackingNumber}`);
    if (latestPending) {
      const when = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Singapore',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(new Date(latestPending.eventAt));
      lines.push(`${when} · ${latestPending.message}${latestPending.location ? ` · ${latestPending.location}` : ''}`);
    }
    if (item.providerId) lines.push(`来源：${PACKAGE_PROVIDER_LABELS[item.providerId]}`);
    if (item.sourceUrl) lines.push(item.sourceUrl);
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function renderPackageList(packages: PackageTracking[]): string {
  const active = packages.filter((item) => item.state !== 'archived');
  if (active.length === 0) return '目前没有正在跟踪的包裹。使用 /track 单号 添加。';
  return [
    '正在跟踪的包裹',
    '',
    ...active.slice(0, 20).map((item, index) =>
      `${index + 1}. ${item.label || item.trackingNumber} · ${PACKAGE_STATUS_LABELS[item.status]}`
    )
  ].join('\n');
}

export async function listTrackedPackages(env: Env, userId: string): Promise<PackageTracking[]> {
  return listPackageTrackings(env, userId);
}
