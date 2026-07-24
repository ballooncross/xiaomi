import type { DedupExisting, MergeAction } from './dedup';
import { DEFAULT_NOTIFY_PREFS, parseNotifyPrefs, type NotifyPrefs } from './notify-prefs';
import { MAX_TREND_AGE_DAYS, scoreItem } from './scoring';
import { defaultDateReminders, demoItems, defaultWatchTopics } from './seed';
import type {
  AgentFeedItem,
  AgentOutcomeStats,
  AiContextDocument,
  DateReminder,
  DevRequest,
  Env,
  FeedbackAction,
  JobRun,
  PreferenceSignal,
  RadarItem,
  WatchTopic
} from './types';

type ItemRow = {
  id: string;
  source_id: string;
  source_type: string;
  external_id: string;
  kind: RadarItem['kind'];
  title: string;
  summary: string;
  description: string;
  url: string | null;
  image_url: string | null;
  location: string | null;
  starts_at: string | null;
  published_at: string | null;
  artists: string;
  topics: string;
  raw_json: string;
  score: number;
  status: RadarItem['status'];
  saved_at: string | null;
  tracking_at: string | null;
  viewed_at: string | null;
  related_item_id: string | null;
  related_sources?: string | null;
  created_at: string;
  updated_at: string;
};

type AgentFeedRow = {
  id: string;
  source: string;
  cadence: string;
  title: string;
  summary: string;
  url: string | null;
  kind: string;
  confidence: number;
  relevance_reason: string;
  topics: string;
  metadata_json: string;
  status: string;
  promoted_item_id: string | null;
  created_at: string;
  updated_at: string;
};

type PreferenceSignalRow = {
  id: string;
  signal_type: string;
  signal_value: string;
  related_item_id: string | null;
  related_topic_id: string | null;
  source: string;
  created_at: string;
};

type AiContextRow = {
  id: string;
  version: number;
  context_json: string;
  compiled_from: string;
  signal_count: number;
  created_at: string;
};

type FeedbackJoinRow = {
  action: string;
  topics: string;
  source_type: string;
  created_at: string;
  item_id: string;
};

type TopicRow = {
  id: string;
  user_id?: string;
  type: WatchTopic['type'];
  name: string;
  aliases: string;
  category: string;
  priority: number;
  mode?: WatchTopic['mode'];
  enabled: number;
  optimize_status?: string;
  created_at: string;
  updated_at: string;
};

type ReminderRow = {
  id: string;
  user_id?: string;
  title: string;
  calendar_type: DateReminder['calendarType'];
  category: DateReminder['category'];
  year: number | null;
  month: number;
  day: number;
  lunar_is_leap_month: number;
  repeat: DateReminder['repeat'];
  note: string;
  pinned: number;
  enabled: number;
  remind_days_before: string;
  created_at: string;
  updated_at: string;
};

type JobRunRow = {
  id: string;
  job_name: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  detail: string;
};

type DevRequestRow = {
  id: string; text: string; status: string; response: string;
  branch: string | null; created_at: string; updated_at: string;
};

type UserRow = {
  id: string;
  email: string;
  name: string;
  picture: string;
  telegram_chat_id?: string | null;
  telegram_linked_at?: string | null;
};

export type TelegramLinkedUser = { id: string; email: string; telegramChatId: string };

/** Per-user overlay on top of the shared items catalog. */
type MemoryUserItemState = {
  status: RadarItem['status'];
  savedAt?: string;
  trackingAt?: string;
  viewedAt?: string;
  updatedAt?: string;
};

const DEFAULT_MEMORY_USER = 'memory-user';

const memory = {
  users: [] as Array<{
    id: string;
    email: string;
    name: string;
    picture: string;
    telegramChatId?: string | null;
    telegramLinkedAt?: string | null;
    createdAt: string;
    updatedAt: string;
  }>,
  telegramLinkTokens: [] as Array<{ token: string; userId: string; expiresAt: string }>,
  featureFlags: [] as Array<{ id: string; enabled: boolean; minRole: 'member' | 'admin' }>,
  allowedEmails: [] as Array<{ email: string; createdAt: string; createdBy?: string }>,
  topicsByUser: new Map<string, WatchTopic[]>(),
  items: [...demoItems],
  itemStateByUser: new Map<string, Map<string, MemoryUserItemState>>(),
  remindersByUser: new Map<string, DateReminder[]>(),
  middleNavByUser: new Map<string, string[]>(),
  notifyPrefsByUser: new Map<string, NotifyPrefs>(),
  feedbackByUser: new Map<string, Array<{ id: string; itemId: string; action: FeedbackAction; reason?: string; createdAt: string }>>(),
  jobs: [] as JobRun[],
  agentFeeds: [] as AgentFeedItem[],
  preferenceSignalsByUser: new Map<string, PreferenceSignal[]>(),
  aiContextByUser: new Map<string, (AiContextDocument & { id: string })[]>(),
  agentOutcomes: [] as Array<{ id: string; agentFeedId: string; outcome: string; createdAt: string }>,
  impressionsByUser: new Map<string, Array<{ id: string; itemId: string; impressionType: string; createdAt: string }>>(),
  notifications: [] as Array<{ id: string; itemId?: string; channel: string; type: string; status: string; message: string; createdAt: string }>,
  devRequests: [] as DevRequest[]
};

function getUserTopics(userId: string): WatchTopic[] {
  if (!memory.topicsByUser.has(userId)) memory.topicsByUser.set(userId, []);
  return memory.topicsByUser.get(userId)!;
}

function getUserReminders(userId: string): DateReminder[] {
  if (!memory.remindersByUser.has(userId)) memory.remindersByUser.set(userId, []);
  return memory.remindersByUser.get(userId)!;
}

function getUserItemStateMap(userId: string): Map<string, MemoryUserItemState> {
  if (!memory.itemStateByUser.has(userId)) memory.itemStateByUser.set(userId, new Map());
  return memory.itemStateByUser.get(userId)!;
}

function getUserFeedback(userId: string) {
  if (!memory.feedbackByUser.has(userId)) memory.feedbackByUser.set(userId, []);
  return memory.feedbackByUser.get(userId)!;
}

function getUserPreferenceSignals(userId: string) {
  if (!memory.preferenceSignalsByUser.has(userId)) memory.preferenceSignalsByUser.set(userId, []);
  return memory.preferenceSignalsByUser.get(userId)!;
}

function getUserAiContexts(userId: string) {
  if (!memory.aiContextByUser.has(userId)) memory.aiContextByUser.set(userId, []);
  return memory.aiContextByUser.get(userId)!;
}

function getUserImpressions(userId: string) {
  if (!memory.impressionsByUser.has(userId)) memory.impressionsByUser.set(userId, []);
  return memory.impressionsByUser.get(userId)!;
}

function mergeItemWithState(item: RadarItem, state?: MemoryUserItemState): RadarItem {
  if (!state) return item;
  return {
    ...item,
    status: state.status ?? item.status,
    savedAt: state.savedAt ?? item.savedAt,
    trackingAt: state.trackingAt ?? item.trackingAt,
    viewedAt: state.viewedAt ?? item.viewedAt
  };
}

/** Union of all enabled follow topics across every user, deduped by lowercased name keeping highest priority. */
function dedupeTopicsByName(topics: WatchTopic[]): WatchTopic[] {
  const byName = new Map<string, WatchTopic>();
  for (const topic of topics) {
    const key = topic.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing || topic.priority > existing.priority) byName.set(key, topic);
  }
  return [...byName.values()];
}

export function getDb(env?: Env, userId?: string): RadarDb {
  if (env?.DB) return new D1RadarDb(env.DB, userId);
  return new MemoryRadarDb(userId);
}

export abstract class RadarDb {
  constructor(protected readonly userId?: string) {}

  abstract listTopics(): Promise<WatchTopic[]>;
  abstract upsertTopic(topic: WatchTopic): Promise<void>;
  abstract upsertTopicForUser(userId: string, topic: WatchTopic): Promise<void>;
  abstract deleteTopic(topicId: string): Promise<void>;
  /** Union of every user's enabled follow topics, for ingestion/cron jobs — not scoped to this.userId. */
  abstract listTopicsForIngestion(): Promise<WatchTopic[]>;
  abstract listItems(limit?: number): Promise<RadarItem[]>;
  abstract listSavedItems(): Promise<RadarItem[]>;
  abstract upsertItem(item: RadarItem): Promise<'inserted' | 'updated'>;
  abstract listReminders(): Promise<DateReminder[]>;
  abstract upsertReminder(reminder: DateReminder): Promise<void>;
  abstract deleteReminder(reminderId: string): Promise<void>;
  abstract recordFeedback(itemId: string, action: FeedbackAction, reason?: string): Promise<void>;
  abstract updateItemStatus(itemId: string, status: RadarItem['status']): Promise<void>;
  abstract logNotification(input: { itemId?: string; channel: string; type: string; status: string; message: string }): Promise<void>;
  abstract notificationExists(type: string, itemId?: string): Promise<boolean>;
  abstract logJob(input: { jobName: string; status: string; detail: string }): Promise<void>;
  abstract listJobRuns(jobName: string, limit?: number): Promise<JobRun[]>;

