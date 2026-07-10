import type { DedupExisting, MergeAction } from './dedup';
import { MAX_TREND_AGE_DAYS } from './scoring';
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

type AgentOutcomeRow = {
  agent_feed_id: string;
  outcome: string;
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
  type: WatchTopic['type'];
  name: string;
  aliases: string;
  category: string;
  priority: number;
  mode?: WatchTopic['mode'];
  enabled: number;
  created_at: string;
  updated_at: string;
};

type ReminderRow = {
  id: string;
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

const memory = {
  topics: [...defaultWatchTopics],
  items: [...demoItems],
  reminders: [...defaultDateReminders],
  feedback: [] as Array<{ id: string; itemId: string; action: FeedbackAction; reason?: string }>,
  jobs: [] as JobRun[],
  agentFeeds: [] as AgentFeedItem[],
  preferenceSignals: [] as PreferenceSignal[],
  aiContextSnapshots: [] as (AiContextDocument & { id: string })[],
  agentOutcomes: [] as Array<{ id: string; agentFeedId: string; outcome: string; createdAt: string }>,
  impressions: [] as Array<{ id: string; itemId: string; impressionType: string; createdAt: string }>,
  devRequests: [] as DevRequest[]
};

export function getDb(env?: Env): RadarDb {
  if (env?.DB) return new D1RadarDb(env.DB);
  return new MemoryRadarDb();
}

export abstract class RadarDb {
  abstract listTopics(): Promise<WatchTopic[]>;
  abstract upsertTopic(topic: WatchTopic): Promise<void>;
  abstract deleteTopic(topicId: string): Promise<void>;
  abstract listItems(limit?: number): Promise<RadarItem[]>;
  abstract upsertItem(item: RadarItem): Promise<'inserted' | 'updated'>;
  abstract listReminders(): Promise<DateReminder[]>;
  abstract upsertReminder(reminder: DateReminder): Promise<void>;
  abstract deleteReminder(reminderId: string): Promise<void>;
  abstract recordFeedback(itemId: string, action: FeedbackAction, reason?: string): Promise<void>;
  abstract updateItemStatus(itemId: string, status: RadarItem['status']): Promise<void>;
  abstract logNotification(input: { itemId?: string; channel: string; type: string; status: string; message: string }): Promise<void>;
  abstract logJob(input: { jobName: string; status: string; detail: string }): Promise<void>;
  abstract listJobRuns(jobName: string, limit?: number): Promise<JobRun[]>;

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
  async listTopics(): Promise<WatchTopic[]> {
    return memory.topics.filter((topic) => topic.enabled);
  }

  async upsertTopic(topic: WatchTopic): Promise<void> {
    const index = memory.topics.findIndex((existing) => existing.id === topic.id);
    if (index >= 0) memory.topics[index] = topic;
    else memory.topics.push(topic);
  }

  async deleteTopic(topicId: string): Promise<void> {
    const index = memory.topics.findIndex((topic) => topic.id === topicId);
    if (index >= 0) memory.topics[index] = { ...memory.topics[index], enabled: false, updatedAt: new Date().toISOString() };
  }

  async listItems(limit = 30): Promise<RadarItem[]> {
    const cutoff = Date.now() - MAX_TREND_AGE_DAYS * 24 * 60 * 60 * 1000;
    return [...memory.items]
      .filter((item) => {
        if (item.status === 'dismissed' || item.status === 'viewed') return false;
        if (item.status === 'saved' || item.status === 'tracking') return true;
        if (item.startsAt && new Date(item.startsAt).getTime() > Date.now()) return true;
        const date = new Date(item.publishedAt ?? item.createdAt ?? 0).getTime();
        return date > cutoff;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async upsertItem(item: RadarItem): Promise<'inserted' | 'updated'> {
    const index = memory.items.findIndex(
      (existing) => existing.sourceType === item.sourceType && existing.externalId === item.externalId
    );
    if (index >= 0) {
      memory.items[index] = { ...memory.items[index], ...item, updatedAt: new Date().toISOString() };
      return 'updated';
    }
    memory.items.push(item);
    return 'inserted';
  }

  async listReminders(): Promise<DateReminder[]> {
    return memory.reminders.filter((reminder) => reminder.enabled);
  }

  async upsertReminder(reminder: DateReminder): Promise<void> {
    const index = memory.reminders.findIndex((existing) => existing.id === reminder.id);
    if (index >= 0) memory.reminders[index] = { ...reminder, updatedAt: new Date().toISOString() };
    else memory.reminders.push(reminder);
  }

  async deleteReminder(reminderId: string): Promise<void> {
    const index = memory.reminders.findIndex((reminder) => reminder.id === reminderId);
    if (index >= 0) memory.reminders[index] = { ...memory.reminders[index], enabled: false, updatedAt: new Date().toISOString() };
  }

  async recordFeedback(itemId: string, action: FeedbackAction, reason?: string): Promise<void> {
    memory.feedback.push({ id: crypto.randomUUID(), itemId, action, reason });
    if (action === 'save') await this.updateItemStatus(itemId, 'saved');
    if (action === 'track') await this.updateItemStatus(itemId, 'tracking');
    if (action === 'not_relevant' || action === 'less_like_this') await this.updateItemStatus(itemId, 'dismissed');
    if (action === 'viewed') await this.updateItemStatus(itemId, 'viewed');
  }

  async updateItemStatus(itemId: string, status: RadarItem['status']): Promise<void> {
    const item = memory.items.find((candidate) => candidate.id === itemId);
    if (item) item.status = status;
  }

  async logNotification(): Promise<void> {
    return;
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
    memory.preferenceSignals.push(signal);
  }

  async listPreferenceSignals(options?: { since?: string; type?: string; limit?: number }): Promise<PreferenceSignal[]> {
    let signals = [...memory.preferenceSignals];
    if (options?.since) signals = signals.filter((s) => (s.createdAt ?? '') >= options.since!);
    if (options?.type) signals = signals.filter((s) => s.signalType === options.type);
    return signals.slice(0, options?.limit ?? 500);
  }

  async insertAiContextSnapshot(doc: AiContextDocument): Promise<void> {
    memory.aiContextSnapshots.push({ ...doc, id: crypto.randomUUID() });
  }

  async getLatestAiContext(): Promise<AiContextDocument | null> {
    if (memory.aiContextSnapshots.length === 0) return null;
    return memory.aiContextSnapshots[memory.aiContextSnapshots.length - 1];
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
    return memory.feedback
      .filter(() => true)
      .map((f) => {
        const item = memory.items.find((i) => i.id === f.itemId);
        return { itemId: f.itemId, action: f.action, topics: item?.topics ?? [], sourceType: item?.sourceType ?? '', createdAt: cutoff };
      });
  }

  async recordImpressions(itemIds: string[]): Promise<void> {
    const now = new Date().toISOString();
    for (const itemId of itemIds) {
      memory.impressions.push({ id: crypto.randomUUID(), itemId, impressionType: 'feed', createdAt: now });
    }
  }

  async getImpressionCounts(itemIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const id of itemIds) {
      counts.set(id, memory.impressions.filter((i) => i.itemId === id).length);
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
  constructor(private readonly db: D1Database) {
    super();
  }

  async listTopics(): Promise<WatchTopic[]> {
    try {
      const { results } = await this.db
        .prepare('SELECT * FROM watch_topics WHERE enabled = 1 ORDER BY priority DESC, name ASC')
        .all<TopicRow>();
      return results.map(topicFromRow);
    } catch (error) {
      if (isMissingTableError(error)) return defaultWatchTopics;
      throw error;
    }
  }

  async upsertTopic(topic: WatchTopic): Promise<void> {
    try {
      await this.db
        .prepare(
          `INSERT INTO watch_topics (id, type, name, aliases, category, priority, mode, enabled, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           type = excluded.type,
           name = excluded.name,
           aliases = excluded.aliases,
           category = excluded.category,
           priority = excluded.priority,
           mode = excluded.mode,
           enabled = excluded.enabled,
           updated_at = CURRENT_TIMESTAMP`
        )
        .bind(
          topic.id,
          topic.type,
          topic.name,
          JSON.stringify(topic.aliases),
          topic.category,
          topic.priority,
          topic.mode,
          topic.enabled ? 1 : 0
        )
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb().upsertTopic(topic);
      throw error;
    }
  }

  async deleteTopic(topicId: string): Promise<void> {
    try {
      await this.db
        .prepare('UPDATE watch_topics SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(topicId)
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb().deleteTopic(topicId);
      throw error;
    }
  }

  async listItems(limit = 30): Promise<RadarItem[]> {
    try {
      const { results } = await this.db
        .prepare(`SELECT * FROM items WHERE status NOT IN ('dismissed', 'viewed')
           AND (
             status IN ('saved', 'tracking')
             OR (starts_at IS NOT NULL AND starts_at > datetime('now'))
             OR COALESCE(published_at, created_at) > datetime('now', '-${MAX_TREND_AGE_DAYS} days')
           )
           ORDER BY score DESC, COALESCE(starts_at, published_at, created_at) ASC LIMIT ?`)
        .bind(limit)
        .all<ItemRow>();
      return results.map(itemFromRow);
    } catch (error) {
      if (isMissingTableError(error)) return demoItems.slice(0, limit);
      throw error;
    }
  }

  async upsertItem(item: RadarItem): Promise<'inserted' | 'updated'> {
    try {
      const existing = await this.db
        .prepare('SELECT id FROM items WHERE source_type = ? AND external_id = ?')
        .bind(item.sourceType, item.externalId)
        .first<{ id: string }>();

      await this.db
        .prepare(
          `INSERT INTO items (
          id, source_id, source_type, external_id, kind, title, summary, description, url, image_url,
          location, starts_at, published_at, artists, topics, raw_json, score, status, related_sources, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
          item.status,
          JSON.stringify(item.relatedSources ?? [])
        )
        .run();

      return existing ? 'updated' : 'inserted';
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb().upsertItem(item);
      throw error;
    }
  }

  async listReminders(): Promise<DateReminder[]> {
    try {
      const { results } = await this.db
        .prepare('SELECT * FROM date_reminders WHERE enabled = 1 ORDER BY pinned DESC, title ASC')
        .all<ReminderRow>();
      return results.map(reminderFromRow);
    } catch (error) {
      if (isMissingTableError(error)) return defaultDateReminders;
      throw error;
    }
  }

  async upsertReminder(reminder: DateReminder): Promise<void> {
    try {
      await this.db
        .prepare(
          `INSERT INTO date_reminders (
            id, title, calendar_type, category, year, month, day, lunar_is_leap_month, repeat, note,
            pinned, enabled, remind_days_before, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
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
      if (isMissingTableError(error)) return new MemoryRadarDb().upsertReminder(reminder);
      throw error;
    }
  }

  async deleteReminder(reminderId: string): Promise<void> {
    try {
      await this.db
        .prepare('UPDATE date_reminders SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(reminderId)
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb().deleteReminder(reminderId);
      throw error;
    }
  }

  async recordFeedback(itemId: string, action: FeedbackAction, reason?: string): Promise<void> {
    try {
      await this.db
        .prepare('INSERT INTO feedback_events (id, item_id, action, reason) VALUES (?, ?, ?, ?)')
        .bind(crypto.randomUUID(), itemId, action, reason ?? null)
        .run();

      if (action === 'save') await this.updateItemStatus(itemId, 'saved');
      if (action === 'track') await this.updateItemStatus(itemId, 'tracking');
      if (action === 'not_relevant' || action === 'less_like_this') await this.updateItemStatus(itemId, 'dismissed');
      if (action === 'viewed') await this.updateItemStatus(itemId, 'viewed');

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
      if (isMissingTableError(error)) return new MemoryRadarDb().recordFeedback(itemId, action, reason);
      throw error;
    }
  }

  async updateItemStatus(itemId: string, status: RadarItem['status']): Promise<void> {
    try {
      await this.db
        .prepare('UPDATE items SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(status, itemId)
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb().updateItemStatus(itemId, status);
      throw error;
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
      if (isMissingTableError(error)) return new MemoryRadarDb().insertAgentFeed(feed);
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
      const stmt = this.db.prepare(sql);
      const { results } = await (binds.length === 1 ? stmt.bind(binds[0]) : stmt.bind(...binds)).all<AgentFeedRow>();
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
          `INSERT INTO preference_signals (id, signal_type, signal_value, related_item_id, related_topic_id, source)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(signal.id, signal.signalType, signal.signalValue, signal.relatedItemId ?? null, signal.relatedTopicId ?? null, signal.source)
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb().insertPreferenceSignal(signal);
      throw error;
    }
  }

  async listPreferenceSignals(options?: { since?: string; type?: string; limit?: number }): Promise<PreferenceSignal[]> {
    try {
      let sql = 'SELECT * FROM preference_signals WHERE 1=1';
      const binds: unknown[] = [];
      if (options?.since) { sql += ' AND created_at >= ?'; binds.push(options.since); }
      if (options?.type) { sql += ' AND signal_type = ?'; binds.push(options.type); }
      sql += ' ORDER BY created_at DESC LIMIT ?';
      binds.push(options?.limit ?? 500);
      const stmt = this.db.prepare(sql);
      const { results } = await (binds.length === 1 ? stmt.bind(binds[0]) : stmt.bind(...binds)).all<PreferenceSignalRow>();
      return results.map(preferenceSignalFromRow);
    } catch (error) {
      if (isMissingTableError(error)) return [];
      throw error;
    }
  }

  async insertAiContextSnapshot(doc: AiContextDocument): Promise<void> {
    try {
      const signalCount = await this.db
        .prepare('SELECT COUNT(*) as cnt FROM preference_signals')
        .first<{ cnt: number }>()
        .then((r) => r?.cnt ?? 0);

      await this.db
        .prepare(
          `INSERT INTO ai_context_snapshots (id, version, context_json, compiled_from, signal_count)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(), doc.version, JSON.stringify(doc),
          `${doc.interestProfile.primary.length} topics, ${doc.stats.totalFeedbackEvents} feedback events`,
          signalCount
        )
        .run();

      // Keep only the last 10 snapshots
      await this.db
        .prepare('DELETE FROM ai_context_snapshots WHERE id NOT IN (SELECT id FROM ai_context_snapshots ORDER BY version DESC LIMIT 10)')
        .run();
    } catch (error) {
      if (isMissingTableError(error)) return new MemoryRadarDb().insertAiContextSnapshot(doc);
      throw error;
    }
  }

  async getLatestAiContext(): Promise<AiContextDocument | null> {
    try {
      const row = await this.db
        .prepare('SELECT * FROM ai_context_snapshots ORDER BY version DESC LIMIT 1')
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
      const { results: outcomes } = await this.db
        .prepare('SELECT agent_feed_id, outcome FROM agent_suggestion_outcomes')
        .all<AgentOutcomeRow>();

      const stats: AgentOutcomeStats = {
        total: outcomes.length,
        saved: outcomes.filter((o) => o.outcome === 'saved').length,
        tracked: outcomes.filter((o) => o.outcome === 'tracked').length,
        dismissed: outcomes.filter((o) => o.outcome === 'dismissed').length,
        ignored: outcomes.filter((o) => o.outcome === 'ignored').length,
        byTopic: [],
        bySource: {}
      };

      // Compute by-source stats
      const feedIds = [...new Set(outcomes.map((o) => o.agent_feed_id))];
      if (feedIds.length > 0) {
        const placeholders = feedIds.map(() => '?').join(',');
        const { results: feeds } = await this.db
          .prepare(`SELECT id, source, topics FROM agent_feeds WHERE id IN (${placeholders})`)
          .bind(...feedIds)
          .all<{ id: string; source: string; topics: string }>();

        const feedMap = new Map(feeds.map((f) => [f.id, f]));
        const bySource: Record<string, { total: number; saved: number; dismissed: number }> = {};
        const byTopic: Record<string, { total: number; saved: number; dismissed: number }> = {};

        for (const o of outcomes) {
          const feed = feedMap.get(o.agent_feed_id);
          if (!feed) continue;

          if (!bySource[feed.source]) bySource[feed.source] = { total: 0, saved: 0, dismissed: 0 };
          bySource[feed.source].total++;
          if (o.outcome === 'saved') bySource[feed.source].saved++;
          if (o.outcome === 'dismissed') bySource[feed.source].dismissed++;

          const topics = parseJson<string[]>(feed.topics, []);
          for (const t of topics) {
            if (!byTopic[t]) byTopic[t] = { total: 0, saved: 0, dismissed: 0 };
            byTopic[t].total++;
            if (o.outcome === 'saved') byTopic[t].saved++;
            if (o.outcome === 'dismissed') byTopic[t].dismissed++;
          }
        }

        stats.bySource = bySource;
        stats.byTopic = Object.entries(byTopic).map(([topic, s]) => ({
          topic,
          saveRate: s.total > 0 ? s.saved / s.total : 0,
          dismissRate: s.total > 0 ? s.dismissed / s.total : 0,
          count: s.total
        }));
      }

      return stats;
    } catch (error) {
      if (isMissingTableError(error)) return { total: 0, saved: 0, tracked: 0, dismissed: 0, ignored: 0, byTopic: [], bySource: {} };
      throw error;
    }
  }

  async listRecentFeedback(days: number): Promise<Array<{ itemId: string; action: string; topics: string[]; sourceType: string; createdAt: string }>> {
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { results } = await this.db
        .prepare(
          `SELECT f.item_id, f.action, i.topics, i.source_type, f.created_at
           FROM feedback_events f
           LEFT JOIN items i ON f.item_id = i.id
           WHERE f.created_at >= ?
           ORDER BY f.created_at DESC`
        )
        .bind(cutoff)
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
    try {
      const batch = itemIds.map((id) =>
        this.db
          .prepare('INSERT INTO item_impressions (id, item_id, impression_type) VALUES (?, ?, ?)')
          .bind(crypto.randomUUID(), id, impressionType)
      );
      if (batch.length > 0) await this.db.batch(batch);
    } catch (error) {
      if (isMissingTableError(error)) return;
      throw error;
    }
  }

  async getImpressionCounts(itemIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (itemIds.length === 0) return counts;
    try {
      const placeholders = itemIds.map(() => '?').join(',');
      const { results } = await this.db
        .prepare(`SELECT item_id, COUNT(*) as cnt FROM item_impressions WHERE item_id IN (${placeholders}) GROUP BY item_id`)
        .bind(...itemIds)
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
          `SELECT id, title, url, image_url, summary, score, related_sources, created_at
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
      if (isMissingTableError(error)) return new MemoryRadarDb().insertDevRequest(request);
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
      const stmt = this.db.prepare(sql);
      const { results } = await (binds.length === 1 ? stmt.bind(binds[0]) : stmt.bind(...binds)).all<DevRequestRow>();
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
      if (isMissingTableError(error)) return new MemoryRadarDb().getItemById(itemId);
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
