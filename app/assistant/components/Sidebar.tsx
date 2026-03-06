// app/components/Sidebar.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SearchIcon } from '../_icons/SearchIcon';
import { PivotModal, buildPrunedPivotTree, extractWordAt, type PivotTreeRow } from './pivot';

type Block = {
  id: string;
  text: string;
  indent: number; // 0 = title, 1+ = task/subtask
  checked?: boolean; // only if indent > 0
  deadline?: string; // YYYY-MM-DD (tasks)
  isHidden?: boolean; // soft hidden (dismissed)
  archived?: boolean; // hard hidden (never shown in Tasks UI)
};

type Project = {
  project_id: string;
  title: string;
  blocks: Block[];
  collapsed: Record<string, boolean>;
};

// Habits tab
type HabitBlock = {
  id: string;
  text: string;
  indent: 1; // always 1
  checked: boolean;
  weekly?: boolean; // if true: only resets on Mondays
};

// Reminders tab
type ReminderItem = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  daily?: boolean;
};

const LS_KEY_V2 = 'youtask_projects_v1'; // Projects + selectedProjectId
const LS_KEY_V1 = 'youtask_blocks_v1'; // Old fallback
const LS_KEY_HABITS = 'youtask_habits_v1';
const LS_KEY_REMINDERS = 'youtask_reminders_v1';

// ✅ perpetual hidden title (should exist but NEVER render as a title)
const UNC_TITLE = 'Uncategorized';

function uid(len = 8) {
  return Math.random().toString(36).slice(2, 2 + len);
}
function pid() {
  return String(Math.floor(10000 + Math.random() * 90000));
}
function arrayMove<T>(arr: T[], from: number, to: number) {
  if (from === to) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
function isValidDateYYYYMMDD(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isValidTimeHHMM(s: unknown): s is string {
  return typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);
}
function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function isMondayLocal() {
  return new Date().getDay() === 1;
}
function formatPill(deadline?: string) {
  if (!deadline) return '';
  if (!isValidDateYYYYMMDD(deadline)) return '';
  const [y, m, d] = deadline.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

/* ===================== Uncategorized helpers ===================== */
function isUncTitleBlock(b: Block) {
  return b.indent === 0 && (b.text || '').trim().toLowerCase() === UNC_TITLE.toLowerCase();
}
function findUncRange(blocks: Block[]) {
  const uncIndex = blocks.findIndex(isUncTitleBlock);
  if (uncIndex < 0) return { uncIndex: -1, start: -1, end: -1 };

  const start = uncIndex + 1;
  let end = start;
  while (end < blocks.length) {
    if (blocks[end].indent === 0) break;
    end++;
  }
  return { uncIndex, start, end };
}
function ensureUncExists(blocks: Block[]) {
  const { uncIndex } = findUncRange(blocks);
  if (uncIndex >= 0) return blocks;
  return [...blocks, { id: uid(), text: UNC_TITLE, indent: 0 }];
}
function moveUncToTop(blocks: Block[]) {
  const b = ensureUncExists(blocks);
  const { uncIndex, end } = findUncRange(b);
  if (uncIndex < 0) return b;
  if (uncIndex === 0) return b;

  const range = b.slice(uncIndex, end); // title + tasks
  const rest = b.slice(0, uncIndex).concat(b.slice(end));
  return [...range, ...rest];
}

function normalizeLoadedBlocks(raw: any): Block[] {
  if (!Array.isArray(raw)) return moveUncToTop(ensureUncExists([]));

  const out: Block[] = raw
    .map((x: any) => {
      const id = typeof x?.id === 'string' ? x.id : uid();
      const text = typeof x?.text === 'string' ? x.text : '';
      const indent = Number.isFinite(x?.indent) ? Number(x.indent) : 0;

      // ❌ drop empty titles
     // if (indent === 0 && text.trim() === '') return null;

      const b: Block = { id, text, indent: Math.max(0, indent) };

      if (b.indent > 0) {
        b.checked = Boolean(x?.checked);
        if (isValidDateYYYYMMDD(x?.deadline)) b.deadline = x.deadline;
      }

      if (typeof x?.isHidden === 'boolean') b.isHidden = x.isHidden;
      if (typeof x?.archived === 'boolean') b.archived = x.archived;

      return b;
    })
    .filter(Boolean) as Block[];

  // ✅ always ensure Uncategorized exists and is on top
  return moveUncToTop(ensureUncExists(out));
}

function makePersonalProject(blocks?: Block[], collapsed?: Record<string, boolean>): Project {
  return {
    project_id: pid(),
    title: 'Personal',
    blocks: blocks && blocks.length
      ? moveUncToTop(ensureUncExists(blocks))
      : moveUncToTop(ensureUncExists([{ id: uid(), text: '', indent: 0 }])),
    collapsed: collapsed && typeof collapsed === 'object' ? collapsed : {},
  };
}

/* ------------------ Habits LS ------------------ */
type HabitsPayload = {
  habits: HabitBlock[];
  lastDailyResetYMD?: string;
  lastWeeklyResetYMD?: string;
};

function normalizeHabits(raw: any): HabitBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x: any) => {
      const id = typeof x?.id === 'string' ? x.id : uid();
      const text = typeof x?.text === 'string' ? x.text : '';
      const checked = Boolean(x?.checked);
      const weekly = typeof x?.weekly === 'boolean' ? x.weekly : false;
      return { id, text, indent: 1 as const, checked, weekly } as HabitBlock;
    })
    .filter(Boolean);
}

function readHabitsLS(): HabitsPayload {
  try {
    const raw = localStorage.getItem(LS_KEY_HABITS);
    if (!raw) return { habits: [] };
    const parsed = JSON.parse(raw);
    return {
      habits: normalizeHabits(parsed?.habits ?? parsed),
      lastDailyResetYMD: typeof parsed?.lastDailyResetYMD === 'string' ? parsed.lastDailyResetYMD : undefined,
      lastWeeklyResetYMD: typeof parsed?.lastWeeklyResetYMD === 'string' ? parsed.lastWeeklyResetYMD : undefined,
    };
  } catch {
    return { habits: [] };
  }
}
function writeHabitsLS(payload: HabitsPayload) {
  try {
    localStorage.setItem(LS_KEY_HABITS, JSON.stringify(payload));
    window.dispatchEvent(new Event('youtask_habits_updated'));
  } catch {}
}

/* ------------------ Reminders LS ------------------ */
type RemindersPayload = { reminders: ReminderItem[] };

function normalizeReminders(raw: any): ReminderItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x: any) => {
      const id = typeof x?.id === 'string' ? x.id : uid();
      const title = typeof x?.title === 'string' ? x.title : '';
      const date = isValidDateYYYYMMDD(x?.date) ? x.date : todayYMD();
      const time = isValidTimeHHMM(x?.time) ? x.time : '11:00';
      const daily = typeof x?.daily === 'boolean' ? x.daily : false;
      return { id, title, date, time, daily } as ReminderItem;
    })
    .filter(Boolean);
}

function readRemindersLS(): RemindersPayload {
  try {
    const raw = localStorage.getItem(LS_KEY_REMINDERS);
    if (!raw) return { reminders: [] };
    const parsed = JSON.parse(raw);
    return { reminders: normalizeReminders(parsed?.reminders ?? parsed) };
  } catch {
    return { reminders: [] };
  }
}
function writeRemindersLS(payload: RemindersPayload) {
  try {
    localStorage.setItem(LS_KEY_REMINDERS, JSON.stringify(payload));
    window.dispatchEvent(new Event('youtask_reminders_updated'));
  } catch {}
}

/* ------------------ Projects LS (sync w/ Quick) ------------------ */
type ProjectsPayload = {
  projects: Project[];
  selectedProjectId?: string;
};

