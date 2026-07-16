import { config, radarHeaders } from './config';
import { askAi } from './ai/index';
import { log } from './utils';

/**
 * Auto-refine newly added interests.
 *
 * Interests the user types are often long sentences or bundles ("展览礼品节宠物节
 * 等 …coffee festival"). Left as-is they become one broken search query. Each
 * tick we pull interests still marked 'pending', ask the AI to rewrite them into
 * short searchable concepts with bilingual aliases (splitting bundles into
 * several topics), then flip them to 'optimized' so they are never touched again.
 */

type PendingInterest = {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  priority: number;
  type: string;
  mode: string;
};

type Optimization = {
  sourceId: string;
  replacements: Array<{ name: string; aliases: string[]; category: string; priority: number }>;
  drop?: boolean;
};

export async function optimizeInterests(): Promise<void> {
  if (config.aiBackend === 'none') return;

  const pending = await fetchPending();
  if (pending.length === 0) return;
  log(`Interest optimizer: ${pending.length} pending`);

  const text = await askAi(buildPrompt(pending));
  if (!text) {
    log('  Interest optimizer: AI unavailable, will retry next tick');
    return;
  }

  const optimizations = parseOptimizations(text, pending);
  if (optimizations.length === 0) {
    log('  Interest optimizer: no valid refinements parsed');
    return;
  }

  const result = await applyOptimizations(optimizations);
  if (result) {
    log(`  Interest optimizer: ${result.processed} processed, ${result.created} new topics, ${result.dropped} dropped (context v${result.contextVersion})`);
  }
}

async function fetchPending(): Promise<PendingInterest[]> {
  try {
    const response = await fetch(`${config.radarUrl}/api/agent/optimize-interests`, { headers: radarHeaders });
    if (!response.ok) return [];
    const data = (await response.json()) as { pending?: PendingInterest[] };
    return data.pending ?? [];
  } catch (error) {
    log(`Interest optimizer fetch error: ${error}`);
    return [];
  }
}

async function applyOptimizations(
  optimizations: Optimization[]
): Promise<{ processed: number; created: number; dropped: number; contextVersion: number | null } | null> {
  try {
    const response = await fetch(`${config.radarUrl}/api/agent/optimize-interests`, {
      method: 'POST',
      headers: radarHeaders,
      body: JSON.stringify({ optimizations })
    });
    if (!response.ok) {
      log(`  Interest optimizer submit failed: ${response.status}`);
      return null;
    }
    return (await response.json()) as { processed: number; created: number; dropped: number; contextVersion: number | null };
  } catch (error) {
    log(`  Interest optimizer submit error: ${error}`);
    return null;
  }
}

function buildPrompt(pending: PendingInterest[]): string {
  const list = pending
    .map((p) => `- id: ${p.id}\n  text: "${p.name}"\n  current_aliases: ${JSON.stringify(p.aliases)}\n  category: ${p.category}\n  priority: ${p.priority}`)
    .join('\n');

  return `You refine a user's raw "interest" entries into clean, searchable topics for a Singapore-based personal news radar. The user reads English and Simplified Chinese.

For each interest below, rewrite it into one or more concrete topics:
- "name": a SHORT searchable concept (max ~5 words). No sentences, no parentheses, no "(aliases: ...)" text.
- "aliases": array of useful synonyms/translations for searching. Include BOTH an English and a 中文 form when relevant. Keep 2-6 aliases.
- Split bundled interests into SEPARATE topics. Example: "展览礼品节宠物节等 coffee festival" -> three topics (gift fair, pet expo, coffee festival).
- Keep "category" unless clearly wrong (allowed: business, career, life, geopolitics, concerts, general). Keep "priority" (1-5) unless clearly wrong.
- If an entry is NOT a real search topic but a complaint/instruction/feedback (e.g. "too much BYD, reduce it"), set "drop": true and omit replacements.
- Preserve the user's original intent and language mix. Do not invent unrelated topics.

INTERESTS:
${list}

Respond with ONLY this JSON:
{
  "optimizations": [
    { "sourceId": "<id>", "drop": false, "replacements": [
      { "name": "...", "aliases": ["...", "..."], "category": "life", "priority": 4 }
    ] }
  ]
}`;
}

function parseOptimizations(text: string, pending: PendingInterest[]): Optimization[] {
  const jsonText = extractJson(text);
  if (!jsonText) return [];

  const validIds = new Set(pending.map((p) => p.id));
  try {
    const parsed = JSON.parse(jsonText) as { optimizations?: unknown[] };
    const raw = Array.isArray(parsed.optimizations) ? parsed.optimizations : [];
    const result: Optimization[] = [];

    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      const sourceId = typeof record.sourceId === 'string' ? record.sourceId : '';
      if (!validIds.has(sourceId)) continue;

      if (record.drop === true) {
        result.push({ sourceId, replacements: [], drop: true });
        continue;
      }

      const replacements = (Array.isArray(record.replacements) ? record.replacements : [])
        .map((r) => normalizeReplacement(r))
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .slice(0, 6);

      if (replacements.length > 0) result.push({ sourceId, replacements });
    }

    return result;
  } catch {
    return [];
  }
}

const CATEGORIES = new Set(['business', 'career', 'life', 'geopolitics', 'concerts', 'general']);

function normalizeReplacement(
  raw: unknown
): { name: string; aliases: string[]; category: string; priority: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name || name.length > 80) return null;

  const aliases = Array.isArray(record.aliases)
    ? [...new Set(record.aliases.map((a) => String(a).trim()).filter((a) => a && a !== name))].slice(0, 8)
    : [];
  const category = typeof record.category === 'string' && CATEGORIES.has(record.category) ? record.category : 'general';
  const priorityNum = Number(record.priority);
  const priority = Number.isFinite(priorityNum) ? Math.max(1, Math.min(5, Math.round(priorityNum))) : 3;

  return { name, aliases, category, priority };
}

function extractJson(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  if (fenced) return fenced[1];
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return undefined;
}
