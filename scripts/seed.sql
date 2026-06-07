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

INSERT OR IGNORE INTO date_reminders (
  id, title, calendar_type, month, day, lunar_is_leap_month, repeat, note, pinned, enabled, remind_days_before
) VALUES
  ('birthday-erjie', '二姐生日', 'lunar', 5, 1, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-dajie', '大姐生日', 'lunar', 5, 1, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-dad', '老爸生日', 'lunar', 5, 28, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-laoge', '老哥生日', 'lunar', 6, 8, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-junjun-1', '君君生日1', 'lunar', 11, 10, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-mom', '老妈生日', 'lunar', 11, 14, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-sanjie-me', '三姐和我生日', 'lunar', 11, 18, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-muchen', '沐辰生日', 'lunar', 11, 19, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-junjun-lunar', '君君农历生日', 'lunar', 12, 18, 0, 'annual', '', 1, 1, '[0,1,7]'),
  ('birthday-qianqian', '倩倩生日', 'lunar', 12, 29, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-yihang', '屹杭生日', 'lunar', 1, 28, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-chunnv', '春女生日', 'lunar', 2, 7, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('birthday-zoe', 'zoe生日', 'lunar', 3, 22, 0, 'annual', '', 0, 1, '[0,1,7]');
