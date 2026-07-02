import { describe, expect, it } from 'vitest';
import { enrichDate, getAllUpcomingMilestones } from './milestones';
import type { DateReminder } from './types';

function makeReminder(overrides: Partial<DateReminder> = {}): DateReminder {
  return {
    id: 'test',
    title: 'Test',
    calendarType: 'gregorian',
    category: 'birthday',
    year: 2000,
    month: 1,
    day: 15,
    lunarIsLeapMonth: false,
    repeat: 'annual',
    note: '',
    pinned: false,
    enabled: true,
    remindDaysBefore: [0, 1, 7],
    ...overrides,
  };
}

describe('enrichDate', () => {
  it('returns empty enrichment when no origin year', () => {
    const reminder = makeReminder({ year: undefined });
    const result = enrichDate(reminder, new Date(Date.UTC(2026, 6, 1)));
    expect(result.daysSince).toBeUndefined();
    expect(result.upcomingMilestones).toEqual([]);
  });

  it('computes daysSince for gregorian birthday', () => {
    const reminder = makeReminder({ year: 2026, month: 1, day: 1, category: 'birthday' });
    const today = new Date(Date.UTC(2026, 0, 11));
    const result = enrichDate(reminder, today);
    expect(result.daysSince).toBe(10);
    expect(result.ageLabel).toBe('0岁');
  });

  it('computes age label for adult birthday', () => {
    const reminder = makeReminder({ year: 1990, month: 6, day: 15, category: 'birthday' });
    const today = new Date(Date.UTC(2026, 6, 1));
    const result = enrichDate(reminder, today);
    expect(result.ageLabel).toBe('36岁');
  });

  it('computes child age in months for infant', () => {
    const reminder = makeReminder({ year: 2026, month: 3, day: 1, category: 'child_birthday' });
    const today = new Date(Date.UTC(2026, 5, 1));
    const result = enrichDate(reminder, today);
    expect(result.daysSince).toBe(92);
    expect(result.ageLabel).toContain('个月');
  });

  it('shows upcoming milestones for child birthday', () => {
    const reminder = makeReminder({ year: 2026, month: 5, day: 1, category: 'child_birthday' });
    const today = new Date(Date.UTC(2026, 7, 1));
    const result = enrichDate(reminder, today);
    expect(result.daysSince).toBe(92);
    expect(result.upcomingMilestones.length).toBeGreaterThan(0);
    const labels = result.upcomingMilestones.map((m) => m.label);
    expect(labels).toContain('百天');
  });

  it('shows 520 and 1314 milestones for anniversary', () => {
    const reminder = makeReminder({ year: 2025, month: 1, day: 1, category: 'anniversary' });
    const today = new Date(Date.UTC(2025, 3, 1));
    const result = enrichDate(reminder, today);
    expect(result.daysSince).toBe(90);
    const labels = result.upcomingMilestones.map((m) => m.label);
    expect(labels).toContain('百天纪念');
  });

  it('computes anniversary day count label', () => {
    const reminder = makeReminder({ year: 2020, month: 1, day: 1, category: 'anniversary' });
    const today = new Date(Date.UTC(2026, 6, 1));
    const result = enrichDate(reminder, today);
    expect(result.daysSince).toBe(2373);
    expect(result.ageLabel).toContain('年');
  });

  it('handles lunar origin date', () => {
    const reminder = makeReminder({
      calendarType: 'lunar',
      category: 'child_birthday',
      year: 2026,
      month: 1,
      day: 1,
    });
    const today = new Date(Date.UTC(2026, 6, 1));
    const result = enrichDate(reminder, today);
    expect(result.daysSince).toBeGreaterThan(0);
    expect(result.originDate).toBeTruthy();
  });

  it('includes holiday milestones for anniversary category', () => {
    const reminder = makeReminder({ year: 2025, month: 1, day: 1, category: 'anniversary' });
    const today = new Date(Date.UTC(2025, 1, 10));
    const result = enrichDate(reminder, today);
    const holidayLabels = result.upcomingMilestones
      .filter((m) => m.kind === 'holiday')
      .map((m) => m.label);
    expect(holidayLabels).toContain('情人节');
  });

  it('includes holidays even without origin year for anniversary', () => {
    const reminder = makeReminder({ year: undefined, category: 'anniversary' });
    const today = new Date(Date.UTC(2025, 1, 10));
    const result = enrichDate(reminder, today);
    expect(result.daysSince).toBeUndefined();
    const holidayLabels = result.upcomingMilestones
      .filter((m) => m.kind === 'holiday')
      .map((m) => m.label);
    expect(holidayLabels).toContain('情人节');
  });

  it('includes 儿童节 for child_birthday category', () => {
    const reminder = makeReminder({ year: 2025, month: 1, day: 1, category: 'child_birthday' });
    const today = new Date(Date.UTC(2025, 4, 15));
    const result = enrichDate(reminder, today);
    const holidayLabels = result.upcomingMilestones
      .filter((m) => m.kind === 'holiday')
      .map((m) => m.label);
    expect(holidayLabels).toContain('儿童节');
  });

  it('does not include holidays for regular birthday category', () => {
    const reminder = makeReminder({ year: 2000, month: 1, day: 15, category: 'birthday' });
    const today = new Date(Date.UTC(2025, 1, 10));
    const result = enrichDate(reminder, today);
    const holidays = result.upcomingMilestones.filter((m) => m.kind === 'holiday');
    expect(holidays).toEqual([]);
  });
});

describe('getAllUpcomingMilestones', () => {
  it('collects milestones across multiple reminders', () => {
    const child = makeReminder({
      id: 'child',
      title: '宝宝',
      category: 'child_birthday',
      year: 2026,
      month: 6,
      day: 1,
    });
    const anniversary = makeReminder({
      id: 'anniv',
      title: '结婚',
      category: 'anniversary',
      year: 2026,
      month: 6,
      day: 1,
    });
    const today = new Date(Date.UTC(2026, 6, 1));
    const remindersWithView = [child, anniversary].map((r) => ({
      ...r,
      nextDate: '2027-06-01',
      daysLeft: 335,
    }));

    const milestones = getAllUpcomingMilestones(remindersWithView, today, 10);
    expect(milestones.length).toBeGreaterThan(0);
    const titles = milestones.map((m) => m.reminderTitle);
    expect(titles).toContain('宝宝');
  });

  it('returns empty for birthday reminders without year', () => {
    const reminder = makeReminder({ year: undefined, category: 'birthday' });
    const today = new Date(Date.UTC(2026, 6, 1));
    const remindersWithView = [{ ...reminder, nextDate: '2027-01-15', daysLeft: 198 }];
    const milestones = getAllUpcomingMilestones(remindersWithView, today, 30);
    expect(milestones).toEqual([]);
  });

  it('deduplicates holidays across multiple anniversary reminders', () => {
    const r1 = makeReminder({ id: 'a1', title: '恋爱', category: 'anniversary', year: undefined });
    const r2 = makeReminder({ id: 'a2', title: '结婚', category: 'anniversary', year: undefined });
    const today = new Date(Date.UTC(2025, 1, 10));
    const remindersWithView = [r1, r2].map((r) => ({ ...r, nextDate: '', daysLeft: 0 }));
    const milestones = getAllUpcomingMilestones(remindersWithView, today, 10);
    const valentineCount = milestones.filter((m) => m.label === '情人节').length;
    expect(valentineCount).toBe(1);
  });
});
