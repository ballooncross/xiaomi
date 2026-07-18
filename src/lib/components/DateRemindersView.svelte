<script lang="ts">
  import { Solar } from 'lunar-javascript';
  import type { DateReminder } from '$lib/server/types';
  import type { Milestone } from '$lib/server/milestones';

  type ReminderView = DateReminder & {
    nextDate: string;
    daysLeft: number;
    dateLabel: string;
    daysSince?: number;
    ageLabel?: string;
    originDate?: string;
    upcomingMilestones: Milestone[];
  };

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

  const categoryLabels: Record<string, string> = {
    birthday: '生日',
    child_birthday: '宝宝生日',
    anniversary: '恋爱/婚姻',
    memorial: '逝世纪念',
    other: '其他'
  };

  const allMilestones = $derived(
    reminders
      .flatMap((r) => r.upcomingMilestones.map((m) => ({ ...m, reminderTitle: r.title })))
      .sort((a, b) => a.daysFromNow - b.daysFromNow)
      .slice(0, 6)
  );

  function calendarLabel(reminder: ReminderView) {
    return reminder.dateLabel.replace(/\s·\s.*/, '');
  }

  function categoryLabel(reminder: ReminderView) {
    return categoryLabels[reminder.category] ?? categoryLabels.other;
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
    <button class="btn btn-ghost" type="button" onclick={onAdd}>添加日期</button>
  </div>

  {#if nextReminder}
    <section class="date-feature">
      <span>最近提醒 · {categoryLabel(nextReminder)}</span>
      <h1>{nextReminder.title}</h1>
      <div class="feature-count">
        <strong>{nextReminder.daysLeft}</strong>
        <em>天</em>
      </div>
      <p>{nextReminder.dateLabel}</p>
      {#if nextReminder.ageLabel}
        <p class="feature-age">已过 {nextReminder.daysSince} 天 · {nextReminder.ageLabel}</p>
      {/if}
    </section>
  {/if}

  {#if allMilestones.length > 0}
    <section class="milestone-strip">
      <div class="milestone-head">
        <strong>即将到来的里程碑</strong>
        <span>近60天内</span>
      </div>
      <div class="milestone-list">
        {#each allMilestones as milestone}
          <article class="milestone-card" class:milestone-today={milestone.daysFromNow === 0}>
            <div class="milestone-days">
              <strong>{milestone.daysFromNow === 0 ? '今天' : milestone.daysFromNow}</strong>
              {#if milestone.daysFromNow > 0}<em>天后</em>{/if}
            </div>
            <div class="milestone-info">
              <strong>{milestone.label}</strong>
              <span>{milestone.reminderTitle} · 第{milestone.dayNumber}天</span>
            </div>
            <span class="milestone-kind milestone-kind-{milestone.kind}">
              {milestone.kind === 'vaccination' ? '疫苗' : milestone.kind === 'tradition' ? '传统' : milestone.kind === 'age' ? '成长' : milestone.kind === 'holiday' ? '节日' : '纪念'}
            </span>
          </article>
        {/each}
      </div>
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
          <span>{calendarLabel(reminder)} · {categoryLabel(reminder)}{reminder.repeat === 'annual' ? ' · 每年' : ''}</span>
          {#if reminder.ageLabel}
            <span class="date-age">{reminder.ageLabel} · 已过 {reminder.daysSince} 天</span>
          {/if}
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
        <button class="btn btn-primary" type="button" onclick={onAdd}>添加生日或纪念日</button>
      </div>
    {/each}
  </section>
</section>

<style>
  .dates-view {
    display: grid;
    gap: var(--space-4);
  }

  .dates-hero,
  .date-feature,
  .date-row,
  .date-empty {
    border: 1px solid var(--line);
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    box-shadow: var(--shadow-md);
  }

  .dates-hero {
    min-height: 210px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: var(--space-6);
    align-items: center;
    border-radius: var(--radius-xl);
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
    color: var(--sea);
    font-size: 96px;
    line-height: 0.9;
  }

  .today-meta h2 {
    margin: 0;
    color: var(--sea);
    font-size: var(--text-2xl);
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
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--sea) 12%, transparent);
    margin: 18px 0 var(--space-2);
  }

  .year-line span {
    display: block;
    height: 100%;
    background: var(--sage);
  }

  .dates-hero .btn,
  .date-empty .btn {
    min-height: var(--control-h-lg);
    padding: 0 18px;
  }

  .date-feature {
    position: relative;
    overflow: hidden;
    border-radius: var(--radius-xl);
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
    color: var(--sea);
  }

  .feature-count {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 14px;
    margin: 18px 0 12px;
    color: var(--sea);
  }

  .feature-count strong {
    font-size: clamp(72px, 11vw, 124px);
    line-height: 0.82;
  }

  .feature-count em {
    font-style: normal;
    font-size: 34px;
  }

  .feature-age {
    margin-top: 4px;
    font-size: 14px;
    color: #6d9f99;
    font-weight: 700;
  }

  .milestone-strip {
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: 20px;
    background: rgba(255, 253, 247, 0.92);
    box-shadow: 0 18px 48px rgba(38, 29, 20, 0.08);
  }

  .milestone-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 14px;
  }

  .milestone-head strong {
    color: var(--sea);
    font-size: 18px;
  }

  .milestone-head span {
    color: var(--muted);
    font-weight: 700;
  }

  .milestone-list {
    display: grid;
    gap: 10px;
  }

  .milestone-card {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr) auto;
    gap: 14px;
    align-items: center;
    padding: 12px 16px;
    border-radius: 12px;
    background: rgba(45, 99, 130, 0.04);
  }

  .milestone-card.milestone-today {
    background: linear-gradient(105deg, rgba(126, 167, 157, 0.18), rgba(244, 223, 189, 0.3));
  }

  .milestone-days {
    text-align: center;
    color: #6d9f99;
  }

  .milestone-days strong {
    font-size: 22px;
    line-height: 1;
  }

  .milestone-days em {
    display: block;
    font-style: normal;
    font-size: 12px;
    font-weight: 700;
  }

  .milestone-info strong {
    display: block;
    color: var(--sea);
    font-size: 15px;
  }

  .milestone-info span {
    color: var(--muted);
    font-size: 13px;
  }

  .milestone-kind {
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 900;
    white-space: nowrap;
  }

  .milestone-kind-vaccination {
    background: rgba(109, 159, 153, 0.15);
    color: #4d8a7e;
  }

  .milestone-kind-tradition {
    background: rgba(195, 155, 100, 0.18);
    color: #9a7540;
  }

  .milestone-kind-age {
    background: rgba(45, 99, 130, 0.1);
    color: var(--sea);
  }

  .milestone-kind-day_count {
    background: rgba(126, 167, 157, 0.15);
    color: #5a8f85;
  }

  .milestone-kind-holiday {
    background: rgba(200, 100, 100, 0.14);
    color: #b04040;
  }

  .date-age {
    color: #6d9f99 !important;
    font-weight: 700;
    font-size: 12px;
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
    color: var(--sea);
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
    color: var(--sea);
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
    background: var(--paper);
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
    .milestone-card {
      grid-template-columns: 56px minmax(0, 1fr) auto;
      gap: 10px;
      padding: 10px 12px;
    }

    .milestone-days strong {
      font-size: 18px;
    }

    .milestone-info strong {
      font-size: 13px;
    }

    .milestone-info span {
      font-size: 11px;
    }

    .milestone-kind {
      font-size: 10px;
      padding: 2px 6px;
    }

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
