// Habit statistics — pure functions over habits + their log index (habitSchedule.ts).
// "Success" means a done day for daily goals, and a period that met its goal for
// weekly/monthly ones; streaks count in those same units.

import { addDaysYMD, type Habit, type HabitPeriod } from '@/lib/datacenter';
import {
  type DayStatus,
  type HabitLogIndex,
  countsAsDue,
  dayCompletion,
  dayStatus,
  daysInMonth,
  eachDay,
  inTerm,
  isGoalMet,
  periodBounds,
  periodTotal,
  valueOn,
} from './habitSchedule';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEK_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const ymdOf = (y: number, month0: number, day: number) =>
  `${y}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** First day of the month `delta` months from the month of `ymd`. */
function monthStart(ymd: string, delta = 0): string {
  const [y, m] = ymd.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return ymdOf(d.getFullYear(), d.getMonth(), 1);
}

/* ===================== Periods of a habit ===================== */

type PeriodResult = { from: string; to: string; met: boolean; ended: boolean };

/** Each goal period from the habit's start through today, met or not. */
function periodResults(habit: Habit, index: HabitLogIndex, today: string): PeriodResult[] {
  const out: PeriodResult[] = [];
  const last = habit.endDate && habit.endDate < today ? habit.endDate : today;
  let cursor = periodBounds(habit.goalPeriod, habit.startDate).from;
  while (cursor <= last) {
    const { from, to } = periodBounds(habit.goalPeriod, cursor);
    out.push({ from, to, met: isGoalMet(habit, periodTotal(habit, index, from)), ended: to < today });
    cursor = addDaysYMD(to, 1);
  }
  return out;
}

/* ===================== Streaks & success ===================== */

export type Streaks = { current: number; best: number; unit: HabitPeriod };

/**
 * Consecutive successes. Days that aren't due, skipped days and today (still open)
 * never break a streak; a missed day / unmet past period does.
 */
export function habitStreaks(habit: Habit, index: HabitLogIndex, today: string): Streaks {
  let run = 0;
  let best = 0;
  if (habit.goalPeriod === 'day') {
    const last = habit.endDate && habit.endDate < today ? habit.endDate : today;
    for (const d of eachDay(habit.startDate, last)) {
      const s = dayStatus(habit, index, d, today);
      if (s === 'done') best = Math.max(best, ++run);
      else if (s === 'missed' || s === 'partial') { if (d !== today) run = 0; }
    }
  } else {
    for (const p of periodResults(habit, index, today)) {
      if (p.met && (habit.kind === 'build' || p.ended)) best = Math.max(best, ++run);
      else if (p.ended) run = 0;
    }
  }
  return { current: run, best, unit: habit.goalPeriod };
}

/** "5 days" · "1 week" */
export function formatStreak(n: number, unit: HabitPeriod): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/** Successes between two dates (periods counted by the day they end on). */
export function successCount(habit: Habit, index: HabitLogIndex, today: string, from = '0000-01-01', to = '9999-12-31'): number {
  if (habit.goalPeriod === 'day') {
    const start = habit.startDate > from ? habit.startDate : from;
    const end = to < today ? to : today;
    if (start > end) return 0;
    return eachDay(start, end).filter(d => dayStatus(habit, index, d, today) === 'done').length;
  }
  return periodResults(habit, index, today)
    .filter(p => p.met && (habit.kind === 'build' || p.ended) && p.to >= from && p.from <= to).length;
}

/**
 * Share of judged days/periods in a month that succeeded: done ÷ (done + partial +
 * missed), up to today. Null when nothing in the month could be judged yet.
 */
export function monthlyRate(habit: Habit, index: HabitLogIndex, anyDayOfMonth: string, today: string): number | null {
  const { from, to } = periodBounds('month', anyDayOfMonth);
  if (habit.goalPeriod === 'day') {
    let ok = 0;
    let judged = 0;
    for (const d of eachDay(from, to < today ? to : today)) {
      const s = dayStatus(habit, index, d, today);
      if (s === 'done') { ok += 1; judged += 1; }
      else if (s === 'missed' || (s === 'partial' && d !== today)) judged += 1;
    }
    return judged ? ok / judged : null;
  }
  const periods = periodResults(habit, index, today).filter(p => p.to >= from && p.from <= to && (p.met || p.ended));
  if (!periods.length) return null;
  return periods.filter(p => p.met).length / periods.length;
}

/* ===================== Amounts ===================== */

export function volume(habit: Habit, index: HabitLogIndex, from = '0000-01-01', to = '9999-12-31'): number {
  let sum = 0;
  for (const [date, l] of index.get(habit.id) ?? []) {
    if (date >= from && date <= to && !l.skipped) sum += l.value;
  }
  return sum;
}

/** Average amount over the days something was logged. */
export function dailyAverage(habit: Habit, index: HabitLogIndex): number {
  let sum = 0;
  let days = 0;
  for (const l of index.get(habit.id)?.values() ?? []) {
    if (!l.skipped && l.value > 0) { sum += l.value; days += 1; }
  }
  return days ? sum / days : 0;
}

/** Days with a memo, newest first. */
export function habitMemos(habit: Habit, index: HabitLogIndex): { date: string; memo: string }[] {
  return [...(index.get(habit.id)?.values() ?? [])]
    .filter(l => l.memo)
    .map(l => ({ date: l.date, memo: l.memo! }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/* ===================== Chart series ===================== */

export type Series = { values: number[]; labels: string[]; dates: string[] };

/** Amount per day for `days` days ending on `end`. */
export function dailySeries(habit: Habit, index: HabitLogIndex, end: string, days: number): Series {
  const dates = eachDay(addDaysYMD(end, -(days - 1)), end);
  return {
    dates,
    values: dates.map(d => valueOn(index, habit.id, d)),
    labels: dates.map(d => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`),
  };
}

