import puppeteer from '@cloudflare/puppeteer';
import { load } from 'cheerio';
import type { Env, PackageProviderId } from '../types';
import {
  normalizePackageStatus,
  parseProviderTimestamp,
  type ProviderEvent,
  type ProviderLookupResult
} from './domain';

const MAX_PROVIDER_BYTES = 1_000_000;
const PROVIDER_TIMEOUT_MS = 15_000;
const BROWSER_TIMEOUT_MS = 20_000;
const USER_AGENT = 'PersonalRadarPackageTracker/1.0';

type YxdRow = { trackingNumber: string; time: string; note: string; location: string };

export async function lookupWithProvider(
  env: Env,
  providerId: PackageProviderId,
  trackingNumber: string
): Promise<ProviderLookupResult> {
  if (providerId === 'yxd') return lookupYxd(env, trackingNumber);
  if (providerId === 'dexi') return lookupDexi(trackingNumber);
  return lookupMh56(trackingNumber);
}

export function parseMh56Html(html: string): ProviderEvent[] {
  const $ = load(html);
  const events: ProviderEvent[] = [];
  $('.timeline-item').each((_, element) => {
    const spans = $(element).find('.timeline-item_timestamp span').toArray().map((span) => $(span).text().trim());
    const time = spans[0] ?? '';
    const detail = spans.slice(1).join(' ').trim();
    if (!time || !detail) return;
    const location = detail.match(/[【[]([^】\]]+)[】\]]/)?.[1]?.trim();
    const message = detail.replace(/[【[][^】\]]+[】\]]/, '').trim();
    events.push({
      status: normalizePackageStatus(message),
      providerStatus: message,
      message,
      eventAt: parseProviderTimestamp(time),
      location
    });
  });
  return sortEvents(events);
}

export function parseYxdRows(rows: YxdRow[]): ProviderEvent[] {
  return sortEvents(
    rows
      .filter((row) => row.time && row.note)
      .map((row) => ({
        status: normalizePackageStatus(row.note),
        providerStatus: row.note.trim(),
        message: row.note.trim(),
        eventAt: parseProviderTimestamp(row.time),
        location: row.location.trim() || undefined
      }))
  );
}

export function parseDexiXml(xml: string): ProviderEvent[] {
  const $ = load(xml, { xmlMode: false });
  const events: ProviderEvent[] = [];
  $('tr').each((_, row) => {
    const cells = $(row).find('td').toArray().map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());
    const timeIndex = cells.findIndex((cell) => /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(cell));
    if (timeIndex < 0) return;
    const time = cells[timeIndex];
    const detail = cells.slice(timeIndex + 1).filter(Boolean);
    const message = detail[0] ?? 'Tracking update';
    const location = detail.length > 1 ? detail[detail.length - 1] : undefined;
    events.push({
      status: normalizePackageStatus(message),
      providerStatus: message,
      message,
      eventAt: parseProviderTimestamp(time),
      location
    });
  });
  return sortEvents(events);
}

async function lookupMh56(trackingNumber: string): Promise<ProviderLookupResult> {
  const sourceUrl = `http://t.mh56service.com/?no=${encodeURIComponent(trackingNumber)}`;
  const response = await providerFetch(sourceUrl);
  const html = await readBoundedText(response);
  const events = parseMh56Html(html);
  return {
    providerId: 'mh56',
    sourceUrl,
    found: events.length > 0,
    events,
    estimatedDeliveryAt: estimatedDeliveryFromEvents(events)
  };
}

