<script lang="ts">
  import { tick } from 'svelte';
  import { coeChartLabelIndexes, coeRoundsForRange, type CoeChartRange } from '$lib/coe-chart';
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
  let chartRange = $state<CoeChartRange>(12);
  let chartCategories = $state<CoeCategory[]>(['A', 'B']);
  let chartScroll = $state<HTMLDivElement>();

  const PRIMARY: CoeCategory[] = ['A', 'B'];
  const EXTRA: CoeCategory[] = ['C', 'D', 'E'];
  const ALL_CATEGORIES: CoeCategory[] = [...PRIMARY, ...EXTRA];
  const CATEGORY_COLORS: Record<CoeCategory, string> = {
    A: 'var(--jade)',
    B: 'var(--accent)',
    C: 'var(--sea)',
    D: 'var(--plum)',
    E: 'var(--gold)'
  };
  const RANGE_OPTIONS: Array<{ value: CoeChartRange; label: string }> = [
    { value: 6, label: '6 个月' },
    { value: 12, label: '1 年' },
    { value: 36, label: '3 年' },
    { value: 'all', label: '全部' }
  ];
  const CHART_HEIGHT = 320;
  const CHART_TOP = 24;
  const CHART_BOTTOM = 48;
  const CHART_LEFT = 72;
  const CHART_RIGHT = 24;

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
  const chartRounds = $derived(coeRoundsForRange(history, chartRange));
  const chartWidth = $derived(Math.max(680, Math.min(4200, CHART_LEFT + CHART_RIGHT + chartRounds.length * (chartRange === 'all' ? 9 : chartRange === 36 ? 16 : 34))));
  const chartValues = $derived(
    chartRounds.flatMap((round) =>
      chartCategories
        .map((category) => premiumOf(round, category))
        .filter((premium): premium is number => premium != null)
    )
  );
  const chartBounds = $derived.by(() => {
    if (chartValues.length === 0) return { min: 0, max: 1 };
    const rawMin = Math.min(...chartValues);
    const rawMax = Math.max(...chartValues);
    const padding = Math.max(1000, (rawMax - rawMin) * 0.1);
    return {
      min: Math.max(0, Math.floor((rawMin - padding) / 5000) * 5000),
      max: Math.ceil((rawMax + padding) / 5000) * 5000
    };
  });
  const yTicks = $derived(Array.from({ length: 5 }, (_, index) => chartBounds.max - ((chartBounds.max - chartBounds.min) * index) / 4));
  const xLabelIndexes = $derived(coeChartLabelIndexes(chartRounds.length, Math.max(5, Math.floor(chartWidth / 140))));

  function toggleChartCategory(category: CoeCategory): void {
    chartCategories = chartCategories.includes(category)
      ? chartCategories.filter((item) => item !== category)
      : [...chartCategories, category];
  }

  function chartX(index: number): number {
    if (chartRounds.length <= 1) return CHART_LEFT;
    return CHART_LEFT + (index / (chartRounds.length - 1)) * (chartWidth - CHART_LEFT - CHART_RIGHT);
  }

  function chartY(premium: number): number {
    const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
    return CHART_TOP + ((chartBounds.max - premium) / (chartBounds.max - chartBounds.min)) * plotHeight;
  }

  function chartPoints(category: CoeCategory): string {
    return chartRounds
      .map((round, index) => {
        const premium = premiumOf(round, category);
        return premium == null ? null : `${chartX(index)},${chartY(premium)}`;
      })
      .filter((point): point is string => point != null)
      .join(' ');
  }

  function shortPrice(value: number): string {
    return `S$${Math.round(value / 1000)}k`;
  }

  async function selectChartRange(range: CoeChartRange): Promise<void> {
    chartRange = range;
    await tick();
    if (chartScroll) chartScroll.scrollLeft = chartScroll.scrollWidth;
  }
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
        · 历史结果保存在数据库；打开页面只刷新最新一轮
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

  {#if data?.stale}
    <p class="quiet-copy">最新一轮暂时无法刷新，当前显示数据库中的最近结果。</p>
  {/if}

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

    <section class="coe-chart-section" aria-labelledby="coe-chart-title">
      <div class="section-title coe-chart-title">
        <div>
          <h2 id="coe-chart-title">价格走势</h2>
          <span>{chartRounds.length} 轮 · 点击类别可显示或隐藏</span>
        </div>
        <div class="coe-chart-ranges" aria-label="图表时间范围">
          {#each RANGE_OPTIONS as option}
            <button
              type="button"
              class:active={chartRange === option.value}
              aria-pressed={chartRange === option.value}
              onclick={() => selectChartRange(option.value)}
            >{option.label}</button>
          {/each}
        </div>
      </div>

      <div class="coe-chart-categories" aria-label="图表类别">
        {#each ALL_CATEGORIES as category}
          <button
            type="button"
            class:active={chartCategories.includes(category)}
            aria-pressed={chartCategories.includes(category)}
            style={`--series-color: ${CATEGORY_COLORS[category]}`}
            onclick={() => toggleChartCategory(category)}
          >
            <span aria-hidden="true"></span>Cat {category}
          </button>
        {/each}
      </div>

      <div class="card coe-chart-card">
        {#if chartCategories.length === 0}
          <div class="coe-chart-empty">选择至少一个类别来查看价格走势。</div>
        {:else if chartRounds.length === 0}
          <div class="coe-chart-empty">所选范围内暂无历史报价。</div>
        {:else}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex (focus enables keyboard scrolling) -->
          <div class="coe-chart-scroll" bind:this={chartScroll} role="region" tabindex="0" aria-label="COE 历史价格折线图，可横向滚动">
            <svg
              class="coe-chart"
              style={`width: ${chartWidth}px`}
              viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
              role="img"
              aria-labelledby="coe-chart-svg-title coe-chart-svg-desc"
            >
              <title id="coe-chart-svg-title">COE 历史价格走势</title>
              <desc id="coe-chart-svg-desc">显示所选时间范围和车辆类别的 COE 成交价。</desc>

              {#each yTicks as tickValue}
                {@const y = chartY(tickValue)}
                <line class="chart-grid" x1={CHART_LEFT} x2={chartWidth - CHART_RIGHT} y1={y} y2={y}></line>
                <text class="chart-y-label" x={CHART_LEFT - 12} y={y + 4}>{shortPrice(tickValue)}</text>
              {/each}

              {#each xLabelIndexes as index}
                <line class="chart-tick" x1={chartX(index)} x2={chartX(index)} y1={CHART_HEIGHT - CHART_BOTTOM} y2={CHART_HEIGHT - CHART_BOTTOM + 5}></line>
                <text class="chart-x-label" x={chartX(index)} y={CHART_HEIGHT - 18}>{chartRounds[index]?.label.replace(/ (1st|2nd)$/, '')}</text>
              {/each}

              {#each chartCategories as category}
                <polyline
                  class="chart-line"
                  points={chartPoints(category)}
                  style={`--series-color: ${CATEGORY_COLORS[category]}`}
                ></polyline>
                {#if chartRounds.length <= 30}
                  {#each chartRounds as round, index (round.id)}
                    {@const premium = premiumOf(round, category)}
                    {#if premium != null}
                      <circle
                        class="chart-point"
                        cx={chartX(index)}
                        cy={chartY(premium)}
                        r="3.5"
                        style={`--series-color: ${CATEGORY_COLORS[category]}`}
                      >
                        <title>{round.label} · Cat {category} · {formatSgd(premium)}</title>
                      </circle>
                    {/if}
                  {/each}
                {/if}
              {/each}
            </svg>
          </div>
          {#if chartWidth > 900}
            <p class="coe-chart-hint">左右滚动查看完整时间范围，日期标签已抽样以保持清晰。</p>
          {/if}
        {/if}
      </div>
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
  .coe-chart-section,
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

  .coe-chart-title {
    align-items: end;
  }

  .coe-chart-title > div:first-child {
    display: grid;
    gap: 3px;
  }

  .coe-chart-ranges {
    display: flex;
    padding: 3px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--mix-base);
  }

  .coe-chart-ranges button,
  .coe-chart-categories button {
    border: 0;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    cursor: pointer;
  }

  .coe-chart-ranges button {
    padding: 7px 10px;
    border-radius: 9px;
    white-space: nowrap;
  }

  .coe-chart-ranges button.active {
    color: var(--ink);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }

  .coe-chart-categories {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .coe-chart-categories button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 11px;
    border: 1px solid var(--line);
    border-radius: 999px;
    opacity: 0.58;
  }

  .coe-chart-categories button span {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--series-color);
  }

  .coe-chart-categories button.active {
    color: var(--ink);
    border-color: color-mix(in srgb, var(--series-color) 55%, var(--line));
    background: color-mix(in srgb, var(--series-color) 9%, var(--surface));
    opacity: 1;
  }

  .coe-chart-card {
    overflow: hidden;
  }

  .coe-chart-scroll {
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-gutter: stable;
  }

  .coe-chart {
    display: block;
    height: 320px;
    max-width: none;
  }

  .chart-grid {
    stroke: var(--line);
    stroke-width: 1;
  }

  .chart-tick {
    stroke: var(--muted);
    stroke-width: 1;
  }

  .chart-y-label,
  .chart-x-label {
    fill: var(--muted);
    font-family: inherit;
    font-size: 11px;
  }

  .chart-y-label {
    text-anchor: end;
  }

  .chart-x-label {
    text-anchor: middle;
  }

  .chart-line {
    fill: none;
    stroke: var(--series-color);
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .chart-point {
    fill: var(--surface);
    stroke: var(--series-color);
    stroke-width: 2.5;
    vector-effect: non-scaling-stroke;
  }

  .coe-chart-hint {
    margin: 0;
    padding: 8px var(--space-3) var(--space-3);
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .coe-chart-empty {
    min-height: 220px;
    display: grid;
    place-items: center;
    padding: var(--space-4);
    color: var(--muted);
    text-align: center;
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
    background: color-mix(in srgb, var(--mint) 35%, var(--mix-base));
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

    .coe-chart-title {
      align-items: stretch;
      flex-direction: column;
    }

    .coe-chart-ranges {
      align-self: stretch;
      overflow-x: auto;
    }

    .coe-chart-ranges button {
      flex: 1 0 auto;
    }
  }
</style>
