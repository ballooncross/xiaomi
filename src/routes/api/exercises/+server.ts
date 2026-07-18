import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import type { Env } from '$lib/server/types';
import type { RequestHandler } from './$types';

type ExerciseRow = {
	id: string;
	name: string;
	body_part: string;
	equipment: string;
	target: string;
	secondary_muscles: string | null;
	instructions_en: string | null;
	instructions_zh: string | null;
	gif_url: string;
	image_url: string | null;
};

type IndexRow = Pick<ExerciseRow, 'id' | 'name' | 'body_part' | 'equipment' | 'target' | 'secondary_muscles'>;

const FULL_COLS =
	'id, name, body_part, equipment, target, secondary_muscles, instructions_en, instructions_zh, gif_url, image_url';

export const GET: RequestHandler = async ({ url, platform }) => {
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	const db = env?.DB;
	if (!db) return json({ exercises: [] });

	const q = (url.searchParams.get('q') ?? '').trim();
	const bodyPart = (url.searchParams.get('bodyPart') ?? '').trim();
	const equipment = (url.searchParams.get('equipment') ?? '').trim();
	const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 40, 1), 60);

	const filterWhere: string[] = [];
	const filterBinds: unknown[] = [];
	if (bodyPart) {
		filterWhere.push('body_part = ?');
		filterBinds.push(bodyPart);
	}
	if (equipment) {
		filterWhere.push('equipment = ?');
		filterBinds.push(equipment);
	}
	const filterClause = filterWhere.length ? ` WHERE ${filterWhere.join(' AND ')}` : '';

	const tokens = tokenize(q);

	try {
		// No search text: just return a filtered, alphabetical slice.
		if (tokens.length === 0) {
			const { results } = await db
				.prepare(`SELECT ${FULL_COLS} FROM exercises${filterClause} ORDER BY name LIMIT ?`)
				.bind(...filterBinds, limit)
				.all<ExerciseRow>();
			return json({ exercises: (results ?? []).map(toResponse) });
		}

		// Smart search: pull a lightweight index and rank in-memory (fuzzy + order-independent).
		const { results: index } = await db
			.prepare(`SELECT id, name, body_part, equipment, target, secondary_muscles FROM exercises${filterClause}`)
			.bind(...filterBinds)
			.all<IndexRow>();

		const ranked = rank(index ?? [], tokens).slice(0, limit);
		if (ranked.length === 0) return json({ exercises: [] });

		const ids = ranked.map((r) => r.id);
		const placeholders = ids.map(() => '?').join(',');
		const { results: full } = await db
			.prepare(`SELECT ${FULL_COLS} FROM exercises WHERE id IN (${placeholders})`)
			.bind(...ids)
			.all<ExerciseRow>();

		const byId = new Map((full ?? []).map((row) => [row.id, row]));
		const exercises = ids
			.map((id) => byId.get(id))
			.filter((row): row is ExerciseRow => Boolean(row))
			.map(toResponse);
		return json({ exercises });
	} catch (error) {
		return json({ exercises: [], error: String(error) }, { status: 500 });
	}
};

function toResponse(row: ExerciseRow) {
	return {
		id: row.id,
		name: row.name,
		bodyPart: row.body_part,
		equipment: row.equipment,
		target: row.target,
		secondaryMuscles: parseJsonArray(row.secondary_muscles),
		instructions: row.instructions_zh || row.instructions_en || '',
		gifUrl: row.gif_url,
		imageUrl: row.image_url
	};
}

function parseJsonArray(value: string | null): string[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function tokenize(value: string): string[] {
	return value
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length > 0);
}

// Minimum per-token match quality for a row to be considered a hit (0..1).
const MIN_TOKEN_SCORE = 0.66;

type ScoredRow = { id: string; score: number; nameLen: number };

function rank(rows: IndexRow[], queryTokens: string[]): ScoredRow[] {
	const phrase = queryTokens.join(' ');
	const scored: ScoredRow[] = [];

	for (const row of rows) {
		const nameTokens = tokenize(row.name);
		const extraTokens = tokenize(
			`${row.equipment} ${row.target} ${row.body_part} ${parseJsonArray(row.secondary_muscles).join(' ')}`
		);

		let total = 0;
		let nameHits = 0;
		let matched = true;
		for (const qt of queryTokens) {
			const nameScore = tokenScore(qt, nameTokens);
			const extraScore = tokenScore(qt, extraTokens) * 0.85;
			const best = Math.max(nameScore, extraScore);
			if (best < MIN_TOKEN_SCORE) {
				matched = false;
				break;
			}
			total += best;
			if (nameScore >= MIN_TOKEN_SCORE) nameHits += 1;
		}
		if (!matched) continue;

		let score = total / queryTokens.length;
		// Reward exact phrase appearing in the name, and name-field matches overall.
		if (row.name.toLowerCase().includes(phrase)) score += 0.4;
		score += (nameHits / queryTokens.length) * 0.2;

		scored.push({ id: row.id, score, nameLen: row.name.length });
	}

	scored.sort((a, b) => b.score - a.score || a.nameLen - b.nameLen);
	return scored;
}

function tokenScore(queryToken: string, haystack: string[]): number {
	const maxDist = maxDistanceFor(queryToken.length);
	let best = 0;
	for (const token of haystack) {
		if (token === queryToken) return 1;
		if (token.startsWith(queryToken)) best = Math.max(best, 0.92);
		else if (queryToken.length >= 3 && token.includes(queryToken)) best = Math.max(best, 0.82);
		else if (token.length >= 3 && queryToken.includes(token)) best = Math.max(best, 0.72);
		if (maxDist > 0) {
			const dist = boundedLevenshtein(queryToken, token, maxDist);
			if (dist <= maxDist) {
				best = Math.max(best, 1 - dist / Math.max(queryToken.length, token.length));
			}
		}
		if (best >= 1) break;
	}
	return best;
}

function maxDistanceFor(length: number): number {
	if (length <= 3) return 0;
	if (length <= 5) return 1;
	if (length <= 8) return 2;
	return 3;
}

function boundedLevenshtein(a: string, b: string, max: number): number {
	const al = a.length;
	const bl = b.length;
	if (Math.abs(al - bl) > max) return max + 1;

	let prev = new Array(bl + 1);
	for (let j = 0; j <= bl; j++) prev[j] = j;

	for (let i = 1; i <= al; i++) {
		const cur = new Array(bl + 1);
		cur[0] = i;
		let rowMin = i;
		const ac = a.charCodeAt(i - 1);
		for (let j = 1; j <= bl; j++) {
			const cost = ac === b.charCodeAt(j - 1) ? 0 : 1;
			const value = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
			cur[j] = value;
			if (value < rowMin) rowMin = value;
		}
		if (rowMin > max) return max + 1;
		prev = cur;
	}
	return prev[bl];
}
