/**
 * Imports Garmin Connect exercise identifiers into a D1 seed SQL file.
 *
 * Sources:
 *   - Strength, cardio, and HIIT exercise catalog
 *   - Yoga, Pilates, and Mobility catalogs
 *   - Equipment and muscle mappings
 *   - English exercise display-name translations
 *
 * Usage:
 *   node scripts/import-garmin-exercises.mjs
 *   wrangler d1 execute personal-radar --remote --file scripts/seed-garmin-exercises.sql
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = 'https://connect.garmin.com';
const CATALOGS = [
  {
    name: 'strength',
    url: `${BASE_URL}/web-data/exercises/Exercises.json`,
    surfaces: ['strength', 'cardio', 'hiit']
  },
  {
    name: 'yoga',
    url: `${BASE_URL}/web-data/exercises/Yoga.json`,
    surfaces: ['yoga']
  },
  {
    name: 'pilates',
    url: `${BASE_URL}/web-data/exercises/Pilates.json`,
    surfaces: ['pilates']
  },
  {
    name: 'mobility',
    url: `${BASE_URL}/web-data/exercises/Mobility.json`,
    surfaces: ['mobility']
  }
];
const EQUIPMENT_URL = `${BASE_URL}/web-data/exercises/exerciseToEquipments.json`;
const TRANSLATIONS_URL =
  `${BASE_URL}/web-translations/exercise_types/exercise_types.properties`;
const outFile = join(
  dirname(fileURLToPath(import.meta.url)),
  'seed-garmin-exercises.sql'
);

const BODY_PART_BY_MUSCLE = {
  ABS: 'waist',
  ABDUCTORS: 'upper legs',
  ADDUCTORS: 'upper legs',
  BICEPS: 'upper arms',
  CALVES: 'lower legs',
  CHEST: 'chest',
  FOREARMS: 'lower arms',
  GLUTES: 'upper legs',
  HAMSTRINGS: 'upper legs',
  HIPS: 'upper legs',
  LATS: 'back',
  LOWER_BACK: 'back',
  NECK: 'neck',
  OBLIQUES: 'waist',
  QUADS: 'upper legs',
  SHOULDERS: 'shoulders',
  TRAPS: 'back',
  TRICEPS: 'upper arms',
  UPPER_BACK: 'back'
};

async function fetchText(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'personal-radar exercise importer' },
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError}`);
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

function decodePropertyValue(value) {
  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\([\\:= ])/g, '$1');
}

function parseProperties(text) {
  const properties = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const separator = line.search(/(?<!\\)[=:]/);
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    properties.set(key, decodePropertyValue(value));
  }
  return properties;
}

function humanize(value) {
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function entryId(category, exerciseKey) {
  return `garmin:${category}:${exerciseKey}`;
}

function mergeEntry(entries, input) {
  const id = entryId(input.category, input.exerciseKey);
  const existing = entries.get(id);
  if (!existing) {
    entries.set(id, {
      id,
      category: input.category,
      exerciseKey: input.exerciseKey,
      primaryMuscles: unique(input.primaryMuscles ?? []),
      secondaryMuscles: unique(input.secondaryMuscles ?? []),
      equipment: unique(input.equipment ?? []),
      catalogs: unique(input.catalogs ?? [])
    });
    return;
  }

  existing.primaryMuscles = unique([
    ...existing.primaryMuscles,
    ...(input.primaryMuscles ?? [])
  ]);
  existing.secondaryMuscles = unique([
    ...existing.secondaryMuscles,
    ...(input.secondaryMuscles ?? [])
  ]);
  existing.equipment = unique([...existing.equipment, ...(input.equipment ?? [])]);
  existing.catalogs = unique([...existing.catalogs, ...(input.catalogs ?? [])]);
}

function bodyPartFor(entry) {
  for (const muscle of entry.primaryMuscles) {
    const bodyPart = BODY_PART_BY_MUSCLE[muscle];
    if (bodyPart) return bodyPart;
  }
  if (entry.category === 'CARDIO' || entry.category.startsWith('RUN')) return 'cardio';
  return 'other';
}

function sqlStr(value) {
  return value === undefined || value === null
    ? 'NULL'
    : `'${String(value).replace(/'/g, "''")}'`;
}

function toSql(entries, importedAt) {
  const lines = ['DELETE FROM garmin_exercises;'];
  for (const entry of entries) {
    const columns = [
      sqlStr(entry.id),
      sqlStr(entry.category),
      sqlStr(entry.exerciseKey),
      sqlStr(entry.name),
      sqlStr(entry.bodyPart),
      sqlStr(JSON.stringify(entry.primaryMuscles)),
      sqlStr(JSON.stringify(entry.secondaryMuscles)),
      sqlStr(JSON.stringify(entry.equipment)),
      sqlStr(JSON.stringify(entry.catalogs)),
      'NULL',
      'NULL',
      sqlStr(importedAt)
    ];
    lines.push(
      'INSERT OR REPLACE INTO garmin_exercises ' +
        '(id,category,exercise_key,name,body_part,primary_muscles,secondary_muscles,' +
        'equipment,catalogs,description,image_url,source_updated_at) ' +
        `VALUES (${columns.join(',')});`
    );
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const entries = new Map();

  for (const catalog of CATALOGS) {
    console.log(`Fetching ${catalog.name} catalog...`);
    const data = await fetchJson(catalog.url);
    for (const [category, categoryData] of Object.entries(data.categories ?? {})) {
      for (const [exerciseKey, exercise] of Object.entries(categoryData.exercises ?? {})) {
        mergeEntry(entries, {
          category,
          exerciseKey,
          primaryMuscles: exercise.primaryMuscles,
          secondaryMuscles: exercise.secondaryMuscles,
          catalogs: catalog.surfaces
        });
      }
    }
  }

  console.log('Fetching equipment mappings...');
  const equipmentData = await fetchJson(EQUIPMENT_URL);
  for (const categoryData of equipmentData) {
    for (const exercise of categoryData.exercisesInCategory ?? []) {
      mergeEntry(entries, {
        category: categoryData.exerciseCategoryKey,
        exerciseKey: exercise.exerciseKey,
        primaryMuscles: exercise.primaryMuscles,
        secondaryMuscles: exercise.secondaryMuscles,
        equipment: exercise.equipmentKeys,
        catalogs: ['equipment']
      });
    }
  }

  console.log('Fetching English display names...');
  const translations = parseProperties(await fetchText(TRANSLATIONS_URL));
  const knownCategories = unique([...entries.values()].map((entry) => entry.category)).sort(
    (a, b) => b.length - a.length
  );

  for (const [key] of translations) {
    if (!/^[A-Z0-9_]+$/.test(key)) continue;
    const category = knownCategories.find((candidate) => key.startsWith(`${candidate}_`));
    if (!category) continue;
    const exerciseKey = key.slice(category.length + 1);
    if (!exerciseKey) continue;
    mergeEntry(entries, { category, exerciseKey, catalogs: ['translations'] });
  }

  const importedAt = new Date().toISOString();
  const completed = [...entries.values()]
    .map((entry) => ({
      ...entry,
      name:
        translations.get(`${entry.category}_${entry.exerciseKey}`) ??
        translations.get(`exercise_type_${entry.exerciseKey}`) ??
        humanize(entry.exerciseKey),
      bodyPart: bodyPartFor(entry)
    }))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        a.category.localeCompare(b.category) ||
        a.exerciseKey.localeCompare(b.exerciseKey)
    );

  writeFileSync(outFile, toSql(completed, importedAt));
  console.log(`Wrote ${completed.length} Garmin exercises to ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
