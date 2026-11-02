// Check-in actions — what tapping/swiping a habit does to its logs.
// Thin layer over datacenter's setHabitLogLS; the rules live in habitSchedule.

import { setHabitLogLS, type Habit } from '@/lib/datacenter';
import { type HabitLogIndex, isGoalMet, logOn, periodTotal, valueOn } from './habitSchedule';

/** Done for the day it's viewed on: a daily goal met that day, a weekly/monthly goal met with this day helping. */
export function isCheckedIn(habit: Habit, index: HabitLogIndex, ymd: string): boolean {
  if (habit.kind === 'quit') return false;
  const day = valueOn(index, habit.id, ymd);
  if (day <= 0) return false;
  return habit.goalPeriod === 'day' ? day >= habit.goalValue : isGoalMet(habit, periodTotal(habit, index, ymd));
}

/** Logs whatever is still missing for the goal on `ymd` (never lowers what's there). */
export function completeHabit(habit: Habit, index: HabitLogIndex, ymd: string): void {
  const day = valueOn(index, habit.id, ymd);
  const missing = Math.max(0, habit.goalValue - periodTotal(habit, index, ymd));
  // A goal already reached by other days still marks this day as worked on
  setHabitLogLS(habit.id, ymd, { value: day + (missing || (day > 0 ? 0 : 1)), skipped: false });
}

/** Clears the day's amount; a memo on it stays. */
export function clearHabitDay(habit: Habit, ymd: string): void {
  setHabitLogLS(habit.id, ymd, { value: 0, skipped: false });
}

/** Adds (or with a negative amount, removes) an amount on `ymd`. */
export function addHabitAmount(habit: Habit, index: HabitLogIndex, ymd: string, amount: number): void {
  const next = Math.max(0, valueOn(index, habit.id, ymd) + amount);
  setHabitLogLS(habit.id, ymd, { value: Math.round(next * 100) / 100, skipped: false });
}

export function setHabitSkipped(habit: Habit, ymd: string, skipped: boolean): void {
  setHabitLogLS(habit.id, ymd, skipped ? { value: 0, skipped: true } : { skipped: false });
}

export function setHabitMemo(habit: Habit, ymd: string, memo: string): void {
  setHabitLogLS(habit.id, ymd, { memo: memo.trim() || undefined });
}

export function isSkipped(index: HabitLogIndex, habit: Habit, ymd: string): boolean {
  return Boolean(logOn(index, habit.id, ymd)?.skipped);
}

/**
 * The card's main action (tap, swipe, or its button):
 *   build + "done"  → complete, or undo when already done
 *   build + "add"   → handled by the caller (asks for an amount)
 *   quit            → logs one more slip
 * Returns whether the habit ended up checked in (to offer the memo prompt).
 */
export function checkInHabit(habit: Habit, index: HabitLogIndex, ymd: string): boolean {
  if (habit.kind === 'quit') {
    addHabitAmount(habit, index, ymd, 1);
    return false;
  }
  if (isCheckedIn(habit, index, ymd)) {
    clearHabitDay(habit, ymd);
    return false;
  }
  completeHabit(habit, index, ymd);
  return true;
}
