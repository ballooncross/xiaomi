import { describe, expect, it } from 'vitest';
import { parseDexiXml, parseMh56Html, parseYxdRows } from './providers';

describe('package provider parsers', () => {
  it('parses the MH56 timeline', () => {
    const html = `
      <ul class="timeline-list">
        <li class="timeline-item"><div class="timeline-item_timestamp"><label>
          <span>2026-07-27 18:28:39</span><span>【Shenzhen,China】已发货 Shipped</span>
        </label></div></li>
        <li class="timeline-item"><div class="timeline-item_timestamp"><label>
          <span>2026-07-28 18:07:46</span><span>【Shenzhen,China】出口申报 Export declaration</span>
        </label></div></li>
      </ul>`;
    const events = parseMh56Html(html);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ status: 'in_transit', location: 'Shenzhen,China' });
  });

  it('parses a YXD summary row', () => {
    const events = parseYxdRows([
      { trackingNumber: 'ADN99972', time: '2026-06-29 10:41:58', note: 'signed for', location: 'Shenzhen' }
    ]);
    expect(events[0]).toMatchObject({ status: 'delivered', providerStatus: 'signed for', location: 'Shenzhen' });
  });

  it('parses D-EXI XML table fragments', () => {
    const xml = `<ajax-response><response><table><tr>
      <td>1</td><td>TRACK123</td><td>2026-07-28 12:00:00</td><td>In transit</td><td>Singapore</td>
    </tr></table></response></ajax-response>`;
    expect(parseDexiXml(xml)[0]).toMatchObject({ status: 'in_transit', location: 'Singapore' });
  });
});
