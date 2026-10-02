// Monthly productivity stats for the Profile dashboard.
// Tasks have no completion timestamp, so a checked task counts as done on its due date
// (same convention as the Activity panel).
import {
  type Project,
  type ReminderItem,
  type TaskFlagColor,
  UNC_TITLE,
  getTaskFlag,
  isUncTitleBlock,
  isValidDateYYYYMMDD,
  todayYMD,
} from '@/lib/datacenter';

export type TaskRow = {
  id: string;
  done: boolean;
  onHold: boolean;
  due?: string;
  created?: string;
  flag?: TaskFlagColor;
  listId: string;
  listTitle: string;
  projectId: string;
  projectTitle: string;
};

export type MonthRef = { y: number; m: number }; // m: 0-11

export type BreakdownRow = { id: string; title: string; sub?: string; done: number; total: number };

export type MonthStats = {
  key: string; // YYYY-MM
  label: string; // "September 2026"
  shortLabel: string; // "Sep"
  daysInMonth: number;
  /** Day of month that is "today" when this is the current month, else daysInMonth (or 0 for future). */
  elapsedDays: number;
  due: number;
  completed: number;
  pending: number;
  overdue: number;
  onHold: number;
  completionRate: number | null; // 0-1, null when nothing was due
  created: number;
  reminders: number;
  activeDays: number;
  bestDay: { day: number; count: number } | null;
  longestStreak: number;
  avgPerActiveDay: number;
  daily: number[]; // completions per day of month
  weekday: number[]; // completions Mon..Sun
  byList: BreakdownRow[];
  byProject: BreakdownRow[];
  flags: Record<TaskFlagColor, { done: number; total: number }>;
};

export function collectTasks(projects: Project[]): TaskRow[] {
  const rows: TaskRow[] = [];
  for (const p of projects) {
    let listId = '';
    let listTitle = UNC_TITLE;
    for (const b of p.blocks ?? []) {
      if (b.indent === 0) {
        listId = b.id;
        listTitle = isUncTitleBlock(b) ? UNC_TITLE : (b.text || '').trim() || 'Untitled list';
        continue;
      }
      if (b.archived === true) continue;
      if (!(b.text || '').trim()) continue; // empty placeholder rows
      rows.push({
        id: b.id,
        done: b.checked === true,
        onHold: b.onHold === true,
        due: isValidDateYYYYMMDD(b.deadline) ? b.deadline : undefined,
        created: isValidDateYYYYMMDD(b.createdAt) ? b.createdAt : undefined,
        flag: getTaskFlag(b),
        listId: `${p.project_id}:${listId}`,
        listTitle,
        projectId: p.project_id,
        projectTitle: p.title || 'Untitled group',
      });
    }
  }
  return rows;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
export const monthKey = ({ y, m }: MonthRef) => `${y}-${pad2(m + 1)}`;
const addMonths = ({ y, m }: MonthRef, delta: number): MonthRef => {
  const t = y * 12 + m + delta;
  return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
};
const cmpMonth = (a: MonthRef, b: MonthRef) => a.y * 12 + a.m - (b.y * 12 + b.m);
const parseMonth = (ymd: string): MonthRef => ({ y: Number(ymd.slice(0, 4)), m: Number(ymd.slice(5, 7)) - 1 });

/** From the earliest month with data (at least 5 months back, at most 24) through the current month. */
export function monthRange(tasks: TaskRow[], now = new Date()): MonthRef[] {
  const current: MonthRef = { y: now.getFullYear(), m: now.getMonth() };
  let first = addMonths(current, -5);
  const floor = addMonths(current, -23);
  for (const t of tasks) {
    for (const d of [t.due, t.created]) {
      if (!d) continue;
      const mr = parseMonth(d);
      if (cmpMonth(mr, first) < 0) first = mr;
    }
  }
  if (cmpMonth(first, floor) < 0) first = floor;
  const out: MonthRef[] = [];
  for (let mr = first; cmpMonth(mr, current) <= 0; mr = addMonths(mr, 1)) out.push(mr);
  return out;
}

function breakdown(
  rows: TaskRow[],
  idOf: (t: TaskRow) => string,
  titleOf: (t: TaskRow) => string,
  subOf?: (t: TaskRow) => string,
  limit = 6,
): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>();
  for (const t of rows) {
    const id = idOf(t);
    const row = map.get(id) ?? { id, title: titleOf(t), sub: subOf?.(t), done: 0, total: 0 };
    row.total++;
    if (t.done) row.done++;
    map.set(id, row);
  }
  return [...map.values()]
    .sort((a, b) => b.done - a.done || b.total - a.total || a.title.localeCompare(b.title))
    .slice(0, limit);
}

export function computeMonthStats(
  tasks: TaskRow[],
  reminders: ReminderItem[],
  month: MonthRef,
  now = new Date(),
): MonthStats {
  const key = monthKey(month);
  const today = todayYMD();
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const current: MonthRef = { y: now.getFullYear(), m: now.getMonth() };
  const rel = cmpMonth(month, current);
  const elapsedDays = rel < 0 ? daysInMonth : rel === 0 ? now.getDate() : 0;

  const inMonth = (d?: string) => !!d && d.startsWith(key);
  const dueRows = tasks.filter(t => inMonth(t.due));
  const doneRows = dueRows.filter(t => t.done);

  const daily = new Array(daysInMonth).fill(0);
  const weekday = new Array(7).fill(0);
  for (const t of doneRows) {
    const day = Number(t.due!.slice(8, 10));
    daily[day - 1]++;
    const wd = new Date(month.y, month.m, day).getDay(); // 0 = Sun
    weekday[(wd + 6) % 7]++;
  }

  let activeDays = 0;
  let longestStreak = 0;
  let run = 0;
  let bestDay: MonthStats['bestDay'] = null;
  daily.forEach((c, i) => {
    if (c > 0) {
      activeDays++;
      run++;
      longestStreak = Math.max(longestStreak, run);
      if (!bestDay || c > bestDay.count) bestDay = { day: i + 1, count: c };
    } else run = 0;
  });

  const flags: MonthStats['flags'] = {
    red: { done: 0, total: 0 },
    yellow: { done: 0, total: 0 },
    blue: { done: 0, total: 0 },
  };
  for (const t of dueRows) {
    if (!t.flag) continue;
    flags[t.flag].total++;
    if (t.done) flags[t.flag].done++;
  }

  const open = dueRows.filter(t => !t.done);
  const onHold = open.filter(t => t.onHold).length;
  const overdue = open.filter(t => !t.onHold && t.due! < today).length;

  const d = new Date(month.y, month.m, 1);
  return {
    key,
    label: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d),
    shortLabel: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d),
    daysInMonth,
    elapsedDays,
    due: dueRows.length,
    completed: doneRows.length,
    pending: open.length - onHold - overdue,
    overdue,
    onHold,
    completionRate: dueRows.length ? doneRows.length / dueRows.length : null,
    created: tasks.filter(t => inMonth(t.created)).length,
    reminders: reminders.filter(r => (r.title || '').trim() && inMonth(r.date)).length,
    activeDays,
    bestDay,
    longestStreak,
    avgPerActiveDay: activeDays ? doneRows.length / activeDays : 0,
    daily,
    weekday,
    byList: breakdown(dueRows, t => t.listId, t => t.listTitle, t => t.projectTitle),
    byProject: breakdown(dueRows, t => t.projectId, t => t.projectTitle),
    flags,
  };
}
