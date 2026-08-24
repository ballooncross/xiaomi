import { describe, expect, it } from 'vitest';
import { enrichReminder, sortReminders } from './lunar';
import { defaultDateReminders } from './seed';
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
    ...overrides
  };
}

describe('lunar reminders', () => {
  it('computes the imported lunar birthday countdown from the screenshot date', () => {
    const reminder = defaultDateReminders.find((item) => item.id === 'birthday-junjun-lunar');
    expect(reminder).toBeTruthy();

    const enriched = enrichReminder(reminder!, new Date('2026-06-07T00:00:00+08:00'));
    expect(enriched.daysLeft).toBe(232);
    expect(enriched.dateLabel).toContain('农历腊月十八');
  });

  it('flags a one-off date that is already behind us', () => {
    const reminder = makeReminder({ repeat: 'none', year: 2026, month: 8, day: 19 });
    const enriched = enrichReminder(reminder, new Date('2026-08-20T09:00:00+08:00'));
    expect(enriched.daysLeft).toBe(-1);
    expect(enriched.hasPassed).toBe(true);
  });

  it('keeps repeating dates counting forward instead of going negative', () => {
    const reminder = makeReminder({ repeat: 'annual', year: 1990, month: 8, day: 19 });
    const enriched = enrichReminder(reminder, new Date('2026-08-20T09:00:00+08:00'));
    expect(enriched.daysLeft).toBeGreaterThan(0);
    expect(enriched.hasPassed).toBe(false);
    expect(enriched.nextDate).toBe('2027-08-19');
  });

  it('sorts passed one-off dates after upcoming ones', () => {
    const past = makeReminder({ id: 'past', title: '已过', repeat: 'none', year: 2026, month: 8, day: 19 });
    const soon = makeReminder({ id: 'soon', title: '将至', repeat: 'annual', year: 1990, month: 8, day: 25 });
    const sorted = sortReminders([past, soon], new Date('2026-08-20T09:00:00+08:00'));
    expect(sorted.map((r) => r.id)).toEqual(['soon', 'past']);
  });
});
