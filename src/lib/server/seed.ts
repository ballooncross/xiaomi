import type { DateReminder, RadarItem, WatchTopic } from './types';

export const defaultWatchTopics: WatchTopic[] = [
  topic('artist-twice', 'artist', 'TWICE', ['트와이스'], 'concerts', 5),
  topic('artist-gem', 'artist', 'G.E.M. 邓紫棋', ['G.E.M.', '邓紫棋', '鄧紫棋'], 'concerts', 5),
  topic('artist-coldplay', 'artist', 'Coldplay', [], 'concerts', 5),
  topic('artist-eason', 'artist', 'Eason Chan', ['陈奕迅', '陳奕迅'], 'concerts', 5),
  topic('artist-jj-lin', 'artist', 'JJ Lin', ['林俊杰', '林俊傑'], 'concerts', 4),
  topic('artist-jay-chou', 'artist', 'Jay Chou', ['周杰伦', '周杰倫'], 'concerts', 4),
  topic('artist-mayday', 'artist', 'Mayday', ['五月天'], 'concerts', 4),
  topic('topic-ai-product-sg', 'topic', '新加坡 AI 产品岗位', ['AI product roles Singapore', 'AI PM Singapore'], 'career', 5),
  topic('topic-sea-funding', 'topic', '东南亚创业融资', ['SEA startup funding', 'Southeast Asia startup funding'], 'business', 4),
  topic('topic-us-china-ai', 'topic', '中美 AI 政策', ['US-China AI policy', 'AI chip export controls'], 'geopolitics', 4),
  topic(
    'topic-hot-company-risk',
    'topic',
    '热门产品与公司风险信号',
    ['Dreame', '追觅', 'consumer hardware unicorn', 'company financial issue', 'organization issue'],
    'business',
    5
  ),
  topic(
    'topic-byd-ev-market',
    'topic',
    '比亚迪与电动车市场',
    ['BYD', 'electric vehicles', 'EV market', 'Chinese EV', 'EV price war', 'battery market'],
    'business',
    5
  )
];

