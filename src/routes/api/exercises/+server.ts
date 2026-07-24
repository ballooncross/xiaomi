import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { rankExercises } from '$lib/server/exercise-search';
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

type GarminExerciseRow = {
	id: string;
	category: string;
	exercise_key: string;
	name: string;
	body_part: string;
	primary_muscles: string;
	secondary_muscles: string;
	equipment: string;
	catalogs: string;
	description: string | null;
	image_url: string | null;
};

type Exercise = {
	id: string;
	name: string;
	bodyPart: string;
	equipment: string;
	target: string;
	secondaryMuscles: string[];
	instructions: string;
	gifUrl: string | null;
	imageUrl: string | null;
	source: 'exercise-dataset' | 'garmin';
	sourceCategory: string | null;
	sourceKey: string | null;
	catalogs: string[];
	aliases: string[];
};

// Both datasets are static and small, so we cache them in the isolate and rank
// in memory instead of hitting D1 on every keystroke.
const INDEX_TTL_MS = 5 * 60 * 1000;
let indexCache: { rows: Exercise[]; at: number } | null = null;

async function loadIndex(db: D1Database): Promise<Exercise[]> {
	if (indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache.rows;

	const [exerciseResult, garminResult] = await Promise.all([
		db
			.prepare(
				'SELECT id, name, body_part, equipment, target, secondary_muscles, instructions_en, instructions_zh, gif_url, image_url FROM exercises'
			)
			.all<ExerciseRow>(),
		db
			.prepare(
				'SELECT id, category, exercise_key, name, body_part, primary_muscles, secondary_muscles, equipment, catalogs, description, image_url FROM garmin_exercises'
			)
			.all<GarminExerciseRow>()
	]);

	const exerciseRows: Exercise[] = (exerciseResult.results ?? []).map((row) => ({
		id: row.id,
		name: row.name,
		bodyPart: row.body_part,
		equipment: row.equipment,
		target: row.target,
		secondaryMuscles: parseJsonArray(row.secondary_muscles),
		instructions: row.instructions_zh || row.instructions_en || '',
		gifUrl: row.gif_url,
		imageUrl: row.image_url,
		source: 'exercise-dataset',
		sourceCategory: null,
		sourceKey: null,
		catalogs: [],
		aliases: []
	}));

	const garminRows: Exercise[] = (garminResult.results ?? []).map((row) => {
		const primaryMuscles = parseJsonArray(row.primary_muscles);
		const equipment = parseJsonArray(row.equipment);
		return {
			id: row.id,
			name: row.name,
			bodyPart: row.body_part,
			equipment: equipment.map(humanizeGarmin).join(', '),
			target: primaryMuscles.map(humanizeGarmin).join(', ') || humanizeGarmin(row.category),
			secondaryMuscles: parseJsonArray(row.secondary_muscles).map(humanizeGarmin),
			instructions: row.description ?? '',
			gifUrl: null,
			imageUrl: row.image_url,
			source: 'garmin',
			sourceCategory: row.category,
			sourceKey: row.exercise_key,
			catalogs: parseJsonArray(row.catalogs),
			aliases: [row.category, row.exercise_key, `${row.category}_${row.exercise_key}`]
		};
	});

	const rows = [...exerciseRows, ...garminRows];
	indexCache = { rows, at: Date.now() };
	return rows;
}

export const GET: RequestHandler = async ({ url, platform }) => {
	const env = mergeLocalEnv(platform?.env as Env | undefined, privateEnv);
	const db = env?.DB;
	if (!db) return json({ exercises: [] });

	const q = (url.searchParams.get('q') ?? '').trim();
	const bodyPart = (url.searchParams.get('bodyPart') ?? '').trim();
	const equipment = (url.searchParams.get('equipment') ?? '').trim();
	const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 40, 1), 60);

	try {
		let items = await loadIndex(db);
		if (bodyPart) items = items.filter((item) => item.bodyPart === bodyPart);
		if (equipment) {
			const normalizedEquipment = equipment.toLowerCase();
			items = items.filter((item) =>
				item.equipment
					.toLowerCase()
					.split(', ')
					.includes(normalizedEquipment)
			);
		}

		const exercises = rankExercises(q, items, limit);
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

function humanizeGarmin(value: string): string {
	return value
		.toLowerCase()
		.split('_')
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}
