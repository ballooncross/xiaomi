<script lang="ts">
  import type { FeedbackAction, RadarItem, WatchTopic } from '$lib/server/types';
  import type { PageData } from './$types';

  type View = 'home' | 'concerts' | 'trends' | 'me';
  type PreferenceView = 'all' | WatchTopic['type'] | WatchTopic['mode'];

  let { data }: { data: PageData } = $props();
  let items = $state<RadarItem[]>([]);
  let topics = $state<WatchTopic[]>([]);
  let activeView = $state<View>('home');
  let activeFilter = $state('for-you');
  let searchQuery = $state('');
  let searchOpen = $state(false);
  let digestOpen = $state(false);
  let addWatchOpen = $state(false);
  let newWatchName = $state('');
  let newWatchType = $state<WatchTopic['type']>('topic');
  let newWatchCategory = $state('business');
  let newWatchPriority = $state(4);
  let newWatchMode = $state<WatchTopic['mode']>('follow');
  let editingTopicId = $state<string | null>(null);
  let editWatchName = $state('');
  let editWatchType = $state<WatchTopic['type']>('topic');
  let editWatchCategory = $state('business');
  let editWatchPriority = $state(3);
  let editWatchMode = $state<WatchTopic['mode']>('follow');
  let preferenceQuery = $state('');
  let preferenceView = $state<PreferenceView>('all');
  let feedbackPending = $state<string | null>(null);
  let addWatchPending = $state(false);
  let topicPending = $state<string | null>(null);
  let addWatchError = $state('');
  let editWatchError = $state('');

  $effect.pre(() => {
    if (items.length === 0) items = data.items;
    if (topics.length === 0) topics = data.topics;
  });

  const navItems: Array<{ id: View; label: string }> = [
    { id: 'home', label: 'Home' },
    { id: 'concerts', label: 'Concerts' },
    { id: 'trends', label: 'Trends' },
    { id: 'me', label: 'Me' }
  ];

  const filters = [
    { id: 'for-you', label: 'For you' },
    { id: 'career', label: 'Career' },
    { id: 'business', label: 'Business' },
    { id: 'geopolitics', label: 'Geopolitics' },
    { id: 'saved', label: 'Saved' }
  ];

  const preferenceTabs: Array<{ id: PreferenceView; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'artist', label: 'Musicians' },
    { id: 'topic', label: 'Topics' },
    { id: 'source', label: 'Sources' },
    { id: 'blacklist', label: 'Blocked' }
  ];

  const visibleItems = $derived(
    items
      .filter((item) => {
        if (activeView === 'concerts') return item.kind === 'concert' && item.status !== 'dismissed';
        if (activeView === 'trends') return item.kind !== 'concert' && item.status !== 'dismissed';
        if (activeView === 'me') return item.status === 'saved' || item.status === 'tracking';
        if (activeFilter === 'for-you') return item.status !== 'dismissed';
        if (activeFilter === 'saved') return item.status === 'saved' || item.status === 'tracking';
        return item.topics.some((topic) => topic.toLowerCase().includes(activeFilter));
      })
      .filter((item) => matchesSearch(item, searchQuery))
      .slice(0, 8)
  );

  const topItem = $derived(visibleItems[0]);
  const secondaryItems = $derived(visibleItems.slice(1, 3));
  const trendItems = $derived(items.filter((item) => item.kind !== 'concert' && item.status !== 'dismissed').slice(0, 6));
  const timelineItems = $derived(
    items
      .filter((item) => item.kind === 'concert' && item.startsAt && item.status !== 'dismissed')
      .slice(0, 4)
  );
  const watchTopics = $derived(topics.filter((topic) => topic.type === 'artist' && topic.mode !== 'blacklist'));
  const interestTopics = $derived(topics.filter((topic) => topic.type !== 'artist' && topic.mode !== 'blacklist'));
  const blacklistTopics = $derived(topics.filter((topic) => topic.mode === 'blacklist'));
  const filteredPreferenceTopics = $derived(filterPreferenceTopics(topics, preferenceQuery, preferenceView));
  const preferenceMatchCount = $derived(countPreferenceTopics(topics, preferenceQuery, preferenceView));
  const followedTopicCount = $derived(topics.filter((topic) => topic.mode !== 'blacklist').length);
  const greeting = $derived(getGreeting(activeView, visibleItems.length));
  const digestPreview = $derived(buildDigestPreview(items));
  const addWatchTitle = $derived(getAddWatchTitle(newWatchType, newWatchMode));
  const addWatchHint = $derived(getAddWatchHint(newWatchType, newWatchCategory, newWatchMode));
  const addWatchPlaceholder = $derived(getAddWatchPlaceholder(newWatchType, newWatchCategory, newWatchMode));

  async function sendFeedback(itemId: string, action: FeedbackAction) {
    feedbackPending = `${itemId}:${action}`;
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemId, action })
    });

    if (response.ok) {
      items = items.map((item) => {
        if (item.id !== itemId) return item;
        if (action === 'save') return { ...item, status: 'saved' };
        if (action === 'track') return { ...item, status: 'tracking' };
        if (action === 'not_relevant' || action === 'less_like_this') return { ...item, status: 'dismissed' };
        return item;
      });
    }
    feedbackPending = null;
  }

  function formatDate(value: string | undefined) {
    if (!value) return { month: 'NEW', day: '01' };
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { month: 'NEW', day: '01' };
    return {
      month: date.toLocaleDateString('en-SG', { month: 'short' }).toUpperCase(),
      day: date.toLocaleDateString('en-SG', { day: '2-digit' })
    };
  }

  function itemKicker(item: RadarItem) {
    if (item.kind === 'concert') return `Concert watch · ${item.score} score`;
    if (item.kind === 'opportunity') return 'Business chance';
    if (item.topics.some((topic) => topic.toLowerCase().includes('job'))) return 'Career signal';
    return 'Trend signal';
  }

  function sourceLabel(item: RadarItem) {
    if (!item.url) return 'Source';
    try {
      const host = new URL(item.url).hostname.replace(/^www\./, '');
      if (host.includes('ticketmaster')) return 'Ticketmaster';
      if (host.includes('livenation')) return 'Live Nation';
      if (host.includes('songkick')) return 'Songkick';
      if (host.includes('news.google')) return 'Google News';
      return host;
    } catch {
      return item.sourceType === 'demo' ? 'Source' : item.sourceType;
    }
  }

  function imageForItem(item: RadarItem) {
    if (item.imageUrl) return item.imageUrl;
    const topicText = item.topics.join(' ').toLowerCase();
    if (item.kind === 'concert') return '/visuals/concert.svg';
    if (topicText.includes('byd') || topicText.includes('electric vehicle') || topicText.includes('ev market')) {
      return '/visuals/ev.svg';
    }
    if (item.kind === 'news') return item.topics.some((topic) => topic.toLowerCase().includes('geopolitics'))
      ? '/visuals/geopolitics.svg'
      : '/visuals/news.svg';
    if (item.kind === 'opportunity') return '/visuals/opportunity.svg';
    if (item.topics.some((topic) => topic.toLowerCase().includes('career') || topic.toLowerCase().includes('job'))) {
      return '/visuals/career.svg';
    }
    if (item.topics.some((topic) => topic.toLowerCase().includes('business') || topic.toLowerCase().includes('funding'))) {
      return '/visuals/business.svg';
    }
    return '/visuals/news.svg';
  }

  function setView(view: View) {
    activeView = view;
    activeFilter = 'for-you';
  }

  function openAddWatch(type: WatchTopic['type'], category: string) {
    newWatchType = type;
    newWatchCategory = category;
    newWatchPriority = type === 'artist' ? 5 : 4;
    newWatchMode = 'follow';
    addWatchError = '';
    addWatchOpen = true;
    editingTopicId = null;
    searchOpen = false;
    digestOpen = false;
    activeView = type === 'artist' ? 'concerts' : 'trends';
  }

  function openAddBlacklist() {
    openAddWatch('artist', 'concerts');
    newWatchMode = 'blacklist';
  }

  async function addWatchTopic() {
    addWatchError = '';
    const name = newWatchName.trim();
    if (!name) {
      addWatchError = 'Enter a watch name first.';
      return;
    }

    addWatchPending = true;
    const response = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        type: newWatchType,
        category: newWatchCategory,
        priority: newWatchPriority,
        mode: newWatchMode
      })
    });

    if (response.ok) {
      const result = (await response.json()) as { topic: WatchTopic };
      topics = [result.topic, ...topics.filter((topic) => topic.id !== result.topic.id)];
      newWatchName = '';
      addWatchOpen = false;
    } else {
      addWatchError = 'Could not add this watch. Try again.';
    }
    addWatchPending = false;
  }

  function startEditTopic(topic: WatchTopic) {
    editingTopicId = topic.id;
    editWatchName = topic.name;
    editWatchType = topic.type;
    editWatchCategory = topic.category;
    editWatchPriority = topic.priority;
    editWatchMode = topic.mode;
    editWatchError = '';
    addWatchOpen = false;
    searchOpen = false;
    digestOpen = false;
  }

  async function saveTopicEdit() {
    editWatchError = '';
    const name = editWatchName.trim();
    if (!editingTopicId || !name) {
      editWatchError = 'Enter a watch name first.';
      return;
    }

    topicPending = editingTopicId;
    const response = await fetch('/api/watchlist', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: editingTopicId,
        name,
        type: editWatchType,
        category: editWatchCategory,
        priority: editWatchPriority,
        mode: editWatchMode,
        enabled: true
      })
    });

    if (response.ok) {
      const result = (await response.json()) as { topic: WatchTopic };
      topics = topics.map((topic) => (topic.id === result.topic.id ? result.topic : topic));
      editingTopicId = null;
    } else {
      editWatchError = 'Could not save this watch. Try again.';
    }
    topicPending = null;
  }

  async function updateTopicMode(topic: WatchTopic, mode: WatchTopic['mode']) {
    topicPending = topic.id;
    const response = await fetch('/api/watchlist', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...topic, mode })
    });
    if (response.ok) {
      const result = (await response.json()) as { topic: WatchTopic };
      topics = topics.map((candidate) => (candidate.id === topic.id ? result.topic : candidate));
    }
    topicPending = null;
  }

  async function removeTopic(topic: WatchTopic) {
    topicPending = topic.id;
    const response = await fetch('/api/watchlist', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: topic.id })
    });
    if (response.ok) {
      topics = topics.filter((candidate) => candidate.id !== topic.id);
      if (editingTopicId === topic.id) editingTopicId = null;
    }
    topicPending = null;
  }

  function matchesSearch(item: RadarItem, query: string) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    const haystack = [item.title, item.summary, item.description, item.location, ...item.artists, ...item.topics]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalized);
  }

  function filterPreferenceTopics(sourceTopics: WatchTopic[], query: string, view: PreferenceView) {
    return sourceTopics
      .filter((topic) => matchesPreferenceTopic(topic, query, view))
      .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name))
      .slice(0, 24);
  }

  function countPreferenceTopics(sourceTopics: WatchTopic[], query: string, view: PreferenceView) {
    return sourceTopics.filter((topic) => matchesPreferenceTopic(topic, query, view)).length;
  }

  function matchesPreferenceTopic(topic: WatchTopic, query: string, view: PreferenceView) {
    if (view !== 'all') {
      if (view === 'blacklist' || view === 'follow') {
        if (topic.mode !== view) return false;
      } else if (topic.type !== view || topic.mode === 'blacklist') {
        return false;
      }
    }

    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return [topic.name, topic.type, topic.category, topic.mode, ...topic.aliases].join(' ').toLowerCase().includes(normalized);
  }

  function buildDigestPreview(sourceItems: RadarItem[]) {
    const activeItems = sourceItems.filter((item) => item.status !== 'dismissed').slice(0, 6);
    const lines = ['Personal Radar · Daily Brew', ''];
    for (const item of activeItems) {
      lines.push(`• ${item.title}`);
      lines.push(`  ${item.summary}`);
    }
    if (activeItems.length === 0) lines.push('No active items to send yet.');
    return lines.join('\n');
  }

  function getAddWatchTitle(type: WatchTopic['type'], mode: WatchTopic['mode']) {
    if (mode === 'blacklist') return 'Add blacklist rule';
    if (type === 'artist') return 'Add musician';
    if (type === 'source') return 'Add source';
    return 'Add interest';
  }

  function getAddWatchHint(type: WatchTopic['type'], category: string, mode: WatchTopic['mode']) {
    if (mode === 'blacklist') return 'Hide matching concerts, topics, or sources from broad discovery';
    if (type === 'artist') return 'Track Singapore concert and event signals';
    if (type === 'source') return 'Track a trusted site, blog, or official account';
    if (category === 'business') return 'Track companies, products, markets, or founder signals';
    if (category === 'career') return 'Track job market, skill, and hiring signals';
    return 'Track the topic in your daily trend feed';
  }

  function getAddWatchPlaceholder(type: WatchTopic['type'], category: string, mode: WatchTopic['mode']) {
    if (mode === 'blacklist') return 'e.g. artist or event keyword to hide';
    if (type === 'artist') return 'e.g. One Spark, TWICE, Coldplay, 陈奕迅';
    if (type === 'source') return 'e.g. JYPETWICE official X, CNA, Music Matters';
    if (category === 'business') return 'e.g. Dreame, 追觅, consumer hardware risk';
    if (category === 'career') return 'e.g. AI product roles Singapore';
    return 'e.g. US-China AI policy, SEA funding';
  }

  function preferenceMeta(topic: WatchTopic) {
    const type = topic.type === 'artist' ? 'Musician' : topic.type === 'source' ? 'Source' : 'Topic';
    const mode = topic.mode === 'blacklist' ? 'Blocked' : 'Followed';
    return `${type} · ${mode} · ${topic.category} · P${topic.priority}`;
  }

  function getGreeting(view: View, count: number) {
    if (view === 'concerts') {
      return {
        eyebrow: 'Concert radar · Singapore',
        title: `${count} active concert signals.`,
        body: 'Only upcoming or still-actionable concert signals should appear here. Past Singapore stops stay out of the top feed.'
      };
    }
    if (view === 'trends') {
      return {
        eyebrow: 'Trend radar · Career, business, geopolitics',
        title: `${count} trend signals to review.`,
        body: 'Career, market, geopolitics, and business-chance items are grouped here so they are not buried under concert watches.'
      };
    }
    if (view === 'me') {
      return {
        eyebrow: 'Your profile · Preferences',
        title: 'Tune your radar.',
        body: 'Saved and tracked items teach the system what to rank higher. Not relevant lowers similar signals.'
      };
    }
    return {
      eyebrow: 'Morning brief · Singapore',
      title: `${count} signals look worth checking.`,
      body: 'Concert drops, topic spikes, and business chances filtered by your watchlist.'
    };
  }
