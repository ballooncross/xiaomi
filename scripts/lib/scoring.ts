import type { AgentContext, DiscoveredItem } from './types';

/** Rule-based relevance scoring against the user's interest context. */
export function scoreRelevance(item: DiscoveredItem, context: AgentContext): DiscoveredItem {
  const haystack = `${item.title} ${item.summary}`.toLowerCase();

  for (const avoid of context.structuredContext?.constraints?.avoidTopics ?? []) {
    if (haystack.includes(avoid.toLowerCase())) return { ...item, confidence: 0 };
  }

  let confidence = item.confidence;
  const matchedTopics: string[] = [];

  for (const topic of context.watchTopics) {
    if (!topic.enabled || topic.mode === 'blacklist') continue;
    const names = [topic.name, ...topic.aliases].map((name) => name.toLowerCase());
    if (names.some((name) => name && haystack.includes(name))) {
      confidence += 0.1 * (topic.priority / 5);
      matchedTopics.push(topic.name);
    }
  }

  for (const input of context.structuredContext?.interestProfile?.naturalLanguageInputs ?? []) {
    const keywords = input.toLowerCase().split(/\s+/).filter((word) => word.length > 3);
    const matches = keywords.filter((keyword) => haystack.includes(keyword)).length;
    if (matches >= 2) {
      confidence += 0.1;
      matchedTopics.push(input.slice(0, 40));
    }
  }

  for (const high of context.engagementSignals.highEngagement) {
    if (haystack.includes(high.topic.toLowerCase())) confidence += 0.1;
  }
  for (const low of context.engagementSignals.lowEngagement) {
    if (haystack.includes(low.topic.toLowerCase())) confidence -= 0.1;
  }

  if (matchedTopics.length > 0) {
    item.relevanceReason = `Matches: ${matchedTopics.join(', ')}`;
    item.topics = [...new Set([...item.topics, ...matchedTopics])];
  }

  return { ...item, confidence: Math.max(0, Math.min(1, confidence)) };
}
