/**
 * Detect other Personal Radar agent runners on this machine.
 *
 * Two runners must never overlap: the launchd scheduler installed by
 * scripts/install-agent.sh and an ad-hoc `npm run agent` loop both submit to
 * the live radar, so running both duplicates work and races for development
 * requests. agent.ts uses these checks to refuse loop mode while the scheduler
 * is installed, and to warn when another agent process is mid-cycle.
 */

import { execFileSync } from 'node:child_process';

export const LAUNCH_AGENT_LABEL = 'com.personalradar.agent';

export type AgentProcess = { pid: number; command: string };

/** True when the launchd agent is loaded for the current user (macOS only). */
export function launchAgentInstalled(): boolean {
  if (process.platform !== 'darwin') return false;
  try {
    const uid = typeof process.getuid === 'function' ? process.getuid() : 501;
    execFileSync('launchctl', ['print', `gui/${uid}/${LAUNCH_AGENT_LABEL}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const RUNNER_PATTERN = /scripts\/agent\.ts|run-agent\.sh/;

/**
 * Agent processes other than this one. `npx tsx scripts/agent.ts` runs as a
 * chain (npm -> tsx -> node) whose every command line mentions agent.ts, so
 * the current process and all of its ancestors are excluded.
 */
export function otherAgentProcesses(): AgentProcess[] {
  let table: string;
  try {
    table = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf-8' });
  } catch {
    return [];
  }
  const rows: Array<{ pid: number; ppid: number; command: string }> = [];
  for (const line of table.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) continue;
    rows.push({ pid: Number(match[1]), ppid: Number(match[2]), command: match[3].trim() });
  }
  return filterOtherRunners(rows, process.pid);
}

/** Pure helper: drop `selfPid` and its ancestor chain, keep runner-looking rows. */
export function filterOtherRunners(
  rows: Array<{ pid: number; ppid: number; command: string }>,
  selfPid: number
): AgentProcess[] {
  const parentOf = new Map(rows.map((row) => [row.pid, row.ppid]));
  const excluded = new Set<number>();
  let cursor: number | undefined = selfPid;
  while (cursor !== undefined && cursor > 0 && !excluded.has(cursor)) {
    excluded.add(cursor);
    cursor = parentOf.get(cursor);
  }
  return rows
    .filter((row) => !excluded.has(row.pid) && RUNNER_PATTERN.test(row.command))
    .map(({ pid, command }) => ({ pid, command }));
}

export function describeProcesses(processes: AgentProcess[]): string {
  return processes.map((proc) => `  pid ${proc.pid}: ${proc.command}`).join('\n');
}
