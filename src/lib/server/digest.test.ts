import { describe, expect, it } from 'vitest';
import { buildTemplateDigest, renderTelegramDigest } from './digest';
import { demoItems } from './seed';

describe('digest', () => {
  it('groups concerts and trend items', () => {
    const digest = buildTemplateDigest(demoItems);
    expect(digest.sections.map((section) => section.title)).toContain('Concerts & events');
    expect(digest.sections.map((section) => section.title)).toContain('Trends & opportunities');
  });

  it('renders a Telegram-friendly message', () => {
    const message = renderTelegramDigest(buildTemplateDigest(demoItems));
    expect(message).toContain('Personal Radar · Daily Brew');
    expect(message).toContain('TWICE');
  });
});
