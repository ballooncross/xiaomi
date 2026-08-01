import { describe, expect, it } from 'vitest';
import { parsePackageBotCommand } from '$lib/server/package-tracking/telegram-commands';

describe('Telegram package commands', () => {
	it('parses package commands with bot suffixes', () => {
		expect(parsePackageBotCommand('/track@xiaomiRadarBot YD51821898')).toEqual({
			type: 'track',
			trackingNumber: 'YD51821898'
		});
		expect(parsePackageBotCommand('/untrack ADN99972')).toEqual({ type: 'untrack', trackingNumber: 'ADN99972' });
		expect(parsePackageBotCommand('/packages')).toEqual({ type: 'packages' });
	});
});
