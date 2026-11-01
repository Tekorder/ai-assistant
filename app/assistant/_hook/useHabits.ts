'use client';

import { useEffect, useState } from 'react';
import {
  HABITS_EVENT,
  HABIT_LOGS_EVENT,
  LS_KEY_HABITS,
  LS_KEY_HABIT_LOGS,
  readHabitLogsLS,
  readHabitsLS,
  todayYMD,
  type Habit,
  type HabitCheckInMethod,
  type HabitLog,
} from '@/lib/datacenter';

export type HabitsData = {
  /** Every habit, archived included, in the user's order */
  habits: Habit[];
  logs: HabitLog[];
  checkInMethod: HabitCheckInMethod;
};

/**
 * Habits and their logs, re-read whenever either changes (this tab or another).
 * Change them through datacenter (upsertHabitLS, setHabitLogLS, …).
 */
export function useHabits(): HabitsData {
  const [data, setData] = useState<HabitsData>({ habits: [], logs: [], checkInMethod: 'tap' });

  useEffect(() => {
    const sync = () => {
      const { habits, checkInMethod } = readHabitsLS();
      setData({ habits, logs: readHabitLogsLS().logs, checkInMethod: checkInMethod ?? 'tap' });
    };
    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY_HABITS || e.key === LS_KEY_HABIT_LOGS) sync();
    };
    window.addEventListener(HABITS_EVENT, sync);
    window.addEventListener(HABIT_LOGS_EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(HABITS_EVENT, sync);
      window.removeEventListener(HABIT_LOGS_EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return data;
}

/** Today's YYYY-MM-DD, rolling over at midnight and when the tab wakes up. */
export function useToday(): string {
  const [today, setToday] = useState(todayYMD);
  useEffect(() => {
    const check = () => setToday(todayYMD());
    const t = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return today;
}
