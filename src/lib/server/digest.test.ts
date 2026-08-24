import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildReminderDigestMessage, buildTemplateDigest, renderTelegramDigest } from './digest';
import { demoItems } from './seed';
import type { DateReminder } from './types';

describe('digest', () => {
  it('groups concerts and trend items', () => {
    const digest = buildTemplateDigest(demoItems);
    expect(digest.sections.map((section) => section.title)).toContain('演出与活动');
    expect(digest.sections.map((section) => section.title)).toContain('趋势与机会');
  });

  it('renders a Telegram-friendly message', () => {
    const message = renderTelegramDigest(buildTemplateDigest(demoItems));
    expect(message).toContain('个人雷达 · 每日摘要');
    expect(message).toContain('TWICE');
  });

  it('builds a standalone dates message that does not include trend copy', () => {
    const today = new Date();
    const reminder: DateReminder = {
      id: 'r1',
      title: '测试生日',
      calendarType: 'gregorian',
      category: 'birthday',
      year: today.getFullYear() - 30,
      month: today.getMonth() + 1,
      day: today.getDate(),
      lunarIsLeapMonth: false,
      repeat: 'annual',
      note: '',
      pinned: false,
      enabled: true,
      remindDaysBefore: [0, 1, 7]
    };

    const message = buildReminderDigestMessage([reminder]);
    expect(message).toBeTruthy();
    expect(message).toContain('个人雷达 · 日期提醒');
    expect(message).toContain('测试生日');
    expect(message).not.toContain('趋势与机会');
    expect(message).not.toContain('个人雷达 · 每日摘要');
  });

  it('returns null when there are no reminders', () => {
    expect(buildReminderDigestMessage([])).toBeNull();
  });

  it('does not announce a holiday that is already over', () => {
    // 七夕 2026 fell on 2026-08-19, so nothing should go out on the 20th.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T09:00:00+08:00'));

    const reminder: DateReminder = {
      id: 'r2',
      title: '恋爱纪念',
      calendarType: 'gregorian',
      category: 'anniversary',
      year: 2026,
      month: 1,
      day: 1,
      lunarIsLeapMonth: false,
      repeat: 'annual',
      note: '',
      pinned: false,
      enabled: true,
      remindDaysBefore: [0, 1, 7]
    };

    expect(buildReminderDigestMessage([reminder])).toBeNull();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
