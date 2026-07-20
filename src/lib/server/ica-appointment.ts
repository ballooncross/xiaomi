import puppeteer from '@cloudflare/puppeteer';
import { getDb } from './db';
import { sendTelegramToAdmins } from './telegram';
import type { Env, JobResult, RadarItem } from './types';

const ICA_URL = 'https://eservices.ica.gov.sg/eappt/serviceselection';
const ICA_ITEM_EXTERNAL_ID = 'ica-completion-formalities-earlier-slot';
const ICA_ITEM_ID = 'ica-appointment-earlier-slot';
const PAGE_TIMEOUT_MS = 45_000;
const SHORT_TIMEOUT_MS = 20_000;
const SERVICE_SELECTOR = 'input[role="combobox"], ng-select, .ng-select-container, [role="combobox"]';

export type IcaCheckStatus = 'ok' | 'found_earlier' | 'blocked' | 'not_configured' | 'error';

export type IcaCheckResult = {
  status: IcaCheckStatus;
  currentAppointment?: string;
  targetBefore: string;
  earliestDate?: string;
  earlierDates: string[];
  checkedAt: string;
  detail: string;
  runner?: 'cloudflare-browser-run' | 'external-fallback';
};

type CalendarDate = {
  date: string;
  label: string;
};

type BrowserPage = Awaited<ReturnType<Awaited<ReturnType<typeof puppeteer.launch>>['newPage']>>;

export async function runIcaAppointmentCheckJob(env: Env): Promise<JobResult> {
  if (env.ICA_CHECK_ENABLED !== 'true') {
    return recordSkipped(env, {
      status: 'not_configured',
      targetBefore: targetBefore(env),
      earlierDates: [],
      checkedAt: new Date().toISOString(),
      detail: 'ICA checker is disabled',
      runner: 'cloudflare-browser-run'
    });
  }

  if (!env.ICA_APPLICATION_ID || !env.BROWSER) {
    const skipped = {
      status: 'not_configured',
      targetBefore: targetBefore(env),
      earlierDates: [],
      checkedAt: new Date().toISOString(),
      detail: 'ICA_APPLICATION_ID or Browser Run binding is missing',
      runner: 'cloudflare-browser-run'
    } satisfies IcaCheckResult;
    const fallback = await runIcaFallbackIfConfigured(env, skipped);
    return fallback ? recordResult(env, fallback) : recordSkipped(env, skipped);
  }

  let result: IcaCheckResult;
  try {
    result = await checkIcaAppointment(env);
  } catch (error) {
    result = {
      status: isVerificationError(error) ? 'blocked' : 'error',
      targetBefore: targetBefore(env),
      earlierDates: [],
      checkedAt: new Date().toISOString(),
      detail: error instanceof Error ? error.message : 'ICA checker failed',
      runner: 'cloudflare-browser-run'
    };
  }

  const fallback = await runIcaFallbackIfConfigured(env, result);
  if (fallback) return recordResult(env, fallback);
  return recordResult(env, result);
}

async function checkIcaAppointment(env: Env): Promise<IcaCheckResult> {
  const target = targetBefore(env);
  const browser = await puppeteer.launch(env.BROWSER as never);
  const page = await browser.newPage();
  page.setDefaultTimeout(PAGE_TIMEOUT_MS);

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
    );
    await page.setViewport({ width: 1365, height: 900 });
    await page.goto(ICA_URL, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    await waitForIcaServicePage(page);

    await selectCompletionFormalitiesService(page);
    await typeApplicationId(page, env.ICA_APPLICATION_ID ?? '');
    await clickButtonByText(page, 'Proceed');
    await waitForPostProceedResult(page);
    const bodyText = await page.evaluate(() => document.body.innerText);
    const postProceedError = extractPostProceedError(bodyText);
    if (postProceedError) {
      return {
        status: 'error',
        targetBefore: target,
        earlierDates: [],
        checkedAt: new Date().toISOString(),
        runner: 'cloudflare-browser-run',
        detail: postProceedError
      };
    }

    const currentAppointment = extractCurrentAppointment(bodyText);

    await clickButtonByText(page, 'Update Appointment');
    await page.waitForFunction(() => document.body.innerText.includes('Appointment Details'), { timeout: PAGE_TIMEOUT_MS });
    await openDatePicker(page);
    await showPreviousMonthIfPossible(page);

    const availableDates = await extractAvailableDates(page);
    const earlierDates = availableDates.map((item) => item.date).filter((date) => date < target).sort();
    const earliestDate = availableDates.map((item) => item.date).sort()[0];

    return {
      status: earlierDates.length > 0 ? 'found_earlier' : 'ok',
      currentAppointment,
      targetBefore: target,
      earliestDate,
      earlierDates,
      checkedAt: new Date().toISOString(),
      runner: 'cloudflare-browser-run',
      detail:
        earlierDates.length > 0
          ? `Found earlier ICA date ${earlierDates[0]}`
          : earliestDate
            ? `No ICA date before ${target}; earliest selectable date is ${earliestDate}`
            : `No selectable ICA dates found before ${target}`
    };
  } finally {
    await browser.close();
  }
}

