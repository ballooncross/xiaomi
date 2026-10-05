<script lang="ts">
  import {
    MAX_CALENDAR_YEAR,
    MIN_CALENDAR_YEAR,
    WEEKDAY_LABELS,
    lunarDate,
    monthCaption,
    monthGrid,
    parseYmd,
    todayInSingaporeYmd,
    weekdayLabel,
    type CalendarDay
  } from '$lib/lunar-calendar';

  let { value = $bindable() }: { value: string } = $props();

  const today = todayInSingaporeYmd();
  const todayParts = parseYmd(today)!;
  const years = Array.from({ length: MAX_CALENDAR_YEAR - MIN_CALENDAR_YEAR + 1 }, (_, index) => MIN_CALENDAR_YEAR + index);
  const months = Array.from({ length: 12 }, (_, index) => index + 1);

  let open = $state(false);
  let viewYear = $state(todayParts.year);
  let viewMonth = $state(todayParts.month);

  const selected = $derived(parseYmd(value) ?? todayParts);
  const selectedLunar = $derived(lunarDate(selected));
  const days = $derived(monthGrid(viewYear, viewMonth));
  const caption = $derived(monthCaption(viewYear, viewMonth));

  function toggle() {
    if (!open) showMonth(selected.year, selected.month);
    open = !open;
  }

  function showMonth(year: number, month: number) {
    const index = Math.min(Math.max(year * 12 + month - 1, MIN_CALENDAR_YEAR * 12), MAX_CALENDAR_YEAR * 12 + 11);
    viewYear = Math.floor(index / 12);
    viewMonth = (index % 12) + 1;
  }

  function pick(day: CalendarDay) {
    value = day.value;
    open = false;
  }

  function dayLabel(day: CalendarDay) {
    return `${day.year}年${day.month}月${day.day}日 ${weekdayLabel(day)} 农历${day.lunar.monthLabel}${day.lunar.dayLabel}`;
  }
</script>

<div class="lunar-picker">
  <button class="picker-field" type="button" aria-expanded={open} onclick={toggle}>
    <svg class="field-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3v3M17 3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"></path>
    </svg>
    <span>
      <strong>{selected.year}年{selected.month}月{selected.day}日 {weekdayLabel(selected)}</strong>
      <small>农历{selectedLunar.monthLabel}{selectedLunar.dayLabel} · {selectedLunar.yearLabel}</small>
    </span>
    <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
  </button>

  {#if open}
    <div class="picker-panel">
      <div class="picker-head">
        <button class="nav-button" type="button" aria-label="上个月" onclick={() => showMonth(viewYear, viewMonth - 1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>
        </button>
        <select bind:value={viewYear} aria-label="年份">
          {#each years as year}<option value={year}>{year}年</option>{/each}
        </select>
        <select bind:value={viewMonth} aria-label="月份">
          {#each months as month}<option value={month}>{month}月</option>{/each}
        </select>
        <button class="nav-button" type="button" aria-label="下个月" onclick={() => showMonth(viewYear, viewMonth + 1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>
        </button>
      </div>
      <div class="picker-caption">
        <span>{caption}</span>
        <button class="today-button" type="button" onclick={() => showMonth(todayParts.year, todayParts.month)}>今天</button>
      </div>

      <div class="picker-weekdays" aria-hidden="true">
        {#each WEEKDAY_LABELS as label, index}<span class:weekend={index >= 5}>{label}</span>{/each}
      </div>
      <div class="picker-grid">
        {#each days as day (day.value)}
          <button
            class="day note-{day.noteKind}"
            class:outside={!day.inMonth}
            class:weekend={day.weekend}
            class:today={day.value === today}
            class:selected={day.value === value}
            type="button"
            aria-label={dayLabel(day)}
            aria-pressed={day.value === value}
            aria-current={day.value === today ? 'date' : undefined}
            onclick={() => pick(day)}
          >
            <strong>{day.day}</strong>
            <small>{day.note}</small>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .lunar-picker {
    min-width: 0;
  }

  .picker-field {
    width: 100%;
    min-height: 58px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    border: 1px solid rgba(130, 111, 91, 0.22);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--ink);
    padding: 8px 12px;
    text-align: left;
    cursor: pointer;
  }

  .picker-field strong,
  .picker-field small {
    display: block;
  }

  .picker-field strong {
    font-size: 16px;
    font-weight: var(--weight-black);
  }

  .picker-field small {
    margin-top: 2px;
    color: var(--muted);
    font-size: 13px;
    font-weight: var(--weight-bold);
  }

  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .field-icon {
    width: 22px;
    height: 22px;
    color: var(--sage);
  }

  .chevron {
    width: 20px;
    height: 20px;
    color: var(--muted);
    transition: transform var(--ease);
  }

  .picker-field[aria-expanded='true'] .chevron {
    transform: rotate(180deg);
  }

  .picker-panel {
    margin-top: 8px;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    padding: 12px;
  }

  .picker-head {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .picker-head select,
  .nav-button,
  .today-button {
    min-height: 34px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
    font-weight: var(--weight-black);
  }

  .picker-head select {
    flex: 1 1 0;
    min-width: 0;
    max-width: 120px;
    border-radius: 10px;
    padding: 0 8px;
  }

  .nav-button {
    width: 34px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: var(--radius-pill);
    color: var(--sea);
    padding: 0;
  }

  .nav-button svg {
    width: 18px;
    height: 18px;
  }

  .today-button {
    min-height: 28px;
    flex: none;
    border-radius: var(--radius-pill);
    background: var(--paper);
    color: var(--sage);
    font-size: 12px;
    padding: 0 12px;
  }

  .picker-caption {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin: 8px 2px 4px;
    color: var(--muted);
    font-size: 12px;
    font-weight: var(--weight-bold);
  }

  .picker-weekdays,
  .picker-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 2px;
  }

  .picker-weekdays span {
    padding: 6px 0;
    color: var(--muted);
    font-size: 12px;
    font-weight: var(--weight-black);
    text-align: center;
  }

  .picker-weekdays .weekend,
  .day.weekend strong {
    color: var(--accent);
  }

  .day {
    min-width: 0;
    min-height: 50px;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 3px;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--ink);
    padding: 4px 0;
    cursor: pointer;
  }

  .day:hover {
    background: color-mix(in srgb, var(--sage) 14%, transparent);
  }

  .day strong {
    font-size: 16px;
    font-weight: var(--weight-black);
    line-height: 1;
  }

  .day small {
    max-width: 100%;
    overflow: hidden;
    color: var(--muted);
    font-size: 11px;
    font-weight: var(--weight-bold);
    line-height: 1;
    white-space: nowrap;
  }

  .note-festival small {
    color: var(--accent);
  }

  .note-term small {
    color: var(--jade);
  }

  .note-month small {
    color: var(--sea);
    font-weight: var(--weight-black);
  }

  .day.outside {
    opacity: 0.38;
  }

  .day.today {
    box-shadow: inset 0 0 0 1.5px var(--sage);
  }

  .day.selected,
  .day.selected:hover {
    background: var(--sea);
    box-shadow: none;
  }

  .day.selected strong,
  .day.selected small {
    color: var(--surface);
  }

  @media (max-width: 760px) {
    .picker-panel {
      padding: 10px 8px;
    }

    .picker-head {
      gap: 4px;
    }

    .day {
      min-height: 46px;
    }

    .day strong {
      font-size: 15px;
    }

    .day small {
      font-size: 10px;
    }
  }
</style>
