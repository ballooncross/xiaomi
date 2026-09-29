export const ACTIVITY_LEVELS = [
	{ id: 'sedentary', label: '久坐 · 很少运动', factor: 1.2 },
	{ id: 'light', label: '轻度活动 · 每周运动 1–3 天', factor: 1.375 },
	{ id: 'moderate', label: '中度活动 · 每周运动 3–5 天', factor: 1.55 },
	{ id: 'high', label: '高度活动 · 每周运动 6–7 天', factor: 1.725 },
	{ id: 'very-high', label: '极高活动 · 重体力工作并经常训练', factor: 1.9 }
] as const;

export const NUTRITION_GOALS = [
	{ id: 'lose', label: '减脂', factor: 0.9, description: '维持热量减少 10%' },
	{ id: 'maintain', label: '维持体重', factor: 1, description: '维持热量不变' },
	{ id: 'gain', label: '增重 / 增肌', factor: 1.1, description: '维持热量增加 10%' }
] as const;

export type NutritionInput = {
	age: number | undefined;
	weight: number | undefined;
	height: number | undefined;
	sex: 'male' | 'female';
	activity: string;
	goal: string;
};

/** Mifflin–St Jeor resting expenditure; activity and goal factors are estimates. */
export function calculateNutrition(input: NutritionInput) {
	const { age, weight, height, sex } = input;
	if (age == null || !Number.isInteger(age) || age < 18 || age > 100 ||
		weight == null || !Number.isFinite(weight) || weight < 30 || weight > 300 ||
		height == null || !Number.isFinite(height) || height < 100 || height > 250 ||
		(sex !== 'male' && sex !== 'female')) return null;
	const activity = ACTIVITY_LEVELS.find((item) => item.id === input.activity);
	const goal = NUTRITION_GOALS.find((item) => item.id === input.goal);
	if (!activity || !goal) return null;
	const resting = 10 * weight + 6.25 * height - 5 * age + (sex === 'male' ? 5 : -161);
	if (resting <= 0) return null;
	const maintenance = resting * activity.factor;
	const calories = maintenance * goal.factor;
	return {
		resting, maintenance, calories,
		protein: calories * 0.25 / 4,
		fat: calories * 0.30 / 9,
		carbs: calories * 0.45 / 4
	};
}
