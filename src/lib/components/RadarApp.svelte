<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import CoePriceView from '$lib/components/CoePriceView.svelte';
  import DateRemindersView from '$lib/components/DateRemindersView.svelte';
  import type { CoePayload } from '$lib/coe';
  import type { CronJobStatus, DateCategory, DateReminder, FeedbackAction, JobResult, RadarItem, WatchTopic } from '$lib/server/types';
  import { Solar } from 'lunar-javascript';
  import { onMount } from 'svelte';
  import 'vanillajs-datepicker/css/datepicker.css';
  import type { RadarPageData } from '$lib/server/radar-page-load';
  import type { FeatureId } from '$lib/server/features';

  type View = 'home' | 'concerts' | 'trends' | 'dates' | 'gym' | 'coe' | 'interests' | 'me' | 'settings' | 'saved';
  type NavSlotId = 'concerts' | 'trends' | 'dates' | 'gym' | 'coe' | 'interests' | 'me' | 'settings';

  function featureAllowed(id: FeatureId): boolean {
    return Boolean(data.features?.[id]?.allowed);
  }
  type PreferenceView = 'all' | WatchTopic['type'] | WatchTopic['mode'];
  type ReminderView = DateReminder & {
    nextDate: string;
    daysLeft: number;
    dateLabel: string;
    daysSince?: number;
    ageLabel?: string;
    originDate?: string;
    upcomingMilestones: Array<{ label: string; dayNumber: number; targetDate: string; daysFromNow: number; kind: 'age' | 'day_count' | 'vaccination' | 'tradition' | 'holiday' }>;
  };
  type IcaToolStatus = RadarPageData['icaTool'];

  const viewPaths: Record<View, string> = {
    home: '/home',
    concerts: '/concerts',
    trends: '/trends',
    dates: '/dates',
    gym: '/gym',
    coe: '/coe',
    interests: '/interests',
    me: '/me',
    settings: '/settings',
    saved: '/saved'
  };

  const NAV_STORAGE_KEY = 'personal-radar-middle-nav';
  const ALL_NAV_OPTIONS: Array<{ id: NavSlotId; label: string }> = [
    { id: 'concerts', label: '演出' },
    { id: 'trends', label: '趋势' },
    { id: 'dates', label: '日期' },
    { id: 'gym', label: '健身' },
    { id: 'coe', label: 'COE' },
    { id: 'interests', label: '兴趣' },
    { id: 'me', label: '我的' },
    { id: 'settings', label: '设置' }
  ];
  const DEFAULT_MIDDLE_NAV: NavSlotId[] = ['concerts', 'dates', 'gym'];
  const MORE_MENU_ITEMS: Array<{ id: View; label: string; hint: string }> = [
    { id: 'me', label: '我的', hint: '资料、工具与收藏' },
    { id: 'concerts', label: '演出', hint: '演出流与时间线' },
    { id: 'coe', label: 'COE', hint: '新加坡官方报价' },
    { id: 'interests', label: '兴趣', hint: '关注主题与屏蔽' },
    { id: 'settings', label: '设置', hint: '导航与偏好配置' }
  ];

  function normalizeMiddleNav(value: unknown, options?: { fallbackToDefault?: boolean }): NavSlotId[] {
    const valid = new Set(ALL_NAV_OPTIONS.map((item) => item.id));
    const ids = Array.isArray(value)
      ? value.filter((item): item is NavSlotId => typeof item === 'string' && valid.has(item as NavSlotId))
      : [];
    const unique = [...new Set(ids)].slice(0, 3);
    if (unique.length === 0 && options?.fallbackToDefault !== false) {
      return [...DEFAULT_MIDDLE_NAV];
    }
    return unique;
  }

  function readStoredMiddleNav(): NavSlotId[] {
    if (typeof window === 'undefined') return [...DEFAULT_MIDDLE_NAV];
    try {
      const stored = window.localStorage.getItem(NAV_STORAGE_KEY);
      if (!stored) return [...DEFAULT_MIDDLE_NAV];
      return normalizeMiddleNav(JSON.parse(stored));
    } catch {
      return [...DEFAULT_MIDDLE_NAV];
    }
  }

  let { data }: { data: RadarPageData } = $props();
  let items = $state<RadarItem[]>([]);
  let savedItems = $state<RadarItem[]>([]);
  let topics = $state<WatchTopic[]>([]);
  let reminders = $state<ReminderView[]>([]);
  let activeView = $state<View>(viewFromPath(page.url.pathname));
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
  let newWatchOptimize = $state(true);
  let editingTopicId = $state<string | null>(null);
  let editWatchName = $state('');
  let editWatchType = $state<WatchTopic['type']>('topic');
  let editWatchCategory = $state('business');
  let editWatchPriority = $state(3);
  let editWatchMode = $state<WatchTopic['mode']>('follow');
  let editWatchOptimize = $state(true);
  let preferenceQuery = $state('');
  let preferenceView = $state<PreferenceView>('all');
  let feedbackPending = $state<string | null>(null);
  let addWatchPending = $state(false);

  type GymExercise = {
    id: string;
    name: string;
    bodyPart: string;
    equipment: string;
    target: string;
    secondaryMuscles: string[];
    instructions: string;
    gifUrl: string;
    imageUrl: string | null;
  };
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
  let gymResults = $state<GymExercise[]>([]);
  let gymLoading = $state(false);
  let gymLoaded = $state(false);
  let gymDetail = $state<GymExercise | null>(null);
  let gymDebounce: ReturnType<typeof setTimeout> | undefined;
  let coeData = $state<CoePayload | null>(null);
  let coeLoading = $state(false);
  let coeLoaded = $state(false);
  let coeError = $state('');
  const initialMiddleNav = readStoredMiddleNav();
  let middleNav = $state<NavSlotId[]>(initialMiddleNav);
  let moreMenuOpen = $state(false);
  let draftMiddleNav = $state<NavSlotId[]>([...initialMiddleNav]);

  async function loadExercises() {
    gymLoading = true;
    gymLoaded = true;
    try {
      const params = new URLSearchParams();
      const query = gymQuery.trim();
      if (query) params.set('q', query);
      if (gymBodyPart) params.set('bodyPart', gymBodyPart);
      const response = await fetch(`/api/exercises?${params.toString()}`);
      const data = (await response.json()) as { exercises?: GymExercise[] };
      gymResults = data.exercises ?? [];
    } catch {
      gymResults = [];
    } finally {
      gymLoading = false;
    }
  }

  function onGymSearch() {
    clearTimeout(gymDebounce);
    gymDebounce = setTimeout(loadExercises, 300);
  }

  function setGymBodyPart(bodyPart: string) {
    gymBodyPart = bodyPart;
    loadExercises();
  }

  async function loadCoe(force = false) {
    if (coeLoading) return;
    if (coeLoaded && !force) return;
    coeLoading = true;
    coeError = '';
    try {
      const response = await fetch('/api/coe');
      const payload = (await response.json()) as CoePayload & { error?: string };
      if (!response.ok) {
        coeError = payload.error || '加载失败';
        if (!coeData) coeData = payload;
      } else {
        coeData = payload;
        coeLoaded = true;
      }
    } catch (error) {
      coeError = String(error);
    } finally {
      coeLoading = false;
    }
  }

  /** Server nav wins over localStorage; used on first paint / mount. */
  function applyServerOrLocalNav(serverValue: unknown) {
    const serverNav = normalizeMiddleNav(serverValue, { fallbackToDefault: false });
    const storedNav = serverNav.length > 0 ? serverNav : readStoredMiddleNav();
    middleNav = storedNav;
    draftMiddleNav = [...storedNav];
    if (serverNav.length > 0 && typeof window !== 'undefined') {
      window.localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(serverNav));
    }
  }

  /** Keep bar nav + localStorage aligned with server without clobbering settings draft. */
  function syncNavFromServer(serverValue: unknown) {
    const serverNav = normalizeMiddleNav(serverValue, { fallbackToDefault: false });
    if (serverNav.length === 0) return;
    const key = serverNav.join(',');
    if (middleNav.join(',') !== key) middleNav = serverNav;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(serverNav));
    }
  }

  function saveMiddleNav(next: NavSlotId[]) {
    const normalized = normalizeMiddleNav(next, { fallbackToDefault: false });
    if (normalized.length === 0) return;
    middleNav = normalized;
    draftMiddleNav = [...normalized];
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(normalized));
    }
    void fetch('/api/settings/nav', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nav: normalized })
    }).catch(() => {
      /* localStorage already updated */
    });
  }

  function moveDraftNav(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draftMiddleNav.length) return;
    const next = [...draftMiddleNav];
    [next[index], next[target]] = [next[target], next[index]];
    draftMiddleNav = next;
  }

  function toggleDraftNavItem(id: NavSlotId) {
    if (draftMiddleNav.includes(id)) {
      if (draftMiddleNav.length <= 1) return;
      draftMiddleNav = draftMiddleNav.filter((item) => item !== id);
      return;
    }
    if (draftMiddleNav.length >= 3) return;
    draftMiddleNav = [...draftMiddleNav, id];
  }

  $effect(() => {
    if (activeView === 'gym' && !gymLoaded) loadExercises();
    if (activeView === 'coe') loadCoe();
  });
  let topicPending = $state<string | null>(null);
  let digestSendPending = $state(false);
  let digestSendMessage = $state('');
  let manualJobPending = $state(false);
  let manualJobToken = $state('');
  let manualJobStatus = $state<'idle' | 'running' | 'success' | 'error'>('idle');
  let manualJobMessage = $state('尚未手动刷新。');
  let manualJobLastRun = $state('');
  let icaTool = $state<IcaToolStatus>({
    enabled: false,
    targetBefore: '2026-07-01',
    checkerUrlConfigured: false,
    fallbackConfigured: false
  });
  let cronJobs = $state<CronJobStatus[]>([]);
  let icaJobPending = $state(false);
  let icaJobStatus = $state<'idle' | 'running' | 'success' | 'error'>('idle');
  let icaJobMessage = $state('尚未手动检查。');
  let addWatchError = $state('');
  let editWatchError = $state('');
  let devRequestText = $state('');
  let devRequestPending = $state(false);
  let devRequestMessage = $state('');
  let devRequests = $state<Array<{id: string; text: string; status: string; response: string; createdAt?: string}>>([]);
  let expandedDevRequest = $state<string | null>(null);
  let allowlistEmails = $state<string[]>([]);
  let allowlistNewEmail = $state('');
  let allowlistPending = $state(false);
  let allowlistMessage = $state('');
  let starterPending = $state(false);
  let starterMessage = $state('');
  let telegramLinked = $state(false);
  let telegramLinkPending = $state(false);
  let telegramLinkMessage = $state('');
  let telegramDeepLink = $state('');
  let featureRows = $state<Array<{
    id: FeatureId;
    label: string;
    description: string;
    enabled: boolean;
    minRole: 'member' | 'admin';
  }>>([]);
  let featurePendingId = $state<string | null>(null);
  let featureMessage = $state('');
  let dedupPending = $state<string | null>(null);
  let dedupResult = $state<{ itemId: string; found: number } | null>(null);
  let nlInterestText = $state('');
  let nlInterestPending = $state(false);
  let nlInterestMessage = $state('');
  let reminderFormOpen = $state(false);
  let reminderPending = $state(false);
  let reminderError = $state('');
  let editingReminderId = $state<string | null>(null);
  let reminderTitle = $state('');
  let reminderCalendarType = $state<DateReminder['calendarType']>('lunar');
  let reminderCategory = $state<DateCategory>('birthday');
  let reminderDateExact = $state(false);
  let reminderDate = $state(todayInputValue());
  let reminderRepeat = $state<DateReminder['repeat']>('annual');
  let reminderDay0 = $state(true);
  let reminderDay1 = $state(true);
  let reminderDay3 = $state(false);
  let reminderDay7 = $state(true);
  let reminderDay30 = $state(false);
  let reminderPinned = $state(false);

  $effect(() => {
    const routeView = viewFromPath(page.url.pathname);
    if (activeView !== routeView) activeView = routeView;
  });

  onMount(() => {
    manualJobToken = window.localStorage.getItem('personal-radar-admin-token') ?? '';
    applyServerOrLocalNav(data.middleNav);
    if (data.user?.isAdmin) {
      loadDevRequests();
      loadAllowlist();
      loadFeatures();
    }

    const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
    const timer = setInterval(() => {
      if (!document.hidden) invalidateAll();
    }, REFRESH_INTERVAL_MS);

    const onVisible = () => {
      if (!document.hidden) {
        invalidateAll();
        if (data.user?.isAdmin) loadDevRequests();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  });

  $effect(() => {
    items = data.items;
    savedItems = data.savedItems;
    topics = data.topics;
    reminders = data.reminders;
    icaTool = data.icaTool;
    cronJobs = data.cronJobs;
    telegramLinked = data.telegramLinked;
    syncNavFromServer(data.middleNav);
  });

  $effect(() => {
    if (activeView === 'coe' && !featureAllowed('coe_page')) setView('home');
    if (activeView === 'gym' && !featureAllowed('gym_page')) setView('home');
  });

  const visibleNavOptions = $derived(
    ALL_NAV_OPTIONS.filter((option) => {
      if (option.id === 'coe') return featureAllowed('coe_page');
      if (option.id === 'gym') return featureAllowed('gym_page');
      return true;
    })
  );

  async function restoreStarterPack() {
    starterPending = true;
    starterMessage = '';
    try {
      const response = await fetch('/api/watchlist/starter', { method: 'POST' });
      const result = (await response.json().catch(() => ({}))) as {
        topics?: WatchTopic[];
        items?: RadarItem[];
        added?: number;
        error?: string;
      };
      if (!response.ok) {
        starterMessage = result.error || '恢复失败';
      } else {
        if (result.topics) topics = result.topics;
        if (result.items) items = result.items;
        starterMessage =
          (result.added ?? 0) > 0 ? `已加入 ${result.added} 个基础兴趣` : '基础兴趣已是最新';
        await invalidateAll();
      }
    } catch {
      starterMessage = '恢复失败';
    }
    starterPending = false;
  }

  const barNavItems = $derived([
    { id: 'home' as const, label: '首页' },
    ...middleNav
      .filter((id) => visibleNavOptions.some((o) => o.id === id))
      .map((id) => {
        const option = visibleNavOptions.find((item) => item.id === id);
        return { id, label: option?.label ?? id };
      }),
    { id: 'more' as const, label: '更多' }
  ]);
  const moreMenuItems = $derived.by(() => {
    const fixedIds = new Set(MORE_MENU_ITEMS.map((item) => item.id));
    const base = MORE_MENU_ITEMS.filter((item) => {
      if (item.id === 'coe') return featureAllowed('coe_page');
      return true;
    });
    const extras = visibleNavOptions
      .filter((option) => !middleNav.includes(option.id) && !fixedIds.has(option.id))
      .map((option) => ({
        id: option.id as View,
        label: option.label,
        hint: '未固定在导航栏'
      }));
    return [...base, ...extras];
  });
  const navigationView = $derived.by(() => {
    if (activeView === 'home') return 'home';
    if (middleNav.includes(activeView as NavSlotId)) return activeView;
    return 'more';
  });
  const navActiveIndex = $derived(
    Math.max(
      0,
      barNavItems.findIndex((item) => item.id === navigationView)
    )
  );
  const hideSidePanel = $derived(
    activeView === 'dates' ||
      activeView === 'gym' ||
      activeView === 'coe' ||
      activeView === 'interests' ||
      activeView === 'me' ||
      activeView === 'settings' ||
      activeView === 'saved'
  );

  const filters = [
    { id: 'for-you', label: '推荐' },
    { id: 'career', label: '职业' },
    { id: 'business', label: '商业' },
    { id: 'life', label: '生活' },
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
        const hidden = item.status === 'dismissed' || item.status === 'viewed' || Boolean(item.viewedAt);
        const searching = searchQuery.trim().length > 0;
        if (activeView === 'concerts') return item.kind === 'concert' && (searching || !hidden);
        if (activeView === 'trends') return item.kind !== 'concert' && (searching || !hidden);
        if (activeView === 'dates') return false;
        if (activeView === 'gym') return false;
        if (activeView === 'coe') return false;
        if (activeView === 'interests') return false;
        if (activeView === 'me' || activeView === 'settings' || activeView === 'saved') return false;
        if (activeFilter === 'for-you') return searching || !hidden;
        return item.topics.some((topic) => topic.toLowerCase().includes(activeFilter));
      })
      .filter((item) => matchesSearch(item, searchQuery))
      .sort(sortRadarItemsForDisplay)
  );

  const topItem = $derived(visibleItems[0]);
  const secondaryItems = $derived(visibleItems.slice(1, 3));
  const trendItems = $derived(
    items
      .filter((item) => item.kind !== 'concert' && item.status !== 'dismissed' && item.status !== 'viewed' && !item.viewedAt)
      .sort(sortRadarItemsForDisplay)
  );
  const timelineItems = $derived(
    items
      .filter((item) => item.kind === 'concert' && item.startsAt && item.status !== 'dismissed' && item.status !== 'viewed' && !item.viewedAt)
      .slice(0, 4)
  );
  const savedViewItems = $derived(
    savedItems
      .filter(isSavedItem)
      .filter((item) => matchesSearch(item, searchQuery))
  );
  const savedItemCount = $derived(savedItems.filter(isSavedItem).length);
  const watchTopics = $derived(topics.filter((topic) => topic.type === 'artist' && topic.mode !== 'blacklist'));
  const interestTopics = $derived(topics.filter((topic) => topic.type !== 'artist' && topic.mode !== 'blacklist'));
  const blacklistTopics = $derived(topics.filter((topic) => topic.mode === 'blacklist'));
  const filteredPreferenceTopics = $derived(filterPreferenceTopics(topics, preferenceQuery, preferenceView));
  const preferenceMatchCount = $derived(countPreferenceTopics(topics, preferenceQuery, preferenceView));
  const followedTopicCount = $derived(topics.filter((topic) => topic.mode !== 'blacklist').length);
  const needsOnboarding = $derived(
    Boolean(data.user) && (!telegramLinked || reminders.length === 0 || followedTopicCount === 0)
  );
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
      const now = new Date().toISOString();
      const sourceItem = items.find((item) => item.id === itemId) ?? savedItems.find((item) => item.id === itemId);
      const updateItemStatus = (item: RadarItem): RadarItem => {
        if (item.id !== itemId) return item;
        if (action === 'save') return { ...item, status: 'saved', savedAt: now, trackingAt: undefined };
        if (action === 'track') return { ...item, status: 'tracking', savedAt: item.savedAt ?? now, trackingAt: now };
        if (action === 'unsave') {
          return { ...item, status: item.viewedAt ? 'viewed' : 'new', savedAt: undefined, trackingAt: undefined };
        }
        if (action === 'not_relevant' || action === 'less_like_this') {
          return { ...item, status: 'dismissed', savedAt: undefined, trackingAt: undefined };
        }
        if (action === 'viewed') {
          const status = isSavedItem(item) ? item.status : 'viewed';
          return { ...item, status, viewedAt: now };
        }
        return item;
      };
      items = items.map(updateItemStatus);
      savedItems = savedItems.map(updateItemStatus);
      if ((action === 'save' || action === 'track') && sourceItem && !savedItems.some((item) => item.id === itemId)) {
        savedItems = [updateItemStatus(sourceItem), ...savedItems];
      }
    }
    feedbackPending = null;
  }

  async function markDuplicate(itemId: string) {
    dedupPending = itemId;
    dedupResult = null;
    try {
      const response = await fetch('/api/dedup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId })
      });
      const result = await response.json() as {
        found: number;
        matches?: Array<{ id: string }>;
        keeperId?: string;
        dismissedIds?: string[];
        mergedSources?: Array<{ source: string; url: string }>;
      };
      if (response.ok && result.found > 0 && result.matches && result.keeperId) {
        const dismissedIds = new Set(result.dismissedIds ?? []);
        const updateDedupedItem = (item: RadarItem): RadarItem => {
          if (dismissedIds.has(item.id)) {
            return { ...item, status: 'dismissed', savedAt: undefined, trackingAt: undefined };
          }
          if (item.id === result.keeperId) return { ...item, relatedSources: result.mergedSources };
          return item;
        };
        items = items.map(updateDedupedItem);
        savedItems = savedItems.map(updateDedupedItem);
      }
      dedupResult = { itemId, found: result.found };
    } catch {
      dedupResult = { itemId, found: 0 };
    }
    dedupPending = null;
  }

  async function submitNlInterest() {
    const text = nlInterestText.trim();
    nlInterestText = '';
    nlInterestMessage = '已记录，本地 AI 会在下次扫描时使用这个描述。';

    fetch('/api/interests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text })
    }).then((response) => {
      if (!response.ok) nlInterestMessage = '提交失败，请重试。';
    }).catch(() => {
      nlInterestMessage = '提交失败，请重试。';
    });
  }

  async function loadDevRequests() {
    if (!data.user?.isAdmin) return;
    try {
      const response = await fetch('/api/dev-requests');
      if (response.ok) {
        const result = (await response.json()) as { requests: typeof devRequests };
        devRequests = result.requests;
      }
    } catch {
      // ignore
    }
  }

  async function loadFeatures() {
    if (!data.user?.isAdmin) return;
    try {
      const response = await fetch('/api/admin/features');
      if (response.ok) {
        const result = (await response.json()) as { features: typeof featureRows };
        featureRows = result.features;
      }
    } catch {
      // ignore
    }
  }

  async function patchFeature(id: FeatureId, patch: { enabled?: boolean; minRole?: 'member' | 'admin' }) {
    featurePendingId = id;
    featureMessage = '';
    const current = featureRows.find((f) => f.id === id);
    try {
      const response = await fetch('/api/admin/features', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id,
          enabled: patch.enabled ?? current?.enabled ?? true,
          minRole: patch.minRole ?? current?.minRole ?? 'member'
        })
      });
      const result = (await response.json().catch(() => ({}))) as {
        features?: typeof featureRows;
        error?: string;
      };
      if (response.ok && result.features) {
        featureRows = result.features;
        featureMessage = '已保存';
        await invalidateAll();
      } else {
        featureMessage = result.error || '保存失败';
      }
    } catch {
      featureMessage = '保存失败';
    }
    featurePendingId = null;
  }

  async function loadAllowlist() {
    if (!data.user?.isAdmin) return;
    try {
      const response = await fetch('/api/admin/allowlist');
      if (response.ok) {
        const result = (await response.json()) as { emails: string[] };
        allowlistEmails = result.emails;
      }
    } catch {
      // ignore
    }
  }

  async function addAllowlistEmail() {
    const email = allowlistNewEmail.trim().toLowerCase();
    if (!email.includes('@')) {
      allowlistMessage = '请输入有效邮箱';
      return;
    }
    allowlistPending = true;
    allowlistMessage = '';
    try {
      const response = await fetch('/api/admin/allowlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const result = (await response.json().catch(() => ({}))) as { emails?: string[]; error?: string };
      if (response.ok) {
        allowlistEmails = result.emails ?? [];
        allowlistNewEmail = '';
        allowlistMessage =
          '已添加。对方首次登录会获得基础兴趣包，日期为空，需自行连接 Telegram。';
      } else {
        allowlistMessage = result.error || '添加失败';
      }
    } catch {
      allowlistMessage = '添加失败';
    }
    allowlistPending = false;
  }

  async function removeAllowlistEmail(email: string) {
    allowlistPending = true;
    allowlistMessage = '';
    try {
      const response = await fetch('/api/admin/allowlist', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const result = (await response.json().catch(() => ({}))) as { emails?: string[]; error?: string };
      if (response.ok) {
        allowlistEmails = result.emails ?? [];
        allowlistMessage = '已移除';
      } else {
        allowlistMessage = result.error || '移除失败';
      }
    } catch {
      allowlistMessage = '移除失败';
    }
    allowlistPending = false;
  }

  async function submitDevRequest() {
    devRequestPending = true;
    devRequestMessage = '';
    try {
      const response = await fetch('/api/dev-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: devRequestText.trim(), token: manualJobToken })
      });
      if (response.ok) {
        devRequestText = '';
        devRequestMessage = '已提交，本地 AI Agent 会自动处理。';
        await loadDevRequests();
      } else {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        devRequestMessage = result.error || '提交失败，请重试。';
      }
    } catch {
      devRequestMessage = '提交失败，请重试。';
    }
    devRequestPending = false;
  }

  async function sendTelegramSummary() {
    digestSendPending = true;
    digestSendMessage = '';
    if (!telegramLinked) {
      digestSendMessage = '请先在「我的」里连接 Telegram。';
      digestSendPending = false;
      return;
    }
    const response = await fetch('/api/digest', { method: 'POST' });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    digestSendMessage = response.ok ? '已发送到你的 Telegram。' : result.error || '发送失败，请稍后再试。';
    digestSendPending = false;
  }

  async function startTelegramLink() {
    telegramLinkPending = true;
    telegramLinkMessage = '';
    telegramDeepLink = '';
    try {
      const response = await fetch('/api/telegram/link', { method: 'POST' });
      const result = (await response.json().catch(() => ({}))) as {
        deepLink?: string;
        error?: string;
      };
      if (!response.ok || !result.deepLink) {
        telegramLinkMessage = result.error || '无法生成连接链接';
      } else {
        telegramDeepLink = result.deepLink;
        telegramLinkMessage = '在 Telegram 打开链接并点 Start 完成绑定（15 分钟内有效）。绑定后请刷新本页。';
        window.open(result.deepLink, '_blank', 'noopener');
      }
    } catch {
      telegramLinkMessage = '无法生成连接链接';
    }
    telegramLinkPending = false;
  }

  async function disconnectTelegram() {
    telegramLinkPending = true;
    telegramLinkMessage = '';
    try {
      const response = await fetch('/api/telegram/link', { method: 'DELETE' });
      if (response.ok) {
        telegramLinked = false;
        telegramDeepLink = '';
        telegramLinkMessage = '已断开 Telegram';
        await invalidateAll();
      } else {
        telegramLinkMessage = '断开失败';
      }
    } catch {
      telegramLinkMessage = '断开失败';
    }
    telegramLinkPending = false;
  }

  async function runManualFetchJob() {
    manualJobPending = true;
    manualJobStatus = 'running';
    manualJobMessage = '正在抓取演出和趋势数据...';
    const startedAt = new Date();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const token = manualJobToken.trim();
    if (token) {
      headers['x-admin-token'] = token;
      window.localStorage.setItem('personal-radar-admin-token', token);
    }

    try {
      const response = await fetch('/api/admin/jobs', {
        method: 'POST',
        headers,
        body: JSON.stringify({ job: 'all-fetch' })
      });
      const result = (await response.json().catch(() => ({}))) as Partial<JobResult> & { error?: string };
      if (!response.ok) {
        manualJobStatus = 'error';
        manualJobMessage =
          response.status === 401
            ? '未授权：请填写 .env.local / Cloudflare Secret 里的 ADMIN_TOKEN。'
            : result.error || '刷新失败，请稍后再试。';
        return;
      }

      await invalidateAll();
      manualJobStatus = 'success';
      manualJobLastRun = formatJobTime(startedAt);
      manualJobMessage = `完成：新增 ${result.inserted ?? 0} 条，更新 ${result.updated ?? 0} 条，检查 ${result.considered ?? 0} 条。`;
    } catch {
      manualJobStatus = 'error';
      manualJobMessage = '刷新失败：网络或服务暂时不可用。';
    } finally {
      manualJobPending = false;
    }
  }

  async function triggerIcaCheck() {
    icaJobPending = true;
    icaJobStatus = 'running';
    icaJobMessage = '正在启动 ICA 预约检查...';
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const token = manualJobToken.trim();
    if (token) {
      headers['x-admin-token'] = token;
      window.localStorage.setItem('personal-radar-admin-token', token);
    }

    try {
      const response = await fetch('/api/tools/ica', { method: 'POST', headers });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        result?: Partial<JobResult>;
        status?: IcaToolStatus;
      };
      if (!response.ok) {
        icaJobStatus = 'error';
        icaJobMessage =
          response.status === 401
            ? '未授权：请填写 ADMIN_TOKEN。'
            : result.error || 'ICA 检查失败，请稍后再试。';
        return;
      }

      if (result.status) icaTool = result.status;
      icaJobStatus = 'success';
      icaJobMessage = result.result?.detail || result.status?.lastJob?.detail || 'ICA 检查已完成。';
      await invalidateAll();
    } catch {
      icaJobStatus = 'error';
      icaJobMessage = 'ICA 检查失败：网络或服务暂时不可用。';
    } finally {
      icaJobPending = false;
    }
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

  /** Short stable id for display / feedback; full UUID in title attribute. */
  function itemIdLabel(id: string) {
    return id.length > 8 ? id.slice(0, 8) : id;
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
    moreMenuOpen = false;
  }

  function toggleMoreMenu() {
    moreMenuOpen = !moreMenuOpen;
  }

  async function selectMoreItem(view: View) {
    moreMenuOpen = false;
    await setView(view);
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

  async function setView(view: View) {
    closeTransientUi();
    activeView = view;
    activeFilter = 'for-you';
    await syncViewPath(view);
  }

  async function onBarNavClick(id: string) {
    if (id === 'more') {
      toggleMoreMenu();
      return;
    }
    moreMenuOpen = false;
    await setView(id as View);
  }

  async function selectFilter(filterId: string) {
    if (filterId === 'saved') {
      await setView('saved');
      return;
    }
    activeFilter = filterId;
  }

  async function syncViewPath(view: View) {
    const nextPath = viewPaths[view];
    if (page.url.pathname !== nextPath) {
      await goto(nextPath, { keepFocus: true, noScroll: true, invalidateAll: false });
    }
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
    const targetView = type === 'artist' ? 'concerts' : 'trends';
    activeView = targetView;
    void syncViewPath(targetView);
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

    const optimizeStatus: WatchTopic['optimizeStatus'] = newWatchOptimize ? 'pending' : 'locked';
    const optimisticTopic: WatchTopic = {
      id: `${newWatchType}-${name.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-')}`,
      type: newWatchType,
      name,
      aliases: [],
      category: newWatchCategory,
      priority: newWatchPriority,
      mode: newWatchMode,
      enabled: true,
      optimizeStatus
    };
    topics = [optimisticTopic, ...topics.filter((t) => t.id !== optimisticTopic.id)];
    newWatchName = '';
    addWatchOpen = false;

    fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        type: newWatchType,
        category: newWatchCategory,
        priority: newWatchPriority,
        mode: newWatchMode,
        optimizeStatus
      })
    }).then(async (response) => {
      if (response.ok) {
        const result = (await response.json()) as { topic: WatchTopic; topics?: WatchTopic[]; items?: RadarItem[] };
        topics = result.topics ?? topics.map((t) => (t.id === optimisticTopic.id ? result.topic : t));
        if (result.items) items = result.items;
      }
    });
  }

  function startEditTopic(topic: WatchTopic) {
    editingTopicId = topic.id;
    editWatchName = topic.name;
    editWatchType = topic.type;
    editWatchCategory = topic.category;
    editWatchPriority = topic.priority;
    editWatchMode = topic.mode;
    editWatchOptimize = (topic.optimizeStatus ?? 'optimized') === 'pending';
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

    const editId = editingTopicId;
    const previous = topics.find((t) => t.id === editId);
    const prevStatus = previous?.optimizeStatus ?? 'optimized';
    // Checked = open it back up for the agent; unchecked keeps whatever
    // non-pending state it had (already-optimized stays optimized, else locked).
    const optimizeStatus: WatchTopic['optimizeStatus'] = editWatchOptimize
      ? 'pending'
      : prevStatus === 'pending'
        ? 'locked'
        : prevStatus;
    const optimisticTopic: WatchTopic = {
      id: editId,
      type: editWatchType,
      name,
      aliases: previous?.aliases ?? [],
      category: editWatchCategory,
      priority: editWatchPriority,
      mode: editWatchMode,
      enabled: true,
      optimizeStatus
    };
    topics = topics.map((t) => (t.id === editId ? optimisticTopic : t));
    editingTopicId = null;

    fetch('/api/watchlist', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: editId,
        name,
        type: editWatchType,
        category: editWatchCategory,
        priority: editWatchPriority,
        mode: editWatchMode,
        enabled: true,
        optimizeStatus
      })
    }).then(async (response) => {
      if (response.ok) {
        const result = (await response.json()) as { topic: WatchTopic; topics?: WatchTopic[]; items?: RadarItem[] };
        topics = result.topics ?? topics.map((t) => (t.id === editId ? result.topic : t));
        if (result.items) items = result.items;
      }
    });
  }

  async function updateTopicMode(topic: WatchTopic, mode: WatchTopic['mode']) {
    topics = topics.map((t) => (t.id === topic.id ? { ...t, mode } : t));

    fetch('/api/watchlist', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...topic, mode })
    }).then(async (response) => {
      if (response.ok) {
        const result = (await response.json()) as { topic: WatchTopic };
        topics = topics.map((t) => (t.id === topic.id ? result.topic : t));
      }
    });
  }

  async function removeTopic(topic: WatchTopic) {
    topics = topics.filter((t) => t.id !== topic.id);
    if (editingTopicId === topic.id) editingTopicId = null;

    fetch('/api/watchlist', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: topic.id })
    }).then(async (response) => {
      if (response.ok) {
        const result = (await response.json().catch(() => ({}))) as { topics?: WatchTopic[]; items?: RadarItem[] };
        if (result.topics) topics = result.topics;
        if (result.items) items = result.items;
      }
    });
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
      reminderCategory = reminder.category;
      reminderDateExact = reminder.year != null;
      reminderDate = reminder.nextDate;
      reminderRepeat = reminder.repeat;
      reminderDay0 = reminder.remindDaysBefore.includes(0);
      reminderDay1 = reminder.remindDaysBefore.includes(1);
      reminderDay3 = reminder.remindDaysBefore.includes(3);
      reminderDay7 = reminder.remindDaysBefore.includes(7);
      reminderDay30 = reminder.remindDaysBefore.includes(30);
      reminderPinned = reminder.pinned;
      return;
    }
    editingReminderId = null;
    reminderTitle = '';
    reminderCalendarType = 'lunar';
    reminderCategory = 'birthday';
    reminderDateExact = false;
    reminderDate = todayInputValue();
    reminderRepeat = 'annual';
    applyDefaultRemindDays('birthday');
    reminderPinned = false;
  }

  function applyDefaultRemindDays(category: DateCategory) {
    reminderDay0 = true; reminderDay1 = false; reminderDay3 = false; reminderDay7 = true; reminderDay30 = false;
    reminderDateExact = category === 'child_birthday' || category === 'anniversary';
  }

  function onCategoryChange(category: DateCategory) {
    reminderCategory = category;
    if (!editingReminderId) applyDefaultRemindDays(category);
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
      category: reminderCategory,
      year: reminderDateExact ? dateParts.year : undefined,
      month: dateParts.month,
      day: dateParts.day,
      lunarIsLeapMonth: dateParts.lunarIsLeapMonth,
      repeat: reminderRepeat,
      pinned: reminderPinned,
      note: '',
      remindDaysBefore: selectedReminderDays(),
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

  function isSavedItem(item: RadarItem) {
    return Boolean(item.savedAt || item.trackingAt || item.status === 'saved' || item.status === 'tracking');
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

  function selectedReminderDays() {
    const days: number[] = [];
    if (reminderDay0) days.push(0);
    if (reminderDay1) days.push(1);
    if (reminderDay3) days.push(3);
    if (reminderDay7) days.push(7);
    if (reminderDay30) days.push(30);
    return days;
  }

  function formatJobTime(value: Date) {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(value);
  }

  function formatStatusTime(value: string | undefined) {
    if (!value) return '暂无记录';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return formatJobTime(date);
  }

  function icaStatusLabel(status: string | undefined) {
    const labels: Record<string, string> = {
      ok: '暂无更早日期',
      found_earlier: '发现更早日期',
      blocked: '被验证拦截',
      fallback_triggered: '已触发备用检查',
      not_configured: '配置未完成',
      error: '检查失败'
    };
    return labels[status ?? ''] ?? '尚未运行';
  }

  function jobStatusLabel(status: string | undefined) {
    const labels: Record<string, string> = {
      ok: '正常',
      skipped: '跳过',
      found_earlier: '发现更早日期',
      blocked: '被验证拦截',
      not_configured: '配置未完成',
      error: '失败'
    };
    return labels[status ?? ''] ?? '尚未运行';
  }

  function jobStatusClass(job: CronJobStatus) {
    if (!job.enabled) return 'disabled';
    if (!job.lastRun) return 'idle';
    if (job.lastRun.status === 'ok' || job.lastRun.status === 'found_earlier') return 'success';
    if (job.lastRun.status === 'skipped') return 'skipped';
    return 'error';
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
    const activeItems = sourceItems.filter((item) => item.status !== 'dismissed' && item.status !== 'viewed').slice(0, 6);
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
    if (category === 'life') return '跟踪本地生活、政策变化、消费和日常实用信号';
    return '在每日趋势流中跟踪这个主题';
  }

  function getAddWatchPlaceholder(type: WatchTopic['type'], category: string, mode: WatchTopic['mode']) {
    if (mode === 'blacklist') return '例如：要隐藏的艺人或活动关键词';
    if (type === 'artist') return '例如：One Spark、TWICE、Coldplay、陈奕迅';
    if (type === 'source') return '例如：JYPETWICE 官方 X、CNA、Music Matters';
    if (category === 'business') return '例如：Dreame、追觅、消费硬件风险';
    if (category === 'career') return '例如：新加坡 AI 产品岗位';
    if (category === 'life') return '例如：新加坡 HDB 政策、COE 价格、本地餐饮变化';
    return '例如：中美 AI 政策、东南亚融资';
  }

  function preferenceMeta(topic: WatchTopic) {
    const type = topic.type === 'artist' ? '音乐人' : topic.type === 'source' ? '来源' : '主题';
    const mode = topic.mode === 'blacklist' ? '已屏蔽' : '已关注';
    const categories: Record<string, string> = {
      business: '商业',
      career: '职业',
      life: '生活',
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
        eyebrow: '趋势雷达 · 职业、商业、生活、地缘政治',
        title: `${count} 条趋势信号待查看。`,
        body: '职业、市场、生活、地缘政治和商业机会会集中在这里，避免被演出关注淹没。'
      };
    }
    if (view === 'me') {
      return {
        eyebrow: '我的资料 · 偏好',
        title: '调校你的个人雷达。',
        body: '反馈会保存到记录里，并立即更新当前卡片状态；后续可以接入排序学习。'
      };
    }
    if (view === 'dates') {
      return {
        eyebrow: '日期簿 · 生日 · 纪念日 · 里程碑',
        title: '生日、纪念日和里程碑。',
        body: '支持宝宝成长追踪（满月、百天、疫苗提醒）、婚恋纪念（520天、千日、银婚）等自动里程碑。选择日期时包含年份可启用天数计算和里程碑追踪。'
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
      return { year: new Date().getFullYear(), month: 1, day: 1, lunarIsLeapMonth: false };
    }
    if (calendarType === 'gregorian') return { year, month, day, lunarIsLeapMonth: false };
    const lunar = Solar.fromYmd(year, month, day).getLunar();
    return {
      year,
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

  function viewFromPath(pathname: string): View {
    const normalized = pathname.replace(/\/+$/, '') || '/';
    if (normalized === '/') return 'home';
    const match = Object.entries(viewPaths).find(([, path]) => path === normalized);
    return match?.[0] as View | undefined ?? 'home';
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

{#snippet preferenceManager()}
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
          <strong>
            {topic.name}
            {#if (topic.optimizeStatus ?? 'optimized') === 'pending'}
              <span class="optimize-badge" title="等待本地 AI 代理优化成更精准的关键词">待 AI 优化</span>
            {/if}
          </strong>
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
{/snippet}

<main class="app-shell">
  <nav class="topbar">
    <button class="brand" type="button" aria-label="回到首页" onclick={() => setView('home')}>
      <img class="logo" src="/brand/personal-radar-logo.svg" alt="" />
      <div>
        <strong>个人雷达</strong>
        <span>凡人咖啡馆</span>
      </div>
    </button>
    <div
      class="primary-nav desktop-nav"
      data-active={navigationView}
      style={`--nav-count: ${barNavItems.length}; --nav-index: ${navActiveIndex};`}
      aria-label="主导航"
    >
      <span class="nav-indicator" aria-hidden="true"></span>
      {#each barNavItems as item}
        <button
          class:active={navigationView === item.id}
          type="button"
          onclick={() => onBarNavClick(item.id)}
        >
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

  <div class:no-side-panel={hideSidePanel} class="app-main">
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
                  disabled={digestSendPending || !telegramLinked}
                  onclick={sendTelegramSummary}
                >
                  {digestSendPending ? '发送中...' : telegramLinked ? '发送到 Telegram' : '请先连接 Telegram'}
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
                  <option value="life">生活</option>
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
                <label class="check-row optimize-check" title="允许本地 AI 代理把这条兴趣整理成更精准的关键词（可拆分成多条）">
                  <input type="checkbox" bind:checked={newWatchOptimize} />
                  AI 优化
                </label>
                <button class="small-button primary" disabled={addWatchPending} onclick={addWatchTopic}>
                  {addWatchPending ? '添加中...' : '添加'}
                </button>
              </div>
              {#if addWatchError}<p class="form-error">{addWatchError}</p>{/if}
              <div class="nl-interest">
                <label for="nl-interest-input">或者直接用自然语言描述（AI 会理解细节和例外）</label>
                <textarea
                  id="nl-interest-input"
                  bind:value={nlInterestText}
                  rows="2"
                  placeholder="例如：我关注追觅 IPO、财务和公司架构新闻，但不关心具体产品发布。"
                ></textarea>
                <div class="nl-interest-actions">
                  <button class="small-button primary" disabled={nlInterestPending || nlInterestText.trim().length < 4} onclick={submitNlInterest}>
                    {nlInterestPending ? '提交中...' : '提交兴趣'}
                  </button>
                  {#if nlInterestMessage}<span class="nl-interest-note">{nlInterestMessage}</span>{/if}
                </div>
              </div>
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
                  <option value="life">生活</option>
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
                <label class="check-row optimize-check" title="允许本地 AI 代理把这条兴趣整理成更精准的关键词（可拆分成多条）">
                  <input type="checkbox" bind:checked={editWatchOptimize} />
                  AI 优化
                </label>
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
                  <strong>{editingReminderId ? '编辑日期提醒' : '添加日期提醒'}</strong>
                  <span>设置类型可自动追踪里程碑（满月、百天、千日纪念等）</span>
                </div>
                <button class="close-button" type="button" aria-label="关闭日期提醒" onclick={() => (reminderFormOpen = false)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18"></path>
                  </svg>
                </button>
              </div>
              <div class="watch-form reminder-form">
                <input bind:value={reminderTitle} placeholder="例如：老妈生日、结婚纪念日" />
                <select value={reminderCategory} onchange={(e) => onCategoryChange(e.currentTarget.value as DateCategory)} aria-label="日期类型">
                  <option value="birthday">生日</option>
                  <option value="child_birthday">宝宝生日</option>
                  <option value="anniversary">恋爱/婚姻</option>
                  <option value="memorial">逝世纪念</option>
                  <option value="other">其他</option>
                </select>
                <select bind:value={reminderCalendarType} aria-label="历法">
                  <option value="lunar">农历</option>
                  <option value="gregorian">公历</option>
                </select>
                <input use:datepicker bind:value={reminderDate} placeholder="选择日期" />
                <div class="reminder-checks">
                  <label class="check-row">
                    <input type="checkbox" bind:checked={reminderDateExact} />
                    日期准确
                  </label>
                  <label class="check-row">
                    <input type="checkbox" bind:checked={reminderPinned} />
                    置顶
                  </label>
                </div>
                {#if !reminderDateExact}
                  <span class="date-hint">年份未知时只提醒周期，不计算天数和里程碑</span>
                {/if}
                <span class="date-preview">{selectedDateLabel(reminderDate, reminderCalendarType)}</span>
                <span class="date-preview">{dualDateLabel(reminderDate)}</span>
                <div class="reminder-checks remind-days-row">
                  <span>提前提醒</span>
                  <label class="check-row"><input type="checkbox" bind:checked={reminderDay0} /> 当天</label>
                  <label class="check-row"><input type="checkbox" bind:checked={reminderDay1} /> 1天</label>
                  <label class="check-row"><input type="checkbox" bind:checked={reminderDay3} /> 3天</label>
                  <label class="check-row"><input type="checkbox" bind:checked={reminderDay7} /> 7天</label>
                  <label class="check-row"><input type="checkbox" bind:checked={reminderDay30} /> 30天</label>
                </div>
                <button class="small-button primary" disabled={reminderPending} onclick={saveReminder}>
                  {reminderPending ? '保存中...' : '保存提醒'}
                </button>
              </div>
              {#if reminderError}<p class="form-error">{reminderError}</p>{/if}
            </div>
          {/if}
        </section>
      {/if}

      {#if activeView === 'coe'}
        <CoePriceView data={coeData} loading={coeLoading} error={coeError} onRefresh={() => loadCoe(true)} />
      {:else if activeView === 'interests'}
        <section class="interests-workspace">
          <div class="interests-head">
            <div>
              <div class="eyebrow">偏好</div>
              <h1>兴趣与关注</h1>
              <p>管理音乐人、趋势主题、来源和屏蔽规则。新账号会带一份基础兴趣包，可随时增删。</p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button
                class="small-button"
                type="button"
                disabled={starterPending}
                onclick={restoreStarterPack}
              >
                {starterPending ? '…' : '恢复基础兴趣'}
              </button>
              <button class="small-button primary" type="button" onclick={() => openAddWatch('topic', 'business')}>
                添加关注
              </button>
            </div>
          </div>
          {#if starterMessage}
            <p class="quiet-copy">{starterMessage}</p>
          {/if}
          {#if followedTopicCount === 0}
            <section class="empty-state" style="margin-bottom:1rem">
              <h3>还没有关注</h3>
              <p>可以一键恢复基础兴趣包（新加坡生活、AI 岗位、热门演出等），或手动添加你关心的主题。</p>
              <button class="small-button primary" type="button" disabled={starterPending} onclick={restoreStarterPack}>
                {starterPending ? '…' : '恢复基础兴趣包'}
              </button>
            </section>
          {/if}
          <div class="settings-grid compact">
            <button class:active={preferenceView === 'artist'} type="button" onclick={() => (preferenceView = 'artist')}>
              <strong>{watchTopics.length}</strong>
              <span>音乐人</span>
            </button>
            <button class:active={preferenceView === 'topic'} type="button" onclick={() => (preferenceView = 'topic')}>
              <strong>{interestTopics.length}</strong>
              <span>兴趣主题</span>
            </button>
            <button class:active={preferenceView === 'blacklist'} type="button" onclick={() => (preferenceView = 'blacklist')}>
              <strong>{blacklistTopics.length}</strong>
              <span>屏蔽规则</span>
            </button>
          </div>
          <div class="me-preference-manager">
            {@render preferenceManager()}
          </div>
        </section>
      {:else if activeView === 'settings'}
        <section class="settings-workspace">
          <div class="interests-head">
            <div>
              <div class="eyebrow">设置</div>
              <h1>导航与配置</h1>
              <p>首页和「更多」固定；中间 3 个菜单可自选并调整顺序。</p>
            </div>
          </div>

          <section class="notebook-card">
            <div class="notebook-head">
              <div>
                <h2>底部导航中间项</h2>
                <span>选择 1–3 个入口，顺序即显示顺序。未选中的功能仍可从「更多」进入。</span>
              </div>
            </div>
            <div class="nav-config-list">
              {#each visibleNavOptions as option}
                {@const selectedIndex = draftMiddleNav.indexOf(option.id)}
                {@const selected = selectedIndex >= 0}
                <div class:selected class="nav-config-row">
                  <label class="nav-config-main">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={!selected && draftMiddleNav.length >= 3}
                      onchange={() => toggleDraftNavItem(option.id)}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{selected ? `第 ${selectedIndex + 1} 位` : '未显示在导航栏'}</small>
                    </span>
                  </label>
                  {#if selected}
                    <div class="nav-config-actions">
                      <button type="button" disabled={selectedIndex === 0} onclick={() => moveDraftNav(selectedIndex, -1)}>
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={selectedIndex === draftMiddleNav.length - 1}
                        onclick={() => moveDraftNav(selectedIndex, 1)}
                      >
                        ↓
                      </button>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
            <div class="nav-config-footer">
              <button class="small-button" type="button" onclick={() => (draftMiddleNav = [...DEFAULT_MIDDLE_NAV])}>
                恢复默认
              </button>
              <button
                class="small-button primary"
                type="button"
                disabled={draftMiddleNav.length === 0}
                onclick={() => saveMiddleNav(draftMiddleNav)}
              >
                保存导航
              </button>
            </div>
            <p class="quiet-copy">当前导航：首页 · {middleNav.map((id) => ALL_NAV_OPTIONS.find((o) => o.id === id)?.label ?? id).join(' · ')} · 更多</p>
          </section>

          <section class="notebook-card">
            <div class="notebook-head">
              <div>
                <h2>快捷入口</h2>
                <span>常用页面</span>
              </div>
            </div>
            <div class="settings-grid compact">
              <button type="button" onclick={() => setView('me')}>
                <strong>我的</strong>
                <span>资料与工具</span>
              </button>
              <button type="button" onclick={() => setView('interests')}>
                <strong>兴趣</strong>
                <span>关注与屏蔽</span>
              </button>
              <button type="button" onclick={() => setView('coe')}>
                <strong>COE</strong>
                <span>官方报价</span>
              </button>
            </div>
          </section>
        </section>
      {:else if activeView === 'gym'}
        <section class="gym">
          <header class="gym-head">
            <h1>健身动作库</h1>
            <p>搜索 1,300+ 训练动作 · 动图、目标肌群与所需器械（数据来自 exercises-dataset）</p>
          </header>
          <div class="gym-search">
            <input
              type="search"
              placeholder="搜索动作 / 肌群 / 器械，如 curl、abs、dumbbell、深蹲…"
              bind:value={gymQuery}
              oninput={onGymSearch}
            />
          </div>
          <div class="gym-filters" role="group" aria-label="按部位筛选">
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
                  <img class="gym-gif" src={exercise.gifUrl} alt={exercise.name} loading="lazy" />
                  <div class="gym-card-body">
                    <strong>{exercise.name}</strong>
                    <div class="gym-tags">
                      <span class="gym-tag part">{exercise.bodyPart}</span>
                      <span class="gym-tag target">{exercise.target}</span>
                      <span class="gym-tag gear">{exercise.equipment}</span>
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
      {:else if activeView === 'dates'}
        <DateRemindersView
          {reminders}
          {nextReminder}
          {reminderPending}
          onAdd={() => openReminderForm()}
          onEdit={openReminderForm}
          onDelete={deleteReminder}
        />
      {:else if activeView === 'saved'}
        <section class="saved-workspace">
          <div class="saved-head">
            <div>
              <div class="eyebrow">我的收藏</div>
              <h1>已保存</h1>
              <p>稍后回来查看已保存和重点跟踪的内容。</p>
            </div>
            <button class="small-button" type="button" onclick={() => setView('me')}>返回我的</button>
          </div>
          <div class="section-title">
            <h2>全部收藏</h2>
            <span>{savedViewItems.length} 条</span>
          </div>
          {#if savedViewItems.length > 0}
            <section class="timeline">
              {#each savedViewItems as item}
                <article class="timeline-item">
                  <div class="date trend-date">
                    <span><small>{itemKindLabel(item)}</small>{item.score}</span>
                  </div>
                  <img class="timeline-image" src={imageForItem(item)} alt="" loading="lazy" />
                  <div>
                    <div class="story-kicker">
                      <span class="item-id" title={item.id}>id {itemIdLabel(item.id)}</span>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.summary}</p>
                    <div class="timeline-links">
                      {#if item.url}
                        <a class="source-link inline-source" href={item.url} target="_blank" rel="noreferrer">
                          来源 · {sourceLabel(item)}
                        </a>
                      {/if}
                      {#each (item.relatedSources ?? []).slice(0, 4) as related}
                        <a class="source-link inline-source related-source" href={related.url} target="_blank" rel="noreferrer">
                          {related.source}
                        </a>
                      {/each}
                    </div>
                    <div class="story-actions timeline-actions">
                      {#if item.status === 'saved'}
                        <button
                          class="small-button primary"
                          disabled={feedbackPending === `${item.id}:track`}
                          onclick={() => sendFeedback(item.id, 'track')}
                        >
                          重点跟踪
                        </button>
                      {/if}
                      <button
                        class="small-button"
                        disabled={feedbackPending === `${item.id}:unsave`}
                        onclick={() => sendFeedback(item.id, 'unsave')}
                      >
                        取消保存
                      </button>
                      <span class="chip hot">{item.status === 'tracking' ? '重点跟踪' : '已保存'}</span>
                      {#if item.viewedAt}<span class="chip">已读</span>{/if}
                    </div>
                  </div>
                </article>
              {/each}
            </section>
          {:else}
            <section class="empty-state">
              <h3>{savedItemCount > 0 ? '没有匹配的收藏' : '还没有保存内容'}</h3>
              <p>
                {savedItemCount > 0
                  ? '试试其他搜索关键词。'
                  : '在首页或趋势里点「保存」或「重点跟踪」。新账号的收藏是空的，与其他人互不影响。'}
              </p>
              {#if savedItemCount === 0}
                <button class="small-button primary" type="button" onclick={() => setView('home')}>去首页看看</button>
              {/if}
            </section>
          {/if}
        </section>
      {:else if activeView === 'me'}
        <section class="me-workspace">
          <div class="settings-grid">
            <article class="settings-card">
              <span>资料</span>
              <strong>{data.user?.name || '个人雷达'}</strong>
              <p>
                {data.user?.email ?? ''}
                {#if data.user?.isAdmin} · 管理员{/if}
                · {followedTopicCount} 个关注
              </p>
              <p style="margin-top:8px">
                <a href="/auth/logout" class="small-button">退出登录</a>
              </p>
            </article>
            <article class="settings-card">
              <span>下一条提醒</span>
              <strong>{nextReminder ? `${nextReminder.daysLeft} 天` : '暂无'}</strong>
              <p>{nextReminder ? `${nextReminder.title} · ${nextReminder.dateLabel}` : '添加生日或纪念日后会显示在这里。'}</p>
            </article>
            <button class="settings-card saved-entry" type="button" onclick={() => setView('saved')}>
              <span>收藏</span>
              <strong>{savedItemCount}</strong>
              <p>查看已保存和重点跟踪的内容 <b aria-hidden="true">→</b></p>
            </button>
          </div>

          {#if featureAllowed('telegram_digest')}
          <section class="job-run-card">
            <div class="job-run-copy">
              <span>通知</span>
              <strong>Telegram</strong>
              <p>
                {#if telegramLinked}
                  已连接 — 每日摘要会发到你的 Telegram。
                {:else if data.telegramBotConfigured}
                  连接后，摘要会发到你自己的聊天（不再共用一个群）。
                {:else}
                  管理员尚未配置 Telegram Bot（TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME）。
                {/if}
              </p>
            </div>
            <div class="job-run-controls" style="flex-wrap:wrap;gap:8px">
              {#if telegramLinked}
                <button
                  class="small-button"
                  type="button"
                  disabled={telegramLinkPending}
                  onclick={disconnectTelegram}
                >
                  {telegramLinkPending ? '…' : '断开连接'}
                </button>
                <button
                  class="small-button"
                  type="button"
                  disabled={telegramLinkPending}
                  onclick={async () => {
                    await invalidateAll();
                    telegramLinkMessage = telegramLinked ? '仍为已连接' : '尚未连接，请完成 Telegram Start';
                  }}
                >
                  刷新状态
                </button>
              {:else}
                <button
                  class="small-button primary"
                  type="button"
                  disabled={telegramLinkPending || !data.telegramBotConfigured}
                  onclick={startTelegramLink}
                >
                  {telegramLinkPending ? '…' : '连接 Telegram'}
                </button>
              {/if}
            </div>
            {#if telegramLinkMessage}
              <p style="font-size:12px;color:var(--muted);padding:0 14px 12px">{telegramLinkMessage}</p>
            {/if}
            {#if telegramDeepLink}
              <p style="font-size:12px;padding:0 14px 12px;word-break:break-all">
                <a href={telegramDeepLink} target="_blank" rel="noopener">打开绑定链接</a>
              </p>
            {/if}
          </section>
          {/if}

          {#if data.user?.isAdmin}
          <section class="job-run-card">
            <div class="job-run-copy">
              <span>配置</span>
              <strong>功能开关</strong>
              <p>开关控制页面是否展示，以及对应 cron 是否运行。权限决定普通用户或仅管理员可用。</p>
            </div>
            {#if featureMessage}
              <p style="font-size:12px;color:var(--muted);padding:0 14px">{featureMessage}</p>
            {/if}
            <div style="padding:8px 14px 14px;display:grid;gap:10px">
              {#each featureRows as feat}
                <div style="border:1px solid var(--line);border-radius:8px;padding:10px;display:grid;gap:8px">
                  <div>
                    <strong style="font-size:13px">{feat.label}</strong>
                    <p style="font-size:12px;color:var(--muted);margin:4px 0 0">{feat.description}</p>
                    <p style="font-size:11px;color:var(--muted);margin:4px 0 0"><code>{feat.id}</code></p>
                  </div>
                  <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
                    <label class="check-row" style="font-size:12px">
                      <input
                        type="checkbox"
                        checked={feat.enabled}
                        disabled={featurePendingId === feat.id}
                        onchange={(e) => patchFeature(feat.id, { enabled: e.currentTarget.checked })}
                      />
                      启用
                    </label>
                    <label style="font-size:12px;display:flex;gap:6px;align-items:center">
                      权限
                      <select
                        value={feat.minRole}
                        disabled={featurePendingId === feat.id}
                        onchange={(e) =>
                          patchFeature(feat.id, {
                            minRole: e.currentTarget.value as 'member' | 'admin'
                          })}
                      >
                        <option value="member">所有登录用户</option>
                        <option value="admin">仅管理员</option>
                      </select>
                    </label>
                  </div>
                </div>
              {:else}
                <p style="font-size:12px;color:var(--muted)">加载中或暂无配置…</p>
              {/each}
            </div>
          </section>
          {/if}

          {#if featureAllowed('admin_ops')}
          <section class="job-run-card">
            <div class="job-run-copy">
              <span>访问控制</span>
              <strong>允许登录的邮箱</strong>
              <p>
                添加朋友的 Google 邮箱后即可登录。对方会看到自己的基础兴趣包；日期、收藏、Telegram
                需自行设置，与你的数据互不影响。
              </p>
            </div>
            <div class="job-run-controls" style="flex-wrap:wrap;gap:8px">
              <input
                bind:value={allowlistNewEmail}
                type="email"
                placeholder="friend@gmail.com"
                style="flex:1;min-width:180px"
              />
              <button
                class="small-button primary"
                type="button"
                disabled={allowlistPending || !allowlistNewEmail.trim()}
                onclick={addAllowlistEmail}
              >
                {allowlistPending ? '…' : '添加'}
              </button>
            </div>
            {#if allowlistMessage}
              <p style="font-size:12px;color:var(--muted);padding:0 14px">{allowlistMessage}</p>
            {/if}
            <div style="padding:8px 14px 14px;display:grid;gap:6px">
              {#each allowlistEmails as email}
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;border:1px solid var(--line);border-radius:8px;padding:8px 10px">
                  <span>{email}</span>
                  <button
                    class="small-button"
                    type="button"
                    disabled={allowlistPending || email.toLowerCase() === data.user?.email?.toLowerCase()}
                    onclick={() => removeAllowlistEmail(email)}
                  >
                    移除
                  </button>
                </div>
              {:else}
                <p style="font-size:12px;color:var(--muted)">暂无记录</p>
              {/each}
            </div>
          </section>

          <section class="tools-panel">
            <div class="notebook-head">
              <div>
                <h2>工具</h2>
                <span>手动运行后台任务，查看预约检查状态。</span>
              </div>
            </div>

            <section class="cron-status-card">
              <div class="notebook-head compact-head">
                <div>
                  <h2>定时任务状态</h2>
                  <span>Cloudflare Cron 的启用状态和最近一次运行结果。</span>
                </div>
              </div>
              <div class="cron-job-list">
                {#each cronJobs as job}
                  <article class={`cron-job-row ${jobStatusClass(job)}`}>
                    <div class="cron-job-main">
                      <span class="cron-dot"></span>
                      <div>
                        <strong>{job.label}</strong>
                        <p>{job.description}</p>
                      </div>
                    </div>
                    <div class="cron-job-meta">
                      <span>{job.schedule}</span>
                      <strong>{job.enabled ? '已启用' : '已停用'}</strong>
                    </div>
                    <div class="cron-job-meta">
                      <span>上次运行</span>
                      <strong>{formatStatusTime(job.lastRun?.finishedAt ?? job.lastRun?.startedAt)}</strong>
                    </div>
                    <div class="cron-job-meta wide">
                      <span>{jobStatusLabel(job.lastRun?.status)}</span>
                      <strong>{job.lastRun?.detail ?? '暂无记录'}</strong>
                    </div>
                  </article>
                {/each}
              </div>
            </section>

            {#if featureAllowed('ica_check')}
            <section class:running={icaJobStatus === 'running'} class={`job-run-card ica-tool-card ${icaJobStatus}`}>
              <div class="job-run-copy">
                <span>ICA 预约检查</span>
                <strong>{icaTool.enabled ? icaStatusLabel(icaTool.lastJob?.status) : 'Cloudflare 定时已停用'}</strong>
                <p>
                  目标：寻找 {icaTool.targetBefore} 之前的可选日期。ICA 搜索接口会拒绝 Cloudflare Browser Run，定时检查已停止。
                </p>
              </div>
              <div class="job-run-controls">
                <label>
                  <span>ADMIN_TOKEN</span>
                  <input bind:value={manualJobToken} type="password" autocomplete="off" placeholder="保存在当前浏览器" />
                </label>
                <button
                  class="small-button primary"
                  type="button"
                  disabled={icaJobPending || !icaTool.enabled || !icaTool.checkerUrlConfigured}
                  onclick={triggerIcaCheck}
                >
                  {icaJobPending ? '检查中...' : icaTool.enabled ? '立即检查' : '已停用'}
                </button>
              </div>
              <div class="tool-status-grid">
                <div>
                  <span>定时检查</span>
                  <strong>{icaTool.enabled ? '已启用' : '已停用'}</strong>
                </div>
                <div>
                  <span>远程触发</span>
                  <strong>{icaTool.checkerUrlConfigured ? '已配置' : '未配置'}</strong>
                </div>
                <div>
                  <span>失败备用</span>
                  <strong>{icaTool.fallbackConfigured ? '自动' : '未配置'}</strong>
                </div>
                <div>
                  <span>上次运行</span>
                  <strong>{formatStatusTime(icaTool.lastJob?.finishedAt ?? icaTool.lastJob?.startedAt)}</strong>
                </div>
                <div>
                  <span>最近结果</span>
                  <strong>{icaTool.lastItem?.startsAt ?? icaTool.lastItem?.summary ?? '暂无'}</strong>
                </div>
              </div>
              <div class="job-run-status" aria-live="polite">
                <span></span>
                <p>
                  {icaJobMessage}
                  {#if icaTool.lastJob?.detail}
                    · {icaTool.lastJob.detail}
                  {/if}
                  {#if !icaTool.checkerUrlConfigured}
                    · 需要配置 CRON_WORKER 服务绑定或 ICA_CHECKER_URL 后才能从网页手动触发。
                  {/if}
                  {#if !icaTool.enabled}
                    · Cloudflare 定时任务已停用，后续改用 GCP / 持久浏览器方案。
                  {/if}
                </p>
              </div>
            </section>
            {/if}

            <section class:running={manualJobStatus === 'running'} class={`job-run-card ${manualJobStatus}`}>
              <div class="job-run-copy">
                <span>手动刷新</span>
                <strong>立即抓取最新数据</strong>
                <p>运行演出和趋势抓取任务，完成后会自动刷新当前页面数据。</p>
              </div>
              <div class="job-run-controls">
                <label>
                  <span>ADMIN_TOKEN</span>
                  <input bind:value={manualJobToken} type="password" autocomplete="off" placeholder="保存在当前浏览器" />
                </label>
                <button class="small-button primary" type="button" disabled={manualJobPending} onclick={runManualFetchJob}>
                  {manualJobPending ? '运行中...' : '立即刷新'}
                </button>
              </div>
              <div class="job-run-status" aria-live="polite">
                <span></span>
                <p>{manualJobMessage}{manualJobLastRun ? ` · ${manualJobLastRun}` : ''}</p>
              </div>
            </section>
          </section>
          {/if}

          {#if featureAllowed('dev_requests')}
          <section class="job-run-card">
            <div class="job-run-copy">
              <span>开发请求</span>
              <strong>功能/Bug 请求</strong>
              <p>提交后本地 AI Agent 会自动处理：评估、实现、部署，或回复评估结果。</p>
            </div>
            <div class="job-run-controls">
              <textarea bind:value={devRequestText} rows="3" placeholder="描述功能需求或 Bug..."></textarea>
              <button class="small-button primary" type="button"
                disabled={devRequestPending || devRequestText.trim().length < 4 || !manualJobToken}
                onclick={submitDevRequest}>
                {devRequestPending ? '提交中...' : '提交请求'}
              </button>
              {#if !manualJobToken}<span style="font-size:12px;color:var(--muted)">需要先填写上方 ADMIN_TOKEN</span>{/if}
              {#if devRequestMessage}<span style="font-size:12px;color:var(--jade)">{devRequestMessage}</span>{/if}
            </div>
            {#if devRequests.length > 0}
              <div style="padding:12px 14px 0;display:grid;gap:8px">
                {#each devRequests.slice(0, 5) as req}
                  <button type="button" style="all:unset;cursor:pointer;font-size:12px;border:1px solid var(--line);border-radius:8px;padding:8px;text-align:left;display:block;width:100%;box-sizing:border-box"
                    onclick={() => { expandedDevRequest = expandedDevRequest === req.id ? null : req.id }}>
                    <strong style="color:var(--ink)">{expandedDevRequest === req.id ? req.text : req.text.slice(0, 80)}{expandedDevRequest !== req.id && req.text.length > 80 ? '…' : ''}</strong>
                    <div style="margin-top:4px;color:var(--muted)">{req.status}{req.response ? ` · ${expandedDevRequest === req.id ? req.response : req.response.slice(0, 100)}${expandedDevRequest !== req.id && req.response.length > 100 ? '…' : ''}` : ''}</div>
                  </button>
                {/each}
              </div>
            {/if}
          </section>
          {/if}

          <section class="notebook-card">
            <div class="notebook-head">
              <div>
                <h2>偏好入口</h2>
                <span>兴趣列表已移至独立页面，也可在设置里配置导航。</span>
              </div>
              <div class="preference-add">
                <button type="button" onclick={() => setView('interests')}>兴趣</button>
                <button type="button" onclick={() => setView('settings')}>设置</button>
              </div>
            </div>
            <div class="settings-grid compact">
              <button type="button" onclick={() => setView('interests')}>
                <strong>{interestTopics.length}</strong>
                <span>兴趣主题</span>
              </button>
              <button type="button" onclick={() => setView('interests')}>
                <strong>{watchTopics.length}</strong>
                <span>音乐人</span>
              </button>
              {#if featureAllowed('coe_page')}
              <button type="button" onclick={() => setView('coe')}>
                <strong>COE</strong>
                <span>官方报价</span>
              </button>
              {/if}
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
        {#if featureAllowed('telegram_digest')}
        <aside class="daily-card">
          <strong>每日摘要已就绪</strong>
          <span>
            Telegram {telegramLinked ? '已连接' : data.telegramBotConfigured ? '未连接' : '未配置'} · 反馈会记录为后续排序优化数据。
          </span>
          <button
            class="small-button primary"
            type="button"
            disabled={digestSendPending || !telegramLinked}
            onclick={sendTelegramSummary}
          >
            {digestSendPending ? '发送中...' : telegramLinked ? '发送摘要到 Telegram' : '请先连接 Telegram'}
          </button>
          {#if digestSendMessage}<small>{digestSendMessage}</small>{/if}
        </aside>
        {/if}
      </div>

      {#if needsOnboarding && activeView === 'home'}
        <section class="job-run-card" style="margin-bottom:1rem">
          <div class="job-run-copy">
            <span>开始使用</span>
            <strong>完善你的个人雷达</strong>
            <p>每个账号的数据互相隔离。完成下面几步后，摘要和提醒会更有用。</p>
          </div>
          <div style="padding:0 14px 14px;display:grid;gap:8px;font-size:13px">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
              <span>{telegramLinked ? '✓' : '○'} 连接 Telegram 接收摘要</span>
              {#if !telegramLinked}
                <button class="small-button" type="button" onclick={() => setView('me')}>去连接</button>
              {/if}
            </div>
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
              <span>{followedTopicCount > 0 ? '✓' : '○'} 确认兴趣主题（{followedTopicCount} 个）</span>
              <button class="small-button" type="button" onclick={() => setView('interests')}>
                {followedTopicCount > 0 ? '管理' : '设置'}
              </button>
            </div>
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
              <span>{reminders.length > 0 ? '✓' : '○'} 添加生日或纪念日</span>
              {#if reminders.length === 0}
                <button class="small-button" type="button" onclick={() => setView('dates')}>去添加</button>
              {/if}
            </div>
          </div>
        </section>
      {/if}

      {#if activeView === 'home' && upcomingReminders.length > 0}
        <section class="reminder-strip" aria-label="临近日期">
          <div>
            <strong>临近日期与里程碑</strong>
            <span>进入日期 tab 管理生日、纪念日和里程碑</span>
          </div>
          <div class="reminder-strip-list">
            {#each upcomingReminders as reminder}
              <button type="button" onclick={() => setView('dates')}>
                <strong>{reminder.daysLeft}</strong>
                <span>{reminder.title}{reminder.ageLabel ? ` · ${reminder.ageLabel}` : ''}</span>
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
              onclick={() => selectFilter(filter.id)}
            >
              {filter.label}
            </button>
          {/each}
        </div>
      {/if}

      <div class="section-title">
        <h2>{activeView === 'trends' ? '趋势流' : activeView === 'concerts' ? '演出流' : '重点推荐'}</h2>
        <span>记录反馈状态</span>
      </div>

      {#if topItem}
        <div class="story-grid">
          <article class="story hero-story">
            <figure class="story-media">
              <img src={imageForItem(topItem)} alt="" loading="lazy" />
            </figure>
            <div class="story-body">
              <div class="story-kicker">
                <span>{itemKicker(topItem)}</span>
                <span class="item-id" title={topItem.id}>id {itemIdLabel(topItem.id)}</span>
              </div>
              <h3>{topItem.title}</h3>
              <p>{topItem.summary}</p>
              <div class="chips">
                {#each [...topItem.artists, ...topItem.topics].slice(0, 4) as chip}
                  <span class="chip">{chip}</span>
                {/each}
                {#if topItem.status === 'tracking'}
                  <span class="chip hot">重点跟踪</span>
                {:else if topItem.status === 'saved'}
                  <span class="chip hot">已保存</span>
                {:else if topItem.status === 'viewed'}
                  <span class="chip">已读</span>
                {/if}
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
                <button
                  class="small-button"
                  disabled={feedbackPending === `${topItem.id}:viewed`}
                  onclick={() => sendFeedback(topItem.id, 'viewed')}
                >已读</button>
                <button class="small-button" onclick={() => sendFeedback(topItem.id, 'not_relevant')}>不相关</button>
                <button
                  class="small-button"
                  disabled={dedupPending === topItem.id}
                  onclick={() => markDuplicate(topItem.id)}
                >{dedupPending === topItem.id ? '查找中...' : '重复'}</button>
                {#if dedupResult?.itemId === topItem.id}
                  <span class="chip">{dedupResult.found > 0 ? `合并了 ${dedupResult.found} 个重复` : '未找到重复'}</span>
                {/if}
                {#if topItem.url}
                  <a class="source-link" href={topItem.url} target="_blank" rel="noreferrer">来源 · {sourceLabel(topItem)}</a>
                {/if}
                {#each (topItem.relatedSources ?? []).slice(0, 3) as related}
                  <a class="source-link related-source" href={related.url} target="_blank" rel="noreferrer">{related.source}</a>
                {/each}
              </div>
            </div>
          </article>

          {#each secondaryItems as item}
            <article class="story">
              <figure class="story-thumb">
                <img src={imageForItem(item)} alt="" loading="lazy" />
              </figure>
              <div class="story-body">
                <div class="story-kicker">
                  <span>{itemKicker(item)}</span>
                  <span class="item-id" title={item.id}>id {itemIdLabel(item.id)}</span>
                </div>
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
                {#each (item.relatedSources ?? []).slice(0, 2) as related}
                  <a class="source-link inline-source related-source" href={related.url} target="_blank" rel="noreferrer">
                    {related.source}
                  </a>
                {/each}
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <section class="empty-state">
          <h3>暂无匹配信号</h3>
          <p>
            {#if followedTopicCount === 0}
              先恢复或添加兴趣，雷达才有主题可匹配。
            {:else}
              关注已设置；新内容会在定时抓取后出现。也可在「兴趣」里调整主题。
            {/if}
          </p>
          {#if followedTopicCount === 0}
            <button class="small-button primary" type="button" onclick={() => setView('interests')}>去设置兴趣</button>
          {:else}
            <button class="small-button" type="button" onclick={() => setView('interests')}>调整兴趣</button>
          {/if}
        </section>
      {/if}

      <div class="section-title">
        <h2>{activeView === 'trends' ? '全部趋势分类' : '未来关注时间线'}</h2>
        <span>{activeView === 'trends' ? '职业 · 商业 · 生活 · 地缘政治' : '演出优先视图'}</span>
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
                <div class="story-kicker">
                  <span class="item-id" title={item.id}>id {itemIdLabel(item.id)}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
                <div class="timeline-links">
                  {#if item.url}
                    <a class="source-link inline-source" href={item.url} target="_blank" rel="noreferrer">
                      来源 · {sourceLabel(item)}
                    </a>
                  {/if}
                  {#each (item.relatedSources ?? []).slice(0, 4) as related}
                    <a class="source-link inline-source related-source" href={related.url} target="_blank" rel="noreferrer">
                      {related.source}
                    </a>
                  {/each}
                </div>
                <div class="story-actions timeline-actions">
                  <button
                    class="small-button primary"
                    disabled={feedbackPending === `${item.id}:track`}
                    onclick={() => sendFeedback(item.id, 'track')}
                  >
                    重点跟踪
                  </button>
                  <button
                    class="small-button"
                    disabled={feedbackPending === `${item.id}:save`}
                    onclick={() => sendFeedback(item.id, 'save')}
                  >
                    保存
                  </button>
                  <button
                    class="small-button"
                    disabled={feedbackPending === `${item.id}:viewed`}
                    onclick={() => sendFeedback(item.id, 'viewed')}
                  >
                    已读
                  </button>
                  <button
                    class="small-button"
                    disabled={feedbackPending === `${item.id}:not_relevant`}
                    onclick={() => sendFeedback(item.id, 'not_relevant')}
                  >
                    不相关
                  </button>
                  <button
                    class="small-button"
                    disabled={dedupPending === item.id}
                    onclick={() => markDuplicate(item.id)}
                  >
                    {dedupPending === item.id ? '查找中...' : '重复'}
                  </button>
                  {#if dedupResult?.itemId === item.id}
                    <span class="chip">{dedupResult.found > 0 ? `合并了 ${dedupResult.found} 个重复` : '未找到重复'}</span>
                  {/if}
                  {#if item.status === 'tracking'}
                    <span class="chip hot">重点跟踪</span>
                  {:else if item.status === 'saved'}
                    <span class="chip hot">已保存</span>
                  {:else if item.status === 'viewed'}
                    <span class="chip">已读</span>
                  {/if}
                </div>
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
                <div class="story-kicker">
                  <span class="item-id" title={item.id}>id {itemIdLabel(item.id)}</span>
                </div>
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

    {#if !hideSidePanel}
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

      <section class="mini-card">
        <div class="mini-card-head">
          <div>
            <h2>快捷入口</h2>
            <span>兴趣已独立成页</span>
          </div>
        </div>
        <div class="preference-summary" aria-label="快捷入口">
          <button type="button" onclick={() => setView('interests')}>
            <strong>{interestTopics.length}</strong>
            <span>兴趣</span>
          </button>
          <button type="button" onclick={() => setView('coe')}>
            <strong>COE</strong>
            <span>报价</span>
          </button>
          <button type="button" onclick={() => setView('me')}>
            <strong>{followedTopicCount}</strong>
            <span>我的</span>
          </button>
        </div>
      </section>

      <section class="mini-card desktop-only-side">
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
  <div style="text-align:center;padding:16px 0 24px;font-size:11px;color:var(--muted)">v{__APP_VERSION__}</div>
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
          <option value="life">生活</option>
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
        <label class="check-row optimize-check" title="允许本地 AI 代理把这条兴趣整理成更精准的关键词（可拆分成多条）">
          <input type="checkbox" bind:checked={newWatchOptimize} />
          AI 优化
        </label>
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
          <option value="life">生活</option>
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
        <label class="check-row optimize-check" title="允许本地 AI 代理把这条兴趣整理成更精准的关键词（可拆分成多条）">
          <input type="checkbox" bind:checked={editWatchOptimize} />
          AI 优化
        </label>
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

        <div class="sheet-row sheet-control-row">
          <span>📋</span>
          <strong>类型</strong>
          <select value={reminderCategory} onchange={(e) => onCategoryChange(e.currentTarget.value as DateCategory)} aria-label="日期类型">
            <option value="birthday">生日</option>
            <option value="child_birthday">宝宝生日</option>
            <option value="anniversary">恋爱/婚姻</option>
            <option value="memorial">逝世纪念</option>
            <option value="other">其他</option>
          </select>
        </div>

        <div class="sheet-group">
          <div class="sheet-label">目标日</div>
          <div class="date-picker-row">
            <input use:datepicker bind:value={reminderDate} aria-label="目标日期" />
            <select bind:value={reminderCalendarType} aria-label="历法">
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

        <label class="sheet-row">
          <span>📌</span>
          <strong>日期准确</strong>
          <input type="checkbox" bind:checked={reminderDateExact} />
        </label>
        {#if !reminderDateExact}
          <p class="sheet-hint">年份未知时只提醒周期，不计算天数和里程碑</p>
        {/if}

        <div class="sheet-row sheet-control-row">
          <span>↻</span>
          <strong>重复</strong>
          <select bind:value={reminderRepeat} aria-label="重复方式">
            <option value="annual">每年（相同月日）</option>
            <option value="none">仅提醒一次</option>
          </select>
        </div>

        <div class="sheet-row sheet-control-row reminder-days-row">
          <span>铃</span>
          <strong>设置提醒</strong>
          <div class="reminder-days" aria-label="提醒时间">
            <label><input type="checkbox" bind:checked={reminderDay0} />当天</label>
            <label><input type="checkbox" bind:checked={reminderDay1} />1 天前</label>
            <label><input type="checkbox" bind:checked={reminderDay3} />3 天前</label>
            <label><input type="checkbox" bind:checked={reminderDay7} />7 天前</label>
            <label><input type="checkbox" bind:checked={reminderDay30} />30 天前</label>
          </div>
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

{#if moreMenuOpen}
  <div
    class="more-menu-backdrop"
    role="presentation"
    tabindex="-1"
    onkeydown={(event) => event.key === 'Escape' && (moreMenuOpen = false)}
    onclick={(event) => event.target === event.currentTarget && (moreMenuOpen = false)}
  >
    <div class="more-menu-sheet" role="dialog" aria-modal="true" aria-labelledby="more-menu-title">
      <div class="more-menu-head">
        <div>
          <h2 id="more-menu-title">更多</h2>
          <p>我的、演出、COE、兴趣与设置</p>
        </div>
        <button class="close-button" type="button" aria-label="关闭更多菜单" onclick={() => (moreMenuOpen = false)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>
        </button>
      </div>
      <div class="more-menu-list">
        {#each moreMenuItems as item}
          <button type="button" onclick={() => selectMoreItem(item.id)}>
            <strong>{item.label}</strong>
            <span>{item.hint}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

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
          <p>{gymBodyParts.find((bp) => bp.id === gymDetail?.bodyPart)?.label ?? gymDetail.bodyPart}</p>
        </div>
        <button class="close-button" type="button" aria-label="关闭" onclick={() => (gymDetail = null)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>
        </button>
      </div>
      <img class="gym-modal-gif" src={gymDetail.gifUrl} alt={gymDetail.name} />
      <div class="gym-tags">
        <span class="gym-tag part">{gymDetail.bodyPart}</span>
        <span class="gym-tag target">{gymDetail.target}</span>
        <span class="gym-tag gear">{gymDetail.equipment}</span>
      </div>
      {#if gymDetail.secondaryMuscles.length}
        <p class="gym-modal-secondary">协同肌群：{gymDetail.secondaryMuscles.join('、')}</p>
      {/if}
      {#if gymDetail.instructions}
        <p class="gym-modal-instructions">{gymDetail.instructions}</p>
      {/if}
    </div>
  </div>
{/if}

<nav
  class="primary-nav mobile-nav"
  data-active={navigationView}
  style={`--nav-count: ${barNavItems.length}; --nav-index: ${navActiveIndex};`}
  aria-label="主导航"
>
  <span class="nav-indicator" aria-hidden="true"></span>
  {#each barNavItems as item}
    <button
      class:active={navigationView === item.id}
      type="button"
      onclick={() => onBarNavClick(item.id)}
    >
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
    border: 0;
    background: transparent;
    color: inherit;
    padding: 0;
    text-align: left;
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
    background-clip: padding-box;
    color: var(--muted);
    font-size: 13px;
    font-weight: 950;
    position: relative;
    z-index: 1;
    overflow: hidden;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    transition: color 180ms ease, background 140ms ease;
  }

  .primary-nav button:active {
    border-radius: 999px;
    background: color-mix(in srgb, var(--mint) 42%, transparent);
  }

  .primary-nav button.active {
    color: var(--accent-text);
  }

  .primary-nav button.active:active {
    background: transparent;
  }

  .nav-indicator {
    position: absolute;
    left: 5px;
    top: 5px;
    bottom: 5px;
    width: calc((100% - 10px) / var(--nav-count, 5));
    border-radius: 999px;
    background: var(--jade);
    box-shadow: 0 8px 18px rgba(31, 111, 91, 0.2);
    transform: translateX(calc(100% * var(--nav-index, 0)));
    transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
    z-index: 0;
    pointer-events: none;
  }

  .mobile-nav {
    display: none;
  }

  .icon-button,
  .button {
    border: 1px solid var(--line);
    background: #fffdf7;
    background-clip: padding-box;
    color: var(--ink);
    border-radius: 8px;
    font-size: 13px;
    font-weight: 850;
    min-height: 36px;
    overflow: hidden;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .icon-button:active,
  .button:active {
    border-radius: 8px;
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

  .optimize-check {
    white-space: nowrap;
    cursor: pointer;
  }

  .optimize-badge {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 6px;
    border-radius: 999px;
    background: #fff1c9;
    border: 1px solid #f0d896;
    color: #8a6d1a;
    font-size: 10px;
    font-weight: 800;
    vertical-align: middle;
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

  .reminder-checks {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .remind-days-row > span {
    color: var(--muted);
    font-size: 12px;
    font-weight: 900;
    margin-right: 4px;
  }

  .date-hint {
    display: block;
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
    font-style: italic;
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

  .sheet-control-row select {
    min-height: 42px;
    border: 1px solid rgba(130, 111, 91, 0.22);
    border-radius: 12px;
    background: #fffdf7;
    color: var(--ink);
    padding: 0 12px;
    font-weight: 850;
  }

  .reminder-days {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .reminder-days label {
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid rgba(130, 111, 91, 0.18);
    border-radius: 999px;
    padding: 0 10px;
    background: #fff8eb;
    color: var(--muted);
    font-size: 13px;
    font-weight: 850;
    white-space: nowrap;
  }

  .reminder-days input {
    accent-color: #7ea79d;
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

  .sheet-hint {
    margin: -4px 0 6px 52px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
    font-style: italic;
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

  .app-main.no-side-panel {
    grid-template-columns: minmax(0, 1fr);
  }

  .feed {
    padding: 28px;
    border-right: 1px solid var(--line);
    min-width: 0;
  }

  .app-main.no-side-panel .feed {
    border-right: 0;
  }

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
    background: #fffdf7;
    font-size: 14px;
  }

  .gym-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 14px 0 20px;
  }

  .gym-filters button {
    border: 1px solid var(--line);
    background: #fffdf7;
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
    background: #fffdf7;
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
    box-shadow: 0 6px 18px rgba(38, 29, 20, 0.1);
  }

  .gym-gif {
    width: 84px;
    height: 84px;
    flex-shrink: 0;
    object-fit: contain;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
  }

  .gym-card-body {
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .gym-card-body strong {
    font-size: 14px;
    text-transform: capitalize;
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
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 16px;
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
    color: #7a5a28;
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
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
  }

  .item-id {
    color: var(--muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    user-select: all;
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
    background: rgba(215, 242, 220, 0.42);
    color: var(--muted);
    border-radius: 999px;
    padding: 4px 9px;
    font-size: 11px;
    font-weight: 800;
  }

  .chip.hot {
    background: var(--accent);
    color: var(--accent-text);
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

  .nl-interest {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px dashed var(--line);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .nl-interest label {
    font-size: 12px;
    font-weight: 700;
    color: color-mix(in srgb, var(--ink) 68%, var(--line));
  }

  .nl-interest textarea {
    width: 100%;
    resize: vertical;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px 12px;
    font: inherit;
    background: color-mix(in srgb, var(--paper) 60%, white);
  }

  .nl-interest-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .nl-interest-note {
    font-size: 12px;
    color: var(--jade);
  }

  .related-source {
    background: color-mix(in srgb, var(--paper) 70%, white);
    border-color: var(--line);
    color: color-mix(in srgb, var(--ink) 60%, var(--line));
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .timeline-links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .timeline-actions {
    margin-top: 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
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

  .me-workspace,
  .interests-workspace,
  .settings-workspace {
    display: grid;
    gap: 14px;
  }

  .interests-head {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: flex-start;
  }

  .interests-head h1 {
    margin: 7px 0 8px;
  }

  .interests-head p {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.45;
  }

  .nav-config-list {
    display: grid;
    gap: 8px;
    padding: 0 14px 14px;
  }

  .nav-config-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    padding: 10px 12px;
    background: var(--surface);
    overflow: hidden;
  }

  .nav-config-row.selected {
    border-color: color-mix(in srgb, var(--jade) 45%, var(--line));
    background: color-mix(in srgb, var(--mint) 45%, white);
  }

  .nav-config-main {
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
    flex: 1;
    cursor: pointer;
    user-select: none;
  }

  .nav-config-main:active {
    border-radius: var(--radius-sm);
  }

  .nav-config-row strong,
  .nav-config-row small {
    display: block;
  }

  .nav-config-row small {
    margin-top: 2px;
    color: var(--muted);
    font-size: 12px;
  }

  .nav-config-actions {
    display: flex;
    gap: 6px;
  }

  .nav-config-actions button {
    width: 32px;
    height: 32px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fffdf7;
    font-weight: 900;
  }

  .nav-config-actions button:disabled {
    opacity: 0.4;
  }

  .nav-config-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 0 14px 14px;
  }

  .more-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(38, 29, 20, 0.28);
    display: flex;
    align-items: end;
    justify-content: center;
    padding: 16px;
    padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px));
  }

  .more-menu-sheet {
    width: min(420px, 100%);
    border: 1px solid var(--line);
    border-radius: 20px;
    background: #fffdf7;
    box-shadow: 0 24px 50px rgba(38, 29, 20, 0.22);
    padding: 16px;
    display: grid;
    gap: 12px;
  }

  .more-menu-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: start;
  }

  .more-menu-head h2 {
    margin: 0 0 4px;
    font-size: 18px;
  }

  .more-menu-head p {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }

  .more-menu-list {
    display: grid;
    gap: 8px;
  }

  .more-menu-list button {
    text-align: left;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: #fffdf7;
    padding: 12px 14px;
    display: grid;
    gap: 2px;
  }

  .more-menu-list button strong {
    font-size: 15px;
  }

  .more-menu-list button span {
    color: var(--muted);
    font-size: 12px;
  }

  .saved-workspace {
    display: grid;
  }

  .saved-head {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: flex-start;
  }

  .saved-head h1 {
    margin: 7px 0 8px;
  }

  .saved-head p {
    margin: 0;
    color: var(--muted);
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px;
  }

  .settings-grid.compact {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .settings-card,
  .notebook-card,
  .cron-status-card,
  .job-run-card,
  .settings-grid.compact button {
    border: 1px solid var(--line);
    border-radius: 12px;
    background: #fffdf7;
  }

  .settings-card,
  .notebook-card,
  .cron-status-card,
  .job-run-card {
    padding: 16px;
  }

  .tools-panel {
    display: grid;
    gap: 12px;
  }

  .compact-head {
    margin-bottom: 12px;
  }

  .cron-job-list {
    display: grid;
    gap: 8px;
  }

  .cron-job-row {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) minmax(92px, 0.34fr) minmax(128px, 0.42fr) minmax(180px, 0.76fr);
    gap: 10px;
    align-items: center;
    border: 1px solid color-mix(in srgb, var(--line) 76%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--mint) 38%, white);
    padding: 10px;
  }

  .cron-job-main {
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
    min-width: 0;
  }

  .cron-dot {
    width: 9px;
    height: 9px;
    margin-top: 6px;
    border-radius: 999px;
    background: var(--line);
  }

  .cron-job-row.success .cron-dot {
    background: var(--jade);
  }

  .cron-job-row.skipped .cron-dot {
    background: var(--gold);
  }

  .cron-job-row.error .cron-dot {
    background: #d9634f;
  }

  .cron-job-row.disabled {
    background: #fff8eb;
    opacity: 0.78;
  }

  .cron-job-main strong,
  .cron-job-meta strong {
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .cron-job-main p,
  .cron-job-meta span {
    color: var(--muted);
  }

  .cron-job-main p {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.35;
  }

  .cron-job-meta {
    min-width: 0;
  }

  .cron-job-meta span {
    display: block;
    font-size: 11px;
    font-weight: 900;
  }

  .cron-job-meta strong {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.3;
  }

  .job-run-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 0.8fr);
    gap: 14px;
    align-items: end;
    position: relative;
    overflow: hidden;
  }

  .job-run-card::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 5px;
    background: var(--line);
  }

  .job-run-card.running::before {
    background: var(--gold);
  }

  .job-run-card.success::before {
    background: var(--jade);
  }

  .job-run-card.error::before {
    background: #d9634f;
  }

  .ica-tool-card {
    grid-template-rows: auto auto;
  }

  .tool-status-grid {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
    position: relative;
  }

  .tool-status-grid div {
    min-width: 0;
    border: 1px solid color-mix(in srgb, var(--line) 76%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--mint) 56%, white);
    padding: 10px;
  }

  .tool-status-grid span {
    display: block;
    color: var(--muted);
    font-size: 11px;
    font-weight: 900;
  }

  .tool-status-grid strong {
    display: block;
    margin-top: 5px;
    overflow-wrap: anywhere;
    color: var(--ink);
    font-size: 13px;
    line-height: 1.25;
  }

  .job-run-copy,
  .job-run-controls,
  .job-run-status {
    position: relative;
  }

  .job-run-copy span,
  .job-run-controls span {
    color: var(--muted);
    font-size: 12px;
    font-weight: 900;
  }

  .job-run-copy strong {
    display: block;
    margin-top: 6px;
    font-size: 24px;
    line-height: 1.1;
  }

  .job-run-copy p,
  .job-run-status p {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.45;
  }

  .job-run-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: end;
  }

  .job-run-controls label {
    display: grid;
    gap: 6px;
  }

  .job-run-controls input {
    min-width: 0;
    height: 42px;
    border: 1px solid rgba(130, 111, 91, 0.22);
    border-radius: 12px;
    background: #fff8eb;
    color: var(--ink);
    padding: 0 12px;
    font-weight: 850;
  }

  .job-run-status {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 24px;
  }

  .job-run-status span {
    width: 9px;
    height: 9px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--line);
  }

  .job-run-card.running .job-run-status span {
    background: var(--gold);
    animation: pulse-dot 1s ease-in-out infinite;
  }

  .job-run-card.success .job-run-status span {
    background: var(--jade);
  }

  .job-run-card.error .job-run-status span {
    background: #d9634f;
  }

  @keyframes pulse-dot {
    0%,
    100% {
      transform: scale(0.8);
      opacity: 0.6;
    }
    50% {
      transform: scale(1.2);
      opacity: 1;
    }
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
    font-size: 28px;
    line-height: 1.05;
  }

  .settings-card p {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }

  .saved-entry {
    color: var(--ink);
    cursor: pointer;
    font: inherit;
    text-align: left;
    transition: border-color 160ms ease, transform 160ms ease;
  }

  .saved-entry:hover {
    border-color: var(--jade);
    transform: translateY(-1px);
  }

  .saved-entry b {
    color: var(--accent);
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

  .settings-grid.compact button {
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    overflow: hidden;
    background-clip: padding-box;
    transition:
      border-color 0.15s ease,
      background 0.15s ease;
  }

  .settings-grid.compact button:active {
    border-radius: 12px;
  }

  .settings-grid.compact button *,
  .nav-config-main * {
    cursor: inherit;
  }

  .settings-grid.compact button:hover {
    border-color: var(--jade);
  }

  .settings-grid.compact button.active {
    border-color: var(--jade);
    background: rgba(215, 242, 220, 0.55);
  }

  .me-preference-manager {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
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
      display: none;
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

    .sheet-row {
      grid-template-columns: 36px minmax(72px, 0.65fr) minmax(0, 1.35fr);
      gap: 10px;
    }

    .sheet-row strong,
    .sheet-label {
      font-size: 15px;
      line-height: 1.25;
    }

    .sheet-control-row select,
    .sheet-group p {
      font-size: 13px;
      line-height: 1.35;
    }

    .sheet-row > span {
      width: 34px;
      height: 34px;
    }

    .reminder-days {
      justify-content: flex-start;
    }

    .reminder-days label {
      min-height: 30px;
      padding: 0 8px;
      font-size: 12px;
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

    .cron-job-row {
      grid-template-columns: 1fr 1fr;
      align-items: start;
    }

    .cron-job-main,
    .cron-job-meta.wide {
      grid-column: 1 / -1;
    }

    .job-run-card,
    .job-run-controls {
      grid-template-columns: 1fr;
    }

    .tool-status-grid {
      grid-template-columns: 1fr;
    }

    .job-run-copy strong {
      font-size: 21px;
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
      grid-template-columns: 48px minmax(0, 1fr);
    }

    .timeline-image {
      display: none;
    }

    .chips,
    .story-actions,
    .timeline-actions,
    .timeline-links {
      gap: 5px;
    }

    .chip {
      padding: 3px 6px;
      font-size: 10px;
    }

    .small-button {
      padding: 6px 8px;
      font-size: 11px;
    }

    .date {
      width: 48px;
      height: 48px;
    }

    .hero-story {
      grid-template-columns: 1fr;
    }

    .story-media {
      min-height: 160px;
      border-right: 0;
      border-bottom: 1px solid var(--line);
    }

  }
</style>
