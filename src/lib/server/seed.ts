import type { RadarItem, WatchTopic } from './types';

export const defaultWatchTopics: WatchTopic[] = [
  topic('artist-twice', 'artist', 'TWICE', ['트와이스'], 'concerts', 5),
  topic('artist-gem', 'artist', 'G.E.M. 邓紫棋', ['G.E.M.', '邓紫棋', '鄧紫棋'], 'concerts', 5),
  topic('artist-coldplay', 'artist', 'Coldplay', [], 'concerts', 5),
  topic('artist-eason', 'artist', 'Eason Chan', ['陈奕迅', '陳奕迅'], 'concerts', 5),
  topic('artist-jj-lin', 'artist', 'JJ Lin', ['林俊杰', '林俊傑'], 'concerts', 4),
  topic('artist-jay-chou', 'artist', 'Jay Chou', ['周杰伦', '周杰倫'], 'concerts', 4),
  topic('artist-mayday', 'artist', 'Mayday', ['五月天'], 'concerts', 4),
  topic('topic-ai-product-sg', 'topic', 'AI product roles Singapore', ['AI PM Singapore'], 'career', 5),
  topic('topic-sea-funding', 'topic', 'SEA startup funding', ['Southeast Asia startup funding'], 'business', 4),
  topic('topic-us-china-ai', 'topic', 'US-China AI policy', ['AI chip export controls'], 'geopolitics', 4),
  topic(
    'topic-hot-company-risk',
    'topic',
    'Hot product/company risk signals',
    ['Dreame', '追觅', 'consumer hardware unicorn', 'company financial issue', 'organization issue'],
    'business',
    5
  ),
  topic(
    'topic-byd-ev-market',
    'topic',
    'BYD and EV cars market',
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
    title: 'No confirmed upcoming Singapore date for top watched artists',
    summary: 'The current watch scan should stay quiet until an official Singapore ticketing page appears.',
    description:
      'For artists like TWICE and G.E.M., past Singapore dates should be treated as history, not upcoming alerts.',
    url: 'https://www.ticketmaster.sg/',
    imageUrl: '/visuals/concert.svg',
    location: 'Singapore',
    artists: ['TWICE', 'G.E.M. 邓紫棋', 'Coldplay', 'Eason Chan'],
    topics: ['Singapore concerts', 'official source required'],
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
    title: 'TWICE Singapore stop was already in 2025',
    summary: 'The This Is For World Tour Singapore shows were listed for 11-12 Oct 2025, so this is not upcoming.',
    description: 'Past concert history is kept for context and should not trigger prominent alerts.',
    url: 'https://www.livenation.sg/',
    imageUrl: '/visuals/concert.svg',
    location: 'Singapore',
    startsAt: '2025-10-11T09:00:00.000Z',
    artists: ['TWICE'],
    topics: ['Singapore concerts', 'past event'],
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
    title: 'G.E.M. 邓紫棋 Singapore concert already passed',
    summary: 'The Singapore concert was listed for 23 May 2026, so it should not sit at the top now.',
    description: 'This is useful as historical context, not as an actionable upcoming event.',
    url: 'https://www.songkick.com/concerts/43081560-gem-deng-zi-qi-at-national-stadium',
    imageUrl: '/visuals/concert.svg',
    location: 'Singapore',
    startsAt: '2026-05-23T11:30:00.000Z',
    artists: ['G.E.M. 邓紫棋'],
    topics: ['Mandopop', 'Singapore concerts', 'past event'],
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
    title: 'AI product roles rising in Singapore',
    summary: 'Hiring posts cluster around agent workflow, finance automation, and internal tools.',
    description: 'A career-relevant trend matched your AI product and Singapore watch topics.',
    url: 'https://news.google.com/search?q=AI%20product%20roles%20Singapore',
    imageUrl: '/visuals/career.svg',
    topics: ['AI product roles Singapore', 'job market', 'career'],
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
    title: 'US-China tech policy update',
    summary: 'Export-control updates may affect AI hardware availability and regional startup costs.',
    description: 'A geopolitics item matched your US-China AI policy watch topic.',
    url: 'https://news.google.com/search?q=US%20China%20AI%20chip%20export%20controls',
    imageUrl: '/visuals/geopolitics.svg',
    topics: ['US-China AI policy', 'AI infrastructure', 'geopolitics'],
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
    title: 'SEA workflow automation funding cluster',
    summary: 'Funding and product launches around workflow automation are worth watching for business ideas.',
    description: 'A business-relevant trend matched your SEA startup funding and AI automation interests.',
    url: 'https://news.google.com/search?q=SEA%20startup%20funding%20workflow%20automation',
    imageUrl: '/visuals/business.svg',
    topics: ['SEA startup funding', 'workflow automation', 'business'],
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
    title: 'Dreame-style company risk signal worth watching',
    summary: 'Hot consumer product companies can be strong business signals when growth, funding, org, or governance questions surface.',
    description:
      'Track leading product companies with fast growth, public controversy, financing pressure, org churn, or governance risk.',
    url: 'https://news.google.com/search?q=Dreame%20Technology%20financial%20organization%20issue',
    imageUrl: '/visuals/opportunity.svg',
    topics: ['Hot product/company risk signals', 'Dreame', 'consumer hardware', 'business'],
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
    title: 'BYD and EV market moves worth tracking',
    summary: 'EV pricing, battery supply, exports, and Chinese carmaker competition can reveal product and market opportunities early.',
    description:
      'Track BYD, Chinese EV exports, battery cost changes, price pressure, dealer expansion, and Singapore/SEA EV adoption signals.',
    url: 'https://news.google.com/search?q=BYD%20EV%20market%20price%20war%20battery%20exports',
    imageUrl: '/visuals/ev.svg',
    topics: ['BYD and EV cars market', 'BYD', 'EV market', 'business'],
    artists: [],
    raw: {},
    score: 81,
    status: 'new'
  }
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
