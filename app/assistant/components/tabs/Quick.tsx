// app/components/Quick.tsx
'use client';
// Note we may want to rename this component in the future as 'quick' is a bit confusing
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { OnboardingModal } from '../OnboardingModal';
import MiniCalendar from '../Minicalendar';
//also hi
import {
  // Types
  type Block,
  type Project,
  type DateMode,
  type SortBy,
  type ProjectsPayload,
  // Constants
  LS_KEY_V2,
  // Factories
  uid,
  makeTaskBlock,
  makePersonalProject,
  // Persistence
  readProjectsLS,
  writeProjectsLS,
  // Array structure
  moveUncToTop,
  ensureUncExists,
  findUncRange,
  isUncTitleBlock,
  insertBlockAfter,
  removeBlock,
  removeListAndChildren,
  updateBlock as updateBlockArr,
  addTaskUnderList as addTaskUnderListArr,
  createList as createListArr,
  createBlankList,
  // UI helpers
  formatPill,
  dayDiffFromToday,
  labelForYMD,
  getWeekRangeLabel,
  getMonthRangeLabel,
  todayYMD,
  isValidDateYYYYMMDD,
  addDaysYMD,
  // Filter / view helpers
  buildHiddenMap,
  buildListVisibilityHiddenMap,
  sortBlocksByOrder,
} from '@/lib/datacenter';
import { TaskFlagButton } from '../TaskFlag';
import { downloadTasksExcel } from '@/lib/exportExcel';
import classes from '@/app/assistant/_theme/themes.module.css';

/** First incomplete task under this list with empty text (for Enter → focus instead of duplicating). */
function findFirstEmptyTaskUnderList(blocks: Block[], listId: string): string | null {
  const i = blocks.findIndex(b => b.id === listId && b.indent === 0);
  if (i < 0) return null;
  for (let j = i + 1; j < blocks.length && blocks[j].indent !== 0; j++) {
    const t = blocks[j];
    if (!(t.indent > 0)) continue;
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
            <span className={`text-[11px] md:text-[12px] font-semibold uppercase tracking-[0.24em] ${classes.quickToastLabel}`}>Progress</span>
          </div>
          <div className="text-[16px] md:text-[20px] font-semibold leading-tight" style={{ color: 'var(--assistant-text)' }}>{message}</div>
        </div>
      </div>
    </>
  );
}

