// Habit schedule & progress — pure functions (no React, no storage).
// Dates are local YYYY-MM-DD strings; weeks run Monday → Sunday like the rest of the app.

import { addDaysYMD, parseYMD, type Habit, type HabitLog, type HabitPeriod, type HabitTimeRange } from '@/lib/datacenter';

/* ===================== Log lookup ===================== */

/** habitId → date → log. Build once per render with indexHabitLogs(). */
export type HabitLogIndex = Map<string, Map<string, HabitLog>>;

export function indexHabitLogs(logs: HabitLog[]): HabitLogIndex {
  const index: HabitLogIndex = new Map();
  for (const l of logs) {
    let byDate = index.get(l.habitId);
    if (!byDate) index.set(l.habitId, (byDate = new Map()));
    byDate.set(l.date, l);
  }
  return index;
}

export function logOn(index: HabitLogIndex, habitId: string, ymd: string): HabitLog | undefined {
  return index.get(habitId)?.get(ymd);
}

/** Logged amount on one day (a skipped day counts as nothing). */
export function valueOn(index: HabitLogIndex, habitId: string, ymd: string): number {
  const l = logOn(index, habitId, ymd);
  return l && !l.skipped ? l.value : 0;
}

/* ===================== Periods ===================== */

/** Mon = 0 … Sun = 6 */
export function mondayIndex(ymd: string): number {
  return (parseYMD(ymd).getDay() + 6) % 7;
}

