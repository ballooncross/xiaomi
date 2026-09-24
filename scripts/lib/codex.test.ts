import { describe, expect, it } from 'vitest';
import { codexExecArgs, summarizeCliFailure } from './codex';

describe('codexExecArgs', () => {
  it('ignores the user config and pins the reasoning effort', () => {
    expect(codexExecArgs({ effort: 'low' })).toEqual([
      'exec',
      '--skip-git-repo-check',
      '--ignore-user-config',
      '-c',
      'model_reasoning_effort=low'
    ]);
  });

  it('adds model, sandbox, and working directory when given', () => {
    expect(codexExecArgs({ effort: 'medium', model: 'gpt-5-codex', sandbox: 'workspace-write', cwd: '/tmp/wt' })).toEqual([
      'exec',
      '--skip-git-repo-check',
      '--ignore-user-config',
      '-m',
      'gpt-5-codex',
      '--sandbox',
      'workspace-write',
      '-c',
      'model_reasoning_effort=medium',
      '-C',
      '/tmp/wt'
    ]);
  });

  it('omits the model flag for an empty override', () => {
    expect(codexExecArgs({ effort: 'low', model: '' })).not.toContain('-m');
  });
});

describe('summarizeCliFailure', () => {
  it('extracts the API error message from the ERROR JSON line', () => {
    const output = [
      'OpenAI Codex v0.150.1',
      'warning: Model metadata for `gpt-6-astra` not found.',
      'ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \'gpt-6-astra\' model requires a newer version of Codex."}}',
      'ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \'gpt-6-astra\' model requires a newer version of Codex."}}'
    ].join('\n');
    expect(summarizeCliFailure(output)).toBe("The 'gpt-6-astra' model requires a newer version of Codex.");
  });

  it('falls back to the last informative line when there is no ERROR line', () => {
    const output = 'warning: something\n2026-09-23T09:48:22Z WARN noise\nnot logged in, run codex login\n';
    expect(summarizeCliFailure(output)).toBe('not logged in, run codex login');
  });

  it('uses the fallback for empty output', () => {
    expect(summarizeCliFailure('', 'exit code 1')).toBe('exit code 1');
  });
});
