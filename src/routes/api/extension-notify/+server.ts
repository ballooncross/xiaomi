import { json, text } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { sendTelegramMessage } from '$lib/server/telegram';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, x-radar-token',
  'access-control-max-age': '86400'
};

type ExtensionNotifyBody = {
  type?: 'ica_slot_found' | 'ica_session_expired' | 'ica_check_error' | string;
  summary?: string;
  earliestDate?: string;
  earlierDates?: string[];
  targetBefore?: string;
  pageUrl?: string;
  checkedAt?: string;
};

export const OPTIONS: RequestHandler = async () => {
  return text('', { headers: corsHeaders });
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  const expectedToken = env.EXTENSION_NOTIFY_TOKEN || env.ADMIN_TOKEN;

  if (!expectedToken) {
    return json({ error: 'Extension notify token is not configured.' }, { status: 503, headers: corsHeaders });
  }

  const providedToken = readToken(request);
  if (!providedToken || providedToken !== expectedToken) {
    return json({ error: 'Unauthorized.' }, { status: 401, headers: corsHeaders });
  }

  let body: ExtensionNotifyBody;
  try {
    body = (await request.json()) as ExtensionNotifyBody;
  } catch {
    return json({ error: 'Invalid JSON body.' }, { status: 400, headers: corsHeaders });
  }

  const message = formatMessage(body);
  const telegram = await sendTelegramMessage(env, message);
  if (!telegram.ok) {
    return json({ error: telegram.detail }, { status: 502, headers: corsHeaders });
  }

  return json({ ok: true }, { headers: corsHeaders });
};

function readToken(request: Request): string {
  const auth = request.headers.get('authorization') ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return request.headers.get('x-radar-token')?.trim() ?? '';
}

function formatMessage(body: ExtensionNotifyBody): string {
  const title =
    body.type === 'ica_slot_found'
      ? 'ICA 预约提醒：发现更早日期'
      : body.type === 'ica_session_expired'
        ? 'ICA 预约提醒：页面会话可能已过期'
        : 'ICA 预约提醒：检查异常';

  const lines = [
    title,
    '',
    body.summary || 'ICA Slot Watcher sent a notification.',
    body.earliestDate ? `最早日期：${body.earliestDate}` : '',
    body.targetBefore ? `目标早于：${body.targetBefore}` : '',
    body.earlierDates?.length ? `候选日期：${body.earlierDates.slice(0, 10).join(', ')}` : '',
    body.checkedAt ? `检查时间：${body.checkedAt}` : '',
    body.pageUrl ? `页面：${body.pageUrl}` : ''
  ].filter(Boolean);

  return lines.join('\n').slice(0, 3500);
}
