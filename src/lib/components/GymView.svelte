<script lang="ts">
  import { trackUsage } from '$lib/usage';
  import { onMount } from 'svelte';
  import {
    addGymRecentSearch,
    GYM_RECENT_SEARCHES_STORAGE_KEY,
    parseGymRecentSearches
  } from '$lib/gym-recent-searches';
  type GymExercise = {
    id: string;
    name: string;
    bodyPart: string;
    equipment: string;
    target: string;
    secondaryMuscles: string[];
    instructions: string;
    gifUrl: string | null;
    imageUrl: string | null;
    videoUrl: string | null;
    source: 'exercise-dataset' | 'garmin';
    sourceCategory: string | null;
    sourceKey: string | null;
    catalogs: string[];
    enrichmentSources: Array<{
      source: string;
      id: string;
      url?: string;
      kind?: 'published' | 'ai-generated';
    }>;
    matchConfidence: number | null;
    difficulty: string | null;
  };
  const exerciseSourceLabels: Record<string, string> = {
    'garmin-detail': 'Garmin',
    'exercise-dataset': '动作库',
    'free-exercise-video-db': 'Free Exercise Video DB',
    'free-exercise-db': 'Free Exercise DB',
    'open-exercise-db': 'Open Exercise DB',
    'curated-web-guide': '在线动作指南',
    'muscle-and-strength': 'Muscle & Strength',
    wger: 'wger',
    'ai-generated': 'AI 生成说明'
  };

  function exerciseSourceLabel(source: string) {
    return exerciseSourceLabels[source] ?? source;
  }

  function isEmbeddedExerciseVideo(url: string | null) {
    return Boolean(url && /(?:youtube\.com\/embed\/|player\.vimeo\.com\/video\/)/i.test(url));
  }

  const gymBodyParts: Array<{ id: string; label: string }> = [
    { id: 'back', label: '背部' },
    { id: 'chest', label: '胸部' },
    { id: 'upper arms', label: '大臂' },
    { id: 'lower arms', label: '小臂' },
    { id: 'shoulders', label: '肩部' },
    { id: 'upper legs', label: '大腿' },
    { id: 'lower legs', label: '小腿' },
    { id: 'waist', label: '核心' },
    { id: 'cardio', label: '有氧' },
    { id: 'neck', label: '颈部' }
  ];
  let gymQuery = $state('');
  let gymBodyPart = $state('');
  let gymUsefulOnly = $state(true);
  let gymResults = $state<GymExercise[]>([]);
  let gymLoading = $state(false);
  let gymDetail = $state<GymExercise | null>(null);
  let gymRecentSearches = $state<string[]>([]);
  let gymDebounce: ReturnType<typeof setTimeout> | undefined;
  function storeGymRecentSearch(query: string) {
    const next = addGymRecentSearch(gymRecentSearches, query);
    if (next === gymRecentSearches || next.length === 0) return;
    gymRecentSearches = next;
    try {
      window.localStorage.setItem(GYM_RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* Exercise search remains usable when local storage is unavailable. */
    }
  }

  function clearGymRecentSearches() {
    gymRecentSearches = [];
    try {
      window.localStorage.removeItem(GYM_RECENT_SEARCHES_STORAGE_KEY);
    } catch {
      /* The in-memory history is still cleared. */
    }
  }

  async function loadExercises(options?: { recordSearch?: boolean }) {
    gymLoading = true;
    try {
      const params = new URLSearchParams();
      const query = gymQuery.trim();
      if (options?.recordSearch && query) storeGymRecentSearch(query);
      if (query) params.set('q', query);
      if (gymBodyPart) params.set('bodyPart', gymBodyPart);
      if (gymUsefulOnly) params.set('hasDetails', 'true');
      const response = await fetch(`/api/exercises?${params.toString()}`);
      const data = (await response.json()) as { exercises?: GymExercise[] };
      gymResults = data.exercises ?? [];
      if (response.ok && options?.recordSearch && query) trackUsage('search', 'gym');
    } catch {
      gymResults = [];
    } finally {
      gymLoading = false;
    }
  }

  function onGymSearch() {
    clearTimeout(gymDebounce);
    gymDebounce = setTimeout(() => loadExercises({ recordSearch: true }), 300);
  }

  function runGymSearch(query: string) {
    clearTimeout(gymDebounce);
    gymQuery = query;
    loadExercises({ recordSearch: true });
  }

  function onGymSearchKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    runGymSearch(gymQuery);
  }

  function setGymBodyPart(bodyPart: string) {
    gymBodyPart = bodyPart;
    loadExercises();
  }

  function toggleGymUsefulOnly() {
    gymUsefulOnly = !gymUsefulOnly;
    loadExercises();
  }

  onMount(() => {
    try {
      gymRecentSearches = parseGymRecentSearches(
        window.localStorage.getItem(GYM_RECENT_SEARCHES_STORAGE_KEY)
      );
    } catch {
      gymRecentSearches = [];
    }
    loadExercises();
    return () => clearTimeout(gymDebounce);
  });
