import { describe, expect, it } from 'vitest';
import { enrichReminder } from './lunar';
import { defaultDateReminders } from './seed';

describe('lunar reminders', () => {
  it('computes the imported lunar birthday countdown from the screenshot date', () => {
    const reminder = defaultDateReminders.find((item) => item.id === 'birthday-junjun-lunar');
    expect(reminder).toBeTruthy();

    const enriched = enrichReminder(reminder!, new Date('2026-06-07T00:00:00+08:00'));
    expect(enriched.daysLeft).toBe(232);
    expect(enriched.dateLabel).toContain('农历腊月十八');
  });
});