  // User / allowlist methods
  abstract listAllowedEmails(): Promise<string[]>;
  abstract addAllowedEmail(email: string, createdBy?: string): Promise<void>;
  abstract removeAllowedEmail(email: string): Promise<void>;
  abstract getUserByEmail(email: string): Promise<{ id: string; email: string; name: string; picture: string } | null>;
  /** Earliest-created user id — safe fallback owner for cron jobs (e.g. digests) when ADMIN_EMAILS is unset. */
  abstract getPrimaryUserId(): Promise<string | undefined>;
  abstract createUser(user: { id: string; email: string; name: string; picture: string }): Promise<void>;
  abstract updateUserProfile(id: string, name: string, picture: string): Promise<void>;
  abstract getUserTelegramChatId(userId: string): Promise<string | null>;
  abstract setUserTelegramChatId(userId: string, chatId: string | null): Promise<void>;
  abstract listUsersWithTelegram(): Promise<TelegramLinkedUser[]>;
  abstract createTelegramLinkToken(userId: string, token: string, expiresAt: string): Promise<void>;
  /** Returns user id if token is valid and not expired; consumes the token. */
  abstract consumeTelegramLinkToken(token: string): Promise<string | null>;

  abstract listFeatureFlags(): Promise<Array<{ id: string; enabled: boolean; minRole: 'member' | 'admin' }>>;
  abstract upsertFeatureFlag(
    id: string,
    enabled: boolean,
    minRole: 'member' | 'admin',
    updatedBy?: string
  ): Promise<void>;

  // User settings
  abstract getMiddleNav(userId?: string): Promise<string[] | null>;
  abstract setMiddleNav(nav: string[], userId?: string): Promise<void>;
  abstract getNotifyPrefs(userId?: string): Promise<NotifyPrefs>;
  abstract setNotifyPrefs(prefs: NotifyPrefs, userId?: string): Promise<void>;

  // Agent feed methods
  abstract insertAgentFeed(feed: AgentFeedItem): Promise<void>;
  abstract listAgentFeeds(options?: { status?: string; limit?: number }): Promise<AgentFeedItem[]>;
  abstract updateAgentFeedStatus(id: string, status: string, promotedItemId?: string): Promise<void>;
  abstract findAgentFeedByUrl(url: string): Promise<AgentFeedItem | null>;
  abstract findAgentFeedByPromotedItemId(itemId: string): Promise<AgentFeedItem | null>;

  // Preference signal methods
  abstract insertPreferenceSignal(signal: PreferenceSignal): Promise<void>;
  abstract listPreferenceSignals(options?: { since?: string; type?: string; limit?: number }): Promise<PreferenceSignal[]>;

  // AI context methods
  abstract insertAiContextSnapshot(doc: AiContextDocument): Promise<void>;
  abstract getLatestAiContext(): Promise<AiContextDocument | null>;

  // Agent outcome methods
  abstract recordAgentOutcome(feedId: string, outcome: string): Promise<void>;
  abstract getAgentOutcomeStats(): Promise<AgentOutcomeStats>;

  // Feedback query for context compilation
  abstract listRecentFeedback(days: number): Promise<Array<{ itemId: string; action: string; topics: string[]; sourceType: string; createdAt: string }>>;

  // Impression tracking
  abstract recordImpressions(itemIds: string[], impressionType?: string): Promise<void>;
  abstract getImpressionCounts(itemIds: string[]): Promise<Map<string, number>>;

  // Recent items for dedup context
  abstract getRecentItemSummaries(days: number): Promise<Array<{ title: string; url?: string; externalId: string }>>;

  // Batch dedup support
  abstract listItemsForDedup(days: number, limit?: number): Promise<DedupExisting[]>;
  abstract applyItemMerge(merge: MergeAction): Promise<void>;
  abstract deleteItemsByIds(ids: string[]): Promise<void>;

  // Dev request methods
  abstract insertDevRequest(request: DevRequest): Promise<void>;
  abstract listDevRequests(options?: { status?: string; limit?: number }): Promise<DevRequest[]>;
  abstract updateDevRequest(id: string, updates: { status?: string; response?: string; branch?: string }): Promise<void>;

  // User-initiated dedup
  abstract getItemById(itemId: string): Promise<RadarItem | null>;
  abstract recordDedupFeedback(triggerId: string, matchedId: string, similarity: number, thresholdUsed: number): Promise<void>;
  abstract getAdaptiveDedupThreshold(): Promise<number>;
}

class MemoryRadarDb extends RadarDb {
  private get uid(): string {
    return this.userId ?? DEFAULT_MEMORY_USER;
  }

  async listTopics(): Promise<WatchTopic[]> {
    return getUserTopics(this.uid).filter((topic) => topic.enabled);
  }

  async upsertTopic(topic: WatchTopic): Promise<void> {
    return this.upsertTopicForUser(this.uid, topic);
  }

  async upsertTopicForUser(userId: string, topic: WatchTopic): Promise<void> {
    const topics = getUserTopics(userId);
    const index = topics.findIndex((existing) => existing.id === topic.id);
    if (index >= 0) topics[index] = topic;
    else topics.push(topic);
  }

  async deleteTopic(topicId: string): Promise<void> {
    const topics = getUserTopics(this.uid);
    const index = topics.findIndex((topic) => topic.id === topicId);
    if (index >= 0) topics[index] = { ...topics[index], enabled: false, updatedAt: new Date().toISOString() };
  }

  async listTopicsForIngestion(): Promise<WatchTopic[]> {
    if (memory.topicsByUser.size === 0) {
      return dedupeTopicsByName(defaultWatchTopics.filter((topic) => topic.enabled && topic.mode === 'follow'));
    }
    const all: WatchTopic[] = [];
    for (const topics of memory.topicsByUser.values()) {
      all.push(...topics.filter((topic) => topic.enabled && topic.mode === 'follow'));
    }
    return dedupeTopicsByName(all);
  }

