import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupWithProvider, parseDexiXml, parseMh56Html, parseYxdRows } from './providers';

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('parses the D-EXI summary returned by a live search', () => {
    const xml = `<ajax-response><response type="element" id="querylist_querytracks_table_div">
      <table><tbody><tr data-nt-id="Kc4B8qPN">
        <td></td><td>LX22203349875</td><td>预计航班到达时间</td>
        <td>On: 01/08/2026 12:00</td><td>详情</td>
      </tr></tbody></table>
    </response></ajax-response>`;
    expect(parseDexiXml(xml, 'LX22203349875')[0]).toMatchObject({
      status: 'in_transit',
      providerStatus: '预计航班到达时间',
      eventAt: '2026-08-01T04:00:00.000Z'
    });
  });

  it('parses the D-EXI detail history with day-first dates', () => {
    const html = `<table><tbody>
      <tr><th>日期</th><th>时间</th><th>站点</th><th>状态</th><th>签收人</th></tr>
      <tr><td></td><td>01/08/2026</td><td>12:00</td><td>新加坡</td><td>预计航班到达时间</td><td></td></tr>
      <tr><td></td><td>31/07/2026</td><td>18:00</td><td>中国</td><td>正在中转至目的地</td><td></td></tr>
      <tr><td></td><td>31/07/2026</td><td>09:00</td><td>中国</td><td>货物到仓</td><td></td></tr>
    </tbody></table>`;
    const events = parseDexiXml(html);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      status: 'in_transit',
      providerStatus: '货物到仓',
      location: '中国',
      eventAt: '2026-07-31T01:00:00.000Z'
    });
    expect(events[2]).toMatchObject({
      providerStatus: '预计航班到达时间',
      location: '新加坡',
      eventAt: '2026-08-01T04:00:00.000Z'
    });
  });

  it('preserves supplemental D-EXI values attached to a tracking event', () => {
    const html = `<table><tbody>
      <tr><th>日期</th><th>时间</th><th>站点</th><th>状态</th><th>备注</th></tr>
      <tr><td></td><td>01/08/2026</td><td>12:00</td><td>新加坡</td>
        <td>预计航班到达时间</td><td>03/08/2026</td>
      </tr>
    </tbody></table>`;

    expect(parseDexiXml(html)[0]).toMatchObject({
      status: 'in_transit',
      providerStatus: '预计航班到达时间 · 03/08/2026',
      message: '预计航班到达时间 · 03/08/2026',
      eventAt: '2026-08-01T04:00:00.000Z'
    });
  });

  it('performs the D-EXI field update before loading its result details', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        '<input name="FormState" value="test-form-state">',
        { headers: { 'set-cookie': 'SESSIONID=test-session; Path=/' } }
      ))
      .mockResolvedValueOnce(new Response('<ajax-response></ajax-response>'))
      .mockResolvedValueOnce(new Response(`<ajax-response><response><table><tbody>
        <tr data-nt-id="result-row"><td></td><td>LX22203349875</td>
        <td>Estimated flight arrival</td><td>On: 01/08/2026 12:00</td><td>Details</td></tr>
      </tbody></table></response></ajax-response>`))
      .mockResolvedValueOnce(new Response('<ajax-response></ajax-response>'))
      .mockResolvedValueOnce(new Response(`<table><tbody>
        <tr><td></td><td>01/08/2026</td><td>12:00</td><td>Singapore</td><td>Estimated flight arrival</td><td>03/08/2026</td></tr>
        <tr><td></td><td>31/07/2026</td><td>18:00</td><td>China</td><td>In transit</td></tr>
        <tr><td></td><td>31/07/2026</td><td>09:00</td><td>China</td><td>At warehouse</td></tr>
      </tbody></table>`));
    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupWithProvider({} as never, 'dexi', 'LX22203349875');

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('querytracks_SEARCH_STR_value');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('value=LX22203349875');
    const searchBody = fetchMock.mock.calls[2]?.[1]?.body as URLSearchParams;
    expect(searchBody.get('value')).toBe('搜索');
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain('querylist?');
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain('_event_=rowclicked');
    expect(String(fetchMock.mock.calls[4]?.[0])).toBe('http://www.d-exi.com/querytracksfm');
    expect(result.events).toHaveLength(3);
    expect(result.events[2]?.message).toBe('Estimated flight arrival · 03/08/2026');
    expect(result.estimatedDeliveryAt).toBe('2026-08-03T04:00:00.000Z');
  });
});
