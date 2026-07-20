import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { requireSessionUser } from '$lib/server/request-auth';
import { runUserDigestJob } from '$lib/server/jobs';
import { isTelegramBotConfigured } from '$lib/server/telegram';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

const cooldownMinutes = 5;

export const POST: RequestHandler = async ({ platform, locals }) => {
  const user = requireSessionUser(locals);
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  if (!isTelegramBotConfigured(env) && !env.TELEGRAM_BOT_TOKEN) {
    return json({ error: 'Telegram 尚未配置。' }, { status: 400 });
  }

  if (env.DB && (await hasRecentManualDigest(env.DB, user.id))) {
    return json({ error: `刚刚已经发送过摘要，请 ${cooldownMinutes} 分钟后再试。` }, { status: 429 });
  }

  const result = await runUserDigestJob(env, user.id);
  if (result.notified === 0) return json({ error: result.detail || 'Telegram 发送失败。' }, { status: 502 });
  return json({ ok: true, result });
};

async function hasRecentManualDigest(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM notifications
       WHERE channel = 'telegram'
         AND type = ?
         AND status = 'sent'
         AND created_at >= datetime('now', ?)`
    )
    .bind(`manual_digest:${userId}`, `-${cooldownMinutes} minutes`)
    .first<{ count: number }>();
  return (row?.count ?? 0) > 0;
}