function readProjectsLS(): ProjectsPayload | null {
  try {
    const raw = localStorage.getItem(LS_KEY_V2);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    const loadedProjects: Project[] = Array.isArray(parsed?.projects)
      ? parsed.projects
          .map((p: any) => {
            const project_id = typeof p?.project_id === 'string' ? p.project_id : pid();
            const title = typeof p?.title === 'string' && p.title.trim() ? p.title.trim() : 'Personal';
            const loadedBlocks = normalizeLoadedBlocks(p?.blocks ?? p?.payload?.blocks ?? []);
            const loadedCollapsed = p?.collapsed && typeof p.collapsed === 'object' ? p.collapsed : {};
            return { project_id, title, blocks: loadedBlocks, collapsed: loadedCollapsed } as Project;
          })
          .filter(Boolean)
      : [];

    const safeProjects = loadedProjects.length ? loadedProjects : [makePersonalProject()];
    const sel =
      typeof parsed?.selectedProjectId === 'string'
        ? parsed.selectedProjectId
        : safeProjects[0].project_id;

    return {
      projects: safeProjects,
      selectedProjectId: safeProjects.some(p => p.project_id === sel) ? sel : safeProjects[0].project_id,
    };
  } catch {
    return null;
  }
}

function writeProjectsLS(payload: ProjectsPayload) {
  try {
    localStorage.setItem(LS_KEY_V2, JSON.stringify(payload));
    window.dispatchEvent(new Event('youtask_projects_updated'));
    window.dispatchEvent(new Event('youtask_blocks_updated'));
  } catch {}
}

/* ===================== Pivot state ===================== */
type PivotState = {
  open: boolean;
  word: string;
  blockId: string | null;
};

