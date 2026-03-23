// app/components/Sidebar.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PivotModal, buildPrunedPivotTree, extractWordAt, type PivotTreeRow } from './Pivot';

import {
  // Types
  type Block,
  type Project,
  type HabitBlock,
  type HabitsPayload,
  type ReminderItem,
  // Constants
  LS_KEY_V2,
  LS_KEY_V1,
  LS_KEY_HABITS,
  LS_KEY_REMINDERS,
  UNC_TITLE,
  // Utilities
  uid,
  arrayMove,
  isValidDateYYYYMMDD,
  isValidTimeHHMM,
  todayYMD,
  formatPill,
  pillClass,
  // Array structure
  isUncTitleBlock,
  findUncRange,
  ensureUncExists,
  moveUncToTop,
  normalizeLoadedBlocks,
  makePersonalProject,
  // Block mutations
  updateBlock as updateBlockArr,
  insertBlockAfter,
  removeBlock as removeBlockArr,
  removeTitleSendChildrenToUnc,
  dismissCompleted as dismissCompletedArr,
  addNewList as addNewListArr,
  addTaskUnderList as addTaskUnderListArr,
  // Hidden map
  buildHiddenMap,
  // Projects persistence
  readProjectsLS,
  writeProjectsLS,
  // Habits
  makeDefaultHabit,
  ensureOneHabit,
  readHabitsLS,
  writeHabitsLS,
  applyHabitResets,
  forceResetHabits,
  insertHabitAfter as insertHabitAfterArr,
  removeHabit as removeHabitArr,
  updateHabit as updateHabitArr,
  // Reminders
  makeDefaultReminder,
  ensureOneReminder,
  readRemindersLS,
  writeRemindersLS,
  insertReminderAfter as insertReminderAfterArr,
  removeReminder as removeReminderArr,
  updateReminder as updateReminderArr,
} from '@/lib/datacenter';

/* ===================== Pivot state ===================== */
type PivotState = {
  open: boolean;
  word: string;
  blockId: string | null;
};

/* ===================== US date helpers ===================== */
function formatDateUS(date?: string) {
  if (!date || !isValidDateYYYYMMDD(date)) return '—';
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(dt);
}

function formatTimeUS(time?: string) {
  const safe = isValidTimeHHMM(time) ? time : '11:00';
  const [hh, mm] = safe.split(':').map(Number);
  const dt = new Date();
  dt.setHours(hh || 0, mm || 0, 0, 0);
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(dt);
}

function formatReminderDateTimeUS(date?: string, time?: string) {
  const datePart = formatDateUS(date);
  const timePart = formatTimeUS(time);
  return `${datePart} · ${timePart}`;
}



