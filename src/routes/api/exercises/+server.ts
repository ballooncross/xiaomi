import { json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { mergeLocalEnv } from '$lib/server/env';
import { hasUsefulExerciseDetails, rankExercises } from '$lib/server/exercise-search';
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
	matched_exercise_id: string | null;
	enrichment_sources: string;
	match_confidence: number | null;
	instructions_en: string | null;
	instructions_zh: string | null;
	gif_url: string | null;
	video_url: string | null;
	difficulty: string | null;
	matched_instructions_en: string | null;
	matched_instructions_zh: string | null;
	matched_gif_url: string | null;
	matched_image_url: string | null;
};

type EnrichmentSource = {
	source: string;
	id: string;
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
	videoUrl: string | null;
	source: 'exercise-dataset' | 'garmin';
	sourceCategory: string | null;
	sourceKey: string | null;
	catalogs: string[];
	aliases: string[];
	enrichmentSources: EnrichmentSource[];
	matchConfidence: number | null;
	difficulty: string | null;
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
				`SELECT g.id, g.category, g.exercise_key, g.name, g.body_part,
					g.primary_muscles, g.secondary_muscles, g.equipment, g.catalogs,
					g.description, g.image_url, g.matched_exercise_id,
					g.enrichment_sources, g.match_confidence, g.instructions_en,
					g.instructions_zh, g.gif_url, g.video_url, g.difficulty,
					m.instructions_en AS matched_instructions_en,
					m.instructions_zh AS matched_instructions_zh,
					m.gif_url AS matched_gif_url,
					m.image_url AS matched_image_url
				FROM garmin_exercises g
				LEFT JOIN exercises m ON m.id = g.matched_exercise_id`
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
		videoUrl: null,
		source: 'exercise-dataset',
		sourceCategory: null,
		sourceKey: null,
		catalogs: [],
		aliases: [],
		enrichmentSources: [],
		matchConfidence: null,
		difficulty: null
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
			instructions:
				row.instructions_zh ||
				row.matched_instructions_zh ||
				row.instructions_en ||
				row.matched_instructions_en ||
				row.description ||
				'',
			gifUrl: row.gif_url || row.matched_gif_url,
			imageUrl: row.image_url || row.matched_image_url,
			videoUrl: row.video_url,
			source: 'garmin',
			sourceCategory: row.category,
			sourceKey: row.exercise_key,
			catalogs: parseJsonArray(row.catalogs),
			aliases: [row.category, row.exercise_key, `${row.category}_${row.exercise_key}`],
			enrichmentSources: parseEnrichmentSources(row.enrichment_sources),
			matchConfidence: row.match_confidence,
			difficulty: row.difficulty
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
	const hasDetails = url.searchParams.get('hasDetails') === 'true';
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
		if (hasDetails) {
			items = items.filter(hasUsefulExerciseDetails);
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

function parseEnrichmentSources(value: string | null): EnrichmentSource[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed)
			? parsed.filter(
					(item): item is EnrichmentSource =>
						typeof item?.source === 'string' && typeof item?.id === 'string'
				)
			: [];
	} catch {
		return [];
	}
}
