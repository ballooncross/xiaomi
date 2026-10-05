import { Solar } from 'lunar-javascript';

export type Ymd = { year: number; month: number; day: number };

export type LunarDate = {
  year: number;
  month: number;
  day: number;
  isLeapMonth: boolean;
  /** 八月, 闰六月, 正月, 冬月, 腊月 */
  monthLabel: string;
  dayLabel: string;
  /** 丙午马年 */
  yearLabel: string;
};

export type CalendarDay = Ymd & {
  value: string;
  inMonth: boolean;
  weekend: boolean;
  lunar: LunarDate;
  note: string;
  noteKind: 'festival' | 'term' | 'month' | 'day';
};

export const MIN_CALENDAR_YEAR = 1901;
export const MAX_CALENDAR_YEAR = 2099;
export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

const highlightedSolarFestivals = new Set(['元旦节', '情人节', '妇女节', '劳动节', '儿童节', '教师节', '国庆节', '圣诞节']);

export function parseYmd(value: string): Ymd | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function formatYmd({ year, month, day }: Ymd): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function todayInSingaporeYmd(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(now);
}

export function lunarDate({ year, month, day }: Ymd): LunarDate {
  const lunar = Solar.fromYmd(year, month, day).getLunar();
  return {
    year: lunar.getYear(),
    month: Math.abs(lunar.getMonth()),
    day: lunar.getDay(),
    isLeapMonth: lunar.getMonth() < 0,
    monthLabel: `${lunar.getMonthInChinese()}月`,
    dayLabel: lunar.getDayInChinese(),
    yearLabel: `${lunar.getYearInGanZhi()}${lunar.getYearShengXiao()}年`
  };
}

export function weekdayLabel({ year, month, day }: Ymd): string {
  return `周${WEEKDAY_LABELS[(new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7]}`;
}

/** Six Monday-first weeks covering the month, so the grid height never changes. */
export function monthGrid(year: number, month: number): CalendarDay[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const leading = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, 1 + index - leading));
    const ymd = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
    const weekday = date.getUTCDay();
    return {
      ...ymd,
      value: formatYmd(ymd),
      inMonth: ymd.month === month,
      weekend: weekday === 0 || weekday === 6,
      lunar: lunarDate(ymd),
      ...dayNote(ymd)
    };
  });
}

export function monthCaption(year: number, month: number): string {
  const first = lunarDate({ year, month, day: 1 });
  const last = lunarDate({ year, month, day: new Date(Date.UTC(year, month, 0)).getUTCDate() });
  if (first.yearLabel !== last.yearLabel) {
    return `${first.yearLabel}${first.monthLabel} – ${last.yearLabel}${last.monthLabel}`;
  }
  const months = first.monthLabel === last.monthLabel ? first.monthLabel : `${first.monthLabel} – ${last.monthLabel}`;
  return `${first.yearLabel} · ${months}`;
}

function dayNote({ year, month, day }: Ymd): Pick<CalendarDay, 'note' | 'noteKind'> {
  const solar = Solar.fromYmd(year, month, day);
  const lunar = solar.getLunar();
  const festival =
    lunar.getFestivals()[0] ?? solar.getFestivals().find((name) => highlightedSolarFestivals.has(name));
  if (festival) return { note: festival, noteKind: 'festival' };
  const term = lunar.getJieQi();
  if (term) return { note: term, noteKind: 'term' };
  if (lunar.getDay() === 1) return { note: `${lunar.getMonthInChinese()}月`, noteKind: 'month' };
  return { note: lunar.getDayInChinese(), noteKind: 'day' };
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
