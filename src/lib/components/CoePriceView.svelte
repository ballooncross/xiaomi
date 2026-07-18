<script lang="ts">
  import type { CoeBiddingRound, CoeCategory, CoeCategoryResult, CoePayload } from '$lib/coe';
  import { formatSgd } from '$lib/coe';

  let {
    data,
    loading = false,
    error = '',
    onRefresh
  }: {
    data: CoePayload | null;
    loading?: boolean;
    error?: string;
    onRefresh?: () => void;
  } = $props();

  let showAllCategories = $state(false);
  let historyLimit = $state(12);

  const PRIMARY: CoeCategory[] = ['A', 'B'];
  const EXTRA: CoeCategory[] = ['C', 'D', 'E'];

  const latest = $derived(data?.latest ?? null);
  const history = $derived(data?.history ?? []);

  function catsFor(round: CoeBiddingRound | null, categories: CoeCategory[]): CoeCategoryResult[] {
    if (!round) return [];
    return categories
      .map((cat) => round.categories.find((c) => c.category === cat))
      .filter((c): c is CoeCategoryResult => Boolean(c));
  }

  function premiumOf(round: CoeBiddingRound, category: CoeCategory): number | null {
    return round.categories.find((c) => c.category === category)?.premium ?? null;
  }

  function delta(current: number, previous: number | null): { text: string; tone: 'up' | 'down' | 'flat' } {
    if (previous == null) return { text: '—', tone: 'flat' };
    const diff = current - previous;
    if (diff === 0) return { text: '持平', tone: 'flat' };
    const sign = diff > 0 ? '+' : '';
    return {
      text: `${sign}${formatSgd(diff)}`,
      tone: diff > 0 ? 'up' : 'down'
    };
  }

  function previousPremium(category: CoeCategory): number | null {
    const prev = history[1];
    return prev ? premiumOf(prev, category) : null;
  }

  const visibleHistory = $derived(history.slice(0, historyLimit));
  const historyCategories = $derived(showAllCategories ? ([...PRIMARY, ...EXTRA] as CoeCategory[]) : PRIMARY);
</script>

