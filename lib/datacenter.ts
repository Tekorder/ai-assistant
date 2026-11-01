// lib/datacenter.ts
// ─────────────────────────────────────────────────────────────
//  Youtask — fuente única de verdad para el array de proyectos
//  Toda mutación, normalización y persistencia pasa por aquí.
// ─────────────────────────────────────────────────────────────

import { apiFetch } from './api';
import { getCurrentUid } from './sessionStore';

/* ===================== Constants ===================== */

export const LS_KEY_V2        = 'youtask_projects_v1';
export const LS_KEY_V1        = 'youtask_blocks_v1';      // legacy migration
export const LS_KEY_HABITS    = 'youtask_habits_v1';
export const LS_KEY_REMINDERS = 'youtask_reminders_v1';
export const LS_KEY_CHECKLISTS = 'youtask_checklists_v1';
export const UNC_TITLE        = 'Uncategorized';

/* ===================== Types ===================== */

export type TaskFlagColor = 'blue' | 'yellow' | 'red';

/** Manually-set status of a list (indent-0 block). */
export type ListStatus = 'in_progress' | 'on_hold' | 'someday' | 'archived';
/** What the UI shows: `completed` is derived — every task in the list is checked. */
export type ListDisplayStatus = ListStatus | 'completed';

export const LIST_STATUSES: ListStatus[] = ['in_progress', 'on_hold', 'someday', 'archived'];

export function parseListStatus(v: unknown): ListStatus | undefined {
  return typeof v === 'string' && (LIST_STATUSES as string[]).includes(v) ? (v as ListStatus) : undefined;
}

export type ListProgress = { done: number; total: number; status: ListDisplayStatus };

/** Tasks belong to the nearest preceding indent-0 block; archived tasks don't count. */
export function getListProgress(blocks: Block[], listId: string): ListProgress {
  const i = blocks.findIndex(b => b.id === listId);
  const list = blocks[i];
  let done = 0;
  let total = 0;
  if (list) {
    for (let j = i + 1; j < blocks.length && blocks[j].indent !== 0; j++) {
      if (blocks[j].archived === true || isSectionBlock(blocks[j])) continue;
      total++;
      if (blocks[j].checked === true) done++;
    }
  }
  const status: ListDisplayStatus =
    total > 0 && done === total ? 'completed' : (list?.listStatus ?? 'in_progress');
  return { done, total, status };
}

export type Block = {
  id: string;
  text: string;
  indent: number;
  parentId: string | null;
  order: number;
  checked?: boolean;
  deadline?: string;
  /** YYYY-MM-DD the task was checked (set on check, cleared on uncheck). Reports, Timeline and
   *  Calendar place done tasks by it — the due date no longer moves on check. */
  completedAt?: string;
  createdAt?: string;
  isHidden?: boolean;
  archived?: boolean;
  onHold?: boolean;
  /** @deprecated use `flag` — kept for legacy data */
  priority?: boolean;
  flag?: TaskFlagColor;
  listStatus?: ListStatus;
  /** Notes on a task (indent > 0), newest first */
  notes?: TaskNoteEntry[];
  /** Time on the due date, "HH:MM" (24h) */
  dueTime?: string;
  /** Recurring task: weekdays it repeats on (0 = Sun … 6 = Sat). `deadline` is the current occurrence. */
  repeatDays?: number[];
  /** Recurring task: occurrences already done (YYYY-MM-DD) — stored server-side in TaskCompletion */
  doneDates?: string[];
  /** A section divider inside a list (indent 1, not a task) — only Agenda shows it */
  section?: boolean;
};

/** One dated note on a task ("Oct 30 – Called the vendor") */
export type TaskNoteEntry = {
  id: string;
  text: string;
  /** YYYY-MM-DD it was written */
  date: string;
};

/**
 * A task's notes from stored data: the `notes` list, or — for data saved before tasks
 * had several notes — the single legacy `note` string as one entry dated `fallbackDate`.
 */
export function parseTaskNotes(rawNotes: unknown, legacyNote: unknown, fallbackDate: string): TaskNoteEntry[] {
  if (Array.isArray(rawNotes)) {
    return rawNotes
      .filter((n): n is Record<string, unknown> => Boolean(n) && typeof n === 'object')
      .filter(n => typeof n.text === 'string' && n.text.trim() !== '')
      .map(n => ({
        id: typeof n.id === 'string' && n.id ? n.id : uid(),
        text: n.text as string,
        date: isValidDateYYYYMMDD(n.date) ? (n.date as string) : fallbackDate,
      }));
  }
  if (typeof legacyNote === 'string' && legacyNote.trim() !== '') {
    return [{ id: uid(), text: legacyNote, date: fallbackDate }];
  }
  return [];
}

/** Section dividers sit among a list's tasks but are never tasks themselves. */
export function isSectionBlock(b: Pick<Block, 'section'>): boolean {
  return b.section === true;
}

export type Project = {
  project_id: string;
  title: string;
  blocks: Block[];
  collapsed: Record<string, boolean>;
  quickCollapsed?: Record<string, boolean>;
  visibleLists?: Record<string, boolean>;
};

export type ListSection = {
  list: Block;
  tasks: Block[];
};

export type DateMode = 'today' | 'week' | 'month' | 'all' | 'range';
/** Inclusive custom range for the "Ranges" filter (YYYY-MM-DD, from <= to) */
export type DateRange = { from: string; to: string };
export type SortBy = 'dueDate' | 'createdAt';
/** Which date a date filter goes by; Agenda uses both (due or created in the window) */
export type DateBasis = SortBy | 'both';

export type ProjectsPayload = {
  projects: Project[];
  selectedProjectId?: string;
};

export type HabitBlock = {
  id: string;
  text: string;
  indent: 1;
  checked: boolean;
  weekly?: boolean;
};

export type HabitsPayload = {
  habits: HabitBlock[];
  lastDailyResetYMD?: string;
  lastWeeklyResetYMD?: string;
};

export type ReminderItem = {
  id: string;
  title: string;
  date: string;
  time: string;
  daily?: boolean;
  /** Weekdays a daily reminder fires on (0 = Sun … 6 = Sat). Missing/empty = every day. */
  days?: number[];
  /** @deprecated use `flag` — kept for legacy data */
  priority?: boolean;
  flag?: TaskFlagColor;
  /** YYYY-MM-DD it was dismissed from the bell — only counts as dismissed on that day. */
  dismissedOn?: string;
};

export type RemindersPayload = {
  reminders: ReminderItem[];
};

export type ChecklistItem = {
  id: string;
  text: string;
  checked: boolean;
  /** Depth like tasks: 1 = item, 2 = sub-item… A sub-item belongs to the shallower item above it. Missing = 1 */
  indent?: number;
};

export const CHECKLIST_MAX_INDENT = 6;

export type Checklist = {
  id: string;
  name: string;
  items: ChecklistItem[];
};

export type ChecklistsPayload = {
  lists: Checklist[];
  selectedListId?: string;
};

/* ─── Internal raw types (for deserialization) ─── */

type RawBlock = {
  id?: unknown;
  text?: unknown;
  indent?: unknown;
  checked?: unknown;
  deadline?: unknown;
  completedAt?: unknown;
  createdAt?: unknown;
  isHidden?: unknown;
  archived?: unknown;
  onHold?: unknown;
  priority?: unknown;
  flag?: unknown;
  listStatus?: unknown;
  note?: unknown;
  notes?: unknown;
  dueTime?: unknown;
  repeatDays?: unknown;
  doneDates?: unknown;
  section?: unknown;
};

type RawProject = {
  project_id?: unknown;
  title?: unknown;
  blocks?: unknown;
  collapsed?: unknown;
  quickCollapsed?: unknown;
  visibleLists?: unknown;
  payload?: { blocks?: unknown };
};

type StoragePayload = {
  projects?: unknown;
  selectedProjectId?: unknown;
};

/* ===================== Pure utilities ===================== */



export function uid(len = 8): string {
  return Math.random().toString(36).slice(2, 2 + len);
}

export function pid(): string {
  return String(Math.floor(10000 + Math.random() * 90000));
}