export const Sidebar = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [tab, setTab] = useState<'tasks' | 'habits' | 'reminders'>('tasks');

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  const [habits, setHabits] = useState<HabitBlock[]>([
    { id: uid(), text: '', indent: 1 as const, checked: false, weekly: false },
  ]);;
  const [habitsMeta, setHabitsMeta] = useState<{ lastDaily?: string; lastWeekly?: string }>({});

  const [reminders, setReminders] = useState<ReminderItem[]>([
    { id: uid(), title: '', date: todayYMD(), time: '11:00', daily: false },
  ]);
  const [hydrated, setHydrated] = useState(false);

  // tasks visibility (isHidden only; archived never shown here)
  const [showHidden, setShowHidden] = useState(false);

  // Pivot Modal
  const [pivot, setPivot] = useState<PivotState>({ open: false, word: '', blockId: null });

  // refs
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const dateRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const habitInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const reminderTitleRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [nudge, setNudge] = useState<{ id: string; dir: 'left' | 'right' } | null>(null);
  const nudgeTimerRef = useRef<number | null>(null);

  const [newId, setNewId] = useState<string | null>(null);
  const newTimerRef = useRef<number | null>(null);

  const dragRef = useRef<{ id: string; fromIndex: number } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // ✅ Sync guards (prevent infinite loops)
  const lastWrittenRef = useRef<string>(''); // last payload we wrote
  const applyingExternalRef = useRef(false);

  const armedDeleteTitleRef = useRef<{ id: string; t: number } | null>(null);

    const removeTitleSendChildrenToUNC = (titleId: string) => {
      setCurrentBlocks(prev => {
        const i = prev.findIndex(b => b.id === titleId);
        if (i < 0) return prev;

        const title = prev[i];
        if (title.indent !== 0) return prev;

        // no permitir borrar el título "Uncategorized"
        if (isUncTitleBlock(title)) return prev;

        // children = todo lo que cuelga hasta el siguiente title
        let end = i + 1;
        while (end < prev.length && prev[end].indent !== 0) end++;

        const children = prev.slice(i + 1, end).map(ch => ({
          ...ch,
          // al mover a Uncategorized, aseguramos que sigan siendo "task"
          indent: Math.max(1, ch.indent),
        }));

        // quitamos SOLO el title (y sacamos a sus hijos del lugar original)
        let next = prev.slice(0, i).concat(prev.slice(end));

        // asegura UNC y lo manda arriba (tu helper ya hace esto)
        next = moveUncToTop(ensureUncExists(next));

        // buscamos dónde termina Uncategorized tasks para insertar ahí
        const { uncIndex, end: uncEnd } = findUncRange(next);
        if (uncIndex < 0) return next; // (teóricamente no pasa)

        // insertamos children al final del bloque UNC
        const insertAt = uncEnd;
        next = next.slice(0, insertAt).concat(children, next.slice(insertAt));

        // limpiar collapsed del title borrado
        setCurrentCollapsed(c => {
          const { [titleId]: _, ...rest } = c;
          return rest;
        });

        // focus algo razonable
        const target = next[Math.max(0, uncIndex + 1)] ?? next[0];
        if (target) focusBlock(target.id, true);

        return next;
      });
    };

  // current project
  const currentProjectIndex = useMemo(() => {
    return Math.max(0, projects.findIndex(p => p.project_id === selectedProjectId));
  }, [projects, selectedProjectId]);

  const currentProject = projects[currentProjectIndex];
  const blocks: Block[] =
    currentProject?.blocks ?? moveUncToTop(ensureUncExists([{ id: uid(), text: '', indent: 0 }]));
  const collapsed: Record<string, boolean> = currentProject?.collapsed ?? {};

  // helper for pills
  function startOfLocalDay(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function dayDiffFromToday(yyyyMmDd?: string): number | null {
    if (!yyyyMmDd || !isValidDateYYYYMMDD(yyyyMmDd)) return null;
    const [y, m, d] = yyyyMmDd.split('-').map(Number);
    const target = new Date(y, m - 1, d);
    const today = startOfLocalDay(new Date());
    const ms = target.getTime() - today.getTime();
    return Math.round(ms / 86400000);
  }
  function pillClass(deadline?: string, checked?: boolean) {
    if (checked) return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/25 hover:bg-emerald-500/20';
    const diff = dayDiffFromToday(deadline);
    if (diff === null) return 'bg-transparent text-white/25 hover:text-white/45 border-white/10';
    if (diff < 0) return 'bg-red-500/15 text-red-200 border-red-400/25 hover:bg-red-500/20';
    if (diff === 0) return 'bg-amber-500/15 text-amber-200 border-amber-400/25 hover:bg-amber-500/20';
    if (diff === 1) return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/25 hover:bg-emerald-500/20';
    return 'bg-sky-500/10 text-sky-200/80 border-sky-400/20 hover:bg-sky-500/15';
  }

  // Pivot open/close/update
  const closePivot = () => setPivot({ open: false, word: '', blockId: null });

  const openPivotForInput = (blockId: string, inputEl: HTMLInputElement) => {
    const start = inputEl.selectionStart ?? 0;
    const end = inputEl.selectionEnd ?? start;
    const word = extractWordAt(inputEl.value, start, end);
    if (!word) return;
    setPivot({ open: true, word, blockId });
  };

  const maybeUpdatePivotFromInput = (blockId: string, inputEl: HTMLInputElement) => {
    setPivot((p) => {
      if (!p.open) return p;
      if (p.blockId !== blockId) return p;

      const start = inputEl.selectionStart ?? 0;
      const end = inputEl.selectionEnd ?? start;
      const word = extractWordAt(inputEl.value, start, end);
      if (!word || word === p.word) return p;
      return { ...p, word };
    });
  };

  // ✅ Pivot: tree podado (títulos + ramas que contienen la palabra)
  const pivotRows: PivotTreeRow[] = useMemo(() => {
    if (!pivot.open) return [];
    return buildPrunedPivotTree(blocks, pivot.word, { uncTitle: UNC_TITLE });
  }, [pivot.open, pivot.word, blocks]);

  // set blocks/collapsed for selected project only
  const setCurrentBlocks = (nextBlocksOrFn: Block[] | ((prev: Block[]) => Block[])) => {
    setProjects(prev => {
      if (!prev.length) {
        const base = moveUncToTop(ensureUncExists([{ id: uid(), text: '', indent: 0 }]));
        const personal = makePersonalProject(
          typeof nextBlocksOrFn === 'function' ? nextBlocksOrFn(base) : nextBlocksOrFn,
          {}
        );
        setSelectedProjectId(personal.project_id);
        return [personal];
      }

      const idx = prev.findIndex(p => p.project_id === selectedProjectId);
      const safeIdx = idx >= 0 ? idx : 0;

      const next = prev.map(p => ({ ...p }));
      const oldBlocks = next[safeIdx].blocks ?? moveUncToTop(ensureUncExists([{ id: uid(), text: '', indent: 0 }]));
      let newBlocks = typeof nextBlocksOrFn === 'function' ? nextBlocksOrFn(oldBlocks) : nextBlocksOrFn;

      // ✅ keep Uncategorized always present + always at the top
      newBlocks = moveUncToTop(ensureUncExists(newBlocks));

      next[safeIdx] = { ...next[safeIdx], blocks: newBlocks };
      return next;
    });
  };

  const setCurrentCollapsed = (
    nextCollapsedOrFn:
      | Record<string, boolean>
      | ((prev: Record<string, boolean>) => Record<string, boolean>)
  ) => {
    setProjects(prev => {
      if (!prev.length) {
        const personal = makePersonalProject(
          moveUncToTop(ensureUncExists([{ id: uid(), text: '', indent: 0 }])),
          typeof nextCollapsedOrFn === 'function' ? nextCollapsedOrFn({}) : nextCollapsedOrFn
        );
        setSelectedProjectId(personal.project_id);
        return [personal];
      }

      const idx = prev.findIndex(p => p.project_id === selectedProjectId);
      const safeIdx = idx >= 0 ? idx : 0;

      const next = prev.map(p => ({ ...p }));
      const oldCol = next[safeIdx].collapsed ?? {};
      const newCol = typeof nextCollapsedOrFn === 'function' ? nextCollapsedOrFn(oldCol) : nextCollapsedOrFn;

      next[safeIdx] = { ...next[safeIdx], collapsed: newCol };
      return next;
    });
  };

  /* ===================== INITIAL LOAD (Tasks) ===================== */
useEffect(() => {
  try {
    const payload = readProjectsLS();
    if (payload) {
      // ✅ FORZAR: todo collapsed = false al cargar Sidebar
      const normalizedProjects = payload.projects.map((p) => {
        const col = p.collapsed && typeof p.collapsed === 'object' ? p.collapsed : {};
        const newCollapsed: Record<string, boolean> = {};

        for (const k in col) newCollapsed[k] = true;

        return {
          ...p,
          collapsed: newCollapsed,
        };
      });

      setProjects(normalizedProjects);
      setSelectedProjectId(payload.selectedProjectId || normalizedProjects[0].project_id);

      lastWrittenRef.current = JSON.stringify({
        projects: normalizedProjects,
        selectedProjectId: payload.selectedProjectId,
      });

      // (opcional) si querés que se persista en LS inmediatamente:
      // writeProjectsLS({ projects: normalizedProjects, selectedProjectId: payload.selectedProjectId });

      return;
    }

    // fallback V1...
    const rawV1 = localStorage.getItem(LS_KEY_V1);
    if (rawV1) {
      const parsed = JSON.parse(rawV1);
      const loadedBlocks = normalizeLoadedBlocks(parsed?.blocks ?? parsed);
      const loadedCollapsed =
        parsed?.collapsed && typeof parsed.collapsed === 'object' ? parsed.collapsed : {};
      const personal = makePersonalProject(loadedBlocks, loadedCollapsed);

      setProjects([personal]);
      setSelectedProjectId(personal.project_id);

      // ✅ BOOTSTRAP WRITE
      const boot = { projects: [personal], selectedProjectId: personal.project_id };
      lastWrittenRef.current = JSON.stringify(boot);
      writeProjectsLS(boot);

      return;
    }

    const personal = makePersonalProject();
    setProjects([personal]);
    setSelectedProjectId(personal.project_id);

    // ✅ BOOTSTRAP WRITE
    const boot = { projects: [personal], selectedProjectId: personal.project_id };
    lastWrittenRef.current = JSON.stringify(boot);
    writeProjectsLS(boot);
  } catch {
    const personal = makePersonalProject();
    setProjects([personal]);
    setSelectedProjectId(personal.project_id);

    // ✅ BOOTSTRAP WRITE
    const boot = { projects: [personal], selectedProjectId: personal.project_id };
    lastWrittenRef.current = JSON.stringify(boot);
    writeProjectsLS(boot);
  }
}, []);

  /* ===================== SYNC FROM QUICK (and other views) ===================== */
  useEffect(() => {
    const applyFromLS = () => {
      const payload = readProjectsLS();
      if (!payload) return;

      const nextStr = JSON.stringify({ projects: payload.projects, selectedProjectId: payload.selectedProjectId });
      if (nextStr === lastWrittenRef.current) return; // ignore our own writes

      applyingExternalRef.current = true;
      setProjects(payload.projects);
      setSelectedProjectId(payload.selectedProjectId || payload.projects[0]?.project_id || '');
      lastWrittenRef.current = nextStr;

      setTimeout(() => {
        applyingExternalRef.current = false;
      }, 0);
    };

    const onCustom = () => applyFromLS();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY_V2) applyFromLS();
    };

    window.addEventListener('youtask_projects_updated', onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('youtask_projects_updated', onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  /* ===================== LOAD HABITS + RESET ===================== */
 useEffect(() => {
  const ensureOneHabit = (arr: HabitBlock[]) => {
    if (arr.length) return arr;
    return [{ id: uid(), text: '', indent: 1 as const, checked: false, weekly: false }];
  };

  const loadHabits = () => {
    const p = readHabitsLS();
    const today = todayYMD();

    let nextHabits = ensureOneHabit(p.habits.map(h => ({ ...h })));
    let lastDaily = p.lastDailyResetYMD;
    let lastWeekly = p.lastWeeklyResetYMD;

    if (lastDaily !== today) {
      nextHabits = nextHabits.map(h => (h.weekly ? h : { ...h, checked: false }));
      lastDaily = today;
    }

    if (isMondayLocal() && lastWeekly !== today) {
      nextHabits = nextHabits.map(h => (h.weekly ? { ...h, checked: false } : h));
      lastWeekly = today;
    }

    setHabits(nextHabits);
    setHabitsMeta({ lastDaily, lastWeekly });

    const needWrite =
      p.lastDailyResetYMD !== lastDaily ||
      p.lastWeeklyResetYMD !== lastWeekly ||
      JSON.stringify(p.habits) !== JSON.stringify(nextHabits);

    if (needWrite) {
      writeHabitsLS({ habits: nextHabits, lastDailyResetYMD: lastDaily, lastWeeklyResetYMD: lastWeekly });
    }
  };

  loadHabits();

  const onHabits = () => loadHabits();
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_KEY_HABITS) loadHabits();
  };

  window.addEventListener('youtask_habits_updated', onHabits);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('youtask_habits_updated', onHabits);
    window.removeEventListener('storage', onStorage);
  };
}, []);

  /* ===================== LOAD REMINDERS ===================== */
 useEffect(() => {
  const loadReminders = () => {
    const p = readRemindersLS();
    setReminders(p.reminders.length ? p.reminders : []);
  };

  loadReminders();

  const onRem = () => loadReminders();
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_KEY_REMINDERS) loadReminders();
  };

  window.addEventListener('youtask_reminders_updated', onRem);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('youtask_reminders_updated', onRem);
    window.removeEventListener('storage', onStorage);
  };
}, []);

