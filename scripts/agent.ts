#!/usr/bin/env npx tsx
/**
 * Local AI agent for Personal Radar.
 *
 * Every 10 minutes: pull context from the radar, decide a scan tier based on
 * what changed (see lib/state.ts), search sources (lib/sources.ts data configs
 * run through lib/fetch-engine.ts) plus the configured AI backend's own
 * knowledge (lib/ai), score, and feed discoveries back to the radar.
 *
 * Usage:
 *   npx tsx scripts/agent.ts             # loop every 10 minutes
 *   npx tsx scripts/agent.ts --once      # single tick
 *   npx tsx scripts/agent.ts --dry-run   # search but do not submit
 *
 * Config lives in scripts/.env (see .env.example).
 */

import { runAiSearch } from './lib/ai/index';
import { config } from './lib/config';
import { processDevRequests } from './lib/dev-agent';
import { optimizeInterests } from './lib/optimize-interests';
import { hydrateImageForUrl } from './lib/images';
import { runSource } from './lib/fetch-engine';
import { fetchContext, reportAgentStatus, submitFeeds, submitSignals } from './lib/radar-api';
import { scoreRelevance } from './lib/scoring';
import { buildQueries, mergeLearnedSources, seedSources, sourcesForTier } from './lib/sources';
import { decideScanTier, loadState, saveState, updateStateAfterScan } from './lib/state';
import { log } from './lib/utils';
import type { AgentContext, AgentSignal, DiscoveredItem, ScanTier } from './lib/types';
import type { ScanDecision } from './lib/state';

async function main() {
  log('Personal Radar Agent starting');
  log(`  Radar: ${config.radarUrl}`);
  log(`  Mode: ${config.dryRun ? 'dry-run' : 'live'}, ${config.once ? 'single run' : `loop every ${config.pollIntervalMs / 60000}min`}`);
  log(`  AI backend: ${config.aiBackend}`);
  if (!config.radarToken) log('WARNING: No RADAR_TOKEN set. API calls may fail with 401.');

  await runGuardedTick();

  if (!config.once) {
    log(`Next check in ${config.pollIntervalMs / 60000} minutes...`);
    setInterval(async () => {
      await runGuardedTick();
      log(`Next check in ${config.pollIntervalMs / 60000} minutes...`);
    }, config.pollIntervalMs);
  }
}

let tickCount = 0;

type TickOutcome = {
  status: 'ok' | 'error';
  detail: string;
};

/**
 * Run one tick with a hard time budget. A tick that hangs (e.g. a wedged
 * network call) must never block future ticks — the whole reason the agent
 * previously went silent for hours. The watchdog is shorter than the poll
 * interval so the next scheduled tick always gets a clean slate.
 */
async function runGuardedTick(): Promise<void> {
  const budgetMs = Math.max(60000, config.pollIntervalMs - 60000);
  const currentTick = ++tickCount;
  const startedAt = Date.now();
  log(`Heartbeat: tick #${currentTick} starting (budget ${Math.round(budgetMs / 1000)}s)`);
  await reportAgentStatus('running', `第 ${currentTick} 次轮询正在处理。`);
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    const outcome = await Promise.race([
      tick(),
      new Promise<never>((_, reject) => {
        watchdog = setTimeout(() => reject(new Error(`tick exceeded ${budgetMs}ms budget`)), budgetMs);
      })
    ]);
    const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
    await reportAgentStatus(outcome.status, `第 ${currentTick} 次轮询完成，耗时 ${durationSeconds} 秒。${outcome.detail}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    log(`ERROR in tick #${currentTick}: ${detail}`);
    await reportAgentStatus('error', `第 ${currentTick} 次轮询失败：${detail}`);
  } finally {
    if (watchdog) clearTimeout(watchdog);
  }
}

async function tick(): Promise<TickOutcome> {
  const state = loadState();
  const context = await fetchContext();
  if (!context) {
    throw new Error('无法获取 Radar 上下文');
  }

  const errors: string[] = [];

  // Process pending dev requests every tick, regardless of scan tier
  try {
    await processDevRequests();
  } catch (error) {
    log(`Dev request error: ${error}`);
    errors.push(`开发请求处理失败：${error instanceof Error ? error.message : String(error)}`);
  }

  // Refine newly added interests into clean, searchable topics (once each)
  try {
    await optimizeInterests();
  } catch (error) {
    log(`Interest optimizer error: ${error}`);
    errors.push(`兴趣优化失败：${error instanceof Error ? error.message : String(error)}`);
  }

  const decision = decideScanTier(state, context);
  log(`Decision: ${decision.tier.toUpperCase()} (${decision.reason})`);
  if (decision.tier === 'skip') return finishTick(`无需扫描：${decision.reason}。`, errors);

  const items = await runScan(context, decision);
  log(`Found ${items.length} relevant items`);

  const maxItems =
    decision.tier === 'targeted' ? config.maxItemsTargeted : decision.tier === 'full' ? config.maxItemsFull : config.maxItemsDeep;
  items.sort((a, b) => b.confidence - a.confidence);
  const toSubmit = items.slice(0, maxItems);
  let submissionDetail = '';

  // Hydrate images locally (works from Mac; fails on Cloudflare Workers)
  let hydrated = 0;
  for (const item of toSubmit) {
    if (item.url && !item.imageUrl && hydrated < 6) {
      hydrated++;
      try {
        const { imageUrl, resolvedUrl } = await hydrateImageForUrl(item.url);
        if (imageUrl) item.imageUrl = imageUrl;
        if (resolvedUrl && resolvedUrl !== item.url) item.url = resolvedUrl;
      } catch { /* skip */ }
    }
  }
  if (hydrated > 0) log(`Hydrated images for ${hydrated} items`);

  if (toSubmit.length === 0) {
    log('No new items to submit.');
    submissionDetail = '没有需要提交的新内容。';
  } else if (config.dryRun) {
    log('DRY RUN, would submit:');
    for (const item of toSubmit) {
      log(`  [${item.confidence.toFixed(2)}] [${item.source}] ${item.title}`);
    }
    submissionDetail = `试运行检查了 ${toSubmit.length} 条待提交内容。`;
  } else {
    const result = await submitFeeds(toSubmit);
    log(`Submitted: ${result.accepted} accepted, ${result.duplicates} dupes, ${result.promoted} promoted, ${result.merged ?? 0} merged`);
    submissionDetail = `提交 ${result.accepted} 条，去重 ${result.duplicates} 条，展示 ${result.promoted} 条。`;
  }

  saveState(updateStateAfterScan(state, context, decision.tier));
  log(`State saved (run #${state.runCount + 1})`);
  return finishTick(`${decision.tier.toUpperCase()} 扫描发现 ${items.length} 条相关内容。${submissionDetail}`, errors);
}

