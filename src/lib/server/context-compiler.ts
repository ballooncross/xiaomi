import type { RadarDb } from './db';
import type { AiContextDocument, PreferenceSignal, WatchTopic } from './types';

export async function compileContext(db: RadarDb): Promise<AiContextDocument> {
  const [topics, signals, recentFeedback, agentStats, latestContext] = await Promise.all([
    db.listTopics(),
    db.listPreferenceSignals({ limit: 500 }),
    db.listRecentFeedback(90),
    db.getAgentOutcomeStats(),
    db.getLatestAiContext()
  ]);

  const version = (latestContext?.version ?? 0) + 1;

  const interestProfile = buildInterestProfile(topics, signals, recentFeedback);
  const queryStrategies = buildQueryStrategies(topics, signals, recentFeedback);
  const activeThemes = detectActiveThemes(recentFeedback);
  const sources = buildSourceConfig(recentFeedback, agentStats);
  const constraints = buildConstraints(signals);

  const regionHints = signals
    .filter((s) => s.signalType === 'region_hint')
    .map((s) => s.signalValue);

  const doc: AiContextDocument = {
    version,
    compiledAt: new Date().toISOString(),
    identity: {
      region: 'Singapore',
      additionalRegions: [...new Set(regionHints)],
      languages: ['en', 'zh-CN'],
      timezone: 'Asia/Singapore'
    },
    interestProfile,
    queryStrategies,
    sources,
    constraints,
    activeThemes,
    stats: {
      totalFeedbackEvents: recentFeedback.length,
      totalAgentFeeds: agentStats.total,
      agentSaveRate: agentStats.total > 0 ? agentStats.saved / agentStats.total : 0,
      topPerformingTopics: agentStats.byTopic
        .filter((t) => t.saveRate > 0.3)
        .map((t) => t.topic),
      worstPerformingTopics: agentStats.byTopic
        .filter((t) => t.dismissRate > 0.5)
        .map((t) => t.topic)
    }
  };

  await db.insertAiContextSnapshot(doc);
  return doc;
}

type FeedbackRecord = { itemId: string; action: string; topics: string[]; sourceType: string; createdAt: string };

function buildInterestProfile(
  topics: WatchTopic[],
  signals: PreferenceSignal[],
  feedback: FeedbackRecord[]
): AiContextDocument['interestProfile'] {
  const savesByTopic = new Map<string, number>();
  const dismissesByTopic = new Map<string, number>();

  for (const f of feedback) {
    for (const t of f.topics) {
      if (f.action === 'save' || f.action === 'track' || f.action === 'more_like_this') {
        savesByTopic.set(t, (savesByTopic.get(t) ?? 0) + 1);
      }
      if (f.action === 'not_relevant' || f.action === 'less_like_this') {
        dismissesByTopic.set(t, (dismissesByTopic.get(t) ?? 0) + 1);
      }
    }
  }

  const primary = topics
    .filter((t) => t.enabled && t.mode === 'follow')
    .map((t) => {
      const saves = savesByTopic.get(t.name.toLowerCase()) ?? 0;
      const dismisses = dismissesByTopic.get(t.name.toLowerCase()) ?? 0;
      const engagementBoost = Math.min(0.3, saves * 0.05) - Math.min(0.2, dismisses * 0.05);
      return {
        topic: t.name,
        category: t.category,
        strength: Math.max(0, Math.min(1, t.priority / 5 + engagementBoost)),
        keywords: [t.name, ...t.aliases]
      };
    })
    .sort((a, b) => b.strength - a.strength);

  const knownTopicNames = new Set(topics.map((t) => t.name.toLowerCase()));
  const emergingCounts = new Map<string, number>();
  for (const f of feedback) {
    if (f.action !== 'save' && f.action !== 'track') continue;
    for (const t of f.topics) {
      if (!knownTopicNames.has(t.toLowerCase())) {
        emergingCounts.set(t, (emergingCounts.get(t) ?? 0) + 1);
      }
    }
  }

  const emerging = [...emergingCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([topic, count]) => ({
      topic,
      reason: `Appeared in ${count} saved/tracked items but not a watch topic`,
      suggestedKeywords: [topic]
    }));

  const notInterestedSignals = signals.filter((s) => s.signalType === 'not_interested');
  const declined = notInterestedSignals.map((s) => ({
    topic: s.signalValue,
    reason: `Explicitly marked as not interested (${s.source})`
  }));

  const naturalLanguageInterests = signals
    .filter((s) => s.signalType === 'interest' || s.signalType === 'note' || s.signalType === 'free_text')
    .map((s) => s.signalValue);

  return { primary, emerging, declined, naturalLanguageInputs: naturalLanguageInterests };
}

