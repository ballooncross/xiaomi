/**
 * Lightweight fuzzy search for the exercise library.
 *
 * The dataset is small (~1,300 rows) so we rank in memory rather than relying
 * on SQL `LIKE`. The matcher is token-based (bag-of-words) with Levenshtein
 * edit-distance tolerance, which gives us three properties for free:
 *
 *   1. Word-order independence — "bench barbell press" == "barbell bench press"
 *      because each query word is matched against the *set* of document words.
 *   2. Subset queries — "barbell press" matches "barbell bench press" since we
 *      only require every query word to find a home, not the reverse.
 *   3. Typo tolerance — "barbbbell" still matches "barbell" via edit distance.
 *
 * No external dependency: Levenshtein distance is a standard dynamic-programming
 * algorithm and the token scoring is bespoke so we control the ranking.
 */

export type Searchable = {
	name: string;
	bodyPart: string;
	equipment: string;
	target: string;
	secondaryMuscles: string[];
};

const WORD_RE = /[a-z0-9]+/g;

export function tokenize(text: string): string[] {
	return text.toLowerCase().match(WORD_RE) ?? [];
}

/** Classic two-row Levenshtein (insert/delete/substitute cost 1). */
export function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	let prev = new Array<number>(b.length + 1);
	let curr = new Array<number>(b.length + 1);
	for (let j = 0; j <= b.length; j++) prev[j] = j;

	for (let i = 1; i <= a.length; i++) {
		curr[0] = i;
		const ac = a.charCodeAt(i - 1);
		for (let j = 1; j <= b.length; j++) {
			const cost = ac === b.charCodeAt(j - 1) ? 0 : 1;
			curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
		}
		[prev, curr] = [curr, prev];
	}
	return prev[b.length];
}

/** How many edits we tolerate for a word of the given length. */
function maxEdits(len: number): number {
	if (len <= 3) return 0;
	if (len <= 6) return 1;
	return 2;
}

/**
 * Best score (0..1, or -1 for no match) for one query word against the bag of
 * document words. Exact > prefix > substring > fuzzy.
 */
function bestWordScore(queryWord: string, docWords: string[]): number {
	let best = -1;
	for (const docWord of docWords) {
		if (docWord === queryWord) return 1;
		if (docWord.startsWith(queryWord) || queryWord.startsWith(docWord)) {
			best = Math.max(best, 0.9);
			continue;
		}
		if (docWord.includes(queryWord) || queryWord.includes(docWord)) {
			best = Math.max(best, 0.75);
			continue;
		}
		const allowed = maxEdits(Math.max(queryWord.length, docWord.length));
		if (allowed > 0) {
			const dist = levenshtein(queryWord, docWord);
			if (dist <= allowed) best = Math.max(best, 0.7 - (dist - 1) * 0.15);
		}
	}
	return best;
}

/**
 * Rank items against a free-text query. Returns the top `limit` items, best
 * match first. Every query word must match somewhere (AND semantics) so results
 * stay precise; matches in the exercise name are weighted higher than matches
 * in muscles/equipment.
 */
export function rankExercises<T extends Searchable>(query: string, items: T[], limit: number): T[] {
	const queryWords = tokenize(query);
	if (queryWords.length === 0) {
		return [...items].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
	}

	const scored: Array<{ item: T; score: number }> = [];
	for (const item of items) {
		const nameWords = tokenize(item.name);
		const docWords = tokenize(
			[item.name, item.target, item.equipment, item.bodyPart, ...item.secondaryMuscles].join(' ')
		);

		let total = 0;
		let matchedAll = true;
		for (const queryWord of queryWords) {
			const score = bestWordScore(queryWord, docWords);
			if (score < 0) {
				matchedAll = false;
				break;
			}
			const nameBonus = bestWordScore(queryWord, nameWords) > 0 ? 0.4 : 0;
			total += score + nameBonus;
		}
		if (matchedAll) scored.push({ item, score: total });
	}

	scored.sort(
		(a, b) =>
			b.score - a.score ||
			a.item.name.length - b.item.name.length ||
			a.item.name.localeCompare(b.item.name)
	);
	return scored.slice(0, limit).map((entry) => entry.item);
}
