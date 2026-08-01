import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { config, radarHeaders } from './config';
import {
  changedFilesFromGit,
  formatOutcomeResponse,
  parseAgentOutcome,
  RESULT_MARKER,
  validateOutcome,
  type AgentImplementationOutcome
} from './dev-agent-core';
import { log } from './utils';

const projectRoot = resolve(config.statePath, '..', '..');
const RUNNER_ID = 'personal-radar-local';
const LEASE_MS = 20 * 60_000;
const IMPLEMENTATION_TIMEOUT_MS = 15 * 60_000;
const DEPLOYMENT_TIMEOUT_MS = 12 * 60_000;
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as { version?: string };
const RUNNER_VERSION = packageJson.version ?? 'unknown';

type DevRequest = {
  id: string;
  text: string;
  status: string;
  response: string;
  parentRequestId?: string;
  parent?: Pick<DevRequest, 'id' | 'text' | 'status' | 'response'>;
  createdAt?: string;
};

type PriorRun = {
  attempt: number;
  status: string;
  summary: string;
  errorCategory: string;
};

type RequestOutcome = {
  status: 'completed' | 'rejected' | 'replied';
  runStatus: 'succeeded' | 'failed' | 'needs_input';
  phase: 'completed' | 'failed' | 'waiting_for_input';
  response: string;
  branch?: string;
  resultSha?: string;
  errorCategory?: string;
};

type RunContext = {
  request: DevRequest;
  runId: string;
  sequence: number;
};

export async function processDevRequests(): Promise<void> {
  await sendHeartbeat('polling', 'Checking for pending development requests.');
  const { requests, runs } = await fetchPendingRequests();
  if (requests.length === 0) {
    await sendHeartbeat('idle', 'No pending development requests.');
    return;
  }
  log(`Dev requests: ${requests.length} pending`);

  for (const request of requests) {
    const priorRuns = runs.filter((run) => run.requestId === request.id);
    await handleRequest(request, priorRuns);
  }
  await sendHeartbeat('idle', 'Development request processing finished.');
}

