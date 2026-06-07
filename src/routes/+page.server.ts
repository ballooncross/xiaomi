import { getDb } from '$lib/server/db';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { sortReminders } from '$lib/server/lunar';
import type { Env } from '$lib/server/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  const db = getDb(env);
  const [items, topics, reminders] = await Promise.all([db.listItems(24), db.listTopics(), db.listReminders()]);

  return {
    items,
    topics,
    reminders: sortReminders(reminders),
    aiEnabled: (env?.AI_ENABLED ?? 'auto') !== 'false',
    telegramConfigured: Boolean(env?.TELEGRAM_BOT_TOKEN && env?.TELEGRAM_CHAT_ID)
  };
};
