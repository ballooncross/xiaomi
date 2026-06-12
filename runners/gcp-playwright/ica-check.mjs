import { chromium } from 'playwright';

const ICA_URL = 'https://eservices.ica.gov.sg/eappt/serviceselection';
const PAGE_TIMEOUT_MS = 60_000;
const SHORT_TIMEOUT_MS = 20_000;
const SERVICE_SELECTOR = 'input[role="combobox"], ng-select, .ng-select-container, [role="combobox"]';

export async function checkIcaAppointment(options = {}) {
  const applicationId = options.applicationId ?? process.env.ICA_APPLICATION_ID;
  const targetBefore = options.targetBefore ?? process.env.ICA_TARGET_BEFORE ?? '2026-07-01';
  if (!applicationId) {
    return result('not_configured', targetBefore, 'ICA_APPLICATION_ID is missing');
  }

  const browser = await chromium.launch({ headless: options.headless ?? true });
  const page = await browser.newPage({
    viewport: { width: 1365, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
  });
  page.setDefaultTimeout(PAGE_TIMEOUT_MS);

  try {
    await page.goto(ICA_URL, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    await waitForIcaServicePage(page);
    await selectCompletionFormalitiesService(page);
    await typeApplicationId(page, applicationId);
    await clickButtonByText(page, 'Proceed');
    await page.waitForFunction(
      () => document.body.innerText.includes('Update Appointment') || document.body.innerText.includes('Error in application'),
      null,
      { timeout: PAGE_TIMEOUT_MS }
    );

    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('Error in application')) throw new Error('ICA returned application error after authentication');
    const currentAppointment = bodyText.match(/Current Appointment\s*:\s*([^\n]+)/)?.[1]?.trim();

    await clickButtonByText(page, 'Update Appointment');
    await page.waitForFunction(() => document.body.innerText.includes('Appointment Details'), null, {
      timeout: PAGE_TIMEOUT_MS
    });
    await openDatePicker(page);
    await showPreviousMonthIfPossible(page);

    const availableDates = await extractAvailableDates(page);
    const earlierDates = availableDates
      .map((item) => item.date)
      .filter((date) => date < targetBefore)
      .sort();
    const earliestDate = availableDates.map((item) => item.date).sort()[0];

    return {
      ...result(
        earlierDates.length > 0 ? 'found_earlier' : 'ok',
        targetBefore,
        earlierDates.length > 0
          ? `Found earlier ICA date ${earlierDates[0]}`
          : earliestDate
            ? `No ICA date before ${targetBefore}; earliest selectable date is ${earliestDate}`
            : `No selectable ICA dates found before ${targetBefore}`
      ),
      currentAppointment,
      earliestDate,
      earlierDates
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'ICA checker failed';
    return result(isVerificationError(detail) ? 'blocked' : 'error', targetBefore, detail);
  } finally {
    await browser.close();
  }
}

function result(status, targetBefore, detail) {
  return {
    status,
    targetBefore,
    earlierDates: [],
    checkedAt: new Date().toISOString(),
    detail,
    runner: 'external-fallback'
  };
}

async function waitForIcaServicePage(page) {
  try {
    await page.waitForFunction(
      (selector) => {
        const text = document.body?.innerText ?? '';
        return (
          Boolean(document.querySelector(selector)) ||
          /captcha|verification|access denied|forbidden|service unavailable|temporarily unavailable|blocked/i.test(text)
        );
      },
      SERVICE_SELECTOR,
      { timeout: PAGE_TIMEOUT_MS }
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

async function selectCompletionFormalitiesService(page) {
  await clickFirstVisible(page, SERVICE_SELECTOR);
  await page.waitForTimeout(500);

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

  await page.waitForFunction(() => document.body.innerText.includes('Group Application ID'), null, {
    timeout: SHORT_TIMEOUT_MS
  });
}

async function clickFirstVisible(page, selector) {
  const clicked = await page.evaluate((selectorText) => {
    const element = Array.from(document.querySelectorAll(selectorText)).find((candidate) => {
      const box = candidate.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    if (!element) return false;
    element.click();
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  }, selector);
  if (!clicked) throw new Error(`ICA service selector not clickable. ${await pageDiagnostic(page)}`);
}

async function typeApplicationId(page, applicationId) {
  await page.waitForSelector('input:not([role="combobox"])', { state: 'visible', timeout: SHORT_TIMEOUT_MS });
  await page.click('input:not([role="combobox"])', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('input:not([role="combobox"])', applicationId, { delay: 10 });
}

async function clickButtonByText(page, text) {
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

async function openDatePicker(page) {
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
  await page.waitForSelector('bs-datepicker-inline-container', { state: 'visible', timeout: SHORT_TIMEOUT_MS });
}

async function showPreviousMonthIfPossible(page) {
  await page.evaluate(() => {
    const previous = document.querySelector('bs-datepicker-navigation-view button.previous:not([disabled])');
    previous?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
  await page.waitForTimeout(600);
}

async function extractAvailableDates(page) {
  return page.evaluate(() => {
    const monthNumbers = {
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
          return { date: `${year}-${month}-${day}`, label: `${Number(day)} ${current[0]} ${year}` };
        });
    });
  });
}

function isVerificationError(message) {
  return /captcha|verification|timeout|application error|access denied|forbidden|blocked/i.test(message);
}

async function pageDiagnostic(page) {
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
