import { Lunar, Solar } from 'lunar-javascript';
import { enrichDate, type Milestone } from './milestones';
import type { DateReminder } from './types';

type Ymd = { year: number; month: number; day: number };

const singaporeTimeZone = 'Asia/Singapore';

export type ReminderView = DateReminder & {
  nextDate: string;
  daysLeft: number;
  dateLabel: string;
  daysSince?: number;
  ageLabel?: string;
  originDate?: string;
  upcomingMilestones: Milestone[];
};

export function enrichReminder(reminder: DateReminder, now = new Date()): ReminderView {
  const today = todayInSingapore(now);
  const nextDate = nextOccurrence(reminder, today);
  const enrichment = enrichDate(reminder, today);
  return {
    ...reminder,
    nextDate: formatYmd(nextDate),
    daysLeft: diffDays(today, nextDate),
    dateLabel: formatReminderDate(reminder, nextDate),
    ...enrichment,
  };
}

export function sortReminders(reminders: DateReminder[], now = new Date()): ReminderView[] {
  return reminders
    .filter((reminder) => reminder.enabled)
    .map((reminder) => enrichReminder(reminder, now))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.daysLeft - b.daysLeft || a.title.localeCompare(b.title));
}

export function nextOccurrence(reminder: DateReminder, today = todayInSingapore()): Date {
  if (reminder.calendarType === 'lunar') {
    const startYear = solarToLunar(today).year;
    const thisYear = lunarToSolar({
      year: startYear,
      month: reminder.month,
      day: reminder.day,
      isLeapMonth: reminder.lunarIsLeapMonth
    });
    if (reminder.repeat === 'none' || diffDays(today, thisYear) >= 0) return thisYear;
    return lunarToSolar({
      year: startYear + 1,
      month: reminder.month,
      day: reminder.day,
      isLeapMonth: reminder.lunarIsLeapMonth
    });
  }

  const year = reminder.year ?? today.getUTCFullYear();
  const thisYear = utcDate(year, reminder.month, reminder.day);
  if (reminder.repeat === 'none') return thisYear;
  const currentYearDate = utcDate(today.getUTCFullYear(), reminder.month, reminder.day);
  if (diffDays(today, currentYearDate) >= 0) return currentYearDate;
  return utcDate(today.getUTCFullYear() + 1, reminder.month, reminder.day);
}

export function formatReminderDate(reminder: DateReminder, date: Date): string {
  if (reminder.calendarType === 'lunar') {
    const lunar = solarToLunar(date);
    const leap = reminder.lunarIsLeapMonth ? '闰' : '';
    return `农历${leap}${lunar.monthName}月${lunar.dayName} · ${formatYmd(date)}`;
  }
  return `公历${pad2(reminder.month)}月${pad2(reminder.day)}日 · ${formatYmd(date)}`;
}

export function todayInSingapore(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: singaporeTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {});
  return utcDate(Number(parts.year), Number(parts.month), Number(parts.day));
}

function solarToLunar(date: Date) {
  const solar = Solar.fromYmd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  const lunar = solar.getLunar();
  return {
    year: lunar.getYear(),
    month: lunar.getMonth(),
    day: lunar.getDay(),
    monthName: lunar.getMonthInChinese(),
    dayName: lunar.getDayInChinese()
  };
}

function lunarToSolar(input: Ymd & { isLeapMonth: boolean }): Date {
  const lunar = Lunar.fromYmd(input.year, input.month, input.day, 0, input.isLeapMonth);
  const solar = lunar.getSolar();
  return utcDate(solar.getYear(), solar.getMonth(), solar.getDay());
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function formatYmd(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
