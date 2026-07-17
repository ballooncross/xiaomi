import type { ParamMatcher } from '@sveltejs/kit';

const views = new Set(['concerts', 'trends', 'dates', 'gym', 'me', 'saved']);

export const match: ParamMatcher = (param) => views.has(param);