async function fetchPendingRequests(): Promise<{ requests: DevRequest[]; runs: Array<PriorRun & { requestId: string }> }> {
  const response = await fetch(`${config.radarUrl}/api/agent/dev-requests?status=pending`, {
    headers: radarHeaders,
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Pending request fetch failed with HTTP ${response.status}`);
  const data = (await response.json()) as {
    requests?: DevRequest[];
    runs?: Array<PriorRun & { requestId: string }>;
  };
  return { requests: data.requests ?? [], runs: data.runs ?? [] };
}

async function handleRequest(request: DevRequest, priorRuns: PriorRun[]): Promise<void> {
  log(`Processing dev request ${request.id}: "${request.text.slice(0, 80)}"`);
  git(projectRoot, ['fetch', 'origin', 'main']);
  const baseSha = git(projectRoot, ['rev-parse', 'origin/main']);
  const runId = crypto.randomUUID();
  const claimed = await postAgentAction({
    action: 'claim',
    requestId: request.id,
    runId,
    runnerId: RUNNER_ID,
    runnerVersion: RUNNER_VERSION,
    backend: config.aiBackend,
    baseSha,
    leaseExpiresAt: leaseExpiry()
  }, true);
  if (!claimed) return;

  const context: RunContext = { request, runId, sequence: 0 };
  await sendHeartbeat('busy', `Processing request ${request.id}.`);
  await event(context, 'planning', 'run_started', 'Request claimed and planning started.', {
    baseSha,
    backend: config.aiBackend,
    priorAttempts: priorRuns.length
  });

  let result: RequestOutcome;
  try {
    result = await implementInWorktree(context, baseSha, priorRuns);
  } catch (error) {
    result = {
      status: 'rejected',
      runStatus: 'failed',
      phase: 'failed',
      response: `运行失败：${errorMessage(error)}`,
      errorCategory: 'runner_error'
    };
    await event(context, 'failed', 'runner_error', result.response, {}, 'error');
  }
  await finishRequest(context, result);
  log(`Request ${request.id} finished as ${result.runStatus}.`);
}

async function implementInWorktree(
  context: RunContext,
  baseSha: string,
  priorRuns: PriorRun[]
): Promise<RequestOutcome> {
  const requestPrefix = context.request.id.slice(0, 8);
  const runPrefix = context.runId.slice(0, 4);
  const branch = `auto/${requestPrefix}-${runPrefix}`;
  const worktreeDir = join(tmpdir(), `radar-dev-${requestPrefix}-${runPrefix}`);

  cleanupWorktree(worktreeDir, branch);
  git(projectRoot, ['worktree', 'add', '--force', worktreeDir, '-b', branch, baseSha]);

  try {
    await event(context, 'implementing', 'dependencies_started', 'Installing isolated dependencies for the coding workspace.');
    installDependencies(worktreeDir);
    await event(context, 'implementing', 'dependencies_ready', 'Coding workspace dependencies installed.');
    await event(context, 'implementing', 'agent_started', 'Coding agent started in an isolated worktree.', { branch });
    const cliResult = runImplementation(context.request, priorRuns, worktreeDir);
    const outputExcerpt = redact(cliResult.output).slice(-16000);
    await event(
      context,
      cliResult.success ? 'implementing' : 'failed',
      cliResult.success ? 'agent_response' : 'agent_failed',
      outputExcerpt || cliResult.error || 'Coding agent returned no output.',
      { exitCode: cliResult.exitCode },
      cliResult.success ? 'info' : 'error'
    );
    if (!cliResult.success) {
      return {
        status: 'rejected',
        runStatus: 'failed',
        phase: 'failed',
        response: `实现阶段失败：${cliResult.error || 'coding agent failed'}`,
        errorCategory: cliResult.timedOut ? 'agent_timeout' : 'agent_failed'
      };
    }

    const agentOutcome = parseAgentOutcome(cliResult.output);
    if (!agentOutcome) {
      return {
        status: 'replied',
        runStatus: 'needs_input',
        phase: 'waiting_for_input',
        response: 'Agent 已运行，但没有返回可验证的结构化结果。完整回复已保存在运行记录中。',
        errorCategory: 'invalid_agent_response'
      };
    }

    const changedFiles = getChangedFiles(worktreeDir, baseSha);
    const validation = validateOutcome(agentOutcome, changedFiles);
    if (!validation.valid) {
      return {
        status: 'rejected',
        runStatus: 'failed',
        phase: 'failed',
        response: `Agent 结果与仓库状态不一致：${validation.reason}`,
        errorCategory: 'outcome_mismatch'
      };
    }
    if (agentOutcome.outcome === 'needs_input') {
      return {
        status: 'replied',
        runStatus: 'needs_input',
        phase: 'waiting_for_input',
        response: formatOutcomeResponse(agentOutcome),
        errorCategory: 'needs_input'
      };
    }
    if (agentOutcome.outcome === 'failed') {
      return {
        status: 'rejected',
        runStatus: 'failed',
        phase: 'failed',
        response: formatOutcomeResponse(agentOutcome),
        errorCategory: 'implementation_failed'
      };
    }
    if (agentOutcome.outcome === 'no_change') {
      return {
        status: 'completed',
        runStatus: 'succeeded',
        phase: 'completed',
        response: formatOutcomeResponse(agentOutcome)
      };
    }

    await event(context, 'verifying', 'verification_started', 'Running required repository checks.', { changedFiles });
    const verification = verifyWorktree(worktreeDir);
    await event(context, 'verifying', 'verification_passed', 'All required checks passed.', verification);

    const headBeforeCommit = git(worktreeDir, ['rev-parse', 'HEAD']);
    if (hasWorkingChanges(worktreeDir)) {
      git(worktreeDir, ['add', '-A']);
      git(worktreeDir, ['commit', '-m', commitMessage(context.request.text)]);
    }
    const resultSha = git(worktreeDir, ['rev-parse', 'HEAD']);
    if (resultSha === baseSha && headBeforeCommit === baseSha) {
      throw new Error('Verified files changed, but no result commit was created.');
    }

    git(worktreeDir, ['fetch', 'origin', 'main']);
    const currentMain = git(worktreeDir, ['rev-parse', 'origin/main']);
    if (currentMain !== baseSha) {
      try {
        git(worktreeDir, ['rebase', 'origin/main']);
      } catch (error) {
        try { git(worktreeDir, ['rebase', '--abort']); } catch { /* best effort */ }
        git(worktreeDir, ['push', 'origin', `HEAD:refs/heads/${branch}`]);
        await event(context, 'publishing', 'conflict_branch_saved', 'Saved the verified result branch after a main rebase conflict.', {
          branch,
          resultSha
        }, 'warning');
        return {
          status: 'replied',
          runStatus: 'needs_input',
          phase: 'waiting_for_input',
          response: `实现已保存在 ${branch}，但 main 在运行期间发生变化，自动变基冲突。需要人工处理后再发布。`,
          branch,
          resultSha,
          errorCategory: 'main_conflict'
        };
      }
      verifyWorktree(worktreeDir);
    }

    const publishSha = git(worktreeDir, ['rev-parse', 'HEAD']);
    await event(context, 'publishing', 'branch_push_started', 'Pushing the verified result branch.', {
      branch,
      resultSha: publishSha,
      changedFiles
    });
    git(worktreeDir, ['push', 'origin', `HEAD:refs/heads/${branch}`]);
    await event(context, 'publishing', 'main_push_started', 'Publishing the verified commit to main.', {
      branch,
      resultSha: publishSha
    });
    git(worktreeDir, ['push', 'origin', 'HEAD:main']);

    await event(context, 'deploying', 'deployment_started', 'Waiting for the GitHub production deployment.', {
      resultSha: publishSha
    });
    const publishPackage = JSON.parse(readFileSync(join(worktreeDir, 'package.json'), 'utf8')) as { version?: string };
    const deployment = await waitForDeployment(worktreeDir, publishSha, expectedPatchVersion(publishPackage.version));
    if (!deployment.success) {
      return {
        status: 'replied',
        runStatus: 'needs_input',
        phase: 'waiting_for_input',
        response: `代码已发布到 main (${publishSha.slice(0, 8)})，但生产验证未完成：${deployment.detail}`,
        branch,
        resultSha: publishSha,
        errorCategory: 'deployment_unverified'
      };
    }
    await event(context, 'deploying', 'deployment_verified', 'GitHub deployment and live app version were verified.', {
      resultSha: publishSha,
      workflowUrl: deployment.workflowUrl,
      liveVersion: deployment.liveVersion
    });

    return {
      status: 'completed',
      runStatus: 'succeeded',
      phase: 'completed',
      branch,
      resultSha: publishSha,
      response: `${agentOutcome.summary}\n已合并到 main 并完成生产部署。修改 ${changedFiles.length} 个文件，提交 ${publishSha.slice(0, 8)}。`
    };
  } finally {
    cleanupWorktree(worktreeDir, branch);
  }
}

function runImplementation(
  request: DevRequest,
  priorRuns: PriorRun[],
  cwd: string
): { success: boolean; output: string; error?: string; exitCode?: number; timedOut?: boolean } {
  const history = priorRuns.length
    ? priorRuns.map((run) => `Attempt ${run.attempt}: ${run.status}. ${run.summary || run.errorCategory}`).join('\n')
    : 'No prior attempts.';
  const parentContext = request.parent
    ? `Parent request: ${request.parent.text}\nParent status: ${request.parent.status}\nParent response: ${request.parent.response || 'none'}`
    : 'No parent request.';
  const prompt = `You are implementing a development request in the current SvelteKit repository.

Read AGENTS.md first and follow it. Inspect the relevant code and understand the problem before editing. Form a short internal plan, then implement the request using your best judgment.

Execution contract:
- You may edit files and run local checks.
- Do not commit, push, merge, deploy, or modify remote systems. The wrapper owns publication.
- Normal UI, API, and additive database migration work is allowed when required.
- Return needs_input only for a genuinely missing product decision, destructive data action, auth policy change, secret access change, or an unrecoverable ambiguity.
- A bug that cannot be reproduced is needs_input, not no_change.
- Use no_change only when the requested behavior already exists, and cite concrete code or test evidence.
- Run relevant checks, but the wrapper will run the full required suite again.

Prior attempts for this request:
${history}

Linked request context:
${parentContext}

REQUEST:
${request.text}

Your final line must be exactly this marker followed by one compact JSON object on the same line:
${RESULT_MARKER}{"outcome":"implemented|needs_input|no_change|failed","summary":"clear result","questions":[],"evidence":[],"tests":[]}`;

  try {
    const cli = config.aiBackend === 'claude-code' ? 'claude' : 'codex';
    const args = cli === 'codex'
      ? ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-c', 'model_reasoning_effort=medium', '-C', cwd, prompt]
      : ['-p', '--dangerously-skip-permissions', prompt];
    const result = execFileSync(cli, args, {
      cwd,
      timeout: IMPLEMENTATION_TIMEOUT_MS,
      stdio: 'pipe',
      maxBuffer: 20 * 1024 * 1024
    });
    return { success: true, output: result.toString() };
  } catch (error) {
    const detail = childError(error);
    return {
      success: false,
      output: detail.stdout,
      error: (detail.stderr || detail.stdout || detail.message).slice(-4000),
      exitCode: detail.exitCode,
      timedOut: detail.timedOut
    };
  }
}

function verifyWorktree(cwd: string): Record<string, string> {
  const results: Record<string, string> = {};
  for (const [name, args] of [
    ['test', ['test']],
    ['check', ['run', 'check']],
    ['build', ['run', 'build']]
  ] as const) {
    try {
      const output = execFileSync('npm', args, { cwd, timeout: 5 * 60_000, stdio: 'pipe', maxBuffer: 10 * 1024 * 1024 });
      results[name] = output.toString().slice(-1000);
    } catch (error) {
      const detail = childError(error);
      throw new Error(`${name} failed: ${(detail.stderr || detail.stdout || detail.message).slice(-3000)}`);
    }
  }
  return results;
}

async function waitForDeployment(
  cwd: string,
  commitSha: string,
  expectedVersion: string | null
): Promise<{ success: boolean; detail: string; workflowUrl?: string; liveVersion?: string }> {
  const deadline = Date.now() + DEPLOYMENT_TIMEOUT_MS;
  let workflowUrl = '';
  while (Date.now() < deadline) {
    try {
      const raw = execFileSync(
        'gh',
        ['run', 'list', '--workflow', 'Deploy', '--commit', commitSha, '--json', 'status,conclusion,url', '--limit', '1'],
        { cwd, timeout: 30000, stdio: 'pipe' }
      ).toString();
      const runs = JSON.parse(raw) as Array<{ status: string; conclusion: string; url: string }>;
      const run = runs[0];
      if (run) {
        workflowUrl = run.url;
        if (run.status === 'completed' && run.conclusion !== 'success') {
          return { success: false, detail: `GitHub workflow concluded ${run.conclusion}.`, workflowUrl };
        }
        if (run.status === 'completed' && run.conclusion === 'success') {
          if (!expectedVersion) return { success: true, detail: 'Deployment succeeded.', workflowUrl };
          const liveVersion = await waitForLiveVersion(expectedVersion);
          return liveVersion
            ? { success: true, detail: 'Deployment succeeded.', workflowUrl, liveVersion }
            : { success: false, detail: `Workflow succeeded, but the live version endpoint did not show ${expectedVersion}.`, workflowUrl };
        }
      }
    } catch (error) {
      log(`Deployment status check failed: ${errorMessage(error)}`);
    }
    await delay(5000);
  }
  return { success: false, detail: 'Timed out waiting for the GitHub deployment.', workflowUrl };
}

async function waitForLiveVersion(expectedVersion: string): Promise<string | null> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const response = await fetch(`${config.radarUrl}/api/version`, { signal: AbortSignal.timeout(15000) });
      const body = (await response.json()) as { version?: string };
      if (response.ok && body.version === expectedVersion) return expectedVersion;
    } catch { /* retry */ }
    await delay(5000);
  }
  return null;
}

async function finishRequest(context: RunContext, outcome: RequestOutcome): Promise<void> {
  const response = await fetch(`${config.radarUrl}/api/agent/dev-requests`, {
    method: 'PATCH',
    headers: radarHeaders,
    body: JSON.stringify({
      id: context.request.id,
      runId: context.runId,
      status: outcome.status,
      runStatus: outcome.runStatus,
      phase: outcome.phase,
      response: outcome.response,
      branch: outcome.branch,
      resultSha: outcome.resultSha,
      errorCategory: outcome.errorCategory
    }),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Request completion update failed with HTTP ${response.status}`);
}

async function event(
  context: RunContext,
  phase: string,
  eventType: string,
  message: string,
  payload: Record<string, unknown> = {},
  level: 'info' | 'warning' | 'error' = 'info'
): Promise<void> {
  context.sequence += 1;
  await postAgentAction({
    action: 'event',
    id: crypto.randomUUID(),
    requestId: context.request.id,
    runId: context.runId,
    sequence: context.sequence,
    phase,
    level,
    eventType,
    message,
    payload,
    leaseExpiresAt: leaseExpiry()
  });
}

async function sendHeartbeat(status: string, detail: string): Promise<void> {
  let gitSha = '';
  try { gitSha = git(projectRoot, ['rev-parse', 'HEAD']); } catch { /* optional */ }
  await postAgentAction({
    action: 'heartbeat',
    runnerId: RUNNER_ID,
    status,
    version: RUNNER_VERSION,
    backend: config.aiBackend,
    gitSha,
    detail
  });
}

async function postAgentAction(body: Record<string, unknown>, allowConflict = false): Promise<boolean> {
  const response = await fetch(`${config.radarUrl}/api/agent/dev-requests`, {
    method: 'POST',
    headers: radarHeaders,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  if (allowConflict && response.status === 409) return false;
  if (!response.ok) throw new Error(`Agent action ${body.action} failed with HTTP ${response.status}`);
  return true;
}

function getChangedFiles(cwd: string, baseSha: string): string[] {
  const diffNames = git(cwd, ['diff', '--name-only', baseSha]);
  const untrackedNames = git(cwd, ['ls-files', '--others', '--exclude-standard']);
  return changedFilesFromGit(diffNames, untrackedNames);
}

function hasWorkingChanges(cwd: string): boolean {
  return git(cwd, ['status', '--porcelain']).length > 0;
}

function installDependencies(worktreeDir: string): void {
  try {
    execFileSync('npm', ['ci', '--no-audit', '--no-fund'], {
      cwd: worktreeDir,
      timeout: 5 * 60_000,
      stdio: 'pipe',
      maxBuffer: 10 * 1024 * 1024
    });
  } catch (error) {
    const detail = childError(error);
    throw new Error(`dependency install failed: ${(detail.stderr || detail.stdout || detail.message).slice(-3000)}`);
  }
}

function cleanupWorktree(worktreeDir: string, branch: string): void {
  try { git(projectRoot, ['worktree', 'remove', '--force', worktreeDir]); } catch { /* best effort */ }
  try { if (existsSync(worktreeDir)) rmSync(worktreeDir, { recursive: true, force: true }); } catch { /* best effort */ }
  try { git(projectRoot, ['worktree', 'prune']); } catch { /* best effort */ }
  try { git(projectRoot, ['branch', '-D', branch]); } catch { /* best effort */ }
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, timeout: 120000, stdio: 'pipe', maxBuffer: 10 * 1024 * 1024 }).toString().trim();
}

function commitMessage(requestText: string): string {
  const normalized = requestText.replace(/\s+/g, ' ').trim().slice(0, 68);
  return `auto: ${normalized}`;
}

function leaseExpiry(): string {
  return new Date(Date.now() + LEASE_MS).toISOString();
}

function expectedPatchVersion(version?: string): string | null {
  const match = version?.match(/^(\d+)\.(\d+)\.(\d+)$/);
  return match ? `${match[1]}.${match[2]}.${Number(match[3]) + 1}` : null;
}

function childError(error: unknown): {
  stdout: string;
  stderr: string;
  message: string;
  exitCode?: number;
  timedOut: boolean;
} {
  const child = error as { stdout?: Buffer; stderr?: Buffer; message?: string; status?: number; code?: string };
  return {
    stdout: child.stdout?.toString().trim() ?? '',
    stderr: child.stderr?.toString().trim() ?? '',
    message: child.message ?? String(error),
    exitCode: child.status,
    timedOut: child.code === 'ETIMEDOUT' || child.message?.includes('ETIMEDOUT') === true
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 4000) : String(error).slice(0, 4000);
}

function redact(value: string): string {
  return value
    .replace(/(x-admin-token["'\s:=]+)[^\s,"']+/gi, '$1[REDACTED]')
    .replace(/((?:api|access|admin|radar)[_-]?token["'\s:=]+)[^\s,"']+/gi, '$1[REDACTED]')
    .replace(/(authorization["'\s:=]+bearer\s+)[^\s,"']+/gi, '$1[REDACTED]');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
