<script lang="ts">
  import { Solar } from 'lunar-javascript';
  import type { DateReminder } from '$lib/server/types';

  type ReminderView = DateReminder & { nextDate: string; daysLeft: number; dateLabel: string };

  let {
    reminders,
    nextReminder,
    reminderPending,
    onAdd,
    onEdit,
    onDelete
  }: {
    reminders: ReminderView[];
    nextReminder?: ReminderView;
    reminderPending: boolean;
    onAdd: () => void;
    onEdit: (reminder: ReminderView) => void;
    onDelete: (reminder: ReminderView) => void;
  } = $props();

  const today = new Date();
  const todaySolar = Solar.fromYmd(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const todayLunar = todaySolar.getLunar();
  const monthTitle = today.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
  const dayTitle = today.toLocaleDateString('en-SG', { day: 'numeric' });
  const weekday = today.toLocaleDateString('zh-CN', { weekday: 'long' });
  const lunarToday = `${todayLunar.getMonthInChinese()}月${todayLunar.getDayInChinese()}`;
  const yearProgress = Math.ceil(
    (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(today.getFullYear(), 0, 1)) / 86_400_000
  ) + 1;
  const yearLength = new Date(today.getFullYear(), 1, 29).getMonth() === 1 ? 366 : 365;

  function calendarLabel(reminder: ReminderView) {
    return reminder.dateLabel.replace(/\s·\s.*/, '');
  }
</script>

<section class="dates-view">
  <div class="dates-hero">
    <div>
      <span>今天是</span>
      <strong>{dayTitle}</strong>
    </div>
    <div class="today-meta">
      <h2>{monthTitle}</h2>
      <p>{lunarToday} · {weekday}</p>
      <div class="year-line">
        <span style={`width: ${(yearProgress / yearLength) * 100}%`}></span>
      </div>
      <small>第 {yearProgress} / {yearLength} 天</small>
    </div>
    <button type="button" onclick={onAdd}>添加日期</button>
  </div>

  {#if nextReminder}
    <section class="date-feature">
      <span>最近提醒</span>
      <h1>{nextReminder.title}</h1>
      <div class="feature-count">
        <strong>{nextReminder.daysLeft}</strong>
        <em>天</em>
      </div>
      <p>{nextReminder.dateLabel}</p>
    </section>
  {/if}

  <section class="date-list">
    {#each reminders as reminder}
      <article class:pinned={reminder.pinned} class="date-row">
        <div class="date-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M7 3v3M17 3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"></path>
            <path d="M9 13h6v4H9z"></path>
          </svg>
        </div>
        <div class="date-main">
          <strong>{reminder.title}</strong>
          <span>{calendarLabel(reminder)} · 每年</span>
        </div>
        <div class="date-count">
          <span>剩余</span>
          <strong>{reminder.daysLeft}</strong>
          <em>天</em>
        </div>
        <div class="date-actions">
          <button type="button" onclick={() => onEdit(reminder)}>编辑</button>
          <button type="button" disabled={reminderPending} onclick={() => onDelete(reminder)}>删除</button>
        </div>
      </article>
    {:else}
      <div class="date-empty">
        <strong>暂无日期提醒</strong>
        <button type="button" onclick={onAdd}>添加生日或纪念日</button>
      </div>
    {/each}
  </section>
</section>

<style>
  .dates-view {
    display: grid;
    gap: 18px;
  }

  .dates-hero,
  .date-feature,
  .date-row,
  .date-empty {
    border: 1px solid var(--line);
    background: rgba(255, 253, 247, 0.92);
    box-shadow: 0 18px 48px rgba(38, 29, 20, 0.08);
  }

  .dates-hero {
    min-height: 210px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 24px;
    align-items: center;
    border-radius: 20px;
    padding: 28px;
    background:
      linear-gradient(105deg, rgba(251, 241, 228, 0.96), rgba(215, 242, 220, 0.62)),
      radial-gradient(circle at 86% 18%, rgba(143, 165, 126, 0.22), transparent 30%);
  }

  .dates-hero span,
  .date-feature span,
  .date-count span {
    color: var(--muted);
    font-weight: 900;
  }

  .dates-hero > div:first-child strong {
    display: block;
    color: #2d6382;
    font-size: 96px;
    line-height: 0.9;
  }

  .today-meta h2 {
    margin: 0;
    color: #2d6382;
    font-size: 30px;
  }

  .today-meta p,
  .today-meta small,
  .date-feature p {
    color: var(--muted);
  }

  .year-line {
    width: min(360px, 100%);
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(45, 99, 130, 0.12);
    margin: 18px 0 8px;
  }

  .year-line span {
    display: block;
    height: 100%;
    background: #7ea79d;
  }

  .dates-hero button,
  .date-empty button {
    min-height: 42px;
    border: 0;
    border-radius: 999px;
    padding: 0 18px;
    background: #7ea79d;
    color: #fff8eb;
    font-weight: 950;
  }

  .date-feature {
    position: relative;
    overflow: hidden;
    border-radius: 24px;
    padding: 22px 24px;
    min-height: 210px;
    background:
      linear-gradient(rgba(251, 241, 228, 0.65), rgba(251, 241, 228, 0.84)),
      url('/visuals/reminder-paper.svg'),
      #fbf1e4;
    background-size: cover;
    background-position: center;
  }

  .date-feature h1 {
    margin: 12px 0 0;
    color: #2d6382;
  }

  .feature-count {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 14px;
    margin: 18px 0 12px;
    color: #2d6382;
  }

  .feature-count strong {
    font-size: clamp(72px, 11vw, 124px);
    line-height: 0.82;
  }

  .feature-count em {
    font-style: normal;
    font-size: 34px;
  }

  .date-list {
    display: grid;
    gap: 14px;
  }

  .date-row {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr) auto auto;
    gap: 16px;
    align-items: center;
    border-radius: 16px;
    padding: 18px;
  }

  .date-row.pinned {
    background: linear-gradient(105deg, rgba(244, 223, 189, 0.7), rgba(255, 253, 247, 0.96));
  }

  .date-icon {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    background: rgba(45, 99, 130, 0.1);
    color: #2d6382;
  }

  .date-icon svg {
    width: 28px;
    height: 28px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }

  .date-main strong {
    display: block;
    color: #2d6382;
    font-size: 20px;
    line-height: 1.15;
  }

  .date-main span {
    display: block;
    margin-top: 6px;
    color: var(--muted);
    line-height: 1.35;
  }

  .date-count {
    min-width: 120px;
    color: #6d9f99;
    text-align: right;
    white-space: nowrap;
  }

  .date-count strong {
    margin-left: 6px;
    font-size: 48px;
    line-height: 1;
  }

  .date-count em {
    margin-left: 4px;
    color: var(--ink);
    font-style: normal;
    font-weight: 900;
  }

  .date-actions {
    display: flex;
    gap: 6px;
  }

  .date-actions button {
    min-height: 30px;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 0 10px;
    background: #fff8eb;
    color: var(--muted);
    font-weight: 900;
  }

  .date-empty {
    border-radius: 16px;
    padding: 22px;
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
  }

  @media (max-width: 760px) {
    .dates-hero {
      min-height: 152px;
      grid-template-columns: auto minmax(0, 1fr);
      padding: 20px;
    }

    .dates-hero button {
      grid-column: 1 / -1;
      justify-self: start;
    }

    .dates-hero > div:first-child strong {
      font-size: 78px;
    }

    .date-feature {
      border-radius: 18px;
      min-height: 128px;
      padding: 16px;
    }

    .date-feature h1 {
      margin-top: 6px;
      font-size: 22px;
    }

    .feature-count {
      justify-content: flex-start;
      margin: 12px 0 8px;
    }

    .feature-count strong {
      font-size: 58px;
    }

    .feature-count em {
      font-size: 20px;
    }

    .date-row {
      grid-template-columns: 44px minmax(0, 1fr) auto;
      gap: 12px;
      padding: 14px;
    }

    .date-icon {
      width: 42px;
      height: 42px;
    }

    .date-main strong {
      font-size: 17px;
    }

    .date-main span {
      font-size: 12px;
    }

    .date-count {
      min-width: 76px;
    }

    .date-count span {
      display: none;
    }

    .date-count strong {
      font-size: 36px;
    }

    .date-actions {
      grid-column: 2 / -1;
      justify-content: flex-start;
    }
  }
</style>
