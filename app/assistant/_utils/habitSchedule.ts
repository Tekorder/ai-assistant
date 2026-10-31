// Habit schedule & progress — pure functions (no React, no storage).
// Dates are local YYYY-MM-DD strings; weeks run Monday → Sunday like the rest of the app.

import { addDaysYMD, parseYMD, type Habit, type HabitLog, type HabitPeriod } from '@/lib/datacenter';

/** First and last day (inclusive) of the day/week/month that contains `ymd`. */
export function periodBounds(period: HabitPeriod, ymd: string): { from: string; to: string } {
  if (period === 'day') return { from: ymd, to: ymd };
  if (period === 'week') {
    const back = (parseYMD(ymd).getDay() + 6) % 7;   // Mon = 0 … Sun = 6
    const from = addDaysYMD(ymd, -back);
    return { from, to: addDaysYMD(from, 6) };
  }
  const [y, m] = ymd.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

/** Amount logged for `habit` over the goal period containing `ymd`. */
export function periodTotal(habit: Habit, logs: HabitLog[], ymd: string): number {
  const { from, to } = periodBounds(habit.goalPeriod, ymd);
  let total = 0;
  for (const l of logs) {
    if (l.habitId === habit.id && l.date >= from && l.date <= to && !l.skipped) total += l.value;
  }
  return total;
}

/** Build: reached the goal. Quit: stayed within the limit (nothing logged counts). */
export function isGoalMet(habit: Habit, total: number): boolean {
  return habit.kind === 'quit' ? total <= habit.goalValue : total >= habit.goalValue;
}
