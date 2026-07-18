#!/usr/bin/env node
/**
 * Bulk-upload secrets from .env, skipping:
 * - empty values
 * - keys already defined in wrangler.toml [vars] (name clash breaks Pages deploy)
 * - PUBLIC_* non-secrets
 *
 * Usage:
 *   node scripts/sync-secrets.mjs pages
 *   node scripts/sync-secrets.mjs cron
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const target = process.argv[2];
if (target !== 'pages' && target !== 'cron') {
	console.error('Usage: node scripts/sync-secrets.mjs <pages|cron>');
	process.exit(1);
}

const wranglerVars = new Set(
	readFileSync('wrangler.toml', 'utf8')
		.split('\n')
		.reduce((acc, line, _i, arr) => {
			if (line.trim() === '[vars]') acc.inVars = true;
			else if (line.startsWith('[')) acc.inVars = false;
			else if (acc.inVars) {
				const m = line.match(/^([A-Z0-9_]+)\s*=/);
				if (m) acc.keys.add(m[1]);
			}
			return acc;
		}, { inVars: false, keys: new Set() }).keys
);

// Cron toml may also define vars
try {
	const cronVars = readFileSync('wrangler.cron.toml', 'utf8')
		.split('\n')
		.reduce((acc, line) => {
			if (line.trim() === '[vars]') acc.inVars = true;
			else if (line.startsWith('[')) acc.inVars = false;
			else if (acc.inVars) {
				const m = line.match(/^([A-Z0-9_]+)\s*=/);
				if (m) acc.keys.add(m[1]);
			}
			return acc;
		}, { inVars: false, keys: new Set() }).keys;
	for (const k of cronVars) wranglerVars.add(k);
} catch {
	/* optional */
}

const SKIP = new Set([
	...wranglerVars,
	'PUBLIC_APP_NAME',
	'GEMINI_MODEL',
	'DEEPSEEK_MODEL'
]);

const lines = readFileSync('.env', 'utf8').split('\n');
const out = [];
const skipped = [];

for (const line of lines) {
	const trimmed = line.trim();
	if (!trimmed || trimmed.startsWith('#')) continue;
	const eq = trimmed.indexOf('=');
	if (eq <= 0) continue;
	const key = trimmed.slice(0, eq).trim();
	const value = trimmed.slice(eq + 1).trim();
	if (!key || !/^[A-Z0-9_]+$/.test(key)) {
		skipped.push(`${key || '(invalid)'} (bad key)`);
		continue;
	}
	if (!value) {
		skipped.push(`${key} (empty)`);
		continue;
	}
	if (SKIP.has(key)) {
		skipped.push(`${key} (wrangler var / non-secret)`);
		continue;
	}
	out.push(`${key}=${value}`);
}

if (out.length === 0) {
	console.error('No secrets to upload after filtering.');
	process.exit(1);
}

const tmp = join(tmpdir(), `personal-radar-secrets-${Date.now()}.env`);
writeFileSync(tmp, out.join('\n') + '\n', { mode: 0o600 });

console.log(`Uploading ${out.length} secrets to ${target}:`);
for (const line of out) console.log(`  ${line.split('=')[0]}`);
if (skipped.length) {
	console.log('Skipped:');
	for (const s of skipped) console.log(`  ${s}`);
}

const args =
	target === 'pages'
		? ['wrangler', 'pages', 'secret', 'bulk', tmp, '--project-name', 'personal-radar']
		: ['wrangler', 'secret', 'bulk', tmp, '--config', 'wrangler.cron.toml'];

const result = spawnSync('npx', args, { stdio: 'inherit' });
try {
	unlinkSync(tmp);
} catch {
	/* ignore */
}
process.exit(result.status ?? 1);
