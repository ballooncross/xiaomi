import type { ParamMatcher } from '@sveltejs/kit';

const views = new Set([
	'home',
	'concerts',
	'trends',
	'dates',
	'gym',
	'coe',
	'interests',
	'me',
	'settings',
	'saved'
]);

export const match: ParamMatcher = (param) => views.has(param);
