import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import GuestPage from './+page.svelte';

const state = vi.hoisted(() => ({ url: new URL('https://radar.example/guest?view=gym') }));
vi.mock('$app/state', () => ({ page: state }));

describe('guest page navigation', () => {
	it('renders the gym entry and exercise search when enabled for guests', () => {
		const { body } = render(GuestPage, { props: { data: { user: null, gymAllowed: true } } });
		expect(body).toContain('href="/guest?view=gym"');
		expect(body).toContain('aria-label="搜索健身动作"');
		expect(body).toContain('href="/guest?view=nutrition"');
	});

	it('hides gym and falls back to nutrition when guest access is unavailable', () => {
		const { body } = render(GuestPage, { props: { data: { user: null, gymAllowed: false } } });
		expect(body).not.toContain('href="/guest?view=gym"');
		expect(body).not.toContain('aria-label="搜索健身动作"');
		expect(body).toContain('href="/guest?view=nutrition"');
	});
});
