import { getDb } from './db';
import { isCronJobFeatureEnabled } from './features';
import type { CronJobStatus, Env } from './types';

type CronJobDefinition = Omit<CronJobStatus, 'enabled' | 'lastRun'> & {
  enabled: (env: Env) => boolean;
};

const scheduledJobs: CronJobDefinition[] = [
  {
    jobName: 'fetch-concerts',
    label: '演出抓取',
    description: '抓取新加坡演出、音乐人巡演与热门活动。',
    schedule: '每 6 小时',
    enabled: () => true
  },
  {
    jobName: 'fetch-trends',
    label: '趋势抓取',
    description: '抓取商业、职业、市场与关注主题相关新闻。',
    schedule: '每 6 小时',
    enabled: () => true
  },
  {
    jobName: 'daily-digest',
    label: '每日 Telegram 摘要',
    description: '发送每日雷达摘要，并附带当天生日/纪念日提醒。',
    schedule: '每天 08:30',
    enabled: (env) => Boolean(env.TELEGRAM_BOT_TOKEN)
  },
  {
    jobName: 'coe-check',
    label: 'COE 结果检查',
    description: '拉取 LTA 官方报价；发现新一轮时 Telegram 通知 Cat A/B。',
    schedule: '每 6 小时 · 周三/四 18:00 SGT',
    enabled: (env) => Boolean(env.TELEGRAM_BOT_TOKEN && env.ADMIN_EMAILS)
  },
  {
    jobName: 'ica-appointment-check',
    label: 'ICA 预约检查',
    description: 'Cloudflare Browser Run 会被 ICA 搜索接口拒绝，已停止定时运行。',
    schedule: '已停用',
    enabled: () => false
  }
];

export async function getCronJobStatuses(env: Env): Promise<CronJobStatus[]> {
  const db = getDb(env);
  return Promise.all(
    scheduledJobs.map(async (job) => {
      const [lastRun] = await db.listJobRuns(job.jobName, 1);
      const featureOn = await isCronJobFeatureEnabled(db, job.jobName);
      return {
        jobName: job.jobName,
        label: job.label,
        description: job.description,
        schedule: job.schedule,
        enabled: featureOn && job.enabled(env),
        lastRun
      };
    })
  );
}
