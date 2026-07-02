export type AgentContext = {
  watchTopics: Array<{
    id: string;
    name: string;
    aliases: string[];
    category: string;
    priority: number;
    mode: string;
    enabled: boolean;
  }>;
  recentItems: { titles: string[]; urls: string[]; externalIds: string[] };
  preferenceSignals: Array<{ signalType: string; signalValue: string; createdAt?: string }>;
  structuredContext: {
    version?: number;
    interestProfile?: {
      primary: Array<{ topic: string; keywords: string[]; strength: number }>;
      emerging: Array<{ topic: string; suggestedKeywords: string[] }>;
      declined: Array<{ topic: string }>;
      naturalLanguageInputs: string[];
    };
    queryStrategies?: Array<{ topic: string; suggestedQueries: string[]; cadence: string; followUp?: boolean }>;
    tracking?: Array<{
      itemId: string;
      title: string;
      query: string;
      topics: string[];
      url?: string;
      trackedSince?: string;
    }>;
    sources?: {
      active: Array<{ id: string; type: string; name: string }>;
      suggested: Array<{ type: string; name: string; reason: string; config?: unknown }>;
    };
    constraints?: { avoidTopics: string[] };
    activeThemes?: Array<{ theme: string }>;
  } | null;
  engagementSignals: {
    highEngagement: Array<{ topic: string; saveRate: number }>;
    lowEngagement: Array<{ topic: string; dismissRate: number }>;
  };
  lastContextVersion: number;
};

export type DiscoveredItem = {
  source: string;
  title: string;
  summary: string;
  url?: string;
  imageUrl?: string;
  kind: string;
  confidence: number;
  relevanceReason: string;
  topics: string[];
  metadata: Record<string, unknown>;
};

export type ScanTier = 'skip' | 'targeted' | 'full' | 'deep';

export type SearchQuery = {
  query: string;
  topic: string;
  category: string;
  lang: 'en' | 'zh';
};

/**
 * A source is data, not code. New sources learned by the AI over time are
 * merged in as additional config rows; the generic fetch engine executes them.
 */
export type SourceConfig = {
  id: string;
  kind: 'rss' | 'json';
  /** May contain {query}; such sources only run with a query. */
  url: string;
  lang: 'en' | 'zh' | 'any';
  /** json only: dot-path to the item array, e.g. "data.realtime" */
  itemsPath?: string;
  /** json only: dot-paths into each entry */
  fields?: { title: string; url?: string; summary?: string; id?: string };
  /** json only: build the link from extracted fields, e.g. "https://x/{id}" */
  urlTemplate?: string;
  /** rss without {query}: keep only entries matching the query terms */
  filterByQuery?: boolean;
  maxItems?: number;
  baseConfidence?: number;
  /** which scan tiers this source runs on */
  tiers: ScanTier[];
};

export type AgentSignal = { type: string; value: string; source: string };
