import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { getDb } from '$lib/server/db';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, platform }) => {
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb(env);

  const [topics, recentFeedback, signals, agentStats, latestContext, recentItems, lastFetchJobs] = await Promise.all([
    db.listTopics(),
    db.listRecentFeedback(30),
    db.listPreferenceSignals({ limit: 200 }),
    db.getAgentOutcomeStats(),
    db.getLatestAiContext(),
    db.getRecentItemSummaries(7),
    db.listJobRuns('all-fetch', 1),
  ]);

  // Compute feedback patterns
  const savedTopics = new Set<string>();
  const dismissedTopics = new Set<string>();
  const kindCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};

  for (const f of recentFeedback) {
    if (f.action === 'save' || f.action === 'track' || f.action === 'more_like_this') {
      for (const t of f.topics) savedTopics.add(t);
    }
    if (f.action === 'not_relevant' || f.action === 'less_like_this') {
      for (const t of f.topics) dismissedTopics.add(t);
    }
  }

  // Engagement signals
  const topicEngagement: Record<string, { saves: number; dismisses: number; total: number }> = {};
  for (const f of recentFeedback) {
    for (const t of f.topics) {
      if (!topicEngagement[t]) topicEngagement[t] = { saves: 0, dismisses: 0, total: 0 };
      topicEngagement[t].total++;
      if (f.action === 'save' || f.action === 'track') topicEngagement[t].saves++;
      if (f.action === 'not_relevant') topicEngagement[t].dismisses++;
    }
  }

  const highEngagement = Object.entries(topicEngagement)
    .filter(([, e]) => e.total >= 3 && e.saves / e.total > 0.3)
    .map(([topic, e]) => ({ topic, saveRate: e.saves / e.total, count: e.total }));

  const lowEngagement = Object.entries(topicEngagement)
    .filter(([, e]) => e.total >= 3 && e.dismisses / e.total > 0.5)
    .map(([topic, e]) => ({ topic, dismissRate: e.dismisses / e.total, count: e.total }));

  return json({
    watchTopics: topics,
    recentFeedback: recentFeedback.slice(0, 50),
    feedbackPatterns: {
      savedTopics: [...savedTopics],
      dismissedTopics: [...dismissedTopics],
    },
    recentItems: {
      titles: recentItems.map((i) => i.title),
      urls: recentItems.filter((i) => i.url).map((i) => i.url),
      externalIds: recentItems.map((i) => i.externalId),
    },
    engagementSignals: {
      highEngagement,
      lowEngagement,
    },
    preferenceSignals: signals,
    structuredContext: latestContext,
    lastContextVersion: latestContext?.version ?? 0,
    fetchedSources: {
      lastFetchAt: lastFetchJobs[0]?.finishedAt ?? null,
    },
    agentStats,
  });
};

function isAuthorized(request: Request, env?: Env): boolean {
  if (!env?.ADMIN_TOKEN) return true;
  return request.headers.get('x-admin-token') === env.ADMIN_TOKEN;
}
