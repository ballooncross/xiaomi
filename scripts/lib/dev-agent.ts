import { execFileSync, execSync } from 'node:child_process';
import { resolve } from 'node:path';
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

  const originalBranch = git('rev-parse --abbrev-ref HEAD');
  const restoreBranch = () => { try { git(`checkout ${originalBranch}`); } catch { /* best effort */ } };

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

    // Safe to auto-implement: invoke codex/claude to make the change
    log('  Assessed as safe to auto-implement. Running codex...');
    const branch = `auto/${request.id.slice(0, 8)}`;

    git('fetch origin');
    git('checkout -B', branch, 'origin/main');

    const cliResult = runImplementation(request.text);
    if (!cliResult.success) {
      restoreBranch();
      await updateRequest(request.id, { status: 'rejected', response: `Implementation failed: ${cliResult.error}` });
      return;
    }

    // Check how many files changed
    const diffStat = git('diff --stat HEAD');
    const changedFiles = diffStat.split('\n').filter((line) => line.includes('|')).length;
    if (changedFiles === 0) {
      restoreBranch();
      await updateRequest(request.id, { status: 'completed', response: 'No changes needed (codex made no modifications).' });
      return;
    }

    if (changedFiles > MAX_CHANGED_FILES) {
      restoreBranch();
      await updateRequest(request.id, {
        status: 'replied',
        response: `Change touches ${changedFiles} files (limit: ${MAX_CHANGED_FILES}). Too large for auto-deploy. Review the branch "${branch}" manually.`
      });
      return;
    }

    // Verify it builds
    try {
      execSync('npx tsc --noEmit', { cwd: projectRoot, timeout: 60000, stdio: 'pipe' });
      execSync('npm run build', { cwd: projectRoot, timeout: 120000, stdio: 'pipe' });
    } catch (buildError) {
      restoreBranch();
      await updateRequest(request.id, {
        status: 'rejected',
        response: `Build failed after implementation: ${String(buildError).slice(0, 200)}`
      });
      return;
    }

    // Commit and push directly to origin/main (avoids checking out main locally,
    // which fails when another worktree already has main checked out)
    git('add -A');
    git(`commit -m "auto: ${request.text.slice(0, 60).replace(/"/g, "'")}"`);
    git(`push origin ${branch}:main`);
    restoreBranch();
    git(`branch -D ${branch}`);

    log('  Deploying...');
    execSync('npm run deploy', { cwd: projectRoot, timeout: 180000, stdio: 'pipe' });
    execSync('npm run deploy:cron', { cwd: projectRoot, timeout: 120000, stdio: 'pipe' });

    await updateRequest(request.id, {
      status: 'completed',
      branch,
      response: `Implemented, merged to main, and deployed. ${changedFiles} file(s) changed.`
    });
    log(`  Request completed and deployed.`);
  } catch (error) {
    log(`  Request failed: ${error}`);
    restoreBranch();
    await updateRequest(request.id, {
      status: 'rejected',
      response: `Error: ${String(error).slice(0, 300)}`
    });
  }
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

function runImplementation(requestText: string): { success: boolean; error?: string } {
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
    const args = cli === 'codex'
      ? ['exec', '--skip-git-repo-check', '-c', 'model_reasoning_effort=medium', '--writable-root', projectRoot, prompt]
      : ['-p', '--allowedTools', 'Read,Edit,Bash', prompt];

    execFileSync(cli, args, {
      cwd: projectRoot,
      timeout: 300000,
      stdio: 'pipe',
      maxBuffer: 10 * 1024 * 1024
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error).slice(0, 300) };
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
  const fullArgs = args.join(' ');
  return execSync(`git ${fullArgs}`, { cwd: projectRoot, timeout: 30000, stdio: 'pipe' }).toString().trim();
}
