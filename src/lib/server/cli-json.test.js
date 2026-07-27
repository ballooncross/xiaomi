import { describe, expect, it } from 'vitest';
import { parseFirstJsonObject } from '../../../scripts/lib/cli-json.mjs';

describe('CLI JSON parsing', () => {
  it('ignores text before and after the first complete JSON object', () => {
    expect(
      parseFirstJsonObject(
        'Result:\n{"generations":[{"summary":"Brace inside: } and quote: \\"ok\\""}]}\nExtra note'
      )
    ).toEqual({
      generations: [{ summary: 'Brace inside: } and quote: "ok"' }]
    });
  });

  it('skips an invalid brace and finds a later JSON object', () => {
    expect(parseFirstJsonObject('not {valid}\n{"decisions":[]}')).toEqual({ decisions: [] });
  });
});
