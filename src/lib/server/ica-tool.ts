import { getDb } from './db';
import type { Env, JobResult, JobRun, RadarItem } from './types';

const ICA_ITEM_EXTERNAL_ID = 'ica-completion-formalities-earlier-slot';
const ICA_JOB_NAME = 'ica-appointment-check';

export type IcaToolStatus = {
  enabled: boolean;
  targetBefore: string;
  checkerUrlConfigured: boolean;
  lastJob?: JobRun;
  lastItem?: RadarItem;
};

export async function getIcaToolStatus(env: Env): Promise<IcaToolStatus> {
  const db = getDb(env);
  const [items, jobs] = await Promise.all([db.listItems(100), db.listJobRuns(ICA_JOB_NAME, 1)]);
  return {
    enabled: env.ICA_CHECK_ENABLED === 'true',
    targetBefore: env.ICA_TARGET_BEFORE || '2026-07-01',
    checkerUrlConfigured: Boolean(env.CRON_WORKER || normalizedCheckerUrl(env)),
    lastJob: jobs[0],
    lastItem: items.find((item) => item.sourceType === 'ica' && item.externalId === ICA_ITEM_EXTERNAL_ID)
  };
}

export async function triggerIcaChecker(env: Env): Promise<{ result: JobResult; status: IcaToolStatus }> {
  if (!env.ADMIN_TOKEN) {
    throw new Error('ADMIN_TOKEN is not configured for the Pages app.');
  }

  const response = await fetchChecker(env);
  const payload = (await response.json().catch(() => ({}))) as JobResult & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `ICA checker returned HTTP ${response.status}`);
  }

  return {
    result: payload,
    status: await getIcaToolStatus(env)
  };
}

function fetchChecker(env: Env): Promise<Response> {
  const request = new Request('https://personal-radar-cron.local/ica-check', {
    method: 'POST',
    headers: { 'x-admin-token': env.ADMIN_TOKEN ?? '' }
  });
  if (env.CRON_WORKER) return env.CRON_WORKER.fetch(request);

  const checkerUrl = normalizedCheckerUrl(env);
  if (!checkerUrl) {
    throw new Error('CRON_WORKER binding or ICA_CHECKER_URL is not configured for the Pages app.');
  }
  return fetch(`${checkerUrl}/ica-check`, {
    method: 'POST',
    headers: { 'x-admin-token': env.ADMIN_TOKEN ?? '' }
  });
}

function normalizedCheckerUrl(env: Env): string {
  return (env.ICA_CHECKER_URL ?? '').trim().replace(/\/+$/, '');
}