async function waitForIcaServicePage(page: BrowserPage) {
  try {
    await page.waitForFunction(
      (selector) => {
        const text = document.body?.innerText ?? '';
        return (
          Boolean(document.querySelector(selector)) ||
          /captcha|verification|access denied|forbidden|service unavailable|temporarily unavailable|blocked/i.test(text)
        );
      },
      { timeout: PAGE_TIMEOUT_MS },
      SERVICE_SELECTOR
    );
  } catch {
    throw new Error(`ICA service page did not expose the service selector. ${await pageDiagnostic(page)}`);
  }

  const blocked = await page.evaluate(() => {
    const text = document.body?.innerText ?? '';
    return /captcha|verification|access denied|forbidden|service unavailable|temporarily unavailable|blocked/i.test(text);
  });
  if (blocked) throw new Error(`ICA page appears blocked or unavailable. ${await pageDiagnostic(page)}`);
}

async function selectCompletionFormalitiesService(page: BrowserPage) {
  await clickFirstVisible(page, SERVICE_SELECTOR);
  await sleep(500);

  const selectedByText = await page.evaluate(() => {
    const option = Array.from(document.querySelectorAll('[role="option"], .ng-option, mat-option, .mat-option')).find((candidate) =>
      (candidate.textContent ?? '').includes('Completion of Formalities')
    );
    if (!option) return false;
    option.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  });

  if (!selectedByText) {
    for (let index = 0; index < 5; index += 1) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
  }

  await page.waitForFunction(() => document.body.innerText.includes('Group Application ID'), { timeout: SHORT_TIMEOUT_MS });
}

async function clickFirstVisible(page: BrowserPage, selector: string) {
  const box = await page.evaluate((selectorText) => {
    const element = Array.from(document.querySelectorAll<HTMLElement>(selectorText)).find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (!element) return undefined;
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }, selector);
  if (!box) throw new Error(`ICA service selector not clickable. ${await pageDiagnostic(page)}`);
  await page.mouse.click(box.x, box.y);
}

async function typeApplicationId(page: BrowserPage, applicationId: string) {
  await page.waitForSelector('input:not([role="combobox"])', { visible: true });
  await page.click('input:not([role="combobox"])', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('input:not([role="combobox"])', applicationId, { delay: 10 });
}

async function clickButtonByText(page: BrowserPage, text: string) {
  const clicked = await page.evaluate((label) => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
      (candidate.textContent ?? '').trim().includes(label)
    );
    if (!button || button.hasAttribute('disabled')) return false;
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  }, text);
  if (!clicked) throw new Error(`ICA button not found or disabled: ${text}`);
}

async function waitForPostProceedResult(page: BrowserPage) {
  try {
    await page.waitForFunction(
      () => {
        const text = document.body?.innerText ?? '';
        return (
          text.includes('Update Appointment') ||
          text.includes('Error in application') ||
          text.includes('Error Message') ||
          text.includes('Something went wrong')
        );
      },
      { timeout: PAGE_TIMEOUT_MS }
    );
  } catch {
    throw new Error(`ICA did not show appointment controls after Proceed. ${await pageDiagnostic(page)}`);
  }
}

async function openDatePicker(page: BrowserPage) {
  const hasCalendar = await page.evaluate(() => Boolean(document.querySelector('bs-datepicker-inline-container')));
  if (hasCalendar) return;
  const clicked = await page.evaluate(() => {
    const editImages = Array.from(document.querySelectorAll('img[alt*="edit"], img[src*="edit"]'));
    const image = editImages[1] ?? editImages[0];
    if (!image) return false;
    image.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  });
  if (!clicked) throw new Error('ICA date edit control not found');
  await page.waitForSelector('bs-datepicker-inline-container', { visible: true, timeout: SHORT_TIMEOUT_MS });
}

