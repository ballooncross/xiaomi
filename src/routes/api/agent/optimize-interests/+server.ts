import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { getAdminScopedDb } from '$lib/server/users';
import { compileContext } from '$lib/server/context-compiler';
import type { Env, WatchTopic } from '$lib/server/types';
import type { RequestHandler } from './$types';

/**
 * Interest auto-refinement for the local agent.
 *
 * GET  -> interests still open to optimization (optimize_status = 'pending').
 * POST -> apply the agent's refinements: rewrite the source interest into clean
 *         name + aliases, optionally splitting it into several topics, and flip
 *         every resulting topic to 'optimized' so it is never re-processed.
 */
export const GET: RequestHandler = async ({ request, platform }) => {
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getAdminScopedDb(env);
  const topics = await db.listTopics();
  const pending = topics
    .filter((t) => (t.optimizeStatus ?? 'optimized') === 'pending')
    .map((t) => ({
      id: t.id,
      name: t.name,
      aliases: t.aliases,
      category: t.category,
      priority: t.priority,
      type: t.type,
      mode: t.mode
    }));

  return json({ pending });
};

type Replacement = {
  name?: string;
  aliases?: unknown;
  category?: string;
  priority?: number;
};

type Optimization = {
  sourceId?: string;
  replacements?: Replacement[];
  /** true when the source text was not actually an interest (e.g. feedback). */
  drop?: boolean;
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { optimizations?: Optimization[] };
  const optimizations = body.optimizations ?? [];
  if (optimizations.length === 0) return json({ error: 'no optimizations provided' }, { status: 400 });

  const db = await getAdminScopedDb(env);
  const existing = await db.listTopics();
  const byId = new Map(existing.map((t) => [t.id, t]));

  let processed = 0;
  let created = 0;
  let dropped = 0;

  for (const opt of optimizations) {
    const source = opt.sourceId ? byId.get(opt.sourceId) : undefined;
    if (!source) continue;

    if (opt.drop) {
      await db.deleteTopic(source.id);
      dropped++;
      processed++;
      continue;
    }

    const replacements = (opt.replacements ?? [])
      .map((r) => normalizeReplacement(r, source))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // No usable replacement: just mark it done so we don't keep re-processing.
    if (replacements.length === 0) {
      await db.upsertTopic({ ...source, optimizeStatus: 'optimized' });
      processed++;
      continue;
    }

    const usedIds = new Set<string>();
    for (let i = 0; i < replacements.length; i++) {
      const r = replacements[i];
      // Reuse the source id for the first replacement to preserve history.
      const id = i === 0 ? source.id : uniqueId(source.type, r.name, usedIds, byId);
      usedIds.add(id);
      await db.upsertTopic({
        id,
        type: source.type,
        name: r.name,
        aliases: r.aliases,
        category: r.category,
        priority: r.priority,
        mode: source.mode,
        enabled: source.enabled,
        optimizeStatus: 'optimized'
      });
      if (i > 0) created++;
    }
    processed++;
  }

  // Refresh the compiled snapshot so the change is reflected immediately.
  const doc = await compileContext(db).catch(() => null);

  return json({ ok: true, processed, created, dropped, contextVersion: doc?.version ?? null });
};

function normalizeReplacement(
  r: Replacement,
  source: WatchTopic
): { name: string; aliases: string[]; category: string; priority: number } | null {
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name) return null;
  const aliases = Array.isArray(r.aliases)
    ? [...new Set(r.aliases.map((a) => String(a).trim()).filter((a) => a && a !== name))]
    : [];
  const priority = clampPriority(r.priority ?? source.priority);
  const category = typeof r.category === 'string' && r.category ? r.category : source.category;
  return { name, aliases, category, priority };
}

function uniqueId(
  type: string,
  name: string,
  used: Set<string>,
  existing: Map<string, WatchTopic>
): string {
  const base = `${type}-${slug(name)}`;
  let id = base;
  let n = 2;
  while (used.has(id) || existing.has(id)) {
    id = `${base}-${n++}`;
  }
  return id;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function clampPriority(priority: unknown): number {
  const value = Number(priority ?? 3);
  if (Number.isNaN(value)) return 3;
  return Math.max(1, Math.min(5, Math.round(value)));
}

function isAuthorized(request: Request, env?: Env): boolean {
  if (!env?.ADMIN_TOKEN) return true;
  return request.headers.get('x-admin-token') === env.ADMIN_TOKEN;
}
