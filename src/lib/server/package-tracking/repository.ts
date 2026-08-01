import type {
  Env,
  PackageProviderId,
  PackageStatus,
  PackageTracking,
  PackageTrackingEvent,
  PackageTrackingState
} from '../types';
import { eventFingerprint, latestProviderEvent, type ProviderLookupResult } from './domain';

type PackageRow = {
  id: string;
  user_id: string;
  tracking_number: string;
  label: string | null;
  provider_id: PackageProviderId | null;
  state: PackageTrackingState;
  status: PackageStatus;
  provider_status: string | null;
  latest_event_at: string | null;
  latest_location: string | null;
  estimated_delivery_at: string | null;
  source_url: string | null;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  unresolved_since: string;
  delivered_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: string;
  package_id: string;
  fingerprint: string;
  status: PackageStatus;
  provider_status: string;
  message: string;
  event_at: string;
  location: string | null;
  notified_at: string | null;
  created_at: string;
};

const unresolvedLimitMs = 7 * 24 * 60 * 60 * 1000;

// Development fallback only. Production always uses the D1 binding.
const memoryPackagesByUser = new Map<string, PackageTracking[]>();

export async function listPackageTrackings(env: Env, userId: string): Promise<PackageTracking[]> {
  if (!env.DB) return [...getMemoryPackages(userId)].sort(sortPackages);
  const { results } = await env.DB
    .prepare('SELECT * FROM package_trackings WHERE user_id = ? ORDER BY archived_at IS NOT NULL, updated_at DESC')
    .bind(userId)
    .all<PackageRow>();
  const packages = (results ?? []).map(packageFromRow);
  if (packages.length === 0) return packages;
  const placeholders = packages.map(() => '?').join(',');
  const eventRows = await env.DB
    .prepare(`SELECT * FROM package_tracking_events WHERE package_id IN (${placeholders}) ORDER BY event_at DESC`)
    .bind(...packages.map((item) => item.id))
    .all<EventRow>();
  attachEvents(packages, eventRows.results ?? []);
  return packages;
}

export async function getPackageTracking(
  env: Env,
  userId: string,
  packageId: string
): Promise<PackageTracking | null> {
  if (!env.DB) return getMemoryPackages(userId).find((item) => item.id === packageId) ?? null;
  const row = await env.DB
    .prepare('SELECT * FROM package_trackings WHERE user_id = ? AND id = ?')
    .bind(userId, packageId)
    .first<PackageRow>();
  if (!row) return null;
  const item = packageFromRow(row);
  const { results } = await env.DB
    .prepare('SELECT * FROM package_tracking_events WHERE package_id = ? ORDER BY event_at DESC')
    .bind(packageId)
    .all<EventRow>();
  item.events = (results ?? []).map(eventFromRow);
  return item;
}

export async function getPackageTrackingByNumber(
  env: Env,
  userId: string,
  trackingNumber: string
): Promise<PackageTracking | null> {
  if (!env.DB) return getMemoryPackages(userId).find((item) => item.trackingNumber === trackingNumber) ?? null;
  const row = await env.DB
    .prepare('SELECT * FROM package_trackings WHERE user_id = ? AND tracking_number = ?')
    .bind(userId, trackingNumber)
    .first<PackageRow>();
  return row ? packageFromRow(row) : null;
}

