import { describe, expect, it } from 'vitest';
import { lunarDate, monthGrid } from '$lib/lunar-calendar';

describe('lunar calendar', () => {
  it('labels a Monday-first month grid with lunar days, month starts, festivals and solar terms', () => {
    const grid = monthGrid(2026, 10);
    const note = (value: string) => grid.find((day) => day.value === value)?.note;

    expect(grid).toHaveLength(42);
    expect(grid[0]).toMatchObject({ value: '2026-09-28', inMonth: false });
    expect(note('2026-10-01')).toBe('国庆节');
    expect(note('2026-10-05')).toBe('廿五');
    expect(note('2026-10-08')).toBe('寒露');
    expect(note('2026-10-10')).toBe('九月');
    expect(note('2026-10-18')).toBe('重阳节');
  });

  it('keeps the leap flag out of the stored month and labels the leap month once', () => {
    expect(lunarDate({ year: 2025, month: 7, day: 25 })).toMatchObject({
      month: 6,
      day: 1,
      isLeapMonth: true,
      monthLabel: '闰六月',
      dayLabel: '初一'
    });
  });
});
