import { defaultDateReminders, demoItems, defaultWatchTopics } from './seed';
import type { DateReminder, Env, FeedbackAction, JobRun, RadarItem, WatchTopic } from './types';

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
  created_at: string;
  updated_at: string;
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

const memory = {
  topics: [...defaultWatchTopics],
  items: [...demoItems],
  reminders: [...defaultDateReminders],
  feedback: [] as Array<{ id: string; itemId: string; action: FeedbackAction; reason?: string }>,
  jobs: [] as JobRun[]
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
    return [...memory.items].sort((a, b) => b.score - a.score).slice(0, limit);
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
        .prepare('SELECT * FROM items ORDER BY score DESC, COALESCE(starts_at, published_at, created_at) ASC LIMIT ?')
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
          location, starts_at, published_at, artists, topics, raw_json, score, status, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(source_type, external_id) DO UPDATE SET
          title = excluded.title,
          summary = excluded.summary,
          description = excluded.description,
          url = excluded.url,
          image_url = excluded.image_url,
          location = excluded.location,
          starts_at = excluded.starts_at,
          published_at = excluded.published_at,
          artists = excluded.artists,
          topics = excluded.topics,
          raw_json = excluded.raw_json,
          score = excluded.score,
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
          item.status
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
            id, title, calendar_type, year, month, day, lunar_is_leap_month, repeat, note,
            pinned, enabled, remind_days_before, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            calendar_type = excluded.calendar_type,
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

function reminderFromRow(row: ReminderRow): DateReminder {
  return {
    id: row.id,
    title: row.title,
    calendarType: row.calendar_type,
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

function isMissingTableError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('no such table');
}
