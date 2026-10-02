import { describe, expect, it, vi } from 'vitest';
import { load as hubLoad } from './+page.server';
import { load as sectionLoad } from './[section=adminSection]/+page.server';
import { load as layoutLoad } from './+layout.server';
import { match } from '../../params/adminSection';

vi.mock('$lib/server/radar-page-load', () => ({ loadRadarPageData: vi.fn(() => ({ items: [] })) }));

describe('admin page access', () => {
 for (const [label, load] of [['hub', hubLoad], ['section', sectionLoad], ['layout', layoutLoad]] as const) {
  it(`${label} rejects anonymous and non-admin direct loads`, async () => {
   for (const [user, status] of [[null, 401], [{ id: 'member', isAdmin: false }, 403]] as const) {
    await expect(Promise.resolve().then(() => load({ locals: { user }, setHeaders: vi.fn() } as never))).rejects.toMatchObject({ status });
   }
  });
 }
 it('marks administrator pages private and allows the administrator session', async () => {
  const setHeaders = vi.fn();
  await layoutLoad({ locals: { user: { id: 'admin', isAdmin: true } }, setHeaders } as never);
  expect(setHeaders).toHaveBeenCalledWith({ 'cache-control': 'private, no-store' });
  expect(await hubLoad({ locals: { user: { id: 'admin', isAdmin: true } } } as never)).toEqual({ items: [] });
 });
 it('recognizes only supported sections, leaving performance to its dedicated route', () => {
  for (const section of ['monitoring', 'requests', 'features', 'access']) expect(match(section)).toBe(true);
  for (const section of ['performance', 'unknown', 'me']) expect(match(section)).toBe(false);
 });
});
