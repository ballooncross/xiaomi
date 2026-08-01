export type AgentImplementationOutcome = {
  outcome: 'implemented' | 'needs_input' | 'no_change' | 'failed';
  summary: string;
  questions: string[];
  evidence: string[];
  tests: string[];
};

export const RESULT_MARKER = 'RADAR_RESULT_JSON:';

export function parseAgentOutcome(output: string): AgentImplementationOutcome | null {
  const markerIndex = output.lastIndexOf(RESULT_MARKER);
  if (markerIndex < 0) return null;
  const afterMarker = output.slice(markerIndex + RESULT_MARKER.length).trim();
  const firstLine = afterMarker.split('\n')[0]?.trim();
  if (!firstLine) return null;
  try {
    const parsed = JSON.parse(firstLine) as Partial<AgentImplementationOutcome>;
    if (!['implemented', 'needs_input', 'no_change', 'failed'].includes(parsed.outcome ?? '')) return null;
    if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) return null;
    return {
      outcome: parsed.outcome as AgentImplementationOutcome['outcome'],
      summary: parsed.summary.trim(),
      questions: stringArray(parsed.questions),
      evidence: stringArray(parsed.evidence),
      tests: stringArray(parsed.tests)
    };
  } catch {
    return null;
  }
}

export function changedFilesFromGit(diffNames: string, untrackedNames: string): string[] {
  return [...new Set([...lines(diffNames), ...lines(untrackedNames)])].sort();
}

export function validateOutcome(
  outcome: AgentImplementationOutcome,
  changedFiles: string[]
): { valid: true } | { valid: false; reason: string } {
  if (outcome.outcome === 'implemented' && changedFiles.length === 0) {
    return { valid: false, reason: 'Agent reported implementation but produced no repository changes.' };
  }
  if (outcome.outcome === 'no_change') {
    if (changedFiles.length > 0) {
      return { valid: false, reason: 'Agent reported no change but modified repository files.' };
    }
    if (outcome.evidence.length === 0) {
      return { valid: false, reason: 'No-change result did not include evidence.' };
    }
  }
  if (outcome.outcome === 'needs_input' && outcome.questions.length === 0) {
    return { valid: false, reason: 'Needs-input result did not include a concrete question.' };
  }
  return { valid: true };
}

export function formatOutcomeResponse(outcome: AgentImplementationOutcome): string {
  const sections = [outcome.summary];
  if (outcome.questions.length) sections.push(`需要确认：${outcome.questions.join('；')}`);
  if (outcome.evidence.length) sections.push(`依据：${outcome.evidence.join('；')}`);
  if (outcome.tests.length) sections.push(`验证：${outcome.tests.join('；')}`);
  return sections.join('\n');
}

function lines(value: string): string[] {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : [];
}
