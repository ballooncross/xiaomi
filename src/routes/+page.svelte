<script lang="ts">
  import DateRemindersView from '$lib/components/DateRemindersView.svelte';
  import type { DateReminder, FeedbackAction, RadarItem, WatchTopic } from '$lib/server/types';
  import { Solar } from 'lunar-javascript';
  import 'vanillajs-datepicker/css/datepicker.css';
  import type { PageData } from './$types';

  type View = 'home' | 'concerts' | 'trends' | 'dates' | 'me';
  type PreferenceView = 'all' | WatchTopic['type'] | WatchTopic['mode'];
  type ReminderView = DateReminder & { nextDate: string; daysLeft: number; dateLabel: string };

  let { data }: { data: PageData } = $props();
  let items = $state<RadarItem[]>([]);
  let topics = $state<WatchTopic[]>([]);
  let reminders = $state<ReminderView[]>([]);
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
  let digestSendPending = $state(false);
  let digestSendMessage = $state('');
  let addWatchError = $state('');
  let editWatchError = $state('');
  let reminderFormOpen = $state(false);
  let reminderPending = $state(false);
  let reminderError = $state('');
  let editingReminderId = $state<string | null>(null);
  let reminderTitle = $state('');
  let reminderCalendarType = $state<DateReminder['calendarType']>('lunar');
  let reminderDate = $state(todayInputValue());
  let reminderPinned = $state(false);

  $effect.pre(() => {
    if (items.length === 0) items = data.items;
    if (topics.length === 0) topics = data.topics;
    if (reminders.length === 0) reminders = data.reminders;
  });

  const navItems: Array<{ id: View; label: string }> = [
    { id: 'home', label: '首页' },
    { id: 'concerts', label: '演出' },
    { id: 'trends', label: '趋势' },
    { id: 'dates', label: '日期' },
    { id: 'me', label: '我的' }
  ];

  const filters = [
    { id: 'for-you', label: '推荐' },
    { id: 'career', label: '职业' },
    { id: 'business', label: '商业' },
    { id: 'geopolitics', label: '地缘政治' },
    { id: 'saved', label: '已保存' }
  ];

  const preferenceTabs: Array<{ id: PreferenceView; label: string }> = [
    { id: 'all', label: '全部' },
    { id: 'artist', label: '音乐人' },
    { id: 'topic', label: '主题' },
    { id: 'source', label: '来源' },
    { id: 'blacklist', label: '已屏蔽' }
  ];

  const visibleItems = $derived(
    items
      .filter((item) => {
        if (activeView === 'concerts') return item.kind === 'concert' && item.status !== 'dismissed';
        if (activeView === 'trends') return item.kind !== 'concert' && item.status !== 'dismissed';
        if (activeView === 'dates') return false;
        if (activeView === 'me') return item.status === 'saved' || item.status === 'tracking';
        if (activeFilter === 'for-you') return item.status !== 'dismissed';
        if (activeFilter === 'saved') return item.status === 'saved' || item.status === 'tracking';
        return item.topics.some((topic) => topic.toLowerCase().includes(activeFilter));
      })
      .filter((item) => matchesSearch(item, searchQuery))
      .sort(sortRadarItemsForDisplay)
      .slice(0, 8)
  );

  const topItem = $derived(visibleItems[0]);
  const secondaryItems = $derived(visibleItems.slice(1, 3));
  const trendItems = $derived(
    items
      .filter((item) => item.kind !== 'concert' && item.status !== 'dismissed')
      .sort(sortRadarItemsForDisplay)
      .slice(0, 6)
  );
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
  const nextReminder = $derived(reminders.reduce<ReminderView | undefined>((closest, reminder) => {
    if (!closest || reminder.daysLeft < closest.daysLeft) return reminder;
    return closest;
  }, undefined));
  const upcomingReminders = $derived(reminders.filter((reminder) => reminder.daysLeft <= 30).slice(0, 4));

  function datepicker(node: HTMLInputElement) {
    let picker: { destroy: () => void } | undefined;
    let cancelled = false;

    void import('vanillajs-datepicker/Datepicker').then(({ default: Datepicker }) => {
      if (cancelled) return;
      picker = new Datepicker(node, {
        autohide: true,
        format: 'yyyy-mm-dd',
        todayHighlight: true
      });
    });

    return {
      destroy() {
        cancelled = true;
        picker?.destroy();
      }
    };
  }

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

  async function sendTelegramSummary() {
    digestSendPending = true;
    digestSendMessage = '';
    const response = await fetch('/api/digest', { method: 'POST' });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    digestSendMessage = response.ok ? '已发送到 Telegram。' : result.error || '发送失败，请稍后再试。';
    digestSendPending = false;
  }

  function formatDate(value: string | undefined) {
    if (!value) return { month: '新', day: '01' };
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { month: '新', day: '01' };
    return {
      month: date.toLocaleDateString('zh-CN', { month: 'short' }).toUpperCase(),
      day: date.toLocaleDateString('en-SG', { day: '2-digit' })
    };
  }

  function itemKicker(item: RadarItem) {
    if (item.kind === 'concert') return `演出关注 · ${item.score} 分`;
    if (item.kind === 'opportunity') return '商业机会';
    if (item.topics.some((topic) => topic.toLowerCase().includes('job'))) return '职业信号';
    return '趋势信号';
  }

  function sourceLabel(item: RadarItem) {
    if (!item.url) return '来源';
    try {
      const host = new URL(item.url).hostname.replace(/^www\./, '');
      if (host.includes('ticketmaster')) return 'Ticketmaster';
      if (host.includes('livenation')) return 'Live Nation';
      if (host.includes('songkick')) return 'Songkick';
      if (host.includes('news.google')) return 'Google 新闻';
      if (item.sourceType === 'gdelt') return `GDELT · ${host}`;
      if (item.sourceType === 'rss') return host;
      return host;
    } catch {
      return item.sourceType === 'demo' ? '来源' : item.sourceType;
    }
  }

  function itemKindLabel(item: RadarItem) {
    if (item.kind === 'concert') return '演出';
    if (item.kind === 'opportunity') return '机会';
    if (item.kind === 'news') return '新闻';
    return '趋势';
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

  function closeTransientUi() {
    searchOpen = false;
    digestOpen = false;
    addWatchOpen = false;
    editingTopicId = null;
    reminderFormOpen = false;
  }

  function toggleSearch() {
    const next = !searchOpen;
    closeTransientUi();
    searchOpen = next;
  }

  function toggleDigest() {
    const next = !digestOpen;
    closeTransientUi();
    digestOpen = next;
  }

  function setView(view: View) {
    closeTransientUi();
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
      addWatchError = '请先输入关注名称。';
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
      const result = (await response.json()) as { topic: WatchTopic; topics?: WatchTopic[]; items?: RadarItem[] };
      topics = result.topics ?? [result.topic, ...topics.filter((topic) => topic.id !== result.topic.id)];
      if (result.items) items = result.items;
      newWatchName = '';
      addWatchOpen = false;
    } else {
      addWatchError = '无法添加这个关注，请重试。';
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
      editWatchError = '请先输入关注名称。';
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
      const result = (await response.json()) as { topic: WatchTopic; topics?: WatchTopic[]; items?: RadarItem[] };
      topics = result.topics ?? topics.map((topic) => (topic.id === result.topic.id ? result.topic : topic));
      if (result.items) items = result.items;
      editingTopicId = null;
    } else {
      editWatchError = '无法保存这个偏好，请重试。';
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
      const result = (await response.json().catch(() => ({}))) as { topics?: WatchTopic[]; items?: RadarItem[] };
      topics = result.topics ?? topics.filter((candidate) => candidate.id !== topic.id);
      if (result.items) items = result.items;
      if (editingTopicId === topic.id) editingTopicId = null;
    }
    topicPending = null;
  }

  function openReminderForm(reminder?: ReminderView) {
    reminderError = '';
    reminderFormOpen = true;
    addWatchOpen = false;
    searchOpen = false;
    digestOpen = false;
    if (reminder) {
      editingReminderId = reminder.id;
      reminderTitle = reminder.title;
      reminderCalendarType = reminder.calendarType;
      reminderDate = reminder.nextDate;
      reminderPinned = reminder.pinned;
      return;
    }
    editingReminderId = null;
    reminderTitle = '';
    reminderCalendarType = 'lunar';
    reminderDate = todayInputValue();
    reminderPinned = false;
  }

  async function saveReminder() {
    reminderError = '';
    const title = reminderTitle.trim();
    if (!title) {
      reminderError = '请先输入提醒名称。';
      return;
    }
    reminderPending = true;
    const dateParts = reminderPayloadDate(reminderDate, reminderCalendarType);
    const payload = {
      id: editingReminderId ?? undefined,
      title,
      calendarType: reminderCalendarType,
      month: dateParts.month,
      day: dateParts.day,
      lunarIsLeapMonth: dateParts.lunarIsLeapMonth,
      repeat: 'annual',
      pinned: reminderPinned,
      note: '',
      remindDaysBefore: [0, 1, 7],
      enabled: true
    };
    const response = await fetch('/api/reminders', {
      method: editingReminderId ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      const result = (await response.json()) as { reminders: ReminderView[] };
      reminders = result.reminders;
      reminderFormOpen = false;
      editingReminderId = null;
    } else {
      reminderError = '无法保存这个提醒，请重试。';
    }
    reminderPending = false;
  }

  async function deleteReminder(reminder: ReminderView) {
    reminderPending = true;
    const response = await fetch('/api/reminders', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: reminder.id })
    });
    if (response.ok) {
      const result = (await response.json()) as { reminders: ReminderView[] };
      reminders = result.reminders;
      if (editingReminderId === reminder.id) editingReminderId = null;
    }
    reminderPending = false;
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

  function sortRadarItemsForDisplay(a: RadarItem, b: RadarItem) {
    const scoreDelta = b.score - a.score;
    const imageDelta = Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl));
    if (imageDelta !== 0 && Math.abs(scoreDelta) <= 20) return imageDelta;
    if (scoreDelta !== 0) return scoreDelta;
    if (imageDelta !== 0) return imageDelta;
    return itemTime(b) - itemTime(a);
  }

  function itemTime(item: RadarItem) {
    const value = item.startsAt ?? item.publishedAt ?? '';
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
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
    const lines = ['个人雷达 · 每日摘要', ''];
    for (const item of activeItems) {
      lines.push(`• ${item.title}`);
      lines.push(`  ${item.summary}`);
    }
    if (activeItems.length === 0) lines.push('暂无可发送的活跃项目。');
    return lines.join('\n');
  }

  function getAddWatchTitle(type: WatchTopic['type'], mode: WatchTopic['mode']) {
    if (mode === 'blacklist') return '添加屏蔽规则';
    if (type === 'artist') return '添加音乐人';
    if (type === 'source') return '添加来源';
    return '添加兴趣';
  }

  function getAddWatchHint(type: WatchTopic['type'], category: string, mode: WatchTopic['mode']) {
    if (mode === 'blacklist') return '从自动发现中隐藏匹配的演出、主题或来源';
    if (type === 'artist') return '跟踪新加坡演唱会和活动信号';
    if (type === 'source') return '跟踪可信网站、博客或官方账号';
    if (category === 'business') return '跟踪公司、产品、市场或创业机会信号';
    if (category === 'career') return '跟踪岗位市场、技能和招聘信号';
    return '在每日趋势流中跟踪这个主题';
  }

  function getAddWatchPlaceholder(type: WatchTopic['type'], category: string, mode: WatchTopic['mode']) {
    if (mode === 'blacklist') return '例如：要隐藏的艺人或活动关键词';
    if (type === 'artist') return '例如：One Spark、TWICE、Coldplay、陈奕迅';
    if (type === 'source') return '例如：JYPETWICE 官方 X、CNA、Music Matters';
    if (category === 'business') return '例如：Dreame、追觅、消费硬件风险';
    if (category === 'career') return '例如：新加坡 AI 产品岗位';
    return '例如：中美 AI 政策、东南亚融资';
  }

  function preferenceMeta(topic: WatchTopic) {
    const type = topic.type === 'artist' ? '音乐人' : topic.type === 'source' ? '来源' : '主题';
    const mode = topic.mode === 'blacklist' ? '已屏蔽' : '已关注';
    const categories: Record<string, string> = {
      business: '商业',
      career: '职业',
      geopolitics: '地缘政治',
      concerts: '演出'
    };
    return `${type} · ${mode} · ${categories[topic.category] ?? topic.category} · P${topic.priority}`;
  }

  function getGreeting(view: View, count: number) {
    if (view === 'concerts') {
      return {
        eyebrow: '演出雷达 · 新加坡',
        title: `${count} 条活跃演出信号。`,
        body: '这里仅显示未来或仍可行动的演出信号。已经结束的新加坡场次不会进入顶部推荐。'
      };
    }
    if (view === 'trends') {
      return {
        eyebrow: '趋势雷达 · 职业、商业、地缘政治',
        title: `${count} 条趋势信号待查看。`,
        body: '职业、市场、地缘政治和商业机会会集中在这里，避免被演出关注淹没。'
      };
    }
    if (view === 'me') {
      return {
        eyebrow: '我的资料 · 偏好',
        title: '调校你的个人雷达。',
        body: '保存和重点跟踪会提高类似信号的排序；标记不相关会降低类似内容。'
      };
    }
    if (view === 'dates') {
      return {
        eyebrow: '日期簿 · 农历生日',
        title: '生日和纪念日。',
        body: '农历日期会按每年同月同日计算下一次提醒，接近日期会出现在首页和每日摘要里。'
      };
    }
    return {
      eyebrow: '晨间简报 · 新加坡',
      title: `${count} 条信号值得查看。`,
      body: '根据你的关注列表筛选演出开票、主题热度和商业机会。'
    };
  }

  function todayInputValue() {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }

  function reminderPayloadDate(value: string, calendarType: DateReminder['calendarType']) {
    const [year, month, day] = value.split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return { month: 1, day: 1, lunarIsLeapMonth: false };
    }
    if (calendarType === 'gregorian') return { month, day, lunarIsLeapMonth: false };
    const lunar = Solar.fromYmd(year, month, day).getLunar();
    return {
      month: Math.abs(lunar.getMonth()),
      day: lunar.getDay(),
      lunarIsLeapMonth: lunar.getMonth() < 0
    };
  }

  function selectedDateLabel(value: string, calendarType: DateReminder['calendarType']) {
    const [year, month, day] = value.split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return '';
    if (calendarType === 'gregorian') return `公历 ${year}-${pad2(month)}-${pad2(day)}`;
    const lunar = Solar.fromYmd(year, month, day).getLunar();
    const leap = lunar.getMonth() < 0 ? '闰' : '';
    return `农历 ${leap}${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
  }

  function dualDateLabel(value: string) {
    const [year, month, day] = value.split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return '';
    const lunar = Solar.fromYmd(year, month, day).getLunar();
    const leap = lunar.getMonth() < 0 ? '闰' : '';
    return `公历 ${year}-${pad2(month)}-${pad2(day)} · 农历 ${leap}${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
  }

  function pad2(value: number) {
    return String(value).padStart(2, '0');
  }
</script>

<svelte:head>
  <title>个人雷达</title>
  <link rel="icon" href="/brand/personal-radar-logo.svg" />
  <meta
    name="description"
    content="用于跟踪新加坡演出、趋势、职业信号和商业机会的个人监控应用。"
  />
</svelte:head>

<main class="app-shell">
  <nav class="topbar">
    <div class="brand">
      <img class="logo" src="/brand/personal-radar-logo.svg" alt="" />
      <div>
        <strong>个人雷达</strong>
        <span>凡人咖啡馆</span>
      </div>
    </div>
    <div class="primary-nav desktop-nav" data-active={activeView} aria-label="主导航">
      <span class="nav-indicator" aria-hidden="true"></span>
      {#each navItems as item}
        <button class:active={activeView === item.id} type="button" onclick={() => setView(item.id)}>
          {item.label}
        </button>
      {/each}
    </div>
    <div class="top-actions">
      <button class:active={searchOpen} class="icon-button" aria-label="搜索" onclick={toggleSearch}>
        <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.2"></circle>
          <path d="m16 16 4.2 4.2"></path>
        </svg>
      </button>
      <button class:active={digestOpen} class="button" onclick={toggleDigest}>摘要</button>
      <button class="button primary" onclick={() => openAddWatch('topic', 'business')}>添加关注</button>
    </div>
  </nav>

  <div class="app-main">
    <section class="feed">
      {#if searchOpen || digestOpen}
        <section class="action-panel">
          {#if searchOpen}
            <div class="action-card search-card">
              <div class="action-card-head">
                <label for="feed-search">搜索雷达</label>
                <button class="close-button" type="button" aria-label="关闭搜索" onclick={() => (searchOpen = false)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18"></path>
                  </svg>
                </button>
              </div>
              <div class="search-row">
                <input
                  id="feed-search"
                  bind:value={searchQuery}
                  placeholder="试试：追觅、AI 岗位、TWICE、新加坡..."
                />
                <button class="small-button" onclick={() => (searchQuery = '')}>清空</button>
              </div>
            </div>
          {/if}

          {#if digestOpen}
            <div class="action-card">
              <div class="action-card-head">
                <div>
                  <strong>每日摘要预览</strong>
                  <span>Telegram 消息草稿</span>
                </div>
                <button class="close-button" type="button" aria-label="关闭摘要预览" onclick={() => (digestOpen = false)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18"></path>
                  </svg>
                </button>
              </div>
              <pre>{digestPreview}</pre>
              <div class="digest-actions">
                <button
                  class="small-button primary"
                  type="button"
                  disabled={digestSendPending || !data.telegramConfigured}
                  onclick={sendTelegramSummary}
                >
                  {digestSendPending ? '发送中...' : '发送到 Telegram'}
                </button>
                {#if digestSendMessage}<span>{digestSendMessage}</span>{/if}
                {#if !data.telegramConfigured}<span>Telegram 尚未配置。</span>{/if}
              </div>
            </div>
          {/if}

          {#if addWatchOpen}
            <div class="action-card">
              <div class="action-card-head">
                <div>
                  <strong>{addWatchTitle}</strong>
                  <span>{addWatchHint}</span>
                </div>
                <button class="close-button" type="button" aria-label="关闭添加关注" onclick={() => (addWatchOpen = false)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18"></path>
                  </svg>
                </button>
              </div>
              <div class="watch-form">
                <input bind:value={newWatchName} placeholder={addWatchPlaceholder} />
                <select bind:value={newWatchType} aria-label="关注类型">
                  <option value="topic">主题</option>
                  <option value="artist">音乐人</option>
                  <option value="source">来源</option>
                </select>
                <select bind:value={newWatchCategory} aria-label="关注分类">
                  <option value="business">商业</option>
                  <option value="career">职业</option>
                  <option value="geopolitics">地缘政治</option>
                  <option value="concerts">演出</option>
                </select>
                <select bind:value={newWatchPriority} aria-label="优先级">
                  <option value={1}>优先级 1</option>
                  <option value={2}>优先级 2</option>
                  <option value={3}>优先级 3</option>
                  <option value={4}>优先级 4</option>
                  <option value={5}>优先级 5</option>
                </select>
                <select bind:value={newWatchMode} aria-label="偏好模式">
                  <option value="follow">关注</option>
                  <option value="blacklist">屏蔽</option>
                </select>
                <button class="small-button primary" disabled={addWatchPending} onclick={addWatchTopic}>
                  {addWatchPending ? '添加中...' : '添加'}
                </button>
              </div>
              {#if addWatchError}<p class="form-error">{addWatchError}</p>{/if}
            </div>
          {/if}

          {#if editingTopicId}
            <div class="action-card">
              <div class="action-card-head">
                <div>
                  <strong>编辑偏好</strong>
                  <span>手动偏好会提升、压低或移除发现的信号</span>
                </div>
                <button class="close-button" type="button" aria-label="关闭编辑偏好" onclick={() => (editingTopicId = null)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18"></path>
                  </svg>
                </button>
              </div>
              <div class="watch-form edit-form">
                <input bind:value={editWatchName} placeholder="偏好名称" />
                <select bind:value={editWatchType} aria-label="关注类型">
                  <option value="topic">主题</option>
                  <option value="artist">音乐人</option>
                  <option value="source">来源</option>
                </select>
                <select bind:value={editWatchCategory} aria-label="关注分类">
                  <option value="business">商业</option>
                  <option value="career">职业</option>
                  <option value="geopolitics">地缘政治</option>
                  <option value="concerts">演出</option>
                </select>
                <select bind:value={editWatchPriority} aria-label="优先级">
                  <option value={1}>优先级 1</option>
                  <option value={2}>优先级 2</option>
                  <option value={3}>优先级 3</option>
                  <option value={4}>优先级 4</option>
                  <option value={5}>优先级 5</option>
                </select>
                <select bind:value={editWatchMode} aria-label="偏好模式">
                  <option value="follow">关注</option>
                  <option value="blacklist">屏蔽</option>
                </select>
                <button class="small-button primary" disabled={topicPending === editingTopicId} onclick={saveTopicEdit}>
                  {topicPending === editingTopicId ? '保存中...' : '保存'}
                </button>
                <button class="small-button" onclick={() => (editingTopicId = null)}>取消</button>
              </div>
              {#if editWatchError}<p class="form-error">{editWatchError}</p>{/if}
            </div>
          {/if}

          {#if reminderFormOpen}
            <div class="action-card">
              <div class="action-card-head">
                <div>
                  <strong>{editingReminderId ? '编辑生日提醒' : '添加生日提醒'}</strong>
                  <span>默认按农历每年提醒，适合生日和重要纪念日</span>
                </div>
                <button class="close-button" type="button" aria-label="关闭生日提醒" onclick={() => (reminderFormOpen = false)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18"></path>
                  </svg>
                </button>
              </div>
              <div class="watch-form reminder-form">
                <input bind:value={reminderTitle} placeholder="例如：老妈生日、纪念日" />
                <select bind:value={reminderCalendarType} aria-label="日期类型">
                  <option value="lunar">农历</option>
                  <option value="gregorian">公历</option>
                </select>
                <input use:datepicker bind:value={reminderDate} placeholder="选择目标日期" />
                <label class="check-row">
                  <input type="checkbox" bind:checked={reminderPinned} />
                  置顶
                </label>
                <span class="date-preview">{selectedDateLabel(reminderDate, reminderCalendarType)}</span>
                <button class="small-button primary" disabled={reminderPending} onclick={saveReminder}>
                  {reminderPending ? '保存中...' : '保存提醒'}
                </button>
              </div>
              {#if reminderError}<p class="form-error">{reminderError}</p>{/if}
            </div>
          {/if}
        </section>
      {/if}

      {#if activeView === 'dates'}
        <DateRemindersView
          {reminders}
          {nextReminder}
          {reminderPending}
          onAdd={() => openReminderForm()}
          onEdit={openReminderForm}
          onDelete={deleteReminder}
        />
      {:else if activeView === 'me'}
        <section class="me-workspace">
          <div class="settings-grid">
            <article class="settings-card">
              <span>资料</span>
              <strong>个人雷达</strong>
              <p>Telegram {data.telegramConfigured ? '已连接' : '未配置'} · AI {data.aiEnabled ? '可用' : '关闭'} · {followedTopicCount} 个关注</p>
            </article>
            <article class="settings-card">
              <span>下一条提醒</span>
              <strong>{nextReminder ? `${nextReminder.daysLeft} 天` : '暂无'}</strong>
              <p>{nextReminder ? `${nextReminder.title} · ${nextReminder.dateLabel}` : '添加生日或纪念日后会显示在这里。'}</p>
            </article>
          </div>

          <section class="notebook-card">
            <div class="notebook-head">
              <div>
                <h2>偏好与设置</h2>
                <span>管理音乐人、趋势主题、来源和屏蔽规则。</span>
              </div>
              <button class="small-button primary" type="button" onclick={() => openAddWatch('topic', 'business')}>添加关注</button>
            </div>
          <div class="settings-grid compact">
            <button type="button" onclick={() => (preferenceView = 'artist')}>
              <strong>{watchTopics.length}</strong>
              <span>音乐人</span>
              </button>
              <button type="button" onclick={() => (preferenceView = 'topic')}>
                <strong>{interestTopics.length}</strong>
                <span>兴趣主题</span>
              </button>
              <button type="button" onclick={() => (preferenceView = 'blacklist')}>
                <strong>{blacklistTopics.length}</strong>
                <span>屏蔽规则</span>
              </button>
            </div>
          </section>
        </section>
      {:else}
      <div class="greeting">
        <div>
          <div class="eyebrow">{greeting.eyebrow}</div>
          <h1>{greeting.title}</h1>
          <p>
            {greeting.body} AI
            {data.aiEnabled ? '已配置可用' : '已关闭'}；规则评分会一直启用。
          </p>
        </div>
        <aside class="daily-card">
          <strong>每日摘要已就绪</strong>
          <span>
            Telegram {data.telegramConfigured ? '已启用' : '未配置'} · 你的反馈会影响后续排序。
          </span>
          <button
            class="small-button primary"
            type="button"
            disabled={digestSendPending || !data.telegramConfigured}
            onclick={sendTelegramSummary}
          >
            {digestSendPending ? '发送中...' : '发送摘要到 Telegram'}
          </button>
          {#if digestSendMessage}<small>{digestSendMessage}</small>{/if}
        </aside>
      </div>

      {#if activeView === 'home' && upcomingReminders.length > 0}
        <section class="reminder-strip" aria-label="临近日期">
          <div>
            <strong>临近日期</strong>
            <span>进入日期 tab 管理农历生日和纪念日</span>
          </div>
          <div class="reminder-strip-list">
            {#each upcomingReminders as reminder}
              <button type="button" onclick={() => setView('dates')}>
                <strong>{reminder.daysLeft}</strong>
                <span>{reminder.title}</span>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      {#if activeView === 'home'}
        <div class="tabs" aria-label="信息流筛选">
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
        <h2>{activeView === 'trends' ? '趋势流' : activeView === 'concerts' ? '演出流' : '重点推荐'}</h2>
        <span>用反馈调校排序</span>
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
                <span class="chip hot">{topItem.status === 'tracking' ? '重点跟踪' : '确认后提醒'}</span>
              </div>
              <div class="story-actions">
                <button
                  class="small-button primary"
                  disabled={feedbackPending === `${topItem.id}:track`}
                  onclick={() => sendFeedback(topItem.id, 'track')}
                >
                  重点跟踪
                </button>
                <button class="small-button" onclick={() => sendFeedback(topItem.id, 'save')}>保存</button>
                <button class="small-button" onclick={() => sendFeedback(topItem.id, 'not_relevant')}>不相关</button>
                {#if topItem.url}
                  <a class="source-link" href={topItem.url} target="_blank" rel="noreferrer">来源 · {sourceLabel(topItem)}</a>
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
                    来源 · {sourceLabel(item)}
                  </a>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <section class="empty-state">
          <h3>暂无匹配信号</h3>
          <p>添加关注主题，或运行抓取任务来填充你的个人信息流。</p>
        </section>
      {/if}

      <div class="section-title">
        <h2>{activeView === 'trends' ? '全部趋势分类' : '未来关注时间线'}</h2>
        <span>{activeView === 'trends' ? '职业 · 商业 · 地缘政治' : '演出优先视图'}</span>
      </div>
      {#if activeView === 'trends'}
        <section class="timeline">
          {#each trendItems as item}
            <article class="timeline-item">
              <div class="date trend-date">
                <span><small>{itemKindLabel(item)}</small>{item.score}</span>
              </div>
              <img class="timeline-image" src={imageForItem(item)} alt="" loading="lazy" />
              <div>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
                {#if item.url}
                  <a class="source-link inline-source" href={item.url} target="_blank" rel="noreferrer">
                    来源 · {sourceLabel(item)}
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
                    来源 · {sourceLabel(item)}
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
                <h3>暂无确认的未来演出日期</h3>
                <p>TWICE 和 G.E.M. 的新加坡历史场次会被排除在这条未来时间线之外。</p>
              </div>
            </article>
          {/each}
        </section>
      {/if}
      {/if}
    </section>

    {#if activeView !== 'dates' && activeView !== 'me'}
    <aside class="side-panel">
      <section class="profile-card">
        <div class="avatar-row">
          <div class="avatar">S</div>
          <div>
            <strong>你的雷达</strong>
            <span>安静时段 · Telegram 每日摘要</span>
          </div>
        </div>
        <div class="focus">
          <div><strong>{items.length}</strong><span>信号</span></div>
          <div><strong>{items.filter((item) => item.kind === 'concert').length}</strong><span>演出</span></div>
        </div>
      </section>

      <section class="mini-card preference-card">
        <div class="mini-card-head">
          <div>
            <h2>偏好</h2>
            <span>{followedTopicCount} 个关注 · {blacklistTopics.length} 个屏蔽</span>
          </div>
          <div class="preference-add">
            <button type="button" onclick={() => openAddWatch('artist', 'concerts')}>音乐人</button>
            <button type="button" onclick={() => openAddWatch('topic', 'business')}>兴趣</button>
            <button type="button" onclick={() => openAddBlacklist()}>屏蔽</button>
          </div>
        </div>

        <div class="preference-summary" aria-label="偏好概览">
          <button type="button" onclick={() => (preferenceView = 'artist')}>
            <strong>{watchTopics.length}</strong>
            <span>音乐人</span>
          </button>
          <button type="button" onclick={() => (preferenceView = 'topic')}>
            <strong>{interestTopics.length}</strong>
            <span>兴趣</span>
          </button>
          <button type="button" onclick={() => (preferenceView = 'blacklist')}>
            <strong>{blacklistTopics.length}</strong>
            <span>已屏蔽</span>
          </button>
        </div>

        <div class="preference-search">
          <svg class="mini-search-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.2"></circle>
            <path d="m16 16 4.2 4.2"></path>
          </svg>
          <input bind:value={preferenceQuery} placeholder="搜索音乐人、主题、来源..." />
        </div>

        <div class="preference-tabs" aria-label="偏好筛选">
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
          <span>{preferenceMatchCount} 个匹配</span>
          {#if preferenceMatchCount > filteredPreferenceTopics.length}
            <span>显示前 {filteredPreferenceTopics.length} 个</span>
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
                <button type="button" onclick={() => startEditTopic(topic)}>编辑</button>
                {#if topic.mode === 'blacklist'}
                  <button type="button" disabled={topicPending === topic.id} onclick={() => updateTopicMode(topic, 'follow')}>
                    关注
                  </button>
                {:else}
                  <button type="button" disabled={topicPending === topic.id} onclick={() => updateTopicMode(topic, 'blacklist')}>
                    屏蔽
                  </button>
                {/if}
                <button type="button" disabled={topicPending === topic.id} onclick={() => removeTopic(topic)}>移除</button>
              </div>
            </article>
          {:else}
            <p class="quiet-copy">没有匹配的偏好。你可以添加音乐人、兴趣、来源或屏蔽规则。</p>
          {/each}
        </div>
      </section>

      <section class="mini-card">
        <h2>今日摘要</h2>
        <div class="brew-list">
          <div class="brew">
            <div>
              <strong>演出来源</strong>
              <span>包含新加坡音乐活动广泛发现，以及在 Ticketmaster 和 Bandsintown 上按音乐人跟踪。</span>
            </div>
          </div>
          <div class="brew">
            <div>
              <strong>趋势主题</strong>
              <span>新加坡科技岗位、东南亚融资、中美 AI 政策、比亚迪和电动车市场信号。</span>
            </div>
          </div>
          <div class="brew">
            <div>
              <strong>AI 模式</strong>
              <span>可选：优先 Gemini，DeepSeek 兜底；不可用时使用规则评分。</span>
            </div>
          </div>
        </div>
      </section>
    </aside>
    {/if}
  </div>

</main>

{#if addWatchOpen}
  <div class="modal-backdrop" role="presentation" tabindex="-1" onkeydown={(event) => event.key === 'Escape' && (addWatchOpen = false)} onclick={(event) => event.target === event.currentTarget && (addWatchOpen = false)}>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="add-watch-title">
      <div class="modal-head">
        <div>
          <h2 id="add-watch-title">{addWatchTitle}</h2>
          <p>{addWatchHint}</p>
        </div>
        <button class="close-button" type="button" aria-label="关闭添加关注" onclick={() => (addWatchOpen = false)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>
        </button>
      </div>
      <div class="modal-form watch-form">
        <input bind:value={newWatchName} placeholder={addWatchPlaceholder} />
        <select bind:value={newWatchType} aria-label="关注类型">
          <option value="topic">主题</option>
          <option value="artist">音乐人</option>
          <option value="source">来源</option>
        </select>
        <select bind:value={newWatchCategory} aria-label="关注分类">
          <option value="business">商业</option>
          <option value="career">职业</option>
          <option value="geopolitics">地缘政治</option>
          <option value="concerts">演出</option>
        </select>
        <select bind:value={newWatchPriority} aria-label="优先级">
          <option value={1}>优先级 1</option>
          <option value={2}>优先级 2</option>
          <option value={3}>优先级 3</option>
          <option value={4}>优先级 4</option>
          <option value={5}>优先级 5</option>
        </select>
        <select bind:value={newWatchMode} aria-label="偏好模式">
          <option value="follow">关注</option>
          <option value="blacklist">屏蔽</option>
        </select>
      </div>
      {#if addWatchError}<p class="form-error">{addWatchError}</p>{/if}
      <div class="modal-actions">
        <button class="small-button" type="button" onclick={() => (addWatchOpen = false)}>取消</button>
        <button class="small-button primary" type="button" disabled={addWatchPending} onclick={addWatchTopic}>
          {addWatchPending ? '添加中...' : '添加'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if editingTopicId}
  <div class="modal-backdrop" role="presentation" tabindex="-1" onkeydown={(event) => event.key === 'Escape' && (editingTopicId = null)} onclick={(event) => event.target === event.currentTarget && (editingTopicId = null)}>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="edit-watch-title">
      <div class="modal-head">
        <div>
          <h2 id="edit-watch-title">编辑偏好</h2>
          <p>保存后会立即重新拉取相关数据并刷新信息流。</p>
        </div>
        <button class="close-button" type="button" aria-label="关闭编辑偏好" onclick={() => (editingTopicId = null)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>
        </button>
      </div>
      <div class="modal-form watch-form">
        <input bind:value={editWatchName} placeholder="偏好名称" />
        <select bind:value={editWatchType} aria-label="关注类型">
          <option value="topic">主题</option>
          <option value="artist">音乐人</option>
          <option value="source">来源</option>
        </select>
        <select bind:value={editWatchCategory} aria-label="关注分类">
          <option value="business">商业</option>
          <option value="career">职业</option>
          <option value="geopolitics">地缘政治</option>
          <option value="concerts">演出</option>
        </select>
        <select bind:value={editWatchPriority} aria-label="优先级">
          <option value={1}>优先级 1</option>
          <option value={2}>优先级 2</option>
          <option value={3}>优先级 3</option>
          <option value={4}>优先级 4</option>
          <option value={5}>优先级 5</option>
        </select>
        <select bind:value={editWatchMode} aria-label="偏好模式">
          <option value="follow">关注</option>
          <option value="blacklist">屏蔽</option>
        </select>
      </div>
      {#if editWatchError}<p class="form-error">{editWatchError}</p>{/if}
      <div class="modal-actions">
        <button class="small-button" type="button" onclick={() => (editingTopicId = null)}>取消</button>
        <button class="small-button primary" type="button" disabled={topicPending === editingTopicId} onclick={saveTopicEdit}>
          {topicPending === editingTopicId ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if reminderFormOpen}
  <div class="modal-backdrop" role="presentation" tabindex="-1" onkeydown={(event) => event.key === 'Escape' && (reminderFormOpen = false)} onclick={(event) => event.target === event.currentTarget && (reminderFormOpen = false)}>
    <div class="modal-card reminder-modal" role="dialog" aria-modal="true" aria-labelledby="reminder-title">
      <div class="modal-head soft">
        <button class="back-button" type="button" aria-label="关闭日期提醒" onclick={() => (reminderFormOpen = false)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>
        </button>
        <h2 id="reminder-title">{editingReminderId ? '编辑日期提醒' : '添加日期提醒'}</h2>
        <button class="text-button" type="button" disabled={reminderPending} onclick={saveReminder}>
          {reminderPending ? '保存中' : '保存'}
        </button>
      </div>

      <div class="reminder-sheet">
        <label class="sheet-row title-row">
          <span>T</span>
          <input bind:value={reminderTitle} placeholder="日期名称" />
        </label>

        <div class="sheet-group">
          <div class="sheet-label">目标日</div>
          <div class="date-picker-row">
            <input use:datepicker bind:value={reminderDate} aria-label="目标日期" />
            <select bind:value={reminderCalendarType} aria-label="日期类型">
              <option value="lunar">农历</option>
              <option value="gregorian">公历</option>
            </select>
          </div>
          <p>
            {dualDateLabel(reminderDate)} · 保存为{reminderCalendarType === 'lunar'
              ? '农历每年提醒'
              : '公历每年提醒'}
          </p>
        </div>

        <div class="sheet-row">
          <span>↻</span>
          <strong>重复</strong>
          <em>每年（相同月日）</em>
        </div>

        <div class="sheet-row">
          <span>铃</span>
          <strong>设置提醒</strong>
          <em>每日摘要：当天、1 天前、7 天前</em>
        </div>

        <label class="sheet-row">
          <span>↑</span>
          <strong>置顶</strong>
          <input type="checkbox" bind:checked={reminderPinned} />
        </label>
      </div>
      {#if reminderError}<p class="form-error">{reminderError}</p>{/if}
    </div>
  </div>
{/if}

<nav class="primary-nav mobile-nav" data-active={activeView} aria-label="主导航">
  <span class="nav-indicator" aria-hidden="true"></span>
  {#each navItems as item}
    <button class:active={activeView === item.id} type="button" onclick={() => setView(item.id)}>
      {item.label}
    </button>
  {/each}
</nav>

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
    isolation: isolate;
    overflow: hidden;
    position: relative;
  }

  .primary-nav button {
    border: 0;
    flex: 1;
    min-width: 92px;
    min-height: 34px;
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    font-size: 13px;
    font-weight: 950;
    position: relative;
    z-index: 1;
    transition: color 180ms ease;
  }

  .primary-nav button.active {
    color: var(--accent-text);
  }

  .nav-indicator {
    position: absolute;
    left: 5px;
    top: 5px;
    bottom: 5px;
    width: calc((100% - 10px) / 5);
    border-radius: 999px;
    background: var(--jade);
    box-shadow: 0 8px 18px rgba(31, 111, 91, 0.2);
    transform: translateX(0);
    transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
    z-index: 0;
  }

  .primary-nav[data-active='concerts'] .nav-indicator {
    transform: translateX(100%);
  }

  .primary-nav[data-active='trends'] .nav-indicator {
    transform: translateX(200%);
  }

  .primary-nav[data-active='dates'] .nav-indicator {
    transform: translateX(300%);
  }

  .primary-nav[data-active='me'] .nav-indicator {
    transform: translateX(400%);
  }

  .mobile-nav {
    display: none;
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
    align-items: start;
    margin-bottom: 10px;
  }

  .action-card-head strong,
  .search-card label {
    font-size: 14px;
    font-weight: 950;
  }

  .action-card-head span {
    display: block;
    margin-top: 3px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 850;
  }

  .close-button {
    width: 30px;
    height: 30px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: #fff8eb;
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

  .action-card pre {
    margin: 0;
    white-space: pre-wrap;
    color: var(--muted);
    font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  .digest-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }

  .digest-actions span {
    color: var(--muted);
    font-size: 12px;
    font-weight: 850;
  }

  .search-row,
  .watch-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    margin-top: 8px;
  }

  .watch-form {
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    align-items: end;
  }

  .edit-form {
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
  }

  .watch-form input {
    grid-column: span 2;
    min-width: 0;
  }

  .watch-form button {
    min-height: 38px;
  }

  .check-row {
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff8eb;
    color: var(--muted);
    padding: 0 10px;
    font-size: 12px;
    font-weight: 900;
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

  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: 18px;
    background: rgba(39, 31, 23, 0.28);
    backdrop-filter: blur(10px);
  }

  .modal-card {
    width: min(620px, 100%);
    max-height: min(760px, calc(100vh - 36px));
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: 20px;
    background: #fffdf7;
    box-shadow: 0 32px 90px rgba(38, 29, 20, 0.26);
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

  .modal-form {
    margin-top: 0;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  .reminder-modal {
    background: linear-gradient(180deg, #fbecd9, #fffdf7 150px);
  }

  .modal-head.soft {
    align-items: center;
  }

  .modal-head.soft h2 {
    color: #2d6382;
    font-weight: 900;
  }

  .back-button,
  .text-button {
    border: 0;
    background: transparent;
    color: #7ea79d;
    font-weight: 950;
  }

  .back-button {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 999px;
  }

  .back-button:hover {
    background: rgba(126, 167, 157, 0.12);
  }

  .back-button svg {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .reminder-sheet {
    display: grid;
    gap: 16px;
    border-radius: 22px;
    background: rgba(255, 253, 247, 0.94);
    padding: 18px;
  }

  .sheet-row {
    min-height: 56px;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    border-bottom: 1px solid rgba(130, 111, 91, 0.14);
    color: #2d6382;
  }

  .sheet-row:last-child {
    border-bottom: 0;
  }

  .sheet-row > span {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    background: rgba(126, 167, 157, 0.1);
    color: #7ea79d;
    font-weight: 950;
  }

  .sheet-row strong,
  .sheet-label {
    color: #6d9f99;
    font-size: 18px;
    font-weight: 950;
  }

  .sheet-row em {
    color: var(--muted);
    font-style: normal;
    font-weight: 850;
  }

  .sheet-row input[type='checkbox'] {
    width: 46px;
    height: 26px;
    accent-color: #7ea79d;
  }

  .title-row input {
    grid-column: 2 / -1;
    min-height: 44px;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--ink);
    font-size: 22px;
    font-weight: 900;
  }

  .sheet-group {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 12px;
    align-items: start;
    border-bottom: 1px solid rgba(130, 111, 91, 0.14);
    padding-bottom: 16px;
  }

  .sheet-label {
    grid-column: 2;
  }

  .date-picker-row {
    grid-column: 2;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 110px;
    gap: 8px;
    margin-top: 8px;
  }

  .date-picker-row input,
  .date-picker-row select {
    min-height: 46px;
    border: 1px solid rgba(130, 111, 91, 0.22);
    border-radius: 12px;
    background: #fffdf7;
    color: var(--ink);
    padding: 0 12px;
    font-weight: 850;
  }

  .sheet-group p {
    grid-column: 2;
    margin: 8px 0 0;
    color: var(--muted);
    font-weight: 850;
  }

  :global(.datepicker) {
    border-color: var(--line);
    border-radius: 14px;
    box-shadow: 0 18px 48px rgba(38, 29, 20, 0.18);
    font-family: inherit;
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

  .daily-card button {
    margin-top: 12px;
  }

  .daily-card small {
    display: block;
    margin-top: 7px;
    color: #65584b;
    font-size: 11px;
    font-weight: 850;
    line-height: 1.35;
  }

  .reminder-strip {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 14px;
    align-items: center;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: linear-gradient(105deg, rgba(251, 241, 228, 0.96), rgba(215, 242, 220, 0.62));
    padding: 14px;
    margin-bottom: 18px;
  }

  .reminder-strip strong,
  .reminder-strip span {
    display: block;
  }

  .reminder-strip > div:first-child strong {
    color: #2d6382;
    font-size: 15px;
  }

  .reminder-strip > div:first-child span {
    margin-top: 3px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 850;
  }

  .reminder-strip-list {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    justify-content: flex-end;
  }

  .reminder-strip-list button {
    min-width: 92px;
    border: 1px solid rgba(126, 167, 157, 0.32);
    border-radius: 14px;
    background: #fffdf7;
    color: #2d6382;
    padding: 9px 11px;
    text-align: left;
  }

  .reminder-strip-list button strong {
    font-size: 24px;
    line-height: 1;
  }

  .reminder-strip-list button span {
    margin-top: 4px;
    overflow: hidden;
    color: var(--muted);
    font-size: 11px;
    font-weight: 900;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .me-workspace {
    display: grid;
    gap: 14px;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .settings-grid.compact {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .settings-card,
  .notebook-card,
  .settings-grid.compact button {
    border: 1px solid var(--line);
    border-radius: 12px;
    background: #fffdf7;
  }

  .settings-card,
  .notebook-card {
    padding: 16px;
  }

  .settings-card span,
  .notebook-head span {
    color: var(--muted);
    font-size: 12px;
    font-weight: 850;
  }

  .settings-card strong {
    display: block;
    margin-top: 7px;
    font-family: Newsreader, Georgia, serif;
    font-size: 28px;
    line-height: 1.05;
  }

  .settings-card p {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }

  .notebook-head {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    align-items: center;
    margin-bottom: 12px;
  }

  .notebook-head h2 {
    margin: 0 0 4px;
    font-size: 16px;
  }

  .settings-grid.compact button {
    padding: 12px;
    text-align: left;
    color: var(--ink);
  }

  .settings-grid.compact strong {
    display: block;
    font-size: 22px;
  }

  .settings-grid.compact span {
    display: block;
    margin-top: 4px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 850;
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
      padding-bottom: 92px;
    }

    .topbar {
      padding: 16px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      backdrop-filter: none;
    }

    .desktop-nav {
      display: none;
    }

    .mobile-nav {
      display: flex;
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: 14px;
      bottom: calc(14px + env(safe-area-inset-bottom, 0px));
      z-index: 30;
      overflow-x: auto;
      justify-content: stretch;
      scrollbar-width: none;
      box-shadow: 0 18px 42px rgba(38, 29, 20, 0.24);
      backdrop-filter: blur(18px);
    }

    .mobile-nav::-webkit-scrollbar {
      display: none;
    }

    .mobile-nav button {
      min-width: 0;
      font-size: 12px;
    }

    .button {
      display: none;
    }

    .top-actions .button.primary {
      display: inline-flex;
      align-items: center;
    }

    .watch-form,
    .search-row {
      grid-template-columns: 1fr;
    }

    .watch-form input {
      grid-column: 1;
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

    .date-picker-row,
    .watch-form,
    .search-row {
      grid-template-columns: 1fr;
    }

    .reminder-strip {
      grid-template-columns: 1fr;
    }

    .reminder-strip-list {
      justify-content: flex-start;
    }

    h1 {
      font-size: 34px;
    }

    .daily-card {
      width: auto;
    }

    .settings-grid,
    .settings-grid.compact {
      grid-template-columns: 1fr;
    }

    .notebook-head {
      align-items: flex-start;
    }

    .story-grid {
      grid-template-columns: 1fr;
    }

    .story {
      display: grid;
      grid-template-columns: 104px minmax(0, 1fr);
    }

    .hero-story {
      grid-column: span 1;
      grid-template-columns: 112px minmax(0, 1fr);
    }

    .story-body {
      padding: 13px;
    }

    .story-media,
    .story-thumb {
      align-self: start;
      min-height: 0;
      height: 128px;
      aspect-ratio: auto;
      border-right: 1px solid var(--line);
      border-bottom: 0;
    }

    .story-thumb {
      height: 112px;
    }

    .story h3,
    .story:not(.hero-story) h3 {
      font-size: 16px;
      line-height: 1.16;
    }

    .story p {
      margin-top: 8px;
    }

    .story-kicker {
      margin-bottom: 7px;
      font-size: 11px;
    }

    .chips,
    .story-actions {
      margin-top: 10px;
    }

    .source-link {
      min-height: 29px;
      white-space: normal;
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
