import { runIcaAppointmentCheckJob } from './lib/server/ica-appointment';
import { runAllFetchJobs, runCoeCheckJob, runDailyDigestJob } from './lib/server/jobs';
import { compileContext } from './lib/server/context-compiler';
import { getDb } from './lib/server/db';
import type { Env } from './lib/server/types';

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const hourMinute = new Date(event.scheduledTime).toISOString().slice(11, 16);
    if (hourMinute === '00:30') {
      ctx.waitUntil(runDailyDigestJob(env));
      // Recompile AI context daily after digest
      ctx.waitUntil(compileContext(getDb(env)).catch(() => {}));
      return;
    }
    // Wed/Thu 10:00 UTC = 18:00 SGT — typical COE result window (+ holiday slip to Thu)
    if (hourMinute === '10:00') {
      ctx.waitUntil(runCoeCheckJob(env));
      return;
    }
    ctx.waitUntil(runAllFetchJobs(env));
  },

  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === '/ica-check' && request.method === 'POST') {
      if (!env.ADMIN_TOKEN || request.headers.get('x-admin-token') !== env.ADMIN_TOKEN) {
        return new Response('Unauthorized', { status: 401 });
      }
      return Response.json(await runIcaAppointmentCheckJob(env));
    }

    return new Response('Personal Radar cron worker');
  }
};
