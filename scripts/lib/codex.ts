/**
 * Shared Codex CLI invocation for the local agent and the development-request
 * runner. Both used to inherit `~/.codex/config.toml`, so a model or MCP change
 * made for interactive use could silently break every scheduled cycle. The
 * runner now ignores the user config and pins only what it needs.
 */

export type CodexEffort = 'low' | 'medium' | 'high';

export type CodexExecOptions = {
  effort: CodexEffort;
  /** Optional model override (CODEX_MODEL). Empty means the CLI default. */
  model?: string;
  /** Sandbox policy, for example `read-only` or `workspace-write`. */
  sandbox?: string;
  /** Working directory passed with `-C`. */
  cwd?: string;
};

/** Build `codex exec` arguments. The prompt is appended by the caller. */
export function codexExecArgs(options: CodexExecOptions): string[] {
  const args = ['exec', '--skip-git-repo-check', '--ignore-user-config'];
  if (options.model) args.push('-m', options.model);
  if (options.sandbox) args.push('--sandbox', options.sandbox);
  args.push('-c', `model_reasoning_effort=${options.effort}`);
  if (options.cwd) args.push('-C', options.cwd);
  return args;
}

/**
 * Reduce CLI output to the line that explains the failure. Codex prints
 * `ERROR: {"type":"error",...,"message":"..."}` on stderr; fall back to the
 * last non-empty, non-warning line so the status card stays readable.
 */
export function summarizeCliFailure(output: string, fallback = 'unknown error'): string {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.startsWith('ERROR:')) continue;
    const body = line.slice('ERROR:'.length).trim();
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
      const message = parsed.error?.message ?? parsed.message;
      if (message) return message;
    } catch {
      /* not JSON, use the raw line */
    }
    return body;
  }
  const informative = lines.filter((line) => !line.startsWith('warning:') && !/^\d{4}-\d{2}-\d{2}T.*(WARN|INFO)/.test(line));
  return (informative.length > 0 ? informative[informative.length - 1] : fallback).slice(0, 300);
}
