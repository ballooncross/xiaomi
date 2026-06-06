import type { Env } from './types';

export async function sendTelegramMessage(env: Env, message: string): Promise<{ ok: boolean; detail: string }> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return { ok: false, detail: 'Telegram is not configured' };
  }

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: message,
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    return { ok: false, detail: `Telegram HTTP ${response.status}: ${await response.text()}` };
  }

  return { ok: true, detail: 'sent' };
}
