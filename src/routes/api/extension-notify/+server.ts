import { json, text } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { sendTelegramToAdmins } from '$lib/server/telegram';
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
  searchFrom?: string;
  searchTo?: string;
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
  const telegram = await sendTelegramToAdmins(env, message);
  if (!telegram.ok) {
    return json({ error: telegram.detail }, { status: 502, headers: corsHeaders });
  }

  return json({ ok: true }, { headers: corsHeaders });
};

function readToken(request: Request): string {
  const auth = request.headers.get('authorization') ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  if (auth && !auth.toLowerCase().startsWith('basic ')) return auth.trim();
  return request.headers.get('x-radar-token')?.trim() ?? '';
}

function formatMessage(body: ExtensionNotifyBody): string {
  const searchRange =
    body.searchFrom && body.searchTo
      ? `${body.searchFrom} → ${body.searchTo}`
      : body.targetBefore
        ? `before ${body.targetBefore}`
        : '';

  if (body.type === 'ica_slot_found') {
    const lines = [
      '✅ ICA 有空位！',
      '',
      body.earliestDate ? `最早日期：${body.earliestDate}` : '',
      body.earlierDates && body.earlierDates.length > 1
        ? `所有日期：${body.earlierDates.slice(0, 10).join(', ')}`
        : '',
      searchRange ? `查询范围：${searchRange}` : '',
      '',
      '请尽快登录 ICA 预约页面确认。'
    ];
    return lines.filter(Boolean).join('\n').slice(0, 3500);
  }

  if (body.type === 'ica_session_expired') {
    const lines = [
      '⚠️ ICA 会话已过期',
      '',
      body.summary || '页面会话超时，正在重新登录。',
      searchRange ? `查询范围：${searchRange}` : '',
      body.checkedAt ? `时间：${body.checkedAt}` : ''
    ];
    return lines.filter(Boolean).join('\n').slice(0, 3500);
  }

  // ica_check_error or unknown
  const lines = [
    '❌ ICA 检查出错',
    '',
    body.summary || '检查过程中发生错误。',
    searchRange ? `查询范围：${searchRange}` : '',
    body.checkedAt ? `时间：${body.checkedAt}` : ''
  ];
  return lines.filter(Boolean).join('\n').slice(0, 3500);
}
