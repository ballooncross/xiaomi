import type { RadarItem, RelatedSource } from './types';

/**
 * Batch deduplication of radar items.
 *
 * Strategy: callers pull recent items from the DB once, prepare a batch of
 * candidates, and run the whole batch through here locally. Same story from
 * different outlets gets merged into one item; the other outlets' links are
 * kept as relatedSources on the surviving item.
 */

export type DedupExisting = {
  id: string;
  title: string;
  url?: string;
  imageUrl?: string;
  summary?: string;
  score?: number;
  createdAt?: string;
  relatedSources: RelatedSource[];
};

export type MergeAction = {
  itemId: string;
  relatedSources: RelatedSource[];
  imageUrl?: string;
};

export type DedupResult = {
  toInsert: RadarItem[];
  merges: MergeAction[];
  duplicateCount: number;
};

const SIMILARITY_THRESHOLD = 0.6;

export function dedupeBatch(candidates: RadarItem[], existing: DedupExisting[]): DedupResult {
  const merges = new Map<string, MergeAction>();
  const toInsert: RadarItem[] = [];
  let duplicateCount = 0;

  // Pass 1: merge candidates among themselves
  const clusters = clusterItems(candidates);
  const mergedCandidates = clusters.map(mergeCandidateCluster);
  duplicateCount += candidates.length - mergedCandidates.length;

  // Pass 2: match merged candidates against existing items
  const existingIndex = existing.map((e) => ({ item: e, tokens: titleTokens(e.title) }));

  for (const candidate of mergedCandidates) {
    const match = findMatch(candidate.title, candidate.url, existingIndex);
    if (!match) {
      toInsert.push(candidate);
      // Newly inserted items become match targets for the rest of the batch
      existingIndex.push({
        item: {
          id: candidate.id,
          title: candidate.title,
          url: candidate.url,
          imageUrl: candidate.imageUrl,
          relatedSources: candidate.relatedSources ?? []
        },
        tokens: titleTokens(candidate.title)
      });
      continue;
    }

    duplicateCount += 1;
    const action = merges.get(match.id) ?? {
      itemId: match.id,
      relatedSources: [...match.relatedSources]
    };

    for (const source of candidateSources(candidate)) {
      addRelatedSource(action.relatedSources, source, match.url);
    }
    if (!match.imageUrl && candidate.imageUrl && !action.imageUrl) {
      action.imageUrl = candidate.imageUrl;
    }
    if (action.relatedSources.length > match.relatedSources.length || action.imageUrl) {
      merges.set(match.id, action);
    }
  }

  return { toInsert, merges: [...merges.values()], duplicateCount };
}

/** Cluster already-stored items for a one-time cleanup of accumulated duplicates. */
export function clusterForBackfill(items: DedupExisting[]): {
  merges: MergeAction[];
  deleteIds: string[];
} {
  const merges: MergeAction[] = [];
  const deleteIds: string[] = [];

  const clusters = clusterGeneric(items, (i) => i.title);
  for (const cluster of clusters) {
    if (cluster.length < 2) continue;
    const keeper = [...cluster].sort(backfillKeeperRank)[0];
    const relatedSources = [...keeper.relatedSources];
    let imageUpgrade: string | undefined;

    for (const loser of cluster) {
      if (loser.id === keeper.id) continue;
      if (loser.url) {
        addRelatedSource(relatedSources, { source: sourceLabelFor(loser.title, loser.url), url: loser.url }, keeper.url);
      }
      for (const rs of loser.relatedSources) addRelatedSource(relatedSources, rs, keeper.url);
      if (!keeper.imageUrl && !imageUpgrade && loser.imageUrl) imageUpgrade = loser.imageUrl;
      deleteIds.push(loser.id);
    }

    merges.push({ itemId: keeper.id, relatedSources, imageUrl: imageUpgrade });
  }

  return { merges, deleteIds };
}

