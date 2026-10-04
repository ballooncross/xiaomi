import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import RadarApp from './RadarApp.svelte';
import type { RadarPageData } from '$lib/server/radar-page-load';
import { FEATURE_REGISTRY } from '$lib/server/features';
import { DEFAULT_NOTIFY_PREFS } from '$lib/notify-prefs';

const state = vi.hoisted(() => ({ url: new URL('https://radar.example/me') }));
vi.mock('$app/state', () => ({ page: state }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));

function renderPage(path: string, isAdmin = true, enabled = true) {
 state.url = new URL(path, 'https://radar.example');
 const data: RadarPageData = {
  items: [], savedItems: [], topics: [], reminders: [], packages: [], cronJobs: [],
  user: { id: 'test', email: 'test@example.com', name: 'Test', picture: '', isAdmin },
  features: Object.fromEntries(FEATURE_REGISTRY.map((feature) => [feature.id, { ...feature, enabled, minRole: feature.defaultMinRole, allowed: enabled && (feature.defaultMinRole !== 'admin' || isAdmin) }])) as unknown as RadarPageData['features'],
  icaTool: { enabled: false, targetBefore: '', checkerUrlConfigured: false, fallbackConfigured: false },
  middleNav: ['concerts', 'dates', 'gym'], notifyPrefs: DEFAULT_NOTIFY_PREFS,
  telegramBotConfigured: false, telegramConfigured: false, telegramLinked: false, aiEnabled: false
 };
 return render(RadarApp, { props: { data } }).body;
}

describe('feature directory and separated account pages', () => {
 it('makes every personal destination available even when pinned', () => {
  const html = renderPage('/explore');
  for (const path of ['concerts', 'trends', 'dates', 'packages', 'promotions', 'coe', 'gym', 'nutrition', 'interests', 'saved', 'me', 'notifications', 'settings']) {
   expect(html).toContain(`href="/${path}"`);
  }
  expect(html).toContain('href="/admin/performance"');
  expect(html).toContain('type="search"');
 });
 it('hides unavailable tools and administrator entries for members', () => {
  const html = renderPage('/explore', false, false);
  for (const path of ['admin', 'admin/performance', 'gym', 'coe', 'packages']) expect(html).not.toContain(`href="/${path}"`);
  expect(html).toContain('href="/nutrition"');
 });
 it('keeps account details separate from operations and notification forms', () => {
  const html = renderPage('/me');
  expect(html).toContain('test@example.com');
  expect(html).toContain('href="/notifications"');
  expect(html).toContain('href="/admin"');
  for (const text of ['定时任务状态', '允许登录的邮箱', '功能开关', '描述功能需求或 Bug', '解除绑定']) expect(html).not.toContain(text);
 });
 it('exposes monitoring and each admin responsibility from the admin hub', () => {
  const html = renderPage('/admin');
  for (const path of ['monitoring', 'performance', 'requests', 'features', 'access']) expect(html).toContain(`href="/admin/${path}"`);
 });
 it.each([
  ['monitoring', '定时任务状态', '允许登录的邮箱'],
  ['access', '允许登录的邮箱', '定时任务状态'],
  ['features', '功能开关', '定时任务状态'],
  ['requests', '描述功能需求或 Bug', '允许登录的邮箱']
 ])('renders only the selected admin panel: %s', (path, present, absent) => {
  const html = renderPage(`/admin/${path}`);
  expect(html).toContain(present);
  expect(html).not.toContain(absent);
 });
 it('explains disabled admin pages reached via a bookmark', () => {
  expect(renderPage('/admin/monitoring', true, false)).toContain('此功能当前未启用');
 });
 it('keeps Telegram settings on their own page', () => {
  const html = renderPage('/notifications');
  expect(html).toContain('Telegram');
  expect(html).not.toContain('定时任务状态');
 });
});