function finishTick(detail: string, errors: string[]): TickOutcome {
  if (errors.length === 0) return { status: 'ok', detail };
  return { status: 'error', detail: `${detail} 错误：${errors.join('；')}` };
}

async function runScan(context: AgentContext, decision: ScanDecision): Promise<DiscoveredItem[]> {
  const sources = mergeLearnedSources(seedSources, context);
  const { queryDriven, standalone } = sourcesForTier(sources, decision.tier);
  const queries = buildQueries(context, decision.tier, decision.changedTopics);
  log(`Scan plan: ${queries.length} queries x ${queryDriven.length} query sources + ${standalone.length} standalone${useAi(decision.tier) ? ' + AI search' : ''}`);

  const collected: DiscoveredItem[] = [];
  const seenUrls = new Set(context.recentItems.urls);
  const seenTitles = new Set(context.recentItems.titles.map((title) => title.toLowerCase()));

  const consider = (item: DiscoveredItem) => {
    if (item.url && seenUrls.has(item.url)) return;
    if (seenTitles.has(item.title.toLowerCase())) return;
    if (item.url) seenUrls.add(item.url);
    seenTitles.add(item.title.toLowerCase());
    const scored = scoreRelevance(item, context);
    if (scored.confidence >= 0.3) collected.push(scored);
  };

  // AI search runs concurrently with the API sweep on full/deep scans
  const aiPromise = useAi(decision.tier)
    ? runAiSearch(context)
    : Promise.resolve({ items: [], suggestedSources: [], derivedAvoid: [] as string[] });

  for (const query of queries) {
    const eligible = queryDriven.filter((source) => source.lang === 'any' || source.lang === query.lang);
    if (eligible.length === 0) continue;
    log(`  Searching "${query.query}" [${eligible.map((source) => source.id).join(',')}]`);
    const settled = await Promise.allSettled(eligible.map((source) => runSource(source, query)));
    for (const result of settled) {
      if (result.status === 'fulfilled') result.value.forEach(consider);
    }
  }

  for (const source of standalone) {
    log(`  Fetching [${source.id}]`);
    const items = await runSource(source, undefined).catch(() => []);
    items.forEach(consider);
  }

  const aiResult = await aiPromise;
  aiResult.items.forEach(consider);

  if (!config.dryRun) {
    await submitSignals(buildRunSignals(aiResult, context, decision));
  }

  return collected;
}

function useAi(tier: ScanTier): boolean {
  return tier === 'full' || tier === 'deep';
}

function buildRunSignals(
  aiResult: { suggestedSources: Array<{ name: string; kind: string; url: string; reason: string }>; derivedAvoid: string[] },
  context: AgentContext,
  decision: ScanDecision
): AgentSignal[] {
  const signals: AgentSignal[] = aiResult.suggestedSources.map((source) => ({
    type: 'source_suggestion',
    value: JSON.stringify(source),
    source: 'agent'
  }));
  if (signals.length > 0) {
    log(`  Proposing ${signals.length} new sources: ${aiResult.suggestedSources.map((source) => source.name).join(', ')}`);
  }

  // Exclusions the AI read out of the user's free-form notes ("but not X")
  // become not_interested signals so keyword scoring learns them too
  const alreadyAvoided = new Set(
    (context.structuredContext?.constraints?.avoidTopics ?? []).map((topic) => topic.toLowerCase())
  );
  for (const phrase of aiResult.derivedAvoid) {
    if (alreadyAvoided.has(phrase.toLowerCase())) continue;
    log(`  Derived exclusion from interest notes: "${phrase}"`);
    signals.push({ type: 'not_interested', value: phrase, source: 'agent' });
  }

  signals.push({
    type: 'free_text',
    value: `[${decision.tier}] agent scan (${decision.reason})`,
    source: 'agent'
  });
  return signals;
}

main().catch((error) => {
  log(`FATAL: ${error}`);
  process.exit(1);
});
