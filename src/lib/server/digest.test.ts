import { describe, expect, it } from 'vitest';
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
});
