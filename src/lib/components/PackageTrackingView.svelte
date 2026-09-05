<script lang="ts">
  import type { PackageStatus, PackageTracking } from '$lib/server/types';

  let { initialPackages }: { initialPackages: PackageTracking[] } = $props();
  let packages = $state<PackageTracking[]>([]);
  let trackingNumber = $state('');
  let label = $state('');
  let view = $state<'active' | 'history'>('active');
  let adding = $state(false);
  let pendingId = $state<string | null>(null);
  let message = $state('');

  const statusLabels: Record<PackageStatus, string> = {
    awaiting_tracking_data: '等待物流信息',
    info_received: '已收到物流信息',
    in_transit: '运输中',
    out_for_delivery: '派送中',
    delivery_attempted: '派送未成功',
    exception: '物流异常',
    delivered: '已送达',
    returned: '退回中',
    unknown: '状态未知'
  };

  const providerLabels = { yxd: 'YXD', dexi: 'D-EXI', mh56: 'MH56' } as const;
  const activePackages = $derived(packages.filter((item) => item.state !== 'archived'));
  const archivedPackages = $derived(packages.filter((item) => item.state === 'archived'));
  const visiblePackages = $derived(view === 'active' ? activePackages : archivedPackages);

  $effect(() => {
    packages = [...initialPackages];
  });

  async function addPackage() {
    if (!trackingNumber.trim()) {
      message = '请输入跟踪单号。';
      return;
    }
    adding = true;
    message = '';
    try {
      const response = await fetch('/api/packages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trackingNumber, label })
      });
      const result = await response.json() as { packages?: PackageTracking[]; created?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error || '无法添加包裹');
      packages = result.packages ?? packages;
      message = result.created ? '已添加并完成首次查询。' : '这个单号已经在跟踪中。';
      trackingNumber = '';
      label = '';
      view = 'active';
    } catch (error) {
      message = error instanceof Error ? error.message : '无法添加包裹';
    } finally {
      adding = false;
    }
  }

  async function refreshPackage(item: PackageTracking) {
    pendingId = item.id;
    message = '';
    try {
      const response = await fetch(`/api/packages/${encodeURIComponent(item.id)}/refresh`, { method: 'POST' });
      const result = await response.json() as { item?: PackageTracking; error?: string };
      if (!response.ok || !result.item) throw new Error(result.error || '刷新失败');
      packages = packages.map((candidate) => candidate.id === item.id ? result.item! : candidate);
      message = '物流信息已刷新。新进展会在下一次定时通知中发送。';
    } catch (error) {
      message = error instanceof Error ? error.message : '刷新失败';
    } finally {
      pendingId = null;
    }
  }

  async function removePackage(item: PackageTracking) {
    if (!window.confirm(`删除 ${item.label || item.trackingNumber} 及全部物流历史？`)) return;
    pendingId = item.id;
    message = '';
    try {
      const response = await fetch('/api/packages', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: item.id })
      });
      const result = await response.json() as { packages?: PackageTracking[]; error?: string };
      if (!response.ok) throw new Error(result.error || '删除失败');
      packages = result.packages ?? packages.filter((candidate) => candidate.id !== item.id);
      message = '已停止跟踪并删除历史。';
    } catch (error) {
      message = error instanceof Error ? error.message : '删除失败';
    } finally {
      pendingId = null;
    }
  }

  async function markDelivered(item: PackageTracking) {
    if (!window.confirm(`确认 ${item.label || item.trackingNumber} 已送达？包裹将移到历史。`)) return;
    pendingId = item.id;
    message = '';
    try {
      const response = await fetch(`/api/packages/${encodeURIComponent(item.id)}/delivered`, { method: 'POST' });
      const result = await response.json() as { item?: PackageTracking; error?: string };
      if (!response.ok || !result.item) throw new Error(result.error || '无法标记为已送达');
      packages = packages.map((candidate) => candidate.id === item.id ? result.item! : candidate);
      message = '已手动标记为送达并移到历史。';
    } catch (error) {
      message = error instanceof Error ? error.message : '无法标记为已送达';
    } finally {
      pendingId = null;
    }
  }

  function formatDate(value?: string): string {
    if (!value) return '尚未查询';
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Singapore',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(value));
  }
</script>

