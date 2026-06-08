import { reasonForItem } from './scoring';
import type { Digest, RadarItem } from './types';

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

function digestItem(item: RadarItem): Digest['sections'][number]['items'][number] {
  return {
    title: item.title,
    summary: item.summary,
    reason: reasonForItem(item),
    url: item.url
  };
}
