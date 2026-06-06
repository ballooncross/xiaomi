import { runAllFetchJobs, runDailyDigestJob } from './lib/server/jobs';
import type { Env } from './lib/server/types';

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const hourMinute = new Date(event.scheduledTime).toISOString().slice(11, 16);
    if (hourMinute === '00:30') {
      ctx.waitUntil(runDailyDigestJob(env));
      return;
    }
    ctx.waitUntil(runAllFetchJobs(env));
  },

  async fetch() {
    return new Response('Personal Radar cron worker');
  }
};
