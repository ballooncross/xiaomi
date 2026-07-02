import { Lunar, Solar } from 'lunar-javascript';
import type { DateCategory, DateReminder } from './types';

export type MilestoneKind = 'age' | 'day_count' | 'vaccination' | 'tradition' | 'holiday';

export type Milestone = {
  label: string;
  dayNumber: number;
  targetDate: string;
  daysFromNow: number;
  kind: MilestoneKind;
};

export type DateEnrichment = {
  daysSince?: number;
  ageLabel?: string;
  originDate?: string;
  upcomingMilestones: Milestone[];
};

const CHILD_MILESTONES = [
  { day: 30, label: '满月', kind: 'age' as const },
  { day: 100, label: '百天', kind: 'day_count' as const },
  { day: 182, label: '半岁', kind: 'age' as const },
  { day: 365, label: '周岁', kind: 'age' as const },
  { day: 730, label: '两周岁', kind: 'age' as const },
  { day: 1095, label: '三周岁', kind: 'age' as const },
];

const CHILD_VACCINATION = [
  { day: 0, label: '出生·乙肝疫苗第1剂', kind: 'vaccination' as const },
  { day: 30, label: '1月龄·乙肝疫苗第2剂', kind: 'vaccination' as const },
  { day: 60, label: '2月龄·脊灰/百白破', kind: 'vaccination' as const },
  { day: 90, label: '3月龄·脊灰/百白破第2剂', kind: 'vaccination' as const },
  { day: 120, label: '4月龄·脊灰/百白破第3剂', kind: 'vaccination' as const },
  { day: 182, label: '6月龄·乙肝第3剂/流感', kind: 'vaccination' as const },
  { day: 243, label: '8月龄·麻腮风/乙脑', kind: 'vaccination' as const },
  { day: 365, label: '12月龄·水痘/甲肝', kind: 'vaccination' as const },
  { day: 548, label: '18月龄·百白破/麻腮风加强', kind: 'vaccination' as const },
  { day: 730, label: '2岁·乙脑/甲肝加强', kind: 'vaccination' as const },
  { day: 1095, label: '3岁·流脑A+C加强', kind: 'vaccination' as const },
  { day: 1460, label: '4岁·脊灰加强', kind: 'vaccination' as const },
  { day: 2190, label: '6岁·百白破/麻腮风/乙脑加强', kind: 'vaccination' as const },
];

const ANNIVERSARY_MILESTONES = [
  { day: 100, label: '百天纪念', kind: 'day_count' as const },
  { day: 200, label: '200天', kind: 'day_count' as const },
  { day: 365, label: '一周年', kind: 'day_count' as const },
  { day: 500, label: '500天', kind: 'day_count' as const },
  { day: 520, label: '520天·我爱你', kind: 'day_count' as const },
  { day: 730, label: '两周年', kind: 'day_count' as const },
  { day: 1000, label: '千日纪念', kind: 'day_count' as const },
  { day: 1095, label: '三周年', kind: 'day_count' as const },
  { day: 1314, label: '1314天·一生一世', kind: 'day_count' as const },
  { day: 1825, label: '五周年·木婚', kind: 'tradition' as const },
  { day: 2000, label: '2000天', kind: 'day_count' as const },
  { day: 2555, label: '七周年·毛婚', kind: 'tradition' as const },
  { day: 3650, label: '十周年·锡婚', kind: 'tradition' as const },
  { day: 5000, label: '5000天', kind: 'day_count' as const },
  { day: 5475, label: '十五周年·水晶婚', kind: 'tradition' as const },
  { day: 7300, label: '二十周年·瓷婚', kind: 'tradition' as const },
  { day: 9125, label: '二十五周年·银婚', kind: 'tradition' as const },
  { day: 10000, label: '万日纪念', kind: 'day_count' as const },
  { day: 10950, label: '三十周年·珍珠婚', kind: 'tradition' as const },
  { day: 18250, label: '五十周年·金婚', kind: 'tradition' as const },
];

