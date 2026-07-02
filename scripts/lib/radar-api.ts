import { config, radarHeaders } from './config';
import { log } from './utils';
import type { AgentContext, AgentSignal, DiscoveredItem } from './types';

export async function fetchContext(): Promise<AgentContext | null> {
  try {
    const response = await fetch(`${config.radarUrl}/api/agent/context`, { headers: radarHeaders });
    if (!response.ok) {
      log(`Context fetch failed: ${response.status} ${response.statusText}`);
      return null;
    }
    return (await response.json()) as AgentContext;
  } catch (error) {
    log(`Context fetch error: ${error}`);
    return null;
  }
}

export async function submitFeeds(
  items: DiscoveredItem[]
): Promise<{ accepted: number; duplicates: number; promoted: number; merged?: number }> {
  try {
    const response = await fetch(`${config.radarUrl}/api/agent/feed`, {
      method: 'POST',
      headers: radarHeaders,
      body: JSON.stringify({ items })
    });
    if (!response.ok) {
      log(`Feed submit failed: ${response.status}`);
      return { accepted: 0, duplicates: 0, promoted: 0 };
    }
    return (await response.json()) as { accepted: number; duplicates: number; promoted: number; merged?: number };
  } catch (error) {
    log(`Feed submit error: ${error}`);
    return { accepted: 0, duplicates: 0, promoted: 0 };
  }
}

export async function submitSignals(signals: AgentSignal[]): Promise<void> {
  if (signals.length === 0) return;
  try {
    await fetch(`${config.radarUrl}/api/agent/signal`, {
      method: 'POST',
      headers: radarHeaders,
      body: JSON.stringify({ signals })
    });
  } catch (error) {
    log(`Signal submit error: ${error}`);
  }
}