/** First and last day (inclusive) of the day/week/month that contains `ymd`. */
export function periodBounds(period: HabitPeriod, ymd: string): { from: string; to: string } {
  if (period === 'day') return { from: ymd, to: ymd };
  if (period === 'week') {
    const from = addDaysYMD(ymd, -mondayIndex(ymd));
    return { from, to: addDaysYMD(from, 6) };
  }
  const [y, m] = ymd.split('-').map(Number);
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(daysInMonth(y, m - 1)).padStart(2, '0')}` };
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/** A month as calendar weeks, Monday first: its days, padded with null to whole weeks. */
export function monthGrid(anyDayOfMonth: string): (string | null)[] {
  const { from, to } = periodBounds('month', anyDayOfMonth);
  const days: (string | null)[] = Array(mondayIndex(from)).fill(null);
  days.push(...eachDay(from, to));
  while (days.length % 7) days.push(null);
  return days;
}

/** First day of the month `delta` months away from the month of `ymd`. */
export function shiftMonth(ymd: string, delta: number): string {
  const [y, m] = ymd.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Every day from `from` to `to`, inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysYMD(d, 1)) out.push(d);
  return out;
}

/** Amount logged for `habit` over the goal period containing `ymd`. */
export function periodTotal(habit: Habit, index: HabitLogIndex, ymd: string): number {
  const byDate = index.get(habit.id);
  if (!byDate) return 0;
  const { from, to } = periodBounds(habit.goalPeriod, ymd);
  let total = 0;
  for (const [date, l] of byDate) {
    if (date >= from && date <= to && !l.skipped) total += l.value;
  }
  return total;
}

/** Build: reached the goal. Quit: stayed within the limit (nothing logged counts). */
export function isGoalMet(habit: Habit, total: number): boolean {
  return habit.kind === 'quit' ? total <= habit.goalValue : total >= habit.goalValue;
}

/* ===================== Due days ===================== */

/** Within the habit's term (start … end). */
export function inTerm(habit: Habit, ymd: string): boolean {
  return ymd >= habit.startDate && (!habit.endDate || ymd <= habit.endDate);
}

/**
 * Whether the habit is on the schedule that day. Task days only narrow daily
 * goals — a weekly/monthly goal can be worked on any day of its period.
 */
export function isDueOn(habit: Habit, ymd: string): boolean {
  if (!inTerm(habit, ymd)) return false;
  if (habit.goalPeriod !== 'day' || habit.taskDays.length === 0) return true;
  return habit.taskDays.includes(parseYMD(ymd).getDay());
}

/** Habits shown for a day: not archived and on the schedule. */
export function habitsDueOn(habits: Habit[], ymd: string): Habit[] {
  return habits.filter(h => !h.archived && isDueOn(h, ymd));
}

/* ===================== Day status ===================== */

/**
 * done     goal reached (quit: a past day within the limit)
 * partial  something logged, goal not reached
 * missed   a past due day with nothing (quit: over the limit)
 * pending  today, not done yet (quit: within the limit so far)
 * skipped  skipped on purpose
 * off      not due that day (or a weekly/monthly goal with nothing logged that day)
 * future   after today
 */
export type DayStatus = 'done' | 'partial' | 'missed' | 'pending' | 'skipped' | 'off' | 'future';

export function dayStatus(habit: Habit, index: HabitLogIndex, ymd: string, today: string): DayStatus {
  if (ymd > today) return 'future';
  const log = logOn(index, habit.id, ymd);
  const value = log && !log.skipped ? log.value : 0;
  if (!isDueOn(habit, ymd)) return value > 0 && habit.kind === 'build' ? 'done' : 'off';
  if (log?.skipped) return 'skipped';

  if (habit.goalPeriod === 'day') {
    if (habit.kind === 'quit') {
      if (value > habit.goalValue) return 'missed';
      return ymd === today ? 'pending' : 'done';
    }
    if (value >= habit.goalValue) return 'done';
    if (value > 0) return 'partial';
    return ymd === today ? 'pending' : 'missed';
  }

  // Weekly / monthly goals: a day shows what was logged on it, judged by its period
  const met = isGoalMet(habit, periodTotal(habit, index, ymd));
  if (habit.kind === 'quit') {
    if (!met) return 'missed';
    return periodBounds(habit.goalPeriod, ymd).to < today ? 'done' : 'pending';
  }
  if (value > 0) return met ? 'done' : 'partial';
  return !met && ymd === today ? 'pending' : 'off';
}

/** Statuses that count toward a day's "due" total. */
export function countsAsDue(s: DayStatus): boolean {
  return s === 'done' || s === 'partial' || s === 'missed' || s === 'pending';
}

export type HabitProgress = {
  /** Logged over the current goal period */
  total: number;
  goal: number;
  /** 0–1 toward the goal (quit: 1 while within the limit, 0 once over) */
  ratio: number;
  met: boolean;
};

export function progressOn(habit: Habit, index: HabitLogIndex, ymd: string): HabitProgress {
  const total = periodTotal(habit, index, ymd);
  const met = isGoalMet(habit, total);
  const ratio = habit.kind === 'quit'
    ? (met ? 1 : 0)
    : habit.goalValue > 0 ? Math.min(1, total / habit.goalValue) : 1;
  return { total, goal: habit.goalValue, ratio, met };
}

/** Done habits vs due habits on a day (archived habits left out). */
export function dayCompletion(habits: Habit[], index: HabitLogIndex, ymd: string, today: string): { done: number; due: number } {
  let done = 0;
  let due = 0;
  for (const h of habits) {
    if (h.archived) continue;
    const s = dayStatus(h, index, ymd, today);
    if (!countsAsDue(s)) continue;
    due += 1;
    if (s === 'done') done += 1;
  }
  return { done, due };
}

/* ===================== Labels ===================== */

const amountFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** "3 times", "1 time", "2.5 h", "1,500 ml" */
export function formatAmount(value: number, unit: string): string {
  if (unit === 'times') return `${amountFmt.format(value)} ${value === 1 ? 'time' : 'times'}`;
  return `${amountFmt.format(value)} ${unit}`;
}

/** "750/3,000 ml" — progress toward a goal, unit once. */
export function formatProgress(total: number, goal: number, unit: string): string {
  return `${amountFmt.format(total)}/${amountFmt.format(goal)}${unit === 'times' ? '' : ` ${unit}`}`;
}

const PERIOD_WORD: Record<HabitPeriod, string> = { day: 'day', week: 'week', month: 'month' };

/** "Complete 3,000 ml each day" · "At most 2 times each week" · "Never, each day" */
export function goalSentence(habit: Pick<Habit, 'kind' | 'goalValue' | 'goalUnit' | 'goalPeriod'>): string {
  const per = `each ${PERIOD_WORD[habit.goalPeriod]}`;
  if (habit.kind === 'quit') {
    return habit.goalValue === 0 ? `Not at all, ${per}` : `At most ${formatAmount(habit.goalValue, habit.goalUnit)} ${per}`;
  }
  return `Complete ${formatAmount(habit.goalValue, habit.goalUnit)} ${per}`;
}

export const TIME_RANGES: { value: HabitTimeRange; label: string }[] = [
  { value: 'anytime', label: 'Anytime' },
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
];

/** Time range whose part of the day it is now, for ordering Today's sections. */
export function currentTimeRange(now = new Date()): HabitTimeRange {
  const h = now.getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}