// REEMPLAZA POR:
/* ===================== LOAD REMINDERS ===================== */
useEffect(() => {
  const ensureOneReminder = (arr: ReminderItem[]) => {
    if (arr.length) return arr;
    return [{ id: uid(), title: '', date: todayYMD(), time: '11:00', daily: false }];
  };

  const loadReminders = () => {
    const p = readRemindersLS();
    const next = ensureOneReminder(p.reminders);
    setReminders(next);

    if (JSON.stringify(p.reminders) !== JSON.stringify(next)) {
      writeRemindersLS({ reminders: next });
    }
  };

  loadReminders();

  const onRem = () => loadReminders();
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_KEY_REMINDERS) loadReminders();
  };

  window.addEventListener('youtask_reminders_updated', onRem);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('youtask_reminders_updated', onRem);
    window.removeEventListener('storage', onStorage);
  };
}, []);

  // hydrated
  useEffect(() => setHydrated(true), []);

  // cleanup timers
  useEffect(() => {
    return () => {
      if (nudgeTimerRef.current) window.clearTimeout(nudgeTimerRef.current);
      if (newTimerRef.current) window.clearTimeout(newTimerRef.current);
    };
  }, []);

  // ✅ Save Projects (safe + no infinite loop)
  useEffect(() => {
    if (!hydrated) return;
    if (applyingExternalRef.current) return;

    try {
      const payload = { projects, selectedProjectId };
      const nextStr = JSON.stringify(payload);
      if (nextStr === lastWrittenRef.current) return;

      lastWrittenRef.current = nextStr;
      writeProjectsLS(payload);
    } catch {}
  }, [projects, selectedProjectId, hydrated]);

  const focusBlock = (id: string, caretToEnd = false) => {
    requestAnimationFrame(() => {
      const el = inputRefs.current[id];
      if (!el) return;
      el.focus();
      if (caretToEnd) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } else {
        el.setSelectionRange(0, 0);
      }
    });
  };

  const focusHabit = (id: string, caretToEnd = false) => {
    requestAnimationFrame(() => {
      const el = habitInputRefs.current[id];
      if (!el) return;
      el.focus();
      if (caretToEnd) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } else {
        el.setSelectionRange(0, 0);
      }
    });
  };

  const focusReminder = (id: string, caretToEnd = false) => {
    requestAnimationFrame(() => {
      const el = reminderTitleRefs.current[id];
      if (!el) return;
      el.focus();
      if (caretToEnd) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } else {
        el.setSelectionRange(0, 0);
      }
    });
  };

  const triggerNudge = (id: string, dir: 'left' | 'right') => {
    setNudge({ id, dir });
    if (nudgeTimerRef.current) window.clearTimeout(nudgeTimerRef.current);
    nudgeTimerRef.current = window.setTimeout(() => setNudge(null), 180);
  };

  const triggerNewLineAnim = (id: string) => {
    setNewId(id);
    if (newTimerRef.current) window.clearTimeout(newTimerRef.current);
    newTimerRef.current = window.setTimeout(() => setNewId(null), 220);
  };

  /* ======================= TASKS LOGIC ======================= */
  const updateBlock = (id: string, patch: Partial<Block>) => {
    setCurrentBlocks(prev =>
      prev.map(b => {
        if (b.id !== id) return b;

        // if checked changes
        if (typeof patch.checked === 'boolean') {
          if (patch.checked === true) {
            const t = todayYMD();
            return {
              ...b,
              ...patch,
              deadline: t,
              isHidden: false,
            };
          }
        }

        return { ...b, ...patch };
      })
    );
  };

  const insertAfter = (id: string, block: Block) => {
    setCurrentBlocks(prev => {
      const i = prev.findIndex(b => b.id === id);
      const next = [...prev];
      next.splice(i + 1, 0, block);
      return next;
    });
    triggerNewLineAnim(block.id);
    focusBlock(block.id, false);
  };

  const removeBlock = (id: string) => {
    setCurrentBlocks(prev => {
      if (prev.length === 1) return prev;
      const i = prev.findIndex(b => b.id === id);

      const isTitle = prev[i]?.indent === 0;
      if (isTitle) {
        setCurrentCollapsed(c => {
          const { [id]: _, ...rest } = c;
          return rest;
        });
      }

      const next = prev.filter(b => b.id !== id);
      const target = next[Math.max(0, i - 1)];
      if (target) focusBlock(target.id, true);
      return next;
    });
  };

  const dismissCompleted = () => {
    setCurrentBlocks(prev =>
      prev.map(b => {
        if (b.archived) return b;
        if (b.indent > 0 && b.checked) return { ...b, isHidden: true };
        return b;
      })
    );
  };

    const focusBlockSelectAll = (id: string) => {
    requestAnimationFrame(() => {
      const el = inputRefs.current[id];
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(0, len);
    });
  };

