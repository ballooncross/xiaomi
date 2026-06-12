import puppeteer from '@cloudflare/puppeteer';
import { getDb } from './db';
import { sendTelegramMessage } from './telegram';
import type { Env, JobResult, RadarItem } from './types';

const ICA_URL = 'https://eservices.ica.gov.sg/eappt/serviceselection';
const ICA_ITEM_EXTERNAL_ID = 'ica-completion-formalities-earlier-slot';
const ICA_ITEM_ID = 'ica-appointment-earlier-slot';
const PAGE_TIMEOUT_MS = 45_000;
const SHORT_TIMEOUT_MS = 20_000;

type IcaCheckStatus = 'ok' | 'found_earlier' | 'blocked' | 'not_configured' | 'error';

type IcaCheckResult = {
  status: IcaCheckStatus;
  currentAppointment?: string;
  targetBefore: string;
  earliestDate?: string;
  earlierDates: string[];
  checkedAt: string;
  detail: string;
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
      detail: 'ICA checker is disabled'
    });
  }

  if (!env.ICA_APPLICATION_ID || !env.BROWSER) {
    return recordSkipped(env, {
      status: 'not_configured',
      targetBefore: targetBefore(env),
      earlierDates: [],
      checkedAt: new Date().toISOString(),
      detail: 'ICA_APPLICATION_ID or Browser Run binding is missing'
    });
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
      detail: error instanceof Error ? error.message : 'ICA checker failed'
    };
  }

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
    await page.goto(ICA_URL, { waitUntil: 'networkidle2', timeout: PAGE_TIMEOUT_MS });

    await selectCompletionFormalitiesService(page);
    await typeApplicationId(page, env.ICA_APPLICATION_ID ?? '');
    await clickButtonByText(page, 'Proceed');
    await page.waitForFunction(
      () => document.body.innerText.includes('Update Appointment') || document.body.innerText.includes('Error in application'),
      { timeout: PAGE_TIMEOUT_MS }
    );

    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('Error in application')) throw new Error('ICA returned application error after authentication');
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

async function selectCompletionFormalitiesService(page: BrowserPage) {
  await page.waitForSelector('input[role="combobox"]', { visible: true });
  await page.click('input[role="combobox"]');
  await sleep(500);

  const selectedByText = await page.evaluate(() => {
    const option = Array.from(document.querySelectorAll('[role="option"], mat-option, .mat-option')).find((candidate) =>
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
    const telegram = await sendTelegramMessage(env, message);
    notified = telegram.ok ? 1 : 0;
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
      checkedAt: result.checkedAt
    },
    score: found ? 100 : result.status === 'ok' ? 74 : 45,
    status: 'tracking'
  };
}

function extractCurrentAppointment(text: string): string | undefined {
  return text.match(/Current Appointment\s*:\s*([^\n]+)/)?.[1]?.trim();
}

function targetBefore(env: Env): string {
  return env.ICA_TARGET_BEFORE || '2026-07-01';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isVerificationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /captcha|verification|timeout|application error/i.test(message);
}

function redactApplicationId(value: string | undefined): string {
  if (!value) return 'not configured';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
