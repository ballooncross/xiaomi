INSERT OR IGNORE INTO watch_topics (id, type, name, aliases, category, priority, mode) VALUES
  ('artist-twice', 'artist', 'TWICE', '["트와이스"]', 'concerts', 5, 'follow'),
  ('artist-gem', 'artist', 'G.E.M. 邓紫棋', '["G.E.M.", "邓紫棋", "鄧紫棋"]', 'concerts', 5, 'follow'),
  ('artist-coldplay', 'artist', 'Coldplay', '[]', 'concerts', 5, 'follow'),
  ('artist-eason', 'artist', 'Eason Chan', '["陈奕迅", "陳奕迅"]', 'concerts', 5, 'follow'),
  ('artist-jj-lin', 'artist', 'JJ Lin', '["林俊杰", "林俊傑"]', 'concerts', 4, 'follow'),
  ('artist-jay-chou', 'artist', 'Jay Chou', '["周杰伦", "周杰倫"]', 'concerts', 4, 'follow'),
  ('artist-mayday', 'artist', 'Mayday', '["五月天"]', 'concerts', 4, 'follow'),
  ('artist-stefanie-sun', 'artist', 'Stefanie Sun', '["孙燕姿", "孫燕姿"]', 'concerts', 4, 'follow'),
  ('topic-ai-product-sg', 'topic', '新加坡 AI 产品岗位', '["AI product roles Singapore", "AI PM Singapore", "agent workflow jobs"]', 'career', 5, 'follow'),
  ('topic-sea-funding', 'topic', '东南亚创业融资', '["SEA startup funding", "Southeast Asia startup funding", "SEA fintech funding"]', 'business', 4, 'follow'),
  ('topic-us-china-ai', 'topic', '中美 AI 政策', '["US-China AI policy", "US China tech restrictions", "AI chip export controls"]', 'geopolitics', 4, 'follow'),
  ('topic-hot-company-risk', 'topic', '热门产品与公司风险信号', '["Hot product/company risk signals", "Dreame", "追觅", "consumer hardware unicorn", "company financial issue", "organization issue"]', 'business', 5, 'follow'),
  ('topic-byd-ev-market', 'topic', '比亚迪与电动车市场', '["BYD and EV cars market", "BYD", "electric vehicles", "EV market", "Chinese EV", "EV price war", "battery market"]', 'business', 5, 'follow'),
  ('topic-sg-events', 'topic', '新加坡演唱会和现场活动', '["Singapore concerts and live events", "Singapore concert", "Singapore live nation", "SISTIC concert"]', 'concerts', 5, 'follow');

INSERT OR IGNORE INTO sources (id, type, name, config_json, frequency_minutes) VALUES
  ('ticketmaster-sg-music', 'ticketmaster', 'Ticketmaster Singapore music', '{"countryCode":"SG","classificationName":"music"}', 360),
  ('ticketmaster-sg-popular', 'ticketmaster', 'Ticketmaster Singapore popular music discovery', '{"countryCode":"SG","classificationName":"music","mode":"popular"}', 360),
  ('bandsintown-artists', 'bandsintown', 'Bandsintown artist watches', '{}', 360),
  ('manual-trends', 'manual', 'Manual trend seed', '{}', 720);
