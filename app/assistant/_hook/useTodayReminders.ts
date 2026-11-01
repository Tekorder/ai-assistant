'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { readRemindersLS, writeRemindersLS, type Habit } from '@/lib/datacenter';
import { useHabits, useToday } from './useHabits';
import { useReminderItems } from './useReminderItems';
import { type HabitLogIndex, indexHabitLogs } from '../_utils/habitSchedule';
import { completeHabit, isCheckedIn } from '../_utils/habitActions';
import { type DayReminder, remindersOn } from '../_utils/reminderSchedule';
import { REMINDER_ALERTS_EVENT, dismissHabitReminders, readDismissedHabitReminders } from '../_utils/reminderAlerts';

/**
 * upcoming  its time hasn't come yet
 * due       its time has passed and it isn't handled — what the bell counts
 * done      dismissed, or (habit reminders) the habit is already checked in
 */
export type ReminderState = 'upcoming' | 'due' | 'done';
export type TodayReminder = DayReminder & { state: ReminderState; habit?: Habit };

/** "HH:MM" now, re-read every 30 s and when the tab wakes up. */
export function useClockHHMM(): string {
  const read = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const tick = () => setNow(read());
    const t = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return now;
}

/**
 * Today's reminders — standalone and habit ones — each with its state, plus the
 * actions the bell and the alerts offer.
 */
export function useTodayReminders() {
  const reminders = useReminderItems();
  const { habits, logs } = useHabits();
  const today = useToday();
  const now = useClockHHMM();
  const index: HabitLogIndex = useMemo(() => indexHabitLogs(logs), [logs]);

  // Habit reminders dismissed today on this device
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const sync = () => setDismissed(readDismissedHabitReminders(today));
    sync();
    window.addEventListener(REMINDER_ALERTS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(REMINDER_ALERTS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [today]);

  const items: TodayReminder[] = useMemo(() => {
    return remindersOn(today, reminders, habits).map(r => {
      const habit = r.habitId ? habits.find(h => h.id === r.habitId) : undefined;
      const handled = r.kind === 'habit'
        ? dismissed.has(r.key) || Boolean(habit && isCheckedIn(habit, index, today))
        : Boolean(r.dismissed);
      const state: ReminderState = handled ? 'done' : r.time <= now ? 'due' : 'upcoming';
      return { ...r, state, habit };
    });
  }, [today, reminders, habits, index, now, dismissed]);

  const dismiss = useCallback((list: TodayReminder[]) => {
    const habitKeys = list.filter(r => r.kind === 'habit').map(r => r.key);
    if (habitKeys.length) dismissHabitReminders(today, habitKeys);
    const ids = new Set(list.filter(r => r.reminderId).map(r => r.reminderId!));
    if (ids.size) {
      const all = readRemindersLS().reminders;
      writeRemindersLS({ reminders: all.map(r => (ids.has(r.id) ? { ...r, dismissedOn: today } : r)) });
    }
  }, [today]);

  /** Checks the habit in for today (completes its goal). */
  const checkIn = useCallback((r: TodayReminder) => {
    if (r.habit) completeHabit(r.habit, index, today);
  }, [index, today]);

  return { items, today, now, dismiss, checkIn };
}
