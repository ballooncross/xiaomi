import { buildTemplateDigest } from './digest';
import { fallbackSummary, reasonForItem } from './scoring';
import type { Digest, Env, RadarItem } from './types';

export type AiEnhancement = {
  summary: string;
  reason: string;
  relevance: number;
};

export async function enhanceItemWithAi(env: Env, item: RadarItem): Promise<AiEnhancement> {
  if (!isAiEnabled(env)) return fallbackEnhancement(item);

  const provider = chooseProvider(env);
  if (!provider) return fallbackEnhancement(item);

  try {
    if (provider === 'gemini') return await enhanceWithGemini(env, item);
    if (provider === 'deepseek') return await enhanceWithDeepSeek(env, item);
  } catch {
    const fallbackProvider = env.AI_FALLBACK_PROVIDER;
    if (provider !== 'deepseek' && fallbackProvider === 'deepseek' && env.DEEPSEEK_API_KEY) {
      try {
        return await enhanceWithDeepSeek(env, item);
      } catch {
        return fallbackEnhancement(item);
      }
    }
  }

  return fallbackEnhancement(item);
}

export async function generateDigestWithAi(env: Env, items: RadarItem[]): Promise<Digest> {
  if (!isAiEnabled(env) || !chooseProvider(env)) return buildTemplateDigest(items);
  // MVP keeps digest generation deterministic. Item-level summaries can be AI-enhanced later.
  return buildTemplateDigest(items);
}

function isAiEnabled(env: Env): boolean {
  const enabled = (env.AI_ENABLED ?? 'false').toLowerCase();
  if (enabled === 'false' || enabled === '0' || enabled === 'off') return false;
  return enabled === 'true' || enabled === '1' || enabled === 'auto';
}

function chooseProvider(env: Env): 'gemini' | 'deepseek' | undefined {
  const provider = (env.AI_PROVIDER ?? '').toLowerCase();
  if ((provider === 'gemini' || provider === 'auto') && env.GEMINI_API_KEY) return 'gemini';
  if (provider === 'deepseek' && env.DEEPSEEK_API_KEY) return 'deepseek';
  if ((env.AI_FALLBACK_PROVIDER ?? '').toLowerCase() === 'deepseek' && env.DEEPSEEK_API_KEY) return 'deepseek';
  return undefined;
}

async function enhanceWithGemini(env: Env, item: RadarItem): Promise<AiEnhancement> {
  const model = env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const prompt = enhancementPrompt(item);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    }
  );
  if (!response.ok) throw new Error(`Gemini failed: ${response.status}`);
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return parseEnhancement(data.candidates?.[0]?.content?.parts?.[0]?.text, item);
}

async function enhanceWithDeepSeek(env: Env, item: RadarItem): Promise<AiEnhancement> {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Return compact JSON only.' },
        { role: 'user', content: enhancementPrompt(item) }
      ]
    })
  });
  if (!response.ok) throw new Error(`DeepSeek failed: ${response.status}`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return parseEnhancement(data.choices?.[0]?.message?.content, item);
}

function enhancementPrompt(item: RadarItem): string {
  return JSON.stringify({
    task: 'Summarize and score this personal radar item for a Singapore-based user.',
    output: {
      summary: 'one short sentence',
      reason: 'one short reason it matters to the user',
      relevance: 'integer 0-100'
    },
    item: {
      kind: item.kind,
      title: item.title,
      description: item.description,
      location: item.location,
      artists: item.artists,
      topics: item.topics
    }
  });
}

function parseEnhancement(text: string | undefined, item: RadarItem): AiEnhancement {
  if (!text) return fallbackEnhancement(item);
  try {
    const parsed = JSON.parse(text) as Partial<AiEnhancement>;
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : fallbackSummary(item),
      reason: typeof parsed.reason === 'string' ? parsed.reason : reasonForItem(item),
      relevance: typeof parsed.relevance === 'number' ? Math.max(0, Math.min(100, parsed.relevance)) : item.score
    };
  } catch {
    return fallbackEnhancement(item);
  }
}

function fallbackEnhancement(item: RadarItem): AiEnhancement {
  return {
    summary: fallbackSummary(item),
    reason: reasonForItem(item),
    relevance: item.score
  };
}