  async listItems(limit = 30): Promise<RadarItem[]> {
    const cutoff = Date.now() - MAX_TREND_AGE_DAYS * 24 * 60 * 60 * 1000;
    const stateMap = getUserItemStateMap(this.uid);
    const topics = getUserTopics(this.uid).filter((topic) => topic.enabled);
    return memory.items
      .map((item) => mergeItemWithState(item, stateMap.get(item.id)))
      .filter((item) => {
        if (item.status === 'dismissed' || item.status === 'viewed' || item.viewedAt) return false;
        if (item.status === 'saved' || item.status === 'tracking') return true;
        if (item.startsAt && new Date(item.startsAt).getTime() > Date.now()) return true;
        if (['trend', 'news', 'opportunity'].includes(item.kind) && !item.publishedAt) return false;
        const date = new Date(item.publishedAt ?? item.createdAt ?? 0).getTime();
        return date > cutoff;
      })
      .map((item) => scoreItem(item, topics))
      .filter((item) => !(item.score === 0 && item.status === 'dismissed'))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async listSavedItems(): Promise<RadarItem[]> {
    const stateMap = getUserItemStateMap(this.uid);
    const topics = getUserTopics(this.uid).filter((topic) => topic.enabled);
    return memory.items
      .map((item) => mergeItemWithState(item, stateMap.get(item.id)))
      .filter((item) => item.savedAt || item.trackingAt || item.status === 'saved' || item.status === 'tracking')
      .map((item) => scoreItem(item, topics))
      .filter((item) => !(item.score === 0 && item.status === 'dismissed'))
      .sort((a, b) =>
        new Date(b.trackingAt ?? b.savedAt ?? b.updatedAt ?? b.createdAt ?? 0).getTime()
        - new Date(a.trackingAt ?? a.savedAt ?? a.updatedAt ?? a.createdAt ?? 0).getTime()
      );
  }

  async upsertItem(item: RadarItem): Promise<'inserted' | 'updated'> {
    const index = memory.items.findIndex(
      (existing) => existing.sourceType === item.sourceType && existing.externalId === item.externalId
    );
    if (index >= 0) {
      const existing = memory.items[index];
      memory.items[index] = {
        ...existing,
        ...item,
        status: existing.status,
        savedAt: existing.savedAt,
        trackingAt: existing.trackingAt,
        viewedAt: existing.viewedAt,
        updatedAt: new Date().toISOString()
      };
      return 'updated';
    }
    // Catalog is shared: ingested items always start clean, never inherit personal engagement.
    memory.items.push({ ...item, status: 'new', savedAt: undefined, trackingAt: undefined, viewedAt: undefined });
    return 'inserted';
  }

  async listReminders(): Promise<DateReminder[]> {
    return getUserReminders(this.uid).filter((reminder) => reminder.enabled);
  }

  async upsertReminder(reminder: DateReminder): Promise<void> {
    const reminders = getUserReminders(this.uid);
    const index = reminders.findIndex((existing) => existing.id === reminder.id);
    if (index >= 0) reminders[index] = { ...reminder, updatedAt: new Date().toISOString() };
    else reminders.push(reminder);
  }

  async deleteReminder(reminderId: string): Promise<void> {
    const reminders = getUserReminders(this.uid);
    const index = reminders.findIndex((reminder) => reminder.id === reminderId);
    if (index >= 0) reminders[index] = { ...reminders[index], enabled: false, updatedAt: new Date().toISOString() };
  }

  async recordFeedback(itemId: string, action: FeedbackAction, reason?: string): Promise<void> {
    getUserFeedback(this.uid).push({ id: crypto.randomUUID(), itemId, action, reason, createdAt: new Date().toISOString() });
    const stateMap = getUserItemStateMap(this.uid);
    stateMap.set(itemId, applyFeedbackState(stateMap.get(itemId), action));
  }

  async updateItemStatus(itemId: string, status: RadarItem['status']): Promise<void> {
    const stateMap = getUserItemStateMap(this.uid);
    const current = stateMap.get(itemId);
    if (status === 'dismissed') {
      stateMap.set(itemId, {
        status: 'dismissed',
        savedAt: undefined,
        trackingAt: undefined,
        viewedAt: current?.viewedAt,
        updatedAt: new Date().toISOString()
      });
    } else if (status === 'viewed') {
      stateMap.set(itemId, applyFeedbackState(current, 'viewed'));
    } else {
      stateMap.set(itemId, { ...current, status, updatedAt: new Date().toISOString() });
    }
  }

  async logNotification(input: { itemId?: string; channel: string; type: string; status: string; message: string }): Promise<void> {
    memory.notifications.unshift({
      id: crypto.randomUUID(),
      itemId: input.itemId,
      channel: input.channel,
      type: input.type,
      status: input.status,
      message: input.message,
      createdAt: new Date().toISOString()
    });
  }

  async notificationExists(type: string, itemId?: string): Promise<boolean> {
    return memory.notifications.some(
      (notification) => notification.type === type && (itemId == null || notification.itemId === itemId)
    );
  }

  async logJob(input: { jobName: string; status: string; detail: string }): Promise<void> {
    const now = new Date().toISOString();
    memory.jobs.unshift({
      id: crypto.randomUUID(),
      jobName: input.jobName,
      status: input.status,
      startedAt: now,
      finishedAt: now,
      detail: input.detail
    });
  }

  async listJobRuns(jobName: string, limit = 5): Promise<JobRun[]> {
    return memory.jobs.filter((job) => job.jobName === jobName).slice(0, limit);
  }

  async listAllowedEmails(): Promise<string[]> {
    return memory.allowedEmails.map((entry) => entry.email);
  }

  async addAllowedEmail(email: string, createdBy?: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    if (!memory.allowedEmails.some((entry) => entry.email === normalized)) {
      memory.allowedEmails.push({ email: normalized, createdAt: new Date().toISOString(), createdBy });
    }
  }

  async removeAllowedEmail(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const index = memory.allowedEmails.findIndex((entry) => entry.email === normalized);
    if (index >= 0) memory.allowedEmails.splice(index, 1);
  }

  async getUserByEmail(email: string): Promise<{ id: string; email: string; name: string; picture: string } | null> {
    const normalized = email.trim().toLowerCase();
    const user = memory.users.find((candidate) => candidate.email === normalized);
    return user ? { id: user.id, email: user.email, name: user.name, picture: user.picture } : null;
  }

  async getPrimaryUserId(): Promise<string | undefined> {
    return memory.users[0]?.id ?? this.userId ?? DEFAULT_MEMORY_USER;
  }

  async createUser(user: { id: string; email: string; name: string; picture: string }): Promise<void> {
    const now = new Date().toISOString();
    memory.users.push({
      id: user.id,
      email: user.email.trim().toLowerCase(),
      name: user.name,
      picture: user.picture,
      createdAt: now,
      updatedAt: now
    });
  }

  async updateUserProfile(id: string, name: string, picture: string): Promise<void> {
    const user = memory.users.find((candidate) => candidate.id === id);
    if (!user) return;
    if (name) user.name = name;
    if (picture) user.picture = picture;
    user.updatedAt = new Date().toISOString();
  }

  async getUserTelegramChatId(userId: string): Promise<string | null> {
    return memory.users.find((u) => u.id === userId)?.telegramChatId ?? null;
  }

  async setUserTelegramChatId(userId: string, chatId: string | null): Promise<void> {
    const user = memory.users.find((u) => u.id === userId);
    if (!user) return;
    user.telegramChatId = chatId;
    user.telegramLinkedAt = chatId ? new Date().toISOString() : null;
    user.updatedAt = new Date().toISOString();
  }

  async listUsersWithTelegram(): Promise<TelegramLinkedUser[]> {
    return memory.users
      .filter((u) => u.telegramChatId)
      .map((u) => ({ id: u.id, email: u.email, telegramChatId: u.telegramChatId! }));
  }

  async createTelegramLinkToken(userId: string, token: string, expiresAt: string): Promise<void> {
    memory.telegramLinkTokens = memory.telegramLinkTokens.filter((t) => t.userId !== userId);
    memory.telegramLinkTokens.push({ token, userId, expiresAt });
  }

  async consumeTelegramLinkToken(token: string): Promise<string | null> {
    const index = memory.telegramLinkTokens.findIndex((t) => t.token === token);
    if (index < 0) return null;
    const entry = memory.telegramLinkTokens[index];
    memory.telegramLinkTokens.splice(index, 1);
    if (new Date(entry.expiresAt).getTime() < Date.now()) return null;
    return entry.userId;
  }

  async listFeatureFlags(): Promise<Array<{ id: string; enabled: boolean; minRole: 'member' | 'admin' }>> {
    return [...memory.featureFlags];
  }

  async upsertFeatureFlag(
    id: string,
    enabled: boolean,
    minRole: 'member' | 'admin',
    _updatedBy?: string
  ): Promise<void> {
    const index = memory.featureFlags.findIndex((f) => f.id === id);
    if (index >= 0) memory.featureFlags[index] = { id, enabled, minRole };
    else memory.featureFlags.push({ id, enabled, minRole });
  }

  async getMiddleNav(userId?: string): Promise<string[] | null> {
    return memory.middleNavByUser.get(userId ?? this.uid) ?? null;
  }

  async setMiddleNav(nav: string[], userId?: string): Promise<void> {
    memory.middleNavByUser.set(userId ?? this.uid, [...nav]);
  }

  async getNotifyPrefs(userId?: string): Promise<NotifyPrefs> {
    return { ...(memory.notifyPrefsByUser.get(userId ?? this.uid) ?? DEFAULT_NOTIFY_PREFS) };
  }

  async setNotifyPrefs(prefs: NotifyPrefs, userId?: string): Promise<void> {
    memory.notifyPrefsByUser.set(userId ?? this.uid, { ...prefs });
  }

  async insertAgentFeed(feed: AgentFeedItem): Promise<void> {
    memory.agentFeeds.push(feed);
  }

  async listAgentFeeds(options?: { status?: string; limit?: number }): Promise<AgentFeedItem[]> {
    let feeds = [...memory.agentFeeds];
    if (options?.status) feeds = feeds.filter((f) => f.status === options.status);
    return feeds.slice(0, options?.limit ?? 50);
  }

  async updateAgentFeedStatus(id: string, status: string, promotedItemId?: string): Promise<void> {
    const feed = memory.agentFeeds.find((f) => f.id === id);
    if (feed) {
      feed.status = status as AgentFeedItem['status'];
      if (promotedItemId) feed.promotedItemId = promotedItemId;
    }
  }

  async findAgentFeedByUrl(url: string): Promise<AgentFeedItem | null> {
    return memory.agentFeeds.find((f) => f.url === url) ?? null;
  }

  async findAgentFeedByPromotedItemId(itemId: string): Promise<AgentFeedItem | null> {
    return memory.agentFeeds.find((f) => f.promotedItemId === itemId) ?? null;
  }

  async insertPreferenceSignal(signal: PreferenceSignal): Promise<void> {
    getUserPreferenceSignals(this.uid).push(signal);
  }

  async listPreferenceSignals(options?: { since?: string; type?: string; limit?: number }): Promise<PreferenceSignal[]> {
    let signals = [...getUserPreferenceSignals(this.uid)];
    if (options?.since) signals = signals.filter((s) => (s.createdAt ?? '') >= options.since!);
    if (options?.type) signals = signals.filter((s) => s.signalType === options.type);
    return signals.slice(0, options?.limit ?? 500);
  }

  async insertAiContextSnapshot(doc: AiContextDocument): Promise<void> {
    getUserAiContexts(this.uid).push({ ...doc, id: crypto.randomUUID() });
  }

  async getLatestAiContext(): Promise<AiContextDocument | null> {
    const contexts = getUserAiContexts(this.uid);
    if (contexts.length === 0) return null;
    return contexts[contexts.length - 1];
  }

  async recordAgentOutcome(feedId: string, outcome: string): Promise<void> {
    memory.agentOutcomes.push({ id: crypto.randomUUID(), agentFeedId: feedId, outcome, createdAt: new Date().toISOString() });
  }

  async getAgentOutcomeStats(): Promise<AgentOutcomeStats> {
    const outcomes = memory.agentOutcomes;
    return {
      total: outcomes.length,
      saved: outcomes.filter((o) => o.outcome === 'saved').length,
      tracked: outcomes.filter((o) => o.outcome === 'tracked').length,
      dismissed: outcomes.filter((o) => o.outcome === 'dismissed').length,
      ignored: outcomes.filter((o) => o.outcome === 'ignored').length,
      byTopic: [],
      bySource: {}
    };
  }

  async listRecentFeedback(days: number): Promise<Array<{ itemId: string; action: string; topics: string[]; sourceType: string; createdAt: string }>> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const feedback = getUserFeedback(this.uid);
    const latestByItem = new Map<string, (typeof feedback)[number]>();
    for (const entry of feedback) {
      if (entry.createdAt < cutoff || !isEffectivePreferenceAction(entry.action)) continue;
      latestByItem.set(entry.itemId, entry);
    }
    return [...latestByItem.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((f) => {
        const item = memory.items.find((i) => i.id === f.itemId);
        return { itemId: f.itemId, action: f.action, topics: item?.topics ?? [], sourceType: item?.sourceType ?? '', createdAt: f.createdAt };
      });
  }

  async recordImpressions(itemIds: string[], impressionType = 'feed'): Promise<void> {
    const now = new Date().toISOString();
    const impressions = getUserImpressions(this.uid);
    for (const itemId of itemIds) {
      impressions.push({ id: crypto.randomUUID(), itemId, impressionType, createdAt: now });
    }
  }

  async getImpressionCounts(itemIds: string[]): Promise<Map<string, number>> {
    const impressions = getUserImpressions(this.uid);
    const counts = new Map<string, number>();
    for (const id of itemIds) {
      counts.set(id, impressions.filter((i) => i.itemId === id).length);
    }
    return counts;
  }

  async getRecentItemSummaries(days: number): Promise<Array<{ title: string; url?: string; externalId: string }>> {
    return memory.items.map((i) => ({ title: i.title, url: i.url, externalId: i.externalId }));
  }

  async listItemsForDedup(_days: number, limit = 300): Promise<DedupExisting[]> {
    return memory.items.slice(0, limit).map((i) => ({
      id: i.id,
      title: i.title,
      url: i.url,
      imageUrl: i.imageUrl,
      summary: i.summary,
      score: i.score,
      status: i.status,
      savedAt: i.savedAt,
      trackingAt: i.trackingAt,
      createdAt: i.createdAt,
      relatedSources: i.relatedSources ?? []
    }));
  }

  async applyItemMerge(merge: MergeAction): Promise<void> {
    const item = memory.items.find((i) => i.id === merge.itemId);
    if (!item) return;
    item.relatedSources = merge.relatedSources;
    if (merge.imageUrl && !item.imageUrl) item.imageUrl = merge.imageUrl;
    item.updatedAt = new Date().toISOString();
  }

  async deleteItemsByIds(ids: string[]): Promise<void> {
    const remove = new Set(ids);
    for (let i = memory.items.length - 1; i >= 0; i--) {
      if (remove.has(memory.items[i].id)) memory.items.splice(i, 1);
    }
  }

  async insertDevRequest(request: DevRequest): Promise<void> {
    memory.devRequests.push(request);
  }

  async listDevRequests(options?: { status?: string; limit?: number }): Promise<DevRequest[]> {
    let requests = [...memory.devRequests];
    if (options?.status) requests = requests.filter((r) => r.status === options.status);
    return requests.slice(0, options?.limit ?? 50);
  }

  async updateDevRequest(id: string, updates: { status?: string; response?: string; branch?: string }): Promise<void> {
    const request = memory.devRequests.find((r) => r.id === id);
    if (request) {
      if (updates.status) request.status = updates.status as DevRequest['status'];
      if (updates.response !== undefined) request.response = updates.response;
      if (updates.branch !== undefined) request.branch = updates.branch ?? undefined;
      request.updatedAt = new Date().toISOString();
    }
  }

  async getItemById(itemId: string): Promise<RadarItem | null> {
    return memory.items.find((item) => item.id === itemId) ?? null;
  }

  async recordDedupFeedback(): Promise<void> {}

  async getAdaptiveDedupThreshold(): Promise<number> {
    return 0.6;
  }
}

class D1RadarDb extends RadarDb {
  constructor(private readonly db: D1Database, userId?: string) {
    super(userId);
  }

