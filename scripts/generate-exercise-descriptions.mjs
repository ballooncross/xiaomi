import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFirstJsonObject } from './lib/cli-json.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const QUEUE_FILE = join(SCRIPT_DIR, 'exercise-review-queue.json');
const OUTPUT_FILE = join(
  SCRIPT_DIR,
  '..',
  'data',
  'exercise-enrichment',
  'generated-descriptions.json'
);
const WORK_DIR = join(tmpdir(), 'personal-radar-exercise-description-generation');
const CODEX_COMMAND =
  process.env.EXERCISE_CODEX_COMMAND ??
  'codex exec --sandbox read-only --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check -';
const CLAUDE_COMMAND =
  process.env.EXERCISE_CLAUDE_COMMAND ??
  'claude -p --tools "" --no-session-persistence --safe-mode --disable-slash-commands';
const BATCH_SIZE = 20;
const MINIMUM_CONFIDENCE = 0.8;
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000;

const args = parseArgs(process.argv.slice(2));
mkdirSync(WORK_DIR, { recursive: true });

async function main() {
  const queue = readJson(QUEUE_FILE, []);
  const saved = readJson(OUTPUT_FILE, {});
  const filter = args.filter?.toLowerCase();
  const pending = queue.filter((item) => {
    if (saved[item.garmin.id]) return false;
    if (!filter) return true;
    return [item.garmin.id, item.garmin.name].some((value) =>
      String(value).toLowerCase().includes(filter)
    );
  });
  const batches = chunk(pending, BATCH_SIZE).slice(0, args.maxBatches ?? undefined);

  console.log(
    `${pending.length} descriptions pending, ${batches.length} generation batches, ` +
      `${Object.keys(saved).length} saved results`
  );
  if (args.dryRun || !batches.length) return;

  let accepted = 0;
  let unresolved = 0;
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const prompt = buildPrompt(batch.map((item) => item.garmin));
    console.log(`Generating batch ${index + 1}/${batches.length}...`);
    const [codex, claude] = await Promise.all([
      runCli(CODEX_COMMAND, prompt),
      runCli(CLAUDE_COMMAND, prompt)
    ]);
    const codexResults = generationMap(codex);
    const claudeResults = generationMap(claude);

    for (const item of batch) {
      const garminId = item.garmin.id;
      const codexResult = codexResults.get(garminId);
      const claudeResult = claudeResults.get(garminId);
      const confidence = Math.min(
        Number(codexResult?.confidence) || 0,
        Number(claudeResult?.confidence) || 0
      );
      const acceptedResult =
        codexResult?.supported &&
        claudeResult?.supported &&
        confidence >= MINIMUM_CONFIDENCE &&
        codexResult.summary &&
        codexResult.steps.length >= 2;

      if (acceptedResult) {
        saved[garminId] = {
          status: 'accepted',
          summary: codexResult.summary,
          steps: codexResult.steps,
          safetyNote: codexResult.safetyNote,
          confidence,
          modelVersion: 'codex-claude-v1',
          generatedBy: 'codex-cli',
          reviewedBy: 'claude-cli',
          updatedAt: new Date().toISOString()
        };
        accepted += 1;
      } else {
        saved[garminId] = {
          status: 'needs-manual',
          reviews: {
            codex: codexResult ?? null,
            claude: claudeResult ?? null
          },
          updatedAt: new Date().toISOString()
        };
        unresolved += 1;
      }
    }
    writeJson(OUTPUT_FILE, saved);
  }

  console.log(`Description generation complete: ${accepted} accepted, ${unresolved} unresolved`);
}

function buildPrompt(records) {
  return `You write safe, concise exercise instructions for a personal workout reference.

For each Garmin exercise record, decide whether its name and metadata identify a known movement
unambiguously. If supported, provide a one-sentence summary, 3 to 6 ordered execution steps, one
short safety note, and your confidence. Preserve laterality, equipment, body position, direction,
and wheelchair or adaptive modifiers. Do not add equipment that is absent. Mark supported false
for unclear proprietary names or when you cannot distinguish the movement from another exercise.

Return only JSON with this shape:
{"generations":[{"garminId":"...","supported":true,"confidence":0.0,"summary":"...","steps":["..."],"safetyNote":"..."}]}

Records:
${JSON.stringify(records)}`;
}

async function runCli(command, prompt) {
  const output = await new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-lc', command], {
      cwd: WORK_DIR,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Command timed out: ${command}`));
    }, COMMAND_TIMEOUT_MS);

    child.stdout.on('data', (data) => {
      stdout += data;
    });
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited ${code}: ${stderr.slice(-1000)}`));
    });
    child.stdin.end(prompt);
  });
  return extractJson(output);
}

function extractJson(output) {
  const parsed = parseFirstJsonObject(output);
  if (!Array.isArray(parsed.generations)) {
    throw new Error('CLI JSON is missing generations');
  }
  return parsed.generations;
}

function generationMap(generations) {
  return new Map(
    generations
      .filter((item) => typeof item?.garminId === 'string')
      .map((item) => [
        item.garminId,
        {
          supported: item.supported === true,
          confidence: Number(item.confidence) || 0,
          summary: typeof item.summary === 'string' ? item.summary.trim() : '',
          steps: Array.isArray(item.steps)
            ? item.steps.filter((step) => typeof step === 'string' && step.trim())
            : [],
          safetyNote: typeof item.safetyNote === 'string' ? item.safetyNote.trim() : ''
        }
      ])
  );
}

function parseArgs(argv) {
  const batchesIndex = argv.indexOf('--max-batches');
  const maxBatches = batchesIndex >= 0 ? Number(argv[batchesIndex + 1]) : null;
  const filterIndex = argv.indexOf('--filter');
  const filter = filterIndex >= 0 ? argv[filterIndex + 1] : null;
  return {
    dryRun: argv.includes('--dry-run'),
    maxBatches: Number.isFinite(maxBatches) && maxBatches > 0 ? maxBatches : null,
    filter: filter || null
  };
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
