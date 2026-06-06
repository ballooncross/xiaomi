import { readFileSync, existsSync } from 'node:fs';

const env = {
  ...readEnvFile('.env'),
  ...readEnvFile('.env.local'),
  ...readEnvFile('.dev.vars'),
  ...process.env
};

const token = env.TELEGRAM_BOT_TOKEN?.trim();
const chatId = env.TELEGRAM_CHAT_ID?.trim();
const message = process.argv.slice(2).join(' ') || 'Personal Radar test message.';

if (!token || !chatId) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID. Put them in .env.local or .dev.vars.');
  process.exit(1);
}

if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
  console.error('TELEGRAM_BOT_TOKEN must be the full BotFather token: number:letters. Do not remove the numeric prefix.');
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ chat_id: chatId, text: message })
});

const body = await response.json().catch(() => ({}));
if (!response.ok || body.ok !== true) {
  console.error(`Telegram send failed: ${body.description ?? response.statusText}`);
  process.exit(1);
}

console.log('Telegram test message sent. Check the chat where you sent /start to the bot.');

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const result = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').trim();
    if (value) result[key.trim()] = value;
  }
  return result;
}
