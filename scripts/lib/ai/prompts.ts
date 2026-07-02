import type { AgentContext, DiscoveredItem } from '../types';

export type AiSearchResult = {
  items: DiscoveredItem[];
  suggestedSources: Array<{ name: string; kind: string; url: string; reason: string }>;
};

/**
 * Rather than telling the AI where to look, we describe interests, context,
 * and constraints and let it answer from its own knowledge, plus ask it to
 * name sources worth adding to our fetch list.
 */
export function buildTrendPrompt(context: AgentContext): string {
  const interests = context.watchTopics
    .filter((topic) => topic.enabled && topic.mode !== 'blacklist')
    .map((topic) => `- ${topic.name} (priority ${topic.priority}/5, ${topic.category})`)
    .join('\n');

  const naturalLanguage = (context.structuredContext?.interestProfile?.naturalLanguageInputs ?? [])
    .slice(0, 6)
    .map((input) => `- ${input}`)
    .join('\n');

  const avoid = (context.structuredContext?.constraints?.avoidTopics ?? []).join(', ') || 'none';
  const recentTitles = context.recentItems.titles.slice(0, 40).map((title) => `- ${title}`).join('\n');
  const regions = ['Singapore', ...(context.structuredContext ? [] : [])].join(', ');

  return `You are a personal news scout. Based on your knowledge, report current trends, news, and opportunities for this user.

USER PROFILE
Region: ${regions || 'Singapore'} · Languages: English, Simplified Chinese
Interests:
${interests || '- (none configured)'}
${naturalLanguage ? `\nFree-form interest notes:\n${naturalLanguage}` : ''}
Avoid topics: ${avoid}

ALREADY SEEN (do not repeat these stories):
${recentTitles || '- (nothing yet)'}

TASK
1. List up to 8 relevant current trends/news/opportunities you know about. Prefer recent, concrete, actionable items. Chinese-market items are welcome.
2. Only include a "url" if you are confident it is a real, working link; otherwise omit the field entirely.
3. Suggest up to 3 data sources (RSS feeds or news sites) we should monitor for these interests, with working URLs.

Respond with ONLY this JSON shape:
{
  "items": [
    {"title": "...", "summary": "1-2 sentences", "url": "https://... (optional)", "kind": "trend|news|opportunity|insight", "confidence": 0.0-1.0, "topics": ["matched interest names"], "relevanceReason": "why this matters to the user"}
  ],
  "suggestedSources": [
    {"name": "...", "kind": "rss", "url": "https://...", "reason": "..."}
  ]
}`;
}

export function parseAiResponse(text: string, backend: string): AiSearchResult {
  const empty: AiSearchResult = { items: [], suggestedSources: [] };
  const jsonText = extractJson(text);
  if (!jsonText) return empty;

  try {
    const parsed = JSON.parse(jsonText) as {
      items?: Array<Record<string, unknown>>;
      suggestedSources?: Array<Record<string, unknown>>;
    };

    const items: DiscoveredItem[] = (parsed.items ?? [])
      .filter((item) => typeof item.title === 'string' && item.title)
      .slice(0, 10)
      .map((item) => ({
        source: `ai-${backend}`,
        title: String(item.title),
        summary: typeof item.summary === 'string' ? item.summary : '',
        url: typeof item.url === 'string' && item.url.startsWith('http') ? item.url : undefined,
        kind: ['trend', 'news', 'opportunity', 'insight'].includes(String(item.kind)) ? String(item.kind) : 'insight',
        // AI knowledge can be stale or hallucinated; cap its confidence
        confidence: Math.min(0.55, Math.max(0, Number(item.confidence) || 0.45)),
        relevanceReason: typeof item.relevanceReason === 'string' ? item.relevanceReason : `Suggested by ${backend}`,
        topics: Array.isArray(item.topics) ? item.topics.map(String).slice(0, 5) : [],
        metadata: { backend, aiGenerated: true }
      }));

    const suggestedSources = (parsed.suggestedSources ?? [])
      .filter((source) => typeof source.url === 'string' && String(source.url).startsWith('http'))
      .slice(0, 3)
      .map((source) => ({
        name: String(source.name ?? 'unnamed'),
        kind: String(source.kind ?? 'rss'),
        url: String(source.url),
        reason: String(source.reason ?? '')
      }));

    return { items, suggestedSources };
  } catch {
    return empty;
  }
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