<section class="coe">
  <header class="coe-head">
    <div>
      <div class="eyebrow">Singapore COE</div>
      <h1>COE 价格</h1>
      <p>
        官方 LTA 投标结果 · 来源
        {#if data?.sourceUrl}
          <a href={data.sourceUrl} target="_blank" rel="noreferrer">{data.source}</a>
        {:else}
          LTA · data.gov.sg
        {/if}
        · 打开页面时拉取；后台每 6 小时检查，周三/四约 18:00 SGT 再查一次；新结果会 Telegram 通知
      </p>
    </div>
    {#if onRefresh}
      <button
        class="coe-refresh"
        class:spinning={loading}
        type="button"
        disabled={loading}
        aria-label={loading ? '刷新中' : '刷新 COE 报价'}
        onclick={onRefresh}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span>{loading ? '刷新中' : '刷新'}</span>
      </button>
    {/if}
  </header>

  {#if loading && !latest}
    <p class="quiet-copy">正在拉取官方报价…</p>
  {:else if error && !latest}
    <section class="empty-state">
      <h3>暂时无法加载 COE 数据</h3>
      <p>{error}</p>
      {#if onRefresh}
        <button class="coe-refresh primary" type="button" onclick={onRefresh}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span>重试</span>
        </button>
      {/if}
    </section>
  {:else if latest}
    <section class="coe-latest" aria-label="最新投标结果">
      <div class="coe-latest-meta">
        <strong>{latest.label}</strong>
        <span>最新一轮 · 显示 Cat A / Cat B</span>
      </div>

      <div class="coe-primary-grid">
        {#each catsFor(latest, PRIMARY) as cat (cat.category)}
          {@const change = delta(cat.premium, previousPremium(cat.category))}
          <article class="coe-card" data-cat={cat.category}>
            <span class="coe-cat">{cat.label}</span>
            <strong class="coe-price">{formatSgd(cat.premium)}</strong>
            <span class="coe-delta" data-tone={change.tone}>{change.text}</span>
            <div class="coe-stats">
              <span>配额 {cat.quota.toLocaleString('en-SG')}</span>
              <span>成功 {cat.bidsSuccess.toLocaleString('en-SG')}</span>
              <span>投标 {cat.bidsReceived.toLocaleString('en-SG')}</span>
            </div>
          </article>
        {/each}
      </div>

      {#if showAllCategories}
        <div class="coe-extra-grid">
          {#each catsFor(latest, EXTRA) as cat (cat.category)}
            {@const change = delta(cat.premium, previousPremium(cat.category))}
            <article class="coe-card compact" data-cat={cat.category}>
              <span class="coe-cat">{cat.label}</span>
              <strong class="coe-price">{formatSgd(cat.premium)}</strong>
              <span class="coe-delta" data-tone={change.tone}>{change.text}</span>
            </article>
          {/each}
        </div>
      {/if}

      <button class="coe-toggle" type="button" onclick={() => (showAllCategories = !showAllCategories)}>
        {showAllCategories ? '只看 Cat A / B' : '查看 Cat C / D / E'}
      </button>
    </section>

    <section class="coe-history" aria-label="历史记录">
      <div class="section-title">
        <h2>历史报价</h2>
        <span>{history.length} 轮</span>
      </div>

      <div class="coe-table-wrap">
        <table class="coe-table">
          <thead>
            <tr>
              <th>投标轮次</th>
              {#each historyCategories as cat}
                <th>Cat {cat}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each visibleHistory as round (round.id)}
              <tr>
                <td>
                  <strong>{round.label}</strong>
                </td>
                {#each historyCategories as cat}
                  {@const premium = premiumOf(round, cat)}
                  <td>{premium != null ? formatSgd(premium) : '—'}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if historyLimit < history.length}
        <button class="coe-toggle" type="button" onclick={() => (historyLimit += 12)}>
          加载更多历史
        </button>
      {/if}
    </section>
  {:else}
    <section class="empty-state">
      <h3>暂无 COE 数据</h3>
      <p>官方数据集暂时没有返回记录。</p>
    </section>
  {/if}
</section>

<style>
  .coe {
    display: grid;
    gap: 22px;
  }

  .coe-head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: start;
  }

  .coe-head > div {
    min-width: 0;
  }

  .eyebrow {
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 850;
  }

  .coe-head h1 {
    margin: 6px 0 8px;
    font-size: 28px;
    letter-spacing: -0.03em;
  }

  .coe-head p {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.45;
  }

  .coe-head a {
    color: var(--jade);
    font-weight: 800;
  }

  .coe-refresh {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 36px;
    padding: 0 12px;
    border: 1px solid color-mix(in srgb, var(--jade) 42%, var(--line));
    border-radius: 999px;
    background: color-mix(in srgb, var(--mint) 55%, #fffdf7);
    color: var(--jade);
    font-size: 13px;
    font-weight: 850;
    cursor: pointer;
    transition:
      background 140ms ease,
      border-color 140ms ease,
      color 140ms ease,
      transform 140ms ease;
  }

  .coe-refresh:hover:not(:disabled) {
    background: color-mix(in srgb, var(--mint) 78%, white);
    border-color: var(--jade);
  }

  .coe-refresh:active:not(:disabled) {
    transform: translateY(1px);
  }

  .coe-refresh:disabled {
    opacity: 0.72;
    cursor: wait;
  }

  .coe-refresh.primary {
    background: var(--jade);
    border-color: var(--jade);
    color: #fff8eb;
  }

  .coe-refresh svg {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
  }

  .coe-refresh.spinning svg {
    animation: coe-spin 0.85s linear infinite;
  }

  @keyframes coe-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .coe-latest,
  .coe-history {
    display: grid;
    gap: 14px;
  }

  .coe-latest-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .coe-latest-meta strong {
    font-size: 16px;
  }

  .coe-latest-meta span,
  .quiet-copy {
    color: var(--muted);
    font-size: 13px;
  }

  .coe-primary-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .coe-extra-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .coe-card {
    border: 1px solid var(--line);
    border-radius: 16px;
    background: #fffdf7;
    padding: 16px;
    display: grid;
    gap: 8px;
    position: relative;
    overflow: hidden;
  }

  .coe-card::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 4px;
    background: var(--jade);
  }

  .coe-card[data-cat='B']::before {
    background: var(--accent);
  }

  .coe-card[data-cat='C']::before,
  .coe-card[data-cat='D']::before,
  .coe-card[data-cat='E']::before {
    background: color-mix(in srgb, var(--muted) 70%, var(--jade));
  }

  .coe-card.compact {
    padding: 12px;
    gap: 4px;
  }

  .coe-cat {
    font-size: 12px;
    font-weight: 850;
    color: var(--muted);
  }

  .coe-price {
    font-size: 28px;
    letter-spacing: -0.04em;
    line-height: 1.05;
  }

  .coe-card.compact .coe-price {
    font-size: 18px;
  }

  .coe-delta {
    font-size: 12px;
    font-weight: 850;
    width: fit-content;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--line) 70%, white);
    color: var(--muted);
  }

  .coe-delta[data-tone='up'] {
    background: color-mix(in srgb, var(--accent) 18%, white);
    color: var(--accent);
  }

  .coe-delta[data-tone='down'] {
    background: color-mix(in srgb, var(--jade) 18%, white);
    color: var(--jade);
  }

  .coe-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    color: var(--muted);
    font-size: 12px;
  }

  .coe-toggle {
    justify-self: start;
    border: 1px solid var(--line);
    background: #fffdf7;
    border-radius: 999px;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 850;
    color: var(--ink);
    cursor: pointer;
  }

  .section-title {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }

  .section-title h2 {
    margin: 0;
    font-size: 18px;
  }

  .section-title span {
    color: var(--muted);
    font-size: 12px;
  }

  .coe-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: #fffdf7;
  }

  .coe-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 420px;
  }

  .coe-table th,
  .coe-table td {
    padding: 12px 14px;
    text-align: left;
    border-bottom: 1px solid var(--line);
    font-size: 13px;
    white-space: nowrap;
  }

  .coe-table th {
    color: var(--muted);
    font-weight: 850;
    background: color-mix(in srgb, var(--mint) 35%, white);
  }

  .coe-table tr:last-child td {
    border-bottom: 0;
  }

  .empty-state {
    border: 1px dashed var(--line);
    border-radius: 16px;
    padding: 28px 18px;
    text-align: center;
    display: grid;
    gap: 8px;
    justify-items: center;
  }

  .empty-state h3 {
    margin: 0;
  }

  .empty-state p {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }

  @media (max-width: 720px) {
    .coe-primary-grid,
    .coe-extra-grid {
      grid-template-columns: 1fr;
    }

    .coe-price {
      font-size: 24px;
    }

    .coe-refresh {
      width: 36px;
      padding: 0;
      justify-content: center;
    }

    .coe-refresh span {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
    }
  }
</style>
