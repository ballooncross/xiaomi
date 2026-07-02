import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { config } from './config';
import type { AgentContext, ScanTier } from './types';

export type AgentState = {
  lastContextVersion: number;
  lastSignalCount: number;
  lastTopicIds: string[];
  lastQuickScanAt: string;
  lastFullScanAt: string;
  lastDeepScanAt: string;
  runCount: number;
};

export function loadState(): AgentState {
  try {
    if (existsSync(config.statePath)) {
      return JSON.parse(readFileSync(config.statePath, 'utf-8')) as AgentState;
    }
  } catch {
    /* corrupted state, start fresh */
  }
  return {
    lastContextVersion: 0,
    lastSignalCount: 0,
    lastTopicIds: [],
    lastQuickScanAt: '',
    lastFullScanAt: '',
    lastDeepScanAt: '',
    runCount: 0
  };
}

export function saveState(state: AgentState): void {
  writeFileSync(config.statePath, JSON.stringify(state, null, 2));
}

export type ScanDecision = { tier: ScanTier; reason: string; changedTopics: string[] };

/**
 * Every 10-minute tick decides what to do based on what changed:
 * first run -> full; 24h+ -> deep; 4h+ -> full; context/signal change ->
 * targeted (only new topics); otherwise skip.
 */
export function decideScanTier(state: AgentState, context: AgentContext): ScanDecision {
  const now = Date.now();
  const hoursSinceDeep = state.lastDeepScanAt
    ? (now - new Date(state.lastDeepScanAt).getTime()) / 3600000
    : Infinity;
  const hoursSinceFull = state.lastFullScanAt
    ? (now - new Date(state.lastFullScanAt).getTime()) / 3600000
    : Infinity;

  if (state.runCount === 0) {
    return { tier: 'full', reason: 'First run, initializing', changedTopics: [] };
  }

  if (hoursSinceDeep >= config.deepScanIntervalHours) {
    const hours = Number.isFinite(hoursSinceDeep) ? `${Math.round(hoursSinceDeep)}h` : 'never';
    return { tier: 'deep', reason: `Last deep scan: ${hours}`, changedTopics: [] };
  }

  if (hoursSinceFull >= config.fullScanIntervalHours) {
    return { tier: 'full', reason: `${Math.round(hoursSinceFull)}h since last full scan`, changedTopics: [] };
  }

  if (context.lastContextVersion > state.lastContextVersion && state.lastContextVersion > 0) {
    const currentTopicIds = activeTopicIds(context);
    const newTopicIds = currentTopicIds.filter((id) => !state.lastTopicIds.includes(id));
    const changedTopics = context.watchTopics
      .filter((topic) => newTopicIds.includes(topic.id))
      .map((topic) => topic.name);
    const versionNote = `v${state.lastContextVersion} -> v${context.lastContextVersion}`;
    if (changedTopics.length > 0) {
      return { tier: 'targeted', reason: `Context ${versionNote}, new topics: ${changedTopics.join(', ')}`, changedTopics };
    }
    return { tier: 'targeted', reason: `Context version changed (${versionNote})`, changedTopics: [] };
  }

  const newSignals = context.preferenceSignals.length - state.lastSignalCount;
  if (newSignals >= config.signalChangeThreshold) {
    return { tier: 'targeted', reason: `${newSignals} new signals since last run`, changedTopics: [] };
  }

  return { tier: 'skip', reason: 'No changes detected', changedTopics: [] };
}

export function updateStateAfterScan(state: AgentState, context: AgentContext, tier: ScanTier): AgentState {
  const now = new Date().toISOString();
  return {
    lastContextVersion: context.lastContextVersion,
    lastSignalCount: context.preferenceSignals.length,
    lastTopicIds: activeTopicIds(context),
    lastQuickScanAt: now,
    lastFullScanAt: tier === 'full' || tier === 'deep' ? now : state.lastFullScanAt,
    lastDeepScanAt: tier === 'deep' ? now : state.lastDeepScanAt,
    runCount: state.runCount + 1
  };
}

function activeTopicIds(context: AgentContext): string[] {
  return context.watchTopics
    .filter((topic) => topic.enabled && topic.mode !== 'blacklist')
    .map((topic) => topic.id);
}