const addNewTitle = () => {
  const newTitleId = uid();

  setCurrentBlocks(prev => {
    // ✅ Asegurá que UNC exista y esté arriba antes de calcular
    const base = moveUncToTop(ensureUncExists(prev));

    // ✅ Insertar al FINAL, pero nunca dentro del rango de UNC
    const { uncIndex, end: uncEnd } = findUncRange(base);

    // si UNC existe, el insert debe ser >= uncEnd (después de sus tasks)
    // si no existe (raro, pero por seguridad), insert al final normal
    const insertAt = uncIndex >= 0 ? Math.max(uncEnd, base.length) : base.length;

    const next = base.slice();
    next.splice(insertAt, 0, {
      id: newTitleId,
      text: 'New Entity',
      indent: 0,  
    });

    return next;
  });

  // ✅ anim + focus + scroll
  triggerNewLineAnim(newTitleId);

  requestAnimationFrame(() => {
    const el = inputRefs.current[newTitleId];
    if (!el) return;

    // scroll suave hacia el nuevo title
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // focus + select all para renombrar rápido
    el.focus();
    el.setSelectionRange(0, el.value.length);
  });
};

  const archiveTask = (taskId: string) => {
    setCurrentBlocks(prev => {
      const i = prev.findIndex(x => x.id === taskId);
      if (i < 0) return prev;

      const b = prev[i];
      if (!(b.indent > 0)) return prev;
      if (!b.checked) return prev;

      const next = prev.map(x => ({ ...x }));
      next[i].archived = true;

      let j = i + 1;
      while (j < next.length && next[j].indent > b.indent) {
        next[j].archived = true;
        j++;
      }
      return next;
    });
  };

  const unhideTask = (taskId: string) => {
    setCurrentBlocks(prev => {
      const i = prev.findIndex(x => x.id === taskId);
      if (i < 0) return prev;

      const b = prev[i];
      if (!(b.indent > 0)) return prev;
      if (b.archived) return prev;

      const next = prev.map(x => ({ ...x }));
      next[i].isHidden = undefined;

      let j = i + 1;
      while (j < next.length && next[j].indent > b.indent) {
        if (!next[j].archived) next[j].isHidden = undefined;
        j++;
      }
      return next;
    });
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>, b: Block) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextIndent = b.indent === 0 ? 1 : b.indent;

      insertAfter(b.id, {
        id: uid(),
        text: '',
        indent: nextIndent,
        checked: nextIndent > 0 ? false : undefined,
        deadline: undefined,
        isHidden: undefined,
        archived: undefined,
      });
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const MAX_INDENT = 6;
      const nextIndent = e.shiftKey ? Math.max(0, b.indent - 1) : Math.min(MAX_INDENT, b.indent + 1);

      updateBlock(b.id, {
        indent: nextIndent,
        checked: nextIndent === 0 ? undefined : (b.checked ?? false),
        deadline: nextIndent === 0 ? undefined : b.deadline,
        isHidden: nextIndent === 0 ? undefined : b.isHidden,
        archived: nextIndent === 0 ? undefined : b.archived,
      });

      triggerNudge(b.id, e.shiftKey ? 'left' : 'right');
      return;
    }

        if (e.key === 'Backspace' && b.text === '') {
          // ✅ Titles: doble backspace para borrar title + children
          if (b.indent === 0) {
            e.preventDefault();
            e.stopPropagation();

            const now = Date.now();
            const armed = armedDeleteTitleRef.current;

            if (armed?.id === b.id && now - armed.t < 800) {
              armedDeleteTitleRef.current = null;
              removeTitleSendChildrenToUNC(b.id);
              return;
            }

            // 1er backspace: armar
            armedDeleteTitleRef.current = { id: b.id, t: now };
            return;
          }

          // ✅ Tasks: borrar normal
          e.preventDefault();
          e.stopPropagation();
          removeBlock(b.id);
          return;
        }
  };

  const outdent = (b: Block) => {
    if (b.indent <= 0) return;
    const next = Math.max(0, b.indent - 1);

    updateBlock(b.id, {
      indent: next,
      checked: next === 0 ? undefined : (b.checked ?? false),
      deadline: next === 0 ? undefined : b.deadline,
      isHidden: next === 0 ? undefined : b.isHidden,
      archived: next === 0 ? undefined : b.archived,
    });

    triggerNudge(b.id, 'left');
    focusBlock(b.id, true);
  };

  const indentMore = (b: Block) => {
    const MAX_INDENT = 6;
    const next = Math.min(MAX_INDENT, b.indent + 1);

    updateBlock(b.id, {
      indent: next,
      checked: next === 0 ? undefined : (b.checked ?? false),
      deadline: next === 0 ? undefined : b.deadline,
      isHidden: next === 0 ? undefined : b.isHidden,
      archived: next === 0 ? undefined : b.archived,
    });

    triggerNudge(b.id, 'right');
    focusBlock(b.id, true);
  };

  // ✅ hidden map: Uncategorized is always "open" and never collapses tasks under it
  const hiddenMap = useMemo(() => {
    const hidden: Record<string, boolean> = {};
    let currentTitleId: string | null = null;

    for (const b of blocks) {
      const isTitle = b.indent === 0;
      const isUncTitle = isTitle && isUncTitleBlock(b);

      if (b.archived === true) {
        hidden[b.id] = true;
        if (isTitle) currentTitleId = null;
        continue;
      }

      if (b.isHidden === true && !showHidden) {
        hidden[b.id] = true;
        if (isTitle) currentTitleId = null;
        continue;
      }

      if (isTitle) {
        // Uncategorized title is hidden by render anyway, and it never collapses its tasks
        currentTitleId = isUncTitle ? null : b.id;
        hidden[b.id] = false;
        continue;
      }

      hidden[b.id] = Boolean(currentTitleId && collapsed[currentTitleId]);
    }

    return hidden;
  }, [blocks, collapsed, showHidden]);

  const toggleTitle = (titleId: string) => {
    setCurrentCollapsed(prev => ({ ...prev, [titleId]: !prev[titleId] }));
  };

  const openDatePicker = (id: string) => {
    const el = dateRefs.current[id];
    if (!el) return;
    try {
      // @ts-ignore
      if (typeof el.showPicker === 'function') el.showPicker();
      else el.click();
    } catch {
      el.click();
    }
  };

  /* ======================= DRAG (ALL TABS) ======================= */
  const onDragStartRow = (e: React.DragEvent, id: string, index: number) => {
    dragRef.current = { id, fromIndex: index };
    setDragOverId(id);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', id);
    } catch {}
  };
  const onDragOverRow = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    if (!dragRef.current) return;
    if (dragOverId !== overId) setDragOverId(overId);
  };
  const onDropRow = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    const drag = dragRef.current;
    if (!drag) return;

    if (tab === 'habits') {
      const toIndex = habits.findIndex(h => h.id === overId);
      if (toIndex < 0) return;
      const next = arrayMove(habits, drag.fromIndex, toIndex);
      setHabits(next);
      writeHabitsLS({
        habits: next,
        lastDailyResetYMD: habitsMeta.lastDaily,
        lastWeeklyResetYMD: habitsMeta.lastWeekly,
      });
      dragRef.current = null;
      setDragOverId(null);
      return;
    }

    if (tab === 'reminders') {
      const toIndex = reminders.findIndex(r => r.id === overId);
      if (toIndex < 0) return;
      const next = arrayMove(reminders, drag.fromIndex, toIndex);
      setReminders(next);
      writeRemindersLS({ reminders: next });
      dragRef.current = null;
      setDragOverId(null);
      return;
    }

    // tasks
    const toIndex = blocks.findIndex(b => b.id === overId);
    if (toIndex < 0) return;
    setCurrentBlocks(prev => arrayMove(prev, drag.fromIndex, toIndex));

    dragRef.current = null;
    setDragOverId(null);
  };
  const onDragEndRow = () => {
    dragRef.current = null;
    setDragOverId(null);
  };

  /* ======================= PROJECT UI (TASKS) ======================= */
