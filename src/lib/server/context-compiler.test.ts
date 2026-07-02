import { describe, expect, it } from 'vitest';
import { followUpQueryFromTitle } from './context-compiler';

describe('followUpQueryFromTitle', () => {
  it('builds a follow-up query from an english title, dropping the outlet', () => {
    expect(
      followUpQueryFromTitle('Chinese robot appliance maker Dreame Tech mulling IPO in Hong Kong - The Edge Singapore')
    ).toBe('Chinese robot appliance maker Dreame Tech mulling IPO latest');
  });

  it('handles chinese titles', () => {
    const query = followUpQueryFromTitle('追觅科技考虑在香港IPO');
    expect(query).toContain('追觅科技');
    expect(query).toContain('最新');
  });

  it('strips html entities and quotes', () => {
    const query = followUpQueryFromTitle('BYD&nbsp;expands "mega" factory - Reuters');
    expect(query).not.toContain('&nbsp;');
    expect(query).not.toContain('"');
  });
});