export function findMatch(
  title: string,
  url: string | undefined,
  index: Array<{ item: DedupExisting; tokens: Set<string> }>
): DedupExisting | undefined {
  const tokens = titleTokens(title);
  for (const entry of index) {
    if (url && entry.item.url === url) return entry.item;
    if (url && entry.item.relatedSources.some((rs) => rs.url === url)) return entry.item;
    if (tokenSimilarity(tokens, entry.tokens) >= SIMILARITY_THRESHOLD) return entry.item;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Title normalization and similarity
// ---------------------------------------------------------------------------

/** "BYD's sales rise - Reuters" -> "byds sales rise"; keeps CJK. */
export function normalizeTitle(title: string): string {
  return stripOutletSuffix(decodeEntities(title))
    .toLowerCase()
    .replace(/[^\w\s一-鿿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The " - Reuters" / " — The Edge Singapore" tail, used as the source label. */
export function extractOutlet(title: string): string | undefined {
  const match = decodeEntities(title).match(/\s[-–—|]\s([^-–—|]{2,45})\s*$/);
  return match?.[1]?.trim() || undefined;
}

export function titleSimilarity(a: string, b: string): number {
  return tokenSimilarity(titleTokens(a), titleTokens(b));
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'as', 'is', 'are',
  'was', 'be', 'by', 'for', 'with', 'from', 'its', 'his', 'her', 'their'
]);

export function titleTokens(title: string): Set<string> {
  const normalized = normalizeTitle(title);
  const tokens = new Set<string>();
  for (const word of normalized.split(' ')) {
    const cjk = word.match(/[一-鿿]+/g);
    const latin = word.replace(/[一-鿿]+/g, ' ').trim();
    if (latin.length > 1 && !STOPWORDS.has(latin)) tokens.add(stem(latin));
    for (const run of cjk ?? []) {
      if (run.length === 1) tokens.add(run);
      for (let i = 0; i < run.length - 1; i++) tokens.add(run.slice(i, i + 2));
    }
  }
  return tokens;
}

/** Light plural/possessive stemming so "fans"/"fan" and "Chou's"/"Chou" agree. */
function stem(word: string): string {
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function tokenSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / Math.min(a.size, b.size);
}

function stripOutletSuffix(title: string): string {
  return title.replace(/\s[-–—|]\s[^-–—|]{2,45}\s*$/, '');
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#?\w+;/g, ' ');
}

// ---------------------------------------------------------------------------
// Clustering and merge helpers
// ---------------------------------------------------------------------------

function clusterItems(items: RadarItem[]): RadarItem[][] {
  return clusterGeneric(items, (i) => i.title);
}

function clusterGeneric<T>(items: T[], titleOf: (item: T) => string): T[][] {
  const clusters: Array<{ tokens: Set<string>; members: T[] }> = [];
  for (const item of items) {
    const tokens = titleTokens(titleOf(item));
    const home = clusters.find((c) => tokenSimilarity(tokens, c.tokens) >= SIMILARITY_THRESHOLD);
    if (home) {
      home.members.push(item);
    } else {
      clusters.push({ tokens, members: [item] });
    }
  }
  return clusters.map((c) => c.members);
}

function mergeCandidateCluster(cluster: RadarItem[]): RadarItem {
  if (cluster.length === 1) return cluster[0];
  const keeper = [...cluster].sort(candidateKeeperRank)[0];
  const relatedSources = [...(keeper.relatedSources ?? [])];
  for (const other of cluster) {
    if (other === keeper) continue;
    for (const source of candidateSources(other)) {
      addRelatedSource(relatedSources, source, keeper.url);
    }
  }
  return {
    ...keeper,
    imageUrl: keeper.imageUrl ?? cluster.find((i) => i.imageUrl)?.imageUrl,
    relatedSources
  };
}

function candidateSources(item: RadarItem): RelatedSource[] {
  const sources: RelatedSource[] = [];
  if (item.url) sources.push({ source: sourceLabelFor(item.title, item.url), url: item.url });
  for (const rs of item.relatedSources ?? []) sources.push(rs);
  return sources;
}

function addRelatedSource(list: RelatedSource[], source: RelatedSource, primaryUrl?: string): void {
  if (!source.url || source.url === primaryUrl) return;
  if (list.some((rs) => rs.url === source.url)) return;
  list.push(source);
}

function sourceLabelFor(title: string, url: string): string {
  const outlet = extractOutlet(title);
  if (outlet) return outlet;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}

/** Prefer a real image, then a direct (non-aggregator) link, then richer summary. */
function candidateKeeperRank(a: RadarItem, b: RadarItem): number {
  const imageDiff = Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl));
  if (imageDiff !== 0) return imageDiff;
  const directDiff = Number(isDirectUrl(b.url)) - Number(isDirectUrl(a.url));
  if (directDiff !== 0) return directDiff;
  return summaryQuality(b) - summaryQuality(a);
}

function backfillKeeperRank(a: DedupExisting, b: DedupExisting): number {
  const imageDiff = Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl));
  if (imageDiff !== 0) return imageDiff;
  return (b.score ?? 0) - (a.score ?? 0);
}

function isDirectUrl(url?: string): boolean {
  if (!url) return false;
  return !url.includes('news.google.com');
}

function summaryQuality(item: RadarItem): number {
  const summary = item.summary ?? '';
  if (!summary) return 0;
  // A summary that just repeats the title adds nothing
  if (titleSimilarity(summary, item.title) > 0.9) return 1;
  return Math.min(summary.length, 300);
}
