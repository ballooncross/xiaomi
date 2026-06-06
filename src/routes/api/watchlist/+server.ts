import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import type { Env, WatchTopic } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform }) => {
  const db = getDb(mergeLocalEnv(platform?.env as Env | undefined, privateEnv));
  return json({ topics: await db.listTopics() });
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const body = (await request.json()) as Partial<WatchTopic>;
  if (!body.name || !body.type) return json({ error: 'name and type are required' }, { status: 400 });

  const topic = topicFromBody(body);

  const db = getDb(mergeLocalEnv(platform?.env as Env | undefined, privateEnv));
  await db.upsertTopic(topic);
  return json({ topic });
};

export const PATCH: RequestHandler = async ({ request, platform }) => {
  const body = (await request.json()) as Partial<WatchTopic>;
  if (!body.id || !body.name || !body.type) {
    return json({ error: 'id, name and type are required' }, { status: 400 });
  }

  const topic = topicFromBody(body);
  const db = getDb(mergeLocalEnv(platform?.env as Env | undefined, privateEnv));
  await db.upsertTopic(topic);
  return json({ topic });
};

export const DELETE: RequestHandler = async ({ request, platform }) => {
  const body = (await request.json()) as { id?: string };
  if (!body.id) return json({ error: 'id is required' }, { status: 400 });

  const db = getDb(mergeLocalEnv(platform?.env as Env | undefined, privateEnv));
  await db.deleteTopic(body.id);
  return json({ ok: true });
};

function topicFromBody(body: Partial<WatchTopic>): WatchTopic {
  const name = body.name?.trim() ?? '';
  const type = body.type ?? 'topic';
  return {
    id: body.id || `${type}-${slug(name)}`,
    type,
    name,
    aliases: normalizeAliases(body.aliases),
    category: body.category ?? (type === 'artist' ? 'concerts' : 'general'),
    priority: clampPriority(body.priority),
    mode: body.mode ?? 'follow',
    enabled: body.enabled ?? true
  };
}

function normalizeAliases(aliases: unknown): string[] {
  if (!Array.isArray(aliases)) return [];
  return aliases.map((alias) => String(alias).trim()).filter(Boolean);
}

function clampPriority(priority: unknown): number {
  const value = Number(priority ?? 3);
  if (Number.isNaN(value)) return 3;
  return Math.max(1, Math.min(5, Math.round(value)));
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
