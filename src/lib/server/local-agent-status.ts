import { getDb } from './db';
import type { Env } from './types';

export const LOCAL_AGENT_JOB_NAME = 'local-agent';
export const LOCAL_AGENT_STATUSES = ['running', 'ok', 'error'] as const;

export type LocalAgentStatus = (typeof LOCAL_AGENT_STATUSES)[number];

export type LocalAgentStatusInput = {
  status: LocalAgentStatus;
  detail: string;
};

export function parseLocalAgentStatusInput(value: unknown): LocalAgentStatusInput | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as { status?: unknown; detail?: unknown };
  if (
    typeof input.status !== 'string' ||
    !LOCAL_AGENT_STATUSES.includes(input.status as LocalAgentStatus) ||
    typeof input.detail !== 'string' ||
    !input.detail.trim()
  ) {
    return null;
  }

  return {
    status: input.status as LocalAgentStatus,
    detail: input.detail.trim().slice(0, 1000)
  };
}

export async function recordLocalAgentStatus(env: Env | undefined, input: LocalAgentStatusInput): Promise<void> {
  await getDb(env).logJob({
    jobName: LOCAL_AGENT_JOB_NAME,
    status: input.status,
    detail: input.detail
  });
}
