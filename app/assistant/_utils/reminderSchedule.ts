// Which reminders fall on a day — standalone reminders and habit reminders together.
// Pure functions; the calendar and the bell both read from here.

import { isValidDateYYYYMMDD, isValidTimeHHMM, parseYMD, type Habit, type ReminderItem, type TaskFlagColor } from '@/lib/datacenter';
import { isDueOn } from './habitSchedule';

export type DayReminder = {
  /** Unique for the day: "r:<id>" or "h:<habitId>@<HH:MM>" */
  key: string;
  kind: 'reminder' | 'habit';
  /** "HH:MM" (24h) */
  time: string;
  title: string;
  /** Habit reminders: the habit's message, if it has one */
  message?: string;
  flag?: TaskFlagColor;
  emoji?: string;
  color?: string;
  reminderId?: string;
  habitId?: string;
  /** Standalone reminders: dismissed from the bell that day */
  dismissed?: boolean;
};

/**
 * A standalone reminder's days: a one-off on its date; a repeating one on its
 * weekdays (all of them when none are set) from its date on.
 */
export function reminderFallsOn(r: ReminderItem, ymd: string): boolean {
  if (!r.title.trim()) return false;
  if (!r.daily) return r.date === ymd;
  if (isValidDateYYYYMMDD(r.date) && ymd < r.date) return false;
  return !r.days?.length || r.days.includes(parseYMD(ymd).getDay());
}

/** Every reminder on `ymd`, sorted by time. Habit reminders only on the habit's due days. */
export function remindersOn(ymd: string, reminders: ReminderItem[], habits: Habit[]): DayReminder[] {
  const out: DayReminder[] = [];
  for (const r of reminders) {
    if (!reminderFallsOn(r, ymd)) continue;
    out.push({
      key: `r:${r.id}`,
      kind: 'reminder',
      time: isValidTimeHHMM(r.time) ? r.time : '11:00',
      title: r.title.trim(),
      flag: r.flag,
      reminderId: r.id,
      dismissed: r.dismissedOn === ymd,
    });
  }
  for (const h of habits) {
    if (h.archived || !h.remindersOn || !isDueOn(h, ymd)) continue;
    for (const time of h.reminderTimes) {
      out.push({
        key: `h:${h.id}@${time}`,
        kind: 'habit',
        time,
        title: h.text,
        message: h.reminderMessage,
        emoji: h.emoji,
        color: h.color,
        habitId: h.id,
      });
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
}