function QuickProgressBlock({
  progress,
  className = '',
}: {
  progress: { total: number; done: number; remaining: number; pct: number };
  className?: string;
}) {
  return (
    <div className={`rounded-2xl p-3 ${classes.quickProgressBlock} ${className}`}>
      <div className="flex items-center justify-between">
        <div className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${classes.quickProgressLabel}`}>
          Progress
        </div>
        <div className={`text-[11px] ${classes.quickProgressCount}`}>
          {progress.done}/{progress.total}
        </div>
      </div>

      <div className="mt-2 flex items-end gap-2">
        <div className={`text-[28px] leading-none font-extrabold italic tabular-nums tracking-[-0.06em] ${classes.quickProgressRemaining}`}>
          {progress.remaining}
        </div>
        <div className={`pb-[2px] text-[12px] ${classes.quickProgressSoft}`}>
          task{progress.remaining === 1 ? '' : 's'} to finish
        </div>
      </div>

      <div className={`mt-3 h-2 w-full rounded-full overflow-hidden ${classes.quickProgressBar}`}>
        <div
          className={`h-full rounded-full ${classes.quickProgressFill}`}
          style={{ width: `${Math.max(0, Math.min(100, Math.round(progress.pct * 100)))}%` }}
        />
      </div>
    </div>
  );
}

/* ===================== Actions Panel ===================== */
function ActionsPanel({
  dateMode, setDateMode, showCompleted, setShowCompleted,
  sortBy, setSortBy,
}: {
  dateMode: DateMode; setDateMode: (m: DateMode) => void;
  showCompleted: boolean; setShowCompleted: (v: boolean | ((p: boolean) => boolean)) => void;
  sortBy: SortBy; setSortBy: (v: SortBy) => void;
}) {
  const filterBtn = (mode: DateMode, label: string, icon: React.ReactNode) => (
    <button type="button" key={mode} onClick={() => setDateMode(mode)}
      className={['w-full text-left text-[12px] px-3 py-2 rounded-xl transition-all',
        dateMode === mode ? classes.quickFilterActive : classes.quickFilterInactive].join(' ')}>
      <span className="inline-flex items-center gap-2">
        <span className={classes.faintText}>{icon}</span>
        <span>{label}</span>
      </span>
    </button>
  );

  return (
    <div className="p-2 space-y-2">
      <div className="px-1 py-1">
        <div className={`text-[11px] mb-1.5 px-2 ${classes.mutedText}`}>View By</div>
        <div className="space-y-1">
          {([['dueDate', 'Due Date'], ['createdAt', 'Created Date']] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setSortBy(value)}
              className={['w-full text-left text-[12px] px-3 py-2 rounded-xl transition-all',
                sortBy === value ? classes.quickFilterActive : classes.quickFilterInactive].join(' ')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-px my-1" style={{ background: 'var(--assistant-border-soft)' }} />
      <div className="px-3 py-1"><div className={`text-[11px] ${classes.mutedText}`}>Filters</div></div>

      {filterBtn(
        'today',
        'Today',
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7">
          <rect x="2" y="3" width="12" height="11" rx="2" />
          <path strokeLinecap="round" d="M5 2v3M11 2v3M2 6.5h12" />
          <circle cx="8" cy="10" r="1.2" fill="currentColor" stroke="none" />
        </svg>,
      )}
      {filterBtn(
        'week',
        'Week',
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="2" y="3" width="12" height="10" rx="2" />
          <path strokeLinecap="round" d="M2 7.5h12" />
          <path strokeLinecap="round" d="M4 10h2M7 10h2M10 10h2" />
        </svg>,
      )}
      {filterBtn(
        'month',
        'Month',
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="1.8" y="2.6" width="12.4" height="11" rx="2" />
          <path strokeLinecap="round" d="M1.8 6.3h12.4M5.2 1.8v2.2M10.8 1.8v2.2" />
        </svg>,
      )}
      {filterBtn(
        'all',
        'All',
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="8" cy="8" r="5.5" />
          <path strokeLinecap="round" d="M2.5 8h11M8 2.5c1.6 1.4 2.5 3.4 2.5 5.5s-.9 4.1-2.5 5.5M8 2.5c-1.6 1.4-2.5 3.4-2.5 5.5s.9 4.1 2.5 5.5" />
        </svg>,
      )}

      <div className="h-px my-1" style={{ background: 'var(--assistant-border-soft)' }} />

      <button type="button" onClick={() => setShowCompleted(s => !s)}
        className={['w-full text-left text-[12px] px-3 py-2 rounded-xl transition-all',
          showCompleted ? classes.quickFilterActive : classes.quickFilterInactive].join(' ')}>
        <span className="inline-flex items-center gap-2">
          <span className={classes.faintText}>
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
              {showCompleted ? (
                <>
                  <path strokeLinecap="round" d="M1.8 8s2.4-3.8 6.2-3.8S14.2 8 14.2 8s-2.4 3.8-6.2 3.8S1.8 8 1.8 8z" />
                  <circle cx="8" cy="8" r="1.7" />
                </>
              ) : (
                <>
                  <path strokeLinecap="round" d="M2.2 2.2l11.6 11.6" />
                  <path strokeLinecap="round" d="M1.8 8s2.4-3.8 6.2-3.8c1.2 0 2.2.3 3.1.8M14.2 8s-.8 1.3-2.2 2.3" />
                </>
              )}
            </svg>
          </span>
          <span>{showCompleted ? 'Hide Completed' : 'Show Completed'}</span>
        </span>
      </button>

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

  const [dateMode, setDateMode] = useState<DateMode>('today');
  const [focusDay, setFocusDay] = useState<string>(todayYMD());
  const [showCompleted, setShowCompleted] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('dueDate');

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
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const quickMenuRef = useRef<HTMLDivElement | null>(null);
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

  // Close the header "⋮" menu on outside-click or Escape.
  useEffect(() => {
    if (!quickMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (quickMenuRef.current && !quickMenuRef.current.contains(e.target as Node)) {
        setQuickMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setQuickMenuOpen(false); };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [quickMenuOpen]);
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
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiTimerRef = useRef<number | null>(null);
  const [toastShow, setToastShow] = useState(false);
  const [toastMsg, setToastMsg]   = useState('');
  const toastTimerRef = useRef<number | null>(null);

  const quickPillClass = (deadline?: string, checked?: boolean): string => {
    if (checked) return classes.quickDatePillChecked;
    const diff = dayDiffFromToday(deadline);
    if (diff === null) return classes.quickDatePillEmpty;
    if (diff < 0) return classes.quickDatePillOverdue;
    if (diff === 0) return classes.quickDatePillToday;
    if (diff === 1) return classes.quickDatePillTomorrow;
    return classes.quickDatePillFuture;
  };

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
        setProjects(payload.projects);
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
  const navigatePrev = () => {
    if (dateMode === 'today') setFocusDay(d => addDaysYMD(d, -1));
    else if (dateMode === 'week') setFocusDay(d => addDaysYMD(d, -7));
    else if (dateMode === 'month') setFocusDay(d => {
      if (!isValidDateYYYYMMDD(d)) return d;
      const [y, m] = d.split('-').map(Number);
      const prev = m === 1 ? new Date(y - 1, 11, 1) : new Date(y, m - 2, 1);
      return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`;
    });
  };
  const navigateNext = () => {
    if (dateMode === 'today') setFocusDay(d => addDaysYMD(d, +1));
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
    () => buildHiddenMap(blocks, { collapsed, showHidden: false, dateMode, focusDay, sortBy }),

    [blocks, collapsed, dateMode, focusDay, sortBy],
  );
  const hiddenByListMap = useMemo(
    () => buildListVisibilityHiddenMap(blocks, visibleLists),
    [blocks, visibleLists],
  );

  /** Progress block — scoped to tasks currently visible with active filters */
  const progress = useMemo(() => {
    const visibleTasks = blocks.filter(b =>
      b.indent > 0 &&
      b.archived !== true &&
      (showCompleted || b.checked !== true) &&
      !hiddenMap[b.id] &&
      !hiddenByListMap[b.id],
    );
    const total = visibleTasks.length;
    const done = visibleTasks.filter(t => t.checked === true).length;
    const remaining = Math.max(0, total - done);
    const pct = total > 0 ? done / total : 0;
    return { total, done, remaining, pct };
  }, [blocks, hiddenMap, hiddenByListMap, showCompleted]);

  const isBrandNewEmpty = useMemo(
    () => blocks.length === 1 && isUncTitleBlock(blocks[0]),
    [blocks],
  );

  const listTitlesRaw = useMemo(
    () => blocks
      .filter(b => b.indent === 0 && !isUncTitleBlock(b) && b.archived !== true)
      .map(b => ({ id: b.id, text: (b.text || '').trim() }))
      .filter(t => t.text.length > 0),
    [blocks],
  );

  const listTitles = useMemo(() => {
    const seen = new Set<string>();
    return listTitlesRaw.filter(t => {
      const k = t.text.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
  }, [listTitlesRaw]);

  /* ── Block action wrappers ── */
  const handleUpdateBlock = (id: string, patch: Partial<Block>) => {
    const isChecking = typeof patch.checked === 'boolean' && patch.checked === true;

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

  const handleAddTaskUnderList = (listId: string, deadlineOverride?: string) => {
    let newTaskId = '';
    setCurrentBlocks(prev => {
      const result = addTaskUnderListArr(prev, listId, {
        deadline: deadlineOverride,
        focusDay,
      });
      newTaskId = result.newTaskId;
      return result.blocks;
    });
    setCurrentCollapsed(prev => ({ ...prev, [listId]: false }));
    requestAnimationFrame(() => {
      const el = inputRefs.current[newTaskId];
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus(); el.setSelectionRange(0, 0);
    });
  };

  const handleCreateBlankList = () => {
    let newListId = '';
    setCurrentBlocks(prev => {
      const result = createBlankList(prev, { focusDay });
      newListId = result.newListId;
      return result.blocks;
    });
    setCurrentCollapsed(prev => ({ ...prev, [newListId]: false }));
    requestAnimationFrame(() => {
      const el = inputRefs.current[newListId];
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
      el.setSelectionRange(0, 0);
    });
  };

  const handleCreateList = (listText: string) => {
    let ids = { newListId: '', newTaskId: '' };
    setCurrentBlocks(prev => {
      const result = createListArr(prev, listText, { focusDay });
      ids = { newListId: result.newListId, newTaskId: result.newTaskId };
      if (result.existed) {
        setCurrentCollapsed(c => ({ ...c, [result.newListId]: false }));
      } else {
        setCurrentCollapsed(c => ({ ...c, [result.newListId]: false }));
      }
      return result.blocks;
    });
    requestAnimationFrame(() => {
      const el = inputRefs.current[ids.newTaskId];
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus(); el.setSelectionRange(0, 0);
    });
    return ids;
  };

  const toggleList = (listId: string) =>
    setCurrentCollapsed(prev => ({ ...prev, [listId]: !prev[listId] }));

  /* ── Keyboard handler ── */
const handleKey = (
  e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  b: Block,
) => {
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault();
    handleCreateBlankList();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (b.indent === 0) {
      const reuseId = findFirstEmptyTaskUnderList(blocks, b.id);
      if (reuseId) {
        setCurrentCollapsed(prev => ({ ...prev, [b.id]: false }));
        focusBlock(reuseId, false);
        return;
      }
      handleAddTaskUnderList(b.id, isValidDateYYYYMMDD(focusDay) ? focusDay : todayYMD());
    } else {
      handleInsertAfter(
        b.id,
        makeTaskBlock(
          { id: uid(), indent: b.indent, deadline: isValidDateYYYYMMDD(focusDay) ? focusDay : todayYMD() },
          focusDay,
        ),
      );
    }
    return;
  }
  // Tab eliminado — no se permiten subtareas por teclado
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

      // Insert after the target (or first if dropped on list header)
      const insertAfter = target.indent === 0 ? -Infinity : target.order;
      const insertIdx = siblings.filter(b => b.order <= insertAfter).length;
      siblings.splice(insertIdx, 0, dragged);

      return prev.map(b => {
        const i = siblings.findIndex(s => s.id === b.id);
        if (i < 0) return b;
        return { ...b, order: i, parentId: newParentId };
      });
    });
  };
  const onDragEndRow = () => { dragRef.current = null; setDragOverId(null); };

  /* ── List modal ── */
  const [listModalOpen, setListModalOpen] = useState(false);
  const [listPickId, setListPickId]       = useState<string>('');
  const [listNewText, setListNewText]     = useState<string>('');
  const [pivotSearch, setPivotSearch]     = useState('');
  const [deleteListConfirmId, setDeleteListConfirmId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingListTitleId, setEditingListTitleId] = useState<string | null>(null);
  const confirmListModal = () => {
    const newName = listNewText.trim();
    if (newName) { handleCreateList(newName); setListModalOpen(false); return; }
    let pickId = listPickId;
    if (!pickId) {
      const el = document.querySelector<HTMLInputElement>('input[name="listPick"]:checked');
      if (el?.value) pickId = el.value;
    }
    if (pickId) { handleAddTaskUnderList(pickId); setListModalOpen(false); return; }
    setListModalOpen(false);
  };

  const openNewListModal = () => { setListModalOpen(true); setListPickId(''); setListNewText(''); };


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

  const listTitleSignature = (value: string) =>
    value
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(part => part.toLocaleLowerCase())
      .sort()
      .join(' ');

  const openPivotFromSearch = (rawValue: string) => {
    const query = rawValue.trim();
    if (!query) return;

    const querySignature = listTitleSignature(query);
    const matchedList = blocks.find(b => {
      if (b.indent !== 0) return false;
      if (isUncTitleBlock(b)) return false;
      if (b.archived === true) return false;
      const title = (b.text || '').trim();
      if (!title) return false;
      return listTitleSignature(title) === querySignature;
    });

    if (matchedList) {
      const title = (matchedList.text || '').trim() || query;
      onOpenPivot?.({
        word: title,
        blockId: matchedList.id,
        listId: matchedList.id,
        origin: 'quick',
      });
      return;
    }

    onOpenPivot?.({ word: query, blockId: null, origin: 'quick' });
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
          onBlur={() => setEditingTaskId(prev => (prev === b.id ? null : prev))}
          className={[
            'bg-transparent outline-none p-0 text-[13px] md:text-sm resize-none overflow-hidden w-full min-w-0 transition-opacity duration-150',
            isEditing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none absolute inset-0',
          ].join(' ')}
          style={{
            lineHeight: '1.45',
            minHeight: '1.45em',
            color: b.checked ? 'var(--assistant-text-faint)' : 'var(--assistant-text-soft)',
            textDecoration: b.checked ? 'line-through' : 'none',
          }}
        />

        {!isEditing ? (
          <div
            className="text-[13px] md:text-sm whitespace-pre-wrap break-words leading-[1.45] min-h-[1.45em]"
            style={{
              color: b.checked ? 'var(--assistant-text-faint)' : 'var(--assistant-text-soft)',
              textDecoration: b.checked ? 'line-through' : 'none',
            }}
            onDoubleClick={() => focusBlock(b.id, true)}
          >
            {tokens.map((token, idx) => {
              if (/^\s+$/.test(token)) return <React.Fragment key={`${b.id}-ws-${idx}`}>{token}</React.Fragment>;
              const clickable = isClickableWord(token);
              return (
                <span
                  key={`${b.id}-tk-${idx}`}
                  className={
                    clickable
                      ? 'cursor-pointer hover:underline decoration-[var(--assistant-accent)] underline-offset-[3px]'
                      : 'cursor-default'
                  }
                  onClick={clickable ? () => openPivotForWord(b.id, token) : undefined}
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
  const renderNormalList = () => {
    // Group by parentId, sort each group by order
    const listBlocks: Block[] = [];
    const tasksByParent = new Map<string | null, Block[]>();
    for (const b of blocks) {
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
    const dragDots = (
      <svg width="8" height="13" viewBox="0 0 8 13" fill="currentColor" aria-hidden="true">
        <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
        <circle cx="2" cy="6.5" r="1.2"/><circle cx="6" cy="6.5" r="1.2"/>
        <circle cx="2" cy="11" r="1.2"/><circle cx="6" cy="11" r="1.2"/>
      </svg>
    );
    const editIcon = (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 2.5l3 3L5.5 13.5H2.5v-3L10.5 2.5z" />
      </svg>
    );

    return (
      <div className="space-y-1 quick-rows">
        {listBlocks.map(listBlock => {
          if (hiddenByListMap[listBlock.id]) return null;
          const isUncList = isUncTitleBlock(listBlock);
          const tasks = tasksByParent.get(listBlock.id) ?? [];
          const lDragOver = dragOverId === listBlock.id && dragRef.current?.id !== listBlock.id;
          const lDragMe   = dragRef.current?.id === listBlock.id;

          return (
            <React.Fragment key={listBlock.id}>
              {/* ── List header (hidden for Uncategorized) ── */}
              {!isUncList && (
                <div
                  draggable
                  onDragStart={e => onDragStartRow(e, listBlock.id)}
                  onDragOver={e => onDragOverRow(e, listBlock.id)}
                  onDrop={e => onDropRow(e, listBlock.id)}
                  onDragEnd={onDragEndRow}
                  className={['group flex items-center px-0.5 py-1 rounded-md gap-2', lDragOver ? classes.dragOver : '', lDragMe ? 'opacity-60' : ''].join(' ')}
                  style={{ paddingLeft: 2 }}>
                  <div className={`w-3 shrink-0 select-none opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing ${classes.dragHandle}`} title="Drag">
                    {dragDots}
                  </div>
                  <button type="button" onClick={() => toggleList(listBlock.id)} className={`w-3 shrink-0 transition-colors ${classes.quickCollapseBtn}`} title={collapsed[listBlock.id] ? 'Expand' : 'Collapse'}>
                    {collapsed[listBlock.id] ? '▸' : '▾'}
                  </button>
                  {editingListTitleId !== listBlock.id ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingListTitleId(listBlock.id);
                        requestAnimationFrame(() => {
                          const el = inputRefs.current[listBlock.id];
                          if (!el) return;
                          el.focus();
                          const len = el.value.length;
                          el.setSelectionRange(len, len);
                        });
                      }}
                      aria-label="Edit list title"
                      title="Edit list title"
                      className={`shrink-0 h-4 w-4 flex items-center justify-center text-[11px] opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-all duration-150 ${classes.quickEditBtn}`}
                    >
                      {editIcon}
                    </button>
                  ) : null}
                  <div className="min-w-0 flex-1 flex flex-wrap items-center gap-0.5">
                    {editingListTitleId === listBlock.id ? (
                      <input
                        ref={el => void (inputRefs.current[listBlock.id] = el)}
                        value={listBlock.text}
                        placeholder="List…"
                        onChange={e => handleUpdateBlock(listBlock.id, { text: e.target.value })}
                        onKeyDown={e => handleKey(e, listBlock)}
                        onBlur={() => setEditingListTitleId(null)}
                        className="flex-none bg-transparent text-[13px] md:text-sm font-semibold outline-none"
                        style={{ width: `${inputWidthPx(listBlock.text)}px`, maxWidth: 'calc(100% - 48px)', color: 'var(--assistant-text)' }}
                      />
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        className="quick-word-clickable flex-none truncate text-[13px] md:text-sm font-semibold"
                        style={{ maxWidth: 'calc(100% - 48px)', color: 'var(--assistant-text)' }}
                        onClick={(e) => { e.stopPropagation(); openPivotForList(listBlock); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPivotForList(listBlock); } }}
                        onDoubleClick={(e) => { e.stopPropagation(); setEditingListTitleId(listBlock.id); requestAnimationFrame(() => inputRefs.current[listBlock.id]?.focus()); }}
                      >
                        {(listBlock.text || '').trim() ? listBlock.text : 'List…'}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddTaskUnderList(listBlock.id)}
                    className={`ml-auto shrink-0 text-[15px] md:text-[18px] w-7 h-7 flex items-center justify-center rounded-full transition-all hover:scale-105 hover:shadow-lg ${classes.quickAddTaskBtn}`}
                  >
                    +
                  </button>
                </div>
              )}
              {/* ── Tasks belonging to this list ── */}
              {tasks.map(task => {
                if (hiddenMap[task.id] || hiddenByListMap[task.id]) return null;
                if (!showCompleted && task.checked === true) return null;
                const tDragOver = dragOverId === task.id && dragRef.current?.id !== task.id;
                const tDragMe   = dragRef.current?.id === task.id;
                return (
                  <React.Fragment key={task.id}>
                    <div
                      draggable
                      onDragStart={e => onDragStartRow(e, task.id)}
                      onDragOver={e => onDragOverRow(e, task.id)}
                      onDrop={e => onDropRow(e, task.id)}
                      onDragEnd={onDragEndRow}
                      className={['group flex items-center px-0.5 py-1 rounded-md gap-1', tDragOver ? classes.dragOver : '', tDragMe ? 'opacity-60' : ''].join(' ')}
                      style={{ paddingLeft: isUncList ? 6 : 8 + task.indent * 16 }}>
                      <div className={`w-3 shrink-0 select-none opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing ${classes.dragHandle}`} title="Drag">
                        {dragDots}
                      </div>
                      <div className="w-3 shrink-0" />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEditingTaskId(task.id); focusBlock(task.id, true); }}
                        aria-label="Edit task"
                        title="Edit task"
                        className={`shrink-0 h-4 w-4 flex items-center justify-center text-[11px] opacity-0 group-hover:opacity-70 hover:opacity-100! transition-all duration-150 ${classes.quickEditBtn}`}
                      >
                        {editIcon}
                      </button>
                      <TaskFlagButton
                        source={task}
                        onChange={(next) => handleUpdateBlock(task.id, { flag: next, priority: undefined })}
                      />
                      <button type="button" onClick={() => handleUpdateBlock(task.id, { checked: !task.checked })}
                        className="relative h-4 w-4 shrink-0 flex items-center justify-center group-hover:scale-[1.06] transition-transform"
                        title="Complete">
                        {pulseId === task.id ? (
                          <>
                            <span className={`absolute -inset-2 rounded-full border animate-ping ${classes.quickPulseRing1}`} />
                            <span className={`absolute -inset-3 rounded-full border animate-ping [animation-delay:90ms] ${classes.quickPulseRing2}`} />
                            <span className={`absolute -inset-4 rounded-full border animate-ping [animation-delay:160ms] ${classes.quickPulseRing3}`} />
                            <span className={`absolute -inset-2 rounded-full blur-sm ${classes.quickPulseGlow}`} />
                          </>
                        ) : null}
                        {task.checked ? (
                          <span className="relative flex h-3 w-3 items-center justify-center">
                            <span className={`absolute h-2.5 w-2.5 rounded-full blur-[2px] ${classes.quickCheckboxGlow}`} />
                            <span className={`absolute h-1.5 w-1.5 rounded-full ${classes.quickCheckboxFill}`} />
                          </span>
                        ) : (
                          <span className={`h-3 w-3 rounded ${classes.quickCheckbox}`} />
                        )}
                      </button>
                      <div className="min-w-0 flex-1 flex items-center gap-1.5">
                        {renderTaskTextWithWordHover(task)}
                        {editingDateTaskId === task.id ? (
                          <input
                            ref={el => void (inlineDateRefs.current[task.id] = el)}
                            autoFocus
                            type="date"
                            lang="en-US"
                            className={`shrink-0 mt-0.5 text-[11px] px-1.5 py-0.5 rounded-full outline-none ${classes.quickDatePillInput}`}
                            value={isValidDateYYYYMMDD(task.deadline) ? task.deadline : ''}
                            onChange={e => {
                              const v = e.target.value;
                              handleUpdateBlock(task.id, { deadline: v ? v : undefined });
                              setEditingDateTaskId(null);
                            }}
                            onBlur={() => setEditingDateTaskId(null)}
                            onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter') setEditingDateTaskId(null); }}
                          />
                        ) : (
                          <button
                            type="button"
                            className={`shrink-0 mt-0.5 text-[11px] px-1.5 py-0.5 rounded-full transition-colors ${quickPillClass(task.deadline, task.checked)}`}
                            title="Set date"
                            onClick={() => setEditingDateTaskId(task.id)}
                          >
                            {formatPill(task.deadline) || '📅'}
                          </button>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const actionsPanelProps = {
    dateMode, setDateMode, showCompleted, setShowCompleted,
    sortBy, setSortBy,
  };

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
        <div className="text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-0 flex flex-col overflow-hidden bg-transparent" style={{ color: 'var(--assistant-text)' }}>
      <ConfettiRain show={showConfetti} />
      <GamificationToast show={toastShow} message={toastMsg} />
      <style>{`
        .quick-word-clickable { cursor: pointer; }
      `}</style>

      {/* Mobile bottom sheet */}
      {(drawerOpen || drawerClosing) && (
        <div className="md:hidden fixed inset-0 z-40">
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
              <span className="text-[13px] font-semibold" style={{ color: 'var(--assistant-text-soft)' }}>Filters &amp; Search</span>
              <button type="button" onClick={closeDrawer} className={`flex h-7 w-7 items-center justify-center rounded-md ${classes.quickDrawerCloseBtn}`}>✕</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-3">
              <QuickProgressBlock progress={progress} className="mb-3" />
              <div className="mb-3 overflow-hidden rounded-2xl" style={{ border: '1px solid var(--assistant-border-soft)' }}>
                <MiniCalendar onPickDay={handleMiniCalendarPickDay} compact />
              </div>
              <input
                type="text"
                value={pivotSearch}
                onChange={e => setPivotSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    openPivotFromSearch(pivotSearch);
                    closeDrawer();
                  }
                }}
                placeholder="Search keyword"
                className={`mb-3 w-full rounded-xl px-3 py-2 text-[12px] ${classes.quickSearchInput}`}
              />
              <ActionsPanel {...actionsPanelProps} />
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-3 pt-2 pb-0 md:px-8 md:py-8">
          <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
            <div className={`min-h-0 min-w-0 flex-1 flex flex-col rounded-2xl overflow-hidden ${classes.quickCard}`}>
              <div className="min-h-0 flex-1 overflow-y-auto pb-16 md:pb-0 [scrollbar-gutter:stable]">

              {/* Date pagination header — sticky within main column scroll */}
              <div className="sticky top-0 z-30">
                <div className={`flex items-center justify-between gap-1 px-3 py-2.5 md:gap-3 md:px-4 md:py-3 ${classes.quickHeaderBar}`}>

                  {/* Left: navigation */}
                  <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={navigatePrev}
                      disabled={navDisabled}
                      className={`grid place-items-center size-8 shrink-0 text-[22px] md:text-[28px] leading-none transition-colors ${classes.quickNavArrow}`}
                    >
                      ‹
                    </button>

                    <button
                      type="button"
                      onClick={navigateNext}
                      disabled={navDisabled}
                      className={`grid place-items-center size-8 shrink-0 text-[22px] md:text-[28px] leading-none transition-colors ${classes.quickNavArrow}`}
                    >
                      ›
                    </button>

                  </div>

                  {/* Center: title */}
                  <div className="flex-1 text-center">
                    <div className="text-[15px] md:text-[18px] font-semibold tracking-tight" style={{ color: 'var(--assistant-text)' }}>
                      {dateMode === 'today' && (
                        <>
                          {labelForYMD(focusDay)}{" "}
                          <span style={{ color: 'var(--assistant-text-faint)', fontWeight: 500 }}>
                            ({formatPill(focusDay)})
                          </span>
                        </>
                      )}

                      {dateMode === 'week' && (
                        <>
                          Week{" "}
                          <span style={{ color: 'var(--assistant-text-faint)', fontWeight: 500 }}>
                            {getWeekRangeLabel(focusDay)}
                          </span>
                        </>
                      )}

                      {dateMode === 'month' && (
                        <>
                          Month{" "}
                          <span style={{ color: 'var(--assistant-text-faint)', fontWeight: 500 }}>
                            {getMonthRangeLabel(focusDay)}
                          </span>
                        </>
                      )}

                      {dateMode === 'all' && (
                        <span style={{ color: 'var(--assistant-text-soft)' }}>All dated tasks</span>
                      )}
                    </div>
                  </div>

                  {/* Right: New List */}
                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={openNewListModal}
                      className={`hidden md:flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-xl transition-all hover:scale-105 ${classes.quickNewListBtn}`}
                    >
                      <span className="text-[15px] leading-none">+</span>
                      <span>New List</span>
                    </button>

                    {/* Kebab menu (⋮) — export, etc. */}
                    <div className="relative" ref={quickMenuRef}>
                      <button
                        type="button"
                        onClick={() => setQuickMenuOpen(o => !o)}
                        className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${classes.quickMenuBtn}`}
                        aria-haspopup="menu"
                        aria-expanded={quickMenuOpen}
                        aria-label="More options"
                        title="More options"
                      >
                        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                          <circle cx="8" cy="3" r="1.4" />
                          <circle cx="8" cy="8" r="1.4" />
                          <circle cx="8" cy="13" r="1.4" />
                        </svg>
                      </button>

                      {quickMenuOpen && (
                        <div
                          role="menu"
                          className="absolute right-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-xl shadow-2xl"
                          style={{ background: 'var(--assistant-panel-bg)', border: '1px solid var(--assistant-border-soft)' }}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => { downloadTasksExcel(blocks, currentProject?.title); setQuickMenuOpen(false); }}
                            className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[12px] ${classes.quickMenuItem}`}
                          >
                            <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v7m0 0L5.5 6.5M8 9l2.5-2.5" />
                              <path strokeLinecap="round" d="M2.75 11.5v1A1.75 1.75 0 0 0 4.5 14.25h7a1.75 1.75 0 0 0 1.75-1.75v-1" />
                            </svg>
                            <span>Download Excel</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Mobile settings */}
                    <button
                      type="button"
                      onClick={() => setDrawerOpen(true)}
                      className={`md:hidden flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-medium transition ${classes.quickMobileSettings}`}
                    >
                      <span>⚙</span>
                      <span className="capitalize">{dateMode}</span>
                    </button>
                  </div>
                </div>
              </div>



              <div className="px-3 pt-3">
                {isBrandNewEmpty ? (
                  <div className={`rounded-2xl p-5 ${classes.quickEmptyState}`}>
                    <div className="text-sm font-semibold" style={{ color: 'var(--assistant-text)' }}>Start here</div>
                    <div className="text-[12px] mt-1" style={{ color: 'var(--assistant-text-muted)' }}>Create your first list and then add tasks under it.</div>
                    <button
                      type="button"
                      onClick={openNewListModal}
                      className={`mt-4 max-w-[260px] w-full text-left text-[13px] px-4 py-3 rounded-2xl transition-colors wobble-loop ${classes.quickCtaBtn}`}
                    >
                      + New List
                    </button>
                    <div className="text-[11px] mt-3" style={{ color: 'var(--assistant-text-faint)' }}>Hint: after you create a list, you&apos;ll always see an <span style={{ color: 'var(--assistant-text-muted)' }}>+ task</span> button right below it.</div>
                  </div>
                ) : renderNormalList()}
              </div>

              {/* In-flow spacer: fixed footer (z-[45]) does not reserve layout space */}
              <div
                aria-hidden
                className="w-full shrink-0"
                style={{
                  height: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
                }}
              />
              </div>
            </div>

            {/* Desktop sidebar — outside main scroll: stays fixed while lists scroll */}
            <div className="hidden max-h-[77vh] min-h-0 w-[270px] shrink-0 flex-col md:flex">
              <div className={`flex max-h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl ${classes.quickSidePanel}`}>
                <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] px-3 py-3">
                  <QuickProgressBlock progress={progress} className="mb-3" />
                  <div className="mb-3 overflow-hidden rounded-2xl" style={{ border: '1px solid var(--assistant-border-soft)' }}>
                    <MiniCalendar onPickDay={handleMiniCalendarPickDay} compact />
                  </div>
                  <input
                    type="text"
                    value={pivotSearch}
                    onChange={e => setPivotSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        openPivotFromSearch(pivotSearch);
                      }
                    }}
                    placeholder="Search keyword"
                    className={`mb-3 w-full rounded-xl px-3 py-2 text-[12px] ${classes.quickSearchInput}`}
                  />
                  <ActionsPanel {...actionsPanelProps} />
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

        {/* List Modal */}
        {listModalOpen ? (
          <div className="fixed inset-0 z-[999] flex items-center justify-center">
            <button type="button" className="absolute inset-0 bg-black/60" onClick={() => setListModalOpen(false)} aria-label="Close" />
            <div className={`relative w-[92vw] max-w-md rounded-2xl shadow-2xl ${classes.quickModal}`}>
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
                <div className="text-sm font-semibold" style={{ color: 'var(--assistant-text)' }}>Select or create List</div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--assistant-text-muted)' }}>Pick an existing list to add a task under it, or type a new one.</div>
              </div>
              <div className="px-4 py-3">
                <div className="mb-3">
                  <div className="text-[11px] mb-1" style={{ color: 'var(--assistant-text-muted)' }}>Create new</div>
                  <input value={listNewText} onChange={e => setListNewText(e.target.value)} placeholder="Type a new list name…"
                    className={`w-full rounded-md text-[12px] px-3 py-2 ${classes.quickSearchInput}`}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmListModal(); } if (e.key === 'Escape') setListModalOpen(false); }} />
                  <div className="text-[11px] mt-1" style={{ color: 'var(--assistant-text-faint)' }}>If that list already exists, it will not create a duplicate — it just adds a task under it.</div>
                </div>
                <div>
                  <div className="text-[11px] mb-1" style={{ color: 'var(--assistant-text-muted)' }}>Or select existing</div>
                  <div className="max-h-56 overflow-auto rounded-xl" style={{ border: '1px solid var(--assistant-border-soft)', background: 'var(--assistant-surface)' }}>
                    {listTitles.length ? (
                      <div className="p-2 space-y-1">
                        {listTitles.map(t => (
                          <label key={t.id} className={`flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors ${classes.quickModalListItem}`}>
                            <input type="radio" name="listPick" value={t.id} checked={listPickId === t.id} onChange={e => setListPickId(e.target.value)} onClick={e => { const v = (e.currentTarget as HTMLInputElement).value; if (v) setListPickId(v); }} />
                            <span className="text-[12px]" style={{ color: 'var(--assistant-text-soft)' }}>{t.text}</span>
                          </label>
                        ))}
                      </div>
                    ) : <div className="p-3 text-[12px]" style={{ color: 'var(--assistant-text-muted)' }}>No lists yet.</div>}
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--assistant-border-soft)' }}>
                <button type="button" onClick={() => setListModalOpen(false)} className={`text-[12px] px-3 py-2 rounded-md ${classes.quickModalSecondary}`}>Cancel</button>
                <button type="button" onClick={confirmListModal} className={`text-[12px] px-3 py-2 rounded-md ${classes.quickModalPrimary}`}>Select</button>
              </div>
            </div>
          </div>
        ) : null}

        {deleteListConfirmId ? (
          <div className="fixed inset-0 z-[999] flex items-center justify-center">
            <button
              type="button"
              className="absolute inset-0 bg-black/60"
              onClick={() => { setDeleteListConfirmId(null); armedDeleteListRef.current = null; }}
              aria-label="Close"
            />
            <div className={`relative w-[92vw] max-w-md rounded-2xl shadow-2xl ${classes.quickModal}`}>
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
                <div className="text-sm font-semibold" style={{ color: 'var(--assistant-text)' }}>Delete list?</div>
                <p className="text-[12px] mt-2 leading-relaxed" style={{ color: 'var(--assistant-text-soft)' }}>
                  Are you sure you want to delete this list and all its child tasks?
                </p>
                <p className="text-[11px] text-rose-200/90 mt-2">
                  If you choose Yes, every task in this list is removed permanently.
                </p>
                {(() => {
                  const t = blocks.find(x => x.id === deleteListConfirmId)?.text?.trim();
                  if (!t) return null;
                  return <div className="text-[11px] mt-2 truncate" title={t} style={{ color: 'var(--assistant-text-faint)' }}>List: {t}</div>;
                })()}
              </div>
              <div className="px-4 py-3 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--assistant-border-soft)' }}>
                <button
                  type="button"
                  onClick={() => { setDeleteListConfirmId(null); armedDeleteListRef.current = null; }}
                  className={`text-[12px] px-3 py-2 rounded-md ${classes.quickModalSecondary}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { if (deleteListConfirmId) handleConfirmDeleteList(deleteListConfirmId); }}
                  className="text-[12px] px-3 py-2 rounded-md bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 transition-colors"
                >
                  Yes, delete
                </button>
              </div>
            </div>
          </div>
        ) : null}

      <OnboardingModal />
    </div>
  );
}
