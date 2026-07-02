import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { getDb } from '$lib/server/db';
import { mergeLocalEnv } from '$lib/server/env';
import { sortReminders } from '$lib/server/lunar';
import type { DateCategory, DateReminder, Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform }) => {
  const db = getDb(mergeLocalEnv(platform?.env as Env | undefined, privateEnv));
  return json({ reminders: sortReminders(await db.listReminders()) });
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const body = (await request.json()) as Partial<DateReminder>;
  if (!body.title) return json({ error: 'title is required' }, { status: 400 });

  const reminder = reminderFromBody(body);
  const db = getDb(mergeLocalEnv(platform?.env as Env | undefined, privateEnv));
  await db.upsertReminder(reminder);
  return json({ reminder: sortReminders([reminder])[0], reminders: sortReminders(await db.listReminders()) });
};

export const PATCH: RequestHandler = async ({ request, platform }) => {
  const body = (await request.json()) as Partial<DateReminder>;
  if (!body.id || !body.title) return json({ error: 'id and title are required' }, { status: 400 });

  const reminder = reminderFromBody(body);
  const db = getDb(mergeLocalEnv(platform?.env as Env | undefined, privateEnv));
  await db.upsertReminder(reminder);
  return json({ reminder: sortReminders([reminder])[0], reminders: sortReminders(await db.listReminders()) });
};

export const DELETE: RequestHandler = async ({ request, url, platform }) => {
  const body = await parseOptionalJson(request);
  const id = body.id || url.searchParams.get('id') || '';
  if (!id) return json({ error: 'id is required' }, { status: 400 });

  const db = getDb(mergeLocalEnv(platform?.env as Env | undefined, privateEnv));
  await db.deleteReminder(id);
  return json({ ok: true, reminders: sortReminders(await db.listReminders()) });
};

async function parseOptionalJson(request: Request): Promise<{ id?: string }> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return {};
  try {
    return (await request.json()) as { id?: string };
  } catch {
    return {};
  }
}

const validCategories = new Set<DateCategory>(['birthday', 'child_birthday', 'anniversary', 'memorial', 'other']);

function reminderFromBody(body: Partial<DateReminder>): DateReminder {
  const title = String(body.title ?? '').trim();
  const calendarType = body.calendarType === 'gregorian' ? 'gregorian' : 'lunar';
  const month = clamp(Number(body.month ?? 1), 1, 12);
  const day = clamp(Number(body.day ?? 1), 1, 31);
  const category = validCategories.has(body.category as DateCategory) ? body.category as DateCategory : 'birthday';
  return {
    id: body.id || `reminder-${slug(title)}-${crypto.randomUUID().slice(0, 8)}`,
    title,
    calendarType,
    category,
    year: body.year ? Number(body.year) : undefined,
    month,
    day,
    lunarIsLeapMonth: Boolean(body.lunarIsLeapMonth),
    repeat: body.repeat === 'none' ? 'none' : 'annual',
    note: String(body.note ?? '').trim(),
    pinned: Boolean(body.pinned),
    enabled: body.enabled ?? true,
    remindDaysBefore: normalizeReminderDays(body.remindDaysBefore)
  };
}

function normalizeReminderDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [0, 1, 7];
  const days = value.map((day) => clamp(Number(day), 0, 365)).filter((day) => Number.isFinite(day));
  return [...new Set(days)].sort((a, b) => a - b);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
