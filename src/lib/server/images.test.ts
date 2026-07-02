import { describe, expect, it } from 'vitest';
import { decodeOldFormatId, extractOgImage, googleNewsArticleId, isAggregatorUrl } from './images';

describe('extractOgImage', () => {
  it('reads og:image', () => {
    const html = '<head><meta property="og:image" content="https://cdn.example.com/pic.jpg"/></head>';
    expect(extractOgImage(html, 'https://example.com/article')).toBe('https://cdn.example.com/pic.jpg');
  });

  it('reads twitter:image when og:image is absent', () => {
    const html = '<meta name="twitter:image" content="https://cdn.example.com/tw.jpg">';
    expect(extractOgImage(html, 'https://example.com/a')).toBe('https://cdn.example.com/tw.jpg');
  });

  it('handles reversed attribute order', () => {
    const html = '<meta content="https://cdn.example.com/rev.jpg" property="og:image">';
    expect(extractOgImage(html, 'https://example.com/a')).toBe('https://cdn.example.com/rev.jpg');
  });

  it('resolves relative image paths against the page url', () => {
    const html = '<meta property="og:image" content="/images/pic.jpg">';
    expect(extractOgImage(html, 'https://example.com/news/article')).toBe('https://example.com/images/pic.jpg');
  });

  it('returns undefined when no image meta exists', () => {
    expect(extractOgImage('<html><body>hi</body></html>', 'https://example.com')).toBeUndefined();
  });
});

describe('googleNewsArticleId', () => {
  it('extracts the id from rss article urls', () => {
    expect(googleNewsArticleId('https://news.google.com/rss/articles/CBMiSGh0?oc=5&hl=en')).toBe('CBMiSGh0');
    expect(googleNewsArticleId('https://news.google.com/articles/ABC_x-1')).toBe('ABC_x-1');
    expect(googleNewsArticleId('https://news.google.com/home')).toBeUndefined();
  });
});

describe('decodeOldFormatId', () => {
  it('decodes an old-format base64 id containing the raw url', () => {
    // Simulate old protobuf format: length-prefixed URL inside binary
    const raw = '\x08\x13\x22.https://www.reuters.com/business/byd-story-123\xd2\x01\x00';
    const id = btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeOldFormatId(id)).toBe('https://www.reuters.com/business/byd-story-123');
  });

  it('returns undefined for new-format encrypted ids', () => {
    const raw = '\x08\x13\x22.AU_yqLNEncryptedPayloadHere';
    const id = btoa(raw).replace(/\+/g, '-').replace(/\//g, '_');
    expect(decodeOldFormatId(id)).toBeUndefined();
  });

  it('returns undefined for garbage', () => {
    expect(decodeOldFormatId('!!!not-base64!!!')).toBeUndefined();
  });
});

describe('isAggregatorUrl', () => {
  it('flags google news urls', () => {
    expect(isAggregatorUrl('https://news.google.com/rss/articles/CBMi123')).toBe(true);
    expect(isAggregatorUrl('https://www.reuters.com/article')).toBe(false);
  });
});