const addProject = () => {
  const title = window.prompt('Project name:', 'New Project');
  if (!title) return;

  const p: Project = {
    project_id: pid(),
    title: title.trim() || 'New Project',
    // ✅ start truly empty: only Uncategorized (hidden in UI)
    blocks: moveUncToTop(ensureUncExists([])),
    collapsed: {},
  };

  setProjects(prev => [...prev, p]);
  setSelectedProjectId(p.project_id);
};

  const renameCurrentProject = () => {
    if (!currentProject) return;
    const title = window.prompt('New project title:', currentProject.title);
    if (!title) return;
    const nextTitle = title.trim();
    if (!nextTitle) return;

    setProjects(prev => prev.map(p => (p.project_id === currentProject.project_id ? { ...p, title: nextTitle } : p)));
  };

  const deleteCurrentProject = () => {
    if (!currentProject) return;

    const ok = window.confirm(`Delete project "${currentProject.title}"?\n\nThis cannot be undone.`);
    if (!ok) return;

    setProjects(prev => {
      const next = prev.filter(p => p.project_id !== currentProject.project_id);
      const safeNext = next.length ? next : [makePersonalProject()];
      setSelectedProjectId(safeNext[0].project_id);
      return safeNext;
    });
  };

  /* ======================= HABITS HELPERS ======================= */
  const persistHabits = (next: HabitBlock[], metaOverride?: Partial<HabitsPayload>) => {
    setHabits(next);
    writeHabitsLS({
      habits: next,
      lastDailyResetYMD: metaOverride?.lastDailyResetYMD ?? habitsMeta.lastDaily,
      lastWeeklyResetYMD: metaOverride?.lastWeeklyResetYMD ?? habitsMeta.lastWeekly,
    });
  };

  const addHabit = () => {
    const next: HabitBlock = { id: uid(), text: '', indent: 1, checked: false, weekly: false };
    const arr = [...habits, next];
    persistHabits(arr);
    focusHabit(next.id, false);
  };

  const updateHabit = (id: string, patch: Partial<HabitBlock>) => {
    const next = habits.map(h => (h.id === id ? { ...h, ...patch } : h));
    persistHabits(next);
  };

  const removeHabit = (id: string) => {
    if (habits.length === 1) {
      const next = [{ id: uid(), text: '', indent: 1 as const, checked: false, weekly: false }];
      persistHabits(next);
      focusHabit(next[0].id, false);
      return;
    }

    const idx = habits.findIndex(h => h.id === id);
    const next = habits.filter(h => h.id !== id);
    persistHabits(next);

    const target = next[Math.max(0, idx - 1)];
    if (target) focusHabit(target.id, true);
  };

  const insertHabitAfter = (id: string) => {
    const nextH: HabitBlock = { id: uid(), text: '', indent: 1, checked: false, weekly: false };
    const i = habits.findIndex(h => h.id === id);
    const next = habits.slice();
    next.splice(i + 1, 0, nextH);
    persistHabits(next);
    triggerNewLineAnim(nextH.id);
    focusHabit(nextH.id, false);
  };

  const handleHabitKey = (e: React.KeyboardEvent<HTMLInputElement>, h: HabitBlock) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      insertHabitAfter(h.id);
      return;
    }
    if (e.key === 'Backspace' && h.text === '') {
      e.preventDefault();
      removeHabit(h.id);
      return;
    }
  };

  const forceResetHabitsNow = () => {
    const t = todayYMD();
    let next = habits.map(h => (h.weekly ? h : { ...h, checked: false }));

    let lastWeekly = habitsMeta.lastWeekly;
    if (isMondayLocal()) {
      next = next.map(h => (h.weekly ? { ...h, checked: false } : h));
      lastWeekly = t;
    }

    setHabitsMeta({ lastDaily: t, lastWeekly });
    persistHabits(next, { lastDailyResetYMD: t, lastWeeklyResetYMD: lastWeekly });
  };

  /* ======================= REMINDERS HELPERS ======================= */
  const persistReminders = (next: ReminderItem[]) => {
    setReminders(next);
    writeRemindersLS({ reminders: next });
  };

  const addReminder = () => {
    const next: ReminderItem = {
      id: uid(),
      title: '',
      date: todayYMD(),
      time: '11:00',
      daily: false,
    };
    const arr = [...reminders, next];
    persistReminders(arr);
    focusReminder(next.id, false);
  };

  const updateReminder = (id: string, patch: Partial<ReminderItem>) => {
    const next = reminders.map(r => (r.id === id ? { ...r, ...patch } : r));
    persistReminders(next);
  };

  const removeReminder = (id: string) => {
    if (reminders.length <= 1) {
      const next = [
        {
          id: uid(),
          title: '',
          date: todayYMD(),
          time: '11:00',
          daily: false,
        },
      ];
      persistReminders(next);
      focusReminder(next[0].id, false);
      return;
    }

    const idx = reminders.findIndex(r => r.id === id);
    const next = reminders.filter(r => r.id !== id);
    persistReminders(next);

    const target = next[Math.max(0, idx - 1)];
    if (target) focusReminder(target.id, true);
  };

  const insertReminderAfter = (id: string) => {
    const nextR: ReminderItem = {
      id: uid(),
      title: '',
      date: todayYMD(),
      time: '11:00',
      daily: false,
    };
    const i = reminders.findIndex(r => r.id === id);
    const next = reminders.slice();
    next.splice(i + 1, 0, nextR);
    persistReminders(next);
    triggerNewLineAnim(nextR.id);
    focusReminder(nextR.id, false);
  };

  const handleReminderKey = (e: React.KeyboardEvent<HTMLInputElement>, r: ReminderItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      insertReminderAfter(r.id);
      return;
    }
    if (e.key === 'Backspace' && r.title === '') {
      e.preventDefault();
      removeReminder(r.id);
      return;
    }
  };

  return (
    <>
      <button
        onClick={() => setIsSidebarOpen(v => !v)}
        className="md:hidden p-2 fixed top-4 left-4 z-50 bg-gray-800 rounded-md text-white shadow-lg shadow-black/30"
      >
        <SearchIcon className="h-6 w-6" />
      </button>

      <aside
        className={[
          'bg-gray-800 p-4 h-full overflow-y-auto flex flex-col',
          'fixed inset-y-0 left-0 z-40 transform transition-transform duration-300',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
          'w-64 sm:w-72',
          'md:relative md:translate-x-0 md:w-full md:z-auto',
        ].join(' ')}
      >
        {/* Tabs */}
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('tasks')}
            className={[
              'flex-1 text-[12px] px-2 py-2 rounded-md border transition-colors',
              tab === 'tasks'
                ? 'border-sky-400/35 bg-sky-500/10 text-sky-100'
                : 'border-white/10 bg-white/5 text-white/70 hover:text-white/85 hover:bg-white/7',
            ].join(' ')}
            title="Tasks"
          >
            Tasks
          </button>

          <button
            type="button"
            onClick={() => setTab('habits')}
            className={[
              'flex-1 text-[12px] px-2 py-2 rounded-md border transition-colors',
              tab === 'habits'
                ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100'
                : 'border-white/10 bg-white/5 text-white/70 hover:text-white/85 hover:bg-white/7',
            ].join(' ')}
            title="Habits"
          >
            Habits
          </button>

          <button
            type="button"
            onClick={() => setTab('reminders')}
            className={[
              'flex-1 text-[12px] px-2 py-2 rounded-md border transition-colors',
              tab === 'reminders'
                ? 'border-violet-400/35 bg-violet-500/10 text-violet-100'
                : 'border-white/10 bg-white/5 text-white/70 hover:text-white/85 hover:bg-white/7',
            ].join(' ')}
            title="Reminders"
          >
            Reminders
          </button>
        </div>

        {/* ===================== TASKS TAB ===================== */}
        {tab === 'tasks' ? (
          <>
            {/* Project selector */}
            <div className="mb-3">
              <div className="flex items-center gap-2">
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className={[
                    'w-full bg-black/20 border border-white/10 rounded-md',
                    'text-white/85 text-[12px] px-2 py-2 outline-none',
                    'hover:bg-black/25 focus:border-white/20',
                  ].join(' ')}
                  title="Project"
                >
                  {projects.map(p => (
                    <option key={p.project_id} value={p.project_id} className="bg-gray-900">
                      {p.title}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={addProject}
                  className={[
                    'h-9 w-9 shrink-0 rounded-md border border-white/10',
                    'bg-white/5 text-white/80 hover:text-white hover:bg-white/10',
                    'transition-all',
                  ].join(' ')}
                  title="New project"
                  aria-label="New project"
                >
                  +
                </button>

                <button
                  type="button"
                  onClick={renameCurrentProject}
                  className={[
                    'h-9 w-9 shrink-0 rounded-md border border-white/10',
                    'bg-white/5 text-white/70 hover:text-white hover:bg-white/10',
                    'transition-all',
                  ].join(' ')}
                  title="Rename project"
                  aria-label="Rename project"
                >
                  ✎
                </button>

                <button
                  type="button"
                  onClick={deleteCurrentProject}
                  className={[
                    'h-9 w-9 shrink-0 rounded-md border border-white/10',
                    'bg-white/5 text-white/60 hover:text-white hover:bg-white/10',
                    'transition-all',
                  ].join(' ')}
                  title="Delete project"
                  aria-label="Delete project"
                >
                  🗑️
                </button>
              </div>

              <div className="mt-1 text-[10px] text-white/35">
                Current project · {currentProject?.project_id ? `ID ${currentProject.project_id}` : '—'}
              </div>
            </div>

            {/* header actions */}
            <div className="flex items-center justify-between mb-3">
              <div className="text-white/80 font-semibold">Organizer</div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowHidden(v => !v)}
                  className={[
                    'text-[11px] px-2 py-1 rounded-md border',
                    showHidden
                      ? 'border-sky-400/40 text-sky-200 bg-sky-500/10'
                      : 'border-white/10 text-white/60',
                    'hover:text-white/80 hover:bg-white/5 transition-colors',
                  ].join(' ')}
                  title="Toggle dismissed items (isHidden). Archived items never show here."
                >
                  {showHidden ? '◯' : '👁'}
                </button>

                <button
                  type="button"
                  onClick={dismissCompleted}
                  className={[
                    'text-[11px] px-2 py-1 rounded-md border',
                    'border-white/10 text-white/60 hover:text-white/80',
                    'hover:bg-white/5 transition-colors',
                  ].join(' ')}
                  title="Dismiss completed tasks (sets isHidden=true)"
                >
                  Dismiss Completed
                </button>

                  <button
                  type="button"
                  onClick={addNewTitle}
                  className={[
                    'text-[11px] px-2 py-1 rounded-md border',
                    'border-white/10 text-white/60 hover:text-white/80',
                    'hover:bg-white/5 transition-colors',
                  ].join(' ')}
                  title="Add a new title at the very top (right after Uncategorized)"
                >
                  + New List
                </button>
              </div>
            </div>

            <div className="space-y-1">
              {(() => {
                const { uncIndex, start: uncStart, end: uncEnd } = findUncRange(blocks);

                return blocks.map((b, idx) => {
                  // ✅ never render Uncategorized title row
                  if (uncIndex >= 0 && idx === uncIndex) return null;

                  if (hiddenMap[b.id]) return null;

                  const isTitle = b.indent === 0;
                  const isTask = b.indent > 0;

                  // ✅ tasks under Uncategorized should look "outside" (more left)
                  const inUncTasks =
                    uncIndex >= 0 && idx >= uncStart && idx < uncEnd && b.indent > 0;

                  const showBlue = idx !== 0;
                  const showRed = idx !== 0 && isTask;

                  const rowNudgeClass =
                    nudge?.id === b.id ? (nudge.dir === 'right' ? 'wadu-nudge-right' : 'wadu-nudge-left') : '';

                  const rowNewClass = newId === b.id ? 'wadu-line-in' : '';

                  const isDraggingOver = dragOverId === b.id && dragRef.current?.id !== b.id;
                  const isDraggingMe = dragRef.current?.id === b.id;

                  const pill = isTask ? formatPill(b.deadline) : '';
                  const canArchive = Boolean(isTask && b.checked);
                  const canUnhide = Boolean(isTask && showHidden && b.isHidden === true);

                  return (
                    <div
                      key={b.id}
                      draggable
                      onDragStart={(e) => onDragStartRow(e, b.id, idx)}
                      onDragOver={(e) => onDragOverRow(e, b.id)}
                      onDrop={(e) => onDropRow(e, b.id)}
                      onDragEnd={onDragEndRow}
                      className={[
                        'group flex items-center gap-1 px-0.5 py-1 rounded-md',
                        b.isHidden && showHidden ? 'opacity-40' : '',
                        rowNudgeClass,
                        rowNewClass,
                        isDraggingOver ? 'bg-white/7 outline outline-1 outline-white/10' : '',
                        isDraggingMe ? 'opacity-60' : '',
                      ].join(' ')}
                      style={{
                        paddingLeft: isTitle ? 2 : (inUncTasks ? 6 : 8 + b.indent * 16),
                      }}
                    >
                      <div
                        className={[
                          'w-3 shrink-0 text-white/20 select-none',
                          'opacity-0 group-hover:opacity-100 transition-opacity',
                          'cursor-grab active:cursor-grabbing',
                        ].join(' ')}
                        title="Drag"
                      >
                        ⋮⋮
                      </div>

                      <div className="flex items-center gap-1 w-6 shrink-0">
                        {showRed ? (
                          <button
                            type="button"
                            onClick={() => outdent(b)}
                            title="Outdent"
                            className={[
                              'w-2 h-2 rounded-full bg-red-400/70',
                              'transition-transform duration-150 ease-out',
                              'group-hover:scale-[1.25] hover:scale-[1.45]',
                            ].join(' ')}
                          />
                        ) : (
                          <div className="w-2 h-2" />
                        )}

                        {showBlue ? (
                          <button
                            type="button"
                            onClick={() => indentMore(b)}
                            title="Indent"
                            className={[
                              'w-2 h-2 rounded-full bg-sky-400/70',
                              'transition-transform duration-150 ease-out',
                              'group-hover:scale-[1.25] hover:scale-[1.45]',
                            ].join(' ')}
                          />
                        ) : (
                          <div className="w-2 h-2" />
                        )}
                      </div>

                      {isTitle ? (
                        <button
                          type="button"
                          onClick={() => toggleTitle(b.id)}
                          className="w-3 shrink-0 text-white/35 hover:text-white/60 transition-colors"
                          title={collapsed[b.id] ? 'Expand' : 'Collapse'}
                        >
                          {collapsed[b.id] ? '▸' : '▾'}
                        </button>
                      ) : (
                        <div className="w-3 shrink-0" />
                      )}

                      {isTask ? (
                        <button
                          type="button"
                          onClick={() => updateBlock(b.id, { checked: !b.checked })}
                          className={[
                            'h-4 w-4 rounded border flex items-center justify-center shrink-0',
                            'transition-[transform,background-color,border-color] duration-150 ease-out',
                            'group-hover:scale-[1.06]',
                            b.checked ? 'bg-emerald-500/15 border-emerald-400/70' : 'border-white/25',
                          ].join(' ')}
                          title="Complete"
                        >
                          {b.checked ? <span className="text-emerald-300 text-xs">✓</span> : null}
                        </button>
                      ) : null}

                      <input
                        ref={el => (inputRefs.current[b.id] = el)}
                        value={b.text}
                        placeholder={isTitle ? 'Title…' : 'Task…'}
                        onChange={e => updateBlock(b.id, { text: e.target.value })}
                        onKeyDown={e => handleKey(e, b)}
                        onDoubleClick={(e) => {
                          if (!(b.indent > 0)) return;
                          openPivotForInput(b.id, e.currentTarget);
                        }}
                        onSelect={(e) => {
                          if (!(b.indent > 0)) return;
                          maybeUpdatePivotFromInput(b.id, e.currentTarget); 
                        }}
                       
                        className={[
                          'w-full bg-transparent outline-none text-sm',
                          'cursor-pointer',
                          'transition-opacity duration-150',
                          isTitle
                            ? 'text-white font-semibold'
                            : b.checked
                              ? 'text-white/40 line-through'
                              : 'text-white/80',
                        ].join(' ')}
                      />

                      {isTask ? (
                        <div className="shrink-0 pl-2 flex items-center gap-2">
                          <button
                            type="button"
                            style={{ minWidth: '66px' }}
                            onClick={() => openDatePicker(b.id)}
                            className={[
                              'text-[11px] px-2 py-1 rounded-full border transition-colors',
                              pillClass(b.deadline, b.checked),
                            ].join(' ')}
                            title={pill ? 'Change date' : 'Set date'}
                          >
                            {pill ? pill : '📅'}
                          </button>

                          <input
                            ref={el => (dateRefs.current[b.id] = el)}
                            type="date"
                            className="hidden"
                            value={isValidDateYYYYMMDD(b.deadline) ? b.deadline : ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              updateBlock(b.id, { deadline: v ? v : undefined });
                            }}
                          />

                          {canUnhide ? (
                            <button
                              type="button"
                              onClick={() => unhideTask(b.id)}
                              className="h-7 w-7 rounded-full border border-white/10 bg-white/5 text-white/70 hover:text-white/90 hover:bg-white/10 transition-all"
                              title="Restore (un-dismiss)"
                              aria-label="Restore"
                            >
                              ↩
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => {
                              if (!canArchive) return;
                              archiveTask(b.id);
                            }}
                            className={[
                              'h-7 w-7 rounded-full border flex items-center justify-center',
                              'transition-[transform,opacity,background-color,border-color] duration-150 ease-out',
                              canArchive
                                ? 'border-white/10 bg-white/5 text-white/70 hover:text-white/90 hover:bg-white/10 hover:border-white/15 group-hover:scale-[1.03]'
                                : 'border-white/5 bg-white/0 text-white/25 opacity-40 cursor-not-allowed',
                            ].join(' ')}
                            title={canArchive ? 'Archive (completed only)' : 'Complete it to archive'}
                            aria-label="Archive"
                          >
                            🗑️
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                });
              })()}
            </div>

            <div className="mt-3 text-[11px] text-white/35">
              Drag to reorder · Enter creates a new line · Tab indent · Shift+Tab outdent · Date pill · Dismiss hides completed · 👁 show dismissed · ↩ restore · 🗑 archive (completed only) · Double click a word to Pivot
            </div>
          </>
        ) : null}

        {/* ===================== HABITS TAB ===================== */}
        {tab === 'habits' ? (
          <>
            <div className="mb-3">
              <div className="flex items-center justify-between">
                <div className="text-white/80 font-semibold">Habits</div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={addHabit}
                    className={[
                      'h-8 w-8 shrink-0 rounded-md border border-white/10',
                      'bg-white/5 text-white/80 hover:text-white hover:bg-white/10',
                      'transition-all',
                    ].join(' ')}
                    title="New habit"
                    aria-label="New habit"
                  >
                    +
                  </button>

                  <button
                    type="button"
                    onClick={forceResetHabitsNow}
                    className={[
                      'text-[11px] px-2 py-1 rounded-md border',
                      'border-white/10 text-white/60 hover:text-white/80 hover:bg-white/5 transition-colors',
                    ].join(' ')}
                    title="Reset now (daily, and weekly if today is Monday)"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="mt-1 text-[10px] text-white/35">
                Daily reset: {habitsMeta.lastDaily || '—'} · Weekly reset (Monday): {habitsMeta.lastWeekly || '—'}
              </div>
            </div>

            <div className="space-y-1">
              {habits.map((h, idx) => {
                const isDraggingOver = dragOverId === h.id && dragRef.current?.id !== h.id;
                const isDraggingMe = dragRef.current?.id === h.id;

                return (
                  <div
                    key={h.id}
                    draggable
                    onDragStart={(e) => onDragStartRow(e, h.id, idx)}
                    onDragOver={(e) => onDragOverRow(e, h.id)}
                    onDrop={(e) => onDropRow(e, h.id)}
                    onDragEnd={onDragEndRow}
                    className={[
                      'group flex items-center gap-2 px-0.5 py-1 rounded-md',
                      isDraggingOver ? 'bg-white/7 outline outline-1 outline-white/10' : '',
                      isDraggingMe ? 'opacity-60' : '',
                      newId === h.id ? 'wadu-line-in' : '',
                    ].join(' ')}
                  >
                    <div
                      className={[
                        'w-3 shrink-0 text-white/20 select-none',
                        'opacity-0 group-hover:opacity-100 transition-opacity',
                        'cursor-grab active:cursor-grabbing',
                      ].join(' ')}
                      title="Drag"
                    >
                      ⋮⋮
                    </div>

                    <button
                      type="button"
                      onClick={() => updateHabit(h.id, { checked: !h.checked })}
                      className={[
                        'h-4 w-4 rounded border flex items-center justify-center shrink-0',
                        'transition-[transform,background-color,border-color] duration-150 ease-out',
                        'group-hover:scale-[1.06]',
                        h.checked ? 'bg-emerald-500/15 border-emerald-400/70' : 'border-white/25',
                      ].join(' ')}
                      title="Complete"
                    >
                      {h.checked ? <span className="text-emerald-300 text-xs">✓</span> : null}
                    </button>

                    <input
                      ref={el => (habitInputRefs.current[h.id] = el)}
                      value={h.text}
                      placeholder="Habit…"
                      onChange={(e) => updateHabit(h.id, { text: e.target.value })}
                      onKeyDown={(e) => handleHabitKey(e, h)}
                      className={[
                        'w-full bg-transparent outline-none text-sm',
                        'cursor-pointer',
                        'transition-opacity duration-150',
                        h.checked ? 'text-white/40 line-through' : 'text-white/80',
                      ].join(' ')}
                    />

                    <button
                      type="button"
                      onClick={() => updateHabit(h.id, { weekly: !h.weekly })}
                      className={[
                        'shrink-0 text-[11px] px-2 py-1 rounded-full border transition-colors',
                        h.weekly
                          ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                          : 'border-white/10 bg-transparent text-white/40 hover:text-white/60 hover:bg-white/5',
                      ].join(' ')}
                      title={h.weekly ? 'Weekly (resets Mondays)' : 'Daily (resets daily)'}
                    >
                      {h.weekly ? 'Weekly' : 'Daily'}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 text-[11px] text-white/35">
              Enter creates a new habit · Backspace deletes if empty · Weekly resets only on Mondays · Daily resets every day
            </div>
          </>
        ) : null}

        {/* ===================== REMINDERS TAB ===================== */}
        {tab === 'reminders' ? (
          <>
            <div className="mb-3">
              <div className="flex items-center justify-between">
                <div className="text-white/80 font-semibold">Reminders</div>

                <button
                  type="button"
                  onClick={addReminder}
                  className={[
                    'h-8 w-8 shrink-0 rounded-md border border-white/10',
                    'bg-white/5 text-white/80 hover:text-white hover:bg-white/10',
                    'transition-all',
                  ].join(' ')}
                  title="New reminder"
                  aria-label="New reminder"
                >
                  +
                </button>
              </div>

              <div className="mt-1 text-[10px] text-white/35">
                No checkbox · Date + time (default 11:00) · Optional daily
              </div>
            </div>

            <div className="space-y-1">
              {reminders.map((r, idx) => {
                const isDraggingOver = dragOverId === r.id && dragRef.current?.id !== r.id;
                const isDraggingMe = dragRef.current?.id === r.id;

                return (
                  <div
                    key={r.id}
                    draggable
                    onDragStart={(e) => onDragStartRow(e, r.id, idx)}
                    onDragOver={(e) => onDragOverRow(e, r.id)}
                    onDrop={(e) => onDropRow(e, r.id)}
                    onDragEnd={onDragEndRow}
                    className={[
                      'group flex items-center gap-2 px-0.5 py-1 rounded-md',
                      isDraggingOver ? 'bg-white/7 outline outline-1 outline-white/10' : '',
                      isDraggingMe ? 'opacity-60' : '',
                      newId === r.id ? 'wadu-line-in' : '',
                    ].join(' ')}
                  >
                    <div
                      className={[
                        'w-3 shrink-0 text-white/20 select-none',
                        'opacity-0 group-hover:opacity-100 transition-opacity',
                        'cursor-grab active:cursor-grabbing',
                      ].join(' ')}
                      title="Drag"
                    >
                      ⋮⋮
                    </div>

                    <input
                      ref={el => (reminderTitleRefs.current[r.id] = el)}
                      value={r.title}
                      placeholder="Reminder…"
                      onChange={(e) => updateReminder(r.id, { title: e.target.value })}
                      onKeyDown={(e) => handleReminderKey(e, r)}
                      className={[
                        'w-full bg-transparent outline-none text-sm',
                        'cursor-pointer text-white/80',
                      ].join(' ')}
                    />

                    <input
                      type="date"
                      value={isValidDateYYYYMMDD(r.date) ? r.date : todayYMD()}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateReminder(r.id, { date: isValidDateYYYYMMDD(v) ? v : todayYMD() });
                      }}
                      className={[
                        'shrink-0 text-[11px] px-2 py-1 rounded-md border outline-none',
                        'bg-black/20 border-white/10 text-white/75',
                        'hover:bg-black/25 focus:border-white/20',
                      ].join(' ')}
                      title="Date"
                    />

                    <input
                      type="time"
                      value={isValidTimeHHMM(r.time) ? r.time : '11:00'}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateReminder(r.id, { time: isValidTimeHHMM(v) ? v : '11:00' });
                      }}
                      className={[
                        'shrink-0 text-[11px] px-2 py-1 rounded-md border outline-none',
                        'bg-black/20 border-white/10 text-white/75',
                        'hover:bg-black/25 focus:border-white/20',
                      ].join(' ')}
                      title="Time"
                    />

                    <button
                      type="button"
                      onClick={() => updateReminder(r.id, { daily: !r.daily })}
                      className={[
                        'shrink-0 text-[11px] px-2 py-1 rounded-full border transition-colors',
                        r.daily
                          ? 'border-violet-400/35 bg-violet-500/10 text-violet-200'
                          : 'border-white/10 bg-transparent text-white/40 hover:text-white/60 hover:bg-white/5',
                      ].join(' ')}
                      title={r.daily ? 'Daily ON' : 'Once'}
                    >
                      {r.daily ? 'Daily' : 'Once'}
                    </button>

                    <button
                      type="button"
                      onClick={() => removeReminder(r.id)}
                      className={[
                        'h-7 w-7 rounded-full border border-white/10 bg-white/5',
                        'text-white/60 hover:text-white/85 hover:bg-white/10 transition-all',
                        'opacity-0 group-hover:opacity-100',
                      ].join(' ')}
                      title="Delete"
                      aria-label="Delete"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 text-[11px] text-white/35">
              Enter creates a new reminder · Backspace deletes if empty · Daily/Once controls recurrence (your email system can use it)
            </div>
          </>
        ) : null}
      </aside>

      {/* ===== Pivot Modal (extracted) ===== */}
      <PivotModal
        open={pivot.open}
        word={pivot.word}
        rows={pivotRows}
        onClose={closePivot}
        onGoTo={(blockId) => {
          focusBlock(blockId, true);
        }}
        pillText={(r) => (r.indent > 0 ? formatPill(r.deadline) : '')}
        pillClass={(r) => pillClass(r.deadline, r.checked)}
      />

      {isSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-30"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </>
  );
};