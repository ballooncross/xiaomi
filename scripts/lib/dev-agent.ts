import { execFileSync, execSync } from 'node:child_process';
import { existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { config, radarHeaders } from './config';
import { log } from './utils';

const projectRoot = resolve(config.statePath, '..', '..');
const MAX_CHANGED_FILES = 8;

type DevRequest = {
  id: string;
  text: string;
  status: string;
  response: string;
  branch?: string;
  createdAt?: string;
};

export async function processDevRequests(): Promise<void> {
  const requests = await fetchPendingRequests();
  if (requests.length === 0) return;
  log(`Dev requests: ${requests.length} pending`);

  for (const request of requests) {
    await handleRequest(request);
  }
}

async function fetchPendingRequests(): Promise<DevRequest[]> {
  try {
    const response = await fetch(
      `${config.radarUrl}/api/agent/dev-requests?status=pending`,
      { headers: radarHeaders }
    );
    if (!response.ok) return [];
    const data = (await response.json()) as { requests?: DevRequest[] };
    return data.requests ?? [];
  } catch {
    return [];
  }
}

async function updateRequest(id: string, updates: { status: string; response?: string; branch?: string }): Promise<void> {
  try {
    await fetch(`${config.radarUrl}/api/agent/dev-requests`, {
      method: 'PATCH',
      headers: radarHeaders,
      body: JSON.stringify({ id, ...updates })
    });
  } catch (error) {
    log(`Failed to update request ${id}: ${error}`);
  }
}

async function handleRequest(request: DevRequest): Promise<void> {
  log(`Processing dev request: "${request.text.slice(0, 60)}..."`);
  await updateRequest(request.id, { status: 'in_progress' });

  try {
    // First: ask the AI to assess whether this is safe to auto-implement
    const assessment = await assessRequest(request.text);
    if (!assessment) {
      await updateRequest(request.id, { status: 'rejected', response: 'AI backend unavailable or timed out.' });
      return;
    }

    if (assessment.risk === 'major') {
      log(`  Request assessed as major/risky: ${assessment.reason}`);
      await updateRequest(request.id, { status: 'replied', response: assessment.reason });
      return;
    }

    // Safe to auto-implement. All work happens in a throwaway worktree so the
    // agent's own checkout is never mutated and we never touch `main` locally
    // (which broke when another worktree held main).
    log('  Assessed as safe to auto-implement. Running codex in isolated worktree...');
    const result = await implementInWorktree(request);
    await updateRequest(request.id, result);
    log(`  Request ${result.status}.`);
  } catch (error) {
    log(`  Request failed: ${error}`);
    await updateRequest(request.id, {
      status: 'rejected',
      response: `Error: ${String(error).slice(0, 300)}`
    });
  }
}

type RequestOutcome = { status: string; response: string; branch?: string };

async function implementInWorktree(request: DevRequest): Promise<RequestOutcome> {
  const branch = `auto/${request.id.slice(0, 8)}`;
  const worktreeDir = join(tmpdir(), `radar-dev-${request.id.slice(0, 8)}`);

  git('fetch origin');
  cleanupWorktree(worktreeDir, branch); // clear any stale worktree/branch from a prior run
  git('worktree add --force', worktreeDir, '-b', branch, 'origin/main');

  try {
    // Reuse the main checkout's dependencies so tsc/build/deploy work without a
    // fresh `npm ci` in the worktree.
    linkNodeModules(worktreeDir);

    const cliResult = runImplementation(request.text, worktreeDir);
    if (!cliResult.success) {
      return { status: 'rejected', response: `Implementation failed: ${cliResult.error}` };
    }

    const diffStat = gitc(worktreeDir, 'diff --stat HEAD');
    const changedFiles = diffStat.split('\n').filter((line) => line.includes('|')).length;
    if (changedFiles === 0) {
      return { status: 'completed', response: 'No changes needed (codex made no modifications).' };
    }
    if (changedFiles > MAX_CHANGED_FILES) {
      return {
        status: 'replied',
        response: `Change touches ${changedFiles} files (limit: ${MAX_CHANGED_FILES}). Too large for auto-deploy — please split into smaller requests.`
      };
    }

    try {
      // `npm run check` runs `svelte-kit sync` first, which generates the
      // ./$types the app imports — a fresh worktree has no .svelte-kit yet, so
      // a bare `tsc --noEmit` would always fail here.
      execSync('npm run check', { cwd: worktreeDir, timeout: 120000, stdio: 'pipe' });
      execSync('npm run build', { cwd: worktreeDir, timeout: 120000, stdio: 'pipe' });
    } catch (buildError) {
      const err = buildError as { stdout?: Buffer; stderr?: Buffer };
      const detail = (err.stdout?.toString() || '') + (err.stderr?.toString() || '') || String(buildError);
      return { status: 'rejected', response: `Build failed after implementation: ${detail.slice(-300)}` };
    }

    gitc(worktreeDir, 'add -A');
    gitc(worktreeDir, `commit -m "auto: ${request.text.slice(0, 60).replace(/"/g, "'")}"`);
    gitc(worktreeDir, `push origin ${branch}:main`);

    log('  Deploying...');
    execSync('npm run deploy', { cwd: worktreeDir, timeout: 180000, stdio: 'pipe' });
    execSync('npm run deploy:cron', { cwd: worktreeDir, timeout: 120000, stdio: 'pipe' });

    return {
      status: 'completed',
      branch,
      response: `Implemented, merged to main, and deployed. ${changedFiles} file(s) changed.`
    };
  } finally {
    cleanupWorktree(worktreeDir, branch);
  }
}

function linkNodeModules(worktreeDir: string): void {
  const link = join(worktreeDir, 'node_modules');
  try {
    if (!existsSync(link)) symlinkSync(join(projectRoot, 'node_modules'), link, 'dir');
  } catch (error) {
    log(`  Could not link node_modules into worktree: ${error}`);
  }
}

function cleanupWorktree(worktreeDir: string, branch: string): void {
  // Drop the symlink first so nothing recurses into the real node_modules.
  try { rmSync(join(worktreeDir, 'node_modules'), { force: true }); } catch { /* best effort */ }
  try { git('worktree remove --force', worktreeDir); } catch { /* best effort */ }
  try { if (existsSync(worktreeDir)) rmSync(worktreeDir, { recursive: true, force: true }); } catch { /* best effort */ }
  try { git('worktree prune'); } catch { /* best effort */ }
  try { git(`branch -D ${branch}`); } catch { /* best effort */ }
}

type Assessment = { risk: 'minor' | 'major'; reason: string };

async function assessRequest(text: string): Promise<Assessment | null> {
  const prompt = `You are assessing a feature/bug request for a SvelteKit + Cloudflare D1 personal radar app.

Request: "${text}"

Assess the risk level:
- "minor": CSS fixes, small UI tweaks, adding a field, fixing a typo, small logic change. Safe to auto-implement.
- "major": database schema changes, new API endpoints, architectural changes, security-sensitive changes, anything touching auth. NOT safe to auto-implement.

Respond with ONLY this JSON: {"risk": "minor" or "major", "reason": "one sentence explanation"}`;

  const result = await callCli(prompt);
  if (!result) return null;
  try {
    const jsonText = result.match(/\{[^}]+\}/)?.[0];
    if (!jsonText) return null;
    return JSON.parse(jsonText) as Assessment;
  } catch {
    return null;
  }
}

