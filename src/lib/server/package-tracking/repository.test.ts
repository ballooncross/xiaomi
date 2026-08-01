import { describe, expect, it } from 'vitest';
import type { PackageTracking } from '../types';
import {
  createPackageTracking,
  listPackageTrackings,
  listPendingPackageNotifications,
  markPackageNotificationsSent,
  recordPackageLookup,
  recordPackageNoData
} from './repository';

describe('package tracking repository state transitions', () => {
  it('moves unresolved packages to needs attention after seven days and records an update', async () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const item: PackageTracking = {
      id: crypto.randomUUID(),
      userId: 'test-user',
      trackingNumber: 'UNKNOWN123',
      state: 'awaiting_tracking_data',
      status: 'awaiting_tracking_data',
      unresolvedSince: old,
      createdAt: old,
      updatedAt: old,
      events: []
    };
    const updated = await recordPackageNoData({}, item);
    expect(updated.state).toBe('needs_attention');
    expect(updated.events?.[0].message).toContain('7 天');
  });

  it('deduplicates unchanged provider events after notification', async () => {
    const userId = crypto.randomUUID();
    const { item } = await createPackageTracking({}, userId, 'YD123456');
    const result = {
      providerId: 'mh56' as const,
      sourceUrl: 'http://t.mh56service.com/?no=YD123456',
      found: true,
      events: [{
        status: 'in_transit' as const,
        providerStatus: 'Shipped',
        message: 'Shipped',
        eventAt: '2026-07-27T10:28:39.000Z'
      }]
    };

    await recordPackageLookup({}, item, result);
    expect(await listPendingPackageNotifications({}, userId)).toHaveLength(1);
    await markPackageNotificationsSent({}, userId, [item.id]);
    await recordPackageLookup({}, item, result);
    expect(await listPendingPackageNotifications({}, userId)).toHaveLength(0);
  });

  it('archives a delivered package only after its update is handled', async () => {
    const userId = crypto.randomUUID();
    const { item } = await createPackageTracking({}, userId, 'ADN123456');
    await recordPackageLookup({}, item, {
      providerId: 'yxd',
      sourceUrl: 'https://yxd.itdida.com/query.xhtml?danHao=ADN123456',
      found: true,
      events: [{
        status: 'delivered',
        providerStatus: 'signed for',
        message: 'signed for',
        eventAt: '2026-07-29T02:41:58.000Z'
      }]
    });
    expect(item.state).toBe('active');

    await markPackageNotificationsSent({}, userId, [item.id]);
    expect((await listPackageTrackings({}, userId))[0].state).toBe('archived');
  });
});