function buildQueryStrategies(
  topics: WatchTopic[],
  signals: PreferenceSignal[],
  feedback: FeedbackRecord[]
): AiContextDocument['queryStrategies'] {
  const savedSourcesByTopic = new Map<string, Set<string>>();
  for (const f of feedback) {
    if (f.action !== 'save' && f.action !== 'track') continue;
    for (const t of f.topics) {
      if (!savedSourcesByTopic.has(t)) savedSourcesByTopic.set(t, new Set());
      savedSourcesByTopic.get(t)!.add(f.sourceType);
    }
  }

  const notes = signals
    .filter((s) => s.signalType === 'note' || s.signalType === 'interest')
    .reduce((acc, s) => {
      if (s.relatedTopicId) {
        if (!acc.has(s.relatedTopicId)) acc.set(s.relatedTopicId, []);
        acc.get(s.relatedTopicId)!.push(s.signalValue);
      }
      return acc;
    }, new Map<string, string[]>());

  return topics
    .filter((t) => t.enabled && t.mode === 'follow')
    .map((t) => {
      const topicNotes = notes.get(t.id) ?? [];
      const preferredSources = [...(savedSourcesByTopic.get(t.name.toLowerCase()) ?? [])];
      return {
        topic: t.name,
        suggestedQueries: [t.name, ...t.aliases, ...topicNotes],
        preferredSources: preferredSources.length > 0 ? preferredSources : ['google_news', 'gdelt'],
        cadence: t.priority >= 4 ? 'daily' as const : 'weekly' as const
      };
    });
}

function detectActiveThemes(feedback: FeedbackRecord[]): AiContextDocument['activeThemes'] {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recentSaves = feedback.filter(
    (f) => f.createdAt >= sevenDaysAgo && (f.action === 'save' || f.action === 'track')
  );

  const topicCounts = new Map<string, number>();
  for (const f of recentSaves) {
    for (const t of f.topics) {
      topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
    }
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return [...topicCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([theme, count]) => ({
      theme,
      evidence: `${count} saves/tracks in the last 7 days`,
      expiresAt
    }));
}

function buildSourceConfig(
  feedback: FeedbackRecord[],
  agentStats: AgentOutcomeStats
): AiContextDocument['sources'] {
  const sourceSaveCounts = new Map<string, number>();
  const sourceTotalCounts = new Map<string, number>();

  for (const f of feedback) {
    sourceTotalCounts.set(f.sourceType, (sourceTotalCounts.get(f.sourceType) ?? 0) + 1);
    if (f.action === 'save' || f.action === 'track') {
      sourceSaveCounts.set(f.sourceType, (sourceSaveCounts.get(f.sourceType) ?? 0) + 1);
    }
  }

  const active = [...sourceTotalCounts.entries()].map(([type, total]) => ({
    id: type,
    type,
    name: type,
    saveRate: (sourceSaveCounts.get(type) ?? 0) / total
  }));

  const suggested: Array<{ type: string; name: string; reason: string }> = [];
  if (agentStats.total > 0 && agentStats.saved / agentStats.total > 0.2) {
    suggested.push({
      type: 'agent',
      name: 'Expand AI agent searches',
      reason: `Agent items have a ${Math.round((agentStats.saved / agentStats.total) * 100)}% save rate`
    });
  }

  return { active, suggested };
}

function buildConstraints(signals: PreferenceSignal[]): AiContextDocument['constraints'] {
  const avoidTopics = signals
    .filter((s) => s.signalType === 'not_interested')
    .map((s) => s.signalValue);

  return {
    maxItemsPerDay: 30,
    avoidTopics: [...new Set(avoidTopics)],
    avoidSources: [],
    preferredLanguages: ['en', 'zh-CN']
  };
}

type AgentOutcomeStats = {
  total: number;
  saved: number;
  tracked: number;
  dismissed: number;
  ignored: number;
  byTopic: Array<{ topic: string; saveRate: number; dismissRate: number; count: number }>;
  bySource: Record<string, { total: number; saved: number; dismissed: number }>;
};
