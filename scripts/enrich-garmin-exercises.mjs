import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { collectGarminExercises } from './import-garmin-exercises.mjs';
import {
  chooseAutomaticMatch,
  exerciseAliases,
  hasCompatibleEquipment,
  hasExactNameMatch,
  nameTokens,
  rankCandidates
} from './lib/exercise-matching.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(SCRIPT_DIR, '.exercise-enrichment-cache');
const OUTPUT_SQL = join(SCRIPT_DIR, 'seed-garmin-enrichment.sql');
const REPORT_FILE = join(SCRIPT_DIR, 'exercise-enrichment-report.json');
const REVIEW_QUEUE_FILE = join(SCRIPT_DIR, 'exercise-review-queue.json');
const GENERATED_DESCRIPTIONS_FILE = join(
  SCRIPT_DIR,
  '..',
  'data',
  'exercise-enrichment',
  'generated-descriptions.json'
);
const CURATED_GUIDES_FILE = join(
  SCRIPT_DIR,
  '..',
  'data',
  'exercise-enrichment',
  'curated-guides.json'
);
const OVERRIDES_FILE = join(
  SCRIPT_DIR,
  '..',
  'data',
  'exercise-enrichment',
  'match-overrides.json'
);

const EXISTING_DATASET_URL =
  'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json';
const EXISTING_MEDIA_BASE =
  'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/';
const FREE_EXERCISE_DB_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const FREE_EXERCISE_MEDIA_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const FREE_EXERCISE_VIDEO_DB_URL =
  'https://exercise-database.zenithfits.com/api/v1/exercises?limit=500';
const OPEN_EXERCISE_DB_URL =
  'https://raw.githubusercontent.com/Glowupp-app/open-exercisedb/main/exercises.json';
