// app/components/Sidebar.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PivotModal, buildPrunedPivotTree, extractWordAt, type PivotTreeRow } from './Pivot';


type Block = {
  id: string;
  text: string;
  indent: number; // 0 = list, 1+ = task/subtask
  checked?: boolean;
  deadline?: string; // YYYY-MM-DD (tasks)
  isHidden?: boolean;
  archived?: boolean;
};

type Project = {
  project_id: string;
  title: string;
  blocks: Block[];
  collapsed: Record<string, boolean>;
};

type HabitBlock = {
  id: string;
  text: string;
  indent: 1;
  checked: boolean;
  weekly?: boolean;
};

type ReminderItem = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  daily?: boolean;
};

const LS_KEY_V2 = 'youtask_projects_v1';
const LS_KEY_V1 = 'youtask_blocks_v1';
const LS_KEY_HABITS = 'youtask_habits_v1';
const LS_KEY_REMINDERS = 'youtask_reminders_v1';

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
  const range = b.slice(uncIndex, end);
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

/* ------------------ Projects LS ------------------ */
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
    const sel = typeof parsed?.selectedProjectId === 'string' ? parsed.selectedProjectId : safeProjects[0].project_id;

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
  const [tab, setTab] = useState<'tasks' | 'habits' | 'reminders'>('tasks');

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  const [habits, setHabits] = useState<HabitBlock[]>([
    { id: uid(), text: '', indent: 1 as const, checked: false, weekly: false },
  ]);
  const [habitsMeta, setHabitsMeta] = useState<{ lastDaily?: string; lastWeekly?: string }>({});

  const [reminders, setReminders] = useState<ReminderItem[]>([
    { id: uid(), title: '', date: todayYMD(), time: '11:00', daily: false },
  ]);
  const [hydrated, setHydrated] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const [pivot, setPivot] = useState<PivotState>({ open: false, word: '', blockId: null });

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

  const lastWrittenRef = useRef<string>('');
  const applyingExternalRef = useRef(false);

  const armedDeleteListRef = useRef<{ id: string; t: number } | null>(null);

  const removeTitleSendChildrenToUNC = (listId: string) => {
    setCurrentBlocks(prev => {
      const i = prev.findIndex(b => b.id === listId);
      if (i < 0) return prev;

      const list = prev[i];
      if (list.indent !== 0) return prev;
      if (isUncTitleBlock(list)) return prev;

      let end = i + 1;
      while (end < prev.length && prev[end].indent !== 0) end++;

      const children = prev.slice(i + 1, end).map(ch => ({
        ...ch,
        indent: Math.max(1, ch.indent),
      }));

      let next = prev.slice(0, i).concat(prev.slice(end));
      next = moveUncToTop(ensureUncExists(next));

      const { uncIndex, end: uncEnd } = findUncRange(next);
      if (uncIndex < 0) return next;

      const insertAt = uncEnd;
      next = next.slice(0, insertAt).concat(children, next.slice(insertAt));

      setCurrentCollapsed(c => {
        const { [listId]: _, ...rest } = c;
        return rest;
      });

      const target = next[Math.max(0, uncIndex + 1)] ?? next[0];
      if (target) focusBlock(target.id, true);

      return next;
    });
  };

  /* ===================== Current project ===================== */
  const currentProjectIndex = useMemo(() => {
    return Math.max(0, projects.findIndex(p => p.project_id === selectedProjectId));
  }, [projects, selectedProjectId]);

  const currentProject = projects[currentProjectIndex];
  const blocks: Block[] = currentProject?.blocks ?? moveUncToTop(ensureUncExists([{ id: uid(), text: '', indent: 0 }]));
  const collapsed: Record<string, boolean> = currentProject?.collapsed ?? {};

  /* ===================== Pill helpers ===================== */
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

  /* ===================== Pivot ===================== */
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

  const pivotRows: PivotTreeRow[] = useMemo(() => {
    if (!pivot.open) return [];
    return buildPrunedPivotTree(blocks, pivot.word, { uncTitle: UNC_TITLE });
  }, [pivot.open, pivot.word, blocks]);

  /* ===================== setCurrentBlocks / setCurrentCollapsed ===================== */
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

      newBlocks = moveUncToTop(ensureUncExists(newBlocks));
      next[safeIdx] = { ...next[safeIdx], blocks: newBlocks };
      return next;
    });
  };

  const setCurrentCollapsed = (
    nextCollapsedOrFn: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)
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

  /* ===================== INITIAL LOAD ===================== */
  useEffect(() => {
    try {
      const payload = readProjectsLS();
      if (payload) {
        const normalizedProjects = payload.projects.map((p) => {
          const col = p.collapsed && typeof p.collapsed === 'object' ? p.collapsed : {};
          const newCollapsed: Record<string, boolean> = {};
          for (const k in col) newCollapsed[k] = true;
          return { ...p, collapsed: newCollapsed };
        });

        setProjects(normalizedProjects);
        setSelectedProjectId(payload.selectedProjectId || normalizedProjects[0].project_id);
        lastWrittenRef.current = JSON.stringify({
          projects: normalizedProjects,
          selectedProjectId: payload.selectedProjectId,
        });
        return;
      }

      const rawV1 = localStorage.getItem(LS_KEY_V1);
      if (rawV1) {
        const parsed = JSON.parse(rawV1);
        const loadedBlocks = normalizeLoadedBlocks(parsed?.blocks ?? parsed);
        const loadedCollapsed = parsed?.collapsed && typeof parsed.collapsed === 'object' ? parsed.collapsed : {};
        const personal = makePersonalProject(loadedBlocks, loadedCollapsed);
        setProjects([personal]);
        setSelectedProjectId(personal.project_id);
        const boot = { projects: [personal], selectedProjectId: personal.project_id };
        lastWrittenRef.current = JSON.stringify(boot);
        writeProjectsLS(boot);
        return;
      }

      const personal = makePersonalProject();
      setProjects([personal]);
      setSelectedProjectId(personal.project_id);
      const boot = { projects: [personal], selectedProjectId: personal.project_id };
      lastWrittenRef.current = JSON.stringify(boot);
      writeProjectsLS(boot);
    } catch {
      const personal = makePersonalProject();
      setProjects([personal]);
      setSelectedProjectId(personal.project_id);
      const boot = { projects: [personal], selectedProjectId: personal.project_id };
      lastWrittenRef.current = JSON.stringify(boot);
      writeProjectsLS(boot);
    }
  }, []);

  /* ===================== SYNC FROM QUICK ===================== */
  useEffect(() => {
    const applyFromLS = () => {
      const payload = readProjectsLS();
      if (!payload) return;
      const nextStr = JSON.stringify({ projects: payload.projects, selectedProjectId: payload.selectedProjectId });
      if (nextStr === lastWrittenRef.current) return;
      applyingExternalRef.current = true;
      setProjects(payload.projects);
      setSelectedProjectId(payload.selectedProjectId || payload.projects[0]?.project_id || '');
      lastWrittenRef.current = nextStr;
      setTimeout(() => { applyingExternalRef.current = false; }, 0);
    };

    const onCustom = () => applyFromLS();
    const onStorage = (e: StorageEvent) => { if (e.key === LS_KEY_V2) applyFromLS(); };

    window.addEventListener('youtask_projects_updated', onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('youtask_projects_updated', onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  /* ===================== LOAD HABITS ===================== */
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
    const onStorage = (e: StorageEvent) => { if (e.key === LS_KEY_HABITS) loadHabits(); };
    window.addEventListener('youtask_habits_updated', onHabits);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('youtask_habits_updated', onHabits);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

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
    const onStorage = (e: StorageEvent) => { if (e.key === LS_KEY_REMINDERS) loadReminders(); };
    window.addEventListener('youtask_reminders_updated', onRem);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('youtask_reminders_updated', onRem);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    return () => {
      if (nudgeTimerRef.current) window.clearTimeout(nudgeTimerRef.current);
      if (newTimerRef.current) window.clearTimeout(newTimerRef.current);
    };
  }, []);

  /* ===================== SAVE PROJECTS ===================== */
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

  /* ===================== Focus helpers ===================== */
  const focusBlock = (id: string, caretToEnd = false) => {
    requestAnimationFrame(() => {
      const el = inputRefs.current[id];
      if (!el) return;
      el.focus();
      if (caretToEnd) { const len = el.value.length; el.setSelectionRange(len, len); }
      else el.setSelectionRange(0, 0);
    });
  };

  const focusHabit = (id: string, caretToEnd = false) => {
    requestAnimationFrame(() => {
      const el = habitInputRefs.current[id];
      if (!el) return;
      el.focus();
      if (caretToEnd) { const len = el.value.length; el.setSelectionRange(len, len); }
      else el.setSelectionRange(0, 0);
    });
  };

  const focusReminder = (id: string, caretToEnd = false) => {
    requestAnimationFrame(() => {
      const el = reminderTitleRefs.current[id];
      if (!el) return;
      el.focus();
      if (caretToEnd) { const len = el.value.length; el.setSelectionRange(len, len); }
      else el.setSelectionRange(0, 0);
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

  /* ===================== TASKS LOGIC ===================== */
  const updateBlock = (id: string, patch: Partial<Block>) => {
    setCurrentBlocks(prev =>
      prev.map(b => {
        if (b.id !== id) return b;
        if (typeof patch.checked === 'boolean' && patch.checked === true) {
          return { ...b, ...patch, deadline: todayYMD(), isHidden: false };
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
      const isList = prev[i]?.indent === 0;
      if (isList) {
        setCurrentCollapsed(c => { const { [id]: _, ...rest } = c; return rest; });
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

  const addNewList = () => {
    const newListId = uid();

    setCurrentBlocks(prev => {
      const base = moveUncToTop(ensureUncExists(prev));
      const { uncIndex, end: uncEnd } = findUncRange(base);
      const insertAt = uncIndex >= 0 ? Math.max(uncEnd, base.length) : base.length;
      const next = base.slice();
      next.splice(insertAt, 0, { id: newListId, text: 'New List', indent: 0 });
      return next;
    });

    triggerNewLineAnim(newListId);

    requestAnimationFrame(() => {
      const el = inputRefs.current[newListId];
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
      el.setSelectionRange(0, el.value.length);
    });
  };

  const addTaskUnderList = (listId: string) => {
    const newTaskId = uid();

    setCurrentBlocks(prev => {
      const base = moveUncToTop(ensureUncExists(prev));
      const i = base.findIndex(b => b.id === listId);
      if (i < 0) return base;

      let end = i + 1;
      while (end < base.length && base[end].indent !== 0) end++;

      const next = base.slice();
      next.splice(end, 0, {
        id: newTaskId,
        text: '',
        indent: 1,
        checked: false,
        deadline: undefined,
        isHidden: undefined,
        archived: undefined,
      });

      return next;
    });

    setCurrentCollapsed(prev => ({ ...prev, [listId]: false }));
    focusBlock(newTaskId, false);
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
      if (b.indent === 0) {
        e.preventDefault();
        e.stopPropagation();
        const now = Date.now();
        const armed = armedDeleteListRef.current;
        if (armed?.id === b.id && now - armed.t < 800) {
          armedDeleteListRef.current = null;
          removeTitleSendChildrenToUNC(b.id);
          return;
        }
        armedDeleteListRef.current = { id: b.id, t: now };
        return;
      }
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

  /* ===================== Hidden map ===================== */
  const hiddenMap = useMemo(() => {
    const hidden: Record<string, boolean> = {};
    let currentListId: string | null = null;

    for (const b of blocks) {
      const isList = b.indent === 0;
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
      if (isList) {
        currentListId = isUncList ? null : b.id;
        hidden[b.id] = false;
        continue;
      }
      hidden[b.id] = Boolean(currentListId && collapsed[currentListId]);
    }

    return hidden;
  }, [blocks, collapsed, showHidden]);

  const toggleList = (listId: string) => {
    setCurrentCollapsed(prev => ({ ...prev, [listId]: !prev[listId] }));
  };

  const openDatePicker = (id: string) => {
    const el = dateRefs.current[id];
    if (!el) return;
    try {
      if (typeof (el as any).showPicker === 'function') (el as any).showPicker();
      else el.click();
    } catch { el.click(); }
  };

  /* ===================== DRAG ===================== */
  const onDragStartRow = (e: React.DragEvent, id: string, index: number) => {
    dragRef.current = { id, fromIndex: index };
    setDragOverId(id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch {}
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
      writeHabitsLS({ habits: next, lastDailyResetYMD: habitsMeta.lastDaily, lastWeeklyResetYMD: habitsMeta.lastWeekly });
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

  /* ===================== PROJECT UI ===================== */
  const addProject = () => {
    const title = window.prompt('Project name:', 'New Project');
    if (!title) return;
    const p: Project = {
      project_id: pid(),
      title: title.trim() || 'New Project',
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

  /* ===================== HABITS HELPERS ===================== */
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
    persistHabits([...habits, next]);
    focusHabit(next.id, false);
  };

  const updateHabit = (id: string, patch: Partial<HabitBlock>) => {
    persistHabits(habits.map(h => (h.id === id ? { ...h, ...patch } : h)));
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
    if (e.key === 'Enter') { e.preventDefault(); insertHabitAfter(h.id); return; }
    if (e.key === 'Backspace' && h.text === '') { e.preventDefault(); removeHabit(h.id); return; }
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

  /* ===================== REMINDERS HELPERS ===================== */
  const persistReminders = (next: ReminderItem[]) => {
    setReminders(next);
    writeRemindersLS({ reminders: next });
  };

  const addReminder = () => {
    const next: ReminderItem = { id: uid(), title: '', date: todayYMD(), time: '11:00', daily: false };
    persistReminders([...reminders, next]);
    focusReminder(next.id, false);
  };

  const updateReminder = (id: string, patch: Partial<ReminderItem>) => {
    persistReminders(reminders.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeReminder = (id: string) => {
    if (reminders.length <= 1) {
      const next = [{ id: uid(), title: '', date: todayYMD(), time: '11:00', daily: false }];
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
    const nextR: ReminderItem = { id: uid(), title: '', date: todayYMD(), time: '11:00', daily: false };
    const i = reminders.findIndex(r => r.id === id);
    const next = reminders.slice();
    next.splice(i + 1, 0, nextR);
    persistReminders(next);
    triggerNewLineAnim(nextR.id);
    focusReminder(nextR.id, false);
  };

  const handleReminderKey = (e: React.KeyboardEvent<HTMLInputElement>, r: ReminderItem) => {
    if (e.key === 'Enter') { e.preventDefault(); insertReminderAfter(r.id); return; }
    if (e.key === 'Backspace' && r.title === '') { e.preventDefault(); removeReminder(r.id); return; }
  };

  /* ===================== RENDER ===================== */
  return (
    <>
      <aside className="bg-gray-800 p-4 h-full overflow-y-auto flex flex-col w-full">

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
          >
            Reminders
          </button>
        </div>

        {/* ===================== TASKS TAB ===================== */}
        {tab === 'tasks' ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="text-white/80 font-semibold">Organizer</div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowHidden(v => !v)}
                  className={[
                    'text-[11px] px-2 py-1 rounded-md border',
                    showHidden ? 'border-sky-400/40 text-sky-200 bg-sky-500/10' : 'border-white/10 text-white/60',
                    'hover:text-white/80 hover:bg-white/5 transition-colors',
                  ].join(' ')}
                  title="Toggle dismissed items"
                >
                  {showHidden ? '◯' : '👁'}
                </button>

                <button
                  type="button"
                  onClick={dismissCompleted}
                  className="text-[11px] px-2 py-1 rounded-md border border-white/10 text-white/60 hover:text-white/80 hover:bg-white/5 transition-colors"
                  title="Dismiss completed tasks"
                >
                  Dismiss
                </button>

                <button
                  type="button"
                  onClick={addNewList}
                  className="text-[11px] px-2 py-1 rounded-md border border-white/10 text-white/60 hover:text-white/80 hover:bg-white/5 transition-colors"
                  title="Add a new list"
                >
                  + New List
                </button>
              </div>
            </div>

            <div className="space-y-1">
              {(() => {
                const { uncIndex, start: uncStart, end: uncEnd } = findUncRange(blocks);

                return blocks.map((b, idx) => {
                  if (uncIndex >= 0 && idx === uncIndex) return null;
                  if (hiddenMap[b.id]) return null;

                  const isList = b.indent === 0;
                  const isTask = b.indent > 0;
                  const inUncTasks = uncIndex >= 0 && idx >= uncStart && idx < uncEnd && b.indent > 0;

                  const rowNudgeClass = nudge?.id === b.id ? (nudge.dir === 'right' ? 'wadu-nudge-right' : 'wadu-nudge-left') : '';
                  const rowNewClass = newId === b.id ? 'wadu-line-in' : '';
                  const isDraggingOver = dragOverId === b.id && dragRef.current?.id !== b.id;
                  const isDraggingMe = dragRef.current?.id === b.id;

                  const pill = isTask ? formatPill(b.deadline) : '';
                  const canArchive = Boolean(isTask && b.checked);
                  const canUnhide = Boolean(isTask && showHidden && b.isHidden === true);

                  return (
                    <React.Fragment key={b.id}>
                      <div
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
                        style={{ paddingLeft: isList ? 2 : (inUncTasks ? 6 : 8 + b.indent * 16) }}
                      >
                        <div
                          className="w-3 shrink-0 text-white/20 select-none opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                          title="Drag"
                        >
                          ⋮⋮
                        </div>

                        <div className="flex items-center gap-1 w-6 shrink-0" />

                        {isList ? (
                          <button
                            type="button"
                            onClick={() => toggleList(b.id)}
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
                          ref={el => void  (inputRefs.current[b.id] = el)}
                          value={b.text}
                          placeholder={isList ? 'List…' : 'Task…'}
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
                            'w-full bg-transparent outline-none text-sm cursor-pointer transition-opacity duration-150',
                            isList ? 'text-white font-semibold' : b.checked ? 'text-white/40 line-through' : 'text-white/80',
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
                              ref={el => void  (dateRefs.current[b.id] = el)}
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
                              >
                                ↩
                              </button>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => { if (!canArchive) return; archiveTask(b.id); }}
                              className={[
                                'h-7 w-7 rounded-full border flex items-center justify-center',
                                'transition-[transform,opacity,background-color,border-color] duration-150 ease-out',
                                canArchive
                                  ? 'border-white/10 bg-white/5 text-white/70 hover:text-white/90 hover:bg-white/10 hover:border-white/15 group-hover:scale-[1.03]'
                                  : 'border-white/5 bg-white/0 text-white/25 opacity-40 cursor-not-allowed',
                              ].join(' ')}
                              title={canArchive ? 'Archive' : 'Complete it to archive'}
                            >
                              🗑️
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {isList && !isUncTitleBlock(b) ? (
                        <div className="flex items-center" style={{ paddingLeft: 24 }}>
                          <button
                            type="button"
                            onClick={() => addTaskUnderList(b.id)}
                            className="mt-1 text-[11px] px-2 py-1 rounded-md border border-white/10 text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 transition-colors"
                          >
                            + task
                          </button>
                        </div>
                      ) : null}
                    </React.Fragment>
                  );
                });
              })()}
            </div>

            <div className="mt-3 text-[11px] text-white/35">
              Drag to reorder · Enter new line · Tab indent · Shift+Tab outdent · Dismiss hides completed · 👁 show dismissed · ↩ restore · 🗑 archive · Double click to Pivot
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
                    className="h-8 w-8 shrink-0 rounded-md border border-white/10 bg-white/5 text-white/80 hover:text-white hover:bg-white/10 transition-all"
                    title="New habit"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={forceResetHabitsNow}
                    className="text-[11px] px-2 py-1 rounded-md border border-white/10 text-white/60 hover:text-white/80 hover:bg-white/5 transition-colors"
                    title="Reset now"
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
                    <div className="w-3 shrink-0 text-white/20 select-none opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" title="Drag">
                      ⋮⋮
                    </div>

                    <button
                      type="button"
                      onClick={() => updateHabit(h.id, { checked: !h.checked })}
                      className={[
                        'h-4 w-4 rounded border flex items-center justify-center shrink-0',
                        'transition-[transform,background-color,border-color] duration-150 ease-out group-hover:scale-[1.06]',
                        h.checked ? 'bg-emerald-500/15 border-emerald-400/70' : 'border-white/25',
                      ].join(' ')}
                    >
                      {h.checked ? <span className="text-emerald-300 text-xs">✓</span> : null}
                    </button>

                    <input
                      ref={el => void  (habitInputRefs.current[h.id] = el)}
                      value={h.text}
                      placeholder="Habit…"
                      onChange={(e) => updateHabit(h.id, { text: e.target.value })}
                      onKeyDown={(e) => handleHabitKey(e, h)}
                      className={[
                        'w-full bg-transparent outline-none text-sm cursor-pointer transition-opacity duration-150',
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
                    >
                      {h.weekly ? 'Weekly' : 'Daily'}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 text-[11px] text-white/35">
              Enter creates a new habit · Backspace deletes if empty · Weekly resets only on Mondays
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
                  className="h-8 w-8 shrink-0 rounded-md border border-white/10 bg-white/5 text-white/80 hover:text-white hover:bg-white/10 transition-all"
                  title="New reminder"
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
                    <div className="w-3 shrink-0 text-white/20 select-none opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" title="Drag">
                      ⋮⋮
                    </div>

                    <input
                      ref={el => void  (reminderTitleRefs.current[r.id] = el)}
                      value={r.title}
                      placeholder="Reminder…"
                      onChange={(e) => updateReminder(r.id, { title: e.target.value })}
                      onKeyDown={(e) => handleReminderKey(e, r)}
                      className="w-full bg-transparent outline-none text-sm cursor-pointer text-white/80"
                    />

                    <input
                      type="date"
                      value={isValidDateYYYYMMDD(r.date) ? r.date : todayYMD()}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateReminder(r.id, { date: isValidDateYYYYMMDD(v) ? v : todayYMD() });
                      }}
                      className="shrink-0 text-[11px] px-2 py-1 rounded-md border outline-none bg-black/20 border-white/10 text-white/75 hover:bg-black/25 focus:border-white/20"
                    />

                    <input
                      type="time"
                      value={isValidTimeHHMM(r.time) ? r.time : '11:00'}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateReminder(r.id, { time: isValidTimeHHMM(v) ? v : '11:00' });
                      }}
                      className="shrink-0 text-[11px] px-2 py-1 rounded-md border outline-none bg-black/20 border-white/10 text-white/75 hover:bg-black/25 focus:border-white/20"
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
                    >
                      {r.daily ? 'Daily' : 'Once'}
                    </button>

                    <button
                      type="button"
                      onClick={() => removeReminder(r.id)}
                      className="h-7 w-7 rounded-full border border-white/10 bg-white/5 text-white/60 hover:text-white/85 hover:bg-white/10 transition-all opacity-0 group-hover:opacity-100"
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 text-[11px] text-white/35">
              Enter creates a new reminder · Backspace deletes if empty · Daily/Once controls recurrence
            </div>
          </>
        ) : null}
      </aside>

      <PivotModal
        open={pivot.open}
        word={pivot.word}
        rows={pivotRows}
        onClose={closePivot}
        onGoTo={(blockId) => { focusBlock(blockId, true); }}
        pillText={(r) => (r.indent > 0 ? formatPill(r.deadline) : '')}
        pillClass={(r) => pillClass(r.deadline, r.checked)}
      />
    </>
  );
};