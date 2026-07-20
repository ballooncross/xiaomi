import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { findDuplicatesForItem, isProtectedItem, protectedItemRank } from '$lib/server/dedup';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { requireSessionUser } from '$lib/server/request-auth';
import type { Env, RelatedSource } from '$lib/server/types';
import type { DedupExisting } from '$lib/server/dedup';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const user = requireSessionUser(locals);
  const body = (await request.json()) as { itemId?: string };
  if (!body.itemId) {
    return json({ error: 'Missing itemId' }, { status: 400 });
  }

  // Must scope to the signed-in user: dismiss/feedback live in user_item_state.
  // Without userId, updateItemStatus/recordFeedback are no-ops on D1 and marked
  // duplicates reappear after the next pull or page refresh.
  const db = getDb(mergeLocalEnv(platform?.env as Env | undefined, privateEnv), user.id);
  const triggerItem = await db.getItemById(body.itemId);
  if (!triggerItem) {
    return json({ error: 'Item not found' }, { status: 404 });
  }

  const candidates = await db.listItemsForDedup(14);
  const adaptiveThreshold = await db.getAdaptiveDedupThreshold();
  const threshold = Math.max(0.35, adaptiveThreshold - 0.10);

  const matches = findDuplicatesForItem(
    triggerItem.title,
    triggerItem.id,
    triggerItem.url,
    candidates,
    threshold
  );

  if (matches.length === 0) {
    return json({ found: 0, message: '未找到相似的重复内容。' });
  }

  const allItems: DedupExisting[] = [
    {
      id: triggerItem.id,
      title: triggerItem.title,
      url: triggerItem.url,
      imageUrl: triggerItem.imageUrl,
      score: triggerItem.score,
      status: triggerItem.status,
      savedAt: triggerItem.savedAt,
      trackingAt: triggerItem.trackingAt,
      relatedSources: triggerItem.relatedSources ?? []
    },
    ...matches.map((m) => m.item)
  ];

  const keeper = [...allItems].sort((a, b) => {
    const protectedDiff = protectedItemRank(b) - protectedItemRank(a);
    if (protectedDiff !== 0) return protectedDiff;
    const imageDiff = Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl));
    if (imageDiff !== 0) return imageDiff;
    return (b.score ?? 0) - (a.score ?? 0);
  })[0];

  const mergedSources: RelatedSource[] = [...(keeper.relatedSources ?? [])];
  const loserIds: string[] = [];

  for (const item of allItems) {
    if (item.id === keeper.id) continue;
    if (!isProtectedItem(item)) loserIds.push(item.id);
    if (item.url && item.url !== keeper.url && !mergedSources.some((rs) => rs.url === item.url)) {
      const label = extractHostname(item.url);
      mergedSources.push({ source: label, url: item.url });
    }
    for (const rs of item.relatedSources ?? []) {
      if (rs.url !== keeper.url && !mergedSources.some((existing) => existing.url === rs.url)) {
        mergedSources.push(rs);
      }
    }
  }

  await db.applyItemMerge({ itemId: keeper.id, relatedSources: mergedSources });
  for (const loserId of loserIds) {
    await db.updateItemStatus(loserId, 'dismissed');
  }

  await db.recordFeedback(triggerItem.id, 'duplicate');
  for (const match of matches) {
    await db.recordDedupFeedback(triggerItem.id, match.item.id, match.similarity, threshold);
  }

  return json({
    found: matches.length,
    matches: matches.map((m) => ({ id: m.item.id, title: m.item.title, similarity: m.similarity })),
    keeperId: keeper.id,
    dismissedIds: loserIds,
    mergedSources
  });
};

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}
