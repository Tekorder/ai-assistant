// lib/datacenter.ts
// ─────────────────────────────────────────────────────────────
//  YouTask — fuente única de verdad para el array de proyectos
//  Toda mutación, normalización y persistencia pasa por aquí.
// ─────────────────────────────────────────────────────────────

/* ===================== Constants ===================== */

export const LS_KEY_V2        = 'youtask_projects_v1';
export const LS_KEY_V1        = 'youtask_blocks_v1';      // legacy migration
export const LS_KEY_HABITS    = 'youtask_habits_v1';
export const LS_KEY_REMINDERS = 'youtask_reminders_v1';
export const UNC_TITLE        = 'Uncategorized';

/* ===================== Types ===================== */

export type Block = {
  id: string;
  text: string;
  indent: number;
  checked?: boolean;
  deadline?: string;
  createdAt?: string;
  isHidden?: boolean;
  archived?: boolean;
};

export type Project = {
  project_id: string;
  title: string;
  blocks: Block[];
  collapsed: Record<string, boolean>;
  quickCollapsed?: Record<string, boolean>;
};

export type ListSection = {
  list: Block;
  tasks: Block[];
};

export type DateMode = 'today' | 'week' | 'month' | 'all';
export type SortBy = 'dueDate' | 'createdAt';

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
};

export type RemindersPayload = {
  reminders: ReminderItem[];
};

/* ─── Internal raw types (for deserialization) ─── */

type RawBlock = {
  id?: unknown;
  text?: unknown;
  indent?: unknown;
  checked?: unknown;
  deadline?: unknown;
  createdAt?: unknown;
  isHidden?: unknown;
  archived?: unknown;
};

type RawProject = {
  project_id?: unknown;
  title?: unknown;
  blocks?: unknown;
  collapsed?: unknown;
  quickCollapsed?: unknown;
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
  const d  = parseYMD(ymd);
  const wd  = d.toLocaleDateString('en-US', { weekday: 'short' });
  const day = d.toLocaleDateString('en-US', { day:     '2-digit' });
  const mon = d.toLocaleDateString('en-US', { month:   'short' });
  return `${wd} ${day} ${mon}`;
}

