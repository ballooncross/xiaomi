import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { runAllFetchJobs, runCoeCheckJob, runConcertFetchJob, runDailyDigestJob, runItemDedupJob, runTrendFetchJob } from '$lib/server/jobs';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { job?: string };
  const job = body.job ?? 'all-fetch';
  if (job === 'concerts') return json(await runConcertFetchJob(env ?? {}));
  if (job === 'trends') return json(await runTrendFetchJob(env ?? {}));
  if (job === 'daily-digest') return json(await runDailyDigestJob(env ?? {}));
  if (job === 'coe-check') return json(await runCoeCheckJob(env ?? {}));
  if (job === 'all-fetch') return json(await runAllFetchJobs(env ?? {}));
  if (job === 'dedup-items') return json(await runItemDedupJob(env ?? {}));
  return json({ error: 'Unknown job' }, { status: 400 });
};

function isAuthorized(request: Request, env?: Env): boolean {
  if (!env?.ADMIN_TOKEN) return true;
  return request.headers.get('x-admin-token') === env.ADMIN_TOKEN;
}
