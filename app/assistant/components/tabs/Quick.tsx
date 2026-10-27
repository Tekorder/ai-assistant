// app/components/Quick.tsx
'use client';
// Note we may want to rename this component in the future as 'quick' is a bit confusing
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import MiniCalendar from '../Minicalendar';
//also hi
import {
  // Types
  type Block,
  type Project,
  type DateMode,
  type SortBy,
  type DateRange,
  type ProjectsPayload,
  // Constants
  LS_KEY_V2,
  // Factories
  uid,
  makeTaskBlock,
  makePersonalProject,
  // Persistence
  readProjectsLS,
  cleanupEmptyTasks,
  writeProjectsLS,
  // Array structure
  moveUncToTop,
  ensureUncExists,
  findUncRange,
  isUncTitleBlock,
  insertBlockAfter,
  removeBlock,
  removeListAndChildren,
  openTasksOf,
  moveOpenTasksToList,
  updateBlock as updateBlockArr,
  removeTaskWithSubtasks,
  addTaskUnderList as addTaskUnderListArr,
  createList as createListArr,
  createBlankList,
  // UI helpers
  formatPill,
  labelForYMD,
  getWeekRangeLabel,
  getMonthRangeLabel,
  getRangeLabel,
  daysInRange,
  todayYMD,
  isValidDateYYYYMMDD,
  addDaysYMD,
  // Filter / view helpers
  buildHiddenMap,
  buildListVisibilityHiddenMap,
  onlyListVisible,
  sortBlocksByOrder,
  getTaskFlag,
  repeatDaysLabel,
  // Sync status
  isProjectsHydrated,
  PROJECTS_HYDRATED_EVENT,
  // Recurring tasks
  isRecurringTask,
  recurringShowsOn,
  isOccurrenceDone,
  toggleOccurrence,
} from '@/lib/datacenter';
import { getCurrentUid } from '@/lib/session';
import { TaskFlagButton } from '../TaskFlag';
import { TaskReminderModal } from '../TaskReminder';
import { TaskRepeatModal } from '../TaskRepeat';
import { TaskNoteButton, TaskNoteModal } from '../TaskNote';
import { TaskRowMenu } from '../TaskRowMenu';
import { FirstListWizard } from '../FirstListWizard';
import { DeleteWithOpenTasksDialog, buildMoveTargets } from '../DeleteWithOpenTasksDialog';
import { DateRangeDialog } from '../DateRangeDialog';
import { NewTaskDialog, type NewTaskListOption, type NewTaskTarget } from '../NewTaskDialog';
import { HiddenTaskDialog, isHiddenTaskNoticeMuted, type HiddenTaskReason } from '../HiddenTaskDialog';
import { AgendaListHeader, AgendaTaskRow, AgendaCheck, AgendaDate, AgendaMenuButton, AgendaSectionRow, agendaSectionTitleClass, agendaRowPad } from '../AgendaList';

/**
 * Uids that closed the first-list wizard during this page load. Module memory on
 * purpose: it survives Quick remounting on tab switches (so it doesn't pop back
 * right away) but resets on F5 — a reload with no tasks shows the wizard again.
 */
const wizardClosedThisLoad = new Set<string>();
/** page.tsx mounts Quick twice (mobile + desktop containers) — this keeps both in step. */
const WIZARD_CLOSED_EVENT = 'youtask_first_list_wizard_closed';

/**
 * Sentence glue (English + Spanish) nobody wants a Search for — these words never
 * arm on hover. Compared lowercase, after stripping surrounding punctuation.
 */
/** How many check toggles Ctrl+Z can step back through */
const CHECK_UNDO_LIMIT = 30;

const BANNED_SEARCH_WORDS = new Set([
  // English
  'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'so', 'yet', 'if', 'then', 'than', 'because', 'as',
  'of', 'to', 'in', 'on', 'at', 'by', 'for', 'from', 'with', 'without', 'about', 'into', 'onto',
  'over', 'under', 'up', 'down', 'out', 'off', 'per', 'via',
  'i', 'me', 'my', 'mine', 'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers',
  'it', 'its', 'we', 'us', 'our', 'ours', 'they', 'them', 'their', 'theirs',
  'this', 'that', 'these', 'those', 'there', 'here',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'has', 'have', 'had', 'having', 'do', 'does', 'did', 'done',
  'will', 'would', 'can', 'could', 'should', 'shall', 'may', 'might', 'must',
  'what', 'which', 'who', 'whom', 'whose', 'why', 'how', 'when', 'where',
  'not', 'no', 'yes', 'all', 'any', 'some', 'each', 'every', 'more', 'most', 'very',
  'just', 'also', 'too', 'only', 'again', 'still', 'even',
  // Spanish
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo', 'al', 'del',
  'y', 'e', 'o', 'u', 'ni', 'pero', 'sino', 'que', 'si', 'porque', 'pues', 'como',
  'de', 'en', 'con', 'sin', 'por', 'para', 'a', 'ante', 'bajo', 'desde', 'hasta', 'hacia',
  'entre', 'sobre', 'tras', 'según', 'segun',
  'yo', 'tu', 'tú', 'él', 'ella', 'ello', 'nosotros', 'nosotras', 'ustedes', 'ellos', 'ellas',
  'me', 'te', 'se', 'nos', 'le', 'les', 'mi', 'mis', 'tus', 'su', 'sus', 'nuestro', 'nuestra',
  'este', 'esta', 'esto', 'estos', 'estas', 'ese', 'esa', 'eso', 'esos', 'esas',
  'es', 'son', 'era', 'fue', 'ser', 'estar', 'está', 'están', 'hay', 'ha', 'han', 'he',
  'qué', 'cuál', 'quién', 'cómo', 'cuándo', 'dónde',
  'no', 'sí', 'muy', 'más', 'mas', 'ya', 'también', 'tambien', 'solo', 'sólo',
]);
import classes from '@/app/assistant/_theme/themes.module.css';
import { useQuickFilters, type TaskFilterTag } from '../QuickFiltersContext';
import { useShowAllGroups, useFocusedList } from '../../_hook/useShowAllGroups';

/** First incomplete task under this list with empty text (for Enter → focus instead of duplicating). */
function findFirstEmptyTaskUnderList(blocks: Block[], listId: string): string | null {
  const i = blocks.findIndex(b => b.id === listId && b.indent === 0);
  if (i < 0) return null;
  for (let j = i + 1; j < blocks.length && blocks[j].indent !== 0; j++) {
    const t = blocks[j];
    if (!(t.indent > 0) || t.section) continue;
    if (t.archived === true) continue;
    if (t.checked === true) continue;
    if ((t.text || '').trim() !== '') continue;
    return t.id;
  }
  return null;
}

/* ===================== FX ===================== */
function ConfettiRain({ show }: { show: boolean }) {
  const pieces = useMemo(() => Array.from({ length: 120 }).map((_, i) => ({
    i, left: Math.random() * 100, delay: Math.random() * 0.8,
    duration: 1.9 + Math.random() * 1.6, size: 6 + Math.random() * 8,
    rot: Math.random() * 360, drift: Math.random() * 140 - 70,
    opacity: 0.75 + Math.random() * 0.25, hue: Math.floor(Math.random() * 360),
  })), []);
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
      {pieces.map(p => (
        <span key={p.i} className="absolute top-0 rounded-sm shadow-sm"
          style={{
            left:`${p.left}vw`, width:`${p.size}px`, height:`${Math.max(6,p.size*0.55)}px`,
            animationDelay:`${p.delay}s`, animationDuration:`${p.duration}s`,
            ['--cdrift' as string]:`${p.drift}px`, ['--crot' as string]:`${p.rot + 720}deg`,
            background:`hsl(${p.hue} 90% 60%)`, opacity:0,
            animationName:'confettiFall', animationTimingFunction:'linear', animationFillMode:'forwards'
          }}
        />
      ))}
    </div>
  );
}

function GamificationToast({ show, message }: { show: boolean; message: string }) {
  if (!show) return null;
  return (
    <>
      <style>{`
        @keyframes gamiToastIn{0%{opacity:0;transform:translate(-50%,18px) scale(0.96);filter:blur(6px)}60%{opacity:1;transform:translate(-50%,-2px) scale(1.02);filter:blur(0)}100%{opacity:1;transform:translate(-50%,0px) scale(1);filter:blur(0)}}
        @keyframes gamiShine{0%{transform:translateX(-160%) skewX(-20deg);opacity:0}10%{opacity:.10}25%{opacity:.22}40%{opacity:.10}100%{transform:translateX(260%) skewX(-20deg);opacity:0}}
        @keyframes gamiPulseGlow{0%,100%{box-shadow:0 10px 30px color-mix(in srgb,var(--assistant-accent) 14%,transparent),inset 0 1px 0 rgba(255,255,255,.06)}50%{box-shadow:0 12px 38px color-mix(in srgb,var(--assistant-accent) 22%,transparent),inset 0 1px 0 rgba(255,255,255,.09)}}
      `}</style>
      <div className="pointer-events-none fixed left-1/2 bottom-32 md:bottom-16 z-[10020]">
        <div className={`relative overflow-hidden min-w-[320px] md:min-w-[420px] max-w-[90vw] rounded-3xl backdrop-blur-xl px-6 py-5 md:px-8 md:py-6 text-center ${classes.quickToast}`}
          style={{ transform:'translateX(-50%)', animation:'gamiToastIn .35s cubic-bezier(.22,.9,.28,1), gamiPulseGlow 1.6s ease-in-out infinite' }}>
          <span className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-white/10 blur-md" style={{ animation:'gamiShine 2.8s ease-in-out infinite' }} />
          <div className="mb-2 flex items-center justify-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${classes.quickToastAccentDot}`} />
            <span className={`text-[12px] md:text-[13px] font-semibold uppercase tracking-[0.24em] ${classes.quickToastLabel}`}>Progress</span>
          </div>
          <div className="text-[17px] md:text-[21px] font-semibold leading-tight" style={{ color: 'var(--assistant-text)' }}>{message}</div>
        </div>
      </div>
    </>
  );
}

const PROGRESS_LABELS: Record<DateMode | Exclude<TaskFilterTag, 'none'>, string> = {
  all: 'All progress',
  today: "Today's progress",
  week: "This week's progress",
  month: "This month's progress",
  range: 'Range progress',
  priority: 'High priority progress',
  someday: 'Someday progress',
  scheduled: 'Scheduled progress',
};