const WGER_URL = 'https://wger.de/api/v2/exerciseinfo/?limit=1000';
const MUSCLE_AND_STRENGTH_BASE = 'https://www.muscleandstrength.com';
const MUSCLE_AND_STRENGTH_INDEXES = [
  'abs',
  'abductors.html',
  'adductors.html',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'hip-flexors',
  'it-band',
  'lats',
  'lower-back',
  'middle-back',
  'neck.html',
  'obliques',
  'quads',
  'shoulders',
  'traps',
  'triceps',
  'bodyweight',
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'exercise-ball'
];
const GARMIN_DETAIL_BASE = 'https://connect.garmin.com/web-data/exercises/en-US';
const GARMIN_DETAIL_CATALOGS = new Set([
  'strength',
  'cardio',
  'hiit',
  'yoga',
  'pilates',
  'mobility'
]);
const GENERIC_EXERCISE_NAMES = new Set(['cardio', 'warm up', 'strength']);
const MEDIA_MATCH_SOURCES = new Set([
  'free-exercise-video-db',
  'curated-web-guide',
  'muscle-and-strength'
]);
const MEDIA_MATCH_DENYLIST = new Set([
  'garmin:CURL:ONE_ARM_PREACHER_CURL|free-exercise-video-db:1673'
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const args = parseArgs(process.argv.slice(2));
const blockedHosts = new Set();
mkdirSync(CACHE_DIR, { recursive: true });

async function main() {
  const allGarmin = await collectGarminExercises();
  const garminRecords = args.limit ? allGarmin.slice(0, args.limit) : allGarmin;
  console.log(`Enriching ${garminRecords.length} Garmin exercises...`);

  const [
    existing,
    freeExerciseVideoDb,
    curatedGuides,
    muscleAndStrength,
    freeExerciseDb,
    wger,
    openExerciseDb
  ] = await Promise.all([
    loadExistingDataset(),
    loadFreeExerciseVideoDb(),
    loadCuratedGuides(),
    loadMuscleAndStrength(),
    loadFreeExerciseDb(),
    loadWger(),
    loadOpenExerciseDb()
  ]);
  const sources = [
    buildSource('exercise-dataset', existing),
    buildSource('free-exercise-video-db', freeExerciseVideoDb),
    buildSource('curated-web-guide', curatedGuides),
    buildSource('muscle-and-strength', muscleAndStrength),
    buildSource('wger', wger),
    buildSource('free-exercise-db', freeExerciseDb),
    buildSource('open-exercise-db', openExerciseDb)
  ];
  const candidateById = new Map(
    sources.flatMap((source) => source.candidates.map((candidate) => [candidate.id, candidate]))
  );
  const overrides = readJsonFile(OVERRIDES_FILE, {});
  const generatedDescriptions = readJsonFile(GENERATED_DESCRIPTIONS_FILE, {});
  const details = args.skipGarminDetails
    ? new Map()
    : await loadGarminDetails(garminRecords);

  const enriched = [];
  const reviewQueue = [];
  for (const garmin of garminRecords) {
    const target = toTarget(garmin, details.get(garmin.id));
    const override = overrides[garmin.id];
    const rankedBySource = sources.map((source) => ({
      source: source.name,
      ranked: rankCandidates(target, candidatePool(target, source), 5)
    }));

    let selected = null;
    let method = null;
    if (override?.status === 'accepted') {
      const candidate = candidateById.get(override.candidateId);
      if (candidate) {
        selected = { candidate, score: Number(override.confidence) || 1 };
        method = 'override';
      }
    }

    if (!selected) {
      for (const group of rankedBySource) {
        const automatic = MEDIA_MATCH_SOURCES.has(group.source)
          ? chooseExactMediaMatch(target, group.ranked)
          : chooseAutomaticMatch(group.ranked);
        if (automatic) {
          selected = automatic;
          method = automatic.method;
          break;
        }
      }
    }

    const result = mergeEnrichment(target, selected, method);
    applyGeneratedDescription(result, generatedDescriptions[garmin.id]);
    enriched.push(result);

    if (!selected && override?.status !== 'rejected') {
      reviewQueue.push({
        garmin: compactRecord(target),
        candidates: rankedBySource.flatMap((group) =>
          group.ranked.slice(0, 3).map(({ candidate, score }) => ({
            ...compactRecord(candidate),
            score,
            source: group.source
          }))
        )
      });
    }
  }

  const importedAt = new Date().toISOString();
  writeFileSync(OUTPUT_SQL, toSql(enriched, importedAt));
  writeFileSync(REVIEW_QUEUE_FILE, `${JSON.stringify(reviewQueue, null, 2)}\n`);

  const report = buildReport(enriched, reviewQueue, {
    totalGarminCatalog: allGarmin.length,
    processed: garminRecords.length,
    sourceCandidates: Object.fromEntries(
      sources.map((source) => [source.name, source.candidates.length])
    ),
    blockedHosts: [...blockedHosts],
    generatedAt: importedAt
  });
  writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`Wrote ${OUTPUT_SQL}`);
  console.log(`Wrote ${REVIEW_QUEUE_FILE}`);
}

async function loadGarminDetails(records) {
  const eligible = records.filter((record) =>
    record.catalogs.some((catalog) => GARMIN_DETAIL_CATALOGS.has(catalog))
  );
  const limiter = createRateLimiter(3);
  const detailMap = new Map();
  let completed = 0;

  await mapLimit(eligible, 5, async (record) => {
    const url = `${GARMIN_DETAIL_BASE}/${record.category}/${record.exerciseKey}.json`;
    try {
      const data = await fetchJsonCached(url, {
        limiter,
        ttlMs: 30 * DAY_MS,
        negativeTtlMs: 30 * DAY_MS
      });
      if (data) detailMap.set(record.id, normalizeGarminDetail(data));
    } catch (error) {
      console.warn(`Garmin detail skipped for ${record.id}: ${String(error)}`);
    }
    completed += 1;
    if (completed % 100 === 0 || completed === eligible.length) {
      console.log(`Garmin details: ${completed}/${eligible.length}`);
    }
  });

  return detailMap;
}

async function loadExistingDataset() {
  const data = await fetchJsonCached(EXISTING_DATASET_URL, { ttlMs: DAY_MS });
  return (data ?? []).map((exercise) => ({
    id: `exercise-dataset:${exercise.id}`,
    source: 'exercise-dataset',
    sourceId: exercise.id,
    linkedExerciseId: exercise.id,
    name: exercise.name,
    aliases: [exercise.id],
    primaryMuscles: [exercise.target, exercise.muscle_group].filter(Boolean),
    secondaryMuscles: exercise.secondary_muscles ?? [],
    equipment: [exercise.equipment].filter(Boolean),
    bodyPart: exercise.body_part ?? '',
    description: exercise.instructions?.en ?? '',
    instructionsEn: exercise.instructions?.en ?? '',
    instructionsZh: exercise.instructions?.zh ?? '',
    gifUrl: absoluteUrl(EXISTING_MEDIA_BASE, exercise.gif_url),
    imageUrl: absoluteUrl(EXISTING_MEDIA_BASE, exercise.image),
    videoUrl: null
  }));
}

async function loadFreeExerciseDb() {
  const data = await fetchJsonCached(FREE_EXERCISE_DB_URL, { ttlMs: DAY_MS });
  return (data ?? []).map((exercise) => ({
    id: `free-exercise-db:${exercise.id}`,
    source: 'free-exercise-db',
    sourceId: exercise.id,
    linkedExerciseId: null,
    name: exercise.name,
    aliases: [exercise.id],
    primaryMuscles: exercise.primaryMuscles ?? [],
    secondaryMuscles: exercise.secondaryMuscles ?? [],
    equipment: [exercise.equipment].filter(Boolean),
    bodyPart: exercise.category ?? '',
    description: (exercise.instructions ?? []).join('\n'),
    instructionsEn: (exercise.instructions ?? []).join('\n'),
    instructionsZh: '',
    gifUrl: null,
    imageUrl: exercise.images?.[0]
      ? absoluteUrl(FREE_EXERCISE_MEDIA_BASE, exercise.images[0])
      : null,
    videoUrl: null
  }));
}

async function loadFreeExerciseVideoDb() {
  const payload = await fetchJsonCached(FREE_EXERCISE_VIDEO_DB_URL, { ttlMs: DAY_MS });
  return (payload?.data ?? []).map((exercise) => ({
    id: `free-exercise-video-db:${exercise.id}`,
    source: 'free-exercise-video-db',
    sourceId: exercise.id,
    linkedExerciseId: null,
    name: exercise.name,
    aliases: exercise.aliases ?? [],
    primaryMuscles: [exercise.target, exercise.muscleGroup].filter(Boolean),
    secondaryMuscles: exercise.secondaryMuscles ?? [],
    equipment: [exercise.equipment].filter(Boolean),
    bodyPart: exercise.bodyPart ?? '',
    description: exercise.shortDescription || exercise.instructions || '',
    instructionsEn:
      exercise.steps?.length
        ? exercise.steps.join('\n')
        : exercise.instructions || exercise.shortDescription || '',
    instructionsZh: '',
    gifUrl: null,
    imageUrl: exercise.thumbnails?.male ?? exercise.thumbnails?.female ?? null,
    videoUrl: exercise.videos?.male ?? exercise.videos?.female ?? null,
    difficulty: exercise.difficulty ?? null
  }));
}

async function loadCuratedGuides() {
  const guides = readJsonFile(CURATED_GUIDES_FILE, []);
  return guides.map((guide) => ({
    id: `curated-web-guide:${guide.id}`,
    source: 'curated-web-guide',
    sourceId: guide.id,
    sourceUrl: guide.sourceUrl,
    linkedExerciseId: null,
    name: guide.name,
    aliases: [...(guide.aliases ?? []), ...exerciseAliases(guide.name)],
    primaryMuscles: guide.primaryMuscles ?? [],
    secondaryMuscles: guide.secondaryMuscles ?? [],
    equipment: guide.equipment ?? [],
    bodyPart: guide.bodyPart ?? '',
    description: guide.description ?? '',
    instructionsEn: guide.instructionsEn ?? guide.description ?? '',
    instructionsZh: '',
    gifUrl: null,
    imageUrl: guide.imageUrl ?? null,
    videoUrl: guide.videoUrl ?? null,
    difficulty: null
  }));
}

async function loadMuscleAndStrength() {
  const limiter = createRateLimiter(3);
  const indexPages = await Promise.all(
    MUSCLE_AND_STRENGTH_INDEXES.map((slug) =>
      fetchTextCached(`${MUSCLE_AND_STRENGTH_BASE}/exercises/${slug}`, {
        limiter,
        ttlMs: 30 * DAY_MS
      })
    )
  );
  const guideUrls = new Set();
  for (const html of indexPages.filter(Boolean)) {
    const $ = load(html);
    $('a[href^="/exercises/"]').each((_, element) => {
      const path = $(element).attr('href');
      if (path && !MUSCLE_AND_STRENGTH_INDEXES.some((slug) => path === `/exercises/${slug}`)) {
        guideUrls.add(new URL(path, MUSCLE_AND_STRENGTH_BASE).toString());
      }
    });
  }

  const guides = [];
  let completed = 0;
  await mapLimit([...guideUrls], 5, async (url) => {
    try {
      const html = await fetchTextCached(url, { limiter, ttlMs: 30 * DAY_MS });
      const guide = html ? parseMuscleAndStrengthGuide(html, url) : null;
      if (guide) guides.push(guide);
    } catch (error) {
      console.warn(`Muscle & Strength guide skipped for ${url}: ${String(error)}`);
    }
    completed += 1;
    if (completed % 100 === 0 || completed === guideUrls.size) {
      console.log(`Muscle & Strength guides: ${completed}/${guideUrls.size}`);
    }
  });
  return guides;
}

function parseMuscleAndStrengthGuide(html, url) {
  const $ = load(html);
  const heading = cleanText($('h1').first().text());
  const name = heading.replace(/\s*:?\s*Video Exercise Guide.*$/i, '').trim();
  const instructions = $('.field-name-body li')
    .map((_, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean);
  if (!name || !instructions.length) return null;

  const overview = cleanText(
    $('.field-name-field-exercise-overview .field-item').first().text()
  );
  const akaAliases = [...name.matchAll(/\(\s*(?:AKA|also known as)\s+([^)]+)\)/gi)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);
  const baseName = name.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const equipment = equipmentFromName(baseName);
  const unprefixedName = baseName.replace(
    /^(?:bodyweight|barbell|dumbbell|kettlebell|cable|machine|banded|resistance band)\s+/i,
    ''
  );
  const videoUrl = $('iframe[src*="youtube.com/embed/"]').first().attr('src') ?? null;
  const imageUrl = $('meta[property="og:image"]').attr('content') ?? null;

  return {
    id: `muscle-and-strength:${new URL(url).pathname}`,
    source: 'muscle-and-strength',
    sourceId: url,
    sourceUrl: url,
    linkedExerciseId: null,
    name: baseName || name,
    aliases: [
      name,
      ...akaAliases,
      ...(unprefixedName !== baseName ? [unprefixedName] : []),
      ...exerciseAliases(baseName || name),
      new URL(url).pathname.split('/').at(-1)?.replace(/\.html$/i, '').replaceAll('-', ' ')
    ].filter(Boolean),
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment,
    bodyPart: '',
    description: overview || instructions.join('\n'),
    instructionsEn: instructions.join('\n'),
    instructionsZh: '',
    gifUrl: null,
    imageUrl: absoluteUrl(MUSCLE_AND_STRENGTH_BASE, imageUrl),
    videoUrl: absoluteUrl(MUSCLE_AND_STRENGTH_BASE, videoUrl),
    difficulty: null
  };
}

async function loadOpenExerciseDb() {
  const data = await fetchJsonCached(OPEN_EXERCISE_DB_URL, { ttlMs: DAY_MS });
  return (data ?? []).map((exercise) => ({
    id: `open-exercise-db:${exercise.id}`,
    source: 'open-exercise-db',
    sourceId: exercise.id,
    linkedExerciseId: null,
    name: exercise.name.replaceAll('_', ' '),
    aliases: [exercise.id],
    primaryMuscles: [exercise.primary_muscle].filter(Boolean),
    secondaryMuscles: exercise.secondary_muscles ?? [],
    equipment: exercise.equipment ?? [],
    bodyPart: '',
    description: exercise.description ?? '',
    instructionsEn: (exercise.execution_tips ?? []).join('\n'),
    instructionsZh: '',
    gifUrl: null,
    imageUrl: null,
    videoUrl: null,
    difficulty: Number.isFinite(exercise.difficulty)
      ? `Level ${exercise.difficulty}/10`
      : null
  }));
}

async function loadWger() {
  const payload = await fetchJsonCached(WGER_URL, { ttlMs: DAY_MS });
  return (payload?.results ?? []).flatMap((exercise) => {
    const translation =
      exercise.translations?.find((item) => item.language === 2) ??
      exercise.translations?.find((item) => item.name);
    if (!translation?.name) return [];
    const image =
      exercise.images?.find((item) => item.is_main) ??
      exercise.images?.[0];
    const video = exercise.videos?.[0];
    return [{
      id: `wger:${exercise.uuid ?? exercise.id}`,
      source: 'wger',
      sourceId: exercise.uuid ?? String(exercise.id),
      linkedExerciseId: null,
      name: translation.name,
      aliases: translation.aliases?.map((item) => item.alias) ?? [],
      primaryMuscles: exercise.muscles?.map((item) => item.name_en || item.name) ?? [],
      secondaryMuscles:
        exercise.muscles_secondary?.map((item) => item.name_en || item.name) ?? [],
      equipment: exercise.equipment?.map((item) => item.name) ?? [],
      bodyPart: exercise.category?.name ?? '',
      description: translation.description_source ?? stripHtml(translation.description ?? ''),
      instructionsEn:
        translation.description_source ?? stripHtml(translation.description ?? ''),
      instructionsZh: '',
      gifUrl: null,
      imageUrl: image?.image ?? image?.thumbnails?.medium ?? null,
      videoUrl: video?.video ?? video?.url ?? null
    }];
  });
}

function buildSource(name, candidates) {
  const tokenIndex = new Map();
  for (const candidate of candidates) {
    const values = [candidate.name, ...(candidate.aliases ?? [])];
    for (const value of values) {
      for (const token of nameTokens(value)) {
        const bucket = tokenIndex.get(token) ?? [];
        bucket.push(candidate);
        tokenIndex.set(token, bucket);
      }
    }
  }
  return { name, candidates, tokenIndex };
}

function chooseExactMediaMatch(target, ranked) {
  if (GENERIC_EXERCISE_NAMES.has(target.name.toLowerCase())) return null;
  const compatible = ranked.filter(
    ({ candidate }) =>
      hasExactNameMatch(target, candidate) &&
      hasCompatibleEquipment(target, candidate) &&
      !MEDIA_MATCH_DENYLIST.has(`${target.id}|${candidate.id}`)
  );
  if (compatible.length !== 1) return null;
  return {
    ...compatible[0],
    score: Math.max(0.95, compatible[0].score),
    margin: compatible[0].score,
    method: 'exact-source'
  };
}

function candidatePool(target, source) {
  const matches = new Map();
  for (const value of [target.name, ...(target.aliases ?? [])]) {
    for (const token of nameTokens(value)) {
      for (const candidate of source.tokenIndex.get(token) ?? []) {
        matches.set(candidate.id, candidate);
      }
    }
  }
  return matches.size >= 3 ? [...matches.values()] : source.candidates;
}

function toTarget(garmin, detail) {
  return {
    id: garmin.id,
    name: garmin.name,
    aliases: [
      garmin.exerciseKey,
      `${garmin.category}_${garmin.exerciseKey}`,
      ...exerciseAliases(garmin.name)
    ],
    primaryMuscles: garmin.primaryMuscles,
    secondaryMuscles: garmin.secondaryMuscles,
    equipment: garmin.equipment,
    bodyPart: garmin.bodyPart,
    description: detail?.description ?? '',
    detail
  };
}

function normalizeGarminDetail(detail) {
  const video = detail.videos?.[0];
  return {
    description: detail.description ?? '',
    difficulty: detail.difficulty ?? null,
    imageUrl:
      absoluteUrl('https://connect.garmin.com', detail.heroImage) ??
      absoluteUrl('https://connectvideo.garmin.com', video?.thumbnail),
    videoUrl: absoluteUrl(
      'https://connectvideo.garmin.com',
      video?.url ?? video?.videoUrl ?? video?.video
    )
  };
}

function mergeEnrichment(target, selected, method) {
  const detail = target.detail ?? {};
  const candidate = selected?.candidate;
  const sources = [];
  if (target.detail) sources.push({ source: 'garmin-detail', id: target.id });
  if (candidate) {
    sources.push({
      source: candidate.source,
      id: candidate.sourceId,
      ...(candidate.sourceUrl ? { url: candidate.sourceUrl } : {})
    });
  }

  return {
    id: target.id,
    matchedExerciseId: candidate?.linkedExerciseId ?? null,
    enrichmentSources: sources,
    matchConfidence: selected?.score ?? null,
    matchMethod: method,
    description: detail.description || candidate?.description || null,
    instructionsEn: candidate?.instructionsEn || detail.description || null,
    instructionsZh: candidate?.instructionsZh || null,
    gifUrl: candidate?.gifUrl || null,
    imageUrl: detail.imageUrl || candidate?.imageUrl || null,
    videoUrl: detail.videoUrl || candidate?.videoUrl || null,
    difficulty: detail.difficulty || candidate?.difficulty || null
  };
}

function applyGeneratedDescription(result, generated) {
  if (
    !generated ||
    generated.status !== 'accepted' ||
    !generated.summary ||
    !Array.isArray(generated.steps) ||
    !generated.steps.length
  ) {
    return;
  }

  let used = false;
  if (!result.description) {
    result.description = generated.summary;
    used = true;
  }
  if (!result.instructionsEn) {
    result.instructionsEn = [
      ...generated.steps,
      generated.safetyNote ? `Safety: ${generated.safetyNote}` : null
    ]
      .filter(Boolean)
      .join('\n');
    used = true;
  }
  if (used && !result.enrichmentSources.some((item) => item.source === 'ai-generated')) {
    result.enrichmentSources.push({
      source: 'ai-generated',
      id: generated.modelVersion ?? 'codex-claude-v1',
      kind: 'ai-generated'
    });
  }
}

function compactRecord(record) {
  return {
    id: record.id,
    name: record.name,
    aliases: record.aliases ?? [],
    primaryMuscles: record.primaryMuscles ?? [],
    secondaryMuscles: record.secondaryMuscles ?? [],
    equipment: record.equipment ?? [],
    bodyPart: record.bodyPart ?? '',
    description: truncate(record.description ?? '', 400)
  };
}

function buildReport(enriched, reviewQueue, metadata) {
  const count = (predicate) => enriched.filter(predicate).length;
  const sourceCounts = {};
  for (const item of enriched) {
    for (const source of item.enrichmentSources) {
      sourceCounts[source.source] = (sourceCounts[source.source] ?? 0) + 1;
    }
  }
  return {
    ...metadata,
    enriched: count((item) => item.enrichmentSources.length > 0),
    matched: count((item) => item.matchConfidence != null),
    descriptions: count((item) => Boolean(item.description)),
    instructionsEnglish: count((item) => Boolean(item.instructionsEn)),
    instructionsChinese: count((item) => Boolean(item.instructionsZh)),
    gifs: count((item) => Boolean(item.gifUrl)),
    images: count((item) => Boolean(item.imageUrl)),
    videos: count((item) => Boolean(item.videoUrl)),
    reviewQueue: reviewQueue.length,
    sourceCounts
  };
}

function toSql(enriched, importedAt) {
  return `${enriched
    .map(
      (item) =>
        'UPDATE garmin_exercises SET ' +
        `matched_exercise_id=COALESCE(${sqlStr(item.matchedExerciseId)},matched_exercise_id),` +
        `enrichment_sources=${
          item.enrichmentSources.length
            ? sqlStr(JSON.stringify(item.enrichmentSources))
            : 'enrichment_sources'
        },` +
        `match_confidence=COALESCE(${sqlNumber(item.matchConfidence)},match_confidence),` +
        `description=COALESCE(${sqlStr(item.description)},description),` +
        `instructions_en=COALESCE(${sqlStr(item.instructionsEn)},instructions_en),` +
        `instructions_zh=COALESCE(${sqlStr(item.instructionsZh)},instructions_zh),` +
        `gif_url=COALESCE(${sqlStr(item.gifUrl)},gif_url),` +
        `image_url=COALESCE(${sqlStr(item.imageUrl)},image_url),` +
        `video_url=COALESCE(${sqlStr(item.videoUrl)},video_url),` +
        `difficulty=COALESCE(${sqlStr(item.difficulty)},difficulty),` +
        `enriched_at=${sqlStr(importedAt)} ` +
        `WHERE id=${sqlStr(item.id)};`
    )
    .join('\n')}\n`;
}

async function fetchJsonCached(
  url,
  {
    limiter = null,
    ttlMs = 14 * DAY_MS,
    negativeTtlMs = 30 * DAY_MS
  } = {}
) {
  const cacheFile = join(CACHE_DIR, `${createHash('sha256').update(url).digest('hex')}.json`);
  const cached = readJsonFile(cacheFile, null);
  const cacheAge = cached ? Date.now() - Date.parse(cached.fetchedAt) : Number.POSITIVE_INFINITY;
  const cacheTtl = cached?.status === 404 ? negativeTtlMs : ttlMs;
  if (cached && cacheAge < cacheTtl) return cached.status === 200 ? cached.data : null;
  if (args.offline) return cached?.status === 200 ? cached.data : null;

  const host = new URL(url).host;
  if (blockedHosts.has(host)) return null;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (limiter) await limiter();
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'user-agent': 'personal-radar exercise enrichment' },
        signal: AbortSignal.timeout(30_000)
      });
      if (response.status === 404) {
        writeJsonFile(cacheFile, { status: 404, fetchedAt: new Date().toISOString() });
        return null;
      }
      if (response.status === 403 || response.status === 429) {
        const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
        if (attempt === 3) {
          blockedHosts.add(host);
          throw new Error(`host paused after HTTP ${response.status}`);
        }
        await sleep(retryAfter ?? attempt * 5_000);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      writeJsonFile(cacheFile, { status: 200, fetchedAt: new Date().toISOString(), data });
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 1_000 + Math.floor(Math.random() * 500));
    }
  }
  throw lastError;
}

