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
const DEXI_USER_AGENT = 'Mozilla/5.0';

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

export function parseDexiXml(xml: string, trackingNumber?: string): ProviderEvent[] {
  const $ = load(xml, { xmlMode: false });
  const events: ProviderEvent[] = [];
  $('tr').each((_, row) => {
    const cells = $(row).children('td').toArray().map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());
    const detailDateIndex = cells.findIndex((cell) => /^\d{2}\/\d{2}\/\d{4}$/.test(cell));
    const detailDate = detailDateIndex >= 0
      ? parseDexiDateTime(cells[detailDateIndex] ?? '', cells[detailDateIndex + 1] ?? '')
      : undefined;
    if (detailDate && cells[detailDateIndex + 3]) {
      const message = cells[detailDateIndex + 3];
      events.push({
        status: normalizePackageStatus(message),
        providerStatus: message,
        message,
        eventAt: detailDate,
        location: cells[detailDateIndex + 2] || undefined
      });
      return;
    }

    const timeIndex = cells.findIndex((cell) => /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(cell));
    if (timeIndex >= 0) {
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
      return;
    }

    const trackingIndex = cells.findIndex((cell) =>
      trackingNumber ? cell === trackingNumber : /^[A-Z0-9_-]{4,80}$/.test(cell)
    );
    if (trackingIndex < 0) return;
    const eventAt = parseDexiOnTimestamp(cells[trackingIndex + 2] ?? '');
    const message = cells[trackingIndex + 1] ?? '';
    if (!eventAt || !message) return;
    events.push({
      status: normalizePackageStatus(message),
      providerStatus: message,
      message,
      eventAt
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
  const pageResponse = await providerFetch(sourceUrl, {
    headers: { 'user-agent': DEXI_USER_AGENT }
  });
  const cookie = pageResponse.headers.get('set-cookie')?.split(';')[0] ?? '';
  const pageHtml = await readBoundedText(pageResponse);
  const formState = pageHtml.match(/name=["']FormState["'][^>]*value=["']([^"']+)/i)?.[1] ?? '';
  if (!formState) throw new Error('D-EXI did not return form state');
  const tabId = `radar${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const requestHeaders = {
    'user-agent': DEXI_USER_AGENT,
    ...(cookie ? { cookie } : {}),
    'x-TabID': tabId,
    'x-requested-with': 'XMLHttpRequest',
    referer: sourceUrl
  };
  const fieldUrl = new URL('http://www.d-exi.com/querytracks_SEARCH_STR_value');
  fieldUrl.search = new URLSearchParams({
    _popup_: '0',
    _event_: 'accepted',
    value: trackingNumber,
    _ajax_: '1',
    _rnd_: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
    formstate: formState,
    _parentProc_: ''
  }).toString();
  const fieldResponse = await providerFetch(fieldUrl.toString(), { headers: requestHeaders });
  await readBoundedText(fieldResponse, 'gb18030');

  const body = new URLSearchParams({
    FormState: formState,
    SEARCH_STR: trackingNumber,
    _event_: 'accepted',
    value: '搜索',
    _ajax_: '1'
  });
  const response = await providerFetch('http://www.d-exi.com/querytracks_TrackingSearchBtn_value', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...requestHeaders
    },
    body
  });
  const xml = await readBoundedText(response, 'gb18030');
  const summaryEvents = parseDexiXml(xml, trackingNumber);
  const resultRow = findDexiResultRow(xml, trackingNumber);
  let events = summaryEvents;
  if (resultRow) {
    const rowClickUrl = new URL('http://www.d-exi.com/querylist');
    rowClickUrl.search = new URLSearchParams({
      _event_: 'rowclicked',
      _bidv_: resultRow,
      _parentProc_: 'querytracks',
      _parentRid_: '',
      _ajax_: '1',
      _popup_: '0',
      _rid_: String((crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % 900_000 + 100_000),
      _rnd_: crypto.randomUUID().replace(/-/g, '').slice(0, 8)
    }).toString();
    const rowClickResponse = await providerFetch(rowClickUrl.toString(), { headers: requestHeaders });
    await readBoundedText(rowClickResponse, 'gb18030');

    const detailResponse = await providerFetch('http://www.d-exi.com/querytracksfm', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        ...requestHeaders
      },
      body: new URLSearchParams({
        pressedbutton: 'change_btn',
        _bidv_: resultRow,
        FormState: formState
      })
    });
    const detailHtml = await readBoundedText(detailResponse, 'gb18030');
    const detailEvents = parseDexiXml(detailHtml, trackingNumber);
    if (detailEvents.length > 0) events = detailEvents;
  }
  return {
    providerId: 'dexi',
    sourceUrl,
    found: events.length > 0,
    events,
    estimatedDeliveryAt: estimatedDeliveryFromDexiEvents(events)
  };
}

function findDexiResultRow(xml: string, trackingNumber: string): string | undefined {
  const $ = load(xml, { xmlMode: false });
  const row = $('tr').toArray()
    .find((candidate) => $(candidate).children('td').toArray().some((cell) => $(cell).text().trim() === trackingNumber));
  return row ? $(row).attr('data-nt-id') : undefined;
}

function parseDexiDateTime(date: string, time: string): string | undefined {
  const match = `${date.trim()} ${time.trim()}`.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return undefined;
  const [, day, month, year, hour, minute] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:00+08:00`).toISOString();
}

function parseDexiOnTimestamp(value: string): string | undefined {
  const match = value.trim().match(/^(?:On:\s*)?(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/i);
  if (!match) return undefined;
  return parseDexiDateTime(`${match[1]}/${match[2]}/${match[3]}`, `${match[4]}:${match[5]}`);
}

function estimatedDeliveryFromDexiEvents(events: ProviderEvent[]): string | undefined {
  return [...events].reverse().find((event) => /预计航班到达时间|estimated flight arrival/i.test(event.message))?.eventAt;
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
