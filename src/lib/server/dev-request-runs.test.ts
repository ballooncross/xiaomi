import { describe, expect, it } from 'vitest';
import { getDb } from './db';
import type { DevRequest, DevRequestRun } from './types';

describe('development request run lifecycle', () => {
  it('claims once, records events, and preserves retry history', async () => {
    const db = getDb();
    const request: DevRequest = {
      id: crypto.randomUUID(),
      text: 'Add a recent search list',
      status: 'pending',
      response: ''
    };
    await db.insertDevRequest(request);
    const run: DevRequestRun = {
      id: crypto.randomUUID(),
      requestId: request.id,
      attempt: 1,
      status: 'running',
      phase: 'planning',
      runnerId: 'test-runner',
      runnerVersion: '1',
      backend: 'fake',
      baseSha: 'abc',
      resultSha: '',
      branch: '',
      summary: '',
      errorCategory: '',
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString()
    };

    expect(await db.claimDevRequest(request.id, run)).toBe(true);
    expect(await db.claimDevRequest(request.id, { ...run, id: crypto.randomUUID() })).toBe(false);
    await db.insertDevRequestEvent({
      id: crypto.randomUUID(),
      requestId: request.id,
      runId: run.id,
      sequence: 1,
      phase: 'planning',
      level: 'info',
      eventType: 'started',
      message: 'Started'
    });
    await db.finishDevRequestRun(run.id, {
      status: 'needs_input',
      phase: 'waiting_for_input',
      summary: 'Need a choice'
    });
    await db.updateDevRequest(request.id, { status: 'replied', response: 'Need a choice' });

    expect((await db.listDevRequestEvents(request.id))[0]?.message).toBe('Started');
    expect((await db.listDevRequestRuns([request.id]))[0]?.summary).toBe('Need a choice');
    expect(await db.retryDevRequest(request.id)).toBe(true);
    expect((await db.listDevRequests({ status: 'pending' })).some((item) => item.id === request.id)).toBe(true);
  });

  it('recovers an expired running attempt', async () => {
    const db = getDb();
    const request: DevRequest = {
      id: crypto.randomUUID(),
      text: 'Recover me',
      status: 'pending',
      response: ''
    };
    await db.insertDevRequest(request);
    const run: DevRequestRun = {
      id: crypto.randomUUID(),
      requestId: request.id,
      attempt: 1,
      status: 'running',
      phase: 'implementing',
      runnerId: 'lost-runner',
      runnerVersion: '1',
      backend: 'fake',
      baseSha: 'abc',
      resultSha: '',
      branch: '',
      summary: '',
      errorCategory: '',
      leaseExpiresAt: '2000-01-01T00:00:00.000Z'
    };
    await db.claimDevRequest(request.id, run);
    expect(await db.recoverStaleDevRequests(new Date().toISOString())).toBeGreaterThanOrEqual(1);
    expect((await db.listDevRequests({ status: 'pending' })).some((item) => item.id === request.id)).toBe(true);
  });
});