/** Amount per month for the 12 months ending with the month of `end`. */
export function monthlySeries(habit: Habit, index: HabitLogIndex, end: string): Series {
  const starts = Array.from({ length: 12 }, (_, i) => monthStart(end, i - 11));
  return {
    dates: starts,
    values: starts.map(s => volume(habit, index, s, periodBounds('month', s).to)),
    labels: starts.map(s => MONTH_SHORT[Number(s.slice(5, 7)) - 1]),
  };
}

export type TrendRange = 'week' | 'month' | 'year';

/** Trending chart: the last 7 days, last 30 days, or last 12 months. */
export function trendSeries(habit: Habit, index: HabitLogIndex, range: TrendRange, today: string): Series {
  if (range === 'year') return monthlySeries(habit, index, today);
  return dailySeries(habit, index, today, range === 'week' ? 7 : 30);
}

export type Comparison = { current: number[]; previous: number[]; labels: string[]; currentLabel: string; previousLabel: string };

/** This week/month/year against the one before, slot by slot (weekday, day of month, month). */
export function comparisonSeries(habit: Habit, index: HabitLogIndex, range: TrendRange, today: string): Comparison {
  if (range === 'week') {
    const mon = periodBounds('week', today).from;
    const days = (start: string) => Array.from({ length: 7 }, (_, i) => valueOn(index, habit.id, addDaysYMD(start, i)));
    return { current: days(mon), previous: days(addDaysYMD(mon, -7)), labels: WEEK_SHORT, currentLabel: 'This week', previousLabel: 'Last week' };
  }
  if (range === 'month') {
    const cur = monthStart(today);
    const prev = monthStart(today, -1);
    const days = (start: string) => {
      const [y, m] = start.split('-').map(Number);
      return Array.from({ length: 31 }, (_, i) => (i < daysInMonth(y, m - 1) ? valueOn(index, habit.id, ymdOf(y, m - 1, i + 1)) : 0));
    };
    return {
      current: days(cur), previous: days(prev),
      labels: Array.from({ length: 31 }, (_, i) => String(i + 1)),
      currentLabel: 'This month', previousLabel: 'Last month',
    };
  }
  const y = Number(today.slice(0, 4));
  const months = (year: number) => Array.from({ length: 12 }, (_, m) => volume(habit, index, ymdOf(year, m, 1), ymdOf(year, m, daysInMonth(year, m))));
  return { current: months(y), previous: months(y - 1), labels: MONTH_SHORT, currentLabel: String(y), previousLabel: String(y - 1) };
}

