import type { Env } from './types';
import { defaultEnv } from './config';

export function mergeLocalEnv(env?: Env, local: Record<string, string | undefined> = {}): Env {
  return {
    ...defaultEnv,
    ...withoutEmptyValues(local),
    ...withoutEmptyValues(env ?? {})
  };
}

function withoutEmptyValues<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== '')) as Partial<T>;
}