export function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  if (from === to) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function isValidDateYYYYMMDD(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDaysYMD(baseYmd: string, deltaDays: number): string {
  if (!isValidDateYYYYMMDD(baseYmd)) return baseYmd;
  const [y, m, d] = baseYmd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseYMD(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayYMD(): string {
  return toYMD(new Date());
}

export function fmtColTitle(ymd: string): string {
  const wd = parseYMD(ymd).toLocaleDateString('en-US', { weekday: 'short' });
  return `${wd}, ${formatPill(ymd)}`;
}

/** The app's one date format: full month, day and year ("October 23, 2026"). */
export function formatPill(deadline?: string): string {
  if (!deadline || !isValidDateYYYYMMDD(deadline)) return '';
  const [y, m, d] = deadline.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** "HH:MM" (24h) → "6:30 AM". */
export function formatTime12(hhmm?: string): string {
  if (!isValidTimeHHMM(hhmm)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/* ===================== Recurring tasks =====================
 * A recurring task is one block with `repeatDays`. Its `deadline` is the current
 * occurrence; checking it records that date in `doneDates` (the TaskCompletion
 * table server-side) and moves the task on to its next open occurrence. */

/** Mon-first display order; values are JS weekdays (0 = Sun). */
export const WEEKDAYS: { value: number; short: string; long: string; letter: string }[] = [
  { value: 1, short: 'Mon', long: 'Monday',    letter: 'M' },
  { value: 2, short: 'Tue', long: 'Tuesday',   letter: 'T' },
  { value: 3, short: 'Wed', long: 'Wednesday', letter: 'W' },
  { value: 4, short: 'Thu', long: 'Thursday',  letter: 'T' },
  { value: 5, short: 'Fri', long: 'Friday',    letter: 'F' },
  { value: 6, short: 'Sat', long: 'Saturday',  letter: 'S' },
  { value: 0, short: 'Sun', long: 'Sunday',    letter: 'S' },
];

/** Valid, unique weekdays (0–6), sorted. */
export function parseRepeatDays(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
}

export function isRecurringTask(b: Pick<Block, 'repeatDays'>): boolean {
  return (b.repeatDays?.length ?? 0) > 0;
}

/** First day on or after `fromYmd` that falls on one of `days` and isn't already done. */
export function nextOccurrenceYMD(days: number[], fromYmd: string, done: string[] = []): string {
  if (!days.length || !isValidDateYYYYMMDD(fromYmd)) return fromYmd;
  const doneSet = new Set(done);
  let ymd = fromYmd;
  // Done dates can sit ahead of today (completed early), so look past one week
  for (let i = 0; i < 400; i++) {
    if (days.includes(parseYMD(ymd).getDay()) && !doneSet.has(ymd)) return ymd;
    ymd = addDaysYMD(ymd, 1);
  }
  return fromYmd;
}

/** "Every day", "Mon–Fri", "Weekends", "Every Monday", "Mon, Wed, Fri". */
export function repeatDaysLabel(days?: number[]): string {
  const set = new Set(days ?? []);
  if (set.size === 0) return '';
  if (set.size === 7) return 'Every day';
  if (set.size === 5 && [1, 2, 3, 4, 5].every(d => set.has(d))) return 'Mon–Fri';
  if (set.size === 2 && set.has(6) && set.has(0)) return 'Weekends';
  const picked = WEEKDAYS.filter(d => set.has(d.value));
  return picked.length === 1 ? `Every ${picked[0].long}` : picked.map(d => d.short).join(', ');
}

/**
 * Completes a recurring task's current occurrence: the date is recorded as done and the
 * task moves to its next open occurrence (never before today — missed ones aren't
 * brought back). It stays unchecked.
 */
export function completeOccurrence(b: Block): Block {
  const today = todayYMD();
  const occurrence = isValidDateYYYYMMDD(b.deadline) ? b.deadline : today;
  const doneDates = [...new Set([...(b.doneDates ?? []), occurrence])].sort();
  const dayAfter = addDaysYMD(occurrence, 1);
  const next = nextOccurrenceYMD(b.repeatDays ?? [], dayAfter > today ? dayAfter : today, doneDates);
  return { ...b, checked: false, isHidden: false, doneDates, deadline: next };
}

type RecurringFields = Pick<Block, 'repeatDays' | 'deadline' | 'doneDates'>;

/** Does a recurring task show on `ymd`? Its current occurrence, the repeat days after it, and the days it was done. */
export function recurringShowsOn(b: RecurringFields, ymd: string): boolean {
  if (!isRecurringTask(b) || !isValidDateYYYYMMDD(b.deadline)) return false;
  if (ymd === b.deadline || b.doneDates?.includes(ymd)) return true;
  return ymd > b.deadline && b.repeatDays!.includes(parseYMD(ymd).getDay());
}

/** Days in [from, to] a recurring task shows on (capped at ~13 months of days). */
export function recurringDaysInRange(b: RecurringFields, from: string, to: string): string[] {
  if (!isRecurringTask(b) || !isValidDateYYYYMMDD(b.deadline)) return [];
  const out: string[] = [];
  let ymd = from;
  for (let i = 0; i < 400 && ymd <= to; i++, ymd = addDaysYMD(ymd, 1)) {
    if (recurringShowsOn(b, ymd)) out.push(ymd);
  }
  return out;
}

/** Every day a recurring task shows on, for calendars: done days, then a year of repeats from its current occurrence. */
export function recurringCalendarDays(b: RecurringFields): string[] {
  if (!isRecurringTask(b) || !isValidDateYYYYMMDD(b.deadline)) return [];
  const past = (b.doneDates ?? []).filter(d => d < b.deadline!);
  return [...past, ...recurringDaysInRange(b, b.deadline, addDaysYMD(b.deadline, 366))];
}

export function isOccurrenceDone(b: RecurringFields, ymd: string): boolean {
  return b.doneDates?.includes(ymd) ?? false;
}

/** Marks one day of a recurring task done, or open again. */
export function toggleOccurrence(b: Block, ymd: string): Block {
  const done = b.doneDates ?? [];
  if (done.includes(ymd)) {
    // Reopened: if it's earlier than the current occurrence, the task goes back to it
    const deadline = isValidDateYYYYMMDD(b.deadline) && b.deadline < ymd ? b.deadline : ymd;
    return { ...b, doneDates: done.filter(d => d !== ymd), deadline };
  }
  if (ymd === b.deadline || !isValidDateYYYYMMDD(b.deadline)) return completeOccurrence(b);
  // A later day done ahead of time — the current occurrence stays
  return { ...b, doneDates: [...done, ymd].sort() };
}

export function dayDiffFromToday(yyyyMmDd?: string): number | null {
  if (!yyyyMmDd || !isValidDateYYYYMMDD(yyyyMmDd)) return null;
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const ms = new Date(y, m - 1, d).getTime() - startOfLocalDay(new Date()).getTime();
  return Math.round(ms / 86400000);
}

/** Date pill tone classes — colors live in globals.css (`.yt-pill-*`) with light-theme variants. */
export function pillClass(deadline?: string, checked?: boolean): string {
  if (checked) return 'yt-pill-done';
  const diff = dayDiffFromToday(deadline);
  if (diff === null) return 'yt-pill-none';
  if (diff < 0)  return 'yt-pill-overdue';
  if (diff === 0) return 'yt-pill-today';
  if (diff === 1) return 'yt-pill-tomorrow';
  return 'yt-pill-later';
}

export function labelForYMD(ymd: string): string {
  const t = todayYMD();
  if (ymd === t) return 'Today';
  if (ymd === addDaysYMD(t, 1)) return 'Tomorrow';
  if (ymd === addDaysYMD(t, -1)) return 'Yesterday';
  return formatPill(ymd) || ymd;
}

export function weekdayLabel(ymd: string): string {
  if (!isValidDateYYYYMMDD(ymd)) return ymd;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' });
}

export function fullDateLabel(ymd: string): string {
  return formatPill(ymd) || ymd;
}

export function monthStartYMD(anchor: string): string {
  if (!isValidDateYYYYMMDD(anchor)) return anchor;
  const [y, m] = anchor.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

export function monthEndYMD(anchor: string): string {
  if (!isValidDateYYYYMMDD(anchor)) return anchor;
  const [y, m] = anchor.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

export function getMonday(ymd: string): string {
  if (!isValidDateYYYYMMDD(ymd)) return ymd;
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function inWeekRange(ymd: string, anchor: string): boolean {
  if (!isValidDateYYYYMMDD(ymd) || !isValidDateYYYYMMDD(anchor)) return false;
  const monday = getMonday(anchor);
  const [my, mm, md] = monday.split('-').map(Number);
  const weekStart = startOfLocalDay(new Date(my, mm - 1, md));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const [y, m, d] = ymd.split('-').map(Number);
  const target = startOfLocalDay(new Date(y, m - 1, d));
  return target >= weekStart && target <= weekEnd;
}

export function inMonthRange(ymd: string, anchor: string): boolean {
  if (!isValidDateYYYYMMDD(ymd) || !isValidDateYYYYMMDD(anchor)) return false;
  const [y1, m1] = ymd.split('-').map(Number);
  const [y2, m2] = anchor.split('-').map(Number);
  return y1 === y2 && m1 === m2;
}

export function getWeekRangeLabel(anchor: string): string {
  const monday = getMonday(anchor);
  return `${formatPill(monday)} – ${formatPill(addDaysYMD(monday, 6))}`;
}

export function getMonthRangeLabel(anchor: string): string {
  if (!isValidDateYYYYMMDD(anchor)) return anchor;
  const [y, m] = anchor.split('-').map(Number);
  return `${formatPill(`${y}-${String(m).padStart(2, '0')}-01`)} – ${formatPill(monthEndYMD(anchor))}`;
}

/* ===================== Array manipulation ===================== */

export function isUncTitleBlock(b: Block): boolean {
  return b.indent === 0 && (b.text || '').trim().toLowerCase() === UNC_TITLE.toLowerCase();
}

export function findUncRange(blocks: Block[]): { uncIndex: number; start: number; end: number } {
  const uncIndex = blocks.findIndex(isUncTitleBlock);
  if (uncIndex < 0) return { uncIndex: -1, start: -1, end: -1 };
  const start = uncIndex + 1;
  let end = start;
  while (end < blocks.length && blocks[end].indent !== 0) end++;
  return { uncIndex, start, end };
}

export function ensureUncExists(blocks: Block[]): Block[] {
  if (findUncRange(blocks).uncIndex >= 0) return blocks;
  return [...blocks, { id: uid(), text: UNC_TITLE, indent: 0, parentId: null, order: -1 }];
}

export function moveUncToTop(blocks: Block[]): Block[] {
  const b = ensureUncExists(blocks);
  const { uncIndex, end } = findUncRange(b);
  if (uncIndex < 0 || uncIndex === 0) return b;
  return [...b.slice(uncIndex, end), ...b.slice(0, uncIndex), ...b.slice(end)];
}

/* ===================== Order utilities ===================== */

/** Next order value to append a block to the end of a parent group. */
function nextOrderInParent(blocks: Block[], parentId: string | null): number {
  const siblings = blocks.filter(b =>
    b.parentId === parentId && (parentId === null ? b.indent === 0 : b.indent > 0)
  );
  return siblings.length === 0 ? 0 : Math.max(...siblings.map(b => b.order)) + 1;
}

export function sortBlocksByOrder(blocks: Block[]): Block[] {
  const roots = blocks.filter(b => b.indent === 0).sort((a, b) => a.order - b.order);
  const byParent = new Map<string, Block[]>();
  for (const b of blocks) {
    if (b.indent > 0) {
      const key = b.parentId ?? '';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(b);
    }
  }
  for (const tasks of byParent.values()) tasks.sort((a, b) => a.order - b.order);
  const rootIds = new Set(roots.map(r => r.id));
  const result: Block[] = [];
  for (const root of roots) {
    result.push(root);
    result.push(...(byParent.get(root.id) ?? []));
  }
  for (const b of blocks) {
    if (b.indent > 0 && (!b.parentId || !rootIds.has(b.parentId))) result.push(b);
  }
  return result;
}

/* ===================== Factories ===================== */

export function makeTaskBlock(
  overrides: Partial<Block> & { id: string },
  focusDay?: string,
): Block {
  return {
    text: '',
    indent: 1,
    parentId: null,
    order: 0,
    checked: false,
    // No due date unless the caller passes one (not every task has a deadline)
    deadline: isValidDateYYYYMMDD(focusDay) ? focusDay : undefined,
    createdAt: todayYMD(),
    isHidden: undefined,
    archived: undefined,
    ...overrides,
  } as Block;
}

export function makePersonalProject(
  blocks?: Block[],
  collapsed?: Record<string, boolean>,
  quickCollapsed?: Record<string, boolean>,
  visibleLists?: Record<string, boolean>,
): Project {
  return {
    project_id: pid(),
    title: 'Personal',
    blocks: blocks?.length
      ? moveUncToTop(ensureUncExists(blocks))
      : moveUncToTop(ensureUncExists([])),
    collapsed: collapsed && typeof collapsed === 'object' ? collapsed : {},
    quickCollapsed: quickCollapsed && typeof quickCollapsed === 'object' ? quickCollapsed : {},
    visibleLists: visibleLists && typeof visibleLists === 'object' ? visibleLists : {},
  };
}

/**
 * Starter groups, seeded once per account (new and existing ones) — first and in
 * this order — so people see groups are a thing. After that they're ordinary
 * groups: renamable and deletable. Matched by title when seeding (an existing
 * "Personal" keeps its id); missing ones get a fixed id.
 */
export const DEFAULT_GROUPS = [
  { id: 'group_personal', title: 'Personal' },
  { id: 'group_work', title: 'Work' },
  { id: 'group_family', title: 'Family' },
] as const;

export function isDefaultGroup(project: Pick<Project, 'title'>): boolean {
  const t = (project.title || '').trim().toLowerCase();
  return DEFAULT_GROUPS.some(d => d.title.toLowerCase() === t);
}

export function ensureDefaultGroups(projects: Project[]): Project[] {
  const rest = [...projects];
  const defaults = DEFAULT_GROUPS.map(d => {
    const i = rest.findIndex(p => (p.title || '').trim().toLowerCase() === d.title.toLowerCase());
    if (i >= 0) {
      const [p] = rest.splice(i, 1);
      return p.title === d.title ? p : { ...p, title: d.title };
    }
    return { ...makePersonalProject(), project_id: d.id, title: d.title };
  });
  return [...defaults, ...rest];
}

const LS_KEY_GROUPS_SEEDED = 'youtask_groups_seeded';

/** Adds the starter groups to this device's projects (and uploads, once synced). */
function seedDefaultGroups(): void {
  const payload = readProjectsLS();
  const projects = ensureDefaultGroups(payload?.projects ?? []);
  writeProjectsLS({ projects, selectedProjectId: payload?.selectedProjectId ?? projects[0].project_id });
}

/** No server to remember it (local mode / testuser) → this browser remembers instead. */
function seedDefaultGroupsLocallyOnce(): void {
  try {
    if (localStorage.getItem(LS_KEY_GROUPS_SEEDED)) return;
    seedDefaultGroups();
    localStorage.setItem(LS_KEY_GROUPS_SEEDED, '1');
  } catch {}
}

/**
 * Move a list (and every task under it) into another group, placed before
 * `beforeListId` in that group, or at the end when it's null.
 */
export function moveListToProject(
  projects: Project[],
  listId: string,
  toProjectId: string,
  beforeListId: string | null,
): Project[] {
  const fromIdx = projects.findIndex(p => (p.blocks ?? []).some(b => b.id === listId && b.indent === 0));
  const toIdx = projects.findIndex(p => p.project_id === toProjectId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return projects;
  const from = projects[fromIdx];
  const to = projects[toIdx];
  const list = from.blocks.find(b => b.id === listId)!;
  if (isUncTitleBlock(list)) return projects;

  const moving = from.blocks.filter(b => b.id === listId || b.parentId === listId);
  const movingIds = new Set(moving.map(b => b.id));

  const roots = to.blocks
    .filter(b => b.indent === 0 && !isUncTitleBlock(b))
    .sort((a, b) => a.order - b.order);
  const at = beforeListId ? roots.findIndex(r => r.id === beforeListId) : -1;
  roots.splice(at < 0 ? roots.length : at, 0, list);
  const orderById = new Map(roots.map((r, i) => [r.id, i]));
  const toBlocks = [...to.blocks, ...moving].map(b =>
    orderById.has(b.id) ? { ...b, order: orderById.get(b.id)! } : b,
  );

  // The list's per-list UI flags travel with it
  const take = (src: Record<string, boolean> | undefined) => {
    const { [listId]: value, ...rest } = src ?? {};
    return { rest, carry: value === undefined ? {} : { [listId]: value } };
  };
  const col = take(from.collapsed);
  const qcol = take(from.quickCollapsed);
  const vis = take(from.visibleLists);

  return projects.map((p, i) => {
    if (i === fromIdx) {
      return {
        ...from,
        blocks: moveUncToTop(ensureUncExists(from.blocks.filter(b => !movingIds.has(b.id)))),
        collapsed: col.rest,
        quickCollapsed: qcol.rest,
        visibleLists: vis.rest,
      };
    }
    if (i === toIdx) {
      return {
        ...to,
        blocks: sortBlocksByOrder(moveUncToTop(ensureUncExists(toBlocks))),
        collapsed: { ...to.collapsed, ...col.carry },
        quickCollapsed: { ...to.quickCollapsed, ...qcol.carry },
        visibleLists: { ...to.visibleLists, ...vis.carry },
      };
    }
    return p;
  });
}

/** Tasks still to do in these lists: unchecked, not archived, with text. */
export function openTasksOf(blocks: Block[], listIds: Iterable<string>): Block[] {
  const ids = new Set(listIds);
  return sortBlocksByOrder(blocks).filter(b =>
    b.indent > 0 && !isSectionBlock(b) && b.parentId != null && ids.has(b.parentId) &&
    b.checked !== true && b.archived !== true && (b.text || '').trim() !== '',
  );
}

/**
 * Move the open tasks of `fromListIds` (in group `fromProjectId`) to the end of list
 * `toListId` in group `toProjectId` — same or another group. Done and empty tasks stay
 * behind; the caller deletes the source list(s) right after.
 */
export function moveOpenTasksToList(
  projects: Project[],
  fromProjectId: string,
  fromListIds: string[],
  toProjectId: string,
  toListId: string,
): Project[] {
  const fromIdx = projects.findIndex(p => p.project_id === fromProjectId);
  const toIdx = projects.findIndex(p => p.project_id === toProjectId);
  if (fromIdx < 0 || toIdx < 0) return projects;
  if (!(projects[toIdx].blocks ?? []).some(b => b.id === toListId && b.indent === 0)) return projects;

  const moving = openTasksOf(projects[fromIdx].blocks ?? [], fromListIds);
  if (!moving.length) return projects;
  const movingIds = new Set(moving.map(b => b.id));

  const fromBlocks = (projects[fromIdx].blocks ?? []).filter(b => !movingIds.has(b.id));
  const toBase = fromIdx === toIdx ? fromBlocks : (projects[toIdx].blocks ?? []);
  const startOrder = nextOrderInParent(toBase, toListId);
  // A subtask whose parent stayed behind (done) can sit at most one level under the task above it
  let prevIndent = 0;
  const moved = moving.map((b, k) => {
    const indent = Math.min(b.indent, prevIndent + 1);
    prevIndent = indent;
    return { ...b, indent, parentId: toListId, order: startOrder + k };
  });
  const toBlocks = sortBlocksByOrder(moveUncToTop(ensureUncExists([...toBase, ...moved])));

  return projects.map((p, i) => {
    if (i === toIdx) return { ...p, blocks: toBlocks };
    if (i === fromIdx) return { ...p, blocks: fromBlocks };
    return p;
  });
}

/* ===================== Normalization ===================== */

/**
 * Completion day for a checked task saved without one (from before completedAt existed, an
 * import, an older tab): its due date — back then checking moved the due date to the day it
 * was checked — else its creation day, else today. Same rule as the DB migration's backfill.
 */
export function assumedCompletedAt(b: { deadline?: unknown; createdAt?: unknown }): string {
  if (isValidDateYYYYMMDD(b.deadline)) return b.deadline;
  if (isValidDateYYYYMMDD(b.createdAt)) return b.createdAt;
  return todayYMD();
}

/** Checked tasks missing completedAt get the assumed one (assumedCompletedAt); others untouched. */
export function fillCompletedAt(blocks: Block[]): Block[] {
  if (!blocks.some(b => b.indent > 0 && b.checked === true && !isValidDateYYYYMMDD(b.completedAt))) return blocks;
  return blocks.map(b =>
    b.indent > 0 && b.checked === true && !isValidDateYYYYMMDD(b.completedAt)
      ? { ...b, completedAt: assumedCompletedAt(b) }
      : b,
  );
}

export function normalizeLoadedBlocks(raw: unknown): Block[] {
  const today = todayYMD();
  if (!Array.isArray(raw)) return moveUncToTop(ensureUncExists([]));

  const out: Block[] = (raw as RawBlock[]).map((x: RawBlock) => {
    const id     = typeof x?.id === 'string' ? x.id : uid();
    const text   = typeof x?.text === 'string' ? x.text : '';
    const indent = Number.isFinite(x?.indent) ? Number(x.indent) : 0;
    const rawOrder = (x as Record<string, unknown>)?.order;
    const order = Number.isFinite(rawOrder) ? Number(rawOrder) : NaN;
    const b: Block = { id, text, indent: Math.max(0, indent), parentId: null, order };

    if (b.indent > 0 && x?.section === true) {
      // A section is just its title: always top level in its list, no task fields
      b.indent = 1;
      b.section = true;
    } else if (b.indent > 0) {
      b.checked = Boolean(x?.checked);
      if (isValidDateYYYYMMDD(x?.deadline)) b.deadline = x.deadline as string;
      if (b.checked) {
        b.completedAt = isValidDateYYYYMMDD(x?.completedAt) ? (x.completedAt as string)
          : assumedCompletedAt({ deadline: b.deadline, createdAt: x?.createdAt });
      }
      const notes = parseTaskNotes(x?.notes, x?.note, isValidDateYYYYMMDD(x?.createdAt) ? (x.createdAt as string) : today);
      if (notes.length) b.notes = notes;
      if (isValidTimeHHMM(x?.dueTime)) b.dueTime = x.dueTime;
      const repeatDays = parseRepeatDays(x?.repeatDays);
      if (repeatDays.length) b.repeatDays = repeatDays;
      // Kept even when empty: an empty list tells the server to clear the task's history
      if (Array.isArray(x?.doneDates)) {
        b.doneDates = [...new Set((x.doneDates as unknown[]).filter(isValidDateYYYYMMDD))].sort();
      }
    } else {
      const listStatus = parseListStatus(x?.listStatus);
      if (listStatus) b.listStatus = listStatus;
    }

    b.createdAt = isValidDateYYYYMMDD(x?.createdAt) ? (x.createdAt as string) : today;
    if (typeof x?.isHidden === 'boolean') b.isHidden = x.isHidden;
    if (typeof x?.archived === 'boolean') b.archived = x.archived;
    if (typeof x?.onHold === 'boolean') b.onHold = x.onHold;
    const flag = parseTaskFlag(x?.flag);
    if (flag) {
      b.flag = flag;
    } else if (x?.priority === true) {
      b.flag = 'red';
    }
    return b;
  }).filter(Boolean) as Block[];

  // Every non-root block belongs to the nearest preceding indent-0 block (its list),
  // regardless of its own indent depth — deeper indent is visual nesting only, not a
  // separate parent group (mirrors sortBlocksByOrder / renderNormalList grouping).
  let currentListId: string | null = null;
  for (const b of out) {
    if (b.indent === 0) {
      currentListId = b.id;
      b.parentId = null;
    } else {
      b.parentId = currentListId;
    }
  }

  // Assign order from array position within each parent group (only for legacy blocks missing it)
  const orderCounters: Record<string, number> = {};
  for (const b of out) {
    const key = b.parentId ?? '__root__';
    if (!Number.isFinite(b.order)) {
      b.order = orderCounters[key] ?? 0;
    }
    orderCounters[key] = Math.max(orderCounters[key] ?? 0, b.order) + 1;
  }

  // Data saved before the subtask rules (or edited elsewhere) gets its parents brought in step
  return syncParentsFromSubtasks(moveUncToTop(ensureUncExists(out)));
}

/* ===================== Database sync (background, fire-and-forget) ===================== */


/* ===================== Sync logging =====================
 * Every step between localStorage and Postgres logs to the browser console as
 * "[Youtask sync] …" with list/task counts, so a lost task can be traced to
 * the exact step (never uploaded, uploaded-then-overwritten, wiped, …). */

const SYNC_LOG_BADGE = 'color:#fff;padding:1px 6px;border-radius:4px;font-weight:600;background:';
/** Color by outcome, read from the message's leading icon: green = Postgres confirmed, red = failed, amber = local only. */
function syncLogColors(message: string): { badge: string; text: string } {
  if (message.startsWith('✅') || message.startsWith('✔')) return { badge: '#15803d', text: 'color:#15803d;font-weight:600' };
  if (message.startsWith('❌')) return { badge: '#b91c1c', text: 'color:#b91c1c;font-weight:600' };
  if (message.startsWith('⏸')) return { badge: '#b45309', text: 'color:#b45309' };
  return { badge: '#18315C', text: '' };
}

/** "3 lists, 7 tasks" for a projects payload; item counts for the other datasets. */
function describeDataset(path: SyncPath | string, raw: unknown): string {
  try {
    const data = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown> | null;
    if (!data) return 'empty';
    if (path === '/api/data/projects') {
      const blocks = ((data.projects as Project[] | undefined) ?? []).flatMap(p => p.blocks ?? []);
      const lists = blocks.filter(b => b.indent === 0 && !isUncTitleBlock(b)).length;
      const tasks = blocks.filter(b => b.indent > 0 && (b.text ?? '').trim() !== '').length;
      const blank = blocks.filter(b => b.indent > 0 && (b.text ?? '').trim() === '').length;
      const groups = ((data.projects as Project[] | undefined) ?? []).length;
      return `${groups} group(s), ${lists} list(s), ${tasks} task(s)${blank ? ` + ${blank} blank` : ''}`;
    }
    if (path === '/api/data/habits') return `${((data.habits as unknown[]) ?? []).length} habit(s)`;
    if (path === '/api/data/reminders') return `${((data.reminders as unknown[]) ?? []).length} reminder(s)`;
    if (path === '/api/data/checklists') return `${((data.lists as unknown[]) ?? []).length} checklist(s)`;
    return 'data';
  } catch {
    return 'unreadable';
  }
}

/** Task titles in a projects payload (first 20) — shows exactly WHICH version reached Postgres. */
function taskTitles(raw: unknown): string[] {
  try {
    const data = (typeof raw === 'string' ? JSON.parse(raw) : raw) as { projects?: Project[] } | null;
    return (data?.projects ?? [])
      .flatMap(p => p.blocks ?? [])
      .filter(b => b.indent > 0)
      .map(b => (b.text ?? '').trim() || '(blank)')
      .slice(0, 20);
  } catch {
    return [];
  }
}

function syncLog(message: string, details?: Record<string, unknown>): void {
  try {
    const { badge, text } = syncLogColors(message);
    if (details) console.log(`%cYoutask sync%c ${message}`, SYNC_LOG_BADGE + badge, text, details);
    else console.log(`%cYoutask sync%c ${message}`, SYNC_LOG_BADGE + badge, text);
  } catch {}
}

/* ===================== Local data ownership (account switching) =====================
 * localStorage holds ONE account's data. Which account is recorded explicitly
 * here — deducing it from `firebase_uid` breaks, because logout removes that key
 * but leaves the data, so the next login (any account) inherited it and the
 * "server is empty → migrate this device's data" step could upload it into the
 * wrong account. */

export const DATA_OWNER_KEY = 'youtask_data_owner_uid';

const USER_DATA_KEYS = [LS_KEY_V2, LS_KEY_V1, LS_KEY_HABITS, LS_KEY_REMINDERS, LS_KEY_CHECKLISTS];

export function getDataOwner(): string {
  try { return localStorage.getItem(DATA_OWNER_KEY) ?? ''; } catch { return ''; }
}

function setDataOwner(uid: string): void {
  try { localStorage.setItem(DATA_OWNER_KEY, uid); } catch {}
}

/** Per-account parking spot for local data while another account is signed in. */
const ACCOUNT_STASH_PREFIX = 'youtask_account_stash__';

/** This account's data keys plus its delete-backups — everything that moves with an account. */
function collectAccountData(): Record<string, string> {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (USER_DATA_KEYS.includes(k) || k.startsWith(BACKUP_PREFIX)) {
      const v = localStorage.getItem(k);
      if (v !== null) data[k] = v;
    }
  }
  return data;
}

/**
 * Call on every login, before the app hydrates. Switches this device's local
 * data to the incoming account WITHOUT destroying anything:
 *   1. the outgoing owner's data is parked under its own stash key,
 *   2. the incoming account's parked data (if any) is restored.
 * Never delete here: in local mode (no database) localStorage is the only copy,
 * and even with a server, edits made before sync would be lost.
 *
 * Unknown owner (data from before ownership was tracked) is adopted by the
 * incoming account — the pre-existing behavior, and nothing is lost.
 */
export function prepareLocalDataForUser(uid: string): void {
  if (!uid) return;
  try {
    const owner = getDataOwner();
    const localNow = describeDataset('/api/data/projects', localStorage.getItem(LS_KEY_V2));
    if (owner === uid) {
      syncLog(`👤 login ${uid} — this browser's data is already this account's (${localNow})`);
      return;
    }
    syncLog(`👤 login ${uid} — local data owner was ${owner || '(none)'} (${localNow})`);

    if (!owner) {
      // Logged-out device. Local mode parks data at logout (no Postgres to
      // reload from) — bring this account's back if it's there.
      const hasLocalData = USER_DATA_KEYS.some(k => localStorage.getItem(k) !== null);
      const parkedRaw = localStorage.getItem(ACCOUNT_STASH_PREFIX + uid);
      if (!hasLocalData && parkedRaw) {
        const parked = JSON.parse(parkedRaw) as Record<string, string>;
        for (const [k, v] of Object.entries(parked)) localStorage.setItem(k, v);
        localStorage.removeItem(ACCOUNT_STASH_PREFIX + uid);
        syncLog(`📦 restored ${uid}'s parked data (${describeDataset('/api/data/projects', parked[LS_KEY_V2] ?? null)})`);
      }
      setDataOwner(uid);
      return;
    }

    // 1. Park the outgoing account's data
    const outgoing = collectAccountData();
    if (Object.keys(outgoing).length > 0) {
      localStorage.setItem(ACCOUNT_STASH_PREFIX + owner, JSON.stringify(outgoing));
      syncLog(`📦 parked ${owner}'s local data (${localNow}) — switching to ${uid}`);
    }
    Object.keys(outgoing).forEach(k => localStorage.removeItem(k));

    // 2. Bring back the incoming account's parked data
    const parkedRaw = localStorage.getItem(ACCOUNT_STASH_PREFIX + uid);
    if (parkedRaw) {
      const parked = JSON.parse(parkedRaw) as Record<string, string>;
      for (const [k, v] of Object.entries(parked)) localStorage.setItem(k, v);
      localStorage.removeItem(ACCOUNT_STASH_PREFIX + uid);
      syncLog(`📦 restored ${uid}'s parked data (${describeDataset('/api/data/projects', parked[LS_KEY_V2] ?? null)})`);
    }

    closeSyncGates();
    setDataOwner(uid);
  } catch {}
}

/* ===================== Logout: Postgres is the source of truth ===================== */

function isDatabaseMode(): boolean {
  return process.env.NEXT_PUBLIC_DATABASE_MODE !== 'local';
}

/**
 * Before logout: push this device's current data to Postgres and wait for it.
 * Normal edits already sync as they happen, but those POSTs are fire-and-forget
 * — one that failed (offline, server blip) would otherwise be lost when logout
 * empties the device. Datasets never hydrated from the server are skipped:
 * they never held server-confirmed data to begin with.
 */
export async function flushAllToDatabase(): Promise<{ ok: boolean }> {
  if (!isDatabaseMode()) return { ok: true };
  const results = await Promise.all((Object.keys(lanes) as SyncPath[]).map(async path => {
    if (!canUpload(path)) return true;   // never hydrated / not this account — nothing server-confirmed to protect
    const lane = lanes[path];
    if (lane.timer) { clearTimeout(lane.timer); lane.timer = null; }
    // Through the lane, never alongside it: wait for any in-flight upload first.
    if (lane.inFlight) await lane.inFlight;
    for (let attempt = 0; attempt < 3; attempt++) {
      // Postgres already confirmed exactly this state — nothing to send
      if (lane.confirmedBody !== null && lane.confirmedBody === localStorage.getItem(LS_KEY_FOR_PATH[path])) {
        syncLog(`✅ logout check: Postgres already has the latest ${path}`);
        return true;
      }
      if (await sendLane(path)) return true;
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
    syncLog(`❌ logout check: could NOT confirm ${path} in Postgres after 3 attempts`);
    return false;
  }));
  const ok = results.every(Boolean);
  syncLog(ok ? '✅ logout: Postgres is up to date' : '❌ logout: some data is NOT in Postgres');
  return { ok };
}

/**
 * Logout: empty this device. Tasks, habits, reminders, checklists, their
 * delete-backups and the owner marker go; the next login pulls everything
 * fresh from Postgres. Mounted views are told so they drop their arrays too.
 *
 * Local mode has no Postgres to reload from, so there the data is parked under
 * the account instead of dropped (prepareLocalDataForUser restores it).
 */
export function clearLocalAccountData(): void {
  try {
    const owner = getDataOwner();
    const data = collectAccountData();
    const summary = describeDataset('/api/data/projects', data[LS_KEY_V2] ?? null);
    if (!isDatabaseMode() && owner && Object.keys(data).length > 0) {
      localStorage.setItem(ACCOUNT_STASH_PREFIX + owner, JSON.stringify(data));
      syncLog(`🚪 logout ${owner} — local mode: parked this browser's data (${summary}) instead of deleting`);
    } else {
      syncLog(`🚪 logout ${owner || '(no owner)'} — emptied this browser (${summary}); next login reloads from Postgres`);
    }
    Object.keys(data).forEach(k => localStorage.removeItem(k));
    localStorage.removeItem(DATA_OWNER_KEY);
    closeSyncGates();
    for (const ev of ['youtask_projects_updated', 'youtask_blocks_updated', 'youtask_habits_updated', 'youtask_reminders_updated', 'youtask_checklists_updated']) {
      window.dispatchEvent(new Event(ev));
    }
  } catch {}
}

/**
 * Sync gate. Uploads are blocked until loadFromDatabase() has confirmed, per
 * dataset, what the server holds. Without this, components that boot-write
 * default payloads on a fresh device (Quick/Sidebar/HabitsPanel/RemindersPanel)
 * race the hydration GET and can replace the user's server data with an empty
 * boot state. The gate is bound to the uid it was opened for so a stale tab
 * can't post another account's defaults after a re-login.
 */
type SyncPath = '/api/data/projects' | '/api/data/habits' | '/api/data/reminders' | '/api/data/checklists';

const syncGate: Record<SyncPath, boolean> = {
  '/api/data/projects': false,
  '/api/data/habits': false,
  '/api/data/reminders': false,
  '/api/data/checklists': false,
};
let hydratedUid = '';

/** Fired once loadFromDatabase() has confirmed what the server holds for projects. */
export const PROJECTS_HYDRATED_EVENT = 'youtask_projects_hydrated';

/**
 * True once the projects on this device reflect the server (or there is no
 * server to wait for). UI that reacts to an *empty* workspace — e.g. the
 * first-list wizard — must wait for this, or it would flash for an existing
 * user on a fresh device before their data arrives.
 */
export function isProjectsHydrated(): boolean {
  if (process.env.NEXT_PUBLIC_DATABASE_MODE === 'local') return true;
  const uid = getCurrentUid();
  if (!uid || uid === 'testuser') return true;
  return syncGate['/api/data/projects'] && hydratedUid === uid;
}

export function closeSyncGates(): void {
  resetUploadLanes();
  syncGate['/api/data/projects'] = false;
  syncGate['/api/data/habits'] = false;
  syncGate['/api/data/reminders'] = false;
  syncGate['/api/data/checklists'] = false;
  hydratedUid = '';
  loadFailed = false;
  notifySyncStatus();
}

/* ===================== Sync status (UI indicator) =====================
 * Derived from the gates + upload lanes. Green ('synced') only when sync is
 * on, every dataset loaded from Postgres for this account, and nothing is
 * queued, in flight or failing. */

export type SyncState = 'off' | 'connecting' | 'syncing' | 'synced' | 'error';
export type SyncStatus = { state: SyncState; message: string };

/** Fired whenever getSyncStatus() may have changed. */
export const SYNC_STATUS_EVENT = 'youtask_sync_status';

let loadInProgress = false;
let loadFailed = false;

function notifySyncStatus(): void {
  try { window.dispatchEvent(new Event(SYNC_STATUS_EVENT)); } catch {}
}

export function getSyncStatus(): SyncStatus {
  if (process.env.NEXT_PUBLIC_DATABASE_MODE === 'local') return { state: 'off', message: 'Sync is off — local mode, data lives only on this device' };
  const uid = getCurrentUid();
  if (!uid) return { state: 'off', message: 'Sync is off — not signed in' };
  if (uid === 'testuser') return { state: 'off', message: 'Sync is off — test user' };

  const paths = Object.keys(syncGate) as SyncPath[];
  const notLoaded = paths.filter(p => !syncGate[p] || hydratedUid !== uid);
  if (notLoaded.length > 0) {
    if (loadInProgress || !loadFailed) return { state: 'connecting', message: 'Connecting to the server…' };
    const names = notLoaded.map(p => p.replace('/api/data/', '')).join(', ');
    return { state: 'error', message: `Could not load ${names} from the server — changes are kept on this device only. Click to retry.` };
  }

  const failing = paths.filter(p => lanes[p].failures > 0);
  if (failing.length > 0) {
    const names = failing.map(p => p.replace('/api/data/', '')).join(', ');
    return { state: 'error', message: `Saving ${names} to the server is failing — retrying automatically` };
  }

  if (paths.some(p => lanes[p].inFlight || lanes[p].pending || lanes[p].timer)) {
    return { state: 'syncing', message: 'Saving changes…' };
  }
  return { state: 'synced', message: 'Sync is on — all changes saved to the server' };
}

/* ===================== Upload queue (localStorage → Postgres) =====================
 * Each dataset has one lane. Every POST replaces the whole dataset server-side,
 * so the rules are:
 *   - one request in flight per dataset — parallel POSTs could commit out of
 *     order and leave Postgres on an OLDER state (e.g. a list whose task is
 *     still empty, which later gets cleaned up → "the task vanished");
 *   - writes that arrive meanwhile coalesce, and the body is read from
 *     localStorage at send time, so what goes out is always the latest state;
 *   - failures retry with backoff instead of being dropped.
 */

const LS_KEY_FOR_PATH: Record<SyncPath, string> = {
  '/api/data/projects':   LS_KEY_V2,
  '/api/data/habits':     LS_KEY_HABITS,
  '/api/data/reminders':  LS_KEY_REMINDERS,
  '/api/data/checklists': LS_KEY_CHECKLISTS,
};

type UploadLane = {
  inFlight: Promise<boolean> | null;
  pending: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  failures: number;
  /** Exact body Postgres last confirmed — lets logout skip a redundant (fallible) upload. */
  confirmedBody: string | null;
};
const newLane = (): UploadLane => ({ inFlight: null, pending: false, timer: null, failures: 0, confirmedBody: null });
const lanes: Record<SyncPath, UploadLane> = {
  '/api/data/projects': newLane(),
  '/api/data/habits': newLane(),
  '/api/data/reminders': newLane(),
  '/api/data/checklists': newLane(),
};

const COALESCE_MS = 350;     // typing a task = many writes → one upload
const MAX_RETRY_MS = 30000;

/** Why this device may NOT upload `path` right now, or null if it may. */
function uploadBlocker(path: SyncPath): string | null {
  if (process.env.NEXT_PUBLIC_DATABASE_MODE === 'local') return 'local mode (no Postgres)';
  const uid = getCurrentUid();
  if (!uid) return 'no signed-in account';
  if (uid === 'testuser') return 'testuser (no Postgres)';
  if (!syncGate[path]) return 'initial load from Postgres not finished — change kept LOCAL ONLY';
  if (uid !== hydratedUid) return `account changed (loaded for ${hydratedUid || 'nobody'}, now ${uid})`;
  const owner = getDataOwner();
  if (owner !== uid) return `local data belongs to ${owner || 'nobody'}, not ${uid}`;
  return null;
}

/** Everything that must hold for this device to upload `path` right now. */
function canUpload(path: SyncPath): string | null {
  return uploadBlocker(path) ? null : getCurrentUid();
}

function sendLane(path: SyncPath): Promise<boolean> {
  const lane = lanes[path];
  if (lane.inFlight) { lane.pending = true; return lane.inFlight; }
  const uid = canUpload(path);
  const body = uid ? localStorage.getItem(LS_KEY_FOR_PATH[path]) : null;
  lane.pending = false;
  if (!uid || !body) return Promise.resolve(true);

  const summary = describeDataset(path, body);
  const startedAt = Date.now();
  syncLog(`⬆ uploading ${path} → Postgres (${summary})`, { account: uid, ...(path === '/api/data/projects' ? { tasks: taskTitles(body) } : {}) });

  notifySyncStatus();
  lane.inFlight = apiFetch(path, {
    uid,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Sync-Hydrated': '1' },
    body,
  })
    .then(r => (r.ok ? { ok: true, status: r.status } : { ok: false, status: r.status }))
    .catch((err: unknown) => ({ ok: false, status: `network error: ${err instanceof Error ? err.message : String(err)}` }))
    .then(({ ok, status }) => {
      lane.inFlight = null;
      const ms = Date.now() - startedAt;
      if (ok) {
        lane.failures = 0;
        lane.confirmedBody = body;
        syncLog(`✅ Postgres saved ${path} (${summary}) in ${ms}ms`, { account: uid, ...(path === '/api/data/projects' ? { tasks: taskTitles(body) } : {}) });
        if (lane.pending) scheduleUpload(path, 0);     // newer state arrived while sending
      } else {
        lane.failures += 1;
        const retryMs = Math.min(MAX_RETRY_MS, 1000 * 2 ** (lane.failures - 1));
        syncLog(`❌ upload FAILED ${path} (${summary}) — status ${status}; retry #${lane.failures} in ${retryMs}ms`, { account: uid });
        scheduleUpload(path, retryMs);
      }
      notifySyncStatus();
      return ok;
    });
  return lane.inFlight;
}

function scheduleUpload(path: SyncPath, delay = COALESCE_MS): void {
  const lane = lanes[path];
  if (lane.inFlight) { lane.pending = true; return; }
  if (lane.timer) clearTimeout(lane.timer);
  lane.timer = setTimeout(() => { lane.timer = null; void sendLane(path); }, delay);
  notifySyncStatus();
}

/** Drop queued uploads (logout / account switch) — nothing may go out under the next account. */
function resetUploadLanes(): void {
  for (const lane of Object.values(lanes)) {
    if (lane.timer) clearTimeout(lane.timer);
    lane.timer = null;
    lane.pending = false;
    lane.failures = 0;
    lane.confirmedBody = null;
  }
}

function dbPost(path: SyncPath): void {
  const blocked = uploadBlocker(path);
  if (blocked) {
    syncLog(`⏸ change NOT uploaded ${path} (${describeDataset(path, localStorage.getItem(LS_KEY_FOR_PATH[path]))}) — ${blocked}`);
    return;
  }
  scheduleUpload(path);
}

/* Meaningful-data checks: boot defaults (an Uncategorized-only project, one
   blank habit, one blank reminder) do not count as data worth uploading. */

function projectsPayloadHasData(payload: ProjectsPayload | null): boolean {
  if (!payload) return false;
  // Empty starter groups are boot state, not data — only a custom group counts
  if (payload.projects.some(p => !isDefaultGroup(p))) return true;
  return payload.projects.some(p =>
    (p.blocks ?? []).some(b => !isUncTitleBlock(b) && (b.text ?? '').trim() !== ''),
  );
}

function habitsPayloadHasData(payload: HabitsPayload): boolean {
  return payload.habits.some(h => (h.text ?? '').trim() !== '');
}

function remindersPayloadHasData(payload: RemindersPayload): boolean {
  return payload.reminders.some(r => (r.title ?? '').trim() !== '');
}

function checklistsPayloadHasData(payload: ChecklistsPayload): boolean {
  return payload.lists.some(l =>
    (l.name ?? '').trim() !== '' || l.items.some(it => (it.text ?? '').trim() !== ''),
  );
}

/* ===================== Delete backups =====================
 * Whenever a write shrinks the item count for a dataset (a task/habit/
 * reminder/checklist item was deleted), the pre-delete JSON is snapshotted
 * under a brand-new timestamped localStorage key before the overwrite, so a
 * bad delete (or a sync overwriting local state) can be recovered from.
 * Only the most recent MAX_BACKUPS_PER_DATASET snapshots per dataset are
 * kept, oldest first. */

const BACKUP_PREFIX = 'youtask_backup_';
const MAX_BACKUPS_PER_DATASET = 20;

function pruneOldBackups(datasetKey: string): void {
  try {
    const prefix = `${BACKUP_PREFIX}${datasetKey}__`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    keys.sort();
    while (keys.length > MAX_BACKUPS_PER_DATASET) {
      const oldest = keys.shift();
      if (oldest) localStorage.removeItem(oldest);
    }
  } catch {}
}

function backupBeforeShrink(datasetKey: string, prevRaw: string | null, prevCount: number, nextCount: number): void {
  if (!prevRaw || nextCount >= prevCount) return;
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    localStorage.setItem(`${BACKUP_PREFIX}${datasetKey}__${stamp}`, prevRaw);
    pruneOldBackups(datasetKey);
  } catch {}
}

function countProjectBlocks(payload: ProjectsPayload | null): number {
  if (!payload) return 0;
  return payload.projects.reduce((n, p) => n + (p.blocks?.length ?? 0), 0);
}

function dbSyncProjects(): void {
  try {
    const raw = localStorage.getItem(LS_KEY_V2);
    if (!raw) return;
    dbPost('/api/data/projects');
  } catch {}
}

function dbSyncHabits(): void {
  try {
    const raw = localStorage.getItem(LS_KEY_HABITS);
    if (!raw) return;
    dbPost('/api/data/habits');
  } catch {}
}

function dbSyncReminders(): void {
  try {
    const raw = localStorage.getItem(LS_KEY_REMINDERS);
    if (!raw) return;
    dbPost('/api/data/reminders');
  } catch {}
}

function dbSyncChecklists(): void {
  try {
    const raw = localStorage.getItem(LS_KEY_CHECKLISTS);
    if (!raw) return;
    dbPost('/api/data/checklists');
  } catch {}
}

let hydrationRetryHooked = false;

function hookHydrationRetry(): void {
  if (hydrationRetryHooked) return;
  hydrationRetryHooked = true;
  const retry = () => { void loadFromDatabase(); };
  try {
    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
  } catch {}
}

/**
 * Hydrate localStorage from the database. Per dataset:
 *   - server has data      → server wins: overwrite localStorage
 *   - server confirmed empty → push local up, but only if local holds
 *     meaningful data (not just boot defaults)
 *   - request failed        → keep the gate closed; retried on focus/online
 * Uploads (dbPost) stay blocked per dataset until its gate opens here, so a
 * fresh device's boot writes can never replace server data.
 */
export async function loadFromDatabase(): Promise<void> {
  if (process.env.NEXT_PUBLIC_DATABASE_MODE === 'local') {
    syncLog('⏭ load from Postgres skipped — NEXT_PUBLIC_DATABASE_MODE=local (no database; data lives only in this browser)');
    seedDefaultGroupsLocallyOnce();
    return;
  }
  const uid = getCurrentUid();
  if (!uid) { syncLog('⏭ load from Postgres skipped — no signed-in account'); return; }
  if (uid === 'testuser') { syncLog('⏭ load from Postgres skipped — testuser'); seedDefaultGroupsLocallyOnce(); return; }

  // Local data must belong to this account before anything below can treat it
  // as "this device's data" (the empty-server migration uploads it).
  // No owner yet = a session from before ownership was tracked → adopt.
  const owner = getDataOwner();
  syncLog(`⬇ loading from Postgres for ${uid}`, {
    localOwner: owner || '(none)',
    localBefore: describeDataset('/api/data/projects', localStorage.getItem(LS_KEY_V2)),
  });
  if (!owner) setDataOwner(uid);
  else if (owner !== uid) prepareLocalDataForUser(uid);

  // A stale gate from a previous account must never carry over
  if (hydratedUid && hydratedUid !== uid) closeSyncGates();

  const needProjects   = !syncGate['/api/data/projects'];
  const needHabits     = !syncGate['/api/data/habits'];
  const needReminders  = !syncGate['/api/data/reminders'];
  const needChecklists = !syncGate['/api/data/checklists'];
  if (!needProjects && !needHabits && !needReminders && !needChecklists) return;

  const openGate = (path: SyncPath) => {
    hydratedUid = uid;
    syncGate[path] = true;
    if (path === '/api/data/projects') {
      try { window.dispatchEvent(new Event(PROJECTS_HYDRATED_EVENT)); } catch {}
    }
    notifySyncStatus();
  };

  loadInProgress = true;
  notifySyncStatus();
  try {
    const [projectsRes, habitsRes, remindersRes, checklistsRes] = await Promise.all([
      needProjects   ? apiFetch('/api/data/projects',   { uid }).catch(() => null) : null,
      needHabits     ? apiFetch('/api/data/habits',     { uid }).catch(() => null) : null,
      needReminders  ? apiFetch('/api/data/reminders',  { uid }).catch(() => null) : null,
      needChecklists ? apiFetch('/api/data/checklists', { uid }).catch(() => null) : null,
    ]);

    const logGetFailure = (path: SyncPath, res: Response | null) => {
      if (res === null) return; // not requested (already hydrated)
      if (!res.ok) syncLog(`❌ load FAILED ${path} — status ${res.status}; uploads stay blocked, will retry on focus/online`, { account: uid });
    };
    if (needProjects && !projectsRes) syncLog('❌ load FAILED /api/data/projects — network error; uploads stay blocked', { account: uid });
    logGetFailure('/api/data/projects', projectsRes);
    logGetFailure('/api/data/habits', habitsRes);
    logGetFailure('/api/data/reminders', remindersRes);
    logGetFailure('/api/data/checklists', checklistsRes);

    if (projectsRes?.ok) {
      const data = await projectsRes.json() as { projects?: unknown[]; onboarded?: boolean; groupsSeeded?: boolean };
      if (data.onboarded) {
        try { localStorage.setItem('youtask_occupation', 'skipped'); } catch {}
      }
      if (Array.isArray(data.projects) && data.projects.length > 0) {
        syncLog(`⬇ Postgres has ${describeDataset('/api/data/projects', data)} → replacing local (server wins)`, {
          account: uid,
          localBeingReplaced: describeDataset('/api/data/projects', localStorage.getItem(LS_KEY_V2)),
          tasksFromPostgres: taskTitles(data),
        });
        localStorage.setItem(LS_KEY_V2, JSON.stringify(data));
        window.dispatchEvent(new Event('youtask_projects_updated'));
        window.dispatchEvent(new Event('youtask_blocks_updated'));
        openGate('/api/data/projects');
      } else {
        // Server confirmed empty — one-time migration of a device's local data
        openGate('/api/data/projects');
        const local = readProjectsLS();
        if (projectsPayloadHasData(local)) {
          syncLog(`⬆ Postgres is EMPTY → migrating this browser's ${describeDataset('/api/data/projects', local)} up`, { account: uid });
          dbSyncProjects();
        } else {
          syncLog('⬇ Postgres is empty and so is this browser — fresh start', { account: uid });
        }
      }
      // Gate is open by now, so this write uploads — and the server flips groupsSeeded
      if (data.groupsSeeded === false) {
        syncLog('🌱 seeding starter groups (Personal, Work, Family) — first time for this account', { account: uid });
        seedDefaultGroups();
      }
    }

    if (habitsRes?.ok) {
      const data = await habitsRes.json() as { habits?: unknown[] };
      if (Array.isArray(data.habits) && data.habits.length > 0) {
        localStorage.setItem(LS_KEY_HABITS, JSON.stringify(data));
        window.dispatchEvent(new Event('youtask_habits_updated'));
        openGate('/api/data/habits');
      } else {
        openGate('/api/data/habits');
        if (habitsPayloadHasData(readHabitsLS())) dbSyncHabits();
      }
    }

    if (remindersRes?.ok) {
      const data = await remindersRes.json() as { reminders?: unknown[] };
      if (Array.isArray(data.reminders) && data.reminders.length > 0) {
        localStorage.setItem(LS_KEY_REMINDERS, JSON.stringify(data));
        window.dispatchEvent(new Event('youtask_reminders_updated'));
        openGate('/api/data/reminders');
      } else {
        openGate('/api/data/reminders');
        if (remindersPayloadHasData(readRemindersLS())) dbSyncReminders();
      }
    }

    if (checklistsRes?.ok) {
      const data = await checklistsRes.json() as { lists?: unknown[] };
      if (Array.isArray(data.lists) && data.lists.length > 0) {
        // Keep the locally selected tab if it still exists in the server data
        const selectedListId = readChecklistsLS().selectedListId;
        localStorage.setItem(LS_KEY_CHECKLISTS, JSON.stringify({ lists: data.lists, selectedListId }));
        window.dispatchEvent(new Event('youtask_checklists_updated'));
        openGate('/api/data/checklists');
      } else {
        openGate('/api/data/checklists');
        if (checklistsPayloadHasData(readChecklistsLS())) dbSyncChecklists();
      }
    }
    syncLog(`✔ load finished for ${uid}`, {
      projects: syncGate['/api/data/projects'] ? 'ready' : 'NOT loaded',
      habits: syncGate['/api/data/habits'] ? 'ready' : 'NOT loaded',
      reminders: syncGate['/api/data/reminders'] ? 'ready' : 'NOT loaded',
      checklists: syncGate['/api/data/checklists'] ? 'ready' : 'NOT loaded',
      localNow: describeDataset('/api/data/projects', localStorage.getItem(LS_KEY_V2)),
    });
  } catch (err) {
    syncLog(`❌ load from Postgres crashed for ${uid}`, { error: err instanceof Error ? err.message : String(err) });
  }

  // If any GET failed its gate is still closed — retry when we're back
  loadInProgress = false;
  loadFailed = !syncGate['/api/data/projects'] || !syncGate['/api/data/habits'] ||
    !syncGate['/api/data/reminders'] || !syncGate['/api/data/checklists'];
  if (loadFailed) hookHydrationRetry();
  notifySyncStatus();
}

/* ===================== Persistence (localStorage) ===================== */



/** Elimina tareas vacías — solo se ejecuta una vez por carga de página */
/** Drops tasks with no text — except an empty one that still holds subtasks (deeper rows right after it). */
export function cleanupEmptyTasks(blocks: Block[]): Block[] {
  return blocks.filter((b, i) =>
    b.indent === 0 || (b.text || '').trim() !== '' || (blocks[i + 1]?.indent ?? 0) > b.indent,
  );
}

export function readProjectsLS(): ProjectsPayload | null {
  try {
    const raw = localStorage.getItem(LS_KEY_V2);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoragePayload;


    // Project struct in json
    const loadedProjects: Project[] = Array.isArray(parsed?.projects)
      ? (parsed.projects as RawProject[]).map((p: RawProject) => ({
          project_id: typeof p?.project_id === 'string' ? p.project_id : pid(),
          title: typeof p?.title === 'string' && (p.title as string).trim()
            ? (p.title as string).trim()
            : 'Personal',
          blocks: normalizeLoadedBlocks(
            p?.blocks ?? (p?.payload as { blocks?: unknown })?.blocks ?? [],
          ),
          collapsed: p?.collapsed && typeof p.collapsed === 'object'
            ? p.collapsed as Record<string, boolean>
            : {},
          quickCollapsed: p?.quickCollapsed && typeof p.quickCollapsed === 'object'
            ? p.quickCollapsed as Record<string, boolean>
            : {},
          visibleLists: p?.visibleLists && typeof p.visibleLists === 'object'
            ? p.visibleLists as Record<string, boolean>
            : {},
        })).filter(Boolean)
      : [];

    const safeProjects = loadedProjects.length
      ? loadedProjects
      : [makePersonalProject()];

    const sel = typeof parsed?.selectedProjectId === 'string'
      ? parsed.selectedProjectId
      : safeProjects[0].project_id;

    return {
      projects: safeProjects,
      selectedProjectId: safeProjects.some(p => p.project_id === sel)
        ? sel
        : safeProjects[0].project_id,
    };
  } catch {
    return null;
  }
}

/** Pre-projects storage format — read only to migrate it into a Personal project. */
export function readLegacyBlocksLS(): Block[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY_V1);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeLoadedBlocks(parsed?.blocks ?? parsed);
  } catch {
    return null;
  }
}

export function writeProjectsLS(payload: ProjectsPayload): void {
  try {
    // Every save keeps parents in step with their subtasks, whichever view made the change,
    // and gives done tasks saved without a completion day (e.g. an import) the assumed one
    payload = { ...payload, projects: payload.projects.map(p => ({ ...p, blocks: fillCompletedAt(syncParentsFromSubtasks(p.blocks ?? [])) })) };
    const prevRaw = localStorage.getItem(LS_KEY_V2);
    const prevCount = prevRaw ? countProjectBlocks(JSON.parse(prevRaw)) : 0;
    backupBeforeShrink('projects', prevRaw, prevCount, countProjectBlocks(payload));
    localStorage.setItem(LS_KEY_V2, JSON.stringify(payload));
    window.dispatchEvent(new Event('youtask_projects_updated'));
    window.dispatchEvent(new Event('youtask_blocks_updated'));
    dbSyncProjects();
  } catch {}
}

/* ===================== Filter helpers ===================== */

/**
 * The day a task sits on in Timeline, Calendar and the reports: a done task on the day it
 * was completed, an open one on its due date. (Recurring tasks go by their occurrences.)
 */
export function taskCalendarDay(b: Pick<Block, 'checked' | 'completedAt' | 'deadline'>): string | undefined {
  if (b.checked === true && isValidDateYYYYMMDD(b.completedAt)) return b.completedAt;
  return isValidDateYYYYMMDD(b.deadline) ? b.deadline : undefined;
}

/**
 * Under "Due Date", a task without one is treated as due on its creation day; a done task
 * counts on the day it was completed (taskCalendarDay).
 */
export function getFilterDate(b: Block, sortBy: SortBy): string | undefined {
  if (sortBy === 'createdAt') return b.createdAt;
  return taskCalendarDay(b) ?? b.createdAt;
}

export function passesDateFilter(
  b: Block,
  opts: { sortBy: DateBasis; dateMode: DateMode; focusDay: string; range?: DateRange },
): boolean {
  if (!(b.indent > 0)) return true;
  // Both dates: passes when it's due or was created in the window
  if (opts.sortBy === 'both') {
    return passesDateFilter(b, { ...opts, sortBy: 'dueDate' }) || passesDateFilter(b, { ...opts, sortBy: 'createdAt' });
  }
  // A recurring task is due on every repeat day, so it passes when any of them falls in the window
  if (opts.sortBy === 'dueDate' && opts.dateMode !== 'all' && isRecurringTask(b) && isValidDateYYYYMMDD(b.deadline)) {
    const [from, to] = dateWindow(opts);
    if (from && to) return recurringDaysInRange(b, from, to).length > 0;
  }
  const date = getFilterDate(b, opts.sortBy);
  if (!date || !isValidDateYYYYMMDD(date)) return false;
  if (opts.dateMode === 'all')   return true;
  if (opts.dateMode === 'today') return date === opts.focusDay;
  if (opts.dateMode === 'week')  return inWeekRange(date, opts.focusDay);
  if (opts.dateMode === 'range') return !!opts.range && date >= opts.range.from && date <= opts.range.to;
  return inMonthRange(date, opts.focusDay);
}

/** First and last day a date filter covers ("all" covers no fixed window). */
function dateWindow(opts: { dateMode: DateMode; focusDay: string; range?: DateRange }): [string?, string?] {
  if (opts.dateMode === 'today') return [opts.focusDay, opts.focusDay];
  if (opts.dateMode === 'week') { const monday = getMonday(opts.focusDay); return [monday, addDaysYMD(monday, 6)]; }
  if (opts.dateMode === 'range') return [opts.range?.from, opts.range?.to];
  if (opts.dateMode === 'month') return [monthStartYMD(opts.focusDay), monthEndYMD(opts.focusDay)];
  return [];
}

/** Days in a range, inclusive (both ends YYYY-MM-DD). */
export function daysInRange(range: DateRange): number {
  const [fy, fm, fd] = range.from.split('-').map(Number);
  const [ty, tm, td] = range.to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000) + 1;
}

/** "Oct 1 – Oct 15"; with years once the range leaves the current year */
export function getRangeLabel(range: DateRange): string {
  const year = todayYMD().slice(0, 4);
  const fmt = range.from.slice(0, 4) === year && range.to.slice(0, 4) === year ? formatPill : fullDateLabel;
  return range.from === range.to ? fmt(range.from) : `${fmt(range.from)} – ${fmt(range.to)}`;
}

export function buildSplitDays(
  opts: { dateMode: DateMode; focusDay: string; blocks: Block[]; showHidden: boolean; sortBy: SortBy; range?: DateRange },
): string[] {
  const { dateMode, focusDay, blocks, showHidden, sortBy, range } = opts;

  if (dateMode === 'today') return [focusDay];

  if (dateMode === 'range' && range) {
    return Array.from({ length: daysInRange(range) }).map((_, i) => addDaysYMD(range.from, i));
  }

  if (dateMode === 'week') {
    const monday = getMonday(focusDay);
    return Array.from({ length: 7 }).map((_, i) => addDaysYMD(monday, i));
  }

  if (dateMode === 'month') {
    const days: string[] = [];
    let cur = monthStartYMD(focusDay);
    const end = monthEndYMD(focusDay);
    while (cur <= end) { days.push(cur); cur = addDaysYMD(cur, 1); }
    return days;
  }

  const dated = blocks
    .filter(b => b.indent > 0 && b.archived !== true && (showHidden || b.isHidden !== true))
    .map(b => getFilterDate(b, sortBy))
    .filter(isValidDateYYYYMMDD);

  const uniq = Array.from(new Set(dated)).sort();
  return uniq.length ? uniq : [focusDay];
}

export function buildHiddenMap(
  blocks: Block[],
  opts: {
    collapsed: Record<string, boolean>;
    showHidden: boolean;
    dateMode: DateMode;
    focusDay: string;
    sortBy: DateBasis;
    range?: DateRange;
  },
): Record<string, boolean> {
  const { collapsed, showHidden, dateMode, focusDay, sortBy, range } = opts;
  const hidden: Record<string, boolean> = {};
  let currentListId: string | null = null;

  for (const b of blocks) {
    const isList    = b.indent === 0;
    const isUncList = isList && isUncTitleBlock(b);

    if (b.archived === true) {
      hidden[b.id] = true;
      if (isList) currentListId = null;
      continue;
    }

    if (b.isHidden === true && !showHidden) {
      hidden[b.id] = true;
      if (isList) currentListId = null;
      continue;
    }

    if (b.indent > 0 && !passesDateFilter(b, { sortBy, dateMode, focusDay, range })) {
      hidden[b.id] = true;
      continue;
    }

    if (isList) {
      currentListId = isUncList ? null : b.id;
      hidden[b.id] = false;
      continue;
    }

    hidden[b.id] = Boolean(currentListId && collapsed[currentListId]);
  }

  return hidden;
}

export function isListVisible(
  visibleLists: Record<string, boolean> | undefined,
  listId: string,
): boolean {
  return visibleLists?.[listId] !== false;
}

export function buildListVisibilityHiddenMap(
  blocks: Block[],
  visibleLists: Record<string, boolean> | undefined,
): Record<string, boolean> {
  const hidden: Record<string, boolean> = {};
  let currentListId: string | null = null;
  let currentListVisible = true;

  for (const b of blocks) {
    if (b.indent === 0) {
      if (isUncTitleBlock(b)) {
        currentListId = null;
        currentListVisible = true;
        hidden[b.id] = false;
        continue;
      }
      currentListId = b.id;
      currentListVisible = isListVisible(visibleLists, b.id);
      hidden[b.id] = !currentListVisible;
      continue;
    }

    hidden[b.id] = Boolean(currentListId && !currentListVisible);
  }

  return hidden;
}

export function buildListSections(blocks: Block[]): ListSection[] {
  const sections: ListSection[] = [];
  let current: ListSection | null = null;

  for (const b of blocks) {
    if (b.archived === true) continue;
    if (b.indent === 0) {
      if (isUncTitleBlock(b)) { current = null; continue; }
      current = { list: b, tasks: [] };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    current.tasks.push(b);
  }

  return sections;
}

/* ===================== List sections ===================== */
/*
 * A list stores its loose tasks first, then each section followed by its tasks (one
 * `order` sequence, the list as every row's parentId). Agenda draws the sections on top,
 * as two-line containers, and the loose tasks under them.
 */

export type ListLayout = {
  loose: Block[];
  sections: { head: Block; rows: Block[] }[];
};

/** Splits a list's rows into its loose tasks and its sections (each with its tasks). */
export function readListLayout(blocks: Block[], listId: string): ListLayout {
  const rows = blocks
    .filter(b => b.indent > 0 && b.parentId === listId)
    .sort((a, b) => a.order - b.order);
  const layout: ListLayout = { loose: [], sections: [] };
  for (const b of rows) {
    if (isSectionBlock(b)) layout.sections.push({ head: b, rows: [] });
    else if (layout.sections.length) layout.sections[layout.sections.length - 1].rows.push(b);
    else layout.loose.push(b);
  }
  return layout;
}

/** Stores a layout back: its rows get the list as parent and their new order. */
export function writeListLayout(blocks: Block[], listId: string, layout: ListLayout): Block[] {
  const seq = [...layout.loose, ...layout.sections.flatMap(s => [s.head, ...s.rows])];
  const orderOf = new Map(seq.map((b, i) => [b.id, i]));
  return blocks.map(b => {
    const order = orderOf.get(b.id);
    if (order === undefined || (b.order === order && b.parentId === listId)) return b;
    return { ...b, order, parentId: listId };
  });
}

/** The rows in the order Agenda draws them: sections (each with its tasks), then loose tasks. */
export function drawnListRows(layout: ListLayout): Block[] {
  return [...layout.sections.flatMap(s => [s.head, ...s.rows]), ...layout.loose];
}

/** The task rows (loose, or one section's) that hold `id`. */
export function layoutRowsHolding(layout: ListLayout, id: string): Block[] | null {
  if (layout.loose.some(b => b.id === id)) return layout.loose;
  return layout.sections.find(s => s.rows.some(b => b.id === id))?.rows ?? null;
}

/** Takes a row out of the layout: a task with its subtasks, or a section with its tasks. */
export function takeFromLayout(layout: ListLayout, id: string): Block[] | null {
  const si = layout.sections.findIndex(s => s.head.id === id);
  if (si >= 0) {
    const [s] = layout.sections.splice(si, 1);
    return [s.head, ...s.rows];
  }
  const rows = layoutRowsHolding(layout, id);
  if (!rows) return null;
  const i = rows.findIndex(b => b.id === id);
  let end = i + 1;
  while (end < rows.length && rows[end].indent > rows[i].indent) end++;
  return rows.splice(i, end - i);
}

/** A new section, first in its list (right under the list's title in Agenda). */
export function addSectionToList(blocks: Block[], listId: string, section: Block): Block[] {
  const layout = readListLayout(blocks, listId);
  layout.sections.unshift({ head: section, rows: [] });
  return writeListLayout([...blocks, section], listId, layout);
}

/** Deletes a section; its tasks stay in the list, as loose tasks. */
export function removeSection(blocks: Block[], sectionId: string): Block[] {
  const listId = blocks.find(b => b.id === sectionId)?.parentId;
  if (!listId) return blocks;
  const layout = readListLayout(blocks, listId);
  const i = layout.sections.findIndex(s => s.head.id === sectionId);
  if (i < 0) return blocks;
  const [gone] = layout.sections.splice(i, 1);
  layout.loose.push(...gone.rows);
  return writeListLayout(blocks.filter(b => b.id !== sectionId), listId, layout);
}

/* ===================== Block mutations ===================== */

export function insertBlockAfter(blocks: Block[], afterId: string, newBlock: Block): Block[] {
  const i = blocks.findIndex(b => b.id === afterId);
  if (i < 0) return blocks;
  const after = blocks[i];
  // Inherit parentId from the block being inserted after so sortBlocksByOrder
  // doesn't treat the new block as an orphan and append it to the end.
  const toInsert: Block = { ...newBlock, parentId: newBlock.parentId ?? after.parentId };
  const next = [...blocks.slice(0, i + 1), toInsert, ...blocks.slice(i + 1)];
  // Renumber orders within each parent group to match array position so
  // sortBlocksByOrder preserves the insertion order rather than moving the
  // new block (order: 0) to the top.
  const counters: Record<string, number> = {};
  return next.map(b => {
    const key = b.parentId ?? '__root__';
    const order = counters[key] ?? 0;
    counters[key] = order + 1;
    return order === b.order ? b : { ...b, order };
  });
}

export function removeBlock(blocks: Block[], id: string): Block[] {
  if (blocks.length === 1) return blocks;
  return blocks.filter(b => b.id !== id);
}

export function removeTitleSendChildrenToUnc(blocks: Block[], listId: string): Block[] {
  const i = blocks.findIndex(b => b.id === listId);
  if (i < 0) return blocks;
  const list = blocks[i];
  if (list.indent !== 0 || isUncTitleBlock(list)) return blocks;

  let end = i + 1;
  while (end < blocks.length && blocks[end].indent !== 0) end++;

  const children = blocks.slice(i + 1, end).map(ch => ({
    ...ch,
    indent: Math.max(1, ch.indent),
  }));

  let next = moveUncToTop(ensureUncExists(
    blocks.slice(0, i).concat(blocks.slice(end)),
  ));

  const { end: uncEnd } = findUncRange(next);
  if (uncEnd >= 0) {
    next = next.slice(0, uncEnd).concat(children, next.slice(uncEnd));
  }

  return next;
}

/** Remove a list title and all nested blocks until the next list (does not move tasks to Uncategorized). */
export function removeListAndChildren(blocks: Block[], listId: string): Block[] {
  const i = blocks.findIndex(b => b.id === listId);
  if (i < 0) return blocks;
  const list = blocks[i];
  if (list.indent !== 0 || isUncTitleBlock(list)) return blocks;

  let end = i + 1;
  while (end < blocks.length && blocks[end].indent !== 0) end++;

  const next = blocks.slice(0, i).concat(blocks.slice(end));
  return moveUncToTop(ensureUncExists(next));
}

/** Remove a task block and all its nested subtasks (blocks with deeper indent right after it). */
export function removeTaskAndSubtasks(blocks: Block[], taskId: string): Block[] {
  const i = blocks.findIndex(b => b.id === taskId);
  if (i < 0) return blocks;
  const indent = blocks[i].indent;

  let end = i + 1;
  while (end < blocks.length && blocks[end].indent > indent) end++;

  return blocks.slice(0, i).concat(blocks.slice(end));
}

function applyPatch(b: Block, patch: Partial<Block>): Block {
  if (patch.checked === true && isRecurringTask(b)) {
    return completeOccurrence({ ...b, ...patch });
  }

  // Checking a task leaves its due date alone (it used to turn into the completion day,
  // giving undated tasks a due date and moving overdue ones) — the day it was done is
  // recorded in completedAt instead; unchecking clears it
  if (typeof patch.checked === 'boolean') {
    return {
      ...b,
      completedAt: patch.checked ? (b.checked === true && b.completedAt ? b.completedAt : todayYMD()) : undefined,
      ...patch,
      isHidden: false,
    };
  }

  return { ...b, ...patch };
}

/**
 * Subtasks aren't linked by parentId (that stays the list); a task's subtasks are the
 * siblings right below it, in order, with a deeper indent. Returns the target's
 * descendants and its ancestor chain (nearest parent first).
 */
function taskFamily(blocks: Block[], id: string): { descendants: Block[]; ancestors: Block[] } {
  const target = blocks.find(b => b.id === id);
  if (!target || target.indent <= 0) return { descendants: [], ancestors: [] };
  const siblings = blocks
    .filter(b => b.indent > 0 && b.parentId === target.parentId && b.archived !== true)
    .sort((a, b) => a.order - b.order);
  const i = siblings.findIndex(b => b.id === id);
  if (i < 0) return { descendants: [], ancestors: [] };

  const descendants: Block[] = [];
  for (let j = i + 1; j < siblings.length && siblings[j].indent > target.indent; j++) {
    descendants.push(siblings[j]);
  }

  const ancestors: Block[] = [];
  let level = target.indent;
  for (let j = i - 1; j >= 0 && level > 1; j--) {
    if (siblings[j].indent < level) {
      ancestors.push(siblings[j]);
      level = siblings[j].indent;
    }
  }
  return { descendants, ancestors };
}

/**
 * The two subtask rules — a parent task depends on its subtasks (any depth — same
 * sibling/indent rule as taskFamily):
 *   1. it takes the latest due date among them (none dated → it keeps its own);
 *   2. it's done exactly when all of them are (it can't be checked by hand — see updateBlock).
 * A recurring parent is left alone: its date and done state are its occurrences.
 */
export function syncParentsFromSubtasks(blocks: Block[]): Block[] {
  const groups = new Map<string, Block[]>();
  for (const b of blocks) {
    if (b.indent <= 0 || b.archived === true) continue;
    const key = b.parentId ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(b);
  }
  const patches = new Map<string, Partial<Block>>();
  for (const tasks of groups.values()) {
    tasks.sort((a, b) => a.order - b.order);
    tasks.forEach((t, i) => {
      if (isSectionBlock(t) || isRecurringTask(t)) return;
      let max = '';
      let lastDone = '';
      let allDone = true;
      let kids = 0;
      for (let j = i + 1; j < tasks.length && tasks[j].indent > t.indent; j++) {
        if (isSectionBlock(tasks[j])) continue;
        kids++;
        const d = tasks[j].deadline;
        if (isValidDateYYYYMMDD(d) && d > max) max = d;
        if (tasks[j].checked !== true) allDone = false;
        const c = tasks[j].completedAt;
        if (isValidDateYYYYMMDD(c) && c > lastDone) lastDone = c;
      }
      if (kids === 0) return;
      const patch: Partial<Block> = {};
      if (max && max !== t.deadline) patch.deadline = max;
      // Like a hand check (applyPatch), a change of done state un-hides it. The parent was
      // completed when its last subtask was
      if (Boolean(t.checked) !== allDone) {
        Object.assign(patch, { checked: allDone, isHidden: false, completedAt: allDone ? lastDone || todayYMD() : undefined });
      }
      if (Object.keys(patch).length) patches.set(t.id, patch);
    });
  }
  if (patches.size === 0) return blocks;
  return blocks.map(b => (patches.has(b.id) ? { ...b, ...patches.get(b.id) } : b));
}

/** Delete a task along with its subtasks (same sibling/indent rule as the check cascade). */
export function removeTaskWithSubtasks(blocks: Block[], taskId: string): Block[] {
  const ids = new Set([taskId, ...taskFamily(blocks, taskId).descendants.map(d => d.id)]);
  return syncParentsFromSubtasks(blocks.filter(b => !ids.has(b.id)));
}

/** Does this task have (non-archived) subtasks? Such a parent is only completed through them. */
export function hasSubtasks(blocks: Block[], id: string): boolean {
  return taskFamily(blocks, id).descendants.length > 0;
}

export function updateBlock(
  blocks: Block[],
  id: string,
  patch: Partial<Block>,
): Block[] {
  // A parent can't be checked or unchecked by hand: its done state comes from its subtasks
  // (a recurring parent still completes its occurrences by hand)
  const target = blocks.find(b => b.id === id);
  if (typeof patch.checked === 'boolean' && target && !isRecurringTask(target) && hasSubtasks(blocks, id)) {
    const { checked: _ignored, ...rest } = patch;
    void _ignored;
    if (Object.keys(rest).length === 0) return blocks;
    patch = rest;
  }
  const next = blocks.map(b => (b.id === id ? applyPatch(b, patch) : b));
  // A new date, check, nesting or archive can change a parent's due date or done state
  // (a parent is done once all its subtasks are, and reopens when one isn't)
  const touchesParents = ['deadline', 'indent', 'archived', 'checked'].some(k => k in patch);
  return touchesParents ? syncParentsFromSubtasks(next) : next;
}

export function addTaskUnderList(
  blocks: Block[],
  listId?: string | null,
  // id: pass one when the caller must know it before the state updater runs (e.g. to focus the new task)
  opts: { deadline?: string; focusDay?: string; text?: string; id?: string } = {},
): { blocks: Block[]; newTaskId: string; targetListId: string | null } {
  const newTaskId = opts.id ?? uid();
  const base = moveUncToTop(ensureUncExists(blocks));

  // focusDay doubles as the due date; omit both to create a task with no due date
  const defaultDeadline =
    opts.deadline && isValidDateYYYYMMDD(opts.deadline)
      ? opts.deadline
      : isValidDateYYYYMMDD(opts.focusDay)
      ? opts.focusDay!
      : undefined;

  const validListIndex =
    typeof listId === 'string' && listId.trim()
      ? base.findIndex(b => b.id === listId && b.indent === 0)
      : -1;

  if (validListIndex >= 0) {
    const parentListId = base[validListIndex].id;
    const newTask = makeTaskBlock(
      { id: newTaskId, parentId: parentListId, order: nextOrderInParent(base, parentListId), deadline: defaultDeadline, text: (opts.text || '').trim() },
      opts.focusDay,
    );
    let end = validListIndex + 1;
    while (end < base.length && base[end].indent !== 0) end++;
    const next = base.slice();
    next.splice(end, 0, newTask);
    return { blocks: next, newTaskId, targetListId: parentListId };
  }

  const { end: uncEnd, uncIndex } = findUncRange(base);
  const insertAt = uncEnd >= 0 ? uncEnd : base.length;
  const parentListId = uncIndex >= 0 ? base[uncIndex].id : null;
  const newTask = makeTaskBlock(
    { id: newTaskId, parentId: parentListId, order: nextOrderInParent(base, parentListId), deadline: defaultDeadline, text: (opts.text || '').trim() },
    opts.focusDay,
  );
  const next = base.slice();
  next.splice(insertAt, 0, newTask);
  return { blocks: next, newTaskId, targetListId: parentListId };
}

export function createList(
  blocks: Block[],
  listText: string,
  // listId / taskId: pass them when the caller must know the ids before the state updater runs
  opts: { focusDay?: string; listId?: string; taskId?: string } = {},
): { blocks: Block[]; newListId: string; newTaskId: string; existed: boolean } {
  const name      = (listText || '').trim() || 'New List';
  const newListId = opts.listId ?? uid();
  const newTaskId = opts.taskId ?? uid();

  // Archived lists don't count — the task would vanish into one
  const existingId = blocks.find(
    b => b.indent === 0 && !isUncTitleBlock(b) && b.archived !== true && (b.text || '').trim().toLowerCase() === name.toLowerCase(),
  )?.id;

  if (existingId) {
    const result = addTaskUnderList(blocks, existingId, { focusDay: opts.focusDay, id: newTaskId });
    return { blocks: result.blocks, newListId: existingId, newTaskId: result.newTaskId, existed: true };
  }

  const base = moveUncToTop(ensureUncExists(blocks));
  const { end: uncEnd } = findUncRange(base);
  const insertAt = Math.max(uncEnd, base.length);

  const listOrder = nextOrderInParent(base, null);
  const next = base.slice();
  next.splice(insertAt, 0, { id: newListId, text: name, indent: 0, parentId: null, order: listOrder, createdAt: todayYMD() });
  next.splice(insertAt + 1, 0, makeTaskBlock({ id: newTaskId, parentId: newListId, order: 0 }, opts.focusDay));

  return { blocks: next, newListId, newTaskId, existed: false };
}

/** New list with empty title + one empty task (no duplicate merge on empty name). */
export function createBlankList(
  blocks: Block[],
  opts: { focusDay?: string; listId?: string; taskId?: string } = {},
): { blocks: Block[]; newListId: string; newTaskId: string } {
  const newListId = opts.listId ?? uid();
  const newTaskId = opts.taskId ?? uid();
  const base = moveUncToTop(ensureUncExists(blocks));
  const { end: uncEnd } = findUncRange(base);
  const insertAt = Math.max(uncEnd, base.length);
  const listOrder = nextOrderInParent(base, null);
  const next = base.slice();
  next.splice(insertAt, 0, { id: newListId, text: '', indent: 0, parentId: null, order: listOrder, createdAt: todayYMD() });
  next.splice(insertAt + 1, 0, makeTaskBlock({ id: newTaskId, parentId: newListId, order: 0 }, opts.focusDay));
  return { blocks: next, newListId, newTaskId };
}

/** New untitled list right after `afterListId` (after its tasks too), with root orders renumbered to match. */
export function insertListAfter(blocks: Block[], afterListId: string, newListId: string = uid()): Block[] {
  const i = blocks.findIndex(b => b.id === afterListId && b.indent === 0);
  if (i < 0) return blocks;
  let end = i + 1;
  while (end < blocks.length && blocks[end].indent !== 0) end++;
  const next = blocks.slice();
  next.splice(end, 0, { id: newListId, text: '', indent: 0, parentId: null, order: 0, createdAt: todayYMD() });
  let order = 0;
  return next.map(b => {
    if (b.indent !== 0) return b;
    const o = order++;
    return b.order === o ? b : { ...b, order: o };
  });
}

/* ===================== Block mutations — Sidebar extras ===================== */

export function archiveTask(blocks: Block[], taskId: string): Block[] {
  const i = blocks.findIndex(b => b.id === taskId);
  if (i < 0) return blocks;
  const b = blocks[i];
  if (!(b.indent > 0) || !b.checked) return blocks;
  const next = blocks.map(x => ({ ...x }));
  next[i].archived = true;
  let j = i + 1;
  while (j < next.length && next[j].indent > b.indent) {
    next[j].archived = true;
    j++;
  }
  return next;
}

/** The list itself plus everything in it: its run of blocks and anything parented under it. */
function listBlockIds(blocks: Block[], listId: string): Set<string> {
  const ids = new Set<string>([listId]);
  const i = blocks.findIndex(b => b.id === listId);
  for (let j = i + 1; i >= 0 && j < blocks.length && blocks[j].indent !== 0; j++) ids.add(blocks[j].id);
  let grew = true;
  while (grew) {
    grew = false;
    for (const b of blocks) {
      if (b.parentId != null && ids.has(b.parentId) && !ids.has(b.id)) { ids.add(b.id); grew = true; }
    }
  }
  return ids;
}

/**
 * Archive a whole list: it and all its tasks/sections get `archived`, so every view
 * (which already skips archived blocks) drops them. `unarchiveList` brings it all back.
 */
export function archiveList(blocks: Block[], listId: string): Block[] {
  const list = blocks.find(b => b.id === listId);
  if (!list || list.indent !== 0 || isUncTitleBlock(list)) return blocks;
  const ids = listBlockIds(blocks, listId);
  return blocks.map(b => (ids.has(b.id) && b.archived !== true ? { ...b, archived: true } : b));
}

export function unarchiveList(blocks: Block[], listId: string): Block[] {
  const list = blocks.find(b => b.id === listId);
  if (!list || list.indent !== 0) return blocks;
  const ids = listBlockIds(blocks, listId);
  return blocks.map(b => (ids.has(b.id) && b.archived === true ? { ...b, archived: false } : b));
}

export function unhideTask(blocks: Block[], taskId: string): Block[] {
  const i = blocks.findIndex(b => b.id === taskId);
  if (i < 0) return blocks;
  const b = blocks[i];
  if (!(b.indent > 0) || b.archived) return blocks;
  const next = blocks.map(x => ({ ...x }));
  next[i].isHidden = undefined;
  let j = i + 1;
  while (j < next.length && next[j].indent > b.indent) {
    if (!next[j].archived) next[j].isHidden = undefined;
    j++;
  }
  return next;
}

export function dismissCompleted(blocks: Block[]): Block[] {
  return blocks.map(b => {
    if (b.archived) return b;
    if (b.indent > 0 && b.checked) return { ...b, isHidden: true };
    return b;
  });
}

export function addNewList(blocks: Block[]): { blocks: Block[]; newListId: string } {
  const newListId = uid();
  const base = moveUncToTop(ensureUncExists(blocks));
  const { end: uncEnd } = findUncRange(base);
  const insertAt = Math.max(uncEnd, base.length);
  const next = base.slice();
  next.splice(insertAt, 0, { id: newListId, text: 'New List', indent: 0, parentId: null, order: nextOrderInParent(base, null), createdAt: todayYMD() });
  return { blocks: next, newListId };
}

/* ===================== Habits — validation ===================== */

export function isValidTimeHHMM(s: unknown): s is string {
  return typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);
}

export function isMondayLocal(): boolean {
  return new Date().getDay() === 1;
}

/* ===================== Habits — normalization ===================== */

function normalizeHabits(raw: unknown): HabitBlock[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map(x => ({
    id:      typeof x?.id === 'string'      ? x.id      : uid(),
    text:    typeof x?.text === 'string'    ? x.text    : '',
    indent:  1 as const,
    checked: Boolean(x?.checked),
    weekly:  typeof x?.weekly === 'boolean' ? x.weekly  : false,
  }));
}

export function makeDefaultHabit(): HabitBlock {
  return { id: uid(), text: '', indent: 1, checked: false, weekly: false };
}

export function ensureOneHabit(habits: HabitBlock[]): HabitBlock[] {
  return habits.length ? habits : [makeDefaultHabit()];
}

/* ===================== Habits — persistence ===================== */

export function readHabitsLS(): HabitsPayload {
  try {
    const raw = localStorage.getItem(LS_KEY_HABITS);
    if (!raw) return { habits: [] };
    const parsed = JSON.parse(raw);
    return {
      habits:              normalizeHabits(parsed?.habits ?? parsed),
      lastDailyResetYMD:   typeof parsed?.lastDailyResetYMD  === 'string' ? parsed.lastDailyResetYMD  : undefined,
      lastWeeklyResetYMD:  typeof parsed?.lastWeeklyResetYMD === 'string' ? parsed.lastWeeklyResetYMD : undefined,
    };
  } catch {
    return { habits: [] };
  }
}

export function writeHabitsLS(payload: HabitsPayload): void {
  try {
    const prevRaw = localStorage.getItem(LS_KEY_HABITS);
    const prevCount = prevRaw ? (JSON.parse(prevRaw) as HabitsPayload).habits?.length ?? 0 : 0;
    backupBeforeShrink('habits', prevRaw, prevCount, payload.habits?.length ?? 0);
    localStorage.setItem(LS_KEY_HABITS, JSON.stringify(payload));
    window.dispatchEvent(new Event('youtask_habits_updated'));
    dbSyncHabits();
  } catch {}
}

/* ===================== Habits — resets ===================== */

export function applyHabitResets(payload: HabitsPayload): HabitsPayload {
  const today = todayYMD();
  let habits      = payload.habits.map(h => ({ ...h }));
  let lastDaily   = payload.lastDailyResetYMD;
  let lastWeekly  = payload.lastWeeklyResetYMD;

  if (lastDaily !== today) {
    habits    = habits.map(h => h.weekly ? h : { ...h, checked: false });
    lastDaily = today;
  }
  if (isMondayLocal() && lastWeekly !== today) {
    habits     = habits.map(h => h.weekly ? { ...h, checked: false } : h);
    lastWeekly = today;
  }

  return { habits, lastDailyResetYMD: lastDaily, lastWeeklyResetYMD: lastWeekly };
}

export function forceResetHabits(
  habits: HabitBlock[],
  meta: { lastDaily?: string; lastWeekly?: string },
): HabitsPayload {
  const today    = todayYMD();
  let next       = habits.map(h => h.weekly ? h : { ...h, checked: false });
  let lastWeekly = meta.lastWeekly;

  if (isMondayLocal()) {
    next       = next.map(h => h.weekly ? { ...h, checked: false } : h);
    lastWeekly = today;
  }

  return { habits: next, lastDailyResetYMD: today, lastWeeklyResetYMD: lastWeekly };
}

/* ===================== Habits — mutations ===================== */

export function insertHabitAfter(
  habits: HabitBlock[],
  afterId: string,
): { habits: HabitBlock[]; newHabit: HabitBlock } {
  const newHabit = makeDefaultHabit();
  const i        = habits.findIndex(h => h.id === afterId);
  const next     = habits.slice();
  next.splice(i + 1, 0, newHabit);
  return { habits: next, newHabit };
}

export function removeHabit(
  habits: HabitBlock[],
  id: string,
): { habits: HabitBlock[]; focusId: string } {
  if (habits.length === 1) {
    const replacement = makeDefaultHabit();
    return { habits: [replacement], focusId: replacement.id };
  }
  const idx  = habits.findIndex(h => h.id === id);
  const next = habits.filter(h => h.id !== id);
  return { habits: next, focusId: next[Math.max(0, idx - 1)]?.id ?? next[0].id };
}

export function updateHabit(habits: HabitBlock[], id: string, patch: Partial<HabitBlock>): HabitBlock[] {
  return habits.map(h => h.id === id ? { ...h, ...patch } : h);
}

/* ===================== Reminders — normalization ===================== */

function normalizeReminders(raw: unknown): ReminderItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map(x => ({
    id:       typeof x?.id    === 'string' ? x.id    : uid(),
    title:    typeof x?.title === 'string' ? x.title : '',
    date:     isValidDateYYYYMMDD(x?.date) ? x.date as string : todayYMD(),
    time:     isValidTimeHHMM(x?.time)     ? x.time as string : '11:00',
    daily:    typeof x?.daily === 'boolean'    ? x.daily    : false,
    days: Array.isArray(x?.days)
      ? [...new Set((x.days as unknown[]).filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort()
      : undefined,
    priority: typeof x?.priority === 'boolean' ? x.priority : false,
    flag: parseTaskFlag(x?.flag) ?? (x?.priority === true ? 'red' : undefined),
    dismissedOn: isValidDateYYYYMMDD(x?.dismissedOn) ? x.dismissedOn as string : undefined,
  }));
}

const TASK_FLAG_COLORS: TaskFlagColor[] = ['blue', 'yellow', 'red'];

export function parseTaskFlag(raw: unknown): TaskFlagColor | undefined {
  return typeof raw === 'string' && TASK_FLAG_COLORS.includes(raw as TaskFlagColor)
    ? (raw as TaskFlagColor)
    : undefined;
}

export function getTaskFlag(source: { flag?: TaskFlagColor; priority?: boolean }): TaskFlagColor | undefined {
  return source.flag ?? (source.priority === true ? 'red' : undefined);
}

export function cycleTaskFlag(current: TaskFlagColor | undefined): TaskFlagColor | undefined {
  if (!current) return 'blue';
  if (current === 'blue') return 'yellow';
  if (current === 'yellow') return 'red';
  return undefined;
}

/** Highest flag on a day cell: red > yellow > blue */
export function highestTaskFlag(flags: (TaskFlagColor | undefined)[]): TaskFlagColor | undefined {
  if (flags.includes('red')) return 'red';
  if (flags.includes('yellow')) return 'yellow';
  if (flags.includes('blue')) return 'blue';
  return undefined;
}

export function makeDefaultReminder(): ReminderItem {
  return { id: uid(), title: '', date: todayYMD(), time: '11:00', daily: false };
}

export function ensureOneReminder(reminders: ReminderItem[]): ReminderItem[] {
  return reminders.length ? reminders : [makeDefaultReminder()];
}

/* ===================== Reminders — persistence ===================== */

export function readRemindersLS(): RemindersPayload {
  try {
    const raw = localStorage.getItem(LS_KEY_REMINDERS);
    if (!raw) return { reminders: [] };
    const parsed = JSON.parse(raw);
    return { reminders: normalizeReminders(parsed?.reminders ?? parsed) };
  } catch {
    return { reminders: [] };
  }
}

export function writeRemindersLS(payload: RemindersPayload): void {
  try {
    const prevRaw = localStorage.getItem(LS_KEY_REMINDERS);
    const prevCount = prevRaw ? (JSON.parse(prevRaw) as RemindersPayload).reminders?.length ?? 0 : 0;
    backupBeforeShrink('reminders', prevRaw, prevCount, payload.reminders?.length ?? 0);
    localStorage.setItem(LS_KEY_REMINDERS, JSON.stringify(payload));
    window.dispatchEvent(new Event('youtask_reminders_updated'));
    dbSyncReminders();
  } catch {}
}

/* ===================== Reminders — mutations ===================== */

export function insertReminderAfter(
  reminders: ReminderItem[],
  afterId: string,
): { reminders: ReminderItem[]; newReminder: ReminderItem } {
  const newReminder = makeDefaultReminder();
  const i           = reminders.findIndex(r => r.id === afterId);
  const next        = reminders.slice();
  next.splice(i + 1, 0, newReminder);
  return { reminders: next, newReminder };
}

export function removeReminder(
  reminders: ReminderItem[],
  id: string,
): { reminders: ReminderItem[]; focusId: string } {
  if (reminders.length <= 1) {
    const replacement = makeDefaultReminder();
    return { reminders: [replacement], focusId: replacement.id };
  }
  const idx  = reminders.findIndex(r => r.id === id);
  const next = reminders.filter(r => r.id !== id);
  return { reminders: next, focusId: next[Math.max(0, idx - 1)]?.id ?? next[0].id };
}

export function updateReminder(
  reminders: ReminderItem[],
  id: string,
  patch: Partial<ReminderItem>,
): ReminderItem[] {
  return reminders.map(r => r.id === id ? { ...r, ...patch } : r);
}

/* ===================== Timeline helpers ===================== */

export function readSelectedProject(): {
  blocks: Block[];
  projectTitle: string;
  project_id: string | null;
  visibleLists: Record<string, boolean>;
} {
  try {
    const raw = localStorage.getItem(LS_KEY_V2);
    if (raw) {
      const parsed = JSON.parse(raw) as { projects?: unknown; selectedProjectId?: unknown };
      const projects: Project[] = Array.isArray(parsed?.projects)
        ? (parsed.projects as Record<string, unknown>[]).map(p => ({
            project_id: typeof p?.project_id === 'string' ? p.project_id : '',
            title:      typeof p?.title === 'string' ? p.title : 'Project',
            blocks:     normalizeLoadedBlocks(p?.blocks ?? []),
            collapsed:  p?.collapsed && typeof p.collapsed === 'object'
              ? p.collapsed as Record<string, boolean>
              : {},
            quickCollapsed: p?.quickCollapsed && typeof p.quickCollapsed === 'object'
              ? p.quickCollapsed as Record<string, boolean>
              : {},
            visibleLists: p?.visibleLists && typeof p.visibleLists === 'object'
              ? p.visibleLists as Record<string, boolean>
              : {},
          }))
        : [];

      if (projects.length) {
        const selectedId = typeof parsed?.selectedProjectId === 'string'
          ? parsed.selectedProjectId
          : projects[0].project_id;
        const p = projects.find(x => x.project_id === selectedId) || projects[0];
        return {
          blocks:       normalizeLoadedBlocks(p?.blocks ?? []),
          projectTitle: (p?.title || 'Project').trim() || 'Project',
          project_id:   p?.project_id || null,
          visibleLists: p?.visibleLists && typeof p.visibleLists === 'object'
            ? p.visibleLists as Record<string, boolean>
            : {},
        };
      }
    }
  } catch {}

  try {
    const raw = localStorage.getItem(LS_KEY_V1);
    if (!raw) return { blocks: [], projectTitle: 'General', project_id: null, visibleLists: {} };
    const parsed = JSON.parse(raw) as { blocks?: unknown };
    return {
      blocks:       normalizeLoadedBlocks(parsed?.blocks ?? parsed),
      projectTitle: 'General',
      project_id:   null,
      visibleLists: {},
    };
  } catch {
    return { blocks: [], projectTitle: 'General', project_id: null, visibleLists: {} };
  }
}

export function writeSelectedProjectBlocks(
  project_id: string | null,
  nextBlocks: Block[],
): void {
  if (!project_id) {
    try {
      const raw = localStorage.getItem(LS_KEY_V1);
      let payload: { blocks: Block[]; collapsed: Record<string, boolean> } = { blocks: nextBlocks, collapsed: {} };
      if (raw) {
        const parsed = JSON.parse(raw) as { collapsed?: unknown };
        payload = {
          blocks:    nextBlocks,
          collapsed: parsed?.collapsed && typeof parsed.collapsed === 'object'
            ? parsed.collapsed as Record<string, boolean>
            : {},
        };
      }
      localStorage.setItem(LS_KEY_V1, JSON.stringify(payload));
      window.dispatchEvent(new Event('youtask_blocks_updated'));
    } catch {}
    return;
  }

  try {
    const raw = localStorage.getItem(LS_KEY_V2);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { projects?: unknown; selectedProjectId?: unknown };
    const projects: Project[] = Array.isArray(parsed?.projects)
      ? (parsed.projects as Record<string, unknown>[]).map(p => ({
          project_id: typeof p?.project_id === 'string' ? p.project_id : '',
          title:      typeof p?.title === 'string' ? p.title : 'Project',
          blocks:     normalizeLoadedBlocks(p?.blocks ?? []),
          collapsed:  p?.collapsed && typeof p.collapsed === 'object'
            ? p.collapsed as Record<string, boolean>
            : {},
          quickCollapsed: p?.quickCollapsed && typeof p.quickCollapsed === 'object'
            ? p.quickCollapsed as Record<string, boolean>
            : {},
          visibleLists: p?.visibleLists && typeof p.visibleLists === 'object'
            ? p.visibleLists as Record<string, boolean>
            : {},
        }))
      : [];
    if (!projects.length) return;
    const idx = projects.findIndex(p => p.project_id === project_id);
    if (idx < 0) return;
    const nextProjects = projects.map(p => ({ ...p }));
    nextProjects[idx] = { ...nextProjects[idx], blocks: nextBlocks };
    localStorage.setItem(LS_KEY_V2, JSON.stringify({ ...parsed, projects: nextProjects }));
    window.dispatchEvent(new Event('youtask_projects_updated'));
    window.dispatchEvent(new Event('youtask_blocks_updated'));
    dbSyncProjects();
  } catch {}
}

/* ===================== Show all (every group at once) ===================== */

/*
 * Global view filters — Workspace, Calendar, Timeline and the day panel all obey them:
 *  - "Show all": every group at once, hidden lists included
 *  - Focused list: only one list (clicked in the Sidebar)
 * They're mutually exclusive: turning one on clears the other.
 */
export const LS_KEY_SHOW_ALL_GROUPS = 'youtask_show_all_groups';
export const LS_KEY_FOCUSED_LIST = 'youtask_focused_list';
export const VIEW_FILTER_EVENT = 'youtask_view_filter_changed';

export type FocusedList = { projectId: string; listId: string };

export function readShowAllGroups(): boolean {
  try {
    return localStorage.getItem(LS_KEY_SHOW_ALL_GROUPS) === '1';
  } catch {
    return false;
  }
}

export function writeShowAllGroups(on: boolean): void {
  try {
    if (on) {
      localStorage.setItem(LS_KEY_SHOW_ALL_GROUPS, '1');
      localStorage.removeItem(LS_KEY_FOCUSED_LIST);
    } else {
      localStorage.removeItem(LS_KEY_SHOW_ALL_GROUPS);
    }
  } catch {}
  window.dispatchEvent(new Event(VIEW_FILTER_EVENT));
}

export function readFocusedList(): FocusedList | null {
  try {
    const raw = localStorage.getItem(LS_KEY_FOCUSED_LIST);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<FocusedList>;
    return typeof v?.projectId === 'string' && typeof v?.listId === 'string'
      ? { projectId: v.projectId, listId: v.listId }
      : null;
  } catch {
    return null;
  }
}

export function writeFocusedList(focus: FocusedList | null): void {
  try {
    if (focus) {
      localStorage.setItem(LS_KEY_FOCUSED_LIST, JSON.stringify(focus));
      localStorage.removeItem(LS_KEY_SHOW_ALL_GROUPS);
    } else {
      localStorage.removeItem(LS_KEY_FOCUSED_LIST);
    }
  } catch {}
  window.dispatchEvent(new Event(VIEW_FILTER_EVENT));
}

/** Hides every list of `blocks` except `listId` (for the focused-list filter). */
export function onlyListVisible(blocks: Block[], listId: string): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const b of blocks) if (b.indent === 0 && b.id !== listId) out[b.id] = false;
  return out;
}

/** One group's data as the views read it. */
export type ViewSource = {
  project_id: string | null;
  title: string;
  /** Always the group's full blocks (edits are saved from them); filters only touch visibleLists */
  blocks: Block[];
  visibleLists: Record<string, boolean>;
  /** Set while the focused-list filter is on */
  focusListTitle?: string;
};

/**
 * What the views should show: the selected group; every group under "Show all"
 * (hidden lists too); or just the focused list.
 */
export function readViewSources(): ViewSource[] {
  const focus = readFocusedList();
  if (focus) {
    const payload = readProjectsLS();
    // Only while its group is the selected one (as Workspace sees it)
    const p = payload?.selectedProjectId === focus.projectId
      ? payload.projects.find(x => x.project_id === focus.projectId)
      : undefined;
    const list = p?.blocks.find(b => b.id === focus.listId && b.indent === 0);
    // A deleted list or group just falls back to the normal view
    if (p && list) {
      return [{
        project_id: p.project_id,
        title: (p.title || 'Project').trim() || 'Project',
        blocks: p.blocks ?? [],
        visibleLists: onlyListVisible(p.blocks ?? [], list.id),
        focusListTitle: (list.text || '').trim() || 'List',
      }];
    }
  }
  if (readShowAllGroups()) {
    const payload = readProjectsLS();
    if (payload?.projects.length) {
      return payload.projects.map(p => ({
        project_id: p.project_id,
        title: (p.title || 'Project').trim() || 'Project',
        blocks: p.blocks ?? [],
        visibleLists: {},
      }));
    }
  }
  const snap = readSelectedProject();
  return [{
    project_id: snap.project_id,
    title: snap.projectTitle,
    blocks: snap.blocks,
    visibleLists: snap.visibleLists,
  }];
}

export function writeSelectedProject(
  project_id: string | null,
  nextBlocks: Block[],
  collapsed: unknown,
): void {
  if (!project_id) {
    try {
      localStorage.setItem(LS_KEY_V1, JSON.stringify({ blocks: nextBlocks, collapsed: collapsed || {} }));
      window.dispatchEvent(new Event('youtask_blocks_updated'));
    } catch {}
    return;
  }

  try {
    const raw = localStorage.getItem(LS_KEY_V2);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { projects?: unknown };
    const projects: Project[] = Array.isArray(parsed?.projects)
      ? (parsed.projects as Record<string, unknown>[]).map(p => ({
          project_id: typeof p?.project_id === 'string' ? p.project_id : '',
          title:      typeof p?.title === 'string' ? p.title : 'Project',
          blocks:     normalizeLoadedBlocks(p?.blocks ?? []),
          collapsed:  p?.collapsed && typeof p.collapsed === 'object'
            ? p.collapsed as Record<string, boolean>
            : {},
          quickCollapsed: p?.quickCollapsed && typeof p.quickCollapsed === 'object'
            ? p.quickCollapsed as Record<string, boolean>
            : {},
          visibleLists: p?.visibleLists && typeof p.visibleLists === 'object'
            ? p.visibleLists as Record<string, boolean>
            : {},
        }))
      : [];
    if (!projects.length) return;
    const idx = projects.findIndex(p => p.project_id === project_id);
    if (idx < 0) return;
    const nextProjects = projects.map(p => ({ ...p }));
    nextProjects[idx] = {
      ...nextProjects[idx],
      blocks:    nextBlocks,
      collapsed: collapsed && typeof collapsed === 'object' ? (collapsed as Record<string, boolean>) : {},
    };
    localStorage.setItem(LS_KEY_V2, JSON.stringify({ ...parsed, projects: nextProjects }));
    window.dispatchEvent(new Event('youtask_projects_updated'));
    window.dispatchEvent(new Event('youtask_blocks_updated'));
    dbSyncProjects();
  } catch {}
}

/* ===================== Archive mutations ===================== */

export function unarchiveTask(blocks: Block[], taskId: string): Block[] {
  const next = blocks.map(x => ({ ...x }));
  for (let i = 0; i < next.length; i++) {
    if (next[i].id !== taskId || next[i].indent !== 1) continue;
    next[i].archived = false;
    let j = i + 1; 
    while (j < next.length && next[j].indent > 1) {
      next[j].archived = false;
      j++;
    }
    break;
  }
  return next;
}

export function unarchiveAll(blocks: Block[]): Block[] {
  return blocks.map(b => b.archived === true ? { ...b, archived: false } : b);
}

/* ===================== AI Patch Task ===================== */

export type AITaskPatch =
  | {
      action: 'create_list';
      listText: string;
      focusDay?: string;
    }
  | {
      action: 'add_task_under_list';
      listId: string;
      text?: string;
      deadline?: string;
      focusDay?: string;
    }
  | {
      action: 'update_task';
      taskId: string;
      text?: string;
      checked?: boolean;
      deadline?: string;
      isHidden?: boolean;
      archived?: boolean;
      focusDay?: string;
    }
  | {
      action: 'rename_list';
      listId: string;
      text: string;
    }
  | {
      action: 'remove_block';
      id: string;
    }
  | {
      action: 'remove_list_keep_children';
      listId: string;
    }
  | {
      action: 'archive_task';
      taskId: string;
    }
  | {
      action: 'unarchive_task';
      taskId: string;
    }
  | {
      action: 'dismiss_completed';
    }
  | {
      action: 'unhide_task';
      taskId: string;
    };

export type AIPatchTaskResult = {
  ok: boolean;
  blocks: Block[];
  changed: boolean;
  message?: string;
  meta?: Record<string, unknown>;
};

export function aipatchtask(
  blocks: Block[],
  patch: AITaskPatch,
): AIPatchTaskResult {
  const base = moveUncToTop(ensureUncExists(blocks));

  try {
    switch (patch.action) {
      case 'create_list': {
        const name = (patch.listText || '').trim();
        if (!name) {
          return {
            ok: false,
            blocks: base,
            changed: false,
            message: 'listText is required.',
          };
        }

        const result = createList(base, name, { focusDay: patch.focusDay });

        return {
          ok: true,
          blocks: result.blocks,
          changed: true,
          message: result.existed ? 'List already existed; task was added.' : 'List created.',
          meta: {
            listId: result.newListId,
            taskId: result.newTaskId,
            existed: result.existed,
          },
        };
      }

      case 'add_task_under_list': {
        const list = base.find(b => b.id === patch.listId && b.indent === 0);
        if (!list) {
          return {
            ok: false,
            blocks: base,
            changed: false,
            message: 'List not found.',
          };
        }

        const result = addTaskUnderList(base, patch.listId, {
          deadline: patch.deadline,
          focusDay: patch.focusDay,
        });

        let next = result.blocks;

        if ((patch.text || '').trim()) {
          next = updateBlock(next, result.newTaskId, {
            text: patch.text!.trim(),
          });
        }

        return {
          ok: true,
          blocks: next,
          changed: true,
          message: 'Task added under list.',
          meta: {
            listId: patch.listId,
            taskId: result.newTaskId,
          },
        };
      }

      case 'update_task': {
        const task = base.find(b => b.id === patch.taskId && b.indent > 0);
        if (!task) {
          return {
            ok: false,
            blocks: base,
            changed: false,
            message: 'Task not found.',
          };
        }

        const patchObj: Partial<Block> = {};

        if (typeof patch.text === 'string') patchObj.text = patch.text;
        if (typeof patch.checked === 'boolean') patchObj.checked = patch.checked;
        if (typeof patch.isHidden === 'boolean') patchObj.isHidden = patch.isHidden;
        if (typeof patch.archived === 'boolean') patchObj.archived = patch.archived;
        if (isValidDateYYYYMMDD(patch.deadline)) patchObj.deadline = patch.deadline;

        const next = updateBlock(base, patch.taskId, patchObj);

        return {
          ok: true,
          blocks: next,
          changed: true,
          message: 'Task updated.',
          meta: { taskId: patch.taskId },
        };
      }

      case 'rename_list': {
        const list = base.find(b => b.id === patch.listId && b.indent === 0);
        if (!list) {
          return {
            ok: false,
            blocks: base,
            changed: false,
            message: 'List not found.',
          };
        }

        if (isUncTitleBlock(list)) {
          return {
            ok: false,
            blocks: base,
            changed: false,
            message: 'Uncategorized cannot be renamed.',
          };
        }

        const text = (patch.text || '').trim();
        if (!text) {
          return {
            ok: false,
            blocks: base,
            changed: false,
            message: 'text is required.',
          };
        }

        const next = updateBlock(base, patch.listId, { text });

        return {
          ok: true,
          blocks: next,
          changed: true,
          message: 'List renamed.',
          meta: { listId: patch.listId },
        };
      }

      case 'remove_block': {
        const exists = base.some(b => b.id === patch.id);
        if (!exists) {
          return {
            ok: false,
            blocks: base,
            changed: false,
            message: 'Block not found.',
          };
        }

        const next = removeBlock(base, patch.id);

        return {
          ok: true,
          blocks: moveUncToTop(ensureUncExists(next)),
          changed: true,
          message: 'Block removed.',
          meta: { id: patch.id },
        };
      }

      case 'remove_list_keep_children': {
        const list = base.find(b => b.id === patch.listId && b.indent === 0);
        if (!list) {
          return {
            ok: false,
            blocks: base,
            changed: false,
            message: 'List not found.',
          };
        }

        if (isUncTitleBlock(list)) {
          return {
            ok: false,
            blocks: base,
            changed: false,
            message: 'Uncategorized cannot be removed.',
          };
        }

        const next = removeTitleSendChildrenToUnc(base, patch.listId);

        return {
          ok: true,
          blocks: next,
          changed: true,
          message: 'List removed and children moved to Uncategorized.',
          meta: { listId: patch.listId },
        };
      }

      case 'archive_task': {
        const task = base.find(b => b.id === patch.taskId && b.indent > 0);
        if (!task) {
          return {
            ok: false,
            blocks: base,
            changed: false,
            message: 'Task not found.',
          };
        }

        const next = archiveTask(base, patch.taskId);

        return {
          ok: true,
          blocks: next,
          changed: true,
          message: 'Task archived.',
          meta: { taskId: patch.taskId },
        };
      }

      case 'unarchive_task': {
        const task = base.find(b => b.id === patch.taskId && b.indent > 0);
        if (!task) {
          return {
            ok: false,
            blocks: base,
            changed: false,
            message: 'Task not found.',
          };
        }

        const next = unarchiveTask(base, patch.taskId);

        return {
          ok: true,
          blocks: next,
          changed: true,
          message: 'Task unarchived.',
          meta: { taskId: patch.taskId },
        };
      }

      case 'dismiss_completed': {
        const next = dismissCompleted(base);
        return {
          ok: true,
          blocks: next,
          changed: true,
          message: 'Completed tasks dismissed.',
        };
      }

      case 'unhide_task': {
        const task = base.find(b => b.id === patch.taskId && b.indent > 0);
        if (!task) {
          return {
            ok: false,
            blocks: base,
            changed: false,
            message: 'Task not found.',
          };
        }

        const next = unhideTask(base, patch.taskId);

        return {
          ok: true,
          blocks: next,
          changed: true,
          message: 'Task unhidden.',
          meta: { taskId: patch.taskId },
        };
      }

      default:
        return {
          ok: false,
          blocks: base,
          changed: false,
          message: 'Unsupported AI patch action.',
        };
    }
  } catch (err) {
    return {
      ok: false,
      blocks: base,
      changed: false,
      message: err instanceof Error ? err.message : 'Unknown error applying AI patch.',
    };
  }
}

/* ===================== Checklists — normalization ===================== */

function normalizeChecklistItems(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  let prevIndent = 0;
  return (raw as Record<string, unknown>[]).map(x => {
    // Never more than one level under the item above it
    const want = Number.isInteger(x?.indent) ? Number(x.indent) : 1;
    const indent = Math.max(1, Math.min(want, prevIndent + 1, CHECKLIST_MAX_INDENT));
    prevIndent = indent;
    return {
      id:      typeof x?.id === 'string'   ? x.id   : uid(),
      text:    typeof x?.text === 'string' ? x.text : '',
      checked: Boolean(x?.checked),
      ...(indent > 1 ? { indent } : {}),
    };
  });
}

export function checklistIndent(item: Pick<ChecklistItem, 'indent'>): number {
  return item.indent && item.indent > 1 ? item.indent : 1;
}

/** Index just past an item's sub-items (same rule as tasks: the deeper rows right below it). */
export function checklistSubtreeEnd(items: ChecklistItem[], index: number): number {
  const depth = checklistIndent(items[index]);
  let end = index + 1;
  while (end < items.length && checklistIndent(items[end]) > depth) end++;
  return end;
}

function normalizeChecklists(raw: unknown): Checklist[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map(x => ({
    id:    typeof x?.id === 'string'   ? x.id   : uid(),
    name:  typeof x?.name === 'string' ? x.name : 'New list',
    items: normalizeChecklistItems(x?.items),
  }));
}

export function makeDefaultChecklistItem(): ChecklistItem {
  return { id: uid(), text: '', checked: false };
}

export function makeDefaultChecklist(name = 'New checklist'): Checklist {
  return { id: uid(), name, items: [] };
}

/* ===================== Checklists — persistence ===================== */

export function readChecklistsLS(): ChecklistsPayload {
  try {
    const raw = localStorage.getItem(LS_KEY_CHECKLISTS);
    if (!raw) return { lists: [] };
    const parsed = JSON.parse(raw);
    return {
      lists:           normalizeChecklists(parsed?.lists ?? parsed),
      selectedListId:  typeof parsed?.selectedListId === 'string' ? parsed.selectedListId : undefined,
    };
  } catch {
    return { lists: [] };
  }
}

export function writeChecklistsLS(payload: ChecklistsPayload): void {
  try {
    const prevRaw = localStorage.getItem(LS_KEY_CHECKLISTS);
    const prevCount = prevRaw
      ? (JSON.parse(prevRaw) as ChecklistsPayload).lists?.reduce((n, l) => n + (l.items?.length ?? 0), 0) ?? 0
      : 0;
    const nextCount = payload.lists?.reduce((n, l) => n + (l.items?.length ?? 0), 0) ?? 0;
    backupBeforeShrink('checklists', prevRaw, prevCount, nextCount);
    localStorage.setItem(LS_KEY_CHECKLISTS, JSON.stringify(payload));
    window.dispatchEvent(new Event('youtask_checklists_updated'));
    dbSyncChecklists();
  } catch {}
}

/* ===================== Checklists — list-level mutations ===================== */

/** New checklist at the end, or right after `afterId` (the hover "Checklist…" under a list). */
export function addChecklist(
  lists: Checklist[],
  name?: string,
  afterId?: string,
): { lists: Checklist[]; newList: Checklist } {
  const fallback = `Checklist ${lists.length + 1}`;
  const newList  = makeDefaultChecklist((name ?? '').trim() || fallback);
  const i = afterId ? lists.findIndex(l => l.id === afterId) : -1;
  const next = i < 0 ? [...lists, newList] : [...lists.slice(0, i + 1), newList, ...lists.slice(i + 1)];
  return { lists: next, newList };
}

export function removeChecklist(
  lists: Checklist[],
  id: string,
): { lists: Checklist[]; focusId: string | null } {
  const idx  = lists.findIndex(l => l.id === id);
  const next = lists.filter(l => l.id !== id);
  const focusId = next[Math.max(0, idx - 1)]?.id ?? next[0]?.id ?? null;
  return { lists: next, focusId };
}

export function emptyChecklist(lists: Checklist[], id: string): Checklist[] {
  return lists.map(l => l.id === id ? { ...l, items: [] } : l);
}

export function renameChecklist(lists: Checklist[], id: string, name: string): Checklist[] {
  return lists.map(l => l.id === id ? { ...l, name } : l);
}

/** Drag a list to another spot; the array order is what the server stores as `position`. */
export function moveChecklist(lists: Checklist[], fromIndex: number, toIndex: number): Checklist[] {
  return arrayMove(lists, fromIndex, toIndex);
}

export function updateChecklist(
  lists: Checklist[],
  id: string,
  patch: Partial<Omit<Checklist, 'id'>>,
): Checklist[] {
  return lists.map(l => l.id === id ? { ...l, ...patch } : l);
}

/* ===================== Checklists — item-level mutations ===================== */

export function addChecklistItem(
  lists: Checklist[],
  listId: string,
): { lists: Checklist[]; newItem: ChecklistItem | null } {
  const newItem = makeDefaultChecklistItem();
  const next    = lists.map(l =>
    l.id === listId ? { ...l, items: [...l.items, newItem] } : l,
  );
  const found = lists.some(l => l.id === listId);
  return { lists: next, newItem: found ? newItem : null };
}

/**
 * New item right after `afterItemId`.
 * - `asFirstSubItem`: one level deeper, as its first sub-item.
 * - otherwise a sibling at the same depth, placed after the item's sub-items (they stay its own).
 */
export function insertChecklistItemAfter(
  lists: Checklist[],
  listId: string,
  afterItemId: string,
  asFirstSubItem = false,
): { lists: Checklist[]; newItem: ChecklistItem | null } {
  let newItem: ChecklistItem | null = null;
  const next = lists.map(l => {
    if (l.id !== listId) return l;
    const i = l.items.findIndex(it => it.id === afterItemId);
    const items = l.items.slice();
    if (i < 0) {
      newItem = makeDefaultChecklistItem();
      items.push(newItem);
      return { ...l, items };
    }
    const depth = checklistIndent(l.items[i]) + (asFirstSubItem ? 1 : 0);
    newItem = { ...makeDefaultChecklistItem(), ...(depth > 1 ? { indent: Math.min(depth, CHECKLIST_MAX_INDENT) } : {}) };
    items.splice(asFirstSubItem ? i + 1 : checklistSubtreeEnd(l.items, i), 0, newItem);
    return { ...l, items };
  });
  return { lists: next, newItem };
}

/** Removes an item; `withSubItems` takes its sub-items too (otherwise they stay, under the item above). */
export function removeChecklistItem(
  lists: Checklist[],
  listId: string,
  itemId: string,
  withSubItems = false,
): { lists: Checklist[]; focusId: string | null } {
  let focusId: string | null = null;
  const next = lists.map(l => {
    if (l.id !== listId) return l;
    const idx = l.items.findIndex(it => it.id === itemId);
    if (idx < 0) return l;
    const end = withSubItems ? checklistSubtreeEnd(l.items, idx) : idx + 1;
    const items = normalizeChecklistItems([...l.items.slice(0, idx), ...l.items.slice(end)]);
    focusId = items[Math.max(0, idx - 1)]?.id ?? items[0]?.id ?? null;
    return { ...l, items };
  });
  return { lists: next, focusId };
}

/**
 * Patches an item. A check cascades like tasks: down to all its sub-items, and up — a parent
 * is done once all its sub-items are, and reopens when one isn't.
 */
export function updateChecklistItem(
  lists: Checklist[],
  listId: string,
  itemId: string,
  patch: Partial<ChecklistItem>,
): Checklist[] {
  return lists.map(l => {
    if (l.id !== listId) return l;
    const items = l.items.map(it => it.id === itemId ? { ...it, ...patch } : it);
    const i = items.findIndex(it => it.id === itemId);
    if (i < 0 || typeof patch.checked !== 'boolean') return { ...l, items };

    const checked = patch.checked;
    for (let j = i + 1; j < checklistSubtreeEnd(items, i); j++) items[j] = { ...items[j], checked };

    let level = checklistIndent(items[i]);
    for (let p = i - 1; p >= 0 && level > 1; p--) {
      const depth = checklistIndent(items[p]);
      if (depth >= level) continue;
      level = depth;
      const kids = items.slice(p + 1, checklistSubtreeEnd(items, p));
      const parentChecked = kids.every(k => k.checked);
      if (items[p].checked === parentChecked) break;
      items[p] = { ...items[p], checked: parentChecked };
    }
    return { ...l, items };
  });
}

/** Tab / Shift+Tab: one level deeper (at most one under the item above it) or shallower. Sub-items move along. */
export function indentChecklistItem(
  lists: Checklist[],
  listId: string,
  itemId: string,
  delta: 1 | -1,
): Checklist[] {
  return lists.map(l => {
    if (l.id !== listId) return l;
    const i = l.items.findIndex(it => it.id === itemId);
    if (i < 0) return l;
    const depth = checklistIndent(l.items[i]);
    const max = i > 0 ? Math.min(CHECKLIST_MAX_INDENT, checklistIndent(l.items[i - 1]) + 1) : 1;
    const target = Math.max(1, Math.min(depth + delta, max));
    if (target === depth) return l;
    const end = checklistSubtreeEnd(l.items, i);
    const items = l.items.map((it, j) =>
      j >= i && j < end ? { ...it, indent: Math.min(CHECKLIST_MAX_INDENT, checklistIndent(it) + target - depth) } : it,
    );
    return { ...l, items: normalizeChecklistItems(items) };
  });
}

/** Drag: moves an item with its sub-items onto `toIndex` (no-op when dropped inside itself). */
export function moveChecklistItem(
  lists: Checklist[],
  listId: string,
  fromIndex: number,
  toIndex: number,
): Checklist[] {
  return lists.map(l => {
    if (l.id !== listId) return l;
    const end = checklistSubtreeEnd(l.items, fromIndex);
    if (toIndex >= fromIndex && toIndex < end) return l;
    const unit = l.items.slice(fromIndex, end);
    const rest = [...l.items.slice(0, fromIndex), ...l.items.slice(end)];
    // Dropping lower lands after the target (and its sub-items), higher lands before it
    const target = l.items[toIndex];
    const at = rest.indexOf(target);
    const insertAt = toIndex > fromIndex ? checklistSubtreeEnd(rest, at) : at;
    // The unit takes the target's depth; normalizing keeps it at most one under the row above
    const shift = checklistIndent(target) - checklistIndent(unit[0]);
    const moved = unit.map(it => ({ ...it, indent: checklistIndent(it) + shift }));
    return { ...l, items: normalizeChecklistItems([...rest.slice(0, insertAt), ...moved, ...rest.slice(insertAt)]) };
  });
}

/* ===================== Danger zone — delete all data ===================== */

/**
 * Wipes lists/tasks, habits, reminders and checklists — server first, then this device.
 *
 * Server first and awaited (not the fire-and-forget dbPost): if the wipe only
 * happened locally, the next loadFromDatabase() would see server data and
 * restore it. Each dataset is cleared on this device only once the server
 * confirmed it, so device and server never disagree about what's left.
 */
export async function deleteAllData(): Promise<{ ok: true } | { ok: false; message: string }> {
  // Start over from the starter groups, like a new account
  const fresh = ensureDefaultGroups([]);
  const datasets = [
    { label: 'lists & tasks', path: '/api/data/projects' as SyncPath,
      body: { projects: fresh, selectedProjectId: fresh[0].project_id } as ProjectsPayload,
      clearLocal: () => writeProjectsLS({ projects: fresh, selectedProjectId: fresh[0].project_id }) },
    { label: 'habits', path: '/api/data/habits' as SyncPath,
      body: { habits: [] } as HabitsPayload,
      clearLocal: () => writeHabitsLS({ ...readHabitsLS(), habits: [] }) },
    { label: 'reminders', path: '/api/data/reminders' as SyncPath,
      body: { reminders: [] } as RemindersPayload,
      clearLocal: () => writeRemindersLS({ reminders: [] }) },
    { label: 'checklists', path: '/api/data/checklists' as SyncPath,
      body: { lists: [] } as ChecklistsPayload,
      clearLocal: () => writeChecklistsLS({ lists: [] }) },
  ];

  const uid = getCurrentUid();
  const hasServer = process.env.NEXT_PUBLIC_DATABASE_MODE !== 'local' && Boolean(uid) && uid !== 'testuser';

  const results = hasServer
    ? await Promise.all(datasets.map(d =>
        apiFetch(d.path, {
          uid,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Sync-Hydrated': '1' },
          body: JSON.stringify(d.body),
        }).then(r => r.ok).catch(() => false),
      ))
    : datasets.map(() => true);

  datasets.forEach((d, i) => { if (results[i]) d.clearLocal(); });

  const failed = datasets.filter((_, i) => !results[i]).map(d => d.label);
  if (failed.length === datasets.length) {
    return { ok: false, message: 'Could not reach the server. Nothing was deleted — check your connection and try again.' };
  }
  if (failed.length > 0) {
    return { ok: false, message: `Some data could not be deleted (${failed.join(', ')}). Try again to finish.` };
  }
  return { ok: true };
}

/* ===================== Backup — export / import ===================== */

export type BackupData = {
  version: number;
  exportedAt: string;
  projects: ProjectsPayload;
  habits: HabitsPayload;
  reminders: RemindersPayload;
  checklists: ChecklistsPayload;
};

export type ImportMode = 'override' | 'merge';

export function exportAllData(): BackupData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: readProjectsLS() ?? { projects: [makePersonalProject()] },
    habits: readHabitsLS(),
    reminders: readRemindersLS(),
    checklists: readChecklistsLS(),
  };
}

export function importAllData(raw: unknown, mode: ImportMode): void {
  const data = (raw ?? {}) as Partial<BackupData>;

  if (Array.isArray(data.projects?.projects)) {
    if (mode === 'override') {
      writeProjectsLS({
        projects: data.projects!.projects,
        selectedProjectId: data.projects!.selectedProjectId,
      });
    } else {
      // Merge the imported blocks into the currently selected project — the UI
      // only renders the selected project, so appending separate projects would
      // leave the imported data invisible.
      const current = readProjectsLS() ?? { projects: [makePersonalProject()] };
      const idx = Math.max(0, current.projects.findIndex(p => p.project_id === current.selectedProjectId));
      const target = current.projects[idx];

      const merged: Block[] = [...target.blocks];
      const currentUncId = merged[findUncRange(merged).uncIndex]?.id ?? null;
      let nextRootOrder = nextOrderInParent(merged, null);

      for (const proj of data.projects!.projects) {
        const blocks = Array.isArray(proj?.blocks) ? (proj.blocks as Block[]) : [];
        const incomingUncId = blocks.find(b => b.indent === 0 && isUncTitleBlock(b))?.id ?? null;
        const idMap = new Map<string, string>();

        for (const b of blocks) {
          if (b.id === incomingUncId) continue; // fold into the existing Uncategorized list
          const newId = uid();
          idMap.set(b.id, newId);
          const clone: Block = { ...b, id: newId };
          if (clone.indent === 0) {
            clone.parentId = null;
            clone.order = nextRootOrder++;
          } else {
            clone.parentId = b.parentId === incomingUncId
              ? currentUncId
              : (b.parentId ? (idMap.get(b.parentId) ?? currentUncId) : currentUncId);
            clone.order = nextOrderInParent(merged, clone.parentId);
          }
          merged.push(clone);
        }
      }

      const nextProjects = current.projects.map((p, i) =>
        i === idx
          ? { ...p, blocks: sortBlocksByOrder(moveUncToTop(ensureUncExists(merged))) }
          : p,
      );
      writeProjectsLS({ projects: nextProjects, selectedProjectId: current.selectedProjectId });
    }
  }

  if (Array.isArray(data.habits?.habits)) {
    if (mode === 'override') {
      writeHabitsLS(data.habits!);
    } else {
      const current = readHabitsLS();
      const incoming = data.habits!.habits.map(h => ({ ...h, id: uid() }));
      writeHabitsLS({ ...current, habits: [...current.habits, ...incoming] });
    }
  }

  if (Array.isArray(data.reminders?.reminders)) {
    if (mode === 'override') {
      writeRemindersLS(data.reminders!);
    } else {
      const current = readRemindersLS();
      const incoming = data.reminders!.reminders.map(r => ({ ...r, id: uid() }));
      writeRemindersLS({ reminders: [...current.reminders, ...incoming] });
    }
  }

  if (Array.isArray(data.checklists?.lists)) {
    if (mode === 'override') {
      writeChecklistsLS(data.checklists!);
    } else {
      const current = readChecklistsLS();
      const incoming = data.checklists!.lists.map(l => ({
        ...l,
        id: uid(),
        items: l.items.map(it => ({ ...it, id: uid() })),
      }));
      writeChecklistsLS({ ...current, lists: [...current.lists, ...incoming] });
    }
  }
}
