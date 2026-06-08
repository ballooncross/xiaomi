import { describe, expect, it } from 'vitest';
import { buildTemplateDigest, renderTelegramDigest } from './digest';
import { demoItems } from './seed';

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
});
