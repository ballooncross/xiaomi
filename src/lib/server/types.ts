export type WatchType = 'artist' | 'topic' | 'source';
export type WatchMode = 'follow' | 'blacklist';
export type OptimizeStatus = 'pending' | 'optimized' | 'locked';
export type ItemKind = 'concert' | 'trend' | 'news' | 'opportunity' | 'insight';
export type ItemStatus = 'new' | 'saved' | 'tracking' | 'dismissed' | 'viewed';
export type FeedbackAction = 'save' | 'track' | 'unsave' | 'not_relevant' | 'more_like_this' | 'less_like_this' | 'viewed' | 'duplicate';
export type CalendarType = 'gregorian' | 'lunar';
export type ReminderRepeat = 'none' | 'annual';
export type DateCategory = 'birthday' | 'child_birthday' | 'anniversary' | 'memorial' | 'other';

export type WatchTopic = {
  id: string;
  type: WatchType;
  name: string;
  aliases: string[];
  category: string;
  priority: number;
  mode: WatchMode;
  enabled: boolean;
  /** Whether the local agent may auto-refine this interest (default 'pending'). */
  optimizeStatus?: OptimizeStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type RelatedSource = { source: string; url: string };

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
  savedAt?: string;
  trackingAt?: string;
  viewedAt?: string;
  relatedSources?: RelatedSource[];
  createdAt?: string;
  updatedAt?: string;
};

export type DateReminder = {
  id: string;
  title: string;
  calendarType: CalendarType;
  category: DateCategory;
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
  CRON_WORKER?: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };
  ICA_CHECKER_URL?: string;
  PUBLIC_APP_NAME?: string;
  TELEGRAM_BOT_TOKEN?: string;
  /** @deprecated Unused. Ops alerts go to linked admin Telegrams; digests to each linked user. */
  TELEGRAM_CHAT_ID?: string;
  /** Bot username without @ — used for t.me deep links. */
  TELEGRAM_BOT_USERNAME?: string;
  /** Secret token passed to setWebhook; verified on inbound updates. */
  TELEGRAM_WEBHOOK_SECRET?: string;
  EXTENSION_NOTIFY_TOKEN?: string;
  TICKETMASTER_API_KEY?: string;
  BANDSINTOWN_APP_ID?: string;
  AI_ENABLED?: string;
  AI_PROVIDER?: string;
  AI_FALLBACK_PROVIDER?: string;
  AI_MAX_ITEMS_PER_DAY?: string;
  AI_MONTHLY_BUDGET_USD?: string;
  BROWSER?: unknown;
  ICA_CHECK_ENABLED?: string;
  ICA_APPLICATION_ID?: string;
  ICA_TARGET_BEFORE?: string;
  ICA_FALLBACK_CHECK_URL?: string;
  ICA_FALLBACK_TRIGGER_TOKEN?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  ALLOWED_EMAILS?: string;
  ADMIN_EMAILS?: string;
  /** Optional JSON overrides for feature flags, e.g. {"ica_check":{"enabled":true}}. */
  FEATURE_FLAGS_JSON?: string;
};

export type JobResult = {
  inserted: number;
  updated: number;
  considered: number;
  notified: number;
  detail: string;
};

export type JobRun = {
  id: string;
  jobName: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  detail: string;
};

export type CronJobStatus = {
  jobName: string;
  label: string;
  description: string;
  schedule: string;
  enabled: boolean;
  lastRun?: JobRun;
};

export type AgentFeedCadence = 'hourly' | 'daily' | 'weekly';
export type AgentFeedStatus = 'pending' | 'promoted' | 'dismissed' | 'expired';

export type AgentFeedItem = {
  id: string;
  source: string;
  cadence: AgentFeedCadence;
  title: string;
  summary: string;
  url?: string;
  kind: ItemKind;
  confidence: number;
  relevanceReason: string;
  topics: string[];
  metadata: Record<string, unknown>;
  status: AgentFeedStatus;
  promotedItemId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SignalType =
  | 'feedback'
  | 'topic_added'
  | 'topic_removed'
  | 'note'
  | 'interest'
  | 'not_interested'
  | 'more_like_this'
  | 'region_hint'
  | 'free_text'
  | 'agent_suggestion'
  | 'source_suggestion';

export type PreferenceSignal = {
  id: string;
  signalType: SignalType;
  signalValue: string;
  relatedItemId?: string;
  relatedTopicId?: string;
  source: string;
  createdAt?: string;
};

export type AiContextDocument = {
  version: number;
  compiledAt: string;
  identity: {
    region: string;
    additionalRegions: string[];
    languages: string[];
    timezone: string;
  };
  interestProfile: {
    primary: Array<{
      topic: string;
      category: string;
      strength: number;
      keywords: string[];
    }>;
    emerging: Array<{
      topic: string;
      reason: string;
      suggestedKeywords: string[];
    }>;
    declined: Array<{
      topic: string;
      reason: string;
    }>;
    naturalLanguageInputs: string[];
  };
  queryStrategies: Array<{
    topic: string;
    suggestedQueries: string[];
    preferredSources: string[];
    cadence: AgentFeedCadence;
    followUp?: boolean;
  }>;
  /** Stories the user marked 重点跟踪: the agent actively hunts for updates. */
  tracking: Array<{
    itemId: string;
    title: string;
    query: string;
    topics: string[];
    url?: string;
    trackedSince?: string;
  }>;
  sources: {
    active: Array<{ id: string; type: string; name: string; saveRate?: number }>;
    suggested: Array<{ type: string; name: string; reason: string; config?: unknown }>;
  };
  constraints: {
    maxItemsPerDay: number;
    avoidTopics: string[];
    avoidSources: string[];
    preferredLanguages: string[];
  };
  activeThemes: Array<{
    theme: string;
    evidence: string;
    expiresAt: string;
  }>;
  stats: {
    totalFeedbackEvents: number;
    totalAgentFeeds: number;
    agentSaveRate: number;
    topPerformingTopics: string[];
    worstPerformingTopics: string[];
  };
};

export type DevRequestStatus = 'pending' | 'in_progress' | 'completed' | 'rejected' | 'replied';

export type DevRequest = {
  id: string;
  text: string;
  status: DevRequestStatus;
  response: string;
  branch?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AgentOutcomeStats = {
  total: number;
  saved: number;
  tracked: number;
  dismissed: number;
  ignored: number;
  byTopic: Array<{ topic: string; saveRate: number; dismissRate: number; count: number }>;
  bySource: Record<string, { total: number; saved: number; dismissed: number }>;
};
