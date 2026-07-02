import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { getDb } from '$lib/server/db';
import { compileContext } from '$lib/server/context-compiler';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

/**
 * Natural-language interest input from the UI. The raw text is stored
 * verbatim as a Layer 1 signal; the compiled context carries it to the local
 * AI agent, which interprets nuance like "interested in X but not Y".
 */
export const POST: RequestHandler = async ({ request, platform }) => {
  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = body.text?.trim();
  if (!text || text.length < 4) {
    return json({ error: 'text is required (a sentence about your interests)' }, { status: 400 });
  }
  if (text.length > 2000) {
    return json({ error: 'text too long (max 2000 chars)' }, { status: 400 });
  }

  const db = getDb(mergeLocalEnv(platform?.env as Env | undefined, privateEnv));
  await db.insertPreferenceSignal({
    id: crypto.randomUUID(),
    signalType: 'interest',
    signalValue: text,
    source: 'ui'
  });

  // Explicit user input is high-signal: recompile the context immediately
  const doc = await compileContext(db);
  return json({ ok: true, contextVersion: doc.version });
};
