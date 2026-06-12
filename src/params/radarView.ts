import type { ParamMatcher } from '@sveltejs/kit';

const views = new Set(['concerts', 'trends', 'dates', 'me']);

export const match: ParamMatcher = (param) => views.has(param);
