UPDATE watch_topics
SET
  name = '新加坡 AI 产品岗位',
  aliases = '["AI product roles Singapore", "AI PM Singapore", "agent workflow jobs"]',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'topic-ai-product-sg';

UPDATE watch_topics
SET
  name = '东南亚创业融资',
  aliases = '["SEA startup funding", "Southeast Asia startup funding", "SEA fintech funding"]',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'topic-sea-funding';

UPDATE watch_topics
SET
  name = '中美 AI 政策',
  aliases = '["US-China AI policy", "US China tech restrictions", "AI chip export controls"]',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'topic-us-china-ai';

UPDATE watch_topics
SET
  name = '热门产品与公司风险信号',
  aliases = '["Hot product/company risk signals", "Dreame", "追觅", "consumer hardware unicorn", "company financial issue", "organization issue"]',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'topic-hot-company-risk';

UPDATE watch_topics
SET
  name = '比亚迪与电动车市场',
  aliases = '["BYD and EV cars market", "BYD", "electric vehicles", "EV market", "Chinese EV", "EV price war", "battery market"]',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'topic-byd-ev-market';

UPDATE watch_topics
SET
  name = '新加坡演唱会和现场活动',
  aliases = '["Singapore concerts and live events", "Singapore concert", "Singapore live nation", "SISTIC concert"]',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'topic-sg-events';

UPDATE items
SET
  title = '新加坡 AI 产品岗位',
  summary = '已为「新加坡 AI 产品岗位」准备每日趋势搜索。',
  description = '打开来源搜索，查看「新加坡 AI 产品岗位」的最新报道。之后可以为具体来源加入 RSS/API 抓取。',
  topics = '["新加坡 AI 产品岗位","career"]',
  updated_at = CURRENT_TIMESTAMP
WHERE external_id = 'trend-search-topic-ai-product-sg';

UPDATE items
SET
  title = '东南亚创业融资',
  summary = '已为「东南亚创业融资」准备每日趋势搜索。',
  description = '打开来源搜索，查看「东南亚创业融资」的最新报道。之后可以为具体来源加入 RSS/API 抓取。',
  topics = '["东南亚创业融资","business"]',
  updated_at = CURRENT_TIMESTAMP
WHERE external_id = 'trend-search-topic-sea-funding';

UPDATE items
SET
  title = '中美 AI 政策',
  summary = '已为「中美 AI 政策」准备每日趋势搜索。',
  description = '打开来源搜索，查看「中美 AI 政策」的最新报道。之后可以为具体来源加入 RSS/API 抓取。',
  topics = '["中美 AI 政策","geopolitics"]',
  updated_at = CURRENT_TIMESTAMP
WHERE external_id = 'trend-search-topic-us-china-ai';

UPDATE items
SET
  title = '热门产品与公司风险信号',
  summary = '已为「热门产品与公司风险信号」准备每日趋势搜索。',
  description = '打开来源搜索，查看「热门产品与公司风险信号」的最新报道。之后可以为具体来源加入 RSS/API 抓取。',
  topics = '["热门产品与公司风险信号","business"]',
  updated_at = CURRENT_TIMESTAMP
WHERE external_id = 'trend-search-topic-hot-company-risk';

UPDATE items
SET
  title = '比亚迪与电动车市场',
  summary = '已为「比亚迪与电动车市场」准备每日趋势搜索。',
  description = '打开来源搜索，查看「比亚迪与电动车市场」的最新报道。之后可以为具体来源加入 RSS/API 抓取。',
  topics = '["比亚迪与电动车市场","business"]',
  updated_at = CURRENT_TIMESTAMP
WHERE external_id = 'trend-search-topic-byd-ev-market';
