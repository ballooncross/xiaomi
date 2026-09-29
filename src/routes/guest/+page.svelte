<script lang="ts">
  import { calculateWorkoutVolume } from '$lib/workout-calculator';

  let sets = $state<number | undefined>(3);
  let reps = $state<number | undefined>(10);
  let weight = $state<number | undefined>(20);
  let unit = $state('kg');
  let result = $derived(calculateWorkoutVolume(sets, reps, weight));
  const format = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
</script>

<svelte:head>
  <title>Guest tools — Personal Radar</title>
  <meta name="description" content="Use the Personal Radar workout volume calculator without an account." />
</svelte:head>

<main>
  <header>
    <a href="/login">📡 Personal Radar</a>
    <a href="/login" class="btn">Sign in</a>
  </header>
  <p class="guest-label">Guest mode</p>
  <h1>Workout calculator</h1>
  <p>Calculate training volume for one exercise using the same weight and reps for each set.</p>

  <section class="card" aria-label="Workout volume calculator">
    <div class="fields">
      <label>Sets
        <input type="number" min="1" step="1" required bind:value={sets} />
      </label>
      <label>Reps per set
        <input type="number" min="1" step="1" required bind:value={reps} />
      </label>
      <label>Weight per rep
        <input type="number" min="0" step="any" required bind:value={weight} />
      </label>
      <label>Weight unit
        <select bind:value={unit}>
          <option value="kg">Kilograms (kg)</option>
          <option value="lb">Pounds (lb)</option>
        </select>
      </label>
    </div>
    <div class="result" aria-live="polite" aria-atomic="true">
      {#if result}
        <p>Total reps: <strong>{format.format(result.totalReps)}</strong></p>
        <p>Training volume: <strong>{format.format(result.volume)} {unit}</strong></p>
        <p class="quiet-copy">{sets} sets × {reps} reps × {weight} {unit}</p>
      {:else}
        <p>Enter positive whole numbers for sets and reps, and a weight of zero or more.</p>
      {/if}
    </div>
    <p class="quiet-copy">Use the total external weight lifted per rep. Changing the unit labels your input; it does not convert it.</p>
    <button type="button" class="btn" onclick={() => { sets = 3; reps = 10; weight = 20; unit = 'kg'; }}>Reset</button>
  </section>

  <p class="quiet-copy">Calculations stay in this page and are cleared when you leave or reload. No account is created.</p>
  <p><a href="/login">Sign in</a> to access your personal dashboard, saved items and trackers.</p>
</main>

<style>
  main { max-width: 680px; margin: 0 auto; padding: var(--space-5); }
  header { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); margin-bottom: var(--space-7); }
  .guest-label { color: var(--muted); font-size: var(--text-sm); }
  h1 { font-size: var(--text-xl); }
  .card { padding: var(--space-5); margin: var(--space-5) 0; }
  .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); }
  label { display: flex; flex-direction: column; gap: var(--space-2); }
  input, select { width: 100%; min-width: 0; }
  .result { margin-top: var(--space-5); padding: var(--space-3); background: var(--surface); border-radius: var(--radius-sm); }
  @media (max-width: 420px) { .fields { grid-template-columns: 1fr; } }
</style>