function QuickProgressBlock({
  progress,
  label,
  className = '',
}: {
  progress: { total: number; done: number; remaining: number; pct: number };
  label: string;
  className?: string;
}) {
  return (
    <div className={`px-1 py-2 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className={`break-words text-[15px] font-semibold ${classes.quickProgressLabel}`}>
          {label}
        </div>
        <div className={`shrink-0 text-[15px] font-semibold tabular-nums ${classes.quickProgressLabel}`}>
          {progress.done}/{progress.total}
        </div>
      </div>

      <div className={`mt-2 h-1.5 w-full rounded-full overflow-hidden ${classes.quickProgressBar}`}>
        <div
          className={`h-full rounded-full ${classes.quickProgressFill}`}
          style={{ width: `${Math.max(0, Math.min(100, Math.round(progress.pct * 100)))}%` }}
        />
      </div>
    </div>
  );
}

/* ===================== Actions Panel ===================== */
export function ActionsPanel({
  dateMode, setDateMode, showCompleted, setShowCompleted,
  hideSomeday, setHideSomeday,
  sortBy, setSortBy,
  taskFilter, setTaskFilter,
  focusDay, setFocusDay,
  onOpenRange,
}: {
  /** Opens the "Ranges" calendar popup (applying it switches dateMode to 'range') */
  onOpenRange: () => void;
  /** The day shown in single-day mode (dateMode 'today'), e.g. one picked in the mini calendar */
  focusDay: string; setFocusDay: (ymd: string) => void;
  dateMode: DateMode; setDateMode: (m: DateMode) => void;
  showCompleted: boolean; setShowCompleted: (v: boolean | ((p: boolean) => boolean)) => void;
  hideSomeday: boolean; setHideSomeday: (v: boolean | ((p: boolean) => boolean)) => void;
  sortBy: SortBy; setSortBy: (v: SortBy) => void;
  taskFilter: TaskFilterTag; setTaskFilter: (v: TaskFilterTag) => void;
  /** @deprecated layout is always chips now */
  chips?: boolean;
}) {
  const pill = (active: boolean) =>
    ['text-[13px] px-3 py-1.5 rounded-full transition-all whitespace-nowrap',
      active ? classes.quickFilterActive : classes.quickFilterInactive,
    ].join(' ');

  const selectDate = (mode: DateMode) => {
    setTaskFilter('none');
    setDateMode(mode);
    // "Today" always means today, even after picking another day in the mini calendar
    if (mode === 'today') setFocusDay(todayYMD());
  };
  // Single-day mode on another day (picked in the mini calendar) isn't "Today"
  const isDateChipOn = (mode: DateMode) =>
    taskFilter === 'none' && dateMode === mode && (mode !== 'today' || focusDay === todayYMD());

  const selectExtra = (tag: Exclude<TaskFilterTag, 'none'>) => {
    setTaskFilter(tag);
  };

  const dateFilters: { mode: DateMode; label: string }[] = [
    { mode: 'all', label: 'All' },
    { mode: 'today', label: 'Today' },
    { mode: 'week', label: 'This Week' },
    { mode: 'month', label: 'This Month' },
  ];

  const extraFilters: { tag: Exclude<TaskFilterTag, 'none'>; label: string }[] = [
    { tag: 'priority', label: 'High Priority' },
    { tag: 'someday', label: 'Someday' },
    { tag: 'scheduled', label: 'Scheduled' },
  ];

  return (
    <div className="space-y-4">
      {/* View by */}
      <div>
        <div className={`text-[14px] font-semibold mb-2 ${classes.primaryText}`}>View by</div>
        <div className="flex flex-wrap gap-1.5">
          {([['dueDate', 'Due Date'], ['createdAt', 'Created Date']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSortBy(value)}
              className={pill(sortBy === value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter by */}
      <div>
        <div className={`text-[14px] font-semibold mb-2 ${classes.primaryText}`}>Filter by</div>
        <div className="flex flex-wrap gap-1.5">
          {dateFilters.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => selectDate(mode)}
              className={pill(isDateChipOn(mode))}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={onOpenRange}
            className={pill(taskFilter === 'none' && dateMode === 'range')}
          >
            Ranges
          </button>
          {extraFilters.map(({ tag, label }) => (
            <button
              key={tag}
              type="button"
              onClick={() => selectExtra(tag)}
              className={pill(taskFilter === tag)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Options */}
      <div>
        <div className={`text-[14px] font-semibold mb-2 ${classes.primaryText}`}>Options</div>
        <div className="flex flex-col items-start gap-1.5">
          <button
            type="button"
            onClick={() => setShowCompleted(s => !s)}
            className={pill(!showCompleted)}
          >
            Hide Completed
          </button>
          <button
            type="button"
            onClick={() => setHideSomeday(s => !s)}
            className={pill(hideSomeday)}
          >
            Hide Someday
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===================== Main Component ===================== */

export type QuickProps = {
  onOpenPivot?: (detail: {
    word: string;
    blockId: string | null;
    origin: 'quick';
    listId?: string | null;
  }) => void;
};

export default function Quick(props: QuickProps = {}) {
  const { onOpenPivot } = props;

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [hydrated, setHydrated] = useState(false);

  const {
    dateMode, setDateMode,
    dateRange, setDateRange,
    showCompleted, setShowCompleted,
    hideSomeday, setHideSomeday,
    sortBy, setSortBy,
    taskFilter, setTaskFilter,
    searchQuery, setSearchQuery,
  } = useQuickFilters();
  const [showAllGroups] = useShowAllGroups();
  const [focusedList, setFocusedList] = useFocusedList();
  // While a keyword is typed the lists search everything, like the "All" chip
  // (all dates, no extra filter, collapsed lists opened)
  const searchTerm = searchQuery.trim().toLowerCase();
  const searching = searchTerm !== '';
  const viewTaskFilter: TaskFilterTag = searching ? 'none' : taskFilter;
  // Someday = tasks with no due date, whatever their creation date
  const viewDateMode: DateMode = searching || viewTaskFilter === 'someday' ? 'all' : dateMode;
  // "Hide Someday" never applies under the Someday filter itself (it would empty the view)
  const hidingSomeday = hideSomeday && !searching && viewTaskFilter !== 'someday';
  const passesTaskFilter = useCallback((b: Block) =>
    (!hidingSomeday || isValidDateYYYYMMDD(b.deadline)) && (
      viewTaskFilter === 'priority' ? Boolean(getTaskFlag(b))
      : viewTaskFilter === 'someday' ? !isValidDateYYYYMMDD(b.deadline)
      // Scheduled = only tasks with a due date
      : viewTaskFilter === 'scheduled' ? isValidDateYYYYMMDD(b.deadline)
      : true
    ), [hidingSomeday, viewTaskFilter]);
  const matchesSearch = (b: Block) => (b.text || '').toLowerCase().includes(searchTerm);
  const [focusDay, setFocusDay] = useState<string>(todayYMD());
  // New tasks only get a due date (the focused day) while viewing by Due Date, hiding
  // Someday or under Scheduled — otherwise they'd vanish right away — and never under Someday
  // Under Ranges the "focused day" is today when it's inside the range, else the range's first day
  const dueAnchor = dateMode === 'range' && taskFilter === 'none'
    ? (todayYMD() >= dateRange.from && todayYMD() <= dateRange.to ? todayYMD() : dateRange.from)
    : focusDay;
  const newTaskDue = (sortBy === 'dueDate' || hideSomeday || taskFilter === 'scheduled') && taskFilter !== 'someday' && isValidDateYYYYMMDD(dueAnchor) ? dueAnchor : undefined;
  const [rangeDialogOpen, setRangeDialogOpen] = useState(false);
  // "/" anywhere (outside a text field) jumps to the keyword search
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const applyRange = (range: DateRange) => {
    setDateRange(range);
    setTaskFilter('none');
    setDateMode('range');
    setRangeDialogOpen(false);
  };

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const drawerCloseTimerRef = useRef<number | null>(null);
  const closeDrawer = () => {
    if (!drawerOpen || drawerClosing) return;
    setDrawerClosing(true);
    drawerCloseTimerRef.current = window.setTimeout(() => {
      setDrawerOpen(false);
      setDrawerClosing(false);
    }, 220);
  };
  const [editingDateTaskId, setEditingDateTaskId] = useState<string | null>(null);

  const inputRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  const inlineDateRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const resizeTextarea = (el: HTMLTextAreaElement) => {
    el.style.height = '1px';
    el.style.height = el.scrollHeight + 'px';
  };

  useLayoutEffect(() => {
    Object.values(inputRefs.current).forEach(el => {
      if (el instanceof HTMLTextAreaElement) resizeTextarea(el);
    });
  });

  useEffect(() => {
    if (!editingDateTaskId) return;
    const input = inlineDateRefs.current[editingDateTaskId];
    if (!input) return;
    requestAnimationFrame(() => {
      input.focus();
      try {
        const picker = input as HTMLInputElement & { showPicker?: () => void };
        if (typeof picker.showPicker === 'function') picker.showPicker();
        else input.click();
      } catch {
        input.click();
      }
    });
  }, [editingDateTaskId]);
  const dragRef   = useRef<{ id: string } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const lastWrittenRef      = useRef<string>('');
  const applyingExternalRef = useRef(false);
  const armedDeleteListRef  = useRef<{ id: string; t: number } | null>(null);

  const audioCheckRef = useRef<HTMLAudioElement | null>(null);
  const audioDoneRef  = useRef<HTMLAudioElement | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const pulseTimerRef    = useRef<number | null>(null);
  const [armedWordKey, setArmedWordKey] = useState<string | null>(null);
  const armTimerRef      = useRef<number | null>(null);
  // A task's ⋮ menu (anchored to the button) and the modals it opens
  const [taskMenu, setTaskMenu] = useState<{ taskId: string; x: number; y: number } | null>(null);
  const closeTaskMenu = useCallback(() => setTaskMenu(null), []);
  const [noteModalTaskId, setNoteModalTaskId] = useState<string | null>(null);
  const [reminderModalTaskId, setReminderModalTaskId] = useState<string | null>(null);
  const [repeatModalTaskId, setRepeatModalTaskId] = useState<string | null>(null);
  const checkUndoRef = useRef<Array<Array<Pick<Block, 'id' | 'checked' | 'deadline' | 'isHidden' | 'doneDates'>>>>([]);
  const undoLastCheckRef = useRef<() => boolean>(() => false);
  useEffect(() => () => {
    if (armTimerRef.current) window.clearTimeout(armTimerRef.current);
  }, []);
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiTimerRef = useRef<number | null>(null);
  const [toastShow, setToastShow] = useState(false);
  const [toastMsg, setToastMsg]   = useState('');
  const toastTimerRef = useRef<number | null>(null);


  useEffect(() => {
    audioCheckRef.current = new Audio('/sounds/notif.mp3');
    audioDoneRef.current  = new Audio('/sounds/notif2.mp3');
    audioCheckRef.current.preload = 'auto';
    audioDoneRef.current.preload  = 'auto';
    return () => {
      if (pulseTimerRef.current)    window.clearTimeout(pulseTimerRef.current);
      if (confettiTimerRef.current) window.clearTimeout(confettiTimerRef.current);
      if (toastTimerRef.current)    window.clearTimeout(toastTimerRef.current);
      if (drawerCloseTimerRef.current) window.clearTimeout(drawerCloseTimerRef.current);
    };
  }, []);

  /* ── Derived state ── */
  const currentProjectIndex = useMemo(
    () => Math.max(0, projects.findIndex(p => p.project_id === selectedProjectId)),
    [projects, selectedProjectId],
  );
  const currentProject = projects[currentProjectIndex];
  const blocks: Block[]                    = currentProject?.blocks ?? moveUncToTop(ensureUncExists([]));
 const collapsed = useMemo<Record<string, boolean>>(
    () => currentProject?.quickCollapsed ?? {},
    [currentProject?.quickCollapsed],
  );
  const visibleLists = useMemo<Record<string, boolean>>(
    () => currentProject?.visibleLists ?? {},
    [currentProject?.visibleLists],
  );

  /* ── Setters de bloque / collapsed para el proyecto activo ── */
  const setCurrentBlocks = (nextFn: Block[] | ((prev: Block[]) => Block[])) => {
    setProjects(prev => {
      if (!prev.length) {
        const personal = makePersonalProject(
          typeof nextFn === 'function' ? nextFn([]) : nextFn, {}, {},
        );
        setSelectedProjectId(personal.project_id);
        return [personal];
      }
      const idx     = prev.findIndex(p => p.project_id === selectedProjectId);
      const safeIdx = idx >= 0 ? idx : 0;
      const next    = prev.map(p => ({ ...p }));
      const old     = next[safeIdx].blocks ?? moveUncToTop(ensureUncExists([]));
      let newBlocks = typeof nextFn === 'function' ? nextFn(old) : nextFn;
      newBlocks     = sortBlocksByOrder(moveUncToTop(ensureUncExists(newBlocks)));
      next[safeIdx] = { ...next[safeIdx], blocks: newBlocks };
      return next;
    });
  };

  const setCurrentCollapsed = (nextFn: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => {
    setProjects(prev => {
      if (!prev.length) {
        const qc      = typeof nextFn === 'function' ? nextFn({}) : nextFn;
        const personal = makePersonalProject(moveUncToTop(ensureUncExists([])), {}, qc);
        setSelectedProjectId(personal.project_id);
        return [personal];
      }
      const idx     = prev.findIndex(p => p.project_id === selectedProjectId);
      const safeIdx = idx >= 0 ? idx : 0;
      const next    = prev.map(p => ({ ...p }));
      const old     = next[safeIdx].quickCollapsed ?? {};
      const newCol  = typeof nextFn === 'function' ? nextFn(old) : nextFn;
      next[safeIdx] = { ...next[safeIdx], quickCollapsed: newCol };
      return next;
    });
  };

  /* ── Hydration ── */
  useEffect(() => {
    try {
      const payload = readProjectsLS();
      if (payload) {
        // Empty tasks left behind (abandoned elsewhere, or from older versions) are dropped on load;
        // lastWrittenRef keeps the raw version so the persist effect writes the cleaned one back
        const projects = payload.projects.map(p => (p.blocks ? { ...p, blocks: cleanupEmptyTasks(p.blocks) } : p));
        setProjects(projects);
        setSelectedProjectId(payload.selectedProjectId || payload.projects[0]?.project_id || '');
        lastWrittenRef.current = JSON.stringify({ projects: payload.projects, selectedProjectId: payload.selectedProjectId });
        setHydrated(true);
        return;
      }
      const personal = makePersonalProject();
      setProjects([personal]);
      setSelectedProjectId(personal.project_id);
      const boot = { projects: [personal], selectedProjectId: personal.project_id };
      lastWrittenRef.current = JSON.stringify(boot);
      writeProjectsLS(boot);
      setHydrated(true);
    } catch {
      const personal = makePersonalProject();
      setProjects([personal]);
      setSelectedProjectId(personal.project_id);
      const boot = { projects: [personal], selectedProjectId: personal.project_id };
      lastWrittenRef.current = JSON.stringify(boot);
      writeProjectsLS(boot);
      setHydrated(true);
    }
  }, []);

  /* ── Sync desde otras pestañas ── */
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
    const handleStorage = (e: StorageEvent) => { if (e.key === LS_KEY_V2) applyFromLS(); };
    window.addEventListener('youtask_projects_updated', applyFromLS);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('youtask_projects_updated', applyFromLS);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  /* ── Persist on change ── */
  useEffect(() => {
    if (!hydrated || applyingExternalRef.current) return;
    try {
      const payload: ProjectsPayload = { projects, selectedProjectId };
      const nextStr = JSON.stringify(payload);
      if (nextStr === lastWrittenRef.current) return;
      lastWrittenRef.current = nextStr;
      writeProjectsLS(payload);
    } catch {}
  }, [projects, selectedProjectId, hydrated]);

  /* ── Focus helpers ── */
  const focusBlock = (id: string, caretToEnd = false) => {
    requestAnimationFrame(() => {
      const el = inputRefs.current[id];
      if (!el) return;
      el.focus();
      if (caretToEnd) { const len = el.value.length; el.setSelectionRange(len, len); }
      else el.setSelectionRange(0, 0);
    });
  };

  /* ── Date navigation ── */
  // Ranges step by their own length (a 10-day range moves 10 days)
  const shiftRange = (dir: 1 | -1) => {
    const step = daysInRange(dateRange) * dir;
    setDateRange({ from: addDaysYMD(dateRange.from, step), to: addDaysYMD(dateRange.to, step) });
  };
  const navigatePrev = () => {
    if (dateMode === 'range') shiftRange(-1);
    else if (dateMode === 'today') setFocusDay(d => addDaysYMD(d, -1));
    else if (dateMode === 'week') setFocusDay(d => addDaysYMD(d, -7));
    else if (dateMode === 'month') setFocusDay(d => {
      if (!isValidDateYYYYMMDD(d)) return d;
      const [y, m] = d.split('-').map(Number);
      const prev = m === 1 ? new Date(y - 1, 11, 1) : new Date(y, m - 2, 1);
      return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`;
    });
  };
  const navigateNext = () => {
    if (dateMode === 'range') shiftRange(1);
    else if (dateMode === 'today') setFocusDay(d => addDaysYMD(d, +1));
    else if (dateMode === 'week') setFocusDay(d => addDaysYMD(d, +7));
    else if (dateMode === 'month') setFocusDay(d => {
      if (!isValidDateYYYYMMDD(d)) return d;
      const [y, m] = d.split('-').map(Number);
      const next = m === 12 ? new Date(y + 1, 0, 1) : new Date(y, m, 1);
      return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
    });
  };
  const navDisabled = dateMode === 'all';

  /* ── Gamification ── */
  const gamificationLines = useMemo(() => [
    '🔥 Good work, keep it up','💥 Nice one','🚀 Momentum','✅ One more done',
    '🔥 You\'re on fire','📈 That\'s progress','💪 Strong move','🏆 Keep stacking wins',
    '✨ Another step forward','🧼 Clean work','🎯 Locked in','⚡ Winning rhythm',
    '🙌 Great job','🧠 Sharp move','💣 Boom, done','🌟 That was solid',
    '🔥 Keep the streak alive','👏 Love that energy','🚀 Let\'s go','💪 You got this',
  ], []);

  const showGamificationToast = () => {
    const msg = gamificationLines[Math.floor(Math.random() * gamificationLines.length)];
    setToastMsg(msg); setToastShow(true);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastShow(false), 4500);
  };

  /* ── Memoized view data (via datacenter helpers) ── */
  const hiddenMap = useMemo(
    () => buildHiddenMap(blocks, { collapsed: searching ? {} : collapsed, showHidden: false, dateMode: viewDateMode, focusDay, sortBy, range: dateRange }),

    [blocks, collapsed, searching, viewDateMode, focusDay, sortBy, dateRange],
  );
  // The focused list (clicked in the Sidebar) when it belongs to this group and still exists
  const focusList = focusedList && focusedList.projectId === currentProject?.project_id
    ? blocks.find(b => b.id === focusedList.listId && b.indent === 0) ?? null
    : null;
  // "Show all" shows hidden lists too; a focused list hides every other list
  const hiddenByListMap = useMemo(
    () => (showAllGroups
      ? {}
      : focusList
        ? buildListVisibilityHiddenMap(blocks, onlyListVisible(blocks, focusList.id))
        : buildListVisibilityHiddenMap(blocks, visibleLists)),
    [blocks, visibleLists, showAllGroups, focusList],
  );
  // Uncategorized tasks only show with the whole group, not under a focused list
  const hideUncategorized = !showAllGroups && focusList !== null;

  /** Progress block — scoped to tasks currently visible with active filters (every group under "Show all") */
  const progress = useMemo(() => {
    const visibleIn = (pBlocks: Block[], pHidden: Record<string, boolean>) => {
      // A focused list leaves Uncategorized out, so its tasks don't count either
      const uncIds = hideUncategorized ? new Set(pBlocks.filter(isUncTitleBlock).map(b => b.id)) : null;
      return pBlocks.filter(b =>
      b.indent > 0 &&
      !b.section &&
      !(uncIds && b.parentId && uncIds.has(b.parentId)) &&
      b.archived !== true &&
      (showCompleted || b.checked !== true) &&
      !pHidden[b.id] &&
      passesTaskFilter(b),
      );
    };
    const visibleTasks = showAllGroups
      ? projects.flatMap(p => p.project_id === currentProject?.project_id
          ? visibleIn(blocks, hiddenMap)
          : visibleIn(p.blocks ?? [], buildHiddenMap(p.blocks ?? [], { collapsed: searching ? {} : p.quickCollapsed ?? {}, showHidden: false, dateMode: viewDateMode, focusDay, sortBy, range: dateRange })))
      : visibleIn(blocks, { ...hiddenMap, ...hiddenByListMap });
    const total = visibleTasks.length;
    const done = visibleTasks.filter(t => t.checked === true).length;
    const remaining = Math.max(0, total - done);
    const pct = total > 0 ? done / total : 0;
    return { total, done, remaining, pct };
  }, [blocks, hiddenMap, hiddenByListMap, showCompleted, passesTaskFilter, hideUncategorized, showAllGroups, projects, currentProject?.project_id, searching, viewDateMode, focusDay, sortBy, dateRange]);

  const isBrandNewEmpty = useMemo(
    () => blocks.length === 1 && isUncTitleBlock(blocks[0]),
    [blocks],
  );

  /* ── First-list wizard: opens whenever the whole workspace has no tasks ── */
  const [projectsHydrated, setProjectsHydrated] = useState(false);
  const [wizardClosed, setWizardClosed] = useState(true);
  useEffect(() => {
    setWizardClosed(wizardClosedThisLoad.has(getCurrentUid()));
    const check = () => setProjectsHydrated(isProjectsHydrated());
    const onClosedElsewhere = () => setWizardClosed(true);
    check();
    window.addEventListener(PROJECTS_HYDRATED_EVENT, check);
    window.addEventListener(WIZARD_CLOSED_EVENT, onClosedElsewhere);
    return () => {
      window.removeEventListener(PROJECTS_HYDRATED_EVENT, check);
      window.removeEventListener(WIZARD_CLOSED_EVENT, onClosedElsewhere);
    };
  }, []);

  // Across every group, not just the selected one — someone with tasks in another group isn't new.
  const workspaceHasNoTasks = useMemo(
    () => !projects.some(p =>
      (p.blocks ?? []).some(b => b.indent > 0 && b.archived !== true && (b.text || '').trim() !== ''),
    ),
    [projects],
  );

  const closeWizard = () => {
    setWizardClosed(true);
    wizardClosedThisLoad.add(getCurrentUid());
    window.dispatchEvent(new Event(WIZARD_CLOSED_EVENT));
  };

  const handleWizardFinish = (listName: string, taskTexts: string[]) => {
    let newListId = '';
    setCurrentBlocks(prev => {
      // createList seeds the list with one empty task — fill it with the first one
      const created = createListArr(prev, listName, { focusDay: newTaskDue });
      newListId = created.newListId;
      let next = updateBlockArr(created.blocks, created.newTaskId, { text: taskTexts[0] });
      for (const text of taskTexts.slice(1)) {
        next = addTaskUnderListArr(next, created.newListId, { focusDay: newTaskDue, text }).blocks;
      }
      return next;
    });
    setCurrentCollapsed(prev => ({ ...prev, [newListId]: false }));
  };

  // Every named list, in every group (the selected group first) — for the New task picker
  const taskDialogLists = useMemo<NewTaskListOption[]>(() => {
    const ordered = [
      ...projects.filter(p => p.project_id === currentProject?.project_id),
      ...projects.filter(p => p.project_id !== currentProject?.project_id),
    ];
    return ordered.flatMap(p => (p.blocks ?? [])
      .filter(b => b.indent === 0 && !isUncTitleBlock(b) && b.archived !== true && (b.text || '').trim())
      .sort((a, b) => a.order - b.order)
      .map(b => ({ projectId: p.project_id, projectTitle: p.title, listId: b.id, title: (b.text || '').trim() })));
  }, [projects, currentProject?.project_id]);

  /* ── Block action wrappers ── */
  const handleUpdateBlock = (id: string, patch: Partial<Block>) => {
    const isChecking = typeof patch.checked === 'boolean' && patch.checked === true;

    // Remember what a check/uncheck changed (incl. the parent/subtask cascade) for Ctrl+Z
    if (typeof patch.checked === 'boolean') {
      const before = new Map(blocks.map(b => [b.id, b]));
      const changed = updateBlockArr(blocks, id, patch, focusDay)
        // A recurring task stays unchecked — its completion shows up as new doneDates
        .filter(b => before.has(b.id) && (Boolean(before.get(b.id)!.checked) !== Boolean(b.checked) || before.get(b.id)!.doneDates !== b.doneDates))
        .map(b => {
          const old = before.get(b.id)!;
          return { id: b.id, checked: old.checked, deadline: old.deadline, isHidden: old.isHidden, doneDates: old.doneDates };
        });
      if (changed.length) {
        checkUndoRef.current.push(changed);
        if (checkUndoRef.current.length > CHECK_UNDO_LIMIT) checkUndoRef.current.shift();
      }
    }

    const willCompleteDay = isChecking && dateMode === 'today' && (() => {
      const tasksForDay = blocks.filter(
        b => b.indent > 0 && b.archived !== true && b.isHidden !== true
          && isValidDateYYYYMMDD(b.deadline) && b.deadline === focusDay,
      );
      const remaining = tasksForDay.filter(t => t.id !== id && t.checked !== true);
      return tasksForDay.length > 0 && remaining.length === 0;
    })();

    if (isChecking) {
      setPulseId(id);
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = window.setTimeout(() => setPulseId(null), 520);
      if (!willCompleteDay) {
        const a = audioCheckRef.current;
        if (a) { try { a.currentTime = 0; a.play(); } catch {} }
      }
      showGamificationToast();
    }

    // Changing a due date or flag can push a task out of the current filters (e.g. clearing
    // the due date while viewing by due date) — say so, or it looks deleted
    if ('deadline' in patch || 'flag' in patch) {
      const task = blocks.find(b => b.id === id);
      if (task && task.indent > 0 && (task.text || '').trim() && whyHidden(blocks, id, currentProject?.project_id).length === 0) {
        const reasons = whyHidden(updateBlockArr(blocks, id, patch, focusDay), id, currentProject?.project_id);
        if (reasons.length) {
          setHiddenNotice({ text: task.text.trim(), projectId: currentProject?.project_id, reasons, title: "Task moved out of view — it's not deleted" });
        }
      }
    }

    setCurrentBlocks(prev => {
      const next = updateBlockArr(prev, id, patch, focusDay);

      if (isChecking && dateMode === 'today') {
        const tasksForDay = next.filter(
          b => b.indent > 0 && b.archived !== true && b.isHidden !== true
            && isValidDateYYYYMMDD(b.deadline) && b.deadline === focusDay,
        );
        if (tasksForDay.length > 0 && tasksForDay.every(t => t.checked === true)) {
          const a2 = audioDoneRef.current;
          if (a2) { try { a2.currentTime = 0; a2.play(); } catch {} }
          setShowConfetti(true);
          if (confettiTimerRef.current) window.clearTimeout(confettiTimerRef.current);
          confettiTimerRef.current = window.setTimeout(() => setShowConfetti(false), 2600);
        }
      }
      return next;
    });
  };

  // Ctrl/Cmd+Z outside a text field restores the tasks the last check toggled.
  // (Quick is mounted twice; only the instance that recorded the check has an entry.)
  undoLastCheckRef.current = () => {
    const entry = checkUndoRef.current.pop();
    if (!entry) return false;
    const byId = new Map(entry.map(e => [e.id, e]));
    setCurrentBlocks(prev => prev.map(b => {
      const e = byId.get(b.id);
      // Undoing a recurring completion keeps doneDates as a (possibly empty) list, so the server drops that row
      return e ? { ...b, checked: e.checked, deadline: e.deadline, isHidden: e.isHidden, ...(b.doneDates ? { doneDates: e.doneDates ?? [] } : {}) } : b;
    }));
    return true;
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.closest('input, textarea, select'))) return;
      if (undoLastCheckRef.current()) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleInsertAfter = (id: string, block: Block) => {
    setCurrentBlocks(prev => insertBlockAfter(prev, id, block));
    focusBlock(block.id, false);
  };

  const handleRemoveBlock = (id: string) => {
    setCurrentBlocks(prev => {
      if (prev.length === 1) return prev;
      const i = prev.findIndex(b => b.id === id);
      if (i < 0) return prev;
      if (prev[i]?.indent === 0) setCurrentCollapsed(c => { const { [id]: _omit, ...rest } = c; void _omit; return rest; });
      const next = removeBlock(prev, id);
      const target = next[Math.max(0, i - 1)];
      if (target) focusBlock(target.id, true);
      return next;
    });
  };

  // Two clicks to delete: the first arms the button (turns red) for a moment,
  // the second deletes the task and its subtasks
  // One click deletes the task (and its subtasks)
  const deleteTask = (taskId: string) => {
    setCurrentBlocks(prev => removeTaskWithSubtasks(prev, taskId));
  };

  const handleConfirmDeleteList = (listId: string) => {
    setDeleteListConfirmId(null);
    armedDeleteListRef.current = null;
    setCurrentBlocks(prev => {
      const i = prev.findIndex(b => b.id === listId);
      const next = removeListAndChildren(prev, listId);
      if (next === prev) return prev;
      setCurrentCollapsed(c => { const { [listId]: _omit, ...rest } = c; void _omit; return rest; });
      const { uncIndex } = findUncRange(next);
      const target = next[Math.max(0, uncIndex + 1)] ?? next[0];
      void i;
      if (target) focusBlock(target.id, true);
      return next;
    });
  };

  // Rescue the list's unchecked tasks into another list (any group), then delete it
  const handleMoveAndDeleteList = (listId: string, toProjectId: string, toListId: string) => {
    const fromProjectId = currentProject?.project_id;
    if (!fromProjectId) return;
    setProjects(prev => moveOpenTasksToList(prev, fromProjectId, [listId], toProjectId, toListId));
    handleConfirmDeleteList(listId);
  };

  const handleAddTaskUnderList =(listId: string, deadlineOverride?: string) => {
    // Id picked up front: an updater may run twice (StrictMode) or later, so an id captured
    // inside it can miss the task that's actually rendered — and the focus with it
    const newTaskId = uid();
    setCurrentBlocks(prev => addTaskUnderListArr(prev, listId, {
      deadline: deadlineOverride,
      focusDay: newTaskDue,
      id: newTaskId,
    }).blocks);
    setCurrentCollapsed(prev => ({ ...prev, [listId]: false }));
    requestAnimationFrame(() => {
      const el = inputRefs.current[newTaskId];
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus(); el.setSelectionRange(0, 0);
    });
  };

  // New sibling right below a task (after its subtasks), so tasks can be added mid-list
  const handleAddTaskAfter = (taskId: string) => {
    const newTaskId = uid();
    setCurrentBlocks(prev => {
      const i = prev.findIndex(b => b.id === taskId);
      if (i < 0) return prev;
      const task = prev[i];
      let end = i;
      while (end + 1 < prev.length && prev[end + 1].indent > task.indent) end++;
      return insertBlockAfter(
        prev,
        prev[end].id,
        makeTaskBlock({ id: newTaskId, indent: task.indent, parentId: task.parentId }, newTaskDue),
      );
    });
    focusBlock(newTaskId, false);
  };

  const handleCreateBlankList = () => {
    const newListId = uid();
    setCurrentBlocks(prev => createBlankList(prev, { focusDay: newTaskDue, listId: newListId }).blocks);
    setCurrentCollapsed(prev => ({ ...prev, [newListId]: false }));
    // The title input only renders while it's being edited
    setEditingListTitleId(newListId);
    requestAnimationFrame(() => {
      const el = inputRefs.current[newListId];
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
      el.setSelectionRange(0, 0);
    });
  };

  const toggleList = (listId: string) =>
    setCurrentCollapsed(prev => ({ ...prev, [listId]: !prev[listId] }));

  /* ── Keyboard handler ── */
