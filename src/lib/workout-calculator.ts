/** External weight volume for one exercise; all sets use the same reps and load. */
export function calculateWorkoutVolume(
	sets: number | undefined,
	reps: number | undefined,
	weight: number | undefined
): { totalReps: number; volume: number } | null {
	if (
		typeof sets !== 'number' || !Number.isSafeInteger(sets) || sets < 1 ||
		typeof reps !== 'number' || !Number.isSafeInteger(reps) || reps < 1 ||
		typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0
	) return null;
	const totalReps = sets * reps;
	const volume = totalReps * weight;
	if (!Number.isSafeInteger(totalReps) || !Number.isFinite(volume)) return null;
	return { totalReps, volume };
}
