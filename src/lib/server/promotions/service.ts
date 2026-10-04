import { PROMOTION_SOURCE, PROMOTION_URL, type Promotion, type PromotionData } from '$lib/promotions';
import { getDb } from '../db';
import { sendTelegramMessage } from '../telegram';
import type { Env } from '../types';
import { fetchPromotions } from './fetcher';
import { fingerprint, type Offer } from './parser';

export async function getPromotionData(env: Env, userId: string): Promise<PromotionData> {
  if (!env.DB) return { available: false, enabled: false, minDiscount: 10, check: null, promotions: [] };
  const [watch, check, rows] = await Promise.all([
    env.DB.prepare('SELECT enabled, min_discount FROM source_promotion_watches WHERE user_id = ? AND source_id = ?')
      .bind(userId, PROMOTION_SOURCE).first<{ enabled: number; min_discount: number }>(),
    env.DB.prepare('SELECT checked_at, success_at, error FROM promotion_checks WHERE source_id = ?')
      .bind(PROMOTION_SOURCE).first<PromotionData['check']>(),
    env.DB.prepare('SELECT id, evidence, discount, scope, first_seen, last_seen, active FROM promotion_observations WHERE source_id = ? ORDER BY active DESC, last_seen DESC LIMIT 30')
      .bind(PROMOTION_SOURCE).all<Promotion>()
  ]);
  return { available: true, enabled: Boolean(watch?.enabled), minDiscount: watch?.min_discount ?? 10, check, promotions: rows.results };
}

export async function savePromotionWatch(env: Env, userId: string, enabled: boolean, minDiscount: number) {
  if (!env.DB) throw new Error('Promotion tracking requires database storage');
  await env.DB.prepare(`INSERT INTO source_promotion_watches(user_id, source_id, enabled, min_discount) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, source_id) DO UPDATE SET enabled = excluded.enabled, min_discount = excluded.min_discount`)
    .bind(userId, PROMOTION_SOURCE, Number(enabled), minDiscount).run();
}

export async function recordPromotions(db: D1Database, offers: Offer[], now: string, complete: boolean) {
  const existing = (await db.prepare('SELECT id, fingerprint FROM promotion_observations WHERE source_id = ? AND active = 1')
    .bind(PROMOTION_SOURCE).all<{ id: string; fingerprint: string }>()).results;
  const statements: D1PreparedStatement[] = [];
  // Partial reads must not retire offers or create artificial reappearance alerts.
  if (complete) statements.push(db.prepare('UPDATE promotion_observations SET active = 0 WHERE source_id = ?').bind(PROMOTION_SOURCE));
  for (const offer of offers) {
    const key = await fingerprint(offer.evidence);
    const previous = existing.find((row) => row.fingerprint === key);
    if (previous) statements.push(db.prepare('UPDATE promotion_observations SET active = 1, last_seen = ? WHERE id = ?').bind(now, previous.id));
    else statements.push(db.prepare(`INSERT INTO promotion_observations(id, source_id, fingerprint, evidence, discount, scope, first_seen, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), PROMOTION_SOURCE, key, offer.evidence, offer.discount, offer.scope, now, now));
  }
  if (statements.length) await db.batch(statements);
}

export async function deliverPromotions(env: Env, observedAt: string) {
  if (!env.DB) return { notified: 0, failed: 0 };
  const db = getDb(env);
  let notified = 0;
  let failed = 0;
  for (const user of await db.listUsersWithTelegram()) {
    const pending = await env.DB.prepare(`SELECT p.* FROM promotion_observations p
      JOIN source_promotion_watches w ON w.source_id = p.source_id AND w.user_id = ?
      WHERE w.enabled = 1 AND p.active = 1 AND p.last_seen = ? AND p.discount >= w.min_discount
      AND NOT EXISTS (SELECT 1 FROM promotion_deliveries d WHERE d.user_id = w.user_id AND d.observation_id = p.id)
      ORDER BY p.discount DESC LIMIT 10`).bind(user.id, observedAt).all<Promotion>();
    for (const offer of pending.results) {
      const message = `The Ride Side · 促销雷达\n${/up to/i.test(offer.evidence) ? 'Up to ' : ''}${offer.discount}% off · ${offer.scope}\n${offer.evidence}\n\n首页观察时间：${observedAt}\n请核对 boots / bindings 的适用款式、库存与活动期限。\n${PROMOTION_URL}`;
      try {
        const result = await sendTelegramMessage(env, message, user.telegramChatId);
        if (result.ok) {
          await env.DB.prepare('INSERT OR IGNORE INTO promotion_deliveries(user_id, observation_id, sent_at) VALUES (?, ?, ?)')
            .bind(user.id, offer.id, new Date().toISOString()).run();
          notified++;
        } else failed++;
      } catch { failed++; }
    }
  }
  return { notified, failed };
}

export async function runPromotionJob(env: Env) {
  const logger = getDb(env);
  if (!env.DB) {
    await logger.logJob({ jobName: 'promotion-tracking', status: 'skipped', detail: 'Database unavailable' });
    return;
  }
  const source = await env.DB.prepare('SELECT enabled FROM sources WHERE id = ?').bind(PROMOTION_SOURCE).first<{ enabled: number }>();
  const subscribed = await env.DB.prepare('SELECT 1 AS found FROM source_promotion_watches WHERE source_id = ? AND enabled = 1 LIMIT 1')
    .bind(PROMOTION_SOURCE).first();
  if (!source?.enabled || !subscribed) {
    await logger.logJob({ jobName: 'promotion-tracking', status: 'skipped', detail: 'Source disabled or no subscribers' });
    return;
  }
  const now = new Date().toISOString();
  const lease = await env.DB.prepare(`UPDATE promotion_checks SET lease_until = ? WHERE source_id = ?
    AND (lease_until IS NULL OR lease_until < ?)`)
    .bind(new Date(Date.now() + 15 * 60 * 1000).toISOString(), PROMOTION_SOURCE, now).run();
  if (!lease.meta.changes) return;
  try {
    const { offers, warning } = await fetchPromotions(env);
    await recordPromotions(env.DB, offers, now, !warning);
    await env.DB.prepare('UPDATE promotion_checks SET checked_at = ?, success_at = ?, error = ? WHERE source_id = ?')
      .bind(now, now, warning, PROMOTION_SOURCE).run();
    const { notified, failed } = await deliverPromotions(env, now);
    await logger.logJob({ jobName: 'promotion-tracking', status: warning || failed ? 'partial' : 'ok',
      detail: `offers=${offers.length}; notified=${notified}; delivery_failures=${failed}${warning ? `; ${warning}` : ''}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Promotion check failed';
    await env.DB.prepare('UPDATE promotion_checks SET checked_at = ?, error = ? WHERE source_id = ?').bind(now, message, PROMOTION_SOURCE).run();
    await logger.logJob({ jobName: 'promotion-tracking', status: 'error', detail: message });
  } finally {
    await env.DB.prepare('UPDATE promotion_checks SET lease_until = NULL WHERE source_id = ?').bind(PROMOTION_SOURCE).run();
  }
}
