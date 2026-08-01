import type { ParamMatcher } from '@sveltejs/kit';
import { RADAR_VIEW_IDS } from '$lib/navigation';

const views = new Set<string>(RADAR_VIEW_IDS);

export const match: ParamMatcher = (param) => views.has(param);
