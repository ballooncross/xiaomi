import { describe, expect, it } from 'vitest';
import {
  eventFingerprint,
  normalizePackageStatus,
  normalizeTrackingNumber,
  parseProviderTimestamp,
  providerCandidates
} from './domain';

describe('package tracking domain', () => {
  it('normalizes and validates tracking numbers', () => {
    expect(normalizeTrackingNumber(' yd 51821898 ')).toBe('YD51821898');
    expect(() => normalizeTrackingNumber('https://example.com')).toThrow(/unsupported/i);
  });

  it('routes known formats first', () => {
    expect(providerCandidates('ADN99972')[0]).toBe('yxd');
    expect(providerCandidates('YD51821898')[0]).toBe('mh56');
  });

  it('normalizes provider statuses', () => {
    expect(normalizePackageStatus('signed for')).toBe('delivered');
    expect(normalizePackageStatus('出口申报 Export declaration')).toBe('in_transit');
    expect(normalizePackageStatus('已开船，预计到港时间08-04号')).toBe('in_transit');
    expect(normalizePackageStatus('Out for delivery')).toBe('out_for_delivery');
    expect(normalizePackageStatus('Custom carrier wording')).toBe('unknown');
  });

  it('treats provider timestamps as UTC+8', () => {
    expect(parseProviderTimestamp('2026-07-28 18:07:46')).toBe('2026-07-28T10:07:46.000Z');
  });

  it('creates stable event fingerprints', async () => {
    const event = {
      status: 'in_transit' as const,
      providerStatus: 'Shipped',
      message: 'Shipped',
      eventAt: '2026-07-27T10:28:39.000Z',
      location: 'Shenzhen, China'
    };
    expect(await eventFingerprint(event)).toBe(await eventFingerprint({ ...event }));
    expect(await eventFingerprint(event)).not.toBe(await eventFingerprint({ ...event, message: 'Departed' }));
  });
});
