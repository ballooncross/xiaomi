export const COE_CHECK_CRON = '15 * * * *';

export type ScheduledJob =
	| 'daily'
	| 'package-frequent'
	| 'coe-check'
	| 'all-fetch';

export function routeScheduledJob(cron: string, scheduledTime: number): ScheduledJob {
	if (cron === COE_CHECK_CRON) return 'coe-check';

	const hourMinute = new Date(scheduledTime).toISOString().slice(11, 16);
	if (hourMinute === '00:30') return 'daily';
	if (hourMinute === '04:30' || hourMinute === '08:30' || hourMinute === '12:30') {
		return 'package-frequent';
	}
	return 'all-fetch';
}
