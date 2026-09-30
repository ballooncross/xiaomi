<script lang="ts">
  import NutritionView from '$lib/components/NutritionView.svelte';
  import GymView from '$lib/components/GymView.svelte';
  import { NAV_ITEMS } from '$lib/navigation';
  import { page } from '$app/state';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const guestItems = $derived(NAV_ITEMS.filter((item) =>
    item.id === 'nutrition' || (item.id === 'gym' && data.gymAllowed)
  ));
  const activeView = $derived(data.gymAllowed && page.url.searchParams.get('view') === 'gym' ? 'gym' : 'nutrition');
</script>

<svelte:head>
  <meta name="description" content="无需登录即可使用个人雷达的访客工具。" />
</svelte:head>

<main>
  <header>
    <a href="/login">📡 Personal Radar</a>
    <a href="/login" class="btn">Sign in</a>
  </header>
  <p class="guest-label">Guest mode</p>
  <nav aria-label="访客工具">
    {#each guestItems as item (item.id)}
      <a class="btn" href={`/guest?view=${item.id}`} aria-current={activeView === item.id ? 'page' : undefined}>{item.label}</a>
    {/each}
  </nav>
  {#if activeView === 'gym'}
    <GymView />
  {:else}
    <NutritionView />
  {/if}
  <p class="quiet-copy"><a href="/login">Sign in</a> to access your personal dashboard, saved items and trackers.</p>
</main>

<style>
  main { max-width: 1100px; margin: 0 auto; padding: var(--space-5); }
  header { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); margin-bottom: var(--space-7); }
  .guest-label { color: var(--muted); font-size: var(--text-sm); }
  nav { display: flex; gap: var(--space-3); margin-bottom: var(--space-5); }
  nav a[aria-current="page"] { border-color: var(--jade); color: var(--jade); }
</style>