async function lookupYxd(env: Env, trackingNumber: string): Promise<ProviderLookupResult> {
  const sourceUrl = `https://yxd.itdida.com/query.xhtml?danHao=${encodeURIComponent(trackingNumber)}`;
  if (!env.BROWSER) {
    const response = await providerFetch(sourceUrl);
    const html = await readBoundedText(response);
    const rows = parseYxdRowsFromHtml(html, trackingNumber);
    return { providerId: 'yxd', sourceUrl, found: rows.length > 0, events: parseYxdRows(rows) };
  }

  const browser = await puppeteer.launch(env.BROWSER as never);
  const page = await browser.newPage();
  page.setDefaultTimeout(BROWSER_TIMEOUT_MS);
  try {
    await page.setUserAgent(USER_AGENT);
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: BROWSER_TIMEOUT_MS });
    await page.waitForFunction(
      () => /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(document.body?.innerText ?? ''),
      { timeout: BROWSER_TIMEOUT_MS }
    ).catch(() => undefined);
    const rows = await page.evaluate((expectedTrackingNumber) => {
      return Array.from(document.querySelectorAll('tbody tr, tr.ui-widget-content')).flatMap((row) => {
        const cells = Array.from(row.querySelectorAll('td')).map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim());
        const timeIndex = cells.findIndex((cell) => /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(cell));
        if (timeIndex < 0 || !cells.some((cell) => cell.includes(expectedTrackingNumber))) return [];
        return [{
          trackingNumber: expectedTrackingNumber,
          time: cells[timeIndex] ?? '',
          note: cells[timeIndex + 1] ?? '',
          location: cells[timeIndex + 2] ?? ''
        }];
      });
    }, trackingNumber);
    const events = parseYxdRows(rows);
    return { providerId: 'yxd', sourceUrl, found: events.length > 0, events };
  } finally {
    await browser.close();
  }
}

async function lookupDexi(trackingNumber: string): Promise<ProviderLookupResult> {
  const sourceUrl = 'http://www.d-exi.com/querytracks?tracknow=new';
  const pageResponse = await providerFetch(sourceUrl);
  const cookie = pageResponse.headers.get('set-cookie')?.split(';')[0] ?? '';
  const pageHtml = await readBoundedText(pageResponse);
  const formState = pageHtml.match(/name=["']FormState["'][^>]*value=["']([^"']+)/i)?.[1] ?? '';
  const body = new URLSearchParams({
    FormState: formState,
    SEARCH_STR: trackingNumber,
    _event_: 'accepted',
    value: 'search',
    _ajax_: '1'
  });
  const response = await providerFetch('http://www.d-exi.com/querytracks_TrackingSearchBtn_value', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(cookie ? { cookie } : {})
    },
    body
  });
  const xml = await readBoundedText(response, 'gb18030');
  const events = parseDexiXml(xml);
  return { providerId: 'dexi', sourceUrl, found: events.length > 0, events };
}

function parseYxdRowsFromHtml(html: string, trackingNumber: string): YxdRow[] {
  const $ = load(html);
  const rows: YxdRow[] = [];
  $('tr').each((_, row) => {
    const cells = $(row).find('td').toArray().map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());
    const timeIndex = cells.findIndex((cell) => /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(cell));
    if (timeIndex < 0 || !cells.some((cell) => cell.includes(trackingNumber))) return;
    rows.push({
      trackingNumber,
      time: cells[timeIndex] ?? '',
      note: cells[timeIndex + 1] ?? '',
      location: cells[timeIndex + 2] ?? ''
    });
  });
  return rows;
}

async function providerFetch(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(input, {
      ...init,
      headers: { 'user-agent': USER_AGENT, ...(init?.headers ?? {}) },
      signal: controller.signal,
      redirect: 'follow'
    });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedText(response: Response, encoding = 'utf-8'): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PROVIDER_BYTES) throw new Error('Provider response exceeded the size limit');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

function sortEvents(events: ProviderEvent[]): ProviderEvent[] {
  return events.sort((a, b) => a.eventAt.localeCompare(b.eventAt));
}

function estimatedDeliveryFromEvents(events: ProviderEvent[]): string | undefined {
  for (const event of [...events].reverse()) {
    const match = event.message.match(/(?:ETA(?:\s+SG)?|预计到港时间)\s*[:：]?\s*(\d{1,2})-(\d{1,2})/i);
    if (!match) continue;
    const year = new Date(event.eventAt).getUTCFullYear();
    return new Date(`${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}T12:00:00+08:00`).toISOString();
  }
  return undefined;
}
