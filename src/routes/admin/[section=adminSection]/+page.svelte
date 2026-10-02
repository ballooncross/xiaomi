<script lang="ts">
  import RadarApp from '$lib/components/RadarApp.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<RadarApp {data} />