export async function createPackageTracking(
  env: Env,
  userId: string,
  trackingNumber: string,
  label?: string
): Promise<{ item: PackageTracking; created: boolean }> {
  const existing = await getPackageTrackingByNumber(env, userId, trackingNumber);
  if (existing) return { item: existing, created: false };
  const now = new Date().toISOString();
  const item: PackageTracking = {
    id: crypto.randomUUID(),
    userId,
    trackingNumber,
    label: label?.trim() || undefined,
    state: 'awaiting_tracking_data',
    status: 'awaiting_tracking_data',
    unresolvedSince: now,
    createdAt: now,
    updatedAt: now,
    events: []
  };
  if (!env.DB) {
    getMemoryPackages(userId).push(item);
    return { item, created: true };
  }
  await env.DB
    .prepare(
      `INSERT INTO package_trackings
       (id, user_id, tracking_number, label, state, status, unresolved_since, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(item.id, userId, trackingNumber, item.label ?? null, item.state, item.status, now, now, now)
    .run();
  return { item, created: true };
}

export async function deletePackageTracking(env: Env, userId: string, packageId: string): Promise<boolean> {
  if (!env.DB) {
    const packages = getMemoryPackages(userId);
    const index = packages.findIndex((item) => item.id === packageId);
    if (index < 0) return false;
    packages.splice(index, 1);
    return true;
  }
  const existing = await env.DB
    .prepare('SELECT id FROM package_trackings WHERE user_id = ? AND id = ?')
    .bind(userId, packageId)
    .first<{ id: string }>();
  if (!existing) return false;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM package_tracking_events WHERE package_id = ?').bind(packageId),
    env.DB.prepare('DELETE FROM package_trackings WHERE user_id = ? AND id = ?').bind(userId, packageId)
  ]);
  return true;
}

export async function listDuePackageTrackings(env: Env): Promise<PackageTracking[]> {
  if (!env.DB) {
    return [...memoryPackagesByUser.values()].flat().filter((item) => item.state === 'active' || item.state === 'awaiting_tracking_data');
  }
  const { results } = await env.DB
    .prepare(
      `SELECT * FROM package_trackings
       WHERE state IN ('active', 'awaiting_tracking_data')
       ORDER BY COALESCE(last_checked_at, created_at) ASC`
    )
    .all<PackageRow>();
  return (results ?? []).map(packageFromRow);
}

export async function recordPackageLookup(
  env: Env,
  item: PackageTracking,
  result: ProviderLookupResult
): Promise<PackageTracking> {
  if (!result.found || result.events.length === 0) return recordPackageNoData(env, item);
  const now = new Date().toISOString();
  const latest = latestProviderEvent(result.events)!;
  const deliveredAt = latest.status === 'delivered' ? latest.eventAt : item.deliveredAt;
  const storedEvents = await Promise.all(
    result.events.map(async (event): Promise<PackageTrackingEvent> => ({
      id: crypto.randomUUID(),
      packageId: item.id,
      fingerprint: await eventFingerprint(event),
      status: event.status,
      providerStatus: event.providerStatus,
      message: event.message,
      eventAt: event.eventAt,
      location: event.location,
      createdAt: now
    }))
  );

  if (!env.DB) {
    const existingFingerprints = new Set((item.events ?? []).map((event) => event.fingerprint));
    const newEvents = storedEvents.filter((event) => !existingFingerprints.has(event.fingerprint));
    Object.assign(item, {
      providerId: result.providerId,
      state: 'active',
      status: latest.status,
      providerStatus: latest.providerStatus,
      latestEventAt: latest.eventAt,
      latestLocation: latest.location,
      estimatedDeliveryAt: result.estimatedDeliveryAt,
      sourceUrl: result.sourceUrl,
      lastCheckedAt: now,
      lastSuccessAt: now,
      lastError: undefined,
      deliveredAt,
      updatedAt: now,
      events: [...newEvents, ...(item.events ?? [])].sort((a, b) => b.eventAt.localeCompare(a.eventAt))
    });
    return item;
  }

  const statements = storedEvents.map((event) =>
    env.DB!.prepare(
      `INSERT OR IGNORE INTO package_tracking_events
       (id, package_id, fingerprint, status, provider_status, message, event_at, location, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      event.id,
      event.packageId,
      event.fingerprint,
      event.status,
      event.providerStatus,
      event.message,
      event.eventAt,
      event.location ?? null,
      now
    )
  );
  statements.push(
    env.DB.prepare(
      `UPDATE package_trackings SET
         provider_id = ?, state = 'active', status = ?, provider_status = ?, latest_event_at = ?,
         latest_location = ?, estimated_delivery_at = ?, source_url = ?, last_checked_at = ?,
         last_success_at = ?, last_error = NULL, delivered_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).bind(
      result.providerId,
      latest.status,
      latest.providerStatus,
      latest.eventAt,
      latest.location ?? null,
      result.estimatedDeliveryAt ?? null,
      result.sourceUrl,
      now,
      now,
      deliveredAt ?? null,
      now,
      item.id,
      item.userId
    )
  );
  await env.DB.batch(statements);
  return (await getPackageTracking(env, item.userId, item.id))!;
}

export async function recordPackageNoData(env: Env, item: PackageTracking): Promise<PackageTracking> {
  const now = new Date().toISOString();
  const unresolvedExpired = Date.now() - new Date(item.unresolvedSince).getTime() >= unresolvedLimitMs;
  const nextState: PackageTrackingState = item.providerId && item.state === 'active'
    ? 'active'
    : unresolvedExpired
      ? 'needs_attention'
      : 'awaiting_tracking_data';
  const attentionEvent = nextState === 'needs_attention' && item.state !== 'needs_attention'
    ? await needsAttentionEvent(item, now)
    : undefined;
  if (!env.DB) {
    item.state = nextState;
    item.lastCheckedAt = now;
    item.lastError = undefined;
    item.updatedAt = now;
    if (attentionEvent) item.events = [attentionEvent, ...(item.events ?? [])];
    return item;
  }
  const update = env.DB.prepare(
      `UPDATE package_trackings SET state = ?, last_checked_at = ?, last_error = NULL, updated_at = ?
       WHERE id = ? AND user_id = ?`
    )
    .bind(nextState, now, now, item.id, item.userId);
  await env.DB.batch(attentionEvent ? [eventInsert(env.DB, attentionEvent), update] : [update]);
  return (await getPackageTracking(env, item.userId, item.id))!;
}

export async function recordPackageFailure(env: Env, item: PackageTracking, message: string): Promise<PackageTracking> {
  const now = new Date().toISOString();
  const unresolvedExpired = Date.now() - new Date(item.unresolvedSince).getTime() >= unresolvedLimitMs;
  const nextState = !item.providerId && unresolvedExpired ? 'needs_attention' : item.state;
  const attentionEvent = nextState === 'needs_attention' && item.state !== 'needs_attention'
    ? await needsAttentionEvent(item, now)
    : undefined;
  if (!env.DB) {
    item.state = nextState;
    item.lastCheckedAt = now;
    item.lastError = message;
    item.updatedAt = now;
    if (attentionEvent) item.events = [attentionEvent, ...(item.events ?? [])];
    return item;
  }
  const update = env.DB.prepare(
      `UPDATE package_trackings SET state = ?, last_checked_at = ?, last_error = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    )
    .bind(nextState, now, message.slice(0, 500), now, item.id, item.userId);
  await env.DB.batch(attentionEvent ? [eventInsert(env.DB, attentionEvent), update] : [update]);
  return (await getPackageTracking(env, item.userId, item.id))!;
}

export async function listPendingPackageNotifications(env: Env, userId: string): Promise<PackageTracking[]> {
  const packages = await listPackageTrackings(env, userId);
  return packages
    .map((item) => ({ ...item, events: (item.events ?? []).filter((event) => !event.notifiedAt) }))
    .filter((item) => (item.events?.length ?? 0) > 0);
}

export async function markPackageNotificationsSent(
  env: Env,
  userId: string,
  packageIds: string[]
): Promise<void> {
  if (packageIds.length === 0) return;
  const now = new Date().toISOString();
  if (!env.DB) {
    for (const item of getMemoryPackages(userId).filter((candidate) => packageIds.includes(candidate.id))) {
      item.events = (item.events ?? []).map((event) => event.notifiedAt ? event : { ...event, notifiedAt: now });
      if (item.status === 'delivered') {
        item.state = 'archived';
        item.archivedAt = now;
      }
    }
    return;
  }
  const placeholders = packageIds.map(() => '?').join(',');
  await env.DB.batch([
    env.DB
      .prepare(
        `UPDATE package_tracking_events SET notified_at = ?
         WHERE notified_at IS NULL AND package_id IN (${placeholders})
           AND package_id IN (SELECT id FROM package_trackings WHERE user_id = ?)`
      )
      .bind(now, ...packageIds, userId),
    env.DB
      .prepare(
        `UPDATE package_trackings SET state = 'archived', archived_at = ?, updated_at = ?
         WHERE user_id = ? AND status = 'delivered' AND id IN (${placeholders})`
      )
      .bind(now, now, userId, ...packageIds)
  ]);
}

function getMemoryPackages(userId: string): PackageTracking[] {
  if (!memoryPackagesByUser.has(userId)) memoryPackagesByUser.set(userId, []);
  return memoryPackagesByUser.get(userId)!;
}

function packageFromRow(row: PackageRow): PackageTracking {
  return {
    id: row.id,
    userId: row.user_id,
    trackingNumber: row.tracking_number,
    label: row.label ?? undefined,
    providerId: row.provider_id ?? undefined,
    state: row.state,
    status: row.status,
    providerStatus: row.provider_status ?? undefined,
    latestEventAt: row.latest_event_at ?? undefined,
    latestLocation: row.latest_location ?? undefined,
    estimatedDeliveryAt: row.estimated_delivery_at ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    lastCheckedAt: row.last_checked_at ?? undefined,
    lastSuccessAt: row.last_success_at ?? undefined,
    lastError: row.last_error ?? undefined,
    unresolvedSince: row.unresolved_since,
    deliveredAt: row.delivered_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function eventFromRow(row: EventRow): PackageTrackingEvent {
  return {
    id: row.id,
    packageId: row.package_id,
    fingerprint: row.fingerprint,
    status: row.status,
    providerStatus: row.provider_status,
    message: row.message,
    eventAt: row.event_at,
    location: row.location ?? undefined,
    notifiedAt: row.notified_at ?? undefined,
    createdAt: row.created_at
  };
}

function attachEvents(packages: PackageTracking[], rows: EventRow[]): void {
  const byPackage = new Map<string, PackageTrackingEvent[]>();
  for (const row of rows) {
    const events = byPackage.get(row.package_id) ?? [];
    events.push(eventFromRow(row));
    byPackage.set(row.package_id, events);
  }
  for (const item of packages) item.events = byPackage.get(item.id) ?? [];
}

function sortPackages(a: PackageTracking, b: PackageTracking): number {
  return Number(Boolean(a.archivedAt)) - Number(Boolean(b.archivedAt)) || b.updatedAt.localeCompare(a.updatedAt);
}

async function needsAttentionEvent(item: PackageTracking, now: string): Promise<PackageTrackingEvent> {
  const message = '连续 7 天未找到物流信息，自动查询已暂停';
  return {
    id: crypto.randomUUID(),
    packageId: item.id,
    fingerprint: await eventFingerprint({
      status: 'awaiting_tracking_data',
      providerStatus: 'Needs attention',
      message,
      eventAt: now
    }),
    status: 'awaiting_tracking_data',
    providerStatus: 'Needs attention',
    message,
    eventAt: now,
    createdAt: now
  };
}

function eventInsert(db: D1Database, event: PackageTrackingEvent): D1PreparedStatement {
  return db.prepare(
    `INSERT OR IGNORE INTO package_tracking_events
     (id, package_id, fingerprint, status, provider_status, message, event_at, location, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    event.id,
    event.packageId,
    event.fingerprint,
    event.status,
    event.providerStatus,
    event.message,
    event.eventAt,
    event.location ?? null,
    event.createdAt ?? new Date().toISOString()
  );
}
