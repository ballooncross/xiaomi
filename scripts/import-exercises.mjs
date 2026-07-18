/**
 * One-off importer: pulls the exercises dataset from
 * github.com/hasaneyldrm/exercises-dataset and emits a D1 seed SQL file
 * (scripts/seed-exercises.sql). GIF/thumbnail media is hot-linked from the
 * jsDelivr CDN rather than copied into the database.
 *
 * Usage:
 *   node scripts/import-exercises.mjs
 *   wrangler d1 execute personal-radar --remote --file scripts/seed-exercises.sql
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'hasaneyldrm/exercises-dataset';
const BRANCH = 'main';
const SRC = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/data/exercises.json`;
const CDN = `https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}/`;

const outFile = join(dirname(fileURLToPath(import.meta.url)), 'seed-exercises.sql');

const sqlStr = (value) =>
  value === undefined || value === null ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`;

async function main() {
  console.log(`Fetching ${SRC} ...`);
  const res = await fetch(SRC);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const data = await res.json();
  console.log(`Got ${data.length} exercises. Generating SQL...`);

  const lines = ['DELETE FROM exercises;'];
  for (const ex of data) {
    const cols = [
      sqlStr(ex.id),
      sqlStr(ex.name),
      sqlStr(ex.body_part),
      sqlStr(ex.equipment),
      sqlStr(ex.target),
      sqlStr(JSON.stringify(ex.secondary_muscles ?? [])),
      sqlStr(ex.instructions?.en ?? ''),
      sqlStr(ex.instructions?.zh ?? ''),
      sqlStr(CDN + ex.gif_url),
      sqlStr(ex.image ? CDN + ex.image : null)
    ];
    lines.push(
      `INSERT OR REPLACE INTO exercises (id,name,body_part,equipment,target,secondary_muscles,instructions_en,instructions_zh,gif_url,image_url) VALUES (${cols.join(',')});`
    );
  }

  writeFileSync(outFile, lines.join('\n') + '\n');
  console.log(`Wrote ${lines.length - 1} rows to ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