export const Sidebar = () => {
  const [tab, setTab] = useState<'tasks' | 'habits' | 'reminders'>('tasks');

  /* ── Projects ── */
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  /* ── Habits ── */
  const [habits, setHabits] = useState<HabitBlock[]>([makeDefaultHabit()]);
  const [habitsMeta, setHabitsMeta] = useState<{ lastDaily?: string; lastWeekly?: string }>({});

  /* ── Reminders ── */
  const [reminders, setReminders] = useState<ReminderItem[]>([makeDefaultReminder()]);

  const [hydrated, setHydrated] = useState(false);

  const [pivot, setPivot] = useState<PivotState>({ open: false, word: '', blockId: null });
  const [hintIndex, setHintIndex] = useState(0);

  /* ── Refs ── */
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

  /* ── Derived state ── */
  const currentProjectIndex = useMemo(
    () => Math.max(0, projects.findIndex(p => p.project_id === selectedProjectId)),
    [projects, selectedProjectId],
  );
  const currentProject = projects[currentProjectIndex];
  const blocks: Block[] = currentProject?.blocks
    ?? moveUncToTop(ensureUncExists([{ id: uid(), text: '', indent: 0 }]));
 const collapsed = useMemo<Record<string, boolean>>(
  () => currentProject?.collapsed ?? {},
  [currentProject?.collapsed],
);

  /* ===================== setCurrentBlocks / setCurrentCollapsed ===================== */
  const setCurrentBlocks = (nextFn: Block[] | ((prev: Block[]) => Block[])) => {
    setProjects(prev => {
      if (!prev.length) {
        const base = moveUncToTop(ensureUncExists([{ id: uid(), text: '', indent: 0 }]));
        const personal = makePersonalProject(
          typeof nextFn === 'function' ? nextFn(base) : nextFn, {},
        );
        setSelectedProjectId(personal.project_id);
        return [personal];
      }
      const idx = prev.findIndex(p => p.project_id === selectedProjectId);
      const safeIdx = idx >= 0 ? idx : 0;
      const next = prev.map(p => ({ ...p }));
      const old = next[safeIdx].blocks ?? moveUncToTop(ensureUncExists([]));
      let newBlocks = typeof nextFn === 'function' ? nextFn(old) : nextFn;
      newBlocks = moveUncToTop(ensureUncExists(newBlocks));
      next[safeIdx] = { ...next[safeIdx], blocks: newBlocks };
      return next;
    });
  };

  const setCurrentCollapsed = (
    nextFn: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>),
  ) => {
    setProjects(prev => {
      if (!prev.length) {
        const personal = makePersonalProject(
          moveUncToTop(ensureUncExists([])),
          typeof nextFn === 'function' ? nextFn({}) : nextFn,
        );
        setSelectedProjectId(personal.project_id);
        return [personal];
      }
      const idx = prev.findIndex(p => p.project_id === selectedProjectId);
      const safeIdx = idx >= 0 ? idx : 0;
      const next = prev.map(p => ({ ...p }));
      const old = next[safeIdx].collapsed ?? {};
      const newCol = typeof nextFn === 'function' ? nextFn(old) : nextFn;
      next[safeIdx] = { ...next[safeIdx], collapsed: newCol };
      return next;
    });
  };

  /* ===================== Initial load — Projects ===================== */
  useEffect(() => {
    try {
      const payload = readProjectsLS();
      if (payload) {
        const normalized = payload.projects.map(p => {
          const col = p.collapsed && typeof p.collapsed === 'object' ? p.collapsed : {};
          const newCollapsed: Record<string, boolean> = {};
          for (const k in col) newCollapsed[k] = true;
          return { ...p, collapsed: newCollapsed };
        });
        setProjects(normalized);
        setSelectedProjectId(payload.selectedProjectId || normalized[0].project_id);
        lastWrittenRef.current = JSON.stringify({ projects: normalized, selectedProjectId: payload.selectedProjectId });
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



  /* ===================== Sync from Quick (cross-tab) ===================== */
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
    const onStorage = (e: StorageEvent) => { if (e.key === LS_KEY_V2) applyFromLS(); };
    window.addEventListener('youtask_projects_updated', applyFromLS);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('youtask_projects_updated', applyFromLS);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  /* ===================== Load Habits ===================== */
  useEffect(() => {
    const load = () => {
      const raw = readHabitsLS();
      const payload = applyHabitResets(raw);
      const habits = ensureOneHabit(payload.habits);
      setHabits(habits);
      setHabitsMeta({ lastDaily: payload.lastDailyResetYMD, lastWeekly: payload.lastWeeklyResetYMD });
      const needWrite =
        raw.lastDailyResetYMD !== payload.lastDailyResetYMD ||
        raw.lastWeeklyResetYMD !== payload.lastWeeklyResetYMD ||
        JSON.stringify(raw.habits) !== JSON.stringify(habits);
      if (needWrite) writeHabitsLS({ ...payload, habits });
    };
    load();
    const onStorage = (e: StorageEvent) => { if (e.key === LS_KEY_HABITS) load(); };
    window.addEventListener('youtask_habits_updated', load);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('youtask_habits_updated', load);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  /* ===================== Load Reminders ===================== */
  useEffect(() => {
    const load = () => {
      const p = readRemindersLS();
      const next = ensureOneReminder(p.reminders);
      setReminders(next);
      if (JSON.stringify(p.reminders) !== JSON.stringify(next)) writeRemindersLS({ reminders: next });
    };
    load();
    const onStorage = (e: StorageEvent) => { if (e.key === LS_KEY_REMINDERS) load(); };
    window.addEventListener('youtask_reminders_updated', load);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('youtask_reminders_updated', load);
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

  /* ===================== Save Projects ===================== */
  useEffect(() => {
    if (!hydrated || applyingExternalRef.current) return;
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
      if (caretToEnd) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } else el.setSelectionRange(0, 0);
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
      } else el.setSelectionRange(0, 0);
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
      } else el.setSelectionRange(0, 0);
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
    setPivot(p => {
      if (!p.open || p.blockId !== blockId) return p;
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

  /* ===================== Hidden map ===================== */
  const hiddenMap = useMemo(
    () => buildHiddenMap(blocks, {
      collapsed,
      showHidden: false,
      dateMode: 'all',
      focusDay: todayYMD(),
      sortBy: 'dueDate',
    }),
    [blocks, collapsed],
  );

  /* ===================== Tasks — wrappers ===================== */
  const handleUpdateBlock = (id: string, patch: Partial<Block>) => {
    setCurrentBlocks(prev => updateBlockArr(prev, id, patch));
  };

  const handleInsertAfter = (id: string, block: Block) => {
    setCurrentBlocks(prev => insertBlockAfter(prev, id, block));
    triggerNewLineAnim(block.id);
    focusBlock(block.id, false);
  };

  const handleRemoveBlock = (id: string) => {
    setCurrentBlocks(prev => {
      const i = prev.findIndex(b => b.id === id);
      const isList = prev[i]?.indent === 0;
      if (isList) {
        setCurrentCollapsed(c => {
          const { [id]: _omit, ...rest } = c;
          void _omit;
          return rest;
        });
      }
      const next = removeBlockArr(prev, id);
      const target = next[Math.max(0, i - 1)];
      if (target) focusBlock(target.id, true);
      return next;
    });
  };

  const handleRemoveTitle = (listId: string) => {
    setCurrentBlocks(prev => {
      const next = removeTitleSendChildrenToUnc(prev, listId);
      if (next === prev) return prev;
      setCurrentCollapsed(c => {
        const { [listId]: _omit, ...rest } = c;
        void _omit;
        return rest;
      });
      const { uncIndex } = findUncRange(next);
      const target = next[Math.max(0, uncIndex + 1)] ?? next[0];
      if (target) focusBlock(target.id, true);
      return next;
    });
  };

  const handleDismissCompleted = () => setCurrentBlocks(prev => dismissCompletedArr(prev));


  const handleAddNewList = () => {
    let newListId = '';
    setCurrentBlocks(prev => {
      const result = addNewListArr(prev);
      newListId = result.newListId;
      return result.blocks;
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

  const handleAddTaskUnderList = (listId: string) => {
    let newTaskId = '';
    setCurrentBlocks(prev => {
      const result = addTaskUnderListArr(prev, listId, {});
      newTaskId = result.newTaskId;
      return result.blocks;
    });
    setCurrentCollapsed(prev => ({ ...prev, [listId]: false }));
    focusBlock(newTaskId, false);
  };

  const toggleList = (listId: string) =>
    setCurrentCollapsed(prev => ({ ...prev, [listId]: !prev[listId] }));

  const openDatePicker = (id: string) => {
    const el = dateRefs.current[id];
    if (!el) return;
    try {
      const picker = el as HTMLInputElement & { showPicker?: () => void };
      if (typeof picker.showPicker === 'function') picker.showPicker();
      else el.click();
    } catch {
      el.click();
    }
  };

  /* ── Keyboard (tasks) ── */
  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>, b: Block) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextIndent = b.indent === 0 ? 1 : b.indent;
      handleInsertAfter(b.id, {
        id: uid(),
        text: '',
        indent: nextIndent,
        checked: nextIndent > 0 ? false : undefined,
        deadline: nextIndent > 0 ? todayYMD() : undefined,
        isHidden: undefined,
        archived: undefined,
      });
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const MAX_INDENT = 6;
      const nextIndent = e.shiftKey ? Math.max(0, b.indent - 1) : Math.min(MAX_INDENT, b.indent + 1);
      handleUpdateBlock(b.id, {
        indent: nextIndent,
        checked: nextIndent === 0 ? undefined : b.checked ?? false,
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
          handleRemoveTitle(b.id);
          return;
        }
        armedDeleteListRef.current = { id: b.id, t: now };
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      handleRemoveBlock(b.id);
    }
  };

  /* ===================== Habits — wrappers ===================== */
  const persistHabits = (next: HabitBlock[], metaOverride?: Partial<HabitsPayload>) => {
    setHabits(next);
    writeHabitsLS({
      habits: next,
      lastDailyResetYMD: metaOverride?.lastDailyResetYMD ?? habitsMeta.lastDaily,
      lastWeeklyResetYMD: metaOverride?.lastWeeklyResetYMD ?? habitsMeta.lastWeekly,
    });
  };

  const handleAddHabit = () => {
    const next = makeDefaultHabit();
    persistHabits([...habits, next]);
    focusHabit(next.id, false);
  };

  const handleUpdateHabit = (id: string, patch: Partial<HabitBlock>) => {
    persistHabits(updateHabitArr(habits, id, patch));
  };

  const handleRemoveHabit = (id: string) => {
    const result = removeHabitArr(habits, id);
    persistHabits(result.habits);
    focusHabit(result.focusId, result.habits.length === 1);
  };

  const handleInsertHabitAfter = (id: string) => {
    const result = insertHabitAfterArr(habits, id);
    persistHabits(result.habits);
    triggerNewLineAnim(result.newHabit.id);
    focusHabit(result.newHabit.id, false);
  };

  const handleForceResetHabits = () => {
    const payload = forceResetHabits(habits, { lastDaily: habitsMeta.lastDaily, lastWeekly: habitsMeta.lastWeekly });
    setHabitsMeta({ lastDaily: payload.lastDailyResetYMD, lastWeekly: payload.lastWeeklyResetYMD });
    persistHabits(payload.habits, payload);
  };

  const handleHabitKey = (e: React.KeyboardEvent<HTMLInputElement>, h: HabitBlock) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInsertHabitAfter(h.id);
      return;
    }
    if (e.key === 'Backspace' && h.text === '') {
      e.preventDefault();
      handleRemoveHabit(h.id);
      return;
    }
  };

  /* ===================== Reminders — wrappers ===================== */
  const persistReminders = (next: ReminderItem[]) => {
    setReminders(next);
    writeRemindersLS({ reminders: next });
  };

  const handleAddReminder = () => {
    const next = makeDefaultReminder();
    persistReminders([...reminders, next]);
    focusReminder(next.id, false);
  };

  const handleUpdateReminder = (id: string, patch: Partial<ReminderItem>) => {
    persistReminders(updateReminderArr(reminders, id, patch));
  };

  const handleRemoveReminder = (id: string) => {
    const result = removeReminderArr(reminders, id);
    persistReminders(result.reminders);
    focusReminder(result.focusId, result.reminders.length === 1);
  };

  const handleInsertReminderAfter = (id: string) => {
    const result = insertReminderAfterArr(reminders, id);
    persistReminders(result.reminders);
    triggerNewLineAnim(result.newReminder.id);
    focusReminder(result.newReminder.id, false);
  };

  const handleReminderKey = (e: React.KeyboardEvent<HTMLInputElement>, r: ReminderItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInsertReminderAfter(r.id);
      return;
    }
    if (e.key === 'Backspace' && r.title === '') {
      e.preventDefault();
      handleRemoveReminder(r.id);
      return;
    }
  };

  /* ===================== Drag & drop ===================== */
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
      persistHabits(next);
      dragRef.current = null;
      setDragOverId(null);
      return;
    }

    if (tab === 'reminders') {
      const toIndex = reminders.findIndex(r => r.id === overId);
      if (toIndex < 0) return;
      persistReminders(arrayMove(reminders, drag.fromIndex, toIndex));
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



  /* ===================== Render ===================== */
  return (
    <>
      <aside className="bg-gray-800 h-full flex flex-col w-full min-h-0">
        <div className="px-4 pt-4 pb-2 text-white/80 font-semibold shrink-0">Organizer</div>

        {/* Tabs */}
        <div className="px-4 mb-3 flex items-center gap-2 shrink-0">
          {(['tasks', 'habits', 'reminders'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={[
                'flex-1 text-[12px] px-2 py-2 rounded-md border transition-colors',
                tab === t
                  ? t === 'tasks'
                    ? 'border-sky-400/35 bg-sky-500/10 text-sky-100'
                    : t === 'habits'
                      ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100'
                      : 'border-violet-400/35 bg-violet-500/10 text-violet-100'
                  : 'border-white/10 bg-white/5 text-white/70 hover:text-white/85 hover:bg-white/7',
              ].join(' ')}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
          {/* ===================== TASKS TAB ===================== */}
          {tab === 'tasks' && (
            <>
              <div className="flex items-center justify-end mb-3 gap-2">
                <button
                  type="button"
                  onClick={handleDismissCompleted}
                  className="text-[11px] px-2 py-1 rounded-md border border-white/10 text-white/60 hover:text-white/80 hover:bg-white/5 transition-colors"
                  title="Dismiss completed tasks"
                >
                  Dismiss Completed
                </button>
                <button
                  type="button"
                  onClick={handleAddNewList}
                  className="text-[11px] px-2 py-1 rounded-md border border-white/10 text-white/60 hover:text-white/80 hover:bg-white/5 transition-colors"
                  title="Add a new list"
                >
                  + New List
                </button>
              </div>

              <div className="space-y-1">
                {(() => {
                  const { uncIndex, start: uncStart, end: uncEnd } = findUncRange(blocks);
                  return blocks.map((b, idx) => {
                    if (uncIndex >= 0 && idx === uncIndex) return null;
                    if (hiddenMap[b.id]) return null;
                    if (b.isHidden === true) return null;

                    const isList = b.indent === 0;
                    const isTask = b.indent > 0;
                    const inUncTasks = uncIndex >= 0 && idx >= uncStart && idx < uncEnd && b.indent > 0;
                    const rowNudgeClass = nudge?.id === b.id ? (nudge.dir === 'right' ? 'wadu-nudge-right' : 'wadu-nudge-left') : '';
                    const rowNewClass = newId === b.id ? 'wadu-line-in' : '';
                    const isDraggingOver = dragOverId === b.id && dragRef.current?.id !== b.id;
                    const isDraggingMe = dragRef.current?.id === b.id;
                    const pill = isTask ? formatPill(b.deadline) : '';


                    return (
                      <React.Fragment key={b.id}>
                        <div
                          draggable
                          onDragStart={e => onDragStartRow(e, b.id, idx)}
                          onDragOver={e => onDragOverRow(e, b.id)}
                          onDrop={e => onDropRow(e, b.id)}
                          onDragEnd={onDragEndRow}
                          className={[
                            'group flex items-center gap-1 px-0.5 py-1 rounded-md',
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
                          <div />

                          {isList ? (
                            <button
                              type="button"
                              onClick={() => toggleList(b.id)}
                              className="w-3 shrink-0 text-white/35 hover:text-white/60 transition-colors"
                              title={collapsed[b.id] ? 'Expand' : 'Collapse'}
                            >
                              {collapsed[b.id] ? '▸' : '▾'}
                            </button>
                          ) : <div className="w-3 shrink-0" />}

                        {isTask ? (
                            <button
                              type="button"
                              onClick={() => handleUpdateBlock(b.id, { checked: !b.checked })}
                              className="relative h-4 w-4 shrink-0 flex items-center justify-center group-hover:scale-[1.08] transition-transform"
                              title="Complete"
                            >
                              {b.checked ? (
                                <span className="relative flex h-3 w-3 items-center justify-center">
                                  <span className="absolute h-2.5 w-2.5 rounded-full bg-emerald-300/80 blur-[2px]" />
                                  <span className="absolute h-1.5 w-1.5 rounded-full bg-emerald-200" />

                                </span>
                              ) : (
                                <span className="h-3 w-3 rounded border border-white/25 group-hover:border-white/40 transition-colors" />
                              )}
                            </button>
                          ) : null}

                          <input
                            ref={el => void (inputRefs.current[b.id] = el)}
                            value={b.text}
                            placeholder={isList ? 'List…' : 'Task…'}
                            onChange={e => handleUpdateBlock(b.id, { text: e.target.value })}
                            onKeyDown={e => handleKey(e, b)}
                            onDoubleClick={e => { if (!(b.indent > 0)) return; openPivotForInput(b.id, e.currentTarget); }}
                            onSelect={e => { if (!(b.indent > 0)) return; maybeUpdatePivotFromInput(b.id, e.currentTarget); }}
                            className={[
                              'w-full bg-transparent outline-none text-sm cursor-pointer transition-opacity duration-150',
                              isList ? 'text-white font-semibold' : b.checked ? 'text-white/40 line-through' : 'text-white/80',
                            ].join(' ')}
                          />

                          {isList && !isUncTitleBlock(b) ? (
                            <div className="flex items-center" style={{ whiteSpace: 'pre' }}>
                              <button
                                type="button"
                                onClick={() => handleAddTaskUnderList(b.id)}
                                className="mt-1 text-[18px] px-2 py-1 rounded-md border border-white/10 text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 transition-colors"
                              >
                                +
                              </button>
                            </div>
                          ) : null}
                          


                          {isTask ? (
                            <div className="shrink-0 pl-2 flex items-center gap-2">
                              <button
                                type="button"
                                style={{ minWidth: '66px' }}
                                onClick={() => openDatePicker(b.id)}
                                className={['text-[11px] px-2 py-1 rounded-full border transition-colors', pillClass(b.deadline, b.checked)].join(' ')}
                                title={pill ? 'Change date' : 'Set date'}
                              >
                                {pill || '📅'}
                              </button>

                              <input
                                ref={el => void (dateRefs.current[b.id] = el)}
                                type="date"
                                className="hidden"
                                value={isValidDateYYYYMMDD(b.deadline) ? b.deadline : ''}
                                onChange={e => {
                                  const v = e.target.value;
                                  handleUpdateBlock(b.id, { deadline: v || undefined });
                                }}
                              />

                              {/* <button
                                type="button"
                                onClick={() => { if (canArchive) handleArchiveTask(b.id); }}
                                className={[
                                  'h-7 w-7 rounded-full border flex items-center justify-center transition-[transform,opacity,background-color,border-color] duration-150 ease-out',
                                  canArchive
                                    ? 'border-white/10 bg-white/5 text-white/70 hover:text-white/90 hover:bg-white/10 hover:border-white/15 group-hover:scale-[1.03]'
                                    : 'border-white/5 bg-white/0 text-white/25 opacity-40 cursor-not-allowed',
                                ].join(' ')}
                                title={canArchive ? 'Move to Trash' : 'Complete it first'}
                              >
                                🗑️
                              </button> */}
                            </div>
                          ) : null}
                        </div>
                      </React.Fragment>
                    );
                  });
                })()}
              </div>
            </>
          )}

          {/* ===================== HABITS TAB ===================== */}
          {tab === 'habits' && (
            <>
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <div className="text-white/80 font-semibold">Habits</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddHabit}
                      className="h-8 w-8 shrink-0 rounded-md border border-white/10 bg-white/5 text-white/80 hover:text-white hover:bg-white/10 transition-all"
                      title="New habit"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={handleForceResetHabits}
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
                      onDragStart={e => onDragStartRow(e, h.id, idx)}
                      onDragOver={e => onDragOverRow(e, h.id)}
                      onDrop={e => onDropRow(e, h.id)}
                      onDragEnd={onDragEndRow}
                      className={[
                        'group flex items-center gap-2 px-0.5 py-1 rounded-md',
                        isDraggingOver ? 'bg-white/7 outline outline-1 outline-white/10' : '',
                        isDraggingMe ? 'opacity-60' : '',
                        newId === h.id ? 'wadu-line-in' : '',
                      ].join(' ')}
                    >
                      <div className="w-3 shrink-0 text-white/20 select-none opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" title="Drag">⋮⋮</div>
                      <button
                        type="button"
                        onClick={() => handleUpdateHabit(h.id, { checked: !h.checked })}
                        className={[
                          'h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-[transform,background-color,border-color] duration-150 ease-out group-hover:scale-[1.06]',
                          h.checked ? 'bg-emerald-500/15 border-emerald-400/70' : 'border-white/25',
                        ].join(' ')}
                      >
                        {h.checked ? <span className="text-emerald-300 text-xs">✓</span> : null}
                      </button>
                      <input
                        ref={el => void (habitInputRefs.current[h.id] = el)}
                        value={h.text}
                        placeholder="Habit…"
                        onChange={e => handleUpdateHabit(h.id, { text: e.target.value })}
                        onKeyDown={e => handleHabitKey(e, h)}
                        className={[
                          'w-full bg-transparent outline-none text-sm cursor-pointer transition-opacity duration-150',
                          h.checked ? 'text-white/40 line-through' : 'text-white/80',
                        ].join(' ')}
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateHabit(h.id, { weekly: !h.weekly })}
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
            </>
          )}

          {/* ===================== REMINDERS TAB ===================== */}
          {tab === 'reminders' && (
            <>
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <div className="text-white/80 font-semibold">Reminders</div>
                  <button
                    type="button"
                    onClick={handleAddReminder}
                    className="h-8 w-8 shrink-0 rounded-md border border-white/10 bg-white/5 text-white/80 hover:text-white hover:bg-white/10 transition-all"
                    title="New reminder"
                  >
                    +
                  </button>
                </div>
                <div className="mt-1 text-[10px] text-white/35">
                  US format preview: MM/DD/YYYY · h:mm AM/PM · Optional daily
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
                      onDragStart={e => onDragStartRow(e, r.id, idx)}
                      onDragOver={e => onDragOverRow(e, r.id)}
                      onDrop={e => onDropRow(e, r.id)}
                      onDragEnd={onDragEndRow}
                      className={[
                        'group flex flex-col gap-1 px-0.5 py-1 rounded-md',
                        isDraggingOver ? 'bg-white/7 outline outline-1 outline-white/10' : '',
                        isDraggingMe ? 'opacity-60' : '',
                        newId === r.id ? 'wadu-line-in' : '',
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-3 shrink-0 text-white/20 select-none opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" title="Drag">⋮⋮</div>

                        <input
                          ref={el => void (reminderTitleRefs.current[r.id] = el)}
                          value={r.title}
                          placeholder="Reminder…"
                          onChange={e => handleUpdateReminder(r.id, { title: e.target.value })}
                          onKeyDown={e => handleReminderKey(e, r)}
                          className="w-full bg-transparent outline-none text-sm cursor-pointer text-white/80"
                        />

                        <input
                          type="date"
                          value={isValidDateYYYYMMDD(r.date) ? r.date : todayYMD()}
                          onChange={e => {
                            const v = e.target.value;
                            handleUpdateReminder(r.id, { date: isValidDateYYYYMMDD(v) ? v : todayYMD() });
                          }}
                          className="shrink-0 text-[11px] px-2 py-1 rounded-md border outline-none bg-black/20 border-white/10 text-white/75 hover:bg-black/25 focus:border-white/20"
                        />

                        <input
                          type="time"
                          value={isValidTimeHHMM(r.time) ? r.time : '11:00'}
                          onChange={e => {
                            const v = e.target.value;
                            handleUpdateReminder(r.id, { time: isValidTimeHHMM(v) ? v : '11:00' });
                          }}
                          className="shrink-0 text-[11px] px-2 py-1 rounded-md border outline-none bg-black/20 border-white/10 text-white/75 hover:bg-black/25 focus:border-white/20"
                        />

                        <button
                          type="button"
                          onClick={() => handleUpdateReminder(r.id, { daily: !r.daily })}
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
                          onClick={() => handleRemoveReminder(r.id)}
                          className="h-7 w-7 rounded-full border border-white/10 bg-white/5 text-white/60 hover:text-white/85 hover:bg-white/10 transition-all opacity-0 group-hover:opacity-100"
                          title="Delete"
                        >
                          ×
                        </button>
                      </div>

                      <div className="pl-5 text-[10px] text-white/35">
                        {formatReminderDateTimeUS(
                          isValidDateYYYYMMDD(r.date) ? r.date : todayYMD(),
                          isValidTimeHHMM(r.time) ? r.time : '11:00',
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

       {/* Fixed footer */}
          <div className="shrink-0 border-t border-white/10 bg-gray-800/95 backdrop-blur px-4 py-3 space-y-3">
            <div className="rounded-2xl  px-3 py-3 min-h-[128px]">
              {hintIndex === 0 ? (
                <div>
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-xl border border-yellow-400/20 bg-yellow-500/10 flex items-center justify-center text-lg shrink-0">
                      🎨
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-yellow-200/70">
                        Hint
                      </div>
                      <div className="mt-1 text-[12px] leading-5 text-white/80">
                        Learn the duedate colors to understand your tasks faster.
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-500/10 px-2 py-1 text-[11px] text-yellow-200">
                      <span className="h-2 w-2 rounded-full bg-yellow-300" />
                      Today
                    </span>

                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200">
                      <span className="h-2 w-2 rounded-full bg-emerald-300" />
                      Tomorrow
                    </span>

                    <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-200">
                      <span className="h-2 w-2 rounded-full bg-sky-300" />
                      Upcoming
                    </span>

                    <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200">
                      <span className="h-2 w-2 rounded-full bg-rose-300" />
                      Overdue
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-xl border border-yellow-400/20 bg-yellow-500/10 flex items-center justify-center text-lg shrink-0">
                    💡
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-yellow-200/70">
                      Hint
                    </div>
                    <div className="mt-1 text-[12px] leading-5 text-white/80 transition-all">
                      {hintIndex === 1 && 'Use Daily view to get focused on today’s tasks.'}
                      {hintIndex === 2 && 'Use Organizer to plan your tasks based on your list.'}
                      {hintIndex === 3 && 'Use Timeline to check your week progress.'}
                      {hintIndex === 4 && 'Use Calendar to plan the future.'}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setHintIndex(i)}
                      className={[
                        'h-1.5 rounded-full transition-all',
                        i === hintIndex ? 'w-5 bg-yellow-300/90' : 'w-1.5 bg-white/20 hover:bg-white/35',
                      ].join(' ')}
                      aria-label={`Go to slide ${i + 1}`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setHintIndex((prev) => (prev - 1 + 5) % 5)}
                    className="h-7 w-7 rounded-full border border-white/10 bg-white/5 text-white/60 hover:text-white/85 hover:bg-white/10"
                    aria-label="Previous slide"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => setHintIndex((prev) => (prev + 1) % 5)}
                    className="h-7 w-7 rounded-full border border-white/10 bg-white/5 text-white/60 hover:text-white/85 hover:bg-white/10"
                    aria-label="Next slide"
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>

       
          </div>
       
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