</script>

<svelte:head>
  <title>Personal Radar</title>
  <link rel="icon" href="/brand/personal-radar-logo.svg" />
  <meta
    name="description"
    content="Personal monitoring app for Singapore concerts, trends, career signals, and business chances."
  />
</svelte:head>

<main class="app-shell">
  <nav class="topbar">
    <div class="brand">
      <img class="logo" src="/brand/personal-radar-logo.svg" alt="" />
      <div>
        <strong>Personal Radar</strong>
        <span>Mortal Cafe</span>
      </div>
    </div>
    <div class="primary-nav" aria-label="Primary navigation">
      {#each navItems as item}
        <button class:active={activeView === item.id} type="button" onclick={() => setView(item.id)}>
          {item.label}
        </button>
      {/each}
    </div>
    <div class="top-actions">
      <button class:active={searchOpen} class="icon-button" aria-label="Search" onclick={() => (searchOpen = !searchOpen)}>
        <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.2"></circle>
          <path d="m16 16 4.2 4.2"></path>
        </svg>
      </button>
      <button class:active={digestOpen} class="button" onclick={() => (digestOpen = !digestOpen)}>Digest</button>
      <button class="button primary" onclick={() => openAddWatch('topic', 'business')}>Add watch</button>
    </div>
  </nav>

  <div class="app-main">
    <section class="feed">
      {#if searchOpen || digestOpen || addWatchOpen || editingTopicId}
        <section class="action-panel">
          {#if searchOpen}
            <div class="action-card search-card">
              <label for="feed-search">Search radar</label>
              <div class="search-row">
                <input
                  id="feed-search"
                  bind:value={searchQuery}
                  placeholder="Try Dreame, AI roles, TWICE, Singapore..."
                />
                <button class="small-button" onclick={() => (searchQuery = '')}>Clear</button>
              </div>
            </div>
          {/if}

          {#if digestOpen}
            <div class="action-card">
              <div class="action-card-head">
                <strong>Daily digest preview</strong>
                <span>Telegram message draft</span>
              </div>
              <pre>{digestPreview}</pre>
            </div>
          {/if}

          {#if addWatchOpen}
            <div class="action-card">
              <div class="action-card-head">
                <strong>{addWatchTitle}</strong>
                <span>{addWatchHint}</span>
              </div>
              <div class="watch-form">
                <input bind:value={newWatchName} placeholder={addWatchPlaceholder} />
                <select bind:value={newWatchType} aria-label="Watch type">
                  <option value="topic">Topic</option>
                  <option value="artist">Artist</option>
                  <option value="source">Source</option>
                </select>
                <select bind:value={newWatchCategory} aria-label="Watch category">
                  <option value="business">Business</option>
                  <option value="career">Career</option>
                  <option value="geopolitics">Geopolitics</option>
                  <option value="concerts">Concerts</option>
                </select>
                <select bind:value={newWatchPriority} aria-label="Priority">
                  <option value={1}>Priority 1</option>
                  <option value={2}>Priority 2</option>
                  <option value={3}>Priority 3</option>
                  <option value={4}>Priority 4</option>
                  <option value={5}>Priority 5</option>
                </select>
                <select bind:value={newWatchMode} aria-label="Preference mode">
                  <option value="follow">Follow</option>
                  <option value="blacklist">Blacklist</option>
                </select>
                <button class="small-button primary" disabled={addWatchPending} onclick={addWatchTopic}>
                  {addWatchPending ? 'Adding...' : 'Add'}
                </button>
              </div>
              {#if addWatchError}<p class="form-error">{addWatchError}</p>{/if}
            </div>
          {/if}

          {#if editingTopicId}
            <div class="action-card">
              <div class="action-card-head">
                <strong>Edit preference</strong>
                <span>Manual preferences boost, suppress, or remove discovered signals</span>
              </div>
              <div class="watch-form edit-form">
                <input bind:value={editWatchName} placeholder="Preference name" />
                <select bind:value={editWatchType} aria-label="Watch type">
                  <option value="topic">Topic</option>
                  <option value="artist">Artist</option>
                  <option value="source">Source</option>
                </select>
                <select bind:value={editWatchCategory} aria-label="Watch category">
                  <option value="business">Business</option>
                  <option value="career">Career</option>
                  <option value="geopolitics">Geopolitics</option>
                  <option value="concerts">Concerts</option>
                </select>
                <select bind:value={editWatchPriority} aria-label="Priority">
                  <option value={1}>Priority 1</option>
                  <option value={2}>Priority 2</option>
                  <option value={3}>Priority 3</option>
                  <option value={4}>Priority 4</option>
                  <option value={5}>Priority 5</option>
                </select>
                <select bind:value={editWatchMode} aria-label="Preference mode">
                  <option value="follow">Follow</option>
                  <option value="blacklist">Blacklist</option>
                </select>
                <button class="small-button primary" disabled={topicPending === editingTopicId} onclick={saveTopicEdit}>
                  {topicPending === editingTopicId ? 'Saving...' : 'Save'}
                </button>
                <button class="small-button" onclick={() => (editingTopicId = null)}>Cancel</button>
              </div>
              {#if editWatchError}<p class="form-error">{editWatchError}</p>{/if}
            </div>
          {/if}
        </section>
      {/if}

      <div class="greeting">
        <div>
          <div class="eyebrow">{greeting.eyebrow}</div>
          <h1>{greeting.title}</h1>
          <p>
            {greeting.body} AI is
            {data.aiEnabled ? ' available when configured' : ' off'}; rule scoring is always on.
          </p>
        </div>
        <aside class="daily-card">
          <strong>Daily brew is ready</strong>
          <span>
            Telegram {data.telegramConfigured ? 'enabled' : 'not configured'} · feedback updates future ranking.
          </span>
        </aside>
      </div>

      {#if activeView === 'home'}
        <div class="tabs" aria-label="Feed filters">
          {#each filters as filter}
            <button
              class:active={activeFilter === filter.id}
              class="tab"
              type="button"
              onclick={() => (activeFilter = filter.id)}
            >
              {filter.label}
            </button>
          {/each}
        </div>
      {/if}

      <div class="section-title">
        <h2>{activeView === 'trends' ? 'Trend feed' : activeView === 'concerts' ? 'Concert feed' : activeView === 'me' ? 'Saved and tracked' : 'Top picks'}</h2>
        <span>{activeView === 'me' ? 'Your feedback profile' : 'Tune ranking with feedback'}</span>
      </div>

      {#if topItem}
        <div class="story-grid">
          <article class="story hero-story">
            <figure class="story-media">
              <img src={imageForItem(topItem)} alt="" loading="lazy" />
            </figure>
            <div class="story-body">
              <div class="story-kicker">{itemKicker(topItem)}</div>
              <h3>{topItem.title}</h3>
              <p>{topItem.summary}</p>
              <div class="chips">
                {#each [...topItem.artists, ...topItem.topics].slice(0, 4) as chip}
                  <span class="chip">{chip}</span>
                {/each}
                <span class="chip hot">{topItem.status === 'tracking' ? 'Tracking' : 'Notify if confirmed'}</span>
              </div>
              <div class="story-actions">
                <button
                  class="small-button primary"
                  disabled={feedbackPending === `${topItem.id}:track`}
                  onclick={() => sendFeedback(topItem.id, 'track')}
                >
                  Track closely
                </button>
                <button class="small-button" onclick={() => sendFeedback(topItem.id, 'save')}>Save</button>
                <button class="small-button" onclick={() => sendFeedback(topItem.id, 'not_relevant')}>Not relevant</button>
                {#if topItem.url}
                  <a class="source-link" href={topItem.url} target="_blank" rel="noreferrer">Source · {sourceLabel(topItem)}</a>
                {/if}
              </div>
            </div>
          </article>

          {#each secondaryItems as item}
            <article class="story">
              <figure class="story-thumb">
                <img src={imageForItem(item)} alt="" loading="lazy" />
              </figure>
              <div class="story-body">
                <div class="story-kicker">{itemKicker(item)}</div>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
                <div class="chips">
                  {#each [...item.artists, ...item.topics].slice(0, 3) as chip}
                    <span class="chip">{chip}</span>
                  {/each}
                </div>
                {#if item.url}
                  <a class="source-link inline-source" href={item.url} target="_blank" rel="noreferrer">
                    Source · {sourceLabel(item)}
                  </a>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <section class="empty-state">
          <h3>No matching signals yet</h3>
          <p>Add watch topics or run a fetch job to populate your personal feed.</p>
        </section>
      {/if}

      <div class="section-title">
        <h2>{activeView === 'trends' ? 'All trend categories' : 'Upcoming watch timeline'}</h2>
        <span>{activeView === 'trends' ? 'Career · business · geopolitics' : 'Concert-first view'}</span>
      </div>
      {#if activeView === 'trends'}
        <section class="timeline">
          {#each trendItems as item}
            <article class="timeline-item">
              <div class="date trend-date">
                <span><small>{item.kind.toUpperCase()}</small>{item.score}</span>
              </div>
              <img class="timeline-image" src={imageForItem(item)} alt="" loading="lazy" />
              <div>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
                {#if item.url}
                  <a class="source-link inline-source" href={item.url} target="_blank" rel="noreferrer">
                    Source · {sourceLabel(item)}
                  </a>
                {/if}
              </div>
            </article>
          {/each}
        </section>
      {:else}
        <section class="timeline">
          {#each timelineItems as item}
            {@const date = formatDate(item.startsAt)}
            <article class="timeline-item">
              <div class="date">
                <span><small>{date.month}</small>{date.day}</span>
              </div>
              <img class="timeline-image" src={imageForItem(item)} alt="" loading="lazy" />
              <div>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
                {#if item.url}
                  <a class="source-link inline-source" href={item.url} target="_blank" rel="noreferrer">
                    Source · {sourceLabel(item)}
                  </a>
                {/if}
              </div>
            </article>
          {:else}
            <article class="timeline-item">
              <div class="date trend-date">
                <span><small>OK</small>0</span>
              </div>
              <img class="timeline-image" src="/visuals/concert.svg" alt="" loading="lazy" />
              <div>
                <h3>No confirmed upcoming concert dates yet</h3>
                <p>Past TWICE and G.E.M. Singapore dates are intentionally excluded from this timeline.</p>
              </div>
            </article>
          {/each}
        </section>
      {/if}
    </section>

    <aside class="side-panel">
      <section class="profile-card">
        <div class="avatar-row">
          <div class="avatar">S</div>
          <div>
            <strong>Your radar</strong>
            <span>Quiet hours · Telegram daily digest</span>
          </div>
        </div>
        <div class="focus">
          <div><strong>{items.length}</strong><span>signals</span></div>
          <div><strong>{items.filter((item) => item.kind === 'concert').length}</strong><span>concerts</span></div>
        </div>
      </section>

      <section class="mini-card preference-card">
        <div class="mini-card-head">
          <div>
            <h2>Preferences</h2>
            <span>{followedTopicCount} followed · {blacklistTopics.length} blocked</span>
          </div>
          <div class="preference-add">
            <button type="button" onclick={() => openAddWatch('artist', 'concerts')}>Musician</button>
            <button type="button" onclick={() => openAddWatch('topic', 'business')}>Interest</button>
            <button type="button" onclick={() => openAddBlacklist()}>Block</button>
          </div>
        </div>

        <div class="preference-summary" aria-label="Preference summary">
          <button type="button" onclick={() => (preferenceView = 'artist')}>
            <strong>{watchTopics.length}</strong>
            <span>Musicians</span>
          </button>
          <button type="button" onclick={() => (preferenceView = 'topic')}>
            <strong>{interestTopics.length}</strong>
            <span>Interests</span>
          </button>
          <button type="button" onclick={() => (preferenceView = 'blacklist')}>
            <strong>{blacklistTopics.length}</strong>
            <span>Blocked</span>
          </button>
        </div>

        <div class="preference-search">
          <svg class="mini-search-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.2"></circle>
            <path d="m16 16 4.2 4.2"></path>
          </svg>
          <input bind:value={preferenceQuery} placeholder="Search musician, topic, source..." />
        </div>

        <div class="preference-tabs" aria-label="Preference filters">
          {#each preferenceTabs as tab}
            <button
              class:active={preferenceView === tab.id}
              type="button"
              onclick={() => (preferenceView = tab.id)}
            >
              {tab.label}
            </button>
          {/each}
        </div>

        <div class="preference-result-line">
          <span>{preferenceMatchCount} matches</span>
          {#if preferenceMatchCount > filteredPreferenceTopics.length}
            <span>Showing first {filteredPreferenceTopics.length}</span>
          {/if}
        </div>

        <div class="preference-list">
          {#each filteredPreferenceTopics as topic}
            <article class:blocked={topic.mode === 'blacklist'} class="preference-row">
              <div class="preference-row-main">
                <strong>{topic.name}</strong>
                <span>{preferenceMeta(topic)}</span>
              </div>
              <div class="topic-actions">
                <button type="button" onclick={() => startEditTopic(topic)}>Edit</button>
                {#if topic.mode === 'blacklist'}
                  <button type="button" disabled={topicPending === topic.id} onclick={() => updateTopicMode(topic, 'follow')}>
                    Follow
                  </button>
                {:else}
                  <button type="button" disabled={topicPending === topic.id} onclick={() => updateTopicMode(topic, 'blacklist')}>
                    Block
                  </button>
                {/if}
                <button type="button" disabled={topicPending === topic.id} onclick={() => removeTopic(topic)}>Remove</button>
              </div>
            </article>
          {:else}
            <p class="quiet-copy">No matching preferences. Add a musician, interest, source, or block rule.</p>
          {/each}
        </div>
      </section>

      <section class="mini-card">
        <h2>Today’s brew</h2>
        <div class="brew-list">
          <div class="brew">
            <div>
              <strong>Concert sources</strong>
              <span>Ticketmaster broad SG music discovery plus followed artists on Ticketmaster and Bandsintown.</span>
            </div>
          </div>
          <div class="brew">
            <div>
              <strong>Trend topics</strong>
              <span>Singapore tech jobs, SEA funding, US-China AI policy, BYD and EV car market signals.</span>
            </div>
          </div>
          <div class="brew">
            <div>
              <strong>AI mode</strong>
              <span>Optional: Gemini first, DeepSeek fallback, rule-based if unavailable.</span>
            </div>
          </div>
        </div>
      </section>
    </aside>
  </div>

</main>

<style>
  .app-shell {
    min-height: 100vh;
    background: var(--paper);
    border: 1px solid var(--line);
    box-shadow: 0 24px 60px rgba(38, 29, 20, 0.16);
    display: grid;
    grid-template-rows: auto 1fr;
    overflow: hidden;
    position: relative;
  }

  .app-shell::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.65;
    background:
      radial-gradient(circle at 22% 10%, rgba(179, 58, 43, 0.1) 0 2px, transparent 3px),
      linear-gradient(90deg, rgba(31, 111, 91, 0.045), transparent 36%);
  }

  .topbar,
  .app-main {
    position: relative;
    z-index: 1;
  }

  .topbar {
    padding: 18px 22px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--line);
    background: rgba(255, 248, 235, 0.88);
    backdrop-filter: blur(12px);
  }

  .brand,
  .top-actions,
  .avatar-row {
    display: flex;
    align-items: center;
  }

  .brand {
    gap: 12px;
  }

  .logo,
  .avatar {
    display: grid;
    place-items: center;
    color: var(--accent-text);
    font-weight: 950;
  }

  .logo {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: #fff8eb;
    object-fit: cover;
    box-shadow: 6px 6px 0 var(--gold);
  }

  .brand strong,
  .avatar-row strong {
    display: block;
    line-height: 1.1;
  }

  .brand span,
  .avatar-row span {
    display: block;
    color: var(--muted);
    font-size: 12px;
    margin-top: 3px;
  }

  .primary-nav,
  .top-actions {
    gap: 9px;
  }

  .primary-nav {
    display: flex;
    align-items: center;
    padding: 5px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background:
      linear-gradient(135deg, rgba(215, 242, 220, 0.58), rgba(255, 253, 247, 0.88)),
      #fffdf7;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
  }

  .primary-nav button {
    border: 0;
    min-width: 92px;
    min-height: 34px;
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    font-size: 13px;
    font-weight: 950;
  }

  .primary-nav button.active {
    background: var(--jade);
    color: var(--accent-text);
    box-shadow: 0 8px 18px rgba(31, 111, 91, 0.2);
  }

  .icon-button,
  .button {
    border: 1px solid var(--line);
    background: #fffdf7;
    color: var(--ink);
    border-radius: 8px;
    font-size: 13px;
    font-weight: 850;
    min-height: 36px;
  }

  .icon-button {
    width: 36px;
    display: grid;
    place-items: center;
    padding: 0;
  }

  .search-icon,
  .mini-search-icon {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .button {
    padding: 0 12px;
  }

  .button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
  }

  .icon-button.active,
  .button.active {
    border-color: color-mix(in srgb, var(--jade) 48%, var(--line));
    background: color-mix(in srgb, var(--mint) 70%, white);
  }

  .action-panel {
    display: grid;
    gap: 10px;
    margin-bottom: 18px;
  }

  .action-card {
    border: 1px solid var(--line);
    border-radius: 12px;
    background: #fffdf7;
    padding: 14px;
  }

  .action-card-head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    margin-bottom: 10px;
  }

  .action-card-head strong,
  .search-card label {
    font-size: 14px;
    font-weight: 950;
  }

  .action-card-head span {
    color: var(--muted);
    font-size: 12px;
    font-weight: 850;
  }

  .action-card pre {
    margin: 0;
    white-space: pre-wrap;
    color: var(--muted);
    font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  .search-row,
  .watch-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    margin-top: 8px;
  }

  .watch-form {
    grid-template-columns: minmax(180px, 1fr) 120px 140px 116px 120px auto;
  }

  .edit-form {
    grid-template-columns: minmax(180px, 1fr) 120px 140px 116px 120px auto auto;
  }

  .search-row input,
  .watch-form input,
  .watch-form select {
    min-height: 38px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff8eb;
    color: var(--ink);
    padding: 0 10px;
  }

  .form-error {
    margin: 9px 0 0;
    color: var(--accent);
    font-size: 12px;
    font-weight: 850;
  }

  .app-main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 330px;
  }

  .feed {
    padding: 28px;
    border-right: 1px solid var(--line);
    min-width: 0;
  }

  .greeting {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 22px;
    align-items: end;
    margin-bottom: 20px;
  }

  .eyebrow {
    color: var(--jade);
    font-size: 12px;
    font-weight: 950;
    text-transform: uppercase;
    margin-bottom: 8px;
  }

  h1 {
    margin: 0;
    max-width: 660px;
    font-family: Fraunces, Newsreader, serif;
    font-size: 42px;
    line-height: 1.02;
    letter-spacing: 0;
  }

  .greeting p {
    margin: 12px 0 0;
    max-width: 620px;
    color: var(--muted);
    line-height: 1.5;
  }

  .daily-card {
    width: 250px;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px;
    background: linear-gradient(135deg, #f4dfbd, #d9f1dc 55%, #f7d4ca);
  }

  .daily-card strong {
    display: block;
    font-family: Newsreader, Georgia, serif;
    font-size: 21px;
    line-height: 1.08;
  }

  .daily-card span {
    display: block;
    margin-top: 8px;
    color: #65584b;
    font-size: 12px;
    line-height: 1.4;
  }

  .tabs {
    display: flex;
    gap: 8px;
    margin: 0 0 18px;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .tab {
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 8px 12px;
    background: #fffdf7;
    font-size: 13px;
    color: var(--muted);
    font-weight: 850;
    white-space: nowrap;
  }

  .tab.active {
    color: var(--accent-text);
    background: var(--jade);
    border-color: var(--jade);
  }

  .section-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 22px 0 10px;
    gap: 16px;
  }

  .section-title h2 {
    margin: 0;
    font-size: 15px;
    text-transform: uppercase;
  }

  .section-title span {
    color: var(--accent);
    font-size: 13px;
    font-weight: 900;
  }

  .story-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .story,
  .timeline,
  .profile-card,
  .mini-card,
  .empty-state {
    border: 1px solid var(--line);
    border-radius: 12px;
    background: #fffdf7;
  }

  .story {
    overflow: hidden;
    min-width: 0;
  }

  .hero-story {
    grid-column: span 2;
    display: grid;
    grid-template-columns: 230px minmax(0, 1fr);
  }

  .story-body {
    padding: 16px;
  }

  .story-media,
  .story-thumb {
    margin: 0;
    background: color-mix(in srgb, var(--mint) 64%, white);
    overflow: hidden;
  }

  .story-media {
    min-height: 230px;
    border-right: 1px solid var(--line);
  }

  .story-thumb {
    aspect-ratio: 16 / 9;
    border-bottom: 1px solid var(--line);
  }

  .story-media img,
  .story-thumb img,
  .timeline-image {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .story-kicker {
    color: var(--jade);
    font-size: 12px;
    font-weight: 950;
    margin-bottom: 10px;
  }

  .story h3 {
    margin: 0;
    font-size: 22px;
    line-height: 1.12;
  }

  .story:not(.hero-story) h3 {
    font-size: 18px;
  }

  .story p,
  .timeline p {
    margin: 10px 0 0;
    color: var(--muted);
    line-height: 1.45;
    font-size: 13px;
  }

  .chips,
  .story-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .chips,
  .story-actions {
    margin-top: 14px;
  }

  .chip {
    border: 1px solid rgba(179, 58, 43, 0.26);
    background: color-mix(in srgb, var(--mint) 72%, white);
    color: color-mix(in srgb, var(--accent) 78%, var(--ink));
    border-radius: 999px;
    padding: 5px 8px;
    font-size: 11px;
    font-weight: 950;
  }

  .chip.hot {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
  }

  .small-button {
    border: 1px solid var(--line);
    background: #fff8eb;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 900;
    color: var(--ink);
  }

  .small-button.primary {
    background: var(--jade);
    color: #fff8eb;
    border-color: var(--jade);
  }

  .source-link {
    min-height: 31px;
    display: inline-flex;
    align-items: center;
    border: 1px solid color-mix(in srgb, var(--gold) 62%, var(--line));
    border-radius: 999px;
    padding: 0 10px;
    background: color-mix(in srgb, var(--gold) 22%, white);
    color: color-mix(in srgb, var(--ink) 76%, var(--jade));
    font-size: 12px;
    font-weight: 950;
    text-decoration: none;
    white-space: nowrap;
  }

  .source-link:hover {
    background: var(--gold);
    color: #2a2009;
  }

  .inline-source {
    margin-top: 12px;
  }

  .timeline {
    overflow: hidden;
  }

  .timeline-item {
    display: grid;
    grid-template-columns: 72px 72px 1fr;
    gap: 12px;
    padding: 14px;
    border-bottom: 1px solid var(--line);
  }

  .timeline-item:last-child {
    border-bottom: 0;
  }

  .date {
    width: 56px;
    height: 56px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    text-align: center;
    background: var(--gold);
    color: #2a2009;
    font-weight: 950;
    line-height: 1;
  }

  .date small {
    display: block;
    margin-bottom: 4px;
    font-size: 10px;
    color: rgba(42, 32, 9, 0.7);
  }

  .timeline-image {
    width: 72px;
    height: 56px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--cream);
  }

  .timeline h3 {
    margin: 0 0 6px;
    font-size: 16px;
  }

  .empty-state {
    padding: 28px;
  }

  .empty-state h3 {
    margin: 0 0 8px;
  }

  .empty-state p {
    margin: 0;
    color: var(--muted);
  }

  .side-panel {
    padding: 24px;
    background:
      linear-gradient(180deg, rgba(215, 242, 220, 0.6), rgba(251, 241, 228, 0.4)),
      rgba(255, 253, 247, 0.65);
    min-width: 0;
  }

  .profile-card,
  .mini-card {
    padding: 14px;
    margin-bottom: 14px;
  }

  .profile-card {
    background:
      radial-gradient(circle at 88% 18%, rgba(143, 29, 79, 0.12) 0 48px, transparent 49px),
      #fffdf7;
  }

  .avatar-row {
    gap: 12px;
    margin-bottom: 12px;
  }

  .avatar {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    background: var(--plum);
    box-shadow: 5px 5px 0 var(--gold);
  }

  .focus {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .focus div {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px;
    background: color-mix(in srgb, var(--cream) 72%, white);
  }

  .focus strong {
    display: block;
    font-size: 18px;
  }

  .focus span {
    color: var(--muted);
    font-size: 11px;
    font-weight: 850;
  }

  .mini-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }

  .mini-card h2 {
    margin: 0;
    font-size: 14px;
    text-transform: uppercase;
  }

  .mini-card-head span {
    display: block;
    margin-top: 3px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 850;
  }

  .mini-card-head button,
  .preference-add button {
    border: 1px solid color-mix(in srgb, var(--jade) 42%, var(--line));
    border-radius: 999px;
    min-height: 28px;
    padding: 0 10px;
    background: color-mix(in srgb, var(--mint) 62%, white);
    color: var(--jade);
    font-size: 11px;
    font-weight: 950;
    white-space: nowrap;
  }

  .mini-card-head button:hover,
  .preference-add button:hover {
    background: var(--jade);
    color: var(--accent-text);
  }

  .preference-card {
    background:
      linear-gradient(180deg, rgba(255, 253, 247, 0.96), rgba(215, 242, 220, 0.34)),
      #fffdf7;
  }

  .preference-add {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  .preference-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 10px;
  }

  .preference-summary button {
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 9px 8px;
    background: color-mix(in srgb, var(--cream) 72%, white);
    text-align: left;
    color: var(--ink);
  }

  .preference-summary strong {
    display: block;
    font-size: 18px;
    line-height: 1;
  }

  .preference-summary span {
    display: block;
    margin-top: 5px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 850;
  }

  .preference-search {
    min-height: 38px;
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 6px;
    align-items: center;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: #fff8eb;
    padding: 0 10px;
  }

  .mini-search-icon {
    width: 16px;
    height: 16px;
    color: var(--muted);
  }

  .preference-search input {
    min-width: 0;
    height: 36px;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 13px;
  }

  .preference-tabs {
    display: flex;
    gap: 6px;
    margin-top: 10px;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
  }

  .preference-tabs::-webkit-scrollbar {
    display: none;
  }

  .preference-tabs button {
    border: 1px solid var(--line);
    border-radius: 999px;
    min-height: 28px;
    padding: 0 9px;
    background: #fffdf7;
    color: var(--muted);
    font-size: 11px;
    font-weight: 950;
    white-space: nowrap;
  }

  .preference-tabs button.active {
    background: var(--plum);
    border-color: var(--plum);
    color: var(--accent-text);
  }

  .preference-result-line {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin: 10px 0 8px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 850;
  }

  .preference-list {
    display: grid;
    gap: 8px;
    max-height: 430px;
    overflow: auto;
    padding-right: 2px;
  }

  .preference-row {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px;
    background: color-mix(in srgb, var(--mint) 70%, white);
    display: grid;
    gap: 8px;
  }

  .preference-row.blocked {
    background: color-mix(in srgb, var(--rose) 58%, white);
  }

  .preference-row-main {
    min-width: 0;
  }

  .preference-row strong {
    display: block;
    overflow-wrap: anywhere;
    font-size: 12px;
    line-height: 1.25;
  }

  .preference-row span {
    display: block;
    margin-top: 3px;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.35;
  }

  .quiet-copy {
    color: var(--muted);
    font-size: 11px;
    line-height: 1.35;
  }

  .quiet-copy {
    margin: 0;
  }

  .topic-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .topic-actions button {
    border: 1px solid var(--line);
    border-radius: 999px;
    min-height: 26px;
    padding: 0 8px;
    background: #fffdf7;
    color: var(--muted);
    font-size: 11px;
    font-weight: 900;
  }

  .topic-actions button:hover {
    color: var(--accent-text);
    background: var(--accent);
    border-color: var(--accent);
  }

  .brew-list {
    display: grid;
    gap: 10px;
  }

  .brew {
    display: grid;
    grid-template-columns: 8px 1fr;
    gap: 10px;
    align-items: start;
  }

  .brew::before {
    content: "";
    width: 8px;
    height: 36px;
    border-radius: 999px;
    background: var(--accent);
  }

  .brew strong {
    display: block;
    font-size: 13px;
    margin-bottom: 3px;
  }

  .brew span {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.4;
  }

  @media (max-width: 960px) {
    .app-shell {
      border: 0;
    }

    .topbar {
      padding: 16px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
    }

    .primary-nav {
      grid-column: 1 / -1;
      width: 100%;
      overflow-x: auto;
      justify-content: stretch;
      scrollbar-width: none;
    }

    .primary-nav::-webkit-scrollbar {
      display: none;
    }

    .primary-nav button {
      flex: 1;
      min-width: 74px;
    }

    .button {
      display: none;
    }

    .watch-form,
    .search-row {
      grid-template-columns: 1fr;
    }

    .app-main {
      grid-template-columns: 1fr;
    }

    .feed {
      border-right: 0;
      padding: 20px;
    }

    .side-panel {
      padding: 0 20px 24px;
    }

    .greeting {
      grid-template-columns: 1fr;
    }

    h1 {
      font-size: 34px;
    }

    .daily-card {
      width: auto;
    }

    .story-grid {
      grid-template-columns: 1fr;
    }

    .hero-story {
      grid-column: span 1;
      grid-template-columns: 1fr;
    }

    .story-media {
      min-height: 150px;
      border-right: 0;
      border-bottom: 1px solid var(--line);
    }

    .timeline-item {
      grid-template-columns: 56px 64px 1fr;
    }

    .timeline-image {
      width: 64px;
      height: 56px;
    }

  }
</style>
