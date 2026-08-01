import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  changedFilesFromGit,
  parseAgentOutcome,
  RESULT_MARKER,
  validateOutcome,
  type AgentImplementationOutcome
} from '../../../scripts/lib/dev-agent-core';

describe('development agent result contract', () => {
  it('parses the marked structured result', () => {
    const output = `Work completed.\n${RESULT_MARKER}{"outcome":"implemented","summary":"Added recents","questions":[],"evidence":["updated UI"],"tests":["npm test"]}`;
    expect(parseAgentOutcome(output)).toEqual({
      outcome: 'implemented',
      summary: 'Added recents',
      questions: [],
      evidence: ['updated UI'],
      tests: ['npm test']
    });
  });

  it('preserves a clarification instead of treating an empty diff as success', () => {
    const outcome = parseAgentOutcome(
      `${RESULT_MARKER}{"outcome":"needs_input","summary":"Missing context","questions":["Which duplicate items?"],"evidence":[],"tests":[]}`
    );
    expect(outcome).not.toBeNull();
    expect(validateOutcome(outcome!, [])).toEqual({ valid: true });
  });

  it('rejects implemented with no changed files', () => {
    const outcome = {
      outcome: 'implemented' as const,
      summary: 'Done',
      questions: [],
      evidence: [],
      tests: []
    };
    expect(validateOutcome(outcome, [])).toEqual({
      valid: false,
      reason: 'Agent reported implementation but produced no repository changes.'
    });
  });

  it('requires evidence for a true no-change result', () => {
    const outcome: AgentImplementationOutcome = {
      outcome: 'no_change',
      summary: 'Already present',
      questions: [],
      evidence: [],
      tests: []
    };
    expect(validateOutcome(outcome, []).valid).toBe(false);
    outcome.evidence.push('Existing test covers the requested behavior.');
    expect(validateOutcome(outcome, [])).toEqual({ valid: true });
  });

  it('detects both tracked changes and untracked files after an inner commit', () => {
    expect(changedFilesFromGit('src/app.ts\nsrc/app.ts\n', 'src/new.ts\n')).toEqual([
      'src/app.ts',
      'src/new.ts'
    ]);
  });

  it('detects a change after the inner agent commits it', () => {
    const directory = mkdtempSync(join(tmpdir(), 'radar-agent-test-'));
    const git = (args: string[]) => execFileSync('git', args, { cwd: directory }).toString().trim();
    git(['init', '-q']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test']);
    writeFileSync(join(directory, 'feature.txt'), 'before\n');
    git(['add', 'feature.txt']);
    git(['commit', '-q', '-m', 'base']);
    const baseSha = git(['rev-parse', 'HEAD']);
    writeFileSync(join(directory, 'feature.txt'), 'after\n');
    git(['add', 'feature.txt']);
    git(['commit', '-q', '-m', 'inner agent commit']);

    const changed = changedFilesFromGit(git(['diff', '--name-only', baseSha]), '');
    expect(changed).toEqual(['feature.txt']);
    expect(git(['status', '--porcelain'])).toBe('');
  });
});
