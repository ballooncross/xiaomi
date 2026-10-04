<script lang="ts">
  import { onMount } from 'svelte';
  import { PROMOTION_URL, type PromotionData } from '$lib/promotions';
  let { telegramLinked }: { telegramLinked: boolean } = $props();
  let data = $state<PromotionData | null>(null);
  let enabled = $state(false);
  let minDiscount = $state(10);
  let busy = $state(false);
  let error = $state('');
  let saved = $state(false);
  async function request(save = false) {
    busy = true; error = ''; saved = false;
    try {
      const response = await fetch('/api/promotions', save ? {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled, minDiscount })
      } : undefined);
      const result = await response.json() as PromotionData & { error?: string };
      if (!response.ok) throw new Error(result.error || '加载失败');
      data = result; enabled = result.enabled; minDiscount = result.minDiscount; saved = save;
    } catch (e) { error = e instanceof Error ? e.message : '加载失败'; }
    finally { busy = false; }
  }
  onMount(() => { void request(); });
  const date = (value: string) => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Singapore' });
</script>

<section class="promotions">
  <h2>促销雷达 · The Ride Side</h2>
  <p>关注雪鞋 Boots 与固定器 Bindings，每天 08:30（新加坡）检查<a href={PROMOTION_URL} target="_blank" rel="noreferrer">商店首页</a>。</p>
  <p>折扣达到门槛时通过 Telegram 通知；同一活动不重复提醒。全店与早鸟预购活动也会纳入，请核对适用商品和排除条款。</p>
  {#if !telegramLinked}<p class="notice">请先到<a href="/notifications">通知设置</a>连接 Telegram，才能接收促销提醒。</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if data}
    {#if !data.available}<p>促销跟踪需要数据库连接。</p>{/if}
    <form onsubmit={(event) => { event.preventDefault(); void request(true); }}>
      <label><input type="checkbox" bind:checked={enabled} disabled={busy || !data.available} /> 开启每日跟踪与通知</label>
      <label>最低折扣 <input type="number" min="1" max="99" step="1" required bind:value={minDiscount} disabled={busy || !data.available} /> % off（10% off = 九折）</label>
      <button disabled={busy || !data.available}>保存</button>
      {#if saved}<span role="status">已保存，下次每日检查生效。</span>{/if}
    </form>
    <p>最近检查：{data.check?.checked_at ? date(data.check.checked_at) : '尚未检查'}</p>
    {#if data.check?.error}<p class="notice" role="status">检查未完成或覆盖不完整：{data.check.error}。历史结果可能已过期。</p>{/if}
    <h3>促销观察记录</h3>
    <p>时间为首页观察时间，不代表活动发布日期。横幅图片通过文字识别读取，购买前请在商店确认。</p>
    {#each data.promotions as offer (offer.id)}
      <article>
        <strong>{offer.evidence.toLowerCase().includes('up to') ? '最高 ' : ''}{offer.discount}% off</strong> · {offer.active ? '最近仍有展示' : '已不再展示'}
        <p>{offer.evidence}</p>
        <small>{offer.scope} · 首次发现 {date(offer.first_seen)} · 最近看到 {date(offer.last_seen)}</small>
        <p><a href={PROMOTION_URL} target="_blank" rel="noreferrer">前往商店核对优惠 →</a></p>
      </article>
    {:else}
      <p>{data.check?.success_at ? '尚未记录到符合范围的促销。继续每日检查，不预设十一月一定有活动。' : '首次检查后将在这里显示结果。'}</p>
    {/each}
  {:else if busy}<p role="status">加载中…</p>{/if}
</section>

<style>
  .promotions { max-width: 850px; margin: 0 auto; padding: 1.25rem; }
  p { line-height: 1.65; }
  form { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; margin: 1.5rem 0; }
  input[type='number'] { width: 5rem; padding: .4rem; }
  button { padding: .5rem 1rem; cursor: pointer; }
  article { padding: 1rem 0; border-top: 1px solid #ddd; }
  .notice { padding: .75rem; background: #fff3d6; color: #614900; border-radius: .5rem; }
  small { color: #666; }
</style>
