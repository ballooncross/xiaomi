/**
 * Article image hydration.
 *
 * Google News RSS links (news.google.com/rss/articles/...) are aggregator
 * redirects, not article pages, so og:image lives behind them. We resolve the
 * real article URL first, then read its metadata.
 */

export async function hydrateImageForUrl(url: string): Promise<{ imageUrl?: string; resolvedUrl?: string }> {
  const resolvedUrl = await resolveArticleUrl(url);
  const target = resolvedUrl ?? url;
  if (isAggregatorUrl(target)) return { resolvedUrl };
  const html = await fetchHtml(target);
  if (!html) return { resolvedUrl };
  const imageUrl = extractOgImage(html, target);
  return { imageUrl, resolvedUrl };
}

export function isAggregatorUrl(url: string): boolean {
  return url.includes('news.google.com');
}

/**
 * Google News article IDs encode the destination. Old-format IDs are plain
 * base64 protobuf containing the URL; new-format ("AU_yqL...") IDs must be
 * decoded through the DotsSplashUi batchexecute endpoint using a signature
 * and timestamp read from the article page.
 */
export async function resolveArticleUrl(url: string): Promise<string | undefined> {
  if (!isAggregatorUrl(url)) return undefined;
  const articleId = googleNewsArticleId(url);
  if (!articleId) return undefined;
  return decodeOldFormatId(articleId) ?? (await decodeViaBatchExecute(articleId));
}

export function googleNewsArticleId(url: string): string | undefined {
  const match = url.match(/\/(?:rss\/)?(?:articles|read)\/([^/?#]+)/);
  return match?.[1];
}

/** Old-format ids are base64url protobuf with the raw URL embedded. */
export function decodeOldFormatId(articleId: string): string | undefined {
  try {
    const base64 = articleId.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    if (decoded.includes('AU_yqL')) return undefined; // new encrypted format
    const match = decoded.match(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/);
    return match?.[0];
  } catch {
    return undefined;
  }
}

async function decodeViaBatchExecute(articleId: string): Promise<string | undefined> {
  const page = await fetchWithTimeout(`https://news.google.com/articles/${articleId}`);
  if (!page?.ok) return undefined;
  const html = await page.text().catch(() => '');
  const signature = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const timestamp = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!signature || !timestamp) return undefined;

  // Argument order matters: article id, then timestamp, then signature
  const inner = `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${articleId}",${timestamp},"${signature}"]`;
  const body = `f.req=${encodeURIComponent(JSON.stringify([[['Fbv4je', inner]]]))}`;

  const response = await fetchWithTimeout('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body
  });
  if (!response?.ok) return undefined;
  const text = await response.text().catch(() => '');

  try {
    const payload = text.split('\n\n')[1] ?? text.replace(/^\)\]\}'/, '');
    const rows = JSON.parse(payload) as unknown[][];
    const dataRow = rows.find((row) => Array.isArray(row) && row[0] === 'wrb.fr' && typeof row[2] === 'string');
    if (!dataRow) return undefined;
    const decoded = JSON.parse(dataRow[2] as string) as unknown[];
    const url = decoded[1];
    return typeof url === 'string' && url.startsWith('http') ? url : undefined;
  } catch {
    return undefined;
  }
}

export function extractOgImage(html: string, baseUrl: string): string | undefined {
  const image =
    metaContent(html, 'property', 'og:image') ||
    metaContent(html, 'property', 'og:image:url') ||
    metaContent(html, 'name', 'twitter:image') ||
    metaContent(html, 'name', 'twitter:image:src');
  if (!image) return undefined;
  try {
    return new URL(decodeHtmlUrl(image), baseUrl).toString();
  } catch {
    return image;
  }
}

async function fetchHtml(url: string): Promise<string | undefined> {
  const response = await fetchWithTimeout(url);
  const contentType = response?.headers.get('content-type') ?? '';
  if (!response?.ok || !contentType.includes('text/html')) return undefined;
  return response.text().catch(() => undefined);
}

async function fetchWithTimeout(
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
  timeoutMs = 6000
): Promise<Response | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: init?.method ?? 'GET',
      body: init?.body,
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; PersonalRadar/1.0)',
        ...init?.headers
      }
    });
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function metaContent(html: string, key: 'name' | 'property', value: string): string | undefined {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<meta[^>]+${key}=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i');
  const reversed = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${key}=["']${escaped}["']`, 'i');
  return html.match(pattern)?.[1] || html.match(reversed)?.[1] || undefined;
}

function decodeHtmlUrl(value: string): string {
  return value.replace(/&amp;/g, '&');
}