export function formatPill(deadline?: string): string {
  if (!deadline || !isValidDateYYYYMMDD(deadline)) return '';
  const [y, m, d] = deadline.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function dayDiffFromToday(yyyyMmDd?: string): number | null {
  if (!yyyyMmDd || !isValidDateYYYYMMDD(yyyyMmDd)) return null;
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const ms = new Date(y, m - 1, d).getTime() - startOfLocalDay(new Date()).getTime();
  return Math.round(ms / 86400000);
}

export function pillClass(deadline?: string, checked?: boolean): string {
  if (checked) return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/25 hover:bg-emerald-500/20';
  const diff = dayDiffFromToday(deadline);
  if (diff === null) return 'bg-transparent text-white/25 hover:text-white/45 border-white/10';
  if (diff < 0)  return 'bg-red-500/15 text-red-200 border-red-400/25 hover:bg-red-500/20';
  if (diff === 0) return 'bg-amber-500/15 text-amber-200 border-amber-400/25 hover:bg-amber-500/20';
  if (diff === 1) return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/25 hover:bg-emerald-500/20';
  return 'bg-sky-500/10 text-sky-200/80 border-sky-400/20 hover:bg-sky-500/15';
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
  if (!isValidDateYYYYMMDD(ymd)) return ymd;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
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
  return [...blocks, { id: uid(), text: UNC_TITLE, indent: 0 }];
}

export function moveUncToTop(blocks: Block[]): Block[] {
  const b = ensureUncExists(blocks);
  const { uncIndex, end } = findUncRange(b);
  if (uncIndex < 0 || uncIndex === 0) return b;
  return [...b.slice(uncIndex, end), ...b.slice(0, uncIndex), ...b.slice(end)];
}

/* ===================== Factories ===================== */

export function makeTaskBlock(
  overrides: Partial<Block> & { id: string },
  focusDay?: string,
): Block {
  return {
    text: '',
    indent: 1,
    checked: false,
    deadline: isValidDateYYYYMMDD(focusDay) ? focusDay : todayYMD(),
    createdAt: todayYMD(),
    isHidden: undefined,
    archived: undefined,
    ...overrides,
  };
}

export function makePersonalProject(
  blocks?: Block[],
  collapsed?: Record<string, boolean>,
  quickCollapsed?: Record<string, boolean>,
): Project {
  return {
    project_id: pid(),
    title: 'Personal',
    blocks: blocks?.length
      ? moveUncToTop(ensureUncExists(blocks))
      : moveUncToTop(ensureUncExists([])),
    collapsed: collapsed && typeof collapsed === 'object' ? collapsed : {},
    quickCollapsed: quickCollapsed && typeof quickCollapsed === 'object' ? quickCollapsed : {},
  };
}

/* ===================== Normalization ===================== */

export function normalizeLoadedBlocks(raw: unknown): Block[] {
  const today = todayYMD();
  if (!Array.isArray(raw)) return moveUncToTop(ensureUncExists([]));

  const out: Block[] = (raw as RawBlock[]).map((x: RawBlock) => {
    const id     = typeof x?.id === 'string' ? x.id : uid();
    const text   = typeof x?.text === 'string' ? x.text : '';
    const indent = Number.isFinite(x?.indent) ? Number(x.indent) : 0;
    const b: Block = { id, text, indent: Math.max(0, indent) };

    if (b.indent > 0) {
      b.checked = Boolean(x?.checked);
      if (isValidDateYYYYMMDD(x?.deadline)) b.deadline = x.deadline as string;
    }

    b.createdAt = isValidDateYYYYMMDD(x?.createdAt) ? (x.createdAt as string) : today;
    if (typeof x?.isHidden === 'boolean') b.isHidden = x.isHidden;
    if (typeof x?.archived === 'boolean') b.archived = x.archived;
    return b;
  }).filter(Boolean) as Block[];

  return moveUncToTop(ensureUncExists(out));
}

/* ===================== Persistence (localStorage) ===================== */



/** Elimina tareas vacías — solo se ejecuta una vez por carga de página */
export function cleanupEmptyTasks(blocks: Block[]): Block[] {
  return blocks.filter(b => b.indent === 0 || (b.text || '').trim() !== '');
}

export function readProjectsLS(): ProjectsPayload | null {
  try {
    const raw = localStorage.getItem(LS_KEY_V2);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoragePayload;

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

export function writeProjectsLS(payload: ProjectsPayload): void {
  try {
    localStorage.setItem(LS_KEY_V2, JSON.stringify(payload));
    window.dispatchEvent(new Event('youtask_projects_updated'));
    window.dispatchEvent(new Event('youtask_blocks_updated'));
  } catch {}
}

/* ===================== Filter helpers ===================== */

export function getFilterDate(b: Block, sortBy: SortBy): string | undefined {
  return sortBy === 'createdAt' ? b.createdAt : b.deadline;
}

export function passesDateFilter(
  b: Block,
  opts: { sortBy: SortBy; dateMode: DateMode; focusDay: string },
): boolean {
  if (!(b.indent > 0)) return true;
  const date = getFilterDate(b, opts.sortBy);
  if (!date || !isValidDateYYYYMMDD(date)) return false;
  if (opts.dateMode === 'all')   return true;
  if (opts.dateMode === 'today') return date === opts.focusDay;
  if (opts.dateMode === 'week')  return inWeekRange(date, opts.focusDay);
  return inMonthRange(date, opts.focusDay);
}

export function buildSplitDays(
  opts: { dateMode: DateMode; focusDay: string; blocks: Block[]; showHidden: boolean; sortBy: SortBy },
): string[] {
  const { dateMode, focusDay, blocks, showHidden, sortBy } = opts;

  if (dateMode === 'today') return [focusDay];

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
    sortBy: SortBy;
  },
): Record<string, boolean> {
  const { collapsed, showHidden, dateMode, focusDay, sortBy } = opts;
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

    if (b.indent > 0 && !passesDateFilter(b, { sortBy, dateMode, focusDay })) {
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

/* ===================== Block mutations ===================== */

export function insertBlockAfter(blocks: Block[], afterId: string, newBlock: Block): Block[] {
  const i = blocks.findIndex(b => b.id === afterId);
  if (i < 0) return blocks;
  const next = blocks.slice();
  next.splice(i + 1, 0, newBlock);
  return next;
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

export function updateBlock(
  blocks: Block[],
  id: string,
  patch: Partial<Block>,
  focusDay?: string,
): Block[] {
  return blocks.map(b => {
    if (b.id !== id) return b;

    if (patch.checked === true) {
      return {
        ...b,
        ...patch,
        deadline: isValidDateYYYYMMDD(focusDay) ? focusDay : todayYMD(),
        isHidden: false,
      };
    }

    if (patch.checked === false) {
      return {
        ...b,
        ...patch,
        isHidden: false,
      };
    }

    return { ...b, ...patch };
  });
}

export function addTaskUnderList(
  blocks: Block[],
  listId?: string | null,
  opts: { deadline?: string; focusDay?: string; text?: string } = {},
): { blocks: Block[]; newTaskId: string; targetListId: string | null } {
  const newTaskId = uid();
  const base = moveUncToTop(ensureUncExists(blocks));

  const defaultDeadline =
    opts.deadline && isValidDateYYYYMMDD(opts.deadline)
      ? opts.deadline
      : isValidDateYYYYMMDD(opts.focusDay)
      ? opts.focusDay!
      : todayYMD();

  const newTask = makeTaskBlock(
    {
      id: newTaskId,
      deadline: defaultDeadline,
      text: (opts.text || '').trim(),
    },
    opts.focusDay,
  );

  const validListIndex =
    typeof listId === 'string' && listId.trim()
      ? base.findIndex(b => b.id === listId && b.indent === 0)
      : -1;

  if (validListIndex >= 0) {
    let end = validListIndex + 1;
    while (end < base.length && base[end].indent !== 0) end++;

    const next = base.slice();
    next.splice(end, 0, newTask);

    return {
      blocks: next,
      newTaskId,
      targetListId: base[validListIndex].id,
    };
  }

  const { end: uncEnd, uncIndex } = findUncRange(base);
  const insertAt = uncEnd >= 0 ? uncEnd : base.length;

  const next = base.slice();
  next.splice(insertAt, 0, newTask);

  return {
    blocks: next,
    newTaskId,
    targetListId: uncIndex >= 0 ? base[uncIndex].id : null,
  };
}

export function createList(
  blocks: Block[],
  listText: string,
  opts: { focusDay?: string } = {},
): { blocks: Block[]; newListId: string; newTaskId: string; existed: boolean } {
  const name      = (listText || '').trim() || 'New List';
  const newListId = uid();
  const newTaskId = uid();

  const existingId = blocks.find(
    b => b.indent === 0 && !isUncTitleBlock(b) && (b.text || '').trim().toLowerCase() === name.toLowerCase(),
  )?.id;

  if (existingId) {
    const result = addTaskUnderList(blocks, existingId, { focusDay: opts.focusDay });
    return { blocks: result.blocks, newListId: existingId, newTaskId: result.newTaskId, existed: true };
  }

  const base = moveUncToTop(ensureUncExists(blocks));
  const { end: uncEnd } = findUncRange(base);
  const insertAt = Math.max(uncEnd, base.length);

  const next = base.slice();
  next.splice(insertAt, 0, { id: newListId, text: name, indent: 0, createdAt: todayYMD() });
  next.splice(insertAt + 1, 0, makeTaskBlock({ id: newTaskId }, opts.focusDay));

  return { blocks: next, newListId, newTaskId, existed: false };
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
  next.splice(insertAt, 0, { id: newListId, text: 'New List', indent: 0, createdAt: todayYMD() });
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
    localStorage.setItem(LS_KEY_HABITS, JSON.stringify(payload));
    window.dispatchEvent(new Event('youtask_habits_updated'));
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
    id:    typeof x?.id    === 'string' ? x.id    : uid(),
    title: typeof x?.title === 'string' ? x.title : '',
    date:  isValidDateYYYYMMDD(x?.date) ? x.date as string : todayYMD(),
    time:  isValidTimeHHMM(x?.time)     ? x.time as string : '11:00',
    daily: typeof x?.daily === 'boolean' ? x.daily : false,
  }));
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
    localStorage.setItem(LS_KEY_REMINDERS, JSON.stringify(payload));
    window.dispatchEvent(new Event('youtask_reminders_updated'));
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
        };
      }
    }
  } catch {}

  try {
    const raw = localStorage.getItem(LS_KEY_V1);
    if (!raw) return { blocks: [], projectTitle: 'General', project_id: null };
    const parsed = JSON.parse(raw) as { blocks?: unknown };
    return {
      blocks:       normalizeLoadedBlocks(parsed?.blocks ?? parsed),
      projectTitle: 'General',
      project_id:   null,
    };
  } catch {
    return { blocks: [], projectTitle: 'General', project_id: null };
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
  } catch {}
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
          }, patch.focusDay);
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

        const next = updateBlock(base, patch.taskId, patchObj, patch.focusDay);

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