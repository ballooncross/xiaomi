import { env as privateEnv } from '$env/dynamic/private';
import { requireAdminUser } from '$lib/server/request-auth';
import { mergeLocalEnv } from '$lib/server/env';
import { readUsage, usageDays, type UsageRow } from '$lib/server/usage';
import type { Env } from '$lib/server/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform, url }) => {
  requireAdminUser(locals);
  const requested = Number(url.searchParams.get('days') ?? 7);
  const period = [7, 30, 90].includes(requested) ? requested : 7;
  const days = usageDays(period);
  const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
  let rows: UsageRow[] = [];
  let unavailable = !env.DB;
  if (env.DB) {
    try { rows = await readUsage(env.DB, days); }
    catch { unavailable = true; }
  }
  return { rows, days, period, unavailable };
};