</script>

        <section class="gym">
          <header class="gym-head">
            <h1>健身动作库</h1>
            <p>搜索 3,000+ 训练动作 · Garmin 动作名称、目标肌群与所需器械</p>
            <a href="/guest">热量与营养计算 · 无需登录</a>
          </header>
          <div class="gym-search">
            <input
              type="search"
              aria-label="搜索健身动作"
              placeholder="搜索动作 / 肌群 / 器械，如 curl、abs、dumbbell、深蹲…"
              bind:value={gymQuery}
              oninput={onGymSearch}
              onkeydown={onGymSearchKeydown}
            />
          </div>
          {#if gymRecentSearches.length > 0}
            <div class="gym-recent-searches" aria-label="最近搜索">
              <span>最近搜索</span>
              <div class="gym-recent-list">
                {#each gymRecentSearches as query (query.toLocaleLowerCase())}
                  <button type="button" onclick={() => runGymSearch(query)}>{query}</button>
                {/each}
              </div>
              <button type="button" class="gym-recent-clear" onclick={clearGymRecentSearches}>清空</button>
            </div>
          {/if}
          <div class="gym-filters" role="group" aria-label="筛选动作">
            <button
              type="button"
              class="gym-useful-filter"
              class:active={gymUsefulOnly}
              aria-pressed={gymUsefulOnly}
              onclick={toggleGymUsefulOnly}
            >
              有详情
            </button>
            <button type="button" class:active={gymBodyPart === ''} onclick={() => setGymBodyPart('')}>全部</button>
            {#each gymBodyParts as bp}
              <button type="button" class:active={gymBodyPart === bp.id} onclick={() => setGymBodyPart(bp.id)}>
                {bp.label}
              </button>
            {/each}
          </div>
          {#if gymLoading}
            <p class="quiet-copy">加载中…</p>
          {:else if gymResults.length === 0}
            <p class="quiet-copy">没有匹配的动作，试试其他关键词或部位。</p>
          {:else}
            <div class="gym-grid">
              {#each gymResults as exercise (exercise.id)}
                <button type="button" class="gym-card" onclick={() => (gymDetail = exercise)}>
                  {#if exercise.gifUrl || exercise.imageUrl}
                    <img
                      class="gym-gif"
                      src={exercise.gifUrl ?? exercise.imageUrl ?? ''}
                      alt={exercise.name}
                      loading="lazy"
                    />
                  {:else}
                    <span class="gym-media-placeholder" aria-hidden="true">G</span>
                  {/if}
                  <div class="gym-card-body">
                    <div class="gym-card-title">
                      <strong>{exercise.name}</strong>
                      <span class:garmin={exercise.source === 'garmin'} class="gym-source">
                        {exercise.source === 'garmin' ? 'Garmin' : '动作库'}
                      </span>
                    </div>
                    <div class="gym-tags">
                      <span class="gym-tag part">{exercise.bodyPart}</span>
                      <span class="gym-tag target">{exercise.target}</span>
                      {#if exercise.equipment}
                        <span class="gym-tag gear">{exercise.equipment}</span>
                      {/if}
                    </div>
                    {#if exercise.instructions}
                      <p class="gym-instructions">{exercise.instructions}</p>
                    {/if}
                    <span class="gym-more">查看详情 →</span>
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </section>

{#if gymDetail}
  <div
    class="modal-backdrop"
    role="presentation"
    tabindex="-1"
    onkeydown={(event) => event.key === 'Escape' && (gymDetail = null)}
    onclick={(event) => event.target === event.currentTarget && (gymDetail = null)}
  >
    <div class="modal-card gym-modal" role="dialog" aria-modal="true" aria-labelledby="gym-detail-title">
      <div class="modal-head">
        <div>
          <h2 id="gym-detail-title">{gymDetail.name}</h2>
          <p>
            {gymBodyParts.find((bp) => bp.id === gymDetail?.bodyPart)?.label ?? gymDetail.bodyPart}
            · {gymDetail.source === 'garmin' ? 'Garmin Connect' : 'exercises-dataset'}
          </p>
        </div>
        <button class="close-button" type="button" aria-label="关闭" onclick={() => (gymDetail = null)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>
        </button>
      </div>
      {#if isEmbeddedExerciseVideo(gymDetail.videoUrl)}
        <iframe
          class="gym-modal-gif gym-modal-embed"
          src={gymDetail.videoUrl ?? ''}
          title={`${gymDetail.name} 动作示范`}
          loading="lazy"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
        ></iframe>
      {:else if gymDetail.videoUrl}
        <video
          class="gym-modal-gif"
          src={gymDetail.videoUrl}
          poster={gymDetail.imageUrl ?? undefined}
          controls
          playsinline
          preload="metadata"
        >
          <track kind="captions" />
        </video>
      {:else if gymDetail.gifUrl || gymDetail.imageUrl}
        <img
          class="gym-modal-gif"
          src={gymDetail.gifUrl ?? gymDetail.imageUrl ?? ''}
          alt={gymDetail.name}
        />
      {:else}
        <div class="gym-modal-placeholder" aria-hidden="true">Garmin</div>
      {/if}
      <div class="gym-tags">
        <span class="gym-tag part">{gymDetail.bodyPart}</span>
        <span class="gym-tag target">{gymDetail.target}</span>
        {#if gymDetail.equipment}
          <span class="gym-tag gear">{gymDetail.equipment}</span>
        {/if}
        {#if gymDetail.difficulty}
          <span class="gym-tag gear">{gymDetail.difficulty}</span>
        {/if}
      </div>
      {#if gymDetail.source === 'garmin' && gymDetail.sourceCategory && gymDetail.sourceKey}
        <p class="gym-source-key">{gymDetail.sourceCategory} / {gymDetail.sourceKey}</p>
      {/if}
      {#if gymDetail.enrichmentSources.length}
        <p class="gym-source-key">
          详情来源：{gymDetail.enrichmentSources
            .map((item) => exerciseSourceLabel(item.source))
            .join('、')}
          {#if gymDetail.matchConfidence != null}
            · 匹配度 {Math.round(gymDetail.matchConfidence * 100)}%
          {/if}
        </p>
      {/if}
      {#if gymDetail.enrichmentSources.some((item) => item.kind === 'ai-generated')}
        <p class="gym-ai-note">动作说明由 AI 根据 Garmin 名称和训练元数据生成。两个模型均确认动作定义明确，但训练前仍请核对。</p>
      {/if}
      {#if gymDetail.secondaryMuscles.length}
        <p class="gym-modal-secondary">协同肌群：{gymDetail.secondaryMuscles.join('、')}</p>
      {/if}
      {#if gymDetail.instructions}
        <p class="gym-modal-instructions">{gymDetail.instructions}</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .gym {
    padding: 4px 0 24px;
  }

  .gym-head h1 {
    font-size: 22px;
    margin: 0 0 4px;
  }

  .gym-head p {
    color: var(--muted);
    font-size: 13px;
    margin: 0;
  }

  .gym-search {
    margin: 16px 0 0;
  }

  .gym-search input {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
    font-size: 14px;
  }

  .gym-recent-searches {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 10px 0 0;
    color: var(--muted);
    font-size: 12px;
  }

  .gym-recent-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
  }

  .gym-recent-list button,
  .gym-recent-clear {
    border: 0;
    background: transparent;
    color: var(--jade);
    font: inherit;
    cursor: pointer;
  }

  .gym-recent-list button {
    max-width: 180px;
    overflow: hidden;
    padding: 3px 8px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .gym-recent-list button:hover {
    border-color: var(--jade);
  }

  .gym-recent-clear {
    margin-left: auto;
    padding: 3px 0;
    color: var(--muted);
    white-space: nowrap;
  }

  .gym-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 14px 0 20px;
  }

  .gym-filters button {
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--muted);
    border-radius: 999px;
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  .gym-filters button.active {
    background: var(--jade);
    color: #fff;
    border-color: var(--jade);
  }

  .gym-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 12px;
  }

  .gym-card {
    border: 1px solid var(--line);
    border-radius: 16px;
    overflow: hidden;
    background: var(--surface);
    display: flex;
    align-items: stretch;
    gap: 12px;
    padding: 10px;
    text-align: left;
    font: inherit;
    color: inherit;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .gym-card:hover {
    border-color: var(--jade);
    box-shadow: 0 6px 18px var(--shadow-color);
  }

  .gym-gif {
    width: 84px;
    height: 84px;
    flex-shrink: 0;
    object-fit: contain;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
  }

  .gym-media-placeholder {
    width: 84px;
    height: 84px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border: 1px solid rgba(31, 111, 91, 0.2);
    border-radius: 12px;
    background: rgba(31, 111, 91, 0.08);
    color: var(--jade);
    font-size: 28px;
    font-weight: 800;
  }

  .gym-card-body {
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .gym-card-title {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 8px;
  }

  .gym-card-body strong {
    font-size: 14px;
    text-transform: capitalize;
  }

  .gym-source {
    flex-shrink: 0;
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(120, 90, 40, 0.1);
    color: var(--warning-text);
    font-size: 10px;
    font-weight: 800;
  }

  .gym-source.garmin {
    background: rgba(31, 111, 91, 0.12);
    color: var(--jade);
  }

  .gym-more {
    font-size: 12px;
    font-weight: 700;
    color: var(--jade);
  }

  .gym-modal-gif {
    display: block;
    width: min(240px, 70%);
    aspect-ratio: 1 / 1;
    object-fit: contain;
    margin: 0 auto 14px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 16px;
  }

  .gym-modal-embed {
    width: min(560px, 100%);
    aspect-ratio: 16 / 9;
  }

  .gym-modal-placeholder {
    display: grid;
    place-items: center;
    width: min(240px, 70%);
    aspect-ratio: 1 / 1;
    margin: 0 auto 14px;
    border: 1px solid rgba(31, 111, 91, 0.2);
    border-radius: 16px;
    background: rgba(31, 111, 91, 0.08);
    color: var(--jade);
    font-size: 22px;
    font-weight: 800;
  }

  .gym-source-key {
    margin: 12px 0 0;
    color: var(--muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .gym-ai-note {
    margin: 10px 0 0;
    padding: 9px 11px;
    color: var(--warning-text);
    background: var(--warning-bg);
    border: 1px solid var(--warning-line);
    border-radius: 10px;
    font-size: 12px;
    line-height: 1.45;
  }

  .gym-modal-secondary {
    font-size: 13px;
    color: var(--muted);
    margin: 12px 0 0;
    text-transform: capitalize;
  }

  .gym-modal-instructions {
    font-size: 14px;
    color: var(--ink);
    line-height: 1.6;
    margin: 12px 0 0;
  }

  .gym-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .gym-tag {
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 999px;
    text-transform: capitalize;
  }

  .gym-tag.part {
    background: rgba(31, 111, 91, 0.12);
    color: var(--jade);
  }

  .gym-tag.target {
    background: rgba(31, 111, 91, 0.08);
    color: var(--jade);
  }

  .gym-tag.gear {
    background: rgba(120, 90, 40, 0.1);
    color: var(--warning-text);
  }

  .gym-instructions {
    font-size: 12px;
    color: var(--muted);
    margin: 0;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .close-button {
    width: 30px;
    height: 30px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--paper);
    color: var(--muted);
  }
  .close-button:hover {
    color: var(--accent-text);
    background: var(--accent);
    border-color: var(--accent);
  }
  .close-button svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
  }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: 18px;
    background: var(--backdrop);
    backdrop-filter: blur(10px);
  }
  .modal-card {
    width: min(620px, 100%);
    max-height: min(760px, calc(100vh - 36px));
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: 20px;
    background: var(--surface);
    box-shadow: 0 32px 90px var(--shadow-color);
    padding: 18px;
  }
  .modal-head {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: flex-start;
    margin-bottom: 14px;
  }
  .modal-head h2 {
    margin: 0;
    color: var(--ink);
    font-size: 20px;
  }
  .modal-head p {
    margin: 5px 0 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .quiet-copy {
    color: var(--muted);
    font-size: 11px;
    line-height: 1.35;
  }
  .quiet-copy {
    margin: 0;
  }
  @media (max-width: 960px) {
    .modal-backdrop {
      align-items: end;
      padding: 0;
    }
    .modal-card {
      width: 100%;
      max-height: calc(100vh - 34px);
      border-right: 0;
      border-bottom: 0;
      border-left: 0;
      border-radius: 24px 24px 0 0;
      padding: 16px;
    }
  }
</style>
