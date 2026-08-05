import type { PackageProviderId, PackageStatus, PackageTrackingEvent } from '../types';

export type ProviderEvent = {
  status: PackageStatus;
  providerStatus: string;
  message: string;
  eventAt: string;
  location?: string;
};

export type ProviderLookupResult = {
  providerId: PackageProviderId;
  sourceUrl: string;
  found: boolean;
  events: ProviderEvent[];
  estimatedDeliveryAt?: string;
};

export const PACKAGE_PROVIDER_LABELS: Record<PackageProviderId, string> = {
  yxd: 'YXD',
  dexi: 'D-EXI',
  mh56: 'MH56'
};

export const PACKAGE_STATUS_LABELS: Record<PackageStatus, string> = {
  awaiting_tracking_data: '等待物流信息',
  info_received: '已收到物流信息',
  in_transit: '运输中',
  out_for_delivery: '派送中',
  delivery_attempted: '派送未成功',
  exception: '物流异常',
  delivered: '已送达',
  returned: '退回中',
  unknown: '状态未知'
};

export function normalizeTrackingNumber(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '');
  if (normalized.length < 4 || normalized.length > 80) {
    throw new Error('Tracking number must contain between 4 and 80 characters.');
  }
  if (!/^[A-Z0-9_-]+$/.test(normalized)) {
    throw new Error('Tracking number contains unsupported characters.');
  }
  return normalized;
}

export function providerCandidates(trackingNumber: string): PackageProviderId[] {
  if (/^ADN\d+/i.test(trackingNumber)) return ['yxd'];
  if (/^YD\d+/i.test(trackingNumber)) return ['mh56'];
  if (/^LX\d+/i.test(trackingNumber)) return ['dexi'];
  return ['mh56', 'yxd', 'dexi'];
}

export function normalizePackageStatus(value: string): PackageStatus {
  const text = value.trim().toLowerCase();
  if (!text) return 'unknown';
  if (matches(text, ['returned', 'return to sender', '退回', '退件'])) return 'returned';
  if (matches(text, [
    'delivery attempted',
    'unsuccessful delivery',
    '派送未成功',
    '投递失败',
    '签收失败',
    '未签收'
  ])) return 'delivery_attempted';
  if (matches(text, ['exception', 'delayed', 'delay', 'failed', '异常', '延误', '失败'])) return 'exception';
  if (matches(text, ['out for delivery', 'with courier', '派送中', '派件中', '正在派送', '等待签收'])) {
    return 'out_for_delivery';
  }
  if (matches(text, [
    'signed for',
    'delivered',
    '已签收',
    '签收',
    '妥投',
    '已送达',
    '派送完成',
    '完成派送',
    '成功派送',
    '收货人已签收'
  ])) return 'delivered';
  if (matches(text, [
    'shipped',
    'in transit',
    'export declaration',
    'declaration complete',
    'declaration complate',
    'departed',
    'arrived',
    'customs',
    'dispatched',
    '已发货',
    '运输',
    '出口申报',
    '报关完成',
    '已开船',
    '开船',
    '预计航班到达时间',
    '正在中转',
    '货物到仓',
    '清关',
    '到达',
    '离开'
  ])) return 'in_transit';
  if (matches(text, ['information received', 'info received', 'label created', '电子信息', '预报信息', '数据已接收'])) {
    return 'info_received';
  }
  return 'unknown';
}

export function parseProviderTimestamp(value: string): string {
  const trimmed = value.trim();
  const localMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (localMatch) {
    const [, year, month, day, hour, minute, second = '00'] = localMatch;
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`).toISOString();
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export async function eventFingerprint(event: ProviderEvent): Promise<string> {
  const value = [event.eventAt, event.providerStatus, event.message, event.location ?? ''].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function latestProviderEvent(events: ProviderEvent[]): ProviderEvent | undefined {
  return [...events].sort((a, b) => b.eventAt.localeCompare(a.eventAt))[0];
}

export function isSingaporeArrivalOrCustomsEvent(
  event: Pick<ProviderEvent, 'providerStatus' | 'message' | 'location'>
): boolean {
  const text = [event.providerStatus, event.message, event.location ?? ''].join(' ').toLowerCase();
  const isSingapore = /singapore|新加坡|(?:^|\W)(?:sg|sin)(?:\W|$)/i.test(text);
  if (!isSingapore) return false;
  if (/清关|通关|customs?/i.test(text)) return true;
  const isArrival = /到港|抵达|到达|arriv(?:e|ed|al)|landed/i.test(text);
  const isForecast = /预计|预期|计划|estimated|expected|eta|scheduled/i.test(text);
  return isArrival && !isForecast;
}

export function eventFromStored(event: PackageTrackingEvent): ProviderEvent {
  return {
    status: event.status,
    providerStatus: event.providerStatus,
    message: event.message,
    eventAt: event.eventAt,
    location: event.location
  };
}

function matches(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}