<section class="packages-workspace">
  <header class="packages-head">
    <div>
      <div class="eyebrow">个人物流雷达</div>
      <h1>包裹跟踪</h1>
      <p>每天 08:30 检查物流。抵达新加坡或进入清关后每天检查 4 次，只有新进展才发送 Telegram。</p>
    </div>
  </header>

  <form class="add-package" onsubmit={(event) => { event.preventDefault(); void addPackage(); }}>
    <label>
      <span>跟踪单号</span>
      <input bind:value={trackingNumber} placeholder="例如 YD51821898" autocomplete="off" />
    </label>
    <label>
      <span>备注（可选）</span>
      <input bind:value={label} placeholder="例如 小米手机" maxlength="80" />
    </label>
    <button type="submit" disabled={adding}>{adding ? '查询中…' : '添加包裹'}</button>
  </form>

  {#if message}<p class="package-message">{message}</p>{/if}

  <nav class="package-tabs" aria-label="包裹列表">
    <button type="button" class:active={view === 'active'} onclick={() => (view = 'active')}>
      跟踪中 <span>{activePackages.length}</span>
    </button>
    <button type="button" class:active={view === 'history'} onclick={() => (view = 'history')}>
      历史 <span>{archivedPackages.length}</span>
    </button>
  </nav>

  {#if visiblePackages.length === 0}
    <div class="package-empty">
      <strong>{view === 'active' ? '还没有跟踪包裹' : '还没有已送达包裹'}</strong>
      <p>{view === 'active' ? '在上方输入单号，或在 Telegram 发送 /track TRACKING_NUMBER。' : '包裹送达并通知后会自动移到这里。'}</p>
    </div>
  {:else}
    <div class="package-list">
      {#each visiblePackages as item (item.id)}
        <article class="package-card" class:attention={item.state === 'needs_attention'}>
          <div class="package-card-head">
            <div>
              <span class="package-provider">{item.providerId ? providerLabels[item.providerId] : '识别中'}</span>
              <h2>{item.label || item.trackingNumber}</h2>
              {#if item.label}<code>{item.trackingNumber}</code>{/if}
            </div>
            <span class="package-status" data-status={item.status}>{statusLabels[item.status]}</span>
          </div>

          {#if item.state === 'needs_attention'}
            <p class="attention-copy">连续 7 天未找到物流信息。自动查询已暂停，可手动刷新或删除。</p>
          {:else if item.state === 'awaiting_tracking_data'}
            <p class="waiting-copy">物流商尚未返回数据，明天会自动重试。</p>
          {/if}
          {#if item.lastError}<p class="error-copy">最近查询失败：{item.lastError}</p>{/if}

          <dl class="package-facts">
            <div><dt>最新进展</dt><dd>{item.providerStatus || '暂无物流事件'}</dd></div>
            <div><dt>地点</dt><dd>{item.latestLocation || '未提供'}</dd></div>
            <div><dt>事件时间</dt><dd>{formatDate(item.latestEventAt)}</dd></div>
            <div><dt>预计到达</dt><dd>{item.estimatedDeliveryAt ? formatDate(item.estimatedDeliveryAt) : '未提供'}</dd></div>
            <div><dt>上次检查</dt><dd>{formatDate(item.lastCheckedAt)}</dd></div>
          </dl>

          {#if (item.events?.length ?? 0) > 0}
            <details class="package-events">
              <summary>物流历史（{item.events?.length}）</summary>
              <ol>
                {#each item.events ?? [] as event (event.id)}
                  <li>
                    <time>{formatDate(event.eventAt)}</time>
                    <strong>{event.message}</strong>
                    {#if event.location}<span>{event.location}</span>{/if}
                  </li>
                {/each}
              </ol>
            </details>
          {/if}

          <footer>
            {#if item.sourceUrl}
              <a href={item.sourceUrl} target="_blank" rel="noreferrer">打开物流网站</a>
            {/if}
            {#if item.state !== 'archived'}
              <button type="button" disabled={pendingId === item.id} onclick={() => refreshPackage(item)}>
                {pendingId === item.id ? '刷新中…' : '手动刷新'}
              </button>
            {/if}
            {#if item.providerId === 'dexi' && item.state !== 'archived' && item.status !== 'delivered'}
              <button class="delivered" type="button" disabled={pendingId === item.id} onclick={() => markDelivered(item)}>
                标记已送达
              </button>
            {/if}
            <button class="danger" type="button" disabled={pendingId === item.id} onclick={() => removePackage(item)}>删除</button>
          </footer>
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  .packages-workspace { display: grid; gap: 20px; }
  .packages-head h1 { margin: 4px 0 6px; font-family: var(--font-display); font-size: clamp(30px, 5vw, 48px); }
  .packages-head p { margin: 0; color: var(--muted); }
  .eyebrow { color: var(--plum); font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
  .add-package { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto; gap: 12px; padding: 16px; border: 1px solid var(--line); border-radius: 18px; background: var(--paper); box-shadow: var(--shadow-soft); align-items: end; }
  .add-package label { display: grid; gap: 6px; }
  .add-package label span { color: var(--muted); font-size: 12px; font-weight: 700; }
  .add-package input { width: 100%; box-sizing: border-box; border: 1px solid var(--line); border-radius: 12px; background: var(--cream); color: var(--ink); padding: 11px 12px; font: inherit; }
  .add-package button, .package-card footer button { border: 0; border-radius: 999px; padding: 11px 16px; background: var(--plum); color: white; font-weight: 800; cursor: pointer; }
  button:disabled { cursor: wait; opacity: .55; }
  .package-message { margin: -8px 4px 0; color: var(--muted); font-size: 13px; }
  .package-tabs { display: flex; gap: 8px; }
  .package-tabs button { border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--muted); padding: 8px 14px; cursor: pointer; }
  .package-tabs button.active { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .package-tabs span { margin-left: 4px; opacity: .7; }
  .package-list { display: grid; gap: 14px; }
  .package-card { border: 1px solid var(--line); border-radius: 20px; padding: 18px; background: var(--paper); box-shadow: var(--shadow-soft); }
  .package-card.attention { border-color: #c47b56; }
  .package-card-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .package-card h2 { margin: 3px 0; font-size: 20px; }
  .package-card code { color: var(--muted); font-size: 12px; }
  .package-provider { color: var(--plum); font-size: 11px; font-weight: 900; letter-spacing: .1em; }
  .package-status { flex: 0 0 auto; border-radius: 999px; background: color-mix(in srgb, var(--amber) 20%, transparent); color: var(--ink); padding: 7px 10px; font-size: 12px; font-weight: 800; }
  .package-status[data-status='delivered'] { background: var(--success-bg); color: var(--success-text); }
  .package-status[data-status='exception'] { background: var(--danger-bg); color: var(--danger-text); }
  .waiting-copy, .attention-copy, .error-copy { margin: 14px 0 0; border-radius: 12px; padding: 10px 12px; font-size: 12px; }
  .waiting-copy { background: var(--cream); color: var(--muted); }
  .attention-copy, .error-copy { background: var(--danger-bg); color: var(--danger-text); }
  .package-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 18px 0; }
  .package-facts div { min-width: 0; }
  .package-facts dt { color: var(--muted); font-size: 11px; }
  .package-facts dd { margin: 3px 0 0; overflow-wrap: anywhere; font-size: 13px; font-weight: 700; }
  .package-events { border-top: 1px solid var(--line); padding-top: 12px; }
  .package-events summary { cursor: pointer; color: var(--muted); font-size: 12px; font-weight: 800; }
  .package-events ol { display: grid; gap: 12px; margin: 14px 0 0; padding-left: 22px; }
  .package-events li { padding-left: 4px; }
  .package-events time, .package-events span { display: block; color: var(--muted); font-size: 11px; }
  .package-events strong { display: block; margin: 2px 0; font-size: 13px; }
  .package-card footer { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 16px; }
  .package-card footer a { margin-right: auto; color: var(--plum); font-size: 12px; font-weight: 700; }
  .package-card footer button { background: var(--ink); padding: 8px 12px; font-size: 12px; }
  .package-card footer button.delivered { background: #3f6f46; }
  .package-card footer button.danger { background: transparent; color: var(--danger-text); border: 1px solid var(--danger-text); }
  .package-empty { border: 1px dashed var(--line); border-radius: 18px; padding: 28px; text-align: center; color: var(--muted); }
  .package-empty strong { color: var(--ink); }
  .package-empty p { margin: 6px 0 0; }
  @media (max-width: 720px) {
    .add-package { grid-template-columns: 1fr; }
    .package-facts { grid-template-columns: 1fr; }
    .package-card-head { align-items: flex-start; }
    .package-card footer { flex-wrap: wrap; }
    .package-card footer a { width: 100%; margin-bottom: 4px; }
  }
</style>