const handleKey = (
  e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  b: Block,
) => {
  // Enter / Ctrl+Enter on an empty task or untitled list does nothing — no empty rows
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault();
    if ((b.text || '').trim()) handleCreateBlankList();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (!(b.text || '').trim()) return;
    if (b.indent === 0) {
      const reuseId = findFirstEmptyTaskUnderList(blocks, b.id);
      if (reuseId) {
        setCurrentCollapsed(prev => ({ ...prev, [b.id]: false }));
        focusBlock(reuseId, false);
        return;
      }
      handleAddTaskUnderList(b.id, newTaskDue);
    } else {
      handleInsertAfter(
        b.id,
        makeTaskBlock({ id: uid(), indent: b.indent }, newTaskDue),
      );
    }
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    if (b.indent === 0) return;
    const siblings = blocks
      .filter(s => s.indent > 0 && s.parentId === b.parentId)
      .sort((s1, s2) => s1.order - s2.order);
    const idx = siblings.findIndex(s => s.id === b.id);
    if (e.shiftKey) {
      const nextIndent = Math.max(1, b.indent - 1);
      if (nextIndent !== b.indent) handleUpdateBlock(b.id, { indent: nextIndent });
      return;
    }
    // Indent: nest under the task directly above it in this list.
    const prev = idx > 0 ? siblings[idx - 1] : null;
    if (!prev) return;
    const MAX_INDENT = 6;
    const nextIndent = Math.min(MAX_INDENT, prev.indent + 1);
    if (nextIndent !== b.indent) handleUpdateBlock(b.id, { indent: nextIndent });
    return;
  }
  if (e.key === 'Backspace' && b.text === '') {
    if (b.indent === 0) {
      e.preventDefault(); e.stopPropagation();
      if (isUncTitleBlock(b)) {
        armedDeleteListRef.current = null;
        return;
      }
      const now = Date.now(); const armed = armedDeleteListRef.current;
      if (armed?.id === b.id && now - armed.t < 800) {
        armedDeleteListRef.current = null;
        setDeleteListConfirmId(b.id);
        return;
      }
      armedDeleteListRef.current = { id: b.id, t: now };
      return;
    }
    e.preventDefault(); e.stopPropagation();
    handleRemoveBlock(b.id);
  }
};

  /* ── Drag & drop ── */
  const onDragStartRow = (e: React.DragEvent, id: string) => {
    dragRef.current = { id };
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
    dragRef.current = null; setDragOverId(null);
    if (!drag || drag.id === overId) return;

    setCurrentBlocks(prev => {
      const dragged = prev.find(b => b.id === drag.id);
      const target  = prev.find(b => b.id === overId);
      if (!dragged || !target) return prev;

      // List-header drag: reorder among root blocks
      if (dragged.indent === 0) {
        const roots = prev
          .filter(b => b.indent === 0 && b.id !== drag.id)
          .sort((a, b) => a.order - b.order);
        const insertIdx = roots.findIndex(b => b.id === overId);
        roots.splice(insertIdx < 0 ? roots.length : insertIdx + 1, 0, dragged);
        return prev.map(b => {
          const i = roots.findIndex(r => r.id === b.id);
          return i >= 0 ? { ...b, order: i } : b;
        });
      }

      // Task drag: determine new parent from drop target
      const newParentId = target.indent === 0 ? target.id : target.parentId;

      // All siblings in the new parent (excluding dragged)
      const siblings = prev
        .filter(b => b.parentId === newParentId && b.id !== drag.id && b.indent > 0)
        .sort((a, b) => a.order - b.order);

      // Use drag direction to decide insert position so both forward and backward moves work.
      // Dropped on list header → insert at the top.
      let insertIdx: number;
      if (target.indent === 0) {
        insertIdx = 0;
      } else {
        const targetIdx = siblings.findIndex(s => s.id === target.id);
        insertIdx = dragged.order > target.order
          ? targetIdx          // dragging up → insert before target
          : targetIdx + 1;     // dragging down → insert after target
      }
      siblings.splice(insertIdx, 0, dragged);

      return prev.map(b => {
        const i = siblings.findIndex(s => s.id === b.id);
        if (i < 0) return b;
        return { ...b, order: i, parentId: newParentId };
      });
    });
  };
  const onDragEndRow = () => { dragRef.current = null; setDragOverId(null); };

  /* ── New task dialog ── */
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [deleteListConfirmId, setDeleteListConfirmId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingListTitleId, setEditingListTitleId] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const typingAny = editingTaskId !== null || editingListTitleId !== null || editingSectionId !== null;

  /* ── Sections: titled dividers among a list's tasks (Agenda-only, never tasks) ── */
  // The header's two-line button turns the list's "Task…" slots into "Section…" slots,
  // so a section can be placed anywhere among the tasks
  const [sectionModeListId, setSectionModeListId] = useState<string | null>(null);
  const toggleSectionMode = (listId: string) => {
    setSectionModeListId(prev => (prev === listId ? null : listId));
    setCurrentCollapsed(prev => ({ ...prev, [listId]: false }));
  };
  useEffect(() => {
    if (!sectionModeListId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSectionModeListId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sectionModeListId]);

  // A new section right after `afterId` (the list itself = top of the list; a task = after its subtasks)
  const handleInsertSection = (listId: string, afterId: string) => {
    const sectionId = uid();
    setCurrentBlocks(prev => {
      const i = prev.findIndex(b => b.id === afterId);
      if (i < 0) return prev;
      let end = i;
      if (afterId !== listId) {
        while (end + 1 < prev.length && prev[end + 1].indent > prev[i].indent) end++;
      }
      return insertBlockAfter(prev, prev[end].id, {
        id: sectionId, text: '', indent: 1, parentId: listId, order: 0, section: true, createdAt: todayYMD(),
      });
    });
    setSectionModeListId(null);
    setEditingSectionId(sectionId);
    requestAnimationFrame(() => inputRefs.current[sectionId]?.focus());
  };

  // Leaving a section without a title drops it
  const handleSectionBlur = (id: string) => {
    setEditingSectionId(prev => (prev === id ? null : prev));
    setCurrentBlocks(prev => {
      const s = prev.find(b => b.id === id);
      return s && !(s.text || '').trim() ? prev.filter(b => b.id !== id) : prev;
    });
  };

  const handleSectionKey = (e: React.KeyboardEvent<HTMLInputElement>, s: Block) => {
    if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!(s.text || '').trim()) return;
    // Enter starts the section's first task right under it
    setEditingSectionId(null);
    const newTaskId = uid();
    setCurrentBlocks(prev => insertBlockAfter(prev, s.id, makeTaskBlock({ id: newTaskId, indent: 1, parentId: s.parentId }, newTaskDue)));
    focusBlock(newTaskId, false);
  };

  // Empty tasks are never kept: leaving one without text drops it (unless it holds subtasks)
  const handleTaskBlur = (id: string) => {
    setEditingTaskId(prev => (prev === id ? null : prev));
    setCurrentBlocks(prev => {
      const i = prev.findIndex(b => b.id === id);
      if (i < 0 || prev[i].indent === 0 || (prev[i].text || '').trim()) return prev;
      if (prev[i + 1] && prev[i + 1].indent > prev[i].indent) return prev;
      return prev.filter(b => b.id !== id);
    });
  };

  // Same for lists: leaving an untitled list with no written tasks drops it
  const handleListTitleBlur = (id: string) => {
    setEditingListTitleId(prev => (prev === id ? null : prev));
    setCurrentBlocks(prev => {
      const i = prev.findIndex(b => b.id === id);
      if (i < 0 || (prev[i].text || '').trim()) return prev;
      const hasWrittenTask = prev.some(b => b.parentId === id && b.indent > 0 && (b.text || '').trim());
      return hasWrittenTask ? prev : removeListAndChildren(prev, id);
    });
  };

  // The task arrives with its text, so nothing empty is ever created
  /** The active filters that keep a task out of view — empty when it shows. */
  const whyHidden = (pBlocks: Block[], taskId: string, projectId: string | undefined): HiddenTaskReason[] => {
    const task = pBlocks.find(b => b.id === taskId);
    if (!task) return [];
    const reasons: HiddenTaskReason[] = [];
    const otherGroup = !showAllGroups && projectId !== currentProject?.project_id;
    if (otherGroup) {
      const title = projects.find(p => p.project_id === projectId)?.title ?? 'another group';
      reasons.push({ key: 'group', label: `Group: ${currentProject?.title ?? ''}`, detail: `It went to ${title}. Switch to that group to see it.` });
    } else if (!showAllGroups && focusList && task.parentId !== focusList.id) {
      reasons.push({ key: 'list', label: `List: ${(focusList.text || '').trim() || 'List'}`, detail: 'Only this list is showing.' });
    }
    if (searching) {
      const list = pBlocks.find(b => b.id === task.parentId);
      const listMatches = !!list && !isUncTitleBlock(list) && matchesSearch(list);
      if (!listMatches && !matchesSearch(task)) {
        reasons.push({ key: 'search', label: `Search: “${searchQuery.trim()}”`, detail: "The task doesn't contain these words." });
      }
    }
    const hasDue = isValidDateYYYYMMDD(task.deadline);
    if (viewTaskFilter === 'priority' && !getTaskFlag(task)) {
      reasons.push({ key: 'tag', label: 'Priority filter', detail: 'New tasks have no flag yet.' });
    } else if (viewTaskFilter === 'someday' && hasDue) {
      reasons.push({ key: 'tag', label: 'Someday filter', detail: 'The task has a due date.' });
    } else if (viewTaskFilter === 'scheduled' && !hasDue) {
      reasons.push({ key: 'tag', label: 'Scheduled filter', detail: 'The task has no due date.' });
    }
    if (hidingSomeday && !hasDue) {
      reasons.push({ key: 'someday', label: 'Hide Someday', detail: 'The task has no due date.' });
    }
    const dateHidden = buildHiddenMap(pBlocks, { collapsed: {}, showHidden: false, dateMode: viewDateMode, focusDay, sortBy, range: dateRange })[taskId];
    if (dateHidden) {
      const view = viewDateMode === 'today' ? (focusDay === todayYMD() ? 'Today' : formatPill(focusDay))
        : viewDateMode === 'week' ? `Week ${getWeekRangeLabel(focusDay)}`
        : viewDateMode === 'month' ? `Month ${getMonthRangeLabel(focusDay)}`
        : `Range ${getRangeLabel(dateRange)}`;
      reasons.push({
        key: 'date',
        label: `Dates: ${view}`,
        detail: sortBy === 'createdAt' ? 'The task was created outside these dates.'
          : hasDue ? 'Its due date is outside these dates.'
          : 'It has no due date, so it only shows under All dates.',
      });
    }
    return reasons;
  };

  const [hiddenNotice, setHiddenNoticeState] = useState<{ text: string; projectId?: string; reasons: HiddenTaskReason[]; title?: string } | null>(null);
  // Opening is skipped once the user ticked "Don't show this again"
  const setHiddenNotice = (notice: typeof hiddenNotice) => {
    if (notice && isHiddenTaskNoticeMuted()) return;
    setHiddenNoticeState(notice);
  };
  const turnOffFilters = (keys: string[], projectId?: string) => {
    for (const key of keys) {
      if (key === 'group' && projectId) setSelectedProjectId(projectId);
      if (key === 'list') setFocusedList(null);
      if (key === 'search') setSearchQuery('');
      if (key === 'tag') setTaskFilter('none');
      if (key === 'someday') setHideSomeday(false);
      if (key === 'date') setDateMode('all');
    }
  };

  const handleDialogAddTask = (text: string, target: NewTaskTarget) => {
    setTaskDialogOpen(false);
    // Ids up front, so the result can be checked against the filters before state updates
    const taskId = uid();
    // A task the filters would hide gets a heads-up naming the filters in the way
    const warnIfHidden = (nextBlocks: Block[], projectId?: string) => {
      const reasons = whyHidden(nextBlocks, taskId, projectId);
      if (reasons.length) setHiddenNotice({ text, projectId, reasons });
    };
    if (target.kind === 'new') {
      // New list in the selected group; createList seeds one task — fill it
      const listId = uid();
      const create = (prev: Block[]) => {
        const created = createListArr(prev, target.newListName, { focusDay: newTaskDue, listId, taskId });
        return { listId: created.newListId, blocks: updateBlockArr(created.blocks, created.newTaskId, { text }) };
      };
      const preview = create(blocks);
      setCurrentBlocks(prev => create(prev).blocks);
      setCurrentCollapsed(prev => ({ ...prev, [preview.listId]: false }));
      warnIfHidden(preview.blocks, currentProject?.project_id);
      return;
    }
    const add = (blocks: Block[]) =>
      sortBlocksByOrder(addTaskUnderListArr(blocks, target.listId, { focusDay: newTaskDue, text, id: taskId }).blocks);
    if (target.projectId === currentProject?.project_id) {
      setCurrentBlocks(add);
      setCurrentCollapsed(prev => ({ ...prev, [target.listId]: false }));
      warnIfHidden(add(blocks), target.projectId);
    } else {
      setProjects(prev => prev.map(p => (
        p.project_id === target.projectId
          ? { ...p, blocks: add(p.blocks ?? []), quickCollapsed: { ...(p.quickCollapsed ?? {}), [target.listId]: false } }
          : p
      )));
      warnIfHidden(add(projects.find(p => p.project_id === target.projectId)?.blocks ?? []), target.projectId);
    }
  };

  const openNewTaskDialog = () => setTaskDialogOpen(true);


  /* ── Text measurement ── */
  let __textMeasureCanvas: HTMLCanvasElement | null = null;
  function measureTextWidth(text: string, font: string) {
    if (!__textMeasureCanvas) __textMeasureCanvas = document.createElement('canvas');
    const ctx = __textMeasureCanvas.getContext('2d');
    if (!ctx) return text.length * 9;
    ctx.font = font; return ctx.measureText(text).width;
  }
  function inputWidthPx(text: string) {
    const safe = text || '   ';
    const font = '14px ui-sans-serif, system-ui, -apple-system, Segoe UI';
    const width = measureTextWidth(safe, font);
    return Math.max(60, width + 8 + Math.floor(safe.length * 1.1));
  }

  const isClickableWord = (token: string) => {
    const core = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (core.length < 2) return false;
    if (BANNED_SEARCH_WORDS.has(core.toLowerCase())) return false;
    return /[\p{L}]/u.test(core);
  };

  const openPivotForWord = (blockId: string, token: string) => {
    const word = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim();
    if (!isClickableWord(word)) return;
    onOpenPivot?.({ word, blockId, origin: 'quick' });
  };

  const openPivotForList = (list: Block) => {
    if (list.indent !== 0) return;
    if (isUncTitleBlock(list)) return;
    const title = (list.text || '').trim() || 'List';
    onOpenPivot?.({ word: title, blockId: list.id, listId: list.id, origin: 'quick' });
  };

  // A word only turns into a Search link after resting the pointer on it for
  // WORD_ARM_MS; until then a click edits the task like anywhere else on the text.
  const WORD_ARM_MS = 1000;
  const armWord = (key: string) => {
    if (armTimerRef.current) window.clearTimeout(armTimerRef.current);
    armTimerRef.current = window.setTimeout(() => {
      armTimerRef.current = null;
      setArmedWordKey(key);
    }, WORD_ARM_MS);
  };
  const disarmWord = () => {
    if (armTimerRef.current) { window.clearTimeout(armTimerRef.current); armTimerRef.current = null; }
    setArmedWordKey(null);
  };

  const renderTaskTextWithWordHover = (b: Block) => {
    const isEditing = editingTaskId === b.id;
    const tokens = b.text.split(/(\s+)/);
    return (
      <div className="relative flex-1 min-w-0">
        <textarea
          data-youtask-block={b.id}
          ref={el => void (inputRefs.current[b.id] = el)}
          value={b.text}
          placeholder="Task…"
          onChange={e => handleUpdateBlock(b.id, { text: e.target.value })}
          onKeyDown={e => handleKey(e, b)}
          onInput={e => resizeTextarea(e.currentTarget)}
          onFocus={() => setEditingTaskId(b.id)}
          onBlur={() => handleTaskBlur(b.id)}
          className={[
            // block: an inline-block textarea sits on the text baseline and gains a few px
            // below it, which made the row (items-center) shift the text up while editing
            'block m-0 border-0 bg-transparent outline-none p-0 text-[14px] md:text-sm resize-none overflow-hidden w-full min-w-0 transition-opacity duration-150',
            isEditing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none absolute inset-0',
          ].join(' ')}
          style={{
            lineHeight: '1.45',
            minHeight: '1.45em',
            color: b.checked ? 'var(--assistant-text-faint)' : 'var(--assistant-text-soft)',
          }}
        />

        {!isEditing ? (
          <div
            className="cursor-text text-[14px] md:text-sm whitespace-pre-wrap break-words leading-[1.45] min-h-[1.45em]"
            style={{
              color: b.checked ? 'var(--assistant-text-faint)' : 'var(--assistant-text-soft)',
            }}
            onClick={() => {
              setEditingTaskId(b.id);
              focusBlock(b.id, true);
            }}
          >
            {tokens.map((token, idx) => {
              if (/^\s+$/.test(token)) return <React.Fragment key={`${b.id}-ws-${idx}`}>{token}</React.Fragment>;
              const clickable = isClickableWord(token);
              const wordKey = `${b.id}-tk-${idx}`;
              const armed = clickable && armedWordKey === wordKey;
              return (
                <span
                  key={wordKey}
                  className={
                    armed
                      ? 'cursor-pointer rounded-sm underline decoration-[var(--assistant-accent)] underline-offset-[3px] bg-[color-mix(in_srgb,var(--assistant-accent)_18%,transparent)]'
                      : ''
                  }
                  onMouseEnter={clickable ? () => armWord(wordKey) : undefined}
                  onMouseLeave={clickable ? disarmWord : undefined}
                  onClick={
                    armed
                      ? (e) => {
                          e.stopPropagation();
                          disarmWord();
                          openPivotForWord(b.id, token);
                        }
                      : undefined
                  }
                >
                  {token}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  /* ── Render helpers ── */
  // Renders one group's lists (the selected group unless `project` says otherwise)
  const renderNormalList = (project?: Project) => {
    // Styled after the Completed report: quiet rows, plain-text dates, bare list headers
    const isCurrent = !project || project.project_id === currentProject?.project_id;
    const pBlocks = isCurrent ? blocks : project.blocks ?? [];
    const pCollapsed = isCurrent ? collapsed : project.quickCollapsed ?? {};
    // Collapse is left out here: a collapsed list keeps its header (and count), only its rows go
    const pHiddenMap = buildHiddenMap(pBlocks, { collapsed: {}, showHidden: false, dateMode: viewDateMode, focusDay, sortBy, range: dateRange });
    // "Show all" shows hidden lists too
    const pHiddenByList: Record<string, boolean> = showAllGroups
      ? {}
      : isCurrent ? hiddenByListMap : buildListVisibilityHiddenMap(pBlocks, project.visibleLists ?? {});
    // Group by parentId, sort each group by order
    const listBlocks: Block[] = [];
    const tasksByParent = new Map<string | null, Block[]>();
    for (const b of pBlocks) {
      if (b.indent === 0) {
        listBlocks.push(b);
      } else {
        const key = b.parentId ?? null;
        if (!tasksByParent.has(key)) tasksByParent.set(key, []);
        tasksByParent.get(key)!.push(b);
      }
    }
    listBlocks.sort((a, b) => a.order - b.order);
    for (const tasks of tasksByParent.values()) tasks.sort((a, b) => a.order - b.order);
    // Ghost "Task…" row; revealed by hovering the row right before it (.quick-add-anchor)
    const addGhost = (onClick: () => void, paddingLeft: number) => (
      <button
        type="button"
        onClick={onClick}
        aria-label="Add task"
        className="quick-add-ghost w-full flex items-center px-0.5 gap-1 text-left"
        style={{ paddingLeft, marginTop: 0, marginBottom: 0 }}
      >
        <span className="h-4 w-4 shrink-0 flex items-center justify-center">
          <span className="h-3.5 w-3.5 rounded-full border border-dashed" style={{ borderColor: 'var(--assistant-text-faint)' }} />
        </span>
        <span className="text-[14px] md:text-sm leading-[1.45]" style={{ color: 'var(--assistant-text-faint)' }}>
          Task…
        </span>
      </button>
    );
    // Sections (and the button that adds them) only exist in the "All" view
    const sectionsShown = dateMode === 'all';
    // On a single day, a recurring task stands for that day's occurrence: its date, done state and check
    const occurrenceDay = (t: Block) =>
      sortBy === 'dueDate' && viewDateMode === 'today' && isRecurringTask(t) && recurringShowsOn(t, focusDay) ? focusDay : null;
    const isTaskDone = (t: Block) => {
      const day = occurrenceDay(t);
      return day ? isOccurrenceDone(t, day) : t.checked === true;
    };
    // "Section…" slot, in place of the "Task…" ghost while the list is in section mode;
    // revealed the same way, by hovering the row right before it
    const sectionSlot = (onClick: () => void) => (
      <button
        type="button"
        onClick={onClick}
        onMouseDown={e => e.preventDefault()}
        aria-label="Add section here"
        className="quick-add-ghost quick-section-slot w-full flex items-center gap-2 px-0.5 text-left"
        style={{ paddingLeft: agendaRowPad(1), marginTop: 0, marginBottom: 0 }}
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path strokeLinecap="round" d="M3 6h10M3 10.5h10" />
        </svg>
        <span className={agendaSectionTitleClass}>Section…</span>
        <span aria-hidden="true" className="h-0 min-w-6 flex-1 border-t border-dashed" style={{ borderColor: 'currentColor' }} />
      </button>
    );

    let showsUncategorized = false;
    const rows = listBlocks.map(listBlock => {
          if (pHiddenByList[listBlock.id]) return null;
          const isUncList = isUncTitleBlock(listBlock);
          if (isUncList && hideUncategorized) return null;
          const tasks = tasksByParent.get(listBlock.id) ?? [];
          // A list whose title matches shows all its tasks; otherwise only matching tasks
          const listMatches = searching && !isUncList && matchesSearch(listBlock);
          const visibleTasks = tasks.filter(task =>
            !task.section &&
            !pHiddenMap[task.id] && !pHiddenByList[task.id] &&
            (showCompleted || !isTaskDone(task)) &&
            passesTaskFilter(task) &&
            (!searching || listMatches || matchesSearch(task)),
          );
          // Sections slot in among the visible tasks: one shows while it has a visible task under
          // it, while it's empty (just made) or while its title is being typed — filters that hide
          // all its tasks hide it too
          const visibleIds = new Set(visibleTasks.map(t => t.id));
          const listRows: Block[] = [];
          tasks.forEach((t, k) => {
            if (!t.section) {
              if (visibleIds.has(t.id)) listRows.push(t);
              return;
            }
            // Sections belong to the "All" view only — date filters show plain task lists
            if (!sectionsShown) return;
            let hasTasks = false;
            let showsTask = false;
            for (let m = k + 1; m < tasks.length && !tasks[m].section; m++) {
              hasTasks = true;
              if (visibleIds.has(tasks[m].id)) { showsTask = true; break; }
            }
            if (showsTask || editingSectionId === t.id || (!hasTasks && !searching)) listRows.push(t);
          });
          const typingSectionHere = listRows.some(r => r.id === editingSectionId);
          // A list with no tasks to show isn't shown at all — unless its title (or a new section's) is being typed
          if (visibleTasks.length === 0 && editingListTitleId !== listBlock.id && !typingSectionHere) return null;
          if (isUncList) showsUncategorized = true;
          // Hovering any task reveals a ghost "Task…" row right below it that inserts a task
          // there; an empty list gets one under its header. Only offered under committed
          // tasks (has text), and never while a task or list title is being typed.
          const lastVisibleTaskId = visibleTasks.length > 0 ? visibleTasks[visibleTasks.length - 1].id : null;
          const isCommitted = (t: Block) => (t.text || '').trim() !== '' && !typingAny;
          const showHeaderGhost = !pCollapsed[listBlock.id] && !isUncList && !lastVisibleTaskId && !typingAny;
          const lDragOver = dragOverId === listBlock.id && dragRef.current?.id !== listBlock.id;
          const lDragMe   = dragRef.current?.id === listBlock.id;
          const listCollapsed = !searching && !isUncList && pCollapsed[listBlock.id] === true;
          // Section mode swaps the hover "Task…" slots for "Section…" slots
          const sectionMode = sectionsShown && sectionModeListId === listBlock.id && !listCollapsed && !typingAny;

          return (
            <React.Fragment key={listBlock.id}>
              {/* ── List header (hidden for Uncategorized) ── */}
              {!isUncList && (
                <AgendaListHeader
                  draggable
                  onDragStart={e => onDragStartRow(e, listBlock.id)}
                  onDragOver={e => onDragOverRow(e, listBlock.id)}
                  onDrop={e => onDropRow(e, listBlock.id)}
                  onDragEnd={onDragEndRow}
                  className={[lDragOver ? classes.dragOver : '', lDragMe ? 'opacity-60' : '', showHeaderGhost || sectionMode ? 'quick-add-anchor' : ''].join(' ')}
                  collapsed={listCollapsed}
                  onToggleCollapse={() => toggleList(listBlock.id)}
                  onAddSection={sectionsShown ? () => toggleSectionMode(listBlock.id) : undefined}
                  addSectionActive={sectionsShown && sectionModeListId === listBlock.id}
                  heading={editingListTitleId === listBlock.id ? (
                      <input
                        ref={el => void (inputRefs.current[listBlock.id] = el)}
                        value={listBlock.text}
                        placeholder="List…"
                        onChange={e => handleUpdateBlock(listBlock.id, { text: e.target.value })}
                        onKeyDown={e => handleKey(e, listBlock)}
                        onBlur={() => handleListTitleBlur(listBlock.id)}
                        className="flex-none bg-transparent text-[14px] md:text-sm font-semibold outline-none"
                        style={{ width: `${inputWidthPx(listBlock.text)}px`, maxWidth: 'calc(100% - 48px)', color: 'var(--assistant-text)' }}
                      />
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        className="quick-word-clickable min-w-0 break-words text-[14px] md:text-sm font-semibold"
                        style={{ maxWidth: 'calc(100% - 48px)', color: 'var(--assistant-text)' }}
                        onClick={(e) => { e.stopPropagation(); openPivotForList(listBlock); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPivotForList(listBlock); } }}
                        onDoubleClick={(e) => { e.stopPropagation(); setEditingListTitleId(listBlock.id); requestAnimationFrame(() => inputRefs.current[listBlock.id]?.focus()); }}
                      >
                        {(listBlock.text || '').trim() ? listBlock.text : 'List…'}
                      </span>
                    )}
                />
              )}
              {/* ── Tasks belonging to this list ── */}
              {sectionMode && listRows[0] && !listRows[0].section && sectionSlot(() => handleInsertSection(listBlock.id, listBlock.id))}
              {!listCollapsed && listRows.map((task, rowIdx) => {
                // In section mode: a slot after each task, unless a section already sits there
                const slotAfter = sectionMode && !task.section && !listRows[rowIdx + 1]?.section
                  ? sectionSlot(() => handleInsertSection(listBlock.id, task.id))
                  : null;
                // scheduled: layout only for now
                const tDragOver = dragOverId === task.id && dragRef.current?.id !== task.id;
                const tDragMe   = dragRef.current?.id === task.id;
                if (task.section) {
                  return (
                    <React.Fragment key={task.id}>
                    <AgendaSectionRow
                      draggable={editingSectionId !== task.id}
                      onDragStart={e => onDragStartRow(e, task.id)}
                      onDragOver={e => onDragOverRow(e, task.id)}
                      onDrop={e => onDropRow(e, task.id)}
                      onDragEnd={onDragEndRow}
                      className={[tDragOver ? classes.dragOver : '', tDragMe ? 'opacity-60' : '', isCommitted(task) || sectionMode ? 'quick-add-anchor' : ''].join(' ')}
                      onRemove={editingSectionId === task.id ? undefined : () => setCurrentBlocks(prev => prev.filter(b => b.id !== task.id))}
                      heading={editingSectionId === task.id ? (
                        <input
                          ref={el => void (inputRefs.current[task.id] = el)}
                          value={task.text}
                          placeholder="Section…"
                          onChange={e => handleUpdateBlock(task.id, { text: e.target.value })}
                          onKeyDown={e => handleSectionKey(e, task)}
                          onBlur={() => handleSectionBlur(task.id)}
                          className={`bg-transparent outline-none ${agendaSectionTitleClass}`}
                          style={{ width: `${inputWidthPx(task.text || 'Section…')}px`, maxWidth: '100%', color: 'var(--assistant-text-muted)' }}
                        />
                      ) : (
                        <span
                          role="button"
                          tabIndex={0}
                          title="Rename section"
                          className={`min-w-0 break-words cursor-text ${agendaSectionTitleClass}`}
                          style={{ color: 'var(--assistant-text-muted)' }}
                          onClick={(e) => { e.stopPropagation(); setEditingSectionId(task.id); requestAnimationFrame(() => inputRefs.current[task.id]?.focus()); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setEditingSectionId(task.id); requestAnimationFrame(() => inputRefs.current[task.id]?.focus()); } }}
                        >
                          {task.text}
                        </span>
                      )}
                    />
                    {/* Hovering the section offers a task right under it */}
                    {isCommitted(task) && !sectionMode && addGhost(() => handleAddTaskAfter(task.id), agendaRowPad(1))}
                    </React.Fragment>
                  );
                }
                const rowPad = agendaRowPad(task.indent);
                const occDay = occurrenceDay(task);
                const toggleDone = occDay
                  ? () => { const next = toggleOccurrence(task, occDay); handleUpdateBlock(task.id, { doneDates: next.doneDates, deadline: next.deadline }); }
                  : () => handleUpdateBlock(task.id, { checked: !task.checked });
                return (
                  <React.Fragment key={task.id}>
                    <AgendaTaskRow
                      draggable
                      onDragStart={e => onDragStartRow(e, task.id)}
                      onDragOver={e => onDragOverRow(e, task.id)}
                      onDrop={e => onDropRow(e, task.id)}
                      onDragEnd={onDragEndRow}
                      className={[tDragOver ? classes.dragOver : '', tDragMe ? 'opacity-60' : '', isCommitted(task) || sectionMode ? 'quick-add-anchor' : ''].join(' ')}
                      indent={task.indent}
                      check={
                        <AgendaCheck checked={isTaskDone(task)} onToggle={toggleDone}>
                          {pulseId === task.id ? (
                            <>
                              <span className={`absolute -inset-2 rounded-full border animate-ping ${classes.quickPulseRing1}`} />
                              <span className={`absolute -inset-3 rounded-full border animate-ping [animation-delay:90ms] ${classes.quickPulseRing2}`} />
                              <span className={`absolute -inset-4 rounded-full border animate-ping [animation-delay:160ms] ${classes.quickPulseRing3}`} />
                              <span className={`absolute -inset-2 rounded-full blur-sm ${classes.quickPulseGlow}`} />
                            </>
                          ) : null}
                        </AgendaCheck>
                      }
                      right={
                        <>
                          {/* Pinned on the right (only when set): flag, then note — everything else lives in the ⋮ menu */}
                          {getTaskFlag(task) ? (
                            <TaskFlagButton
                              source={task}
                              onChange={(next) => handleUpdateBlock(task.id, { flag: next, priority: undefined })}
                            />
                          ) : null}
                          {(task.note || '').trim() ? (
                            <TaskNoteButton
                              task={task}
                              onChange={(note) => handleUpdateBlock(task.id, { note })}
                            />
                          ) : null}
                          <AgendaMenuButton
                            open={taskMenu?.taskId === task.id}
                            onOpen={r => setTaskMenu(prev => (prev?.taskId === task.id ? null : { taskId: task.id, x: r.right, y: r.bottom + 4 }))}
                          />
                        </>
                      }
                    >
                        {renderTaskTextWithWordHover(task)}
                        {editingDateTaskId !== task.id && (
                          <AgendaDate
                            ymd={occDay ?? task.deadline}
                            time={task.dueTime}
                            repeatDays={task.repeatDays}
                            // The sort picked in Filters names the date: "Due Date: …" or "Created: … · Due Date: …"
                            labeled={sortBy === 'dueDate'}
                            created={sortBy === 'createdAt' ? task.createdAt : undefined}
                            onClick={() => setEditingDateTaskId(task.id)}
                            onRepeatClick={() => setRepeatModalTaskId(task.id)}
                          />
                        )}
                        {editingDateTaskId === task.id && (
                          <input
                            ref={el => void (inlineDateRefs.current[task.id] = el)}
                            autoFocus
                            type="date"
                            lang="en-US"
                            className={`shrink-0 mt-0.5 self-start text-[12px] px-1.5 py-0.5 rounded-full outline-none ${classes.quickDatePillInput}`}
                            value={isValidDateYYYYMMDD(task.deadline) ? task.deadline : ''}
                            onChange={e => {
                              const v = e.target.value;
                              handleUpdateBlock(task.id, { deadline: v ? v : undefined });
                              setEditingDateTaskId(null);
                            }}
                            onBlur={() => setEditingDateTaskId(null)}
                            onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter') setEditingDateTaskId(null); }}
                          />
                        )}
                    </AgendaTaskRow>
                    {/* Must directly follow the row: CSS reveals it via .quick-add-anchor:hover + .quick-add-ghost */}
                    {isCommitted(task) && !sectionMode && addGhost(
                      () => handleAddTaskAfter(task.id),
                      rowPad,
                    )}
                    {slotAfter}
                  </React.Fragment>
                );
              })}
              {showHeaderGhost && addGhost(() => handleAddTaskUnderList(listBlock.id), 24)}
            </React.Fragment>
          );
        }).filter(Boolean);

    // Nothing to show → render nothing, so "All groups" can drop the group's heading too
    if (rows.length === 0) return null;
    // Uncategorized tasks have no list header, so the group name is what places them
    return { node: <div className="space-y-1 quick-rows">{rows}</div>, showsUncategorized };
  };

  const actionsPanelProps = {
    dateMode, setDateMode, showCompleted, setShowCompleted,
    hideSomeday, setHideSomeday,
    sortBy, setSortBy,
    taskFilter, setTaskFilter,
    focusDay, setFocusDay,
    onOpenRange: () => setRangeDialogOpen(true),
  };

  const progressLabel =
    taskFilter !== 'none'
      ? PROGRESS_LABELS[taskFilter]
      : dateMode === 'today' && focusDay !== todayYMD()
      ? `${formatPill(focusDay) || labelForYMD(focusDay)} progress`
      : PROGRESS_LABELS[dateMode];

  const handleMiniCalendarPickDay = (ymd: string) => {
    setDateMode('today');
    setFocusDay(ymd);
    closeDrawer();
  };

  /* ── Render ── */
  // Until localStorage hydration completes, `projects` is empty → `isBrandNewEmpty`
  // is true → the "Start here" onboarding card would render for one frame on every
  // mount. Because switching tabs remounts this component, that produced a visible
  // flash when coming from Timeline/Calendar. Match those views: hold a neutral
  // placeholder (same container, no layout shift) until hydrated.
  if (!hydrated) {
    return (
      <div
        className="h-full w-full min-h-0 flex items-center justify-center overflow-hidden bg-transparent"
        style={{ color: 'var(--assistant-text)' }}
        aria-busy="true"
      >
        <div className="text-[13px]" style={{ color: 'var(--assistant-text-faint)' }}>Loading…</div>
      </div>
    );
  }

  // The selected group's lists; the header names the group only when they include Uncategorized tasks
  const groupLists = showAllGroups ? null : renderNormalList();

  // Back to the defaults: every date, no tag filter, Someday shown, no keyword, every list
  const filtersActive = dateMode !== 'all' || taskFilter !== 'none' || hideSomeday || searching || focusList !== null;
  const clearFilters = () => {
    setDateMode('all');
    setTaskFilter('none');
    setHideSomeday(false);
    setSearchQuery('');
    setFocusedList(null);
  };

  return (
    <div className="h-full w-full min-h-0 flex flex-col overflow-hidden bg-transparent" style={{ color: 'var(--assistant-text)' }}>
      <ConfettiRain show={showConfetti} />
      <GamificationToast show={toastShow} message={toastMsg} />
      <style>{`
        .quick-word-clickable { cursor: pointer; }
        /* Collapsed to zero height; the hide is delayed so the pointer can cross
           the gap from the anchor row into the ghost without it closing. */
        .quick-search {
          border-bottom: 1px solid var(--assistant-border-soft);
          transition: border-color 0.15s ease;
        }
        .quick-search:hover { border-bottom-color: color-mix(in srgb, var(--assistant-text) 25%, transparent); }
        .quick-search:focus-within { border-bottom-color: var(--assistant-accent); }
        .quick-search-icon { color: var(--assistant-text-faint); transition: color 0.15s ease; }
        .quick-search:focus-within .quick-search-icon { color: var(--assistant-accent); }
        .quick-search input::placeholder { color: var(--assistant-text-faint); }
        .quick-add-ghost {
          max-height: 0; opacity: 0; overflow: hidden; cursor: text;
          transition: max-height 0.15s ease 0.25s, opacity 0.15s ease 0.25s, padding 0.15s ease 0.25s;
        }
        .quick-section-slot { color: var(--assistant-text-faint); transition: color 0.15s ease; }
        .quick-section-slot:hover, .quick-section-slot:focus-visible { color: var(--assistant-accent); }
        .quick-add-anchor:hover + .quick-add-ghost,
        .quick-add-ghost:hover,
        .quick-add-ghost:focus-visible {
          max-height: 2rem; opacity: 1; padding-top: 0.25rem; padding-bottom: 0.25rem;
          transition-delay: 0s;
        }
      `}</style>

      {/* Filters bottom sheet — mobile, or a desktop main panel too narrow for the filters column */}
      {(drawerOpen || drawerClosing) && (
        <div className="fixed inset-0 z-40">
          <style>{`
            @keyframes quickSheetOverlayIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes quickSheetOverlayOut { from { opacity: 1; } to { opacity: 0; } }
            @keyframes quickSheetIn {
              from { transform: translateY(100%); opacity: 0; }
              60% { transform: translateY(-4px); opacity: 1; }
              to { transform: translateY(0); opacity: 1; }
            }
            @keyframes quickSheetOut {
              from { transform: translateY(0); opacity: 1; }
              to { transform: translateY(100%); opacity: 0; }
            }
          `}</style>
          <button
            type="button"
            className="absolute inset-0"
            style={{
              background: 'var(--assistant-overlay)',
              animation: drawerClosing
                ? 'quickSheetOverlayOut 0.22s ease-out both'
                : 'quickSheetOverlayIn 0.22s ease-out both',
            }}
            onClick={closeDrawer}
            aria-label="Close filters"
          />
          <div
            className={`absolute inset-x-0 bottom-0 flex max-h-[80vh] flex-col overflow-hidden rounded-t-2xl shadow-2xl ${classes.quickDrawer}`}
            style={{
              animation: drawerClosing
                ? 'quickSheetOut 0.22s cubic-bezier(0.4, 0, 1, 1) both'
                : 'quickSheetIn 0.36s cubic-bezier(0.22, 1, 0.36, 1) both',
            }}
          >
            {/* Drag handle */}
            <div className="flex shrink-0 justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full" style={{ background: 'var(--assistant-border-soft)' }} />
            </div>
            <div className={`flex shrink-0 items-center justify-between px-4 py-2 ${classes.quickDrawerHeader}`}>
              <span className="text-[14px] font-semibold" style={{ color: 'var(--assistant-text-soft)' }}>Filters</span>
              <button type="button" onClick={closeDrawer} className={`flex h-7 w-7 items-center justify-center rounded-md ${classes.quickDrawerCloseBtn}`}>✕</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-3">
              {/* Hide Completed on → no progress bar */}
              {showCompleted && <QuickProgressBlock progress={progress} label={progressLabel} className="mb-3" />}
              <div className="mb-3 overflow-hidden rounded-2xl">
                <MiniCalendar onPickDay={handleMiniCalendarPickDay} compact />
              </div>
              <ActionsPanel {...actionsPanelProps} />
            </div>
          </div>
        </div>
      )}

      {/* @container: the filters column follows this panel's own width, not the window's —
          docked panels can leave the main panel narrow on a wide screen */}
      <div className="@container flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-3 pt-2 pb-0 @2xl:px-8 @2xl:py-8">
          <div className="flex min-h-0 flex-1 flex-col gap-4 @2xl:flex-row">
            <div className="min-h-0 min-w-0 flex-1 flex flex-col overflow-hidden">

              {/* Date pagination header — fixed above the scroll area, never overlapped by the tasks */}
              <div className="shrink-0 z-30">
                <div className={`flex items-center justify-between gap-1 px-3 py-2.5 md:gap-3 md:px-4 md:py-3 ${classes.quickHeaderBar}`}>

                  {/* Left: ‹ date › */}
                  <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={navigatePrev}
                      disabled={navDisabled}
                      className={`grid place-items-center size-8 shrink-0 text-[23px] md:text-[29px] leading-none transition-colors ${classes.quickNavArrow}`}
                    >
                      ‹
                    </button>

                    <div className="min-w-0 text-[16px] md:text-[19px] font-semibold tracking-tight whitespace-nowrap" style={{ color: 'var(--assistant-text)' }}>
                      {dateMode === 'today' && (
                        focusDay === todayYMD() ? 'Today' : (formatPill(focusDay) || labelForYMD(focusDay))
                      )}

                      {dateMode === 'week' && (
                        <>
                          Week{' '}
                          <span style={{ color: 'var(--assistant-text-faint)', fontWeight: 500 }}>
                            {getWeekRangeLabel(focusDay)}
                          </span>
                        </>
                      )}

                      {dateMode === 'month' && (
                        <>
                          Month{' '}
                          <span style={{ color: 'var(--assistant-text-faint)', fontWeight: 500 }}>
                            {getMonthRangeLabel(focusDay)}
                          </span>
                        </>
                      )}

                      {dateMode === 'all' && (
                        <span style={{ color: 'var(--assistant-text-soft)' }}>All tasks</span>
                      )}

                      {dateMode === 'range' && (
                        <button type="button" onClick={() => setRangeDialogOpen(true)} title="Change range" className="font-semibold">
                          Range{' '}
                          <span style={{ color: 'var(--assistant-text-faint)', fontWeight: 500 }}>
                            {getRangeLabel(dateRange)}
                          </span>
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={navigateNext}
                      disabled={navDisabled}
                      className={`grid place-items-center size-8 shrink-0 text-[23px] md:text-[29px] leading-none transition-colors ${classes.quickNavArrow}`}
                    >
                      ›
                    </button>

                    {focusList ? (
                      // Focused-list filter: name it and offer a way out
                      <span
                        className="flex min-w-0 items-center gap-1 rounded-full py-0.5 pl-2 pr-1 text-[11px] md:text-[12px] font-semibold uppercase tracking-wide"
                        style={{ color: 'var(--assistant-text)' }}
                        title={`Showing only ${currentProject?.title} › ${focusList.text}`}
                      >
                        {/* Breadcrumbs: group (back to all its lists) › list (current) */}
                        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1 break-words">
                          <button
                            type="button"
                            onClick={() => setFocusedList(null)}
                            className="uppercase tracking-wide opacity-60 transition-opacity hover:opacity-100 hover:underline"
                            title={`Show every list in ${currentProject?.title}`}
                          >
                            {currentProject?.title}
                          </button>
                          <span aria-hidden="true" className="opacity-40">›</span>
                          <span aria-current="page">{(focusList.text || '').trim() || 'List'}</span>
                        </nav>
                        <button
                          type="button"
                          onClick={() => setFocusedList(null)}
                          className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[13px] leading-none opacity-60 transition-opacity hover:opacity-100"
                          title="Show every list"
                          aria-label="Clear list filter"
                        >
                          ×
                        </button>
                      </span>
                    ) : showAllGroups || (currentProject?.title && groupLists?.showsUncategorized) ? (
                      <span
                        className="min-w-0 break-words rounded-full px-2 py-0.5 text-[11px] md:text-[12px] font-semibold uppercase tracking-wide"
                        style={{ color: 'var(--assistant-text-soft)' }}
                        title={showAllGroups ? 'Showing every group' : `Group: ${currentProject?.title}`}
                      >
                        {showAllGroups ? 'All groups' : currentProject?.title}
                      </span>
                    ) : null}
                  </div>

                  {/* Right: New Task */}
                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={openNewTaskDialog}
                      className={`hidden md:flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-lg transition-all hover:scale-105 ${classes.quickNewListBtn}`}
                    >
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" d="M8 3v10M3 8h10" />
                      </svg>
                      <span>New Task</span>
                    </button>

                    {/* Mobile settings */}
                    <button
                      type="button"
                      onClick={() => setDrawerOpen(true)}
                      className={`@2xl:hidden flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium transition ${classes.quickMobileSettings}`}
                    >
                      <span>⚙</span>
                      <span className="capitalize">{dateMode}</span>
                    </button>
                  </div>
                </div>

                {/* Keyword box — live-filters the lists (searches across all dates); "/" focuses it */}
                <div className="px-3 pt-2">
                  <label className="quick-search flex items-center gap-2 px-1">
                    <svg viewBox="0 0 16 16" className="quick-search-icon h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                      <circle cx="7" cy="7" r="4.5" />
                      <path strokeLinecap="round" d="M10.4 10.4L14 14" />
                    </svg>
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') { setSearchQuery(''); e.currentTarget.blur(); } }}
                      placeholder="Search tasks"
                      aria-label="Filter tasks by keyword"
                      className="min-w-0 flex-1 bg-transparent py-1.5 text-[13px] outline-none"
                      style={{ color: 'var(--assistant-text)' }}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[14px] leading-none opacity-50 transition-opacity hover:opacity-100"
                        style={{ color: 'var(--assistant-text)' }}
                        aria-label="Clear search"
                        title="Clear"
                      >
                        ×
                      </button>
                    )}
                  </label>
                </div>
              </div>

              {/* Scrollable content — only the tasks scroll */}
              <div className="min-h-0 flex-1 overflow-y-auto pb-16 md:pb-0">
              <div className="px-3 pt-3">
                {isBrandNewEmpty ? (
                  <div className={`rounded-2xl p-5 ${classes.quickEmptyState}`}>
                    <div className="text-sm font-semibold" style={{ color: 'var(--assistant-text)' }}>Start here</div>
                    <div className="text-[13px] mt-1" style={{ color: 'var(--assistant-text-muted)' }}>Add your first task and the list it belongs to.</div>
                    <button
                      type="button"
                      onClick={openNewTaskDialog}
                      className={`mt-4 max-w-[260px] w-full text-left text-[14px] px-4 py-3 rounded-2xl transition-colors wobble-loop ${classes.quickCtaBtn}`}
                    >
                      + New Task
                    </button>
                    <div className="text-[12px] mt-3" style={{ color: 'var(--assistant-text-faint)' }}>Hint: type a list name that doesn&apos;t exist yet and it&apos;s created for you.</div>
                  </div>
                ) : showAllGroups ? (
                  // Every group, one after another. Edits act on the selected group, so pointer
                  // or focus inside a group selects it first (the Sidebar works the same way).
                  <div className="space-y-5">
                    {projects.map(p => {
                      const lists = renderNormalList(p);
                      // A group with no list to show is left out entirely
                      if (!lists) return null;
                      return (
                        <div
                          key={p.project_id}
                          onMouseDownCapture={() => { if (p.project_id !== selectedProjectId) setSelectedProjectId(p.project_id); }}
                          onFocusCapture={() => { if (p.project_id !== selectedProjectId) setSelectedProjectId(p.project_id); }}
                        >
                          {lists.showsUncategorized && (
                            <div
                              className="mb-1 px-1 text-[11px] font-bold uppercase tracking-[0.14em]"
                              style={{ color: 'var(--assistant-accent)' }}
                            >
                              {p.title}
                            </div>
                          )}
                          {lists.node}
                        </div>
                      );
                    })}
                  </div>
                ) : groupLists?.node ?? (
                  <div className="px-1 py-6 text-center text-[13px]" style={{ color: 'var(--assistant-text-faint)' }}>
                    No tasks to show here.
                    {filtersActive && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="rounded-full px-3 py-1 text-[12px] font-medium transition-colors"
                          style={{ color: 'var(--assistant-text)', background: 'color-mix(in srgb, var(--assistant-text) 6%, transparent)' }}
                        >
                          Clear filters
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              </div>
            </div>

            {/* Desktop sidebar — outside main scroll: stays fixed while lists scroll */}
            <div className="hidden max-h-[77vh] min-h-0 w-[270px] shrink-0 flex-col @2xl:flex">
              <div className={`flex max-h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl ${classes.quickSidePanel}`}>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                  {/* Hide Completed on → no progress bar */}
                  {showCompleted && <QuickProgressBlock progress={progress} label={progressLabel} className="mb-3" />}
                  <div className="mb-3 overflow-hidden rounded-2xl">
                    <MiniCalendar onPickDay={handleMiniCalendarPickDay} compact />
                  </div>
                  <ActionsPanel {...actionsPanelProps} />
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

        {taskDialogOpen ? (
          <NewTaskDialog
            lists={taskDialogLists}
            defaultListId={focusList?.id}
            onCancel={() => setTaskDialogOpen(false)}
            onSubmit={handleDialogAddTask}
          />
        ) : null}

        {hiddenNotice ? (
          <HiddenTaskDialog
            title={hiddenNotice.title}
            taskText={hiddenNotice.text}
            reasons={hiddenNotice.reasons}
            onTurnOff={keys => turnOffFilters(keys, hiddenNotice.projectId)}
            onClose={() => setHiddenNotice(null)}
          />
        ) : null}

        {rangeDialogOpen ? (
          <DateRangeDialog
            initial={dateRange}
            onCancel={() => setRangeDialogOpen(false)}
            onApply={applyRange}
          />
        ) : null}

        {/* Task ⋮ menu + the modals it opens (the task lives in the selected group) */}
        {(() => {
          const menuTask = taskMenu ? blocks.find(b => b.id === taskMenu.taskId) : undefined;
          if (!taskMenu || !menuTask) return null;
          return (
            <TaskRowMenu
              x={taskMenu.x}
              y={taskMenu.y}
              createdAt={menuTask.createdAt}
              flag={getTaskFlag(menuTask)}
              hasNote={Boolean((menuTask.note || '').trim())}
              hasDueDate={isValidDateYYYYMMDD(menuTask.deadline)}
              repeatLabel={repeatDaysLabel(menuTask.repeatDays)}
              onEdit={() => { setEditingTaskId(menuTask.id); focusBlock(menuTask.id, true); }}
              onDueDate={() => setEditingDateTaskId(menuTask.id)}
              onRepeat={() => setRepeatModalTaskId(menuTask.id)}
              onFlag={(flag) => handleUpdateBlock(menuTask.id, { flag, priority: undefined })}
              onNote={() => setNoteModalTaskId(menuTask.id)}
              onReminder={() => setReminderModalTaskId(menuTask.id)}
              onDelete={() => deleteTask(menuTask.id)}
              onClose={closeTaskMenu}
            />
          );
        })()}
        {(() => {
          const t = noteModalTaskId ? blocks.find(b => b.id === noteModalTaskId) : undefined;
          return t ? (
            <TaskNoteModal
              task={t}
              onChange={(note) => handleUpdateBlock(t.id, { note })}
              onClose={() => setNoteModalTaskId(null)}
            />
          ) : null;
        })()}
        {(() => {
          const t = reminderModalTaskId ? blocks.find(b => b.id === reminderModalTaskId) : undefined;
          return t ? <TaskReminderModal task={t} onClose={() => setReminderModalTaskId(null)} /> : null;
        })()}
        {(() => {
          const t = repeatModalTaskId ? blocks.find(b => b.id === repeatModalTaskId) : undefined;
          return t ? (
            <TaskRepeatModal
              task={t}
              onSave={(patch) => handleUpdateBlock(t.id, patch)}
              onClose={() => setRepeatModalTaskId(null)}
            />
          ) : null;
        })()}

        {deleteListConfirmId ? (
          <DeleteWithOpenTasksDialog
            key={deleteListConfirmId}
            kind="list"
            name={blocks.find(x => x.id === deleteListConfirmId)?.text?.trim()}
            openCount={openTasksOf(blocks, [deleteListConfirmId]).length}
            targets={buildMoveTargets(projects, { listIds: [deleteListConfirmId] })}
            defaultProjectId={currentProject?.project_id}
            onCancel={() => { setDeleteListConfirmId(null); armedDeleteListRef.current = null; }}
            onDelete={() => handleConfirmDeleteList(deleteListConfirmId)}
            onMoveAndDelete={(toProjectId, toListId) => handleMoveAndDeleteList(deleteListConfirmId, toProjectId, toListId)}
          />
        ) : null}

      {/* Only once the server has confirmed the workspace really has no tasks */}
      {projectsHydrated && projects.length > 0 && workspaceHasNoTasks && !wizardClosed ? (
        <FirstListWizard onFinish={handleWizardFinish} onClose={closeWizard} />
      ) : null}
    </div>
  );
}
