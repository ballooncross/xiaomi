export const GYM_RECENT_SEARCHES_STORAGE_KEY = 'personal-radar-gym-recent-searches';
export const MAX_GYM_RECENT_SEARCHES = 6;

export function normalizeGymSearchQuery(query: string): string {
	return query.trim().replace(/\s+/g, ' ');
}

export function parseGymRecentSearches(raw: string | null): string[] {
	if (!raw) return [];

	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.reduce<string[]>((recent, value) => {
			if (typeof value !== 'string') return recent;
			return addGymRecentSearch(recent, value, { append: true });
		}, []);
	} catch {
		return [];
	}
}

export function addGymRecentSearch(
	recent: string[],
	query: string,
	options?: { append?: boolean }
): string[] {
	const normalized = normalizeGymSearchQuery(query);
	if (!normalized) return recent.slice(0, MAX_GYM_RECENT_SEARCHES);

	const key = normalized.toLocaleLowerCase();
	if (
		options?.append &&
		recent.some((item) => normalizeGymSearchQuery(item).toLocaleLowerCase() === key)
	) {
		return recent.slice(0, MAX_GYM_RECENT_SEARCHES);
	}
	const withoutDuplicate = recent.filter(
		(item) => normalizeGymSearchQuery(item).toLocaleLowerCase() !== key
	);
	const next = options?.append
		? [...withoutDuplicate, normalized]
		: [normalized, ...withoutDuplicate];
	return next.slice(0, MAX_GYM_RECENT_SEARCHES);
}
