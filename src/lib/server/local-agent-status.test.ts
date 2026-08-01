import { describe, expect, it } from 'vitest';
import { getDb } from './db';
import { getCronJobStatuses } from './job-status';
import { parseLocalAgentStatusInput, recordLocalAgentStatus } from './local-agent-status';

describe('local agent status', () => {
  it('accepts supported states and trims detail', () => {
    expect(parseLocalAgentStatusInput({ status: 'running', detail: '  processing  ' })).toEqual({
      status: 'running',
      detail: 'processing'
    });
    expect(parseLocalAgentStatusInput({ status: 'stopped', detail: 'done' })).toBeNull();
    expect(parseLocalAgentStatusInput({ status: 'ok', detail: '  ' })).toBeNull();
  });

  it('appears in the scheduled job status list with its latest result', async () => {
    await recordLocalAgentStatus(undefined, { status: 'error', detail: 'test failure' });

    const statuses = await getCronJobStatuses({});
    const localAgent = statuses.find((job) => job.jobName === 'local-agent');

    expect(localAgent).toMatchObject({
      label: '本地 AI Agent',
      enabled: true,
      lastRun: {
        status: 'error',
        detail: 'test failure'
      }
    });
    expect((await getDb().listJobRuns('local-agent', 1))[0]?.detail).toBe('test failure');
  });
});
