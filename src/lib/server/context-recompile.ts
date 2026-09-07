import type { AiContextSnapshotMeta } from './types';

/** New preference signals needed before the structured context is recompiled. */
export const SIGNAL_RECOMPILE_THRESHOLD = 5;

/**
 * The local agent writes one `free_text` signal per scan to record what it did.
 * That entry is telemetry: it carries no preference and cannot change the
 * compiled context. Counting it made every tick look like new input, so the
 * context recompiled on every tick, its version rose, and the agent's next tick
 * saw a changed version and scanned again instead of skipping.
 */
export function isAgentScanLog(signalType: string, source: string): boolean {
  return signalType === 'free_text' && source === 'agent';
}

/**
 * Recompile when there is no snapshot yet, or when enough signals that could
 * actually change the context have arrived since the last one. `totalSignals`
 * and `snapshot.signalCount` must be the same measure, otherwise the difference
 * is meaningless and the threshold is always met.
 */
export function shouldRecompileContext(input: {
  snapshot: AiContextSnapshotMeta | null;
  meaningfulSignals: number;
  totalSignals: number;
}): boolean {
  if (!input.snapshot) return true;
  if (input.meaningfulSignals === 0) return false;
  return input.totalSignals - input.snapshot.signalCount >= SIGNAL_RECOMPILE_THRESHOLD;
}
