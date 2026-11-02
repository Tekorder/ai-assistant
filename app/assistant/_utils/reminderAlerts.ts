// Reminder alert state that lives on this device only (localStorage):
//   - habit reminders dismissed today (standalone reminders keep dismissedOn on the reminder)
//   - reminders already alerted today, so a reload or a second tab doesn't alert again
//   - notification preferences (browser notifications, sound)
// Every read tolerates missing / blocked storage.

export const REMINDER_ALERTS_EVENT = 'youtask_reminder_alerts_updated';

const DISMISSED_KEY = 'youtask_habit_reminders_dismissed_v1';
const FIRED_KEY = 'youtask_reminders_fired_v1';
const PREFS_KEY = 'youtask_notify_prefs_v1';

type DayKeys = { date: string; keys: string[] };

function readDayKeys(storageKey: string, ymd: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) as DayKeys : null;
    return new Set(parsed?.date === ymd && Array.isArray(parsed.keys) ? parsed.keys : []);
  } catch {
    return new Set();
  }
}

function writeDayKeys(storageKey: string, ymd: string, keys: Set<string>): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ date: ymd, keys: [...keys] } satisfies DayKeys));
    window.dispatchEvent(new Event(REMINDER_ALERTS_EVENT));
  } catch {}
}

/** Habit reminder keys ("h:<habitId>@<HH:MM>") dismissed on `ymd`. */
export function readDismissedHabitReminders(ymd: string): Set<string> {
  return readDayKeys(DISMISSED_KEY, ymd);
}

export function dismissHabitReminders(ymd: string, keys: string[]): void {
  const set = readDismissedHabitReminders(ymd);
  keys.forEach(k => set.add(k));
  writeDayKeys(DISMISSED_KEY, ymd, set);
}

/**
 * Claims a reminder for alerting: true the first time a key is claimed on `ymd`
 * (in any tab of this browser), false after that.
 */
export function claimReminderAlert(ymd: string, key: string): boolean {
  const fired = readDayKeys(FIRED_KEY, ymd);
  if (fired.has(key)) return false;
  fired.add(key);
  try { localStorage.setItem(FIRED_KEY, JSON.stringify({ date: ymd, keys: [...fired] } satisfies DayKeys)); } catch {}
  return true;
}

export type NotifyPrefs = {
  /** Show a browser (system) notification while the YouTask tab is in the background */
  browser: boolean;
  /** Play a sound with in-app reminder alerts */
  sound: boolean;
};

const DEFAULT_PREFS: NotifyPrefs = { browser: false, sound: true };

export function readNotifyPrefs(): NotifyPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<NotifyPrefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writeNotifyPrefs(prefs: NotifyPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new Event(REMINDER_ALERTS_EVENT));
  } catch {}
}

/** The browser's notification permission, or 'unsupported'. */
export function browserPermission(): NotificationPermission | 'unsupported' {
  return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
}
