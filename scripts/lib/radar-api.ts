import { config, radarHeaders } from './config';
import { log } from './utils';
import type { AgentContext, AgentSignal, DiscoveredItem } from './types';

/**
 * The radar API is normally fast, but a stalled TCP connection on a bare
 * `fetch` has no timeout and would wedge the whole tick forever (this is what
 * silently killed the agent). Abort every request after a bounded window.
 */
async function radarFetch(path: string, init?: RequestInit, timeoutMs = 25000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${config.radarUrl}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchContext(): Promise<AgentContext | null> {
  try {
    const response = await radarFetch('/api/agent/context', { headers: radarHeaders });
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
    const response = await radarFetch('/api/agent/feed', {
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
    await radarFetch('/api/agent/signal', {
      method: 'POST',
      headers: radarHeaders,
      body: JSON.stringify({ signals })
    });
  } catch (error) {
    log(`Signal submit error: ${error}`);
  }
}
