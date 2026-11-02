import { config, radarHeaders } from './config';
import { log } from './utils';
import type { AgentContext, AgentSignal, DiscoveredItem } from './types';

export type LocalAgentStatus = 'running' | 'ok' | 'error';

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

export async function reportAgentStatus(status: LocalAgentStatus, detail: string): Promise<boolean> {
  try {
    const response = await radarFetch('/api/agent/status', {
      method: 'POST',
      headers: radarHeaders,
      body: JSON.stringify({ status, detail })
    }, 10000);
    if (!response.ok) {
      log(`Agent status report failed: ${response.status} ${response.statusText}`);
      return false;
    }
    return true;
  } catch (error) {
    log(`Agent status report error: ${error}`);
    return false;
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
  const response = await radarFetch('/api/agent/feed', {
    method: 'POST',
    headers: radarHeaders,
    body: JSON.stringify({ items })
  });
  if (!response.ok) {
    throw new Error(`Feed submit failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as { accepted: number; duplicates: number; promoted: number; merged?: number };
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

export type QueuedBanner = { hash: string; url: string };

export async function fetchQueuedBanners(): Promise<QueuedBanner[]> {
  const response = await radarFetch('/api/agent/promotion-banners', { headers: radarHeaders });
  if (!response.ok) throw new Error(`Banner queue fetch failed: ${response.status}`);
  return ((await response.json()) as { pending?: QueuedBanner[] }).pending ?? [];
}

/** Submitting the last queued banner re-runs the promotion check, so allow it extra time. */
export async function submitBannerTranscriptions(
  transcriptions: Array<{ hash: string; text: string }>
): Promise<{ stored: number; remaining: number; rechecked: boolean }> {
  const response = await radarFetch('/api/agent/promotion-banners', {
    method: 'POST',
    headers: radarHeaders,
    body: JSON.stringify({ transcriptions })
  }, 90000);
  if (!response.ok) throw new Error(`Banner submit failed: ${response.status}`);
  return (await response.json()) as { stored: number; remaining: number; rechecked: boolean };
}
