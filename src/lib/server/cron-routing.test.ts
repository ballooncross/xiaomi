import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COE_CHECK_CRON, routeScheduledJob } from './cron-routing';

describe('cron routing', () => {
	it('routes every hourly COE trigger directly to the COE check', () => {
		for (const hour of [0, 6, 10, 18, 23]) {
			const scheduledTime = Date.UTC(2026, 7, 12, hour, 15);
			expect(routeScheduledJob(COE_CHECK_CRON, scheduledTime)).toBe('coe-check');
		}
	});

	it('matches the deployed worker trigger', () => {
		const config = readFileSync(new URL('../../../wrangler.cron.toml', import.meta.url), 'utf8');
		expect(config).toContain(`"${COE_CHECK_CRON}"`);
	});

	it('keeps other scheduled jobs on their existing routes', () => {
		expect(routeScheduledJob('30 0 * * *', Date.UTC(2026, 7, 12, 0, 30))).toBe('daily');
		expect(routeScheduledJob('30 4,8,12 * * *', Date.UTC(2026, 7, 12, 8, 30))).toBe(
			'package-frequent'
		);
		expect(routeScheduledJob('0 */6 * * *', Date.UTC(2026, 7, 12, 6, 0))).toBe('all-fetch');
	});
});
