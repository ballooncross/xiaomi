import { describe, expect, it } from 'vitest';
import { isAgentScanLog, shouldRecompileContext, SIGNAL_RECOMPILE_THRESHOLD } from './context-recompile';

const snapshot = { version: 12, signalCount: 100 };

describe('isAgentScanLog', () => {
  it('treats the agent scan log as telemetry', () => {
    expect(isAgentScanLog('free_text', 'agent')).toBe(true);
  });

  it('keeps free text typed by the user', () => {
    expect(isAgentScanLog('free_text', 'ui')).toBe(false);
  });

  it('keeps agent signals that carry a preference', () => {
    expect(isAgentScanLog('not_interested', 'agent')).toBe(false);
    expect(isAgentScanLog('source_suggestion', 'agent')).toBe(false);
  });
});

describe('shouldRecompileContext', () => {
  it('compiles the first snapshot', () => {
    expect(shouldRecompileContext({ snapshot: null, meaningfulSignals: 0, totalSignals: 0 })).toBe(true);
  });

  it('does not recompile for scan logs alone', () => {
    expect(shouldRecompileContext({ snapshot, meaningfulSignals: 0, totalSignals: 500 })).toBe(false);
  });

  it('waits for the threshold before recompiling', () => {
    const belowThreshold = snapshot.signalCount + SIGNAL_RECOMPILE_THRESHOLD - 1;
    expect(
      shouldRecompileContext({ snapshot, meaningfulSignals: 1, totalSignals: belowThreshold })
    ).toBe(false);
  });

  it('recompiles once enough signals have accumulated', () => {
    const atThreshold = snapshot.signalCount + SIGNAL_RECOMPILE_THRESHOLD;
    expect(
      shouldRecompileContext({ snapshot, meaningfulSignals: 1, totalSignals: atThreshold })
    ).toBe(true);
  });
});
