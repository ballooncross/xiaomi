<script lang="ts">
  import RadarPage from '../+page.svelte';
  import type { PageData } from '../$types';

  let { data }: { data: PageData } = $props();
</script>

<RadarPage {data} />