async function fetchTextCached(
  url,
  {
    limiter = null,
    ttlMs = 14 * DAY_MS,
    negativeTtlMs = 30 * DAY_MS
  } = {}
) {
  const cacheFile = join(
    CACHE_DIR,
    `${createHash('sha256').update(`text:${url}`).digest('hex')}.json`
  );
  const cached = readJsonFile(cacheFile, null);
  const cacheAge = cached ? Date.now() - Date.parse(cached.fetchedAt) : Number.POSITIVE_INFINITY;
  const cacheTtl = cached?.status === 404 ? negativeTtlMs : ttlMs;
  if (cached && cacheAge < cacheTtl) return cached.status === 200 ? cached.data : null;
  if (args.offline) return cached?.status === 200 ? cached.data : null;

  const host = new URL(url).host;
  if (blockedHosts.has(host)) return null;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (limiter) await limiter();
      const response = await fetch(url, {
        headers: { Accept: 'text/html', 'user-agent': 'personal-radar exercise enrichment' },
        signal: AbortSignal.timeout(30_000)
      });
      if (response.status === 404) {
        writeJsonFile(cacheFile, { status: 404, fetchedAt: new Date().toISOString() });
        return null;
      }
      if (response.status === 403 || response.status === 429) {
        const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
        if (attempt === 3) {
          blockedHosts.add(host);
          throw new Error(`host paused after HTTP ${response.status}`);
        }
        await sleep(retryAfter ?? attempt * 5_000);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.text();
      writeJsonFile(cacheFile, { status: 200, fetchedAt: new Date().toISOString(), data });
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 1_000 + Math.floor(Math.random() * 500));
    }
  }
  throw lastError;
}

