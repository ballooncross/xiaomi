INSERT OR IGNORE INTO watch_topics (user_id, id, type, feed, name, aliases, category, priority, mode) VALUES
  ('user-admin-tofu', 'artist-twice', 'artist', 'concerts', 'TWICE', '["트와이스"]', 'general', 5, 'follow'),
  ('user-admin-tofu', 'artist-gem', 'artist', 'concerts', 'G.E.M. 邓紫棋', '["G.E.M.", "邓紫棋", "鄧紫棋"]', 'general', 5, 'follow'),
  ('user-admin-tofu', 'artist-coldplay', 'artist', 'concerts', 'Coldplay', '[]', 'general', 5, 'follow'),
  ('user-admin-tofu', 'artist-eason', 'artist', 'concerts', 'Eason Chan', '["陈奕迅", "陳奕迅"]', 'general', 5, 'follow'),
  ('user-admin-tofu', 'artist-jj-lin', 'artist', 'concerts', 'JJ Lin', '["林俊杰", "林俊傑"]', 'general', 4, 'follow'),
  ('user-admin-tofu', 'artist-jay-chou', 'artist', 'concerts', 'Jay Chou', '["周杰伦", "周杰倫"]', 'general', 4, 'follow'),
  ('user-admin-tofu', 'artist-mayday', 'artist', 'concerts', 'Mayday', '["五月天"]', 'general', 4, 'follow'),
  ('user-admin-tofu', 'artist-stefanie-sun', 'artist', 'concerts', 'Stefanie Sun', '["孙燕姿", "孫燕姿"]', 'general', 4, 'follow'),
  ('user-admin-tofu', 'topic-ai-product-sg', 'topic', 'trends', '新加坡 AI 产品岗位', '["AI product roles Singapore", "AI PM Singapore", "agent workflow jobs"]', 'career', 5, 'follow'),
  ('user-admin-tofu', 'topic-sea-funding', 'topic', 'trends', '东南亚创业融资', '["SEA startup funding", "Southeast Asia startup funding", "SEA fintech funding"]', 'business', 4, 'follow'),
  ('user-admin-tofu', 'topic-us-china-ai', 'topic', 'trends', '中美 AI 政策', '["US-China AI policy", "US China tech restrictions", "AI chip export controls"]', 'geopolitics', 4, 'follow'),
  ('user-admin-tofu', 'topic-hot-company-risk', 'topic', 'trends', '热门产品与公司风险信号', '["Hot product/company risk signals", "Dreame", "追觅", "consumer hardware unicorn", "company financial issue", "organization issue"]', 'business', 5, 'follow'),
  ('user-admin-tofu', 'topic-byd-ev-market', 'topic', 'trends', '比亚迪与电动车市场', '["BYD and EV cars market", "BYD", "electric vehicles", "EV market", "Chinese EV", "EV price war", "battery market"]', 'business', 5, 'follow'),
  ('user-admin-tofu', 'topic-sg-events', 'artist', 'concerts', '新加坡演唱会和现场活动', '["Singapore concerts and live events", "Singapore concert", "Singapore live nation", "SISTIC concert"]', 'general', 5, 'follow');

UPDATE watch_topics
SET optimize_status = 'locked'
WHERE user_id = 'user-admin-tofu' AND feed = 'concerts';

INSERT OR IGNORE INTO sources (id, type, name, config_json, frequency_minutes) VALUES
  ('ticketmaster-sg-music', 'ticketmaster', 'Ticketmaster Singapore music', '{"countryCode":"SG","classificationName":"music"}', 360),
  ('ticketmaster-sg-popular', 'ticketmaster', 'Ticketmaster Singapore popular music discovery', '{"countryCode":"SG","classificationName":"music","mode":"popular"}', 360),
  ('bandsintown-artists', 'bandsintown', 'Bandsintown artist watches', '{}', 360),
  ('manual-trends', 'manual', 'Manual trend seed', '{}', 720);

INSERT OR IGNORE INTO date_reminders (
  user_id, id, title, calendar_type, month, day, lunar_is_leap_month, repeat, note, pinned, enabled, remind_days_before
) VALUES
  ('user-admin-tofu', 'birthday-erjie', '二姐生日', 'lunar', 5, 1, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('user-admin-tofu', 'birthday-dajie', '大姐生日', 'lunar', 5, 1, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('user-admin-tofu', 'birthday-dad', '老爸生日', 'lunar', 5, 28, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('user-admin-tofu', 'birthday-laoge', '老哥生日', 'lunar', 6, 8, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('user-admin-tofu', 'birthday-junjun-1', '君君生日1', 'lunar', 11, 10, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('user-admin-tofu', 'birthday-mom', '老妈生日', 'lunar', 11, 14, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('user-admin-tofu', 'birthday-sanjie-me', '三姐和我生日', 'lunar', 11, 18, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('user-admin-tofu', 'birthday-muchen', '沐辰生日', 'lunar', 11, 19, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('user-admin-tofu', 'birthday-junjun-lunar', '君君农历生日', 'lunar', 12, 18, 0, 'annual', '', 1, 1, '[0,1,7]'),
  ('user-admin-tofu', 'birthday-qianqian', '倩倩生日', 'lunar', 12, 29, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('user-admin-tofu', 'birthday-yihang', '屹杭生日', 'lunar', 1, 28, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('user-admin-tofu', 'birthday-chunnv', '春女生日', 'lunar', 2, 7, 0, 'annual', '', 0, 1, '[0,1,7]'),
  ('user-admin-tofu', 'birthday-zoe', 'zoe生日', 'lunar', 3, 22, 0, 'annual', '', 0, 1, '[0,1,7]');
