<script lang="ts">
  import type { CoeBiddingRound, CoeCategory, CoeCategoryResult, CoePayload } from '$lib/coe';
  import { formatSgd } from '$lib/coe';

  let {
    data,
    loading = false,
    error = '',
    onRefresh,
    notifyEnabled = false,
    telegramLinked = false,
    telegramConfigured = false,
    subscribed = false,
    subscribePending = false,
    onSubscribeChange
  }: {
    data: CoePayload | null;
    loading?: boolean;
    error?: string;
    onRefresh?: () => void;
    notifyEnabled?: boolean;
    telegramLinked?: boolean;
    telegramConfigured?: boolean;
    subscribed?: boolean;
    subscribePending?: boolean;
    onSubscribeChange?: (next: boolean) => void;
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
      <p class="quiet-copy">
        官方 LTA 投标结果 · 来源
        {#if data?.sourceUrl}
          <a href={data.sourceUrl} target="_blank" rel="noreferrer">{data.source}</a>
        {:else}
          LTA · data.gov.sg
        {/if}
        · 打开页面时拉取；后台每 6 小时检查，周三/四约 18:00 SGT 再查一次
      </p>
    </div>
    {#if onRefresh}
      <button
        class="btn btn-soft coe-refresh"
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

  {#if notifyEnabled}
    <section class="card coe-subscribe" aria-label="COE 通知订阅">
      <div>
        <strong>新结果 Telegram 通知</strong>
        <p class="quiet-copy">
          {#if !telegramConfigured}
            管理员尚未配置 Telegram Bot。
          {:else if !telegramLinked}
            先在「我的」连接 Telegram，再订阅新一轮结果。
          {:else if subscribed}
            已订阅：新一轮结果会单独发到你的 Telegram。
          {:else}
            默认关闭。打开后，新一轮结果会发到你的 Telegram。
          {/if}
        </p>
      </div>
      <label class="coe-subscribe-toggle">
        <input
          type="checkbox"
          checked={subscribed}
          disabled={subscribePending || !telegramConfigured || !telegramLinked || !onSubscribeChange}
          onchange={(event) => onSubscribeChange?.((event.currentTarget as HTMLInputElement).checked)}
        />
        <span>{subscribed ? '已订阅' : '订阅通知'}</span>
      </label>
    </section>
  {/if}

  {#if loading && !latest}
    <p class="quiet-copy">正在拉取官方报价…</p>
  {:else if error && !latest}
    <section class="card empty-state">
      <h3>暂时无法加载 COE 数据</h3>
      <p class="quiet-copy">{error}</p>
      {#if onRefresh}
        <button class="btn btn-primary" type="button" onclick={onRefresh}>
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
        <span class="quiet-copy">最新一轮 · 显示 Cat A / Cat B</span>
      </div>

      <div class="coe-primary-grid">
        {#each catsFor(latest, PRIMARY) as cat (cat.category)}
          {@const change = delta(cat.premium, previousPremium(cat.category))}
          <article class="card coe-card" data-cat={cat.category}>
            <span class="coe-cat">{cat.label}</span>
            <strong class="coe-price">{formatSgd(cat.premium)}</strong>
            <span
              class="chip"
              class:chip-up={change.tone === 'up'}
              class:chip-down={change.tone === 'down'}
            >
              {change.text}
            </span>
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
            <article class="card coe-card compact" data-cat={cat.category}>
              <span class="coe-cat">{cat.label}</span>
              <strong class="coe-price">{formatSgd(cat.premium)}</strong>
              <span
                class="chip"
                class:chip-up={change.tone === 'up'}
                class:chip-down={change.tone === 'down'}
              >
                {change.text}
              </span>
            </article>
          {/each}
        </div>
      {/if}

      <button class="btn" type="button" onclick={() => (showAllCategories = !showAllCategories)}>
        {showAllCategories ? '只看 Cat A / B' : '查看 Cat C / D / E'}
      </button>
    </section>

    <section class="coe-history" aria-label="历史记录">
      <div class="section-title">
        <h2>历史报价</h2>
        <span>{history.length} 轮</span>
      </div>

      <div class="card coe-table-wrap">
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
        <button class="btn" type="button" onclick={() => (historyLimit += 12)}>加载更多历史</button>
      {/if}
    </section>
  {:else}
    <section class="card empty-state">
      <h3>暂无 COE 数据</h3>
      <p class="quiet-copy">官方数据集暂时没有返回记录。</p>
    </section>
  {/if}
</section>

<style>
  .coe {
    display: grid;
    gap: var(--space-5);
  }

  .coe-head {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
    align-items: start;
  }

  .coe-head > div {
    min-width: 0;
  }

  .coe-head h1 {
    margin: 6px 0 var(--space-2);
    font-size: var(--text-xl);
    letter-spacing: -0.03em;
  }

  .coe-head a {
    color: var(--jade);
    font-weight: var(--weight-bold);
  }

  .coe-refresh {
    flex-shrink: 0;
  }

  .coe-subscribe {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    align-items: center;
    padding: var(--space-3) var(--space-4);
  }

  .coe-subscribe strong {
    display: block;
    margin-bottom: 4px;
    font-size: var(--text-md);
  }

  .coe-subscribe .quiet-copy {
    margin: 0;
  }

  .coe-subscribe-toggle {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    cursor: pointer;
  }

  .coe-subscribe-toggle input {
    width: 16px;
    height: 16px;
  }

  .coe-subscribe-toggle:has(input:disabled) {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .coe-latest,
  .coe-history {
    display: grid;
    gap: var(--space-3);
  }

  .coe-latest-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .coe-latest-meta strong {
    font-size: var(--text-base);
  }

  .coe-primary-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .coe-extra-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .coe-card {
    padding: var(--space-4);
    display: grid;
    gap: var(--space-2);
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
    padding: var(--space-3);
    gap: var(--space-1);
  }

  .coe-cat {
    font-size: var(--text-sm);
    font-weight: var(--weight-black);
    color: var(--muted);
  }

  .coe-price {
    font-size: var(--text-xl);
    letter-spacing: -0.04em;
    line-height: var(--leading-tight);
  }

  .coe-card.compact .coe-price {
    font-size: var(--text-lg);
  }

  .coe-stats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .section-title {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-3);
  }

  .section-title h2 {
    margin: 0;
    font-size: var(--text-lg);
  }

  .section-title span {
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .coe-table-wrap {
    overflow-x: auto;
  }

  .coe-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 420px;
  }

  .coe-table th,
  .coe-table td {
    padding: var(--space-3) 14px;
    text-align: left;
    border-bottom: 1px solid var(--line);
    font-size: var(--text-md);
    white-space: nowrap;
  }

  .coe-table th {
    color: var(--muted);
    font-weight: var(--weight-black);
    background: color-mix(in srgb, var(--mint) 35%, white);
  }

  .coe-table tr:last-child td {
    border-bottom: 0;
  }

  .empty-state {
    border-style: dashed;
    padding: 28px 18px;
    text-align: center;
    display: grid;
    gap: var(--space-2);
    justify-items: center;
  }

  .empty-state h3 {
    margin: 0;
  }

  .empty-state .quiet-copy {
    margin: 0;
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
      width: var(--control-h);
      min-width: var(--control-h);
      padding: 0;
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
