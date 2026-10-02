<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { NAV_ITEMS } from '$lib/navigation';
  import type { UsageRow } from '$lib/server/usage';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let audience = $state('all');
  let refreshing = $state(false);
  let refreshError = $state('');
  const rows = $derived(data.rows.filter((row) => audience === 'all' || row.audience === audience));
  const views = $derived([...new Set(rows.map((row) => row.view))].sort());
  function count(source: UsageRow[], metric: string, view?: string) {
    return source.reduce((total, row) => total + (row.metric === metric && (!view || row.view === view) ? row.count : 0), 0);
  }
  function label(view: string) {
    return NAV_ITEMS.find((item) => item.id === view)?.label ?? ({ home: '首页', saved: '收藏' }[view] ?? view);
  }
  async function refresh() {
    refreshing = true;
    refreshError = '';
    try { await invalidateAll(); } catch { refreshError = '刷新失败，请重试。'; }
    finally { refreshing = false; }
  }
</script>

<svelte:head><title>使用统计 · 个人雷达</title></svelte:head>
<main>
  <a href="/settings">← 返回设置</a>
  <header><div><h1>使用统计</h1><p>Radar performance · 访客与登录用户的访问和工具使用量</p></div>
    <button class="btn" onclick={refresh} disabled={refreshing}>{refreshing ? '刷新中…' : '刷新'}</button>
  </header>
  <div class="filters">
    <nav aria-label="统计时间范围">
      {#each [7, 30, 90] as days}
        <a class="btn" href={`?days=${days}`} aria-current={data.period === days ? 'page' : undefined}>{days} 天</a>
      {/each}
    </nav>
    <label>用户类型 <select bind:value={audience}><option value="all">全部</option><option value="guest">访客 Guest</option><option value="member">登录用户（含管理员）</option></select></label>
  </div>
  <p>{data.days[0]} — {data.days[data.days.length - 1]} · 新加坡时间（含今天）</p>
  {#if refreshError}<p role="alert">{refreshError}</p>{/if}
  {#if data.unavailable}
    <p role="alert" class="notice">统计存储暂不可用。请确认数据库绑定和使用统计迁移已部署，再刷新。</p>
  {:else}
    <section class="cards" aria-label="使用总量">
      <article><span>页面访问</span><strong>{count(rows, 'visit').toLocaleString()}</strong></article>
      <article><span>访客页面访问</span><strong>{count(rows.filter((r) => r.audience === 'guest'), 'visit').toLocaleString()}</strong></article>
      <article><span>营养计算</span><strong>{count(rows, 'calculation').toLocaleString()}</strong></article>
      <article><span>健身 / Workout 访问</span><strong>{count(rows, 'visit', 'gym').toLocaleString()}</strong></article>
      <article><span>健身搜索</span><strong>{count(rows, 'search', 'gym').toLocaleString()}</strong></article>
      <article><span>雷达搜索</span><strong>{(count(rows, 'search') - count(rows, 'search', 'gym')).toLocaleString()}</strong></article>
    </section>
    {#if !rows.length}<p class="notice">所选范围暂无记录。统计从此功能上线后开始，不补算历史流量。</p>{/if}
    <h2>页面明细</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>页面</th><th>访客访问</th><th>登录访问</th><th>计算</th><th>搜索</th></tr></thead>
      <tbody>{#each views as view}<tr><th>{label(view)}</th><td>{count(rows.filter((r) => r.audience === 'guest'), 'visit', view)}</td><td>{count(rows.filter((r) => r.audience === 'member'), 'visit', view)}</td><td>{count(rows, 'calculation', view)}</td><td>{count(rows, 'search', view)}</td></tr>{/each}</tbody>
    </table></div>
    <h2>每日趋势</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>日期</th><th>访问</th><th>健身访问</th><th>计算</th><th>健身搜索</th><th>雷达搜索</th></tr></thead>
      <tbody>{#each [...data.days].reverse() as day}
        {@const daily = rows.filter((row) => row.day === day)}
        <tr><th>{day}</th><td>{count(daily, 'visit')}</td><td>{count(daily, 'visit', 'gym')}</td><td>{count(daily, 'calculation')}</td><td>{count(daily, 'search', 'gym')}</td><td>{count(daily, 'search') - count(daily, 'search', 'gym')}</td></tr>
      {/each}</tbody>
    </table></div>
  {/if}
  <aside>
    <h2>统计口径</h2>
    <p>访问 = 浏览器打开或切换到一个雷达页面；刷新会再次计数。这是页面浏览量，不是独立人数。访客指 /guest 工具模式。</p>
    <p>营养计算 = 有效结果在输入停止 0.8 秒后展示；修改输入可产生新的计算。健身搜索 = 非空搜索成功返回（包括零结果），不含初次加载和仅切换筛选；雷达搜索在输入停止 0.6 秒后计数。</p>
    <p>仅保存按日、用户类型、页面和操作汇总的次数，不保存搜索词、身体数据、IP 或用户标识。统计为尽力采集：拦截器、网络失败可能漏计，自动化流量也可能计入；不用于计费或独立访客统计。</p>
  </aside>
</main>

<style>
  main { max-width: 1100px; margin: auto; padding: 24px; }
  header, .filters, nav { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  header { justify-content: space-between; margin: 24px 0; }
  h1 { margin: 0; } h2 { font-size: 18px; margin-top: 28px; }
  p, aside { color: var(--muted); line-height: 1.7; }
  a { color: var(--jade); } a[aria-current] { border-color: var(--jade); }
  select { padding: 8px; background: var(--surface); color: inherit; border: 1px solid var(--line); border-radius: 8px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 24px 0; }
  article, .notice { padding: 20px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
  article span { color: var(--muted); } strong { display: block; font-size: 32px; margin-top: 10px; }
  .table-wrap { overflow-x: auto; } table { width: 100%; border-collapse: collapse; white-space: nowrap; }
  th, td { text-align: right; padding: 12px; border-bottom: 1px solid var(--line); }
  th:first-child { text-align: left; } aside { margin-top: 28px; font-size: 13px; }
</style>
