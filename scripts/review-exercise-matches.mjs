import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseFirstJsonObject } from './lib/cli-json.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const QUEUE_FILE = join(SCRIPT_DIR, 'exercise-review-queue.json');
const OVERRIDES_FILE = join(
  SCRIPT_DIR,
  '..',
  'data',
  'exercise-enrichment',
  'match-overrides.json'
);
const REVIEW_WORK_DIR = join(tmpdir(), 'personal-radar-exercise-review');
const CODEX_COMMAND =
  process.env.EXERCISE_CODEX_COMMAND ??
  'codex exec --sandbox read-only --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check -';
const CLAUDE_COMMAND =
  process.env.EXERCISE_CLAUDE_COMMAND ??
  'claude -p --tools "" --no-session-persistence --safe-mode --disable-slash-commands';
const BATCH_SIZE = 25;
const MINIMUM_MATCH_CONFIDENCE = 0.75;
const MINIMUM_REJECTION_CONFIDENCE = 0.9;
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000;

const args = parseArgs(process.argv.slice(2));
mkdirSync(REVIEW_WORK_DIR, { recursive: true });

async function main() {
  const queue = readJson(QUEUE_FILE, []);
  const overrides = readJson(OVERRIDES_FILE, {});
  const pending = queue.filter((item) =>
    !['accepted', 'rejected'].includes(overrides[item.garmin.id]?.status)
  );
  const batches = chunk(pending, BATCH_SIZE).slice(0, args.maxBatches ?? undefined);

  console.log(
    `${pending.length} unresolved matches, ${batches.length} review batches, ` +
      `${Object.keys(overrides).length} saved decisions`
  );
  if (args.dryRun || !batches.length) return;

  let accepted = 0;
  let rejected = 0;
  let disagreed = 0;
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const prompt = buildPrompt(batch);
    console.log(`Reviewing batch ${index + 1}/${batches.length}...`);

    const [codex, claude] = await Promise.all([
      runCli(CODEX_COMMAND, prompt),
      runCli(CLAUDE_COMMAND, prompt)
    ]);
    const codexDecisions = decisionMap(codex);
    const claudeDecisions = decisionMap(claude);

    for (const item of batch) {
      const garminId = item.garmin.id;
      const codexDecision = codexDecisions.get(garminId);
      const claudeDecision = claudeDecisions.get(garminId);
      const validCandidates = new Set(item.candidates.map((candidate) => candidate.id));
      const agreedCandidate =
        codexDecision?.candidateId &&
        codexDecision.candidateId === claudeDecision?.candidateId &&
        validCandidates.has(codexDecision.candidateId);
      const confidence = Math.min(
        Number(codexDecision?.confidence) || 0,
        Number(claudeDecision?.confidence) || 0
      );

      if (agreedCandidate && confidence >= MINIMUM_MATCH_CONFIDENCE) {
        overrides[garminId] = {
          status: 'accepted',
          candidateId: codexDecision.candidateId,
          confidence,
          reviewedBy: ['codex-cli', 'claude-cli'],
          reasons: [codexDecision.reason, claudeDecision.reason].filter(Boolean),
          updatedAt: new Date().toISOString()
        };
        accepted += 1;
        continue;
      }

      const agreedUnmatched =
        codexDecision?.candidateId == null &&
        claudeDecision?.candidateId == null &&
        confidence >= MINIMUM_REJECTION_CONFIDENCE;
      if (agreedUnmatched) {
        overrides[garminId] = {
          status: 'rejected',
          confidence,
          reviewedBy: ['codex-cli', 'claude-cli'],
          reasons: [codexDecision.reason, claudeDecision.reason].filter(Boolean),
          updatedAt: new Date().toISOString()
        };
        rejected += 1;
      } else {
        overrides[garminId] = {
          status: 'needs-manual',
          reviewedBy: ['codex-cli', 'claude-cli'],
          reviews: {
            codex: codexDecision ?? null,
            claude: claudeDecision ?? null
          },
          updatedAt: new Date().toISOString()
        };
        disagreed += 1;
      }
    }

    writeJson(OVERRIDES_FILE, overrides);
  }

  console.log(
    `Review complete: ${accepted} accepted, ${rejected} confirmed unmatched, ` +
      `${disagreed} unresolved`
  );
}

function buildPrompt(batch) {
  return `You are matching Garmin exercise identifiers to records from exercise databases.

For each Garmin record, choose at most one candidate from its provided candidate list.
Use the name, aliases, muscles, equipment, body part, description, and candidate score.
Do not invent IDs. Return null when the evidence is weak, candidates describe different
movements, or laterality/equipment/position differs materially.
Confidence means confidence in the decision itself. A null decision can have high confidence
when none of the supplied candidates describe the same movement.

Return only JSON with this shape:
{"decisions":[{"garminId":"...","candidateId":"candidate ID or null","confidence":0.0,"reason":"short reason"}]}

Records:
${JSON.stringify(batch)}`;
}

async function runCli(command, prompt) {
  const output = await new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-lc', command], {
      cwd: REVIEW_WORK_DIR,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Command timed out: ${command}`));
    }, COMMAND_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
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
  if (!Array.isArray(parsed.decisions)) throw new Error('CLI JSON is missing decisions');
  return parsed.decisions;
}

function decisionMap(decisions) {
  return new Map(
    decisions
      .filter((decision) => typeof decision?.garminId === 'string')
      .map((decision) => [
        decision.garminId,
        {
          candidateId:
            typeof decision.candidateId === 'string' ? decision.candidateId : null,
          confidence: Number(decision.confidence) || 0,
          reason: typeof decision.reason === 'string' ? decision.reason : ''
        }
      ])
  );
}

function parseArgs(argv) {
  const batchesIndex = argv.indexOf('--max-batches');
  const maxBatches = batchesIndex >= 0 ? Number(argv[batchesIndex + 1]) : null;
  return {
    dryRun: argv.includes('--dry-run'),
    maxBatches: Number.isFinite(maxBatches) && maxBatches > 0 ? maxBatches : null
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
