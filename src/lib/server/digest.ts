import { sortReminders, todayInSingapore } from './lunar';
import { getAllUpcomingMilestones } from './milestones';
import { reasonForItem } from './scoring';
import type { DateReminder, Digest, RadarItem } from './types';

export function buildTemplateDigest(items: RadarItem[]): Digest {
  const activeItems = items.filter((item) => item.status !== 'dismissed').slice(0, 8);
  const concerts = activeItems.filter((item) => item.kind === 'concert').slice(0, 4);
  const trends = activeItems.filter((item) => item.kind !== 'concert').slice(0, 4);

  return {
    title: '个人雷达 · 每日摘要',
    sections: [
      {
        title: '演出与活动',
        items: concerts.map(digestItem)
      },
      {
        title: '趋势与机会',
        items: trends.map(digestItem)
      }
    ].filter((section) => section.items.length > 0)
  };
}

export function renderTelegramDigest(digest: Digest): string {
  const lines = [digest.title, ''];
  for (const section of digest.sections) {
    lines.push(section.title);
    section.items.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.title}`);
      lines.push(`   ${item.summary}`);
      lines.push(`   ${item.reason}`);
      if (item.url) lines.push(`   ${item.url}`);
    });
    lines.push('');
  }
  lines.push('打开应用可保存、重点跟踪或标记不相关。');
  return lines.join('\n').trim();
}

/** Standalone dates Telegram message (not appended under the bulky trend digest). */
export function buildReminderDigestMessage(reminders: DateReminder[]): string | null {
  const sorted = sortReminders(reminders);
  const upcoming = sorted
    .filter((reminder) => reminder.remindDaysBefore.includes(reminder.daysLeft))
    .slice(0, 6);

  const today = todayInSingapore();
  const milestones = getAllUpcomingMilestones(sorted, today, 1).slice(0, 4);

  if (upcoming.length === 0 && milestones.length === 0) return null;

  const lines: string[] = ['个人雷达 · 日期提醒', ''];
  if (upcoming.length > 0) {
    lines.push('生日与纪念日');
    for (const reminder of upcoming) {
      const dayText = reminder.daysLeft === 0 ? '今天' : `${reminder.daysLeft} 天后`;
      const ageText = reminder.ageLabel ? ` · ${reminder.ageLabel}` : '';
      lines.push(`${reminder.title} · ${dayText} · ${reminder.dateLabel}${ageText}`);
    }
  }

  if (milestones.length > 0) {
    if (upcoming.length > 0) lines.push('');
    lines.push('里程碑');
    for (const m of milestones) {
      const dayText = m.daysFromNow === 0 ? '今天' : `${m.daysFromNow} 天后`;
      lines.push(`${m.reminderTitle} · ${m.label} · 第${m.dayNumber}天 · ${dayText}`);
    }
  }

  return lines.join('\n').trim();
}

function digestItem(item: RadarItem): Digest['sections'][number]['items'][number] {
  return {
    title: item.title,
    summary: item.summary,
    reason: reasonForItem(item),
    url: item.url
  };
}