  async listTopics(): Promise<WatchTopic[]> {
    if (!this.userId) return [];
    try {
      const { results } = await this.db
        .prepare('SELECT * FROM watch_topics WHERE user_id = ? AND enabled = 1 ORDER BY priority DESC, name ASC')
        .bind(this.userId)
        .all<TopicRow>();
      return results.map(topicFromRow);
    } catch (error) {
      if (isMissingTableError(error)) return defaultWatchTopics;
      throw error;
    }
  }

  async upsertTopic(topic: WatchTopic): Promise<void> {
    if (!this.userId) return;
    return this.upsertTopicForUser(this.userId, topic);
  }

  async upsertTopicForUser(userId: string, topic: WatchTopic): Promise<void> {
    if (!userId) return;
    try {
      await this.db
        .prepare(
          `INSERT INTO watch_topics (user_id, id, type, name, aliases, category, priority, mode, enabled, optimize_status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id, id) DO UPDATE SET
           type = excluded.type,
           name = excluded.name,
           aliases = excluded.aliases,
           category = excluded.category,
           priority = excluded.priority,
           mode = excluded.mode,
           enabled = excluded.enabled,
           optimize_status = excluded.optimize_status,
           updated_at = CURRENT_TIMESTAMP`
        )
        .bind(
          userId,
          topic.id,
          topic.type,
          topic.name,
          JSON.stringify(topic.aliases),
          topic.category,
          topic.priority,
          topic.mode,
          topic.enabled ? 1 : 0,
          topic.optimizeStatus ?? 'pending'
        )
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb(this.userId).upsertTopicForUser(userId, topic);
      throw error;
    }
  }

  async deleteTopic(topicId: string): Promise<void> {
    if (!this.userId) return;
    try {
      await this.db
        .prepare('UPDATE watch_topics SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ?')
        .bind(this.userId, topicId)
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb(this.userId).deleteTopic(topicId);
      throw error;
    }
  }

  async listTopicsForIngestion(): Promise<WatchTopic[]> {
    try {
      const { results } = await this.db
        .prepare(`SELECT * FROM watch_topics WHERE enabled = 1 AND mode = 'follow' ORDER BY priority DESC, name ASC`)
        .all<TopicRow>();
      return dedupeTopicsByName(results.map(topicFromRow));
    } catch (error) {
      if (isMissingTableError(error)) return dedupeTopicsByName(defaultWatchTopics.filter((t) => t.enabled && t.mode === 'follow'));
      throw error;
    }
  }