async function showPreviousMonthIfPossible(page: BrowserPage) {
  await page.evaluate(() => {
    const previous = document.querySelector<HTMLButtonElement>('bs-datepicker-navigation-view button.previous:not([disabled])');
    previous?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
  await sleep(600);
}

async function extractAvailableDates(page: BrowserPage): Promise<CalendarDate[]> {
  return page.evaluate(() => {
    const monthNumbers: Record<string, string> = {
      January: '01',
      February: '02',
      March: '03',
      April: '04',
      May: '05',
      June: '06',
      July: '07',
      August: '08',
      September: '09',
      October: '10',
      November: '11',
      December: '12'
    };

    return Array.from(document.querySelectorAll('bs-days-calendar-view')).flatMap((view) => {
      const current = Array.from(view.querySelectorAll('.bs-datepicker-head button.current span')).map((span) =>
        (span.textContent ?? '').trim()
      );
      const month = monthNumbers[current[0]];
      const year = current[1];
      if (!month || !year) return [];

      return Array.from(view.querySelectorAll('[role="gridcell"] span[bsdatepickerdaydecorator]'))
        .filter((span) => !span.classList.contains('disabled') && !span.classList.contains('is-other-month'))
        .map((span) => {
          const day = (span.textContent ?? '').trim().padStart(2, '0');
          return {
            date: `${year}-${month}-${day}`,
            label: `${Number(day)} ${current[0]} ${year}`
          };
        });
    });
  });
}

async function recordResult(env: Env, result: IcaCheckResult): Promise<JobResult> {
  const db = getDb(env);
  const existing = (await db.listItems(100)).find(
    (item) => item.sourceType === 'ica' && item.externalId === ICA_ITEM_EXTERNAL_ID
  );
  const existingRaw = isRecord(existing?.raw) ? existing.raw : {};
  const shouldNotify =
    result.status === 'found_earlier' &&
    result.earlierDates[0] &&
    existingRaw.earliestEarlierDate !== result.earlierDates[0];

  const item = buildRadarItem(result);
  const upsert = await db.upsertItem(item);
  let notified = 0;

  if (shouldNotify) {
    const message = [
      'ICA appointment alert',
      `Earlier date available: ${result.earlierDates[0]}`,
      `Current reservation: ${result.currentAppointment ?? '2026-07-01'}`,
      `Application: ${redactApplicationId(env.ICA_APPLICATION_ID)}`,
      ICA_URL
    ].join('\n');
    const telegram = await sendTelegramToAdmins(env, message);
    notified = telegram.notified;
    await db.logNotification({
      itemId: item.id,
      channel: 'telegram',
      type: 'ica_appointment',
      status: telegram.ok ? 'sent' : 'skipped',
      message
    });
  }

  await db.logJob({ jobName: 'ica-appointment-check', status: result.status, detail: result.detail });
  return {
    inserted: upsert === 'inserted' ? 1 : 0,
    updated: upsert === 'updated' ? 1 : 0,
    considered: 1,
    notified,
    detail: result.detail
  };
}

async function runIcaFallbackIfConfigured(env: Env, primary: IcaCheckResult): Promise<IcaCheckResult | undefined> {
  if (!shouldTriggerIcaFallback(env, primary.status)) return undefined;

  try {
    const response = await fetch(`${normalizeIcaFallbackUrl(env)}/ica-check`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-runner-token': env.ICA_FALLBACK_TRIGGER_TOKEN ?? ''
      },
      body: JSON.stringify({
        targetBefore: primary.targetBefore,
        primaryStatus: primary.status,
        primaryDetail: primary.detail,
        requestedAt: new Date().toISOString()
      })
    });

    const payload = (await response.json().catch(() => ({}))) as Partial<IcaCheckResult> & { error?: string };
    if (!response.ok) {
      primary.detail = `${primary.detail}; fallback HTTP ${response.status}: ${payload.error ?? 'runner failed'}`;
      return undefined;
    }

    return normalizeFallbackResult(primary, payload);
  } catch (error) {
    primary.detail = `${primary.detail}; fallback failed: ${error instanceof Error ? error.message : 'unknown error'}`;
    return undefined;
  }
}

export function shouldTriggerIcaFallback(env: Env, status: IcaCheckStatus): boolean {
  return (
    (status === 'blocked' || status === 'error' || status === 'not_configured') &&
    Boolean(normalizeIcaFallbackUrl(env)) &&
    Boolean(env.ICA_FALLBACK_TRIGGER_TOKEN)
  );
}

export function normalizeIcaFallbackUrl(env: Pick<Env, 'ICA_FALLBACK_CHECK_URL'>): string {
  return (env.ICA_FALLBACK_CHECK_URL ?? '').trim().replace(/\/+$/, '');
}

export function mergeIcaFallbackDetail(primary: Pick<IcaCheckResult, 'status' | 'detail'>, fallbackDetail: string): string {
  return `External fallback after Cloudflare ${primary.status}: ${fallbackDetail || 'completed'}. Primary detail: ${primary.detail}`;
}

