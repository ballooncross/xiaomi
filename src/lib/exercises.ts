import exercisesData from './data/exercises.json';

export interface Exercise {
	name: string;
	primaryMuscle: string;
	equipment: string;
	description: string;
	gifUrl: string;
}

export const exercises: Exercise[] = exercisesData;

export function getExercisesByMuscle(muscle: string): Exercise[] {
	return exercises.filter((e) => e.primaryMuscle === muscle);
}

export function getExercisesByEquipment(equipment: string): Exercise[] {
	return exercises.filter((e) => e.equipment === equipment);
}

export const muscles = [...new Set(exercises.map((e) => e.primaryMuscle))];
export const equipmentList = [...new Set(exercises.map((e) => e.equipment))];
