<script lang="ts">
  import { trackUsage } from '$lib/usage';
  import { ACTIVITY_LEVELS, NUTRITION_GOALS, calculateNutrition } from '$lib/nutrition-calculator';

  let age = $state<number | undefined>();
  let weight = $state<number | undefined>();
  let height = $state<number | undefined>();
  let sex = $state<'male' | 'female'>('female');
  let activity = $state('sedentary');
  let goal = $state('maintain');
  const result = $derived(calculateNutrition({ age, weight, height, sex, activity, goal }));
  const goalDescription = $derived(NUTRITION_GOALS.find((item) => item.id === goal)?.description);
  const activityFactor = $derived(ACTIVITY_LEVELS.find((item) => item.id === activity)?.factor);
  const format = (value: number) => Math.round(value).toLocaleString('zh-CN');
  $effect(() => {
    // Count a valid result after editing settles, never individual keystrokes.
    if (!result) return;
    const timer = setTimeout(() => trackUsage('calculation', 'nutrition'), 800);
    return () => clearTimeout(timer);
  });
</script>

<svelte:head><title>热量与营养计算 · 个人雷达</title></svelte:head>

<section class="nutrition">
  <header>
    <h1>热量与营养计算</h1>
    <p>根据身体数据、日常活动和目标，估算每天的热量与三大营养素。</p>
  </header>
  <div class="layout">
    <section class="card" aria-labelledby="nutrition-input-heading">
      <h2 id="nutrition-input-heading">你的基本信息</h2>
      <div class="fields">
        <label>年龄（岁）<input type="number" min="18" max="100" step="1" required placeholder="18–100" bind:value={age} /></label>
        <label>公式性别<select bind:value={sex}><option value="female">女性</option><option value="male">男性</option></select></label>
        <label>身高（厘米）<input type="number" min="100" max="250" step="any" required placeholder="例如 165" bind:value={height} /></label>
        <label>体重（公斤）<input type="number" min="30" max="300" step="any" required placeholder="例如 60" bind:value={weight} /></label>
        <label class="wide">日常活动量<select bind:value={activity}>{#each ACTIVITY_LEVELS as level}<option value={level.id}>{level.label}</option>{/each}</select></label>
        <label class="wide">你的目标<select bind:value={goal}>{#each NUTRITION_GOALS as item}<option value={item.id}>{item.label}</option>{/each}</select></label>
      </div>
      <p class="hint">活动量应包含工作与运动。公式使用男性 / 女性两个系数。输入仅用于当前页面计算，不上传或保存。</p>
    </section>
    <section class="card results" aria-labelledby="nutrition-result-heading" aria-live="polite" aria-atomic="true">
      <h2 id="nutrition-result-heading">每日参考摄入</h2>
      {#if result}
        <div class="total"><strong>{format(result.calories)}</strong><span>千卡 / 天</span></div>
        <p>{goalDescription} · 活动系数 {activityFactor}</p>
        <dl class="energy">
          <div><dt>静息代谢</dt><dd>{format(result.resting)} 千卡</dd></div>
          <div><dt>维持体重所需热量</dt><dd>{format(result.maintenance)} 千卡</dd></div>
        </dl>
        <div class="macros">
          <article><h3>蛋白质</h3><strong>{format(result.protein)} <small>克 / 天</small></strong><p>25% 热量</p></article>
          <article><h3>脂肪</h3><strong>{format(result.fat)} <small>克 / 天</small></strong><p>30% 热量</p></article>
          <article><h3>碳水化合物</h3><strong>{format(result.carbs)} <small>克 / 天</small></strong><p>45% 热量</p></article>
        </div>
        <p class="hint">显示值四舍五入。克数指营养素本身的重量，不是食物重量；不同食物每杯的营养含量不同，不能统一换算成杯数。</p>
      {:else}
        <p class="empty">请填写有效的年龄、身高和体重，结果会自动更新。</p>
        <p class="hint">支持 18–100 岁、身高 100–250 厘米、体重 30–300 公斤；年龄需为整数。</p>
      {/if}
    </section>
  </div>
  <section class="card methodology">
    <h2>如何计算？</h2>
    <p>采用 <a href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noreferrer">Mifflin–St Jeor 公式</a>估算静息代谢：10 × 体重（公斤）+ 6.25 × 身高（厘米）− 5 × 年龄 + 性别系数（男性 +5，女性 −161）。</p>
    <p>维持热量 = 静息代谢 × 活动系数。活动系数为粗略估计，减脂 −10% 和增重 +10% 是本工具的温和起始设置，不属于原始公式。</p>
    <p>本工具采用蛋白质 25%、脂肪 30%、碳水 45% 的示例分配，处于<a href="https://www.nationalacademies.org/publications/10490" target="_blank" rel="noreferrer">成人宏量营养素参考范围</a>内。蛋白质和碳水按每克 4 千卡、脂肪按每克 9 千卡换算。这里计算的是宏量营养素，不是维生素或矿物质。</p>
    <p class="hint">适用于一般成年人的日常规划，结果是估算值。孕期、哺乳期或有疾病及特殊营养需求时，请由医生或营养师制定方案；可结合数周体重趋势和实际状态调整。</p>
  </section>
</section>

<style>
  .nutrition { display: grid; gap: 20px; }
  h1 { margin: 0; font-size: 26px; }
  h2 { margin: 0 0 18px; font-size: 17px; }
  p { color: var(--muted); font-size: 14px; line-height: 1.7; }
  .layout { display: grid; grid-template-columns: 1fr 1.2fr; gap: 20px; }
  .card { padding: 24px; background: var(--surface, #fff); border: 1px solid var(--line, #e5e7eb); border-radius: 18px; min-width: 0; }
  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  label { display: grid; gap: 8px; font-size: 13px; }
  .wide { grid-column: 1 / -1; }
  input, select { width: 100%; min-width: 0; box-sizing: border-box; padding: 12px; border: 1px solid var(--line, #ddd); border-radius: 10px; background: var(--surface, #fff); color: inherit; font: inherit; }
  input:focus-visible, select:focus-visible { outline: 2px solid var(--jade, #25846a); outline-offset: 2px; }
  .hint { font-size: 12px; margin-bottom: 0; }
  .total { display: flex; align-items: baseline; flex-wrap: wrap; gap: 12px; color: var(--jade, #25846a); }
  .total strong { font-size: 44px; }
  .total span { font-size: 14px; }
  .energy { display: grid; gap: 12px; font-size: 13px; margin: 24px 0; }
  .energy div { display: flex; justify-content: space-between; gap: 12px; }
  dd { margin: 0; }
  .macros { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .macros article { padding: 14px 10px; border-radius: 12px; background: var(--canvas); }
  h3 { margin: 0 0 12px; font-size: 13px; }
  .macros strong { font-size: 22px; }
  small { font-size: 11px; font-weight: normal; white-space: nowrap; }
  .macros p { margin-bottom: 0; font-size: 12px; }
  .empty { padding: 24px 0; }
  a { color: var(--jade, #25846a); text-decoration: underline; }
  @media (max-width: 800px) { .layout { grid-template-columns: 1fr; } }
  @media (max-width: 420px) { .card { padding: 16px; } .macros { grid-template-columns: 1fr; } }
</style>
