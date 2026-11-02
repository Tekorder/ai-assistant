// lib/demoData.ts
// Demo workspace for Settings → "Load demo data": three groups with lists, subtasks,
// recurring and done tasks, habits, reminders and checklists (lib/demo-data.json).

import demo from './demo-data.json';
import { addDaysYMD, todayYMD, type BackupData } from './datacenter';

/** The day the demo's dates were written around; it's moved to today on load. */
const DEMO_BASE_DAY = '2026-11-01';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

/** Every YYYY-MM-DD string in `value`, moved by `delta` days (anything else untouched). */
function shiftDates<T>(value: T, delta: number): T {
  if (typeof value === 'string') return (YMD.test(value) ? addDaysYMD(value, delta) : value) as T;
  if (Array.isArray(value)) return value.map(v => shiftDates(v, delta)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shiftDates(v, delta)])) as T;
  }
  return value;
}

/**
 * The demo backup with its dates moved so its base day is today — "due tomorrow",
 * "done today" and the month's tasks always land where they read right.
 */
export function buildDemoData(today = todayYMD()): BackupData {
  const data = shiftDates(demo as unknown as BackupData, daysBetween(DEMO_BASE_DAY, today));
  return { ...data, exportedAt: new Date().toISOString() };
}