function runImplementation(requestText: string, cwd: string): { success: boolean; error?: string } {
  const prompt = `You are implementing a change in a SvelteKit project at the current directory.

IMPORTANT RULES:
- Read the CLAUDE.md file first for project rules.
- Make minimal, focused changes. Only modify what the request asks for.
- Run \`npx tsc --noEmit\` after your changes to verify they compile.
- Do NOT create new files unless absolutely necessary.
- Do NOT modify database schemas or migrations.
- Do NOT touch auth or security code.

REQUEST: ${requestText}

Implement this change now.`;

  try {
    const cli = config.aiBackend === 'claude-code' ? 'claude' : 'codex';
    // codex >= 0.100 replaced `--writable-root <dir>` with a sandbox policy;
    // `workspace-write` lets it edit files under the working root (the worktree).
    const args = cli === 'codex'
      ? ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-c', 'model_reasoning_effort=medium', '-C', cwd, prompt]
      // Headless Claude Code: bypass interactive approvals so it can actually
      // write files + run commands. Safe here because it runs in a throwaway
      // worktree and every change still passes the tsc/build gate before deploy.
      : ['-p', '--dangerously-skip-permissions', prompt];

    execFileSync(cli, args, {
      cwd,
      timeout: 300000,
      stdio: 'pipe',
      maxBuffer: 10 * 1024 * 1024
    });
    return { success: true };
  } catch (error) {
    const err = error as { stderr?: Buffer; stdout?: Buffer; message?: string };
    const detail = err.stderr?.toString().trim() || err.stdout?.toString().trim() || err.message || String(error);
    return { success: false, error: detail.slice(0, 400) };
  }
}

function callCli(prompt: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const cli = config.aiBackend === 'claude-code' ? 'claude' : 'codex';
      const args = cli === 'codex'
        ? ['exec', '--skip-git-repo-check', '-c', 'model_reasoning_effort=low', prompt]
        : ['-p', prompt];

      const result = execFileSync(cli, args, {
        cwd: projectRoot,
        timeout: 120000,
        stdio: 'pipe',
        maxBuffer: 10 * 1024 * 1024
      });
      resolve(result.toString());
    } catch {
      resolve(null);
    }
  });
}

function git(...args: string[]): string {
  return execSync(`git ${args.join(' ')}`, { cwd: projectRoot, timeout: 60000, stdio: 'pipe' }).toString().trim();
}

/** git, but run inside a specific worktree directory. */
function gitc(dir: string, ...args: string[]): string {
  return execSync(`git ${args.join(' ')}`, { cwd: dir, timeout: 60000, stdio: 'pipe' }).toString().trim();
}
