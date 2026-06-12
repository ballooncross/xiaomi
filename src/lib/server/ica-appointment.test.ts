import { describe, expect, it } from 'vitest';
import {
  extractPostProceedError,
  mergeIcaFallbackDetail,
  normalizeIcaFallbackUrl,
  shouldTriggerIcaFallback
} from './ica-appointment';

describe('ICA fallback helpers', () => {
  it('normalizes the fallback runner URL', () => {
    expect(normalizeIcaFallbackUrl({ ICA_FALLBACK_CHECK_URL: ' https://runner.example.com/// ' })).toBe(
      'https://runner.example.com'
    );
  });

  it('only triggers fallback for failed primary checks with full fallback config', () => {
    const env = {
      ICA_FALLBACK_CHECK_URL: 'https://runner.example.com',
      ICA_FALLBACK_TRIGGER_TOKEN: 'runner-token'
    };

    expect(shouldTriggerIcaFallback(env, 'blocked')).toBe(true);
    expect(shouldTriggerIcaFallback(env, 'error')).toBe(true);
    expect(shouldTriggerIcaFallback(env, 'not_configured')).toBe(true);
    expect(shouldTriggerIcaFallback(env, 'ok')).toBe(false);
    expect(shouldTriggerIcaFallback(env, 'found_earlier')).toBe(false);
    expect(shouldTriggerIcaFallback({ ...env, ICA_FALLBACK_TRIGGER_TOKEN: '' }, 'blocked')).toBe(false);
  });

  it('keeps primary failure context in fallback details', () => {
    expect(mergeIcaFallbackDetail({ status: 'blocked', detail: 'captcha page' }, 'No earlier date')).toContain(
      'Primary detail: captcha page'
    );
  });

  it('recognizes ICA generic errors after Proceed', () => {
    expect(extractPostProceedError('Error Message\nSomething went wrong. Please try again.')).toContain(
      'Something went wrong'
    );
    expect(extractPostProceedError('Update Appointment')).toBeUndefined();
  });
});