  async listItems(limit = 30): Promise<RadarItem[]> {
    if (!this.userId) return [];
    const fetchLimit = Math.min(500, Math.max(limit * 5, 150));
    try {
      const { results } = await this.db
        .prepare(`SELECT * FROM (
            SELECT
              i.id, i.source_id, i.source_type, i.external_id, i.kind, i.title, i.summary, i.description,
              i.url, i.image_url, i.location, i.starts_at, i.published_at, i.artists, i.topics, i.raw_json,
              i.score, i.related_sources, i.created_at, i.updated_at,
              COALESCE(s.status, i.status) AS status,
              COALESCE(s.saved_at, i.saved_at) AS saved_at,
              COALESCE(s.tracking_at, i.tracking_at) AS tracking_at,
              COALESCE(s.viewed_at, i.viewed_at) AS viewed_at
            FROM items i
            LEFT JOIN user_item_state s ON s.item_id = i.id AND s.user_id = ?
          )
          WHERE status NOT IN ('dismissed', 'viewed')
            AND viewed_at IS NULL
            AND (
              status IN ('saved', 'tracking')
              OR (starts_at IS NOT NULL AND starts_at > datetime('now'))
              OR (
                (kind NOT IN ('trend', 'news', 'opportunity') OR published_at IS NOT NULL)
                AND COALESCE(published_at, created_at) > datetime('now', '-${MAX_TREND_AGE_DAYS} days')
              )
            )
          ORDER BY score DESC, COALESCE(starts_at, published_at, created_at) ASC LIMIT ?`)
        .bind(this.userId, fetchLimit)
        .all<ItemRow>();
      const topics = await this.listTopics();
      return results
        .map((row) => scoreItem(itemFromRow(row), topics))
        .filter((item) => !(item.score === 0 && item.status === 'dismissed'))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (error) {
      if (isMissingTableError(error)) return demoItems.slice(0, limit);
      throw error;
    }
  }

  async listSavedItems(): Promise<RadarItem[]> {
    if (!this.userId) return [];
    try {
      const { results } = await this.db
        .prepare(`SELECT * FROM (
            SELECT
              i.id, i.source_id, i.source_type, i.external_id, i.kind, i.title, i.summary, i.description,
              i.url, i.image_url, i.location, i.starts_at, i.published_at, i.artists, i.topics, i.raw_json,
              i.score, i.related_sources, i.created_at, i.updated_at,
              COALESCE(s.status, i.status) AS status,
              COALESCE(s.saved_at, i.saved_at) AS saved_at,
              COALESCE(s.tracking_at, i.tracking_at) AS tracking_at,
              COALESCE(s.viewed_at, i.viewed_at) AS viewed_at
            FROM items i
            LEFT JOIN user_item_state s ON s.item_id = i.id AND s.user_id = ?
          )
          WHERE saved_at IS NOT NULL OR tracking_at IS NOT NULL OR status IN ('saved', 'tracking')
          ORDER BY COALESCE(tracking_at, saved_at, updated_at, created_at) DESC`)
        .bind(this.userId)
        .all<ItemRow>();
      const topics = await this.listTopics();
      return results
        .map((row) => scoreItem(itemFromRow(row), topics))
        .filter((item) => !(item.score === 0 && item.status === 'dismissed'));
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb(this.userId).listSavedItems();
      throw error;
    }
  }

  async upsertItem(item: RadarItem): Promise<'inserted' | 'updated'> {
    try {
      const existing = await this.db
        .prepare('SELECT id FROM items WHERE source_type = ? AND external_id = ?')
        .bind(item.sourceType, item.externalId)
        .first<{ id: string }>();

      // Catalog is shared: ingested items always start clean ('new', no engagement),
      // never inheriting a personal dismiss/save/track state from the fetcher.
      await this.db
        .prepare(
          `INSERT INTO items (
          id, source_id, source_type, external_id, kind, title, summary, description, url, image_url,
          location, starts_at, published_at, artists, topics, raw_json, score, status,
          saved_at, tracking_at, viewed_at, related_sources, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', NULL, NULL, NULL, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(source_type, external_id) DO UPDATE SET
          title = excluded.title,
          summary = excluded.summary,
          description = excluded.description,
          url = excluded.url,
          image_url = COALESCE(excluded.image_url, items.image_url),
          location = excluded.location,
          starts_at = excluded.starts_at,
          published_at = excluded.published_at,
          artists = excluded.artists,
          topics = excluded.topics,
          raw_json = excluded.raw_json,
          score = excluded.score,
          related_sources = CASE WHEN excluded.related_sources != '[]'
            THEN excluded.related_sources ELSE items.related_sources END,
          updated_at = CURRENT_TIMESTAMP`
        )
        .bind(
          item.id,
          item.sourceId,
          item.sourceType,
          item.externalId,
          item.kind,
          item.title,
          item.summary,
          item.description,
          item.url ?? null,
          item.imageUrl ?? null,
          item.location ?? null,
          item.startsAt ?? null,
          item.publishedAt ?? null,
          JSON.stringify(item.artists),
          JSON.stringify(item.topics),
          JSON.stringify(item.raw ?? {}),
          item.score,
          JSON.stringify(item.relatedSources ?? [])
        )
        .run();

      return existing ? 'updated' : 'inserted';
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb(this.userId).upsertItem(item);
      throw error;
    }
  }

  async listReminders(): Promise<DateReminder[]> {
    if (!this.userId) return [];
    try {
      const { results } = await this.db
        .prepare('SELECT * FROM date_reminders WHERE user_id = ? AND enabled = 1 ORDER BY pinned DESC, title ASC')
        .bind(this.userId)
        .all<ReminderRow>();
      return results.map(reminderFromRow);
    } catch (error) {
      if (isMissingTableError(error)) return defaultDateReminders;
      throw error;
    }
  }

  async upsertReminder(reminder: DateReminder): Promise<void> {
    if (!this.userId) return;
    try {
      await this.db
        .prepare(
          `INSERT INTO date_reminders (
            user_id, id, title, calendar_type, category, year, month, day, lunar_is_leap_month, repeat, note,
            pinned, enabled, remind_days_before, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id, id) DO UPDATE SET
            title = excluded.title,
            calendar_type = excluded.calendar_type,
            category = excluded.category,
            year = excluded.year,
            month = excluded.month,
            day = excluded.day,
            lunar_is_leap_month = excluded.lunar_is_leap_month,
            repeat = excluded.repeat,
            note = excluded.note,
            pinned = excluded.pinned,
            enabled = excluded.enabled,
            remind_days_before = excluded.remind_days_before,
            updated_at = CURRENT_TIMESTAMP`
        )
        .bind(
          this.userId,
          reminder.id,
          reminder.title,
          reminder.calendarType,
          reminder.category,
          reminder.year ?? null,
          reminder.month,
          reminder.day,
          reminder.lunarIsLeapMonth ? 1 : 0,
          reminder.repeat,
          reminder.note,
          reminder.pinned ? 1 : 0,
          reminder.enabled ? 1 : 0,
          JSON.stringify(reminder.remindDaysBefore)
        )
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb(this.userId).upsertReminder(reminder);
      throw error;
    }
  }

  async deleteReminder(reminderId: string): Promise<void> {
    if (!this.userId) return;
    try {
      await this.db
        .prepare('UPDATE date_reminders SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ?')
        .bind(this.userId, reminderId)
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb(this.userId).deleteReminder(reminderId);
      throw error;
    }
  }

  async recordFeedback(itemId: string, action: FeedbackAction, reason?: string): Promise<void> {
    if (!this.userId) return;
    try {
      await this.db
        .prepare('INSERT INTO feedback_events (id, item_id, action, reason, user_id) VALUES (?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), itemId, action, reason ?? null, this.userId)
        .run();

      await this.applyFeedbackState(itemId, action);

      // Also record as preference signal
      await this.insertPreferenceSignal({
        id: crypto.randomUUID(),
        signalType: 'feedback',
        signalValue: action,
        relatedItemId: itemId,
        source: 'ui',
      });

      // Track agent outcomes for agent-sourced items
      const item = await this.db
        .prepare('SELECT source_type FROM items WHERE id = ?')
        .bind(itemId)
        .first<{ source_type: string }>();
      if (item?.source_type === 'agent') {
        const agentFeed = await this.findAgentFeedByPromotedItemId(itemId);
        if (agentFeed) {
          const outcome = action === 'save' ? 'saved'
            : action === 'track' ? 'tracked'
            : action === 'not_relevant' || action === 'less_like_this' ? 'dismissed'
            : 'clicked';
          await this.recordAgentOutcome(agentFeed.id, outcome);
        }
      }
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb(this.userId).recordFeedback(itemId, action, reason);
      throw error;
    }
  }

  async updateItemStatus(itemId: string, status: RadarItem['status']): Promise<void> {
    if (!this.userId) return;
    try {
      if (status === 'dismissed') {
        const existing = await this.getUserItemState(itemId);
        await this.setUserItemState(itemId, { status: 'dismissed', savedAt: null, trackingAt: null, viewedAt: existing?.viewedAt ?? null });
      } else if (status === 'viewed') {
        await this.applyFeedbackState(itemId, 'viewed');
      } else {
        const existing = await this.getUserItemState(itemId);
        await this.setUserItemState(itemId, {
          status,
          savedAt: existing?.savedAt ?? null,
          trackingAt: existing?.trackingAt ?? null,
          viewedAt: existing?.viewedAt ?? null
        });
      }
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb(this.userId).updateItemStatus(itemId, status);
      throw error;
    }
  }

  private async getUserItemState(itemId: string): Promise<{ status: string; savedAt: string | null; trackingAt: string | null; viewedAt: string | null } | null> {
    if (!this.userId) return null;
    const row = await this.db
      .prepare('SELECT status, saved_at, tracking_at, viewed_at FROM user_item_state WHERE user_id = ? AND item_id = ?')
      .bind(this.userId, itemId)
      .first<{ status: string; saved_at: string | null; tracking_at: string | null; viewed_at: string | null }>();
    if (!row) return null;
    return { status: row.status, savedAt: row.saved_at, trackingAt: row.tracking_at, viewedAt: row.viewed_at };
  }

  private async setUserItemState(
    itemId: string,
    state: { status: string; savedAt: string | null; trackingAt: string | null; viewedAt: string | null }
  ): Promise<void> {
    if (!this.userId) return;
    await this.db
      .prepare(
        `INSERT INTO user_item_state (user_id, item_id, status, saved_at, tracking_at, viewed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id, item_id) DO UPDATE SET
           status = excluded.status,
           saved_at = excluded.saved_at,
           tracking_at = excluded.tracking_at,
           viewed_at = excluded.viewed_at,
           updated_at = CURRENT_TIMESTAMP`
      )
      .bind(this.userId, itemId, state.status, state.savedAt, state.trackingAt, state.viewedAt)
      .run();
  }

  private async applyFeedbackState(itemId: string, action: FeedbackAction): Promise<void> {
    if (!this.userId) return;
    const now = new Date().toISOString();
    const existing = await this.getUserItemState(itemId);
    if (action === 'save') {
      await this.setUserItemState(itemId, { status: 'saved', savedAt: now, trackingAt: null, viewedAt: existing?.viewedAt ?? null });
    } else if (action === 'track') {
      await this.setUserItemState(itemId, {
        status: 'tracking',
        savedAt: existing?.savedAt ?? now,
        trackingAt: now,
        viewedAt: existing?.viewedAt ?? null
      });
    } else if (action === 'unsave') {
      await this.setUserItemState(itemId, {
        status: existing?.viewedAt ? 'viewed' : 'new',
        savedAt: null,
        trackingAt: null,
        viewedAt: existing?.viewedAt ?? null
      });
    } else if (action === 'not_relevant' || action === 'less_like_this') {
      await this.setUserItemState(itemId, { status: 'dismissed', savedAt: null, trackingAt: null, viewedAt: existing?.viewedAt ?? null });
    } else if (action === 'viewed') {
      const status = existing?.status === 'saved' || existing?.status === 'tracking' ? existing.status : 'viewed';
      await this.setUserItemState(itemId, {
        status,
        savedAt: existing?.savedAt ?? null,
        trackingAt: existing?.trackingAt ?? null,
        viewedAt: now
      });
    }
  }

  async logNotification(input: { itemId?: string; channel: string; type: string; status: string; message: string }): Promise<void> {
    try {
      await this.db
        .prepare('INSERT INTO notifications (id, item_id, channel, type, status, message) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), input.itemId ?? null, input.channel, input.type, input.status, input.message)
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return;
      throw error;
    }
  }

  async notificationExists(type: string, itemId?: string): Promise<boolean> {
    try {
      if (itemId != null) {
        const row = await this.db
          .prepare('SELECT 1 AS ok FROM notifications WHERE type = ? AND item_id = ? LIMIT 1')
          .bind(type, itemId)
          .first<{ ok: number }>();
        return Boolean(row);
      }
      const row = await this.db
        .prepare('SELECT 1 AS ok FROM notifications WHERE type = ? LIMIT 1')
        .bind(type)
        .first<{ ok: number }>();
      return Boolean(row);
    } catch (error) {
      if (isMissingTableError(error)) return false;
      throw error;
    }
  }

  async logJob(input: { jobName: string; status: string; detail: string }): Promise<void> {
    try {
      await this.db
        .prepare('INSERT INTO job_runs (id, job_name, status, finished_at, detail) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)')
        .bind(crypto.randomUUID(), input.jobName, input.status, input.detail)
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return;
      throw error;
    }
  }

  async listJobRuns(jobName: string, limit = 5): Promise<JobRun[]> {
    try {
      const { results } = await this.db
        .prepare('SELECT * FROM job_runs WHERE job_name = ? ORDER BY COALESCE(finished_at, started_at) DESC LIMIT ?')
        .bind(jobName, limit)
        .all<JobRunRow>();
      return results.map(jobRunFromRow);
    } catch (error) {
      if (isMissingTableError(error)) return [];
      throw error;
    }
  }

  async listAllowedEmails(): Promise<string[]> {
    try {
      const { results } = await this.db
        .prepare('SELECT email FROM allowed_emails ORDER BY created_at ASC')
        .all<{ email: string }>();
      return results.map((r) => r.email);
    } catch (error) {
      if (isMissingTableError(error)) return [];
      throw error;
    }
  }

  async addAllowedEmail(email: string, createdBy?: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    try {
      await this.db
        .prepare('INSERT INTO allowed_emails (email, created_by) VALUES (?, ?) ON CONFLICT(email) DO NOTHING')
        .bind(normalized, createdBy ?? null)
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb(this.userId).addAllowedEmail(email, createdBy);
      throw error;
    }
  }

  async removeAllowedEmail(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    try {
      await this.db.prepare('DELETE FROM allowed_emails WHERE email = ?').bind(normalized).run();
    } catch (error) {
      if (isMissingTableError(error)) return;
      throw error;
    }
  }

  async getUserByEmail(email: string): Promise<{ id: string; email: string; name: string; picture: string } | null> {
    try {
      const row = await this.db
        .prepare('SELECT id, email, name, picture FROM users WHERE email = ?')
        .bind(email.trim().toLowerCase())
        .first<UserRow>();
      return row ?? null;
    } catch (error) {
      if (isMissingTableError(error)) return null;
      throw error;
    }
  }

  async getPrimaryUserId(): Promise<string | undefined> {
    try {
      const row = await this.db
        .prepare('SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1')
        .first<{ id: string }>();
      return row?.id ?? undefined;
    } catch (error) {
      if (isMissingTableError(error)) return undefined;
      throw error;
    }
  }

  async createUser(user: { id: string; email: string; name: string; picture: string }): Promise<void> {
    try {
      await this.db
        .prepare('INSERT INTO users (id, email, name, picture) VALUES (?, ?, ?, ?)')
        .bind(user.id, user.email.trim().toLowerCase(), user.name, user.picture)
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb(this.userId).createUser(user);
      throw error;
    }
  }

  async updateUserProfile(id: string, name: string, picture: string): Promise<void> {
    try {
      await this.db
        .prepare('UPDATE users SET name = COALESCE(NULLIF(?, \'\'), name), picture = COALESCE(NULLIF(?, \'\'), picture), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(name ?? '', picture ?? '', id)
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return;
      throw error;
    }
  }

  async getUserTelegramChatId(userId: string): Promise<string | null> {
    try {
      const row = await this.db
        .prepare('SELECT telegram_chat_id FROM users WHERE id = ?')
        .bind(userId)
        .first<{ telegram_chat_id: string | null }>();
      return row?.telegram_chat_id ?? null;
    } catch (error) {
      if (isMissingTableError(error) || isMissingColumnError(error)) return null;
      throw error;
    }
  }

  async setUserTelegramChatId(userId: string, chatId: string | null): Promise<void> {
    try {
      await this.db
        .prepare(
          `UPDATE users SET
            telegram_chat_id = ?,
            telegram_linked_at = CASE WHEN ? IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`
        )
        .bind(chatId, chatId, userId)
        .run();
    } catch (error) {
      if (isMissingTableError(error) || isMissingColumnError(error)) return;
      throw error;
    }
  }

  async listUsersWithTelegram(): Promise<TelegramLinkedUser[]> {
    try {
      const { results } = await this.db
        .prepare(
          `SELECT id, email, telegram_chat_id FROM users
           WHERE telegram_chat_id IS NOT NULL AND telegram_chat_id != ''`
        )
        .all<{ id: string; email: string; telegram_chat_id: string }>();
      return (results ?? []).map((row) => ({
        id: row.id,
        email: row.email,
        telegramChatId: row.telegram_chat_id
      }));
    } catch (error) {
      if (isMissingTableError(error) || isMissingColumnError(error)) return [];
      throw error;
    }
  }

  async createTelegramLinkToken(userId: string, token: string, expiresAt: string): Promise<void> {
    try {
      await this.db.prepare('DELETE FROM telegram_link_tokens WHERE user_id = ?').bind(userId).run();
      await this.db
        .prepare('INSERT INTO telegram_link_tokens (token, user_id, expires_at) VALUES (?, ?, ?)')
        .bind(token, userId, expiresAt)
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return;
      throw error;
    }
  }

  async consumeTelegramLinkToken(token: string): Promise<string | null> {
    try {
      const row = await this.db
        .prepare('SELECT user_id, expires_at FROM telegram_link_tokens WHERE token = ?')
        .bind(token)
        .first<{ user_id: string; expires_at: string }>();
      if (!row) return null;
      await this.db.prepare('DELETE FROM telegram_link_tokens WHERE token = ?').bind(token).run();
      if (new Date(row.expires_at).getTime() < Date.now()) return null;
      return row.user_id;
    } catch (error) {
      if (isMissingTableError(error)) return null;
      throw error;
    }
  }

  async listFeatureFlags(): Promise<Array<{ id: string; enabled: boolean; minRole: 'member' | 'admin' }>> {
    try {
      const { results } = await this.db
        .prepare('SELECT id, enabled, min_role FROM feature_flags ORDER BY id ASC')
        .all<{ id: string; enabled: number; min_role: 'member' | 'admin' }>();
      return (results ?? []).map((row) => ({
        id: row.id,
        enabled: Boolean(row.enabled),
        minRole: row.min_role
      }));
    } catch (error) {
      if (isMissingTableError(error)) return [];
      throw error;
    }
  }

  async upsertFeatureFlag(
    id: string,
    enabled: boolean,
    minRole: 'member' | 'admin',
    updatedBy?: string
  ): Promise<void> {
    try {
      await this.db
        .prepare(
          `INSERT INTO feature_flags (id, enabled, min_role, updated_at, updated_by)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
           ON CONFLICT(id) DO UPDATE SET
             enabled = excluded.enabled,
             min_role = excluded.min_role,
             updated_at = CURRENT_TIMESTAMP,
             updated_by = excluded.updated_by`
        )
        .bind(id, enabled ? 1 : 0, minRole, updatedBy ?? null)
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return;
      throw error;
    }
  }

  async getMiddleNav(userId?: string): Promise<string[] | null> {
    const uid = userId ?? this.userId;
    if (!uid) return null;
    try {
      const row = await this.db
        .prepare('SELECT middle_nav_json FROM user_settings WHERE user_id = ?')
        .bind(uid)
        .first<{ middle_nav_json: string }>();
      if (!row) return null;
      return parseJson<string[]>(row.middle_nav_json, []);
    } catch (error) {
      if (isMissingTableError(error)) return null;
      throw error;
    }
  }

  async setMiddleNav(nav: string[], userId?: string): Promise<void> {
    const uid = userId ?? this.userId;
    if (!uid) return;
    try {
      await this.db
        .prepare(
          `INSERT INTO user_settings (user_id, middle_nav_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id) DO UPDATE SET middle_nav_json = excluded.middle_nav_json, updated_at = CURRENT_TIMESTAMP`
        )
        .bind(uid, JSON.stringify(nav))
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb(this.userId).setMiddleNav(nav, userId);
      throw error;
    }
  }

  async getNotifyPrefs(userId?: string): Promise<NotifyPrefs> {
    const uid = userId ?? this.userId;
    if (!uid) return { ...DEFAULT_NOTIFY_PREFS };
    try {
      const row = await this.db
        .prepare('SELECT notify_prefs_json FROM user_settings WHERE user_id = ?')
        .bind(uid)
        .first<{ notify_prefs_json: string | null }>();
      if (!row?.notify_prefs_json) return { ...DEFAULT_NOTIFY_PREFS };
      return parseNotifyPrefs(row.notify_prefs_json);
    } catch (error) {
      if (isMissingTableError(error) || isMissingColumnError(error)) {
        return new MemoryRadarDb(this.userId).getNotifyPrefs(userId);
      }
      throw error;
    }
  }

  async setNotifyPrefs(prefs: NotifyPrefs, userId?: string): Promise<void> {
    const uid = userId ?? this.userId;
    if (!uid) return;
    try {
      await this.db
        .prepare(
          `INSERT INTO user_settings (user_id, middle_nav_json, notify_prefs_json, updated_at)
           VALUES (?, '[]', ?, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id) DO UPDATE SET
             notify_prefs_json = excluded.notify_prefs_json,
             updated_at = CURRENT_TIMESTAMP`
        )
        .bind(uid, JSON.stringify(prefs))
        .run();
    } catch (error) {
      if (isMissingTableError(error) || isMissingColumnError(error)) {
        return new MemoryRadarDb(this.userId).setNotifyPrefs(prefs, userId);
      }
      throw error;
    }
  }

  async insertAgentFeed(feed: AgentFeedItem): Promise<void> {
    try {
      await this.db
        .prepare(
          `INSERT INTO agent_feeds (id, source, cadence, title, summary, url, kind, confidence,
           relevance_reason, topics, metadata_json, status, promoted_item_id, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
        )
        .bind(
          feed.id, feed.source, feed.cadence, feed.title, feed.summary,
          feed.url ?? null, feed.kind, feed.confidence, feed.relevanceReason,
          JSON.stringify(feed.topics), JSON.stringify(feed.metadata),
          feed.status, feed.promotedItemId ?? null
        )
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb(this.userId).insertAgentFeed(feed);
      throw error;
    }
  }

  async listAgentFeeds(options?: { status?: string; limit?: number }): Promise<AgentFeedItem[]> {
    try {
      let sql = 'SELECT * FROM agent_feeds';
      const binds: unknown[] = [];
      if (options?.status) {
        sql += ' WHERE status = ?';
        binds.push(options.status);
      }
      sql += ' ORDER BY created_at DESC LIMIT ?';
      binds.push(options?.limit ?? 50);
      const { results } = await this.db.prepare(sql).bind(...binds).all<AgentFeedRow>();
      return results.map(agentFeedFromRow);
    } catch (error) {
      if (isMissingTableError(error)) return [];
      throw error;
    }
  }

  async updateAgentFeedStatus(id: string, status: string, promotedItemId?: string): Promise<void> {
    try {
      await this.db
        .prepare('UPDATE agent_feeds SET status = ?, promoted_item_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(status, promotedItemId ?? null, id)
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return;
      throw error;
    }
  }

  async findAgentFeedByUrl(url: string): Promise<AgentFeedItem | null> {
    try {
      const row = await this.db
        .prepare('SELECT * FROM agent_feeds WHERE url = ? LIMIT 1')
        .bind(url)
        .first<AgentFeedRow>();
      return row ? agentFeedFromRow(row) : null;
    } catch (error) {
      if (isMissingTableError(error)) return null;
      throw error;
    }
  }

  async findAgentFeedByPromotedItemId(itemId: string): Promise<AgentFeedItem | null> {
    try {
      const row = await this.db
        .prepare('SELECT * FROM agent_feeds WHERE promoted_item_id = ? LIMIT 1')
        .bind(itemId)
        .first<AgentFeedRow>();
      return row ? agentFeedFromRow(row) : null;
    } catch (error) {
      if (isMissingTableError(error)) return null;
      throw error;
    }
  }

  async insertPreferenceSignal(signal: PreferenceSignal): Promise<void> {
    try {
      await this.db
        .prepare(
          `INSERT INTO preference_signals (id, signal_type, signal_value, related_item_id, related_topic_id, source, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          signal.id, signal.signalType, signal.signalValue,
          signal.relatedItemId ?? null, signal.relatedTopicId ?? null, signal.source,
          this.userId ?? null
        )
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb(this.userId).insertPreferenceSignal(signal);
      throw error;
    }
  }

  async listPreferenceSignals(options?: { since?: string; type?: string; limit?: number }): Promise<PreferenceSignal[]> {
    if (!this.userId) return [];
    try {
      let sql = 'SELECT * FROM preference_signals WHERE user_id = ?';
      const binds: unknown[] = [this.userId];
      if (options?.since) { sql += ' AND created_at >= ?'; binds.push(options.since); }
      if (options?.type) { sql += ' AND signal_type = ?'; binds.push(options.type); }
      sql += ' ORDER BY created_at DESC LIMIT ?';
      binds.push(options?.limit ?? 500);
      const { results } = await this.db.prepare(sql).bind(...binds).all<PreferenceSignalRow>();
      return results.map(preferenceSignalFromRow);
    } catch (error) {
      if (isMissingTableError(error)) return [];
      throw error;
    }
  }

  async insertAiContextSnapshot(doc: AiContextDocument): Promise<void> {
    if (!this.userId) return;
    try {
      const signalCount = await this.db
        .prepare('SELECT COUNT(*) as cnt FROM preference_signals WHERE user_id = ?')
        .bind(this.userId)
        .first<{ cnt: number }>()
        .then((r) => r?.cnt ?? 0);

      await this.db
        .prepare(
          `INSERT INTO ai_context_snapshots (id, version, context_json, compiled_from, signal_count, user_id)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(), doc.version, JSON.stringify(doc),
          `${doc.interestProfile.primary.length} topics, ${doc.stats.totalFeedbackEvents} feedback events`,
          signalCount, this.userId
        )
        .run();

      // Keep only the last 10 snapshots per user
      await this.db
        .prepare(
          `DELETE FROM ai_context_snapshots WHERE user_id = ? AND id NOT IN (
             SELECT id FROM ai_context_snapshots WHERE user_id = ? ORDER BY version DESC LIMIT 10
           )`
        )
        .bind(this.userId, this.userId)
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb(this.userId).insertAiContextSnapshot(doc);
      throw error;
    }
  }

  async getLatestAiContext(): Promise<AiContextDocument | null> {
    if (!this.userId) return null;
    try {
      const row = await this.db
        .prepare('SELECT * FROM ai_context_snapshots WHERE user_id = ? ORDER BY version DESC LIMIT 1')
        .bind(this.userId)
        .first<AiContextRow>();
      if (!row) return null;
      return parseJson<AiContextDocument>(row.context_json, null as unknown as AiContextDocument);
    } catch (error) {
      if (isMissingTableError(error)) return null;
      throw error;
    }
  }

  async recordAgentOutcome(feedId: string, outcome: string): Promise<void> {
    try {
      await this.db
        .prepare('INSERT INTO agent_suggestion_outcomes (id, agent_feed_id, outcome) VALUES (?, ?, ?)')
        .bind(crypto.randomUUID(), feedId, outcome)
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return;
      throw error;
    }
  }

  async getAgentOutcomeStats(): Promise<AgentOutcomeStats> {
    try {
      // JOIN instead of `IN (...)` — D1 caps bound parameters at 100, and
      // production already has 160+ distinct outcome feed ids.
      const { results: rows } = await this.db
        .prepare(
          `SELECT o.agent_feed_id, o.outcome, f.source, f.topics
           FROM agent_suggestion_outcomes o
           LEFT JOIN agent_feeds f ON f.id = o.agent_feed_id`
        )
        .all<{ agent_feed_id: string; outcome: string; source: string | null; topics: string | null }>();

      const stats: AgentOutcomeStats = {
        total: rows.length,
        saved: rows.filter((o) => o.outcome === 'saved').length,
        tracked: rows.filter((o) => o.outcome === 'tracked').length,
        dismissed: rows.filter((o) => o.outcome === 'dismissed').length,
        ignored: rows.filter((o) => o.outcome === 'ignored').length,
        byTopic: [],
        bySource: {}
      };

      const bySource: Record<string, { total: number; saved: number; dismissed: number }> = {};
      const byTopic: Record<string, { total: number; saved: number; dismissed: number }> = {};

      for (const row of rows) {
        if (!row.source) continue;

        if (!bySource[row.source]) bySource[row.source] = { total: 0, saved: 0, dismissed: 0 };
        bySource[row.source].total++;
        if (row.outcome === 'saved') bySource[row.source].saved++;
        if (row.outcome === 'dismissed') bySource[row.source].dismissed++;

        const topics = parseJson<string[]>(row.topics ?? '[]', []);
        for (const t of topics) {
          if (!byTopic[t]) byTopic[t] = { total: 0, saved: 0, dismissed: 0 };
          byTopic[t].total++;
          if (row.outcome === 'saved') byTopic[t].saved++;
          if (row.outcome === 'dismissed') byTopic[t].dismissed++;
        }
      }

      stats.bySource = bySource;
      stats.byTopic = Object.entries(byTopic).map(([topic, s]) => ({
        topic,
        saveRate: s.total > 0 ? s.saved / s.total : 0,
        dismissRate: s.total > 0 ? s.dismissed / s.total : 0,
        count: s.total
      }));

      return stats;
    } catch (error) {
      if (isMissingTableError(error)) return { total: 0, saved: 0, tracked: 0, dismissed: 0, ignored: 0, byTopic: [], bySource: {} };
      throw error;
    }
  }

  async listRecentFeedback(days: number): Promise<Array<{ itemId: string; action: string; topics: string[]; sourceType: string; createdAt: string }>> {
    if (!this.userId) return [];
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { results } = await this.db
        .prepare(
          `WITH ranked_feedback AS (
             SELECT f.*,
               ROW_NUMBER() OVER (PARTITION BY f.item_id ORDER BY f.created_at DESC, f.id DESC) AS rank
             FROM feedback_events f
             WHERE f.created_at >= ? AND f.user_id = ?
               AND f.action IN ('save', 'track', 'unsave', 'not_relevant', 'more_like_this', 'less_like_this')
           )
           SELECT f.item_id, f.action, i.topics, i.source_type, f.created_at
           FROM ranked_feedback f
           LEFT JOIN items i ON f.item_id = i.id
           WHERE f.rank = 1
           ORDER BY f.created_at DESC`
        )
        .bind(cutoff, this.userId)
        .all<FeedbackJoinRow>();
      return results.map((r) => ({
        itemId: r.item_id,
        action: r.action,
        topics: parseJson<string[]>(r.topics, []),
        sourceType: r.source_type ?? '',
        createdAt: r.created_at
      }));
    } catch (error) {
      if (isMissingTableError(error)) return [];
      throw error;
    }
  }

  async recordImpressions(itemIds: string[], impressionType = 'feed'): Promise<void> {
    if (!this.userId || itemIds.length === 0) return;
    try {
      const batch = itemIds.map((id) =>
        this.db
          .prepare('INSERT INTO item_impressions (id, item_id, impression_type, user_id) VALUES (?, ?, ?, ?)')
          .bind(crypto.randomUUID(), id, impressionType, this.userId)
      );
      await this.db.batch(batch);
    } catch (error) {
      if (isMissingTableError(error)) return;
      throw error;
    }
  }

  async getImpressionCounts(itemIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (itemIds.length === 0 || !this.userId) return counts;
    try {
      const placeholders = itemIds.map(() => '?').join(',');
      const { results } = await this.db
        .prepare(`SELECT item_id, COUNT(*) as cnt FROM item_impressions WHERE user_id = ? AND item_id IN (${placeholders}) GROUP BY item_id`)
        .bind(this.userId, ...itemIds)
        .all<{ item_id: string; cnt: number }>();
      for (const r of results) counts.set(r.item_id, r.cnt);
      return counts;
    } catch (error) {
      if (isMissingTableError(error)) return counts;
      throw error;
    }
  }

  async getRecentItemSummaries(days: number): Promise<Array<{ title: string; url?: string; externalId: string }>> {
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { results } = await this.db
        .prepare('SELECT title, url, external_id FROM items WHERE created_at >= ? ORDER BY created_at DESC LIMIT 200')
        .bind(cutoff)
        .all<{ title: string; url: string | null; external_id: string }>();
      return results.map((r) => ({ title: r.title, url: r.url ?? undefined, externalId: r.external_id }));
    } catch (error) {
      if (isMissingTableError(error)) return [];
      throw error;
    }
  }

  async listItemsForDedup(days: number, limit = 300): Promise<DedupExisting[]> {
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { results } = await this.db
        .prepare(
          `SELECT id, title, url, image_url, summary, score, status, saved_at, tracking_at, related_sources, created_at
           FROM items WHERE created_at >= ? AND status != 'dismissed' ORDER BY created_at DESC LIMIT ?`
        )
        .bind(cutoff, limit)
        .all<{
          id: string;
          title: string;
          url: string | null;
          image_url: string | null;
          summary: string | null;
          score: number;
          status: RadarItem['status'];
          saved_at: string | null;
          tracking_at: string | null;
          related_sources: string | null;
          created_at: string;
        }>();
      return results.map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url ?? undefined,
        imageUrl: r.image_url ?? undefined,
        summary: r.summary ?? undefined,
        score: r.score,
        status: r.status,
        savedAt: r.saved_at ?? undefined,
        trackingAt: r.tracking_at ?? undefined,
        createdAt: r.created_at,
        relatedSources: parseJson(r.related_sources ?? '[]', [])
      }));
    } catch (error) {
      if (isMissingTableError(error)) return [];
      throw error;
    }
  }

  async applyItemMerge(merge: MergeAction): Promise<void> {
    try {
      await this.db
        .prepare(
          `UPDATE items SET related_sources = ?, image_url = COALESCE(image_url, ?), updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .bind(JSON.stringify(merge.relatedSources), merge.imageUrl ?? null, merge.itemId)
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return;
      throw error;
    }
  }

  async deleteItemsByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const placeholders = ids.map(() => '?').join(',');
      await this.db.prepare(`DELETE FROM items WHERE id IN (${placeholders})`).bind(...ids).run();
    } catch (error) {
      if (isMissingTableError(error)) return;
      throw error;
    }
  }

  async insertDevRequest(request: DevRequest): Promise<void> {
    try {
      await this.db
        .prepare('INSERT INTO dev_requests (id, text, status, response, branch) VALUES (?, ?, ?, ?, ?)')
        .bind(request.id, request.text, request.status, request.response, request.branch ?? null)
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb(this.userId).insertDevRequest(request);
      throw error;
    }
  }

  async listDevRequests(options?: { status?: string; limit?: number }): Promise<DevRequest[]> {
    try {
      let sql = 'SELECT * FROM dev_requests';
      const binds: unknown[] = [];
      if (options?.status) {
        sql += ' WHERE status = ?';
        binds.push(options.status);
      }
      sql += ' ORDER BY created_at DESC LIMIT ?';
      binds.push(options?.limit ?? 50);
      const { results } = await this.db.prepare(sql).bind(...binds).all<DevRequestRow>();
      return results.map(devRequestFromRow);
    } catch (error) {
      if (isMissingTableError(error)) return [];
      throw error;
    }
  }

  async updateDevRequest(id: string, updates: { status?: string; response?: string; branch?: string }): Promise<void> {
    try {
      const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP'];
      const binds: unknown[] = [];
      if (updates.status !== undefined) { setClauses.push('status = ?'); binds.push(updates.status); }
      if (updates.response !== undefined) { setClauses.push('response = ?'); binds.push(updates.response); }
      if (updates.branch !== undefined) { setClauses.push('branch = ?'); binds.push(updates.branch); }
      binds.push(id);
      await this.db
        .prepare(`UPDATE dev_requests SET ${setClauses.join(', ')} WHERE id = ?`)
        .bind(...binds)
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return;
      throw error;
    }
  }

  async getItemById(itemId: string): Promise<RadarItem | null> {
    try {
      const row = await this.db
        .prepare('SELECT * FROM items WHERE id = ?')
        .bind(itemId)
        .first<ItemRow>();
      return row ? itemFromRow(row) : null;
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb(this.userId).getItemById(itemId);
      throw error;
    }
  }

  async recordDedupFeedback(triggerId: string, matchedId: string, similarity: number, thresholdUsed: number): Promise<void> {
    try {
      await this.db
        .prepare('INSERT INTO dedup_feedback (id, trigger_item_id, matched_item_id, similarity, threshold_used) VALUES (?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), triggerId, matchedId, similarity, thresholdUsed)
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return;
      throw error;
    }
  }

  async getAdaptiveDedupThreshold(): Promise<number> {
    const DEFAULT_THRESHOLD = 0.6;
    try {
      const row = await this.db
        .prepare(
          `SELECT MIN(similarity) as min_sim, COUNT(*) as cnt
           FROM dedup_feedback
           WHERE created_at >= datetime('now', '-30 days')`
        )
        .first<{ min_sim: number | null; cnt: number }>();
      if (!row || row.cnt < 3 || row.min_sim == null) return DEFAULT_THRESHOLD;
      return Math.max(0.35, Math.min(row.min_sim - 0.05, DEFAULT_THRESHOLD));
    } catch (error) {
      if (isMissingTableError(error)) return DEFAULT_THRESHOLD;
      throw error;
    }
  }
}

function applyFeedbackState(state: MemoryUserItemState | undefined, action: FeedbackAction): MemoryUserItemState {
  const now = new Date().toISOString();
  if (action === 'save') {
    return { status: 'saved', savedAt: now, trackingAt: undefined, viewedAt: state?.viewedAt, updatedAt: now };
  }
  if (action === 'track') {
    return { status: 'tracking', savedAt: state?.savedAt ?? now, trackingAt: now, viewedAt: state?.viewedAt, updatedAt: now };
  }
  if (action === 'unsave') {
    return {
      status: state?.viewedAt ? 'viewed' : 'new',
      savedAt: undefined,
      trackingAt: undefined,
      viewedAt: state?.viewedAt,
      updatedAt: now
    };
  }
  if (action === 'not_relevant' || action === 'less_like_this') {
    return { status: 'dismissed', savedAt: undefined, trackingAt: undefined, viewedAt: state?.viewedAt, updatedAt: now };
  }
  if (action === 'viewed') {
    return {
      status: state?.status === 'saved' || state?.status === 'tracking' ? state.status : 'viewed',
      savedAt: state?.savedAt,
      trackingAt: state?.trackingAt,
      viewedAt: now,
      updatedAt: now
    };
  }
  return state ?? { status: 'new', updatedAt: now };
}

function isEffectivePreferenceAction(action: FeedbackAction): boolean {
  return action === 'save'
    || action === 'track'
    || action === 'unsave'
    || action === 'not_relevant'
    || action === 'more_like_this'
    || action === 'less_like_this';
}

function itemFromRow(row: ItemRow): RadarItem {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceType: row.source_type,
    externalId: row.external_id,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    description: row.description,
    url: row.url ?? undefined,
    imageUrl: row.image_url ?? undefined,
    location: row.location ?? undefined,
    startsAt: row.starts_at ?? undefined,
    publishedAt: row.published_at ?? undefined,
    artists: parseJson<string[]>(row.artists, []),
    topics: parseJson<string[]>(row.topics, []),
    raw: parseJson(row.raw_json, {}),
    score: row.score,
    status: row.status,
    savedAt: row.saved_at ?? undefined,
    trackingAt: row.tracking_at ?? undefined,
    viewedAt: row.viewed_at ?? undefined,
    relatedSources: parseJson(row.related_sources ?? '[]', []),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function topicFromRow(row: TopicRow): WatchTopic {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    aliases: parseJson<string[]>(row.aliases, []),
    category: row.category,
    priority: row.priority,
    mode: row.mode ?? 'follow',
    enabled: row.enabled === 1,
    // Rows predating the column read as already optimized so they aren't churned
    optimizeStatus: (row.optimize_status as WatchTopic['optimizeStatus']) ?? 'optimized',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const validCategories = new Set(['birthday', 'child_birthday', 'anniversary', 'memorial', 'other']);

function reminderFromRow(row: ReminderRow): DateReminder {
  return {
    id: row.id,
    title: row.title,
    calendarType: row.calendar_type,
    category: validCategories.has(row.category) ? row.category : 'birthday',
    year: row.year ?? undefined,
    month: row.month,
    day: row.day,
    lunarIsLeapMonth: row.lunar_is_leap_month === 1,
    repeat: row.repeat,
    note: row.note,
    pinned: row.pinned === 1,
    enabled: row.enabled === 1,
    remindDaysBefore: parseJson<number[]>(row.remind_days_before, [0, 1, 7]),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function jobRunFromRow(row: JobRunRow): JobRun {
  return {
    id: row.id,
    jobName: row.job_name,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    detail: row.detail
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function agentFeedFromRow(row: AgentFeedRow): AgentFeedItem {
  return {
    id: row.id,
    source: row.source,
    cadence: row.cadence as AgentFeedItem['cadence'],
    title: row.title,
    summary: row.summary,
    url: row.url ?? undefined,
    kind: row.kind as AgentFeedItem['kind'],
    confidence: row.confidence,
    relevanceReason: row.relevance_reason,
    topics: parseJson<string[]>(row.topics, []),
    metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
    status: row.status as AgentFeedItem['status'],
    promotedItemId: row.promoted_item_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function preferenceSignalFromRow(row: PreferenceSignalRow): PreferenceSignal {
  return {
    id: row.id,
    signalType: row.signal_type as PreferenceSignal['signalType'],
    signalValue: row.signal_value,
    relatedItemId: row.related_item_id ?? undefined,
    relatedTopicId: row.related_topic_id ?? undefined,
    source: row.source,
    createdAt: row.created_at
  };
}

function devRequestFromRow(row: DevRequestRow): DevRequest {
  return {
    id: row.id,
    text: row.text,
    status: row.status as DevRequest['status'],
    response: row.response,
    branch: row.branch ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function isMissingTableError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('no such table');
}

function isMissingColumnError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('no such column');
}