/* ===================== Grids (calendar, heatmap, tracker) ===================== */

/** Status of each day in a range — the month calendar, yearly heatmap and tracker rows. */
export function statusRange(habit: Habit, index: HabitLogIndex, from: string, to: string, today: string): { date: string; status: DayStatus }[] {
  return eachDay(from, to).map(date => ({ date, status: dayStatus(habit, index, date, today) }));
}

/** A week in the tracker: every due day of it done (and at least one was due). */
export function isPerfectWeek(habit: Habit, index: HabitLogIndex, monday: string, today: string): boolean {
  if (habit.goalPeriod !== 'day') {
    const to = addDaysYMD(monday, 6);
    return inTerm(habit, to < today ? to : today) && isGoalMet(habit, periodTotal(habit, index, monday))
      && (habit.kind === 'build' || to < today);
  }
  let due = 0;
  for (const d of eachDay(monday, addDaysYMD(monday, 6))) {
    const s = dayStatus(habit, index, d, today);
    if (s === 'future') return false;
    if (!countsAsDue(s)) continue;
    due += 1;
    if (s !== 'done') return false;
  }
  return due > 0;
}

/* ===================== All habits together ===================== */

export type OverallMonth = {
  /** done ÷ judged check-ins over the month so far (null = nothing judged) */
  rate: number | null;
  /** Days on which every due habit was done */
  perfectDays: number;
  /** Longest run of perfect days in the month */
  bestPerfectStreak: number;
  /** Done check-ins in the month */
  habitsDone: number;
  /** Done check-ins per elapsed day */
  dailyAverage: number;
  /** Per day of the month: done/due (due 0 = nothing scheduled) */
  days: { date: string; done: number; due: number }[];
};

export function overallMonth(habits: Habit[], index: HabitLogIndex, anyDayOfMonth: string, today: string): OverallMonth {
  const { from, to } = periodBounds('month', anyDayOfMonth);
  const days = eachDay(from, to).map(date => ({ date, ...dayCompletion(habits, index, date, today) }));
  let perfectDays = 0;
  let run = 0;
  let bestPerfectStreak = 0;
  let habitsDone = 0;
  let judged = 0;
  let elapsed = 0;
  for (const d of days) {
    if (d.date > today) break;
    elapsed += 1;
    habitsDone += d.done;
    // Today still open: count what's done, but don't judge what isn't yet
    judged += d.date === today ? d.done : d.due;
    if (d.due > 0 && d.done === d.due) {
      perfectDays += 1;
      bestPerfectStreak = Math.max(bestPerfectStreak, ++run);
    } else if (d.due > 0 && d.date !== today) run = 0;
  }
  return {
    rate: judged ? habitsDone / judged : null,
    perfectDays,
    bestPerfectStreak,
    habitsDone,
    dailyAverage: elapsed ? habitsDone / elapsed : 0,
    days,
  };
}

/** Months in a year, for the Yearly tracker: each habit's monthly rate. */
export function yearRates(habit: Habit, index: HabitLogIndex, year: number, today: string): (number | null)[] {
  return Array.from({ length: 12 }, (_, m) => {
    const first = ymdOf(year, m, 1);
    if (first > today || ymdOf(year, m, daysInMonth(year, m)) < habit.startDate) return null;
    return monthlyRate(habit, index, first, today);
  });
}

export { MONTH_SHORT, WEEK_SHORT };
