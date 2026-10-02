import { RADAR_VIEW_IDS } from '$lib/navigation';

export type UsageMetric = 'visit' | 'calculation' | 'search';
export type UsageEvent = { audience: 'guest' | 'member'; view: string; metric: UsageMetric };

export function parseUsageEvent(value: unknown): UsageEvent | null {
  if (!value || typeof value !== 'object') return null;
  const { audience, view, metric } = value as Record<string, unknown>;
  if (audience !== 'guest' && audience !== 'member') return null;
  if (typeof view !== 'string' || !RADAR_VIEW_IDS.some((id) => id === view)) return null;
  if (audience === 'guest' && view !== 'gym' && view !== 'nutrition') return null;
  if (metric !== 'visit' && !(metric === 'calculation' && view === 'nutrition') &&
    !(metric === 'search' && ['gym', 'home', 'concerts', 'trends', 'saved'].includes(view))) return null;
  return { audience, view, metric };
}

/** Best effort: analytics must never block the tool. No form values leave the browser. */
export function trackUsage(metric: UsageMetric, view: string) {
  if (typeof window === 'undefined') return;
  const audience = window.location.pathname === '/guest' ? 'guest' : 'member';
  void fetch('/api/usage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audience, view, metric }),
    keepalive: true
  }).catch(() => {});
}
