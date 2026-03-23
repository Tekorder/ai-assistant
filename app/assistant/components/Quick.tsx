// app/components/Quick.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { OnboardingModal } from './OnboardingModal';

import {
  // Types
  type Block,
  type Project,
  type ListSection,
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
  removeTitleSendChildrenToUnc,
  updateBlock as updateBlockArr,
  addTaskUnderList as addTaskUnderListArr,
  createList as createListArr,
  // UI helpers
  formatPill,
  pillClass,
  labelForYMD,
  weekdayLabel,
  fullDateLabel,
  getWeekRangeLabel,
  getMonthRangeLabel,
  todayYMD,
  isValidDateYYYYMMDD,
  addDaysYMD,
  // Filter / view helpers
  buildHiddenMap,
  buildListSections,
  buildSplitDays,
} from '@/lib/datacenter';

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
        @keyframes gamiPulseGlow{0%,100%{box-shadow:0 10px 30px rgba(16,185,129,.14),inset 0 1px 0 rgba(255,255,255,.06)}50%{box-shadow:0 12px 38px rgba(16,185,129,.22),inset 0 1px 0 rgba(255,255,255,.09)}}
      `}</style>
      <div className="pointer-events-none fixed left-1/2 bottom-24 md:bottom-8 z-[9998]">
        <div className="relative overflow-hidden min-w-[320px] md:min-w-[420px] max-w-[90vw] rounded-3xl border border-emerald-400/20 bg-gray-950/95 backdrop-blur-xl px-6 py-5 md:px-8 md:py-6 text-center"
          style={{ transform:'translateX(-50%)', animation:'gamiToastIn .35s cubic-bezier(.22,.9,.28,1), gamiPulseGlow 1.6s ease-in-out infinite' }}>
          <span className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-white/10 blur-md" style={{ animation:'gamiShine 2.8s ease-in-out infinite' }} />
          <div className="mb-2 flex items-center justify-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.9)]" />
            <span className="text-[11px] md:text-[12px] font-semibold uppercase tracking-[0.24em] text-emerald-300/90">Progress</span>
          </div>
          <div className="text-[16px] md:text-[20px] font-semibold text-white/95 leading-tight">{message}</div>
        </div>
      </div>
    </>
  );
}

/* ===================== Actions Panel ===================== */
function ActionsPanel({
  dateMode, setDateMode, splitMode, setSplitMode,
  showEmptyLists, setShowEmptyLists, showHidden, setShowHidden,
  sortBy, setSortBy,
  onNewList,
}: {
  dateMode: DateMode; setDateMode: (m: DateMode) => void;
  splitMode: boolean; setSplitMode: (v: boolean | ((p: boolean) => boolean)) => void;
  showEmptyLists: boolean; setShowEmptyLists: (v: boolean | ((p: boolean) => boolean)) => void;
  showHidden: boolean; setShowHidden: (v: boolean | ((p: boolean) => boolean)) => void;
  sortBy: SortBy; setSortBy: (v: SortBy) => void;
  onNewList: () => void;
}) {
  const toggle = (label: string, active: boolean, onClick: () => void) => (
    <button type="button" onClick={onClick}
      className={['w-full flex items-center justify-between text-[12px] px-3 py-2 rounded-xl border transition-colors',
        active ? 'border-emerald-400/25 bg-emerald-500/15 text-emerald-100' : 'border-white/10 text-white/70 hover:text-white/90 hover:bg-white/5'].join(' ')}>
      <span>{label}</span>
      <span className={['inline-flex h-5 w-9 rounded-full p-[2px] transition-colors', active ? 'bg-emerald-400/25' : 'bg-white/10'].join(' ')}>
        <span className={['h-4 w-4 rounded-full bg-white transition-transform', active ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
      </span>
    </button>
  );

  const filterBtn = (mode: DateMode, label: string) => (
    <button type="button" key={mode} onClick={() => setDateMode(mode)}
      className={['w-full text-left text-[12px] px-3 py-2 rounded-xl border transition-colors',
        dateMode === mode ? 'border-emerald-400/25 bg-emerald-500/15 text-emerald-100' : 'border-white/10 text-white/70 hover:text-white/90 hover:bg-white/5'].join(' ')}>
      {label}
    </button>
  );

  return (
    <div className="p-2 space-y-2 overflow-y-auto">
      <button type="button" onClick={onNewList}
        className="w-full text-left text-[12px] px-3 py-2 rounded-xl border transition-colors border-white/10 text-white/70 hover:text-white/90 hover:bg-white/5">
        + New List
      </button>

      {toggle('View by Days', splitMode, () => setSplitMode(s => !s))}
      {splitMode && toggle('Show Empty Lists', showEmptyLists, () => setShowEmptyLists(s => !s))}

      <div className="h-px bg-white/10 my-1" />

      <div className="px-3 py-1">
        <div className="text-[11px] text-white/50 mb-1.5">View By</div>
        <div className="space-y-1">
          {([['dueDate', 'Due Date'], ['createdAt', 'Created Date']] as const).map(([value, label]) => (
            <label key={value} onClick={() => setSortBy(value)}
              className="flex items-start gap-2 text-[12px] px-2 py-1.5 rounded-lg cursor-pointer hover:bg-white/5 transition-colors group">
              <span className={[
                'mt-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors shrink-0',
                sortBy === value ? 'border-emerald-400 bg-emerald-500/30' : 'border-white/30 group-hover:border-white/50'
              ].join(' ')}>
                {sortBy === value && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 block" />}
              </span>
              <span className="flex flex-col">
                <span className={sortBy === value ? 'text-emerald-100' : 'text-white/70'}>{label}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="h-px bg-white/10 my-1" />
      <div className="px-3 py-1"><div className="text-[11px] text-white/50">Filters</div></div>

      {filterBtn('today', 'Today')}
      {filterBtn('week', 'Week')}
      {filterBtn('month', 'Month')}
      {filterBtn('all', 'All')}

      <div className="h-px bg-white/10 my-1" />

      <button type="button" onClick={() => setShowHidden(s => !s)}
        className={['w-full text-left text-[12px] px-3 py-2 rounded-xl border transition-colors',
          showHidden ? 'border-emerald-400/25 bg-emerald-500/15 text-emerald-100' : 'border-white/10 text-white/70 hover:text-white/90 hover:bg-white/5'].join(' ')}>
        {showHidden ? 'Hide dismissed' : 'Show dismissed'}
      </button>
    </div>
  );
}

/* ===================== Main Component ===================== */

export default function Quick() {

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [hydrated, setHydrated] = useState(false);

  const [dateMode, setDateMode] = useState<DateMode>('today');
  const [focusDay, setFocusDay] = useState<string>(todayYMD());
  const [showHidden, setShowHidden] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [showEmptyLists, setShowEmptyLists] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('dueDate');

  const [drawerOpen, setDrawerOpen] = useState(false);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const dateRefs  = useRef<Record<string, HTMLInputElement | null>>({});
  const dragRef   = useRef<{ id: string; fromIndex: number } | null>(null);
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

  useEffect(() => {
    audioCheckRef.current = new Audio('/sounds/notif.mp3');
    audioDoneRef.current  = new Audio('/sounds/notif2.mp3');
    audioCheckRef.current.preload = 'auto';
    audioDoneRef.current.preload  = 'auto';
    return () => {
      if (pulseTimerRef.current)    window.clearTimeout(pulseTimerRef.current);
      if (confettiTimerRef.current) window.clearTimeout(confettiTimerRef.current);
      if (toastTimerRef.current)    window.clearTimeout(toastTimerRef.current);
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
      () => currentProject?.collapsed ?? {},
      [currentProject?.collapsed],
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
      newBlocks     = moveUncToTop(ensureUncExists(newBlocks));
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
    () => buildHiddenMap(blocks, { collapsed, showHidden, dateMode, focusDay, sortBy }),
   
    [blocks, collapsed, showHidden, dateMode, focusDay, sortBy],
  );

  const listSections = useMemo<ListSection[]>(
    () => buildListSections(blocks),
    [blocks],
  );

  const splitDays = useMemo(
    () => buildSplitDays({ dateMode, focusDay, blocks, showHidden, sortBy }),
   
    [dateMode, focusDay, blocks, showHidden, sortBy],
  );

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
        b => b.indent > 0 && b.archived !== true && !(b.isHidden === true && !showHidden)
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
          b => b.indent > 0 && b.archived !== true && !(b.isHidden === true && !showHidden)
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

  const handleRemoveTitle = (listId: string) => {
    setCurrentBlocks(prev => {
      const i = prev.findIndex(b => b.id === listId);
      const next = removeTitleSendChildrenToUnc(prev, listId);
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
const handleKey = (e: React.KeyboardEvent<HTMLInputElement>, b: Block) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (b.indent === 0) {
      // Lista → agregar tarea bajo ella con la fecha del día en foco
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
      const now = Date.now(); const armed = armedDeleteListRef.current;
      if (armed?.id === b.id && now - armed.t < 800) {
        armedDeleteListRef.current = null;
        handleRemoveTitle(b.id);
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
    const drag = dragRef.current; if (!drag) return;
    const toIndex = blocks.findIndex(b => b.id === overId);
    if (toIndex < 0) return;
    setCurrentBlocks(prev => {
      const next = prev.slice();
      const [item] = next.splice(drag.fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
    dragRef.current = null; setDragOverId(null);
  };
  const onDragEndRow = () => { dragRef.current = null; setDragOverId(null); };

  /* ── List modal ── */
  const [listModalOpen, setListModalOpen] = useState(false);
  const [listPickId, setListPickId]       = useState<string>('');
  const [listNewText, setListNewText]     = useState<string>('');

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

  /* ── Render helpers ── */
  const renderTaskRow = (b: Block, indentPx: number) => {
    const pill = formatPill(b.deadline);
    return (
      <div key={b.id} className={['group flex items-center gap-2 px-0.5 py-1 rounded-md', b.isHidden && showHidden ? 'opacity-40' : ''].join(' ')} style={{ paddingLeft: indentPx }}>
        <div className="w-3 shrink-0" /><div className="w-3 shrink-0" />
        <button type="button" onClick={() => handleUpdateBlock(b.id, { checked: !b.checked })}
          className={['relative h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-[transform,background-color,border-color] duration-150 ease-out group-hover:scale-[1.06]', b.checked ? 'bg-emerald-500/15 border-emerald-400/70' : 'border-white/25'].join(' ')} title="Complete">
          {pulseId === b.id ? (<><span className="absolute -inset-2 rounded-full border border-emerald-400/35 animate-ping" /><span className="absolute -inset-3 rounded-full border border-emerald-300/20 animate-ping [animation-delay:90ms]" /><span className="absolute -inset-4 rounded-full border border-emerald-200/15 animate-ping [animation-delay:160ms]" /><span className="absolute -inset-2 rounded-full bg-emerald-500/10 blur-sm" /></>) : null}
          {b.checked ? <span className="text-emerald-300 text-xs">✓</span> : null}
        </button>
        <div className="min-w-0 flex flex-wrap items-center gap-[2px] w-full">
          <input ref={el => void (inputRefs.current[b.id] = el)} value={b.text} placeholder="Task…" onChange={e => handleUpdateBlock(b.id, { text: e.target.value })} onKeyDown={e => handleKey(e, b)}
            className={['bg-transparent outline-none text-sm flex-none', b.checked ? 'text-white/40 line-through' : 'text-white/80'].join(' ')} style={{ width:`${inputWidthPx(b.text)}px` }} />
          <button type="button" className={['shrink-0 text-[11px] px-1.5 py-0.5 rounded-full border transition-colors', pillClass(b.deadline, b.checked)].join(' ')} title={pill ? 'Change date' : 'Set date'}
            onClick={() => { const el = dateRefs.current[b.id]; if (!el) return; try { (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch {} el.click(); }}>
            {pill ? pill : '📅'}
          </button>
          <input ref={el => void (dateRefs.current[b.id] = el)} type="date" className="hidden" value={isValidDateYYYYMMDD(b.deadline) ? b.deadline : ''} onChange={e => { const v = e.target.value; handleUpdateBlock(b.id, { deadline: v ? v : undefined }); }} />
        </div>
      </div>
    );
  };

  const renderListRow = (list: Block, opts?: { virtualDay?: string; showAddButton?: boolean; subtitle?: string }) => {
    const showAddButton = opts?.showAddButton !== false;
    return (
      <React.Fragment key={`${list.id}${opts?.virtualDay ? `__${opts.virtualDay}` : ''}`}>
        <div className="group flex items-center gap-2 px-0.5 py-1 rounded-md" style={{ paddingLeft: 2 }}>
          <div className="w-3 shrink-0 text-white/20 select-none opacity-0">⋮⋮</div>
          <button type="button" onClick={() => toggleList(list.id)} className="w-3 shrink-0 text-white/35 hover:text-white/60 transition-colors" title={collapsed[list.id] ? 'Expand' : 'Collapse'}>
            {collapsed[list.id] ? '▸' : '▾'}
          </button>
          <div className="min-w-0 flex flex-wrap items-center gap-2 w-full">
            <input ref={el => void (inputRefs.current[list.id] = el)} value={list.text} placeholder="List…" onChange={e => handleUpdateBlock(list.id, { text: e.target.value })} onKeyDown={e => handleKey(e, list)}
              className="bg-transparent outline-none text-sm text-white font-semibold flex-none" style={{ width:`${inputWidthPx(list.text)}px` }} />
            {showAddButton ? (
          <div className="flex items-center" >
           <button
                    type="button"
                    onClick={() => handleAddTaskUnderList(list.id, opts?.virtualDay)}
                    className="mt-1 flex items-center justify-center h-9 w-9 rounded-full border border-white/10 bg-white/5 text-white/60 text-[18px] hover:text-white hover:bg-white/10 transition"
                  >
                    +
                  </button>
          </div>
        ) : null}
          </div>
        </div>
       
      </React.Fragment>
    );
  };

  const renderNormalList = () => {
    const { uncIndex, start: uncStart, end: uncEnd } = findUncRange(blocks);
    return (
      <div className="space-y-1">
        {blocks.map((b, idx) => {
          if (uncIndex >= 0 && idx === uncIndex) return null;
          if (hiddenMap[b.id]) return null;
          const isList    = b.indent === 0;
          const isTask    = b.indent > 0;
          const inUncTasks = uncIndex >= 0 && idx >= uncStart && idx < uncEnd && b.indent > 0;
          const isDraggingOver = dragOverId === b.id && dragRef.current?.id !== b.id;
          const isDraggingMe   = dragRef.current?.id === b.id;
          const isUncList = isList && isUncTitleBlock(b);
          return (
            <React.Fragment key={b.id}>
              <div draggable onDragStart={e => onDragStartRow(e, b.id, idx)} onDragOver={e => onDragOverRow(e, b.id)} onDrop={e => onDropRow(e, b.id)} onDragEnd={onDragEndRow}
                className={['group flex items-center gap-2 px-0.5 py-1 rounded-md', b.isHidden && showHidden ? 'opacity-40' : '', isDraggingOver ? 'bg-white/7 outline outline-1 outline-white/10' : '', isDraggingMe ? 'opacity-60' : ''].join(' ')}
                style={{ paddingLeft: isList ? 2 : inUncTasks ? 6 : 8 + b.indent * 16 }}>
                <div className="w-3 shrink-0 text-white/20 select-none opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" title="Drag">⋮⋮</div>
                {isList ? (
                  <button type="button" onClick={() => toggleList(b.id)} className="w-3 shrink-0 text-white/35 hover:text-white/60 transition-colors" title={collapsed[b.id] ? 'Expand' : 'Collapse'}>
                    {collapsed[b.id] ? '▸' : '▾'}
                  </button>
                ) : <div className="w-3 shrink-0" />}
                {isTask ? (
                  <button type="button" onClick={() => handleUpdateBlock(b.id, { checked: !b.checked })}
                    className={['relative h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-[transform,background-color,border-color] duration-150 ease-out group-hover:scale-[1.06]', b.checked ? 'bg-emerald-500/15 border-emerald-400/70' : 'border-white/25'].join(' ')} title="Complete">
                    {pulseId === b.id ? (<><span className="absolute -inset-2 rounded-full border border-emerald-400/35 animate-ping" /><span className="absolute -inset-3 rounded-full border border-emerald-300/20 animate-ping [animation-delay:90ms]" /><span className="absolute -inset-4 rounded-full border border-emerald-200/15 animate-ping [animation-delay:160ms]" /><span className="absolute -inset-2 rounded-full bg-emerald-500/10 blur-sm" /></>) : null}
                    {b.checked ? <span className="text-emerald-300 text-xs">✓</span> : null}
                  </button>
                ) : null}
                <div className="min-w-0 flex flex-wrap items-center gap-[2px] w-full">
                  <input ref={el => void (inputRefs.current[b.id] = el)} value={b.text} placeholder={isList ? 'List…' : 'Task…'} onChange={e => handleUpdateBlock(b.id, { text: e.target.value })} onKeyDown={e => handleKey(e, b)}
                    className={['bg-transparent outline-none text-sm cursor-pointer transition-opacity duration-150 flex-none', isList ? 'text-white font-semibold' : b.checked ? 'text-white/40 line-through' : 'text-white/80'].join(' ')}
                    style={{ width:`${inputWidthPx(b.text)}px` }} />
                  {isTask ? (
                    <>
                      <button type="button" className={['shrink-0 text-[11px] px-1.5 py-0.5 rounded-full border transition-colors', pillClass(b.deadline, b.checked)].join(' ')} title="Set date"
                        onClick={() => { const el = dateRefs.current[b.id]; if (!el) return; try { (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch {} el.click(); }}>
                        {formatPill(b.deadline) || '📅'}
                      </button>
                      <input ref={el => void (dateRefs.current[b.id] = el)} type="date" className="hidden" value={isValidDateYYYYMMDD(b.deadline) ? b.deadline : ''} onChange={e => { const v = e.target.value; handleUpdateBlock(b.id, { deadline: v ? v : undefined }); }} />
                    </>
                  ) : isList && !isUncList ? (
                    <div className="flex items-center" style={{ paddingLeft: 24 }}>
                      <button style={{width: "50px" }} type="button" onClick={() => handleAddTaskUnderList(b.id)} className="mt-1 text-[18px] px-0 py-0 rounded-md border border-white/10 text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 transition-colors">
                        +
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const renderSplitView = () => (
    <div className="space-y-8">
      {splitDays.map(day => {
        const daySections = listSections.map(section => ({
          list: section.list,
          tasks: section.tasks.filter(t => {
            if (t.archived === true) return false;
            if (!showHidden && t.isHidden === true) return false;
            const date = sortBy === 'createdAt' ? t.createdAt : t.deadline;
            return isValidDateYYYYMMDD(date) && date === day;
          }),
        })).filter(section => showEmptyLists || section.tasks.length > 0);
        if (!daySections.length) return null;
        return (
          <div key={day} className="rounded-2xl overflow-hidden">
            <div className="px-4 py-3">
              <div className="text-[18px] md:text-[20px] font-bold text-white/95">{weekdayLabel(day)}</div>
              <div className="text-[17px] text-white/40 mt-0.5">{labelForYMD(day)} · {fullDateLabel(day)}</div>
            </div>
            <div className="p-3 md:p-4 space-y-5">
              {daySections.map(section => {
                const isCollapsed = !!collapsed[section.list.id];
                return (
                  <div key={`${day}__${section.list.id}`} className="space-y-1">
                    {renderListRow(section.list, { virtualDay: day, showAddButton: true, subtitle: section.tasks.length ? `${section.tasks.length} task${section.tasks.length === 1 ? '' : 's'}` : 'empty' })}
                    {!isCollapsed ? (section.tasks.length ? <div className="space-y-1">{section.tasks.map(task => renderTaskRow(task, 8 + task.indent * 16))}</div> : <div className="pl-10 pt-1 text-[11px] text-white/28">No tasks for this day.</div>) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  const actionsPanelProps = {
    dateMode, setDateMode, splitMode, setSplitMode,
    showEmptyLists, setShowEmptyLists, showHidden, setShowHidden,
    sortBy, setSortBy,
    onNewList: openNewListModal,
  };

  const sortAxisLabel = sortBy === 'createdAt' ? 'created' : 'due';

  /* ── Render ── */
  return (
    <div className="h-full w-full bg-gray-900 text-white overflow-y-auto">
      <ConfettiRain show={showConfetti} />
      <GamificationToast show={toastShow} message={toastMsg} />

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex justify-end">
          <button type="button" className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} aria-label="Close filters" />
          <div className="relative w-72 max-w-[85vw] h-full bg-gray-900 border-l border-white/10 flex flex-col shadow-2xl overflow-hidden"
            style={{ animation: 'drawerSlideIn 0.25s cubic-bezier(.22,.9,.28,1)' }}>
            <style>{`@keyframes drawerSlideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
              <span className="text-[13px] font-semibold text-white/80">Actions</span>
              <button type="button" onClick={() => setDrawerOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ActionsPanel {...actionsPanelProps} />
            </div>
          </div>
        </div>
      )}

      <div className="h-full w-full bg-gray-900 text-white">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8">
          <div className="flex gap-4">
            <div className="min-w-0 flex-1">

              {/* Date pagination header */}
          <div className="mb-5">
                <div className="flex items-center justify-between gap-3 rounded-2xl  px-4 py-3">
                  
                  {/* Left: navigation */}
                  <div className="flex items-center gap-2 min-w-[96px]">
                    <button
                      type="button"
                      onClick={navigatePrev}
                      disabled={navDisabled}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
                    >
                      ‹
                    </button>

                    <button
                      type="button"
                      onClick={navigateNext}
                      disabled={navDisabled}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
                    >
                      ›
                    </button>
                  </div>

                  {/* Center: title */}
                  <div className="flex-1 text-center">
                    <div className="text-[18px] font-semibold tracking-tight text-white">
                      {dateMode === 'today' && (
                        <>
                          {labelForYMD(focusDay)}{" "}
                          <span className="text-white/40 font-medium">
                            ({formatPill(focusDay)})
                          </span>
                        </>
                      )}

                      {dateMode === 'week' && (
                        <>
                          Week{" "}
                          <span className="text-white/40 font-medium">
                            {getWeekRangeLabel(focusDay)}
                          </span>
                        </>
                      )}

                      {dateMode === 'month' && (
                        <>
                          Month{" "}
                          <span className="text-white/40 font-medium">
                            {getMonthRangeLabel(focusDay)}
                          </span>
                        </>
                      )}

                      {dateMode === 'all' && (
                        <span className="text-white/75">All dated tasks</span>
                      )}
                    </div>
                  </div>

                  {/* Right: meta info */}
                  <div className="hidden md:flex min-w-[170px] items-center justify-end gap-3 text-[11px] font-medium text-white/40">
                    <div>
                      by <span className="text-white/65">{sortAxisLabel}</span>
                    </div>

                    {splitMode ? (
                      <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-300">
                        Split: {splitDays.length} days
                      </div>
                    ) : null}
                  </div>

                  {/* Mobile settings */}
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(true)}
                    className="md:hidden flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
                  >
                    <span>⚙</span>
                    <span className="capitalize">{dateMode}</span>
                    {splitMode ? <span className="h-2 w-2 rounded-full bg-emerald-400" /> : null}
                  </button>
                </div>
              </div>

            

              {isBrandNewEmpty ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="text-sm font-semibold text-white/90">Start here</div>
                  <div className="text-[12px] text-white/50 mt-1">Create your first list and then add tasks under it.</div>
                 <button
                      type="button"
                      onClick={openNewListModal}
                      className="mt-4 max-w-[260px] w-full text-left text-[13px] px-4 py-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/20 transition-colors wobble-loop"
                    >
                      + New List
                    </button>
                  <div className="text-[11px] text-white/35 mt-3">Hint: after you create a list, you&apos;ll always see an <span className="text-white/55">+ task</span> button right below it.</div>
                </div>
              ) : splitMode ? renderSplitView() : renderNormalList()}
            </div>

            {/* Desktop sidebar */}
            <div className="hidden md:block w-[220px] shrink-0">
              <div className="sticky top-6">
                <div className="rounded-2xl ">
                  <div className="px-3 py-2 border-b border-white/10">
                    <div className="text-[11px] text-white/50">Actions</div>
                  </div>
                  <div style={{ height: '78vh' }}>
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
            <div className="relative w-[92vw] max-w-md rounded-2xl border border-white/10 bg-gray-950 shadow-2xl">
              <div className="px-4 py-3 border-b border-white/10">
                <div className="text-sm font-semibold text-white/90">Select or create List</div>
                <div className="text-[11px] text-white/45 mt-0.5">Pick an existing list to add a task under it, or type a new one.</div>
              </div>
              <div className="px-4 py-3">
                <div className="mb-3">
                  <div className="text-[11px] text-white/50 mb-1">Create new</div>
                  <input value={listNewText} onChange={e => setListNewText(e.target.value)} placeholder="Type a new list name…"
                    className="w-full bg-black/20 border border-white/10 rounded-md text-white/85 text-[12px] px-3 py-2 outline-none hover:bg-black/25 focus:border-white/20"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmListModal(); } if (e.key === 'Escape') setListModalOpen(false); }} />
                  <div className="text-[11px] text-white/35 mt-1">If that list already exists, it will not create a duplicate — it just adds a task under it.</div>
                </div>
                <div>
                  <div className="text-[11px] text-white/50 mb-1">Or select existing</div>
                  <div className="max-h-56 overflow-auto rounded-xl border border-white/10 bg-white/5">
                    {listTitles.length ? (
                      <div className="p-2 space-y-1">
                        {listTitles.map(t => (
                          <label key={t.id} className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors">
                            <input type="radio" name="listPick" value={t.id} checked={listPickId === t.id} onChange={e => setListPickId(e.target.value)} onClick={e => { const v = (e.currentTarget as HTMLInputElement).value; if (v) setListPickId(v); }} />
                            <span className="text-[12px] text-white/85">{t.text}</span>
                          </label>
                        ))}
                      </div>
                    ) : <div className="p-3 text-[12px] text-white/45">No lists yet.</div>}
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 border-t border-white/10 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setListModalOpen(false)} className="text-[12px] px-3 py-2 rounded-md border border-white/10 text-white/70 hover:text-white/90 hover:bg-white/5 transition-colors">Cancel</button>
                <button type="button" onClick={confirmListModal} className="text-[12px] px-3 py-2 rounded-md border border-emerald-400/25 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/20 transition-colors">Select</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <OnboardingModal />
    </div>
  );
}