export const demoItems: RadarItem[] = [
  {
    id: 'demo-concert-watch-status',
    sourceId: 'demo',
    sourceType: 'demo',
    externalId: 'demo-concert-watch-status',
    kind: 'concert',
    title: '重点关注音乐人暂无确认的新加坡未来场次',
    summary: '当前扫描会保持安静，直到官方新加坡票务页或可信来源出现。',
    description:
      'TWICE 和 G.E.M. 这类音乐人的新加坡历史场次只作为上下文，不会作为未来提醒。',
    url: 'https://www.ticketmaster.sg/',
    imageUrl: '/visuals/concert.svg',
    location: 'Singapore',
    artists: ['TWICE', 'G.E.M. 邓紫棋', 'Coldplay', 'Eason Chan'],
    topics: ['新加坡演出', '需要官方来源'],
    raw: {},
    score: 68,
    status: 'new'
  },
  {
    id: 'demo-twice-past-singapore',
    sourceId: 'demo',
    sourceType: 'demo',
    externalId: 'demo-twice-past-singapore',
    kind: 'concert',
    title: 'TWICE 新加坡场已在 2025 年结束',
    summary: 'This Is For World Tour 新加坡场列于 2025 年 10 月 11-12 日，因此不是未来演出。',
    description: '历史演出会保留作上下文，但不会触发顶部提醒。',
    url: 'https://www.livenation.sg/',
    imageUrl: '/visuals/concert.svg',
    location: 'Singapore',
    startsAt: '2025-10-11T09:00:00.000Z',
    artists: ['TWICE'],
    topics: ['新加坡演出', '历史场次'],
    raw: { sourceNote: 'Live Nation listed Singapore for 11-12 Oct 2025.' },
    score: 22,
    status: 'dismissed'
  },
  {
    id: 'demo-gem-past-singapore',
    sourceId: 'demo',
    sourceType: 'demo',
    externalId: 'demo-gem-past-singapore',
    kind: 'concert',
    title: 'G.E.M. 邓紫棋新加坡演唱会已结束',
    summary: '新加坡场列于 2026 年 5 月 23 日，因此现在不应出现在顶部。',
    description: '这条信息只适合作为历史上下文，不是可行动的未来活动。',
    url: 'https://www.songkick.com/concerts/43081560-gem-deng-zi-qi-at-national-stadium',
    imageUrl: '/visuals/concert.svg',
    location: 'Singapore',
    startsAt: '2026-05-23T11:30:00.000Z',
    artists: ['G.E.M. 邓紫棋'],
    topics: ['华语流行', '新加坡演出', '历史场次'],
    raw: { sourceNote: 'Songkick and other listings show Singapore National Stadium on 23 May 2026.' },
    score: 18,
    status: 'dismissed'
  },
  {
    id: 'demo-ai-product-roles',
    sourceId: 'demo',
    sourceType: 'demo',
    externalId: 'demo-ai-product-roles',
    kind: 'trend',
    title: '新加坡 AI 产品岗位热度上升',
    summary: '招聘信号集中在 Agent 工作流、金融自动化和内部工具方向。',
    description: '这条职业趋势匹配了你对 AI 产品和新加坡岗位市场的关注。',
    url: 'https://news.google.com/search?q=AI%20product%20roles%20Singapore',
    imageUrl: '/visuals/career.svg',
    topics: ['新加坡 AI 产品岗位', '岗位市场', '职业'],
    artists: [],
    raw: {},
    score: 78,
    status: 'new'
  },
  {
    id: 'demo-us-china-policy',
    sourceId: 'demo',
    sourceType: 'demo',
    externalId: 'demo-us-china-policy',
    kind: 'news',
    title: '中美科技政策更新',
    summary: '出口管制变化可能影响 AI 硬件供给和区域创业成本。',
    description: '这条地缘政治信号匹配了你对中美 AI 政策的关注。',
    url: 'https://news.google.com/search?q=US%20China%20AI%20chip%20export%20controls',
    imageUrl: '/visuals/geopolitics.svg',
    topics: ['中美 AI 政策', 'AI 基础设施', '地缘政治'],
    artists: [],
    raw: {},
    score: 74,
    status: 'new'
  },
  {
    id: 'demo-sea-funding',
    sourceId: 'demo',
    sourceType: 'demo',
    externalId: 'demo-sea-funding',
    kind: 'opportunity',
    title: '东南亚工作流自动化融资信号',
    summary: '围绕工作流自动化的融资和产品发布，值得作为商业机会观察。',
    description: '这条商业趋势匹配了你对东南亚创业融资和 AI 自动化的兴趣。',
    url: 'https://news.google.com/search?q=SEA%20startup%20funding%20workflow%20automation',
    imageUrl: '/visuals/business.svg',
    topics: ['东南亚创业融资', '工作流自动化', '商业'],
    artists: [],
    raw: {},
    score: 76,
    status: 'new'
  },
  {
    id: 'demo-dreame-company-risk',
    sourceId: 'demo',
    sourceType: 'demo',
    externalId: 'demo-dreame-company-risk',
    kind: 'opportunity',
    title: '追觅这类热门公司风险信号值得跟踪',
    summary: '热门消费产品公司出现增长、融资、组织或治理问题时，可能是重要商业信号。',
    description:
      '持续关注高速增长、舆论争议、融资压力、组织震荡或治理风险的头部产品公司。',
    url: 'https://news.google.com/search?q=Dreame%20Technology%20financial%20organization%20issue',
    imageUrl: '/visuals/opportunity.svg',
    topics: ['热门产品与公司风险信号', 'Dreame', '追觅', '消费硬件', '商业'],
    artists: [],
    raw: {},
    score: 82,
    status: 'new'
  },
  {
    id: 'demo-byd-ev-market',
    sourceId: 'demo',
    sourceType: 'demo',
    externalId: 'demo-byd-ev-market',
    kind: 'opportunity',
    title: '比亚迪与电动车市场变化值得跟踪',
    summary: '电动车定价、电池供应、出口和中国车企竞争，可能提前暴露产品与市场机会。',
    description:
      '跟踪比亚迪、中国电动车出口、电池成本、价格压力、渠道扩张，以及新加坡/东南亚电动车采用信号。',
    url: 'https://news.google.com/search?q=BYD%20EV%20market%20price%20war%20battery%20exports',
    imageUrl: '/visuals/ev.svg',
    topics: ['比亚迪与电动车市场', 'BYD', 'EV 市场', '商业'],
    artists: [],
    raw: {},
    score: 81,
    status: 'new'
  }
];

export const defaultDateReminders: DateReminder[] = [
  lunarReminder('birthday-erjie', '二姐生日', 5, 1),
  lunarReminder('birthday-dajie', '大姐生日', 5, 1),
  lunarReminder('birthday-dad', '老爸生日', 5, 28),
  lunarReminder('birthday-laoge', '老哥生日', 6, 8),
  lunarReminder('birthday-junjun-1', '君君生日1', 11, 10),
  lunarReminder('birthday-mom', '老妈生日', 11, 14),
  lunarReminder('birthday-sanjie-me', '三姐和我生日', 11, 18),
  lunarReminder('birthday-muchen', '沐辰生日', 11, 19),
  lunarReminder('birthday-junjun-lunar', '君君农历生日', 12, 18, true),
  lunarReminder('birthday-qianqian', '倩倩生日', 12, 29),
  lunarReminder('birthday-yihang', '屹杭生日', 1, 28),
  lunarReminder('birthday-chunnv', '春女生日', 2, 7),
  lunarReminder('birthday-zoe', 'zoe生日', 3, 22)
];

function topic(
  id: string,
  type: WatchTopic['type'],
  name: string,
  aliases: string[],
  category: string,
  priority: number
): WatchTopic {
  return { id, type, name, aliases, category, priority, mode: 'follow', enabled: true };
}

function lunarReminder(
  id: string,
  title: string,
  month: number,
  day: number,
  pinned = false
): DateReminder {
  return {
    id,
    title,
    calendarType: 'lunar',
    month,
    day,
    lunarIsLeapMonth: false,
    repeat: 'annual',
    note: pinned ? '从截图导入，农历生日。' : '从截图导入，按农历每年提醒。',
    pinned,
    enabled: true,
    remindDaysBefore: [0, 1, 7]
  };
}
