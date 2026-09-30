<script lang="ts">
  import NutritionView from '$lib/components/NutritionView.svelte';
</script>

<svelte:head>
  <meta name="description" content="无需登录即可使用个人雷达的热量与营养计算工具。" />
</svelte:head>

<main>
  <header>
    <a href="/login">📡 Personal Radar</a>
    <a href="/login" class="btn">Sign in</a>
  </header>
  <p class="guest-label">Guest mode</p>
  <NutritionView />
  <p class="quiet-copy"><a href="/login">Sign in</a> to access your personal dashboard, saved items and trackers.</p>
</main>

<style>
  main { max-width: 1100px; margin: 0 auto; padding: var(--space-5); }
  header { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); margin-bottom: var(--space-7); }
  .guest-label { color: var(--muted); font-size: var(--text-sm); }
</style>