function createRateLimiter(requestsPerSecond) {
  const interval = Math.ceil(1000 / requestsPerSecond);
  let nextStart = 0;
  return async () => {
    const now = Date.now();
    const scheduled = Math.max(now, nextStart);
    nextStart = scheduled + interval;
    const waitMs = scheduled - now + Math.floor(Math.random() * 100);
    if (waitMs > 0) await sleep(waitMs);
  };
}

async function mapLimit(items, concurrency, worker) {
  let index = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        const current = index;
        index += 1;
        await worker(items[current], current);
      }
    }
  );
  await Promise.all(runners);
}

function parseArgs(argv) {
  const limitIndex = argv.indexOf('--limit');
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : null;
  return {
    limit: Number.isFinite(limit) && limit > 0 ? limit : null,
    offline: argv.includes('--offline'),
    skipGarminDetails: argv.includes('--skip-garmin-details')
  };
}

function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function absoluteUrl(base, value) {
  if (!value) return null;
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

function stripHtml(value) {
  return String(value)
    .replace(/<li[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function equipmentFromName(value) {
  const normalized = value.toLowerCase();
  const equipment = [
    ['bodyweight', 'body weight'],
    ['barbell', 'barbell'],
    ['dumbbell', 'dumbbell'],
    ['kettlebell', 'kettlebell'],
    ['cable', 'cable'],
    ['machine', 'machine'],
    ['banded', 'band'],
    ['resistance band', 'band']
  ];
  return equipment
    .filter(([keyword]) => normalized.includes(keyword))
    .map(([, name]) => name);
}

function truncate(value, maxLength) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function readJsonFile(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

function sqlStr(value) {
  return value == null ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  return Number.isFinite(value) ? String(value) : 'NULL';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
