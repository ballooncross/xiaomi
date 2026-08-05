import { describe, expect, it } from 'vitest';
import {
  eventFingerprint,
  isSingaporeArrivalOrCustomsEvent,
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
    expect(providerCandidates('LX22203349875')).toEqual(['dexi']);
    expect(providerCandidates('TRACK123')).toEqual(['mh56', 'yxd', 'dexi']);
  });

  it('normalizes provider statuses', () => {
    expect(normalizePackageStatus('signed for')).toBe('delivered');
    expect(normalizePackageStatus('出口申报 Export declaration')).toBe('in_transit');
    expect(normalizePackageStatus('已开船，预计到港时间08-04号')).toBe('in_transit');
    expect(normalizePackageStatus('预计航班到达时间')).toBe('in_transit');
    expect(normalizePackageStatus('正在中转至目的地')).toBe('in_transit');
    expect(normalizePackageStatus('Out for delivery')).toBe('out_for_delivery');
    expect(normalizePackageStatus('收货人已签收')).toBe('delivered');
    expect(normalizePackageStatus('签收失败')).toBe('delivery_attempted');
    expect(normalizePackageStatus('等待签收')).toBe('out_for_delivery');
    expect(normalizePackageStatus('Custom carrier wording')).toBe('unknown');
  });

  it('detects confirmed Singapore arrival and customs milestones without treating an ETA as arrival', () => {
    expect(isSingaporeArrivalOrCustomsEvent({
      providerStatus: '货物已到港',
      message: '货物已到港',
      location: '新加坡'
    })).toBe(true);
    expect(isSingaporeArrivalOrCustomsEvent({
      providerStatus: 'Customs clearance in progress',
      message: 'Customs clearance in progress at SIN'
    })).toBe(true);
    expect(isSingaporeArrivalOrCustomsEvent({
      providerStatus: '预计航班到达时间',
      message: '预计航班到达时间',
      location: '新加坡'
    })).toBe(false);
    expect(isSingaporeArrivalOrCustomsEvent({
      providerStatus: '清关中',
      message: '清关中',
      location: '中国'
    })).toBe(false);
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
