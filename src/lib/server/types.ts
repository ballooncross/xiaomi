export type WatchType = 'artist' | 'topic' | 'source';
export type WatchMode = 'follow' | 'blacklist';
export type ItemKind = 'concert' | 'trend' | 'news' | 'opportunity';
export type ItemStatus = 'new' | 'saved' | 'tracking' | 'dismissed';
export type FeedbackAction = 'save' | 'track' | 'not_relevant' | 'more_like_this' | 'less_like_this';
export type CalendarType = 'gregorian' | 'lunar';
export type ReminderRepeat = 'none' | 'annual';

export type WatchTopic = {
  id: string;
  type: WatchType;
  name: string;
  aliases: string[];
  category: string;
  priority: number;
  mode: WatchMode;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type RadarItem = {
  id: string;
  sourceId: string;
  sourceType: string;
  externalId: string;
  kind: ItemKind;
  title: string;
  summary: string;
  description: string;
  url?: string;
  imageUrl?: string;
  location?: string;
  startsAt?: string;
  publishedAt?: string;
  artists: string[];
  topics: string[];
  raw: unknown;
  score: number;
  status: ItemStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type DateReminder = {
  id: string;
  title: string;
  calendarType: CalendarType;
  year?: number;
  month: number;
  day: number;
  lunarIsLeapMonth: boolean;
  repeat: ReminderRepeat;
  note: string;
  pinned: boolean;
  enabled: boolean;
  remindDaysBefore: number[];
  createdAt?: string;
  updatedAt?: string;
};

export type FeedbackEvent = {
  id: string;
  itemId: string;
  action: FeedbackAction;
  reason?: string;
  createdAt?: string;
};

export type ItemScore = {
  itemId: string;
  scorer: 'rules' | 'ai';
  relevance: number;
  novelty: number;
  actionability: number;
  reason: string;
};

export type Digest = {
  title: string;
  sections: Array<{
    title: string;
    items: Array<{
      title: string;
      summary: string;
      reason: string;
      url?: string;
    }>;
  }>;
};

export type Env = {
  DB?: D1Database;
  ADMIN_TOKEN?: string;
  PUBLIC_APP_NAME?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  TICKETMASTER_API_KEY?: string;
  BANDSINTOWN_APP_ID?: string;
  AI_ENABLED?: string;
  AI_PROVIDER?: string;
  AI_FALLBACK_PROVIDER?: string;
  AI_MAX_ITEMS_PER_DAY?: string;
  AI_MONTHLY_BUDGET_USD?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
};

export type JobResult = {
  inserted: number;
  updated: number;
  considered: number;
  notified: number;
  detail: string;
};
