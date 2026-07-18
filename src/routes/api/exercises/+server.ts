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

export const GET: RequestHandler = async ({ url, platform }) => {
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	const db = env?.DB;
	if (!db) return json({ exercises: [] });

	const q = (url.searchParams.get('q') ?? '').trim();
	const bodyPart = (url.searchParams.get('bodyPart') ?? '').trim();
	const equipment = (url.searchParams.get('equipment') ?? '').trim();
	const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 40, 1), 60);

	const where: string[] = [];
	const binds: unknown[] = [];
	if (q) {
		const like = `%${q}%`;
		where.push(
			'(name LIKE ? OR target LIKE ? OR body_part LIKE ? OR equipment LIKE ? OR secondary_muscles LIKE ?)'
		);
		binds.push(like, like, like, like, like);
	}
	if (bodyPart) {
		where.push('body_part = ?');
		binds.push(bodyPart);
	}
	if (equipment) {
		where.push('equipment = ?');
		binds.push(equipment);
	}

	const sql =
		`SELECT id, name, body_part, equipment, target, secondary_muscles, instructions_en, instructions_zh, gif_url, image_url FROM exercises` +
		(where.length ? ` WHERE ${where.join(' AND ')}` : '') +
		` ORDER BY name LIMIT ?`;
	binds.push(limit);

	try {
		const { results } = await db
			.prepare(sql)
			.bind(...binds)
			.all<ExerciseRow>();
		const exercises = (results ?? []).map((row) => ({
			id: row.id,
			name: row.name,
			bodyPart: row.body_part,
			equipment: row.equipment,
			target: row.target,
			secondaryMuscles: parseJsonArray(row.secondary_muscles),
			instructions: row.instructions_zh || row.instructions_en || '',
			gifUrl: row.gif_url,
			imageUrl: row.image_url
		}));
		return json({ exercises });
	} catch (error) {
		return json({ exercises: [], error: String(error) }, { status: 500 });
	}
};

function parseJsonArray(value: string | null): string[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}
