import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const libDir = dirname(fileURLToPath(import.meta.url));
export const scriptDir = join(libDir, '..');

// Load scripts/.env (does not override already-set environment variables)
try {
  const envFile = readFileSync(join(scriptDir, '.env'), 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  /* no .env file, rely on environment */
}

export const config = {
  radarUrl: process.env.RADAR_URL || 'https://personal-radar.pages.dev',
  radarToken: process.env.RADAR_TOKEN || '',

  // AI backend for trend discovery:
  // codex (ChatGPT login, no API key) | claude-code (Claude login) |
  // chatgpt | deepseek | claude (API keys) | ollama (local) | none
  aiBackend: (process.env.AI_BACKEND || 'codex').toLowerCase(),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen3:0.6b',

  dryRun: process.argv.includes('--dry-run'),
  once: process.argv.includes('--once'),

  pollIntervalMs: 10 * 60 * 1000,
  fullScanIntervalHours: 4,
  deepScanIntervalHours: 24,
  signalChangeThreshold: 3,
  statePath: join(scriptDir, '.agent-state.json'),

  maxItemsTargeted: 8,
  maxItemsFull: 15,
  maxItemsDeep: 25
};

export const radarHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
  ...(config.radarToken ? { 'x-admin-token': config.radarToken } : {})
};