function normalizeFallbackResult(primary: IcaCheckResult, payload: Partial<IcaCheckResult>): IcaCheckResult {
  const status = payload.status;
  if (!isIcaCheckStatus(status)) {
    throw new Error(`Fallback returned invalid status: ${String(status)}`);
  }

  return {
    status,
    currentAppointment: typeof payload.currentAppointment === 'string' ? payload.currentAppointment : undefined,
    targetBefore: typeof payload.targetBefore === 'string' ? payload.targetBefore : primary.targetBefore,
    earliestDate: typeof payload.earliestDate === 'string' ? payload.earliestDate : undefined,
    earlierDates: Array.isArray(payload.earlierDates)
      ? payload.earlierDates.filter((date): date is string => typeof date === 'string')
      : [],
    checkedAt: typeof payload.checkedAt === 'string' ? payload.checkedAt : new Date().toISOString(),
    detail: mergeIcaFallbackDetail(primary, typeof payload.detail === 'string' ? payload.detail : ''),
    runner: 'external-fallback'
  };
}

async function recordSkipped(env: Env, result: IcaCheckResult): Promise<JobResult> {
  await getDb(env).logJob({ jobName: 'ica-appointment-check', status: result.status, detail: result.detail });
  return {
    inserted: 0,
    updated: 0,
    considered: 0,
    notified: 0,
    detail: result.detail
  };
}

function buildRadarItem(result: IcaCheckResult): RadarItem {
  const found = result.status === 'found_earlier';
  return {
    id: ICA_ITEM_ID,
    sourceId: 'ica-appointment',
    sourceType: 'ica',
    externalId: ICA_ITEM_EXTERNAL_ID,
    kind: 'opportunity',
    title: found ? `ICA earlier appointment available: ${result.earlierDates[0]}` : 'ICA appointment monitor',
    summary: result.detail,
    description: [
      `Target: before ${result.targetBefore}`,
      result.currentAppointment ? `Current: ${result.currentAppointment}` : undefined,
      result.earliestDate ? `Earliest selectable: ${result.earliestDate}` : undefined,
      `Status: ${result.status}`
    ]
      .filter(Boolean)
      .join('\n'),
    url: ICA_URL,
    imageUrl: undefined,
    location: 'ICA Services Centre',
    startsAt: result.earlierDates[0] ?? result.earliestDate,
    publishedAt: result.checkedAt,
    artists: [],
    topics: ['ICA appointment', 'Singapore immigration'],
    raw: {
      status: result.status,
      targetBefore: result.targetBefore,
      earliestDate: result.earliestDate,
      earliestEarlierDate: result.earlierDates[0],
      checkedAt: result.checkedAt,
      runner: result.runner ?? 'cloudflare-browser-run'
    },
    score: found ? 100 : result.status === 'ok' ? 74 : 45,
    status: 'tracking'
  };
}

function extractCurrentAppointment(text: string): string | undefined {
  return text.match(/Current Appointment\s*:\s*([^\n]+)/)?.[1]?.trim();
}

export function extractPostProceedError(text: string): string | undefined {
  if (text.includes('Error in application')) {
    return 'ICA returned an application error after Proceed. Check that the application ID and service type are correct.';
  }

  if (/Something went wrong\.?\s*Please try again\.?/i.test(text)) {
    return 'ICA returned "Something went wrong. Please try again." after Proceed. The checker reached the application-ID step, but ICA did not expose appointment data.';
  }

  return undefined;
}

function targetBefore(env: Env): string {
  return env.ICA_TARGET_BEFORE || '2026-07-01';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isVerificationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /captcha|verification|access denied|forbidden|blocked/i.test(message);
}

function isIcaCheckStatus(value: unknown): value is IcaCheckStatus {
  return value === 'ok' || value === 'found_earlier' || value === 'blocked' || value === 'not_configured' || value === 'error';
}

function redactApplicationId(value: string | undefined): string {
  if (!value) return 'not configured';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function pageDiagnostic(page: BrowserPage): Promise<string> {
  return page.evaluate(() => {
    const text = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 420);
    const selectors = {
      inputCombobox: document.querySelectorAll('input[role="combobox"]').length,
      roleCombobox: document.querySelectorAll('[role="combobox"]').length,
      ngSelect: document.querySelectorAll('ng-select, .ng-select-container').length,
      buttons: document.querySelectorAll('button').length
    };
    return `title="${document.title}", url="${location.href}", selectors=${JSON.stringify(selectors)}, text="${text}"`;
  });
}
