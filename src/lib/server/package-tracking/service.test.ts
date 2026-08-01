import { describe, expect, it } from 'vitest';
import type { PackageTracking } from '../types';
import { renderPackageTelegramUpdate } from './service';

describe('package tracking Telegram rendering', () => {
  it('renders only the latest pending event for each package', () => {
    const item: PackageTracking = {
      id: 'package-1',
      userId: 'user-1',
      trackingNumber: 'YD51821898',
      providerId: 'mh56',
      state: 'active',
      status: 'in_transit',
      sourceUrl: 'http://t.mh56service.com/?no=YD51821898',
      unresolvedSince: '2026-07-27T00:00:00.000Z',
      createdAt: '2026-07-27T00:00:00.000Z',
      updatedAt: '2026-07-28T10:07:46.000Z',
      events: [
        {
          id: 'event-1', packageId: 'package-1', fingerprint: 'one', status: 'in_transit',
          providerStatus: 'Shipped', message: 'Shipped', eventAt: '2026-07-27T10:28:39.000Z'
        },
        {
          id: 'event-2', packageId: 'package-1', fingerprint: 'two', status: 'in_transit',
          providerStatus: 'Export declaration', message: 'Export declaration', eventAt: '2026-07-28T10:07:46.000Z'
        }
      ]
    };
    const message = renderPackageTelegramUpdate([item]);
    expect(message).toContain('Export declaration');
    expect(message).not.toContain('Shipped');
    expect(message).toContain('运输中');
  });
});