const MEMORIAL_MILESTONES = [
  { day: 100, label: '百日', kind: 'day_count' as const },
  { day: 365, label: '一周年', kind: 'day_count' as const },
  { day: 1000, label: '千日', kind: 'day_count' as const },
  { day: 1825, label: '五周年', kind: 'day_count' as const },
  { day: 3650, label: '十周年', kind: 'day_count' as const },
];

const GENERIC_MILESTONES = [
  { day: 100, label: '100天', kind: 'day_count' as const },
  { day: 365, label: '一周年', kind: 'day_count' as const },
  { day: 1000, label: '1000天', kind: 'day_count' as const },
  { day: 5000, label: '5000天', kind: 'day_count' as const },
  { day: 10000, label: '10000天', kind: 'day_count' as const },
];

type HolidayDef = { month: number; day: number; label: string; lunar?: boolean };

const ANNIVERSARY_HOLIDAYS: HolidayDef[] = [
  { month: 2, day: 14, label: '情人节' },
  { month: 3, day: 14, label: '白色情人节' },
  { month: 5, day: 20, label: '520·我爱你' },
  { month: 7, day: 7, label: '七夕', lunar: true },
  { month: 12, day: 24, label: '平安夜' },
  { month: 12, day: 25, label: '圣诞节' },
];

const CHILD_HOLIDAYS: HolidayDef[] = [
  { month: 6, day: 1, label: '儿童节' },
];

function getHolidaysForCategory(category: DateCategory): HolidayDef[] {
  if (category === 'anniversary') return ANNIVERSARY_HOLIDAYS;
  if (category === 'child_birthday') return CHILD_HOLIDAYS;
  return [];
}

function resolveHolidays(holidays: HolidayDef[], today: Date, windowDays: number): Milestone[] {
  const results: Milestone[] = [];
  const currentYear = today.getUTCFullYear();

  for (const h of holidays) {
    for (const year of [currentYear, currentYear + 1]) {
      let date: Date;
      if (h.lunar) {
        try {
          const lunar = Lunar.fromYmd(year, h.month, h.day, 0, false);
          const solar = lunar.getSolar();
          date = utcDate(solar.getYear(), solar.getMonth(), solar.getDay());
        } catch {
          continue;
        }
      } else {
        date = utcDate(year, h.month, h.day);
      }
      const daysFromNow = diffDays(today, date);
      if (daysFromNow >= -1 && daysFromNow <= windowDays) {
        results.push({
          label: h.label,
          dayNumber: 0,
          targetDate: formatYmd(date),
          daysFromNow,
          kind: 'holiday',
        });
      }
    }
  }

  return results;
}

export function enrichDate(reminder: DateReminder, today: Date): DateEnrichment {
  const windowDays = 60;
  const holidays = resolveHolidays(getHolidaysForCategory(reminder.category), today, windowDays);

  if (!reminder.year) {
    return { upcomingMilestones: holidays.sort((a, b) => a.daysFromNow - b.daysFromNow) };
  }

  const originDate = resolveOriginDate(reminder);
  if (!originDate) {
    return { upcomingMilestones: holidays.sort((a, b) => a.daysFromNow - b.daysFromNow) };
  }

  const daysSince = diffDays(originDate, today);
  const ageLabel = buildAgeLabel(reminder.category, daysSince);
  const milestones = getMilestonesForCategory(reminder.category);
  const dayCountMilestones = milestones
    .filter((m) => {
      const daysFromNow = m.day - daysSince;
      return daysFromNow >= -1 && daysFromNow <= windowDays;
    })
    .map((m) => ({
      label: m.label,
      dayNumber: m.day,
      targetDate: formatYmd(addDays(originDate, m.day)),
      daysFromNow: m.day - daysSince,
      kind: m.kind,
    }));

  const upcomingMilestones = [...dayCountMilestones, ...holidays]
    .sort((a, b) => a.daysFromNow - b.daysFromNow);

  return {
    daysSince,
    ageLabel,
    originDate: formatYmd(originDate),
    upcomingMilestones,
  };
}

