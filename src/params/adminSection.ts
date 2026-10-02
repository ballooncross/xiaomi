import { ADMIN_PAGES } from '$lib/navigation';
import type { ParamMatcher } from '@sveltejs/kit';
export const match: ParamMatcher = (param) => ADMIN_PAGES.some((item) => item.id === param && item.id !== 'performance');
