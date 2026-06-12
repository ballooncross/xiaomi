import type { Env } from './types';

export const defaultEnv: Env = {
  ADMIN_TOKEN: '',
  ICA_CHECKER_URL: '',
  ICA_FALLBACK_CHECK_URL: '',
  ICA_FALLBACK_TRIGGER_TOKEN: '',
  PUBLIC_APP_NAME: 'Personal Radar',
  TELEGRAM_BOT_TOKEN: '',
  TELEGRAM_CHAT_ID: '',
  TICKETMASTER_API_KEY: '',
  BANDSINTOWN_APP_ID: 'personal-radar',
  AI_ENABLED: 'auto',
  AI_PROVIDER: 'gemini',
  AI_FALLBACK_PROVIDER: 'deepseek',
  AI_MAX_ITEMS_PER_DAY: '20',
  AI_MONTHLY_BUDGET_USD: '1',
  GEMINI_API_KEY: '',
  GEMINI_MODEL: 'gemini-3.1-flash-lite',
  DEEPSEEK_API_KEY: '',
  DEEPSEEK_MODEL: 'deepseek-v4-flash'
};