export function getAllUpcomingMilestones(
  reminders: Array<DateReminder & { nextDate: string; daysLeft: number }>,
  today: Date,
  windowDays = 30
): Array<Milestone & { reminderTitle: string; reminderId: string }> {
  const results: Array<Milestone & { reminderTitle: string; reminderId: string }> = [];
  const seenHolidays = new Set<string>();

  for (const reminder of reminders) {
    const holidays = resolveHolidays(getHolidaysForCategory(reminder.category), today, windowDays);
    for (const h of holidays) {
      const key = `${h.label}:${h.targetDate}`;
      if (seenHolidays.has(key)) continue;
      seenHolidays.add(key);
      results.push({ ...h, reminderTitle: reminder.title, reminderId: reminder.id });
    }

    if (!reminder.year) continue;
    const originDate = resolveOriginDate(reminder);
    if (!originDate) continue;
    const daysSince = diffDays(originDate, today);
    const milestones = getMilestonesForCategory(reminder.category);

    for (const m of milestones) {
      const daysFromNow = m.day - daysSince;
      if (daysFromNow >= 0 && daysFromNow <= windowDays) {
        results.push({
          label: m.label,
          dayNumber: m.day,
          targetDate: formatYmd(addDays(originDate, m.day)),
          daysFromNow,
          kind: m.kind,
          reminderTitle: reminder.title,
          reminderId: reminder.id,
        });
      }
    }
  }

  return results.sort((a, b) => a.daysFromNow - b.daysFromNow);
}

function resolveOriginDate(reminder: DateReminder): Date | null {
  if (!reminder.year) return null;

  if (reminder.calendarType === 'lunar') {
    try {
      const lunar = Lunar.fromYmd(reminder.year, reminder.month, reminder.day, 0, reminder.lunarIsLeapMonth);
      const solar = lunar.getSolar();
      return utcDate(solar.getYear(), solar.getMonth(), solar.getDay());
    } catch {
      return null;
    }
  }

  return utcDate(reminder.year, reminder.month, reminder.day);
}

function getMilestonesForCategory(category: DateCategory) {
  switch (category) {
    case 'child_birthday':
      return [...CHILD_MILESTONES, ...CHILD_VACCINATION];
    case 'anniversary':
      return ANNIVERSARY_MILESTONES;
    case 'memorial':
      return MEMORIAL_MILESTONES;
    case 'birthday':
      return GENERIC_MILESTONES;
    default:
      return GENERIC_MILESTONES;
  }
}

function buildAgeLabel(category: DateCategory, daysSince: number): string {
  if (daysSince < 0) return '';

  if (category === 'child_birthday') {
    if (daysSince < 30) return `出生${daysSince}天`;
    if (daysSince < 365) {
      const months = Math.floor(daysSince / 30.44);
      const remainDays = daysSince - Math.floor(months * 30.44);
      return remainDays > 0 ? `${months}个月${remainDays}天` : `${months}个月`;
    }
    const years = Math.floor(daysSince / 365.25);
    const remainMonths = Math.floor((daysSince - years * 365.25) / 30.44);
    return remainMonths > 0 ? `${years}岁${remainMonths}个月` : `${years}岁`;
  }

  if (category === 'anniversary' || category === 'memorial') {
    if (daysSince < 365) return `${daysSince}天`;
    const years = Math.floor(daysSince / 365.25);
    const remainDays = Math.floor(daysSince - years * 365.25);
    return remainDays > 0 ? `${years}年${remainDays}天` : `${years}年`;
  }

  if (category === 'birthday') {
    const years = Math.floor(daysSince / 365.25);
    return `${years}岁`;
  }

  return `${daysSince}天`;
}

function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function formatYmd(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
