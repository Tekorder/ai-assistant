// app/components/Quick.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { OnboardingModal } from './OnboardingModal';

/* ===================== Types ===================== */
type Block = {
  id: string;
  text: string;
  indent: number;
  checked?: boolean;
  deadline?: string;
  createdAt?: string;   // ← NEW: YYYY-MM-DD, always set on creation
  isHidden?: boolean;
  archived?: boolean;
};

type Project = {
  project_id: string;
  title: string;
  blocks: Block[];
  collapsed: Record<string, boolean>;
  quickCollapsed?: Record<string, boolean>;
};

type ListSection = {
  list: Block;
  tasks: Block[];
};

type DateMode = 'today' | 'week' | 'month' | 'all';
type SortBy = 'dueDate' | 'createdAt';

const LS_KEY_V2 = 'youtask_projects_v1';
const UNC_TITLE = 'Uncategorized';

function uid(len = 8) { return Math.random().toString(36).slice(2, 2 + len); }
function pid() { return String(Math.floor(10000 + Math.random() * 90000)); }
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
function startOfLocalDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDaysYMD(baseYmd: string, deltaDays: number) {
  if (!isValidDateYYYYMMDD(baseYmd)) return baseYmd;
  const [y, m, d] = baseYmd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatPill(deadline?: string) {
  if (!deadline || !isValidDateYYYYMMDD(deadline)) return '';
  const [y, m, d] = deadline.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}
function dayDiffFromToday(yyyyMmDd?: string): number | null {
  if (!yyyyMmDd || !isValidDateYYYYMMDD(yyyyMmDd)) return null;
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const ms = new Date(y, m - 1, d).getTime() - startOfLocalDay(new Date()).getTime();
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
function labelForYMD(ymd: string) {
  const t = todayYMD();
  if (ymd === t) return 'Today';
  if (ymd === addDaysYMD(t, 1)) return 'Tomorrow';
  if (ymd === addDaysYMD(t, -1)) return 'Yesterday';
  return formatPill(ymd) || ymd;
}
function weekdayLabel(ymd: string) {
  if (!isValidDateYYYYMMDD(ymd)) return ymd;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' });
}
function fullDateLabel(ymd: string) {
  if (!isValidDateYYYYMMDD(ymd)) return ymd;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function monthStartYMD(anchor: string) {
  if (!isValidDateYYYYMMDD(anchor)) return anchor;
  const [y, m] = anchor.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}
function monthEndYMD(anchor: string) {
  if (!isValidDateYYYYMMDD(anchor)) return anchor;
  const [y, m] = anchor.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

function isUncTitleBlock(b: Block) {
  return b.indent === 0 && (b.text || '').trim().toLowerCase() === UNC_TITLE.toLowerCase();
}
function findUncRange(blocks: Block[]) {
  const uncIndex = blocks.findIndex(isUncTitleBlock);
  if (uncIndex < 0) return { uncIndex: -1, start: -1, end: -1 };
  const start = uncIndex + 1;
  let end = start;
  while (end < blocks.length && blocks[end].indent !== 0) end++;
  return { uncIndex, start, end };
}
function ensureUncExists(blocks: Block[]) {
  if (findUncRange(blocks).uncIndex >= 0) return blocks;
  return [...blocks, { id: uid(), text: UNC_TITLE, indent: 0 }];
}
function moveUncToTop(blocks: Block[]) {
  const b = ensureUncExists(blocks);
  const { uncIndex, end } = findUncRange(b);
  if (uncIndex < 0 || uncIndex === 0) return b;
  return [...b.slice(uncIndex, end), ...b.slice(0, uncIndex), ...b.slice(end)];
}

type RawBlock = {
  id?: unknown;
  text?: unknown;
  indent?: unknown;
  checked?: unknown;
  deadline?: unknown;
  createdAt?: unknown;   // ← NEW
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

function normalizeLoadedBlocks(raw: unknown): Block[] {
  const today = todayYMD();
  if (!Array.isArray(raw)) return moveUncToTop(ensureUncExists([]));
  const out: Block[] = (raw as RawBlock[]).map((x: RawBlock) => {
    const id = typeof x?.id === 'string' ? x.id : uid();
    const text = typeof x?.text === 'string' ? x.text : '';
    const indent = Number.isFinite(x?.indent) ? Number(x.indent) : 0;
    const b: Block = { id, text, indent: Math.max(0, indent) };
    if (b.indent > 0) {
      b.checked = Boolean(x?.checked);
      if (isValidDateYYYYMMDD(x?.deadline)) b.deadline = x.deadline as string;
    }
    // ← NEW: normalize createdAt — default to today if missing
    b.createdAt = isValidDateYYYYMMDD(x?.createdAt) ? (x.createdAt as string) : today;
    if (typeof x?.isHidden === 'boolean') b.isHidden = x.isHidden;
    if (typeof x?.archived === 'boolean') b.archived = x.archived;
    return b;
  }).filter(Boolean) as Block[];
  return moveUncToTop(ensureUncExists(out));
}
function makePersonalProject(blocks?: Block[], collapsed?: Record<string, boolean>, quickCollapsed?: Record<string, boolean>): Project {
  return {
    project_id: pid(), title: 'Personal',
    blocks: blocks?.length ? moveUncToTop(ensureUncExists(blocks)) : moveUncToTop(ensureUncExists([])),
    collapsed: collapsed && typeof collapsed === 'object' ? collapsed : {},
    quickCollapsed: quickCollapsed && typeof quickCollapsed === 'object' ? quickCollapsed : {},
  };
}

type ProjectsPayload = { projects: Project[]; selectedProjectId?: string; };

function readProjectsLS(): ProjectsPayload | null {
  try {
    const raw = localStorage.getItem(LS_KEY_V2);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoragePayload;
    const loadedProjects: Project[] = Array.isArray(parsed?.projects)
      ? (parsed.projects as RawProject[]).map((p: RawProject) => ({
          project_id: typeof p?.project_id === 'string' ? p.project_id : pid(),
          title: typeof p?.title === 'string' && (p.title as string).trim() ? (p.title as string).trim() : 'Personal',
          blocks: normalizeLoadedBlocks(p?.blocks ?? (p?.payload as { blocks?: unknown })?.blocks ?? []),
          collapsed: p?.collapsed && typeof p.collapsed === 'object' ? p.collapsed as Record<string, boolean> : {},
          quickCollapsed: p?.quickCollapsed && typeof p.quickCollapsed === 'object' ? p.quickCollapsed as Record<string, boolean> : {},
        })).filter(Boolean)
      : [];
    const safeProjects = loadedProjects.length ? loadedProjects : [makePersonalProject()];
    const sel = typeof parsed?.selectedProjectId === 'string' ? parsed.selectedProjectId : safeProjects[0].project_id;
    return { projects: safeProjects, selectedProjectId: safeProjects.some(p => p.project_id === sel) ? sel : safeProjects[0].project_id };
  } catch { return null; }
}
function writeProjectsLS(payload: ProjectsPayload) {
  try {
    localStorage.setItem(LS_KEY_V2, JSON.stringify(payload));
    window.dispatchEvent(new Event('youtask_projects_updated'));
    window.dispatchEvent(new Event('youtask_blocks_updated'));
  } catch {}
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
        className="w-full text-left text-[12px] px-3 py-2 rounded-xl border transition-colors border-emerald-400/25 bg-emerald-500/15 text-emerald-100">
        + New List
      </button>

      {toggle('View by Days', splitMode, () => setSplitMode(s => !s))}
      {splitMode && toggle('Show Empty Lists', showEmptyLists, () => setShowEmptyLists(s => !s))}

      <div className="h-px bg-white/10 my-1" />

      {/* Sort by — lifted to parent, controls filter axis */}
      <div className="px-3 py-1">
        <div className="text-[11px] text-white/50 mb-1.5">View By</div>
        <div className="space-y-1">
          {([['dueDate', 'Due Date', ], ['createdAt', 'Created Date', 'Filters use creation date']] as const).map(([value, label]) => (
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
        {showHidden ? 'Showing dismissed' : 'Hide dismissed'}
      </button>
    </div>
  );
}

export default function Quick() {

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [hydrated, setHydrated] = useState(false);

  const [dateMode, setDateMode] = useState<DateMode>('today');
  const [focusDay, setFocusDay] = useState<string>(todayYMD());
  const [showHidden, setShowHidden] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [showEmptyLists, setShowEmptyLists] = useState(true);

  // ← NEW: sortBy lives here so it can gate the filter logic
  const [sortBy, setSortBy] = useState<SortBy>('dueDate');

  /* mobile drawer */
  const [drawerOpen, setDrawerOpen] = useState(false);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const dateRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const dragRef = useRef<{ id: string; fromIndex: number } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const lastWrittenRef = useRef<string>('');
  const applyingExternalRef = useRef(false);
  const armedDeleteListRef = useRef<{ id: string; t: number } | null>(null);

  const audioCheckRef = useRef<HTMLAudioElement | null>(null);
  const audioDoneRef = useRef<HTMLAudioElement | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const pulseTimerRef = useRef<number | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiTimerRef = useRef<number | null>(null);
  const [toastShow, setToastShow] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    audioCheckRef.current = new Audio('/sounds/notif.mp3');
    audioDoneRef.current = new Audio('/sounds/notif2.mp3');
    audioCheckRef.current.preload = 'auto';
    audioDoneRef.current.preload = 'auto';
    return () => {
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
      if (confettiTimerRef.current) window.clearTimeout(confettiTimerRef.current);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const currentProjectIndex = useMemo(() =>
    Math.max(0, projects.findIndex(p => p.project_id === selectedProjectId)),
  [projects, selectedProjectId]);

  const currentProject = projects[currentProjectIndex];
  const blocks: Block[] = currentProject?.blocks ?? moveUncToTop(ensureUncExists([]));
  const collapsed: Record<string, boolean> = currentProject?.quickCollapsed ?? {};

  const setCurrentBlocks = (nextBlocksOrFn: Block[] | ((prev: Block[]) => Block[])) => {
    setProjects(prev => {
      if (!prev.length) {
        const personal = makePersonalProject(typeof nextBlocksOrFn === 'function' ? nextBlocksOrFn([]) : nextBlocksOrFn, {}, {});
        setSelectedProjectId(personal.project_id);
        return [personal];
      }
      const idx = prev.findIndex(p => p.project_id === selectedProjectId);
      const safeIdx = idx >= 0 ? idx : 0;
      const next = prev.map(p => ({ ...p }));
      const oldBlocks = next[safeIdx].blocks ?? moveUncToTop(ensureUncExists([]));
      let newBlocks = typeof nextBlocksOrFn === 'function' ? nextBlocksOrFn(oldBlocks) : nextBlocksOrFn;
      newBlocks = moveUncToTop(ensureUncExists(newBlocks));
      next[safeIdx] = { ...next[safeIdx], blocks: newBlocks };
      return next;
    });
  };

  const setCurrentCollapsed = (nextCollapsedOrFn: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => {
    setProjects(prev => {
      if (!prev.length) {
        const qc = typeof nextCollapsedOrFn === 'function' ? nextCollapsedOrFn({}) : nextCollapsedOrFn;
        const personal = makePersonalProject(moveUncToTop(ensureUncExists([])), {}, qc);
        setSelectedProjectId(personal.project_id);
        return [personal];
      }
      const idx = prev.findIndex(p => p.project_id === selectedProjectId);
      const safeIdx = idx >= 0 ? idx : 0;
      const next = prev.map(p => ({ ...p }));
      const oldCol = next[safeIdx].quickCollapsed ?? {};
      const newCol = typeof nextCollapsedOrFn === 'function' ? nextCollapsedOrFn(oldCol) : nextCollapsedOrFn;
      next[safeIdx] = { ...next[safeIdx], quickCollapsed: newCol };
      return next;
    });
  };

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

  const focusBlock = (id: string, caretToEnd = false) => {
    requestAnimationFrame(() => {
      const el = inputRefs.current[id];
      if (!el) return;
      el.focus();
      if (caretToEnd) { const len = el.value.length; el.setSelectionRange(len, len); }
      else el.setSelectionRange(0, 0);
    });
  };

  function getMonday(ymd: string) {
    if (!isValidDateYYYYMMDD(ymd)) return ymd;
    const [y, m, d] = ymd.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const day = date.getDay();
    date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function inWeekRange(ymd: string, anchor: string) {
    if (!isValidDateYYYYMMDD(ymd) || !isValidDateYYYYMMDD(anchor)) return false;
    const monday = getMonday(anchor);
    const [my, mm, md] = monday.split('-').map(Number);
    const weekStart = startOfLocalDay(new Date(my, mm - 1, md));
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
    const [y, m, d] = ymd.split('-').map(Number);
    const target = startOfLocalDay(new Date(y, m - 1, d));
    return target >= weekStart && target <= weekEnd;
  }
  function inMonthRange(ymd: string, anchor: string) {
    if (!isValidDateYYYYMMDD(ymd) || !isValidDateYYYYMMDD(anchor)) return false;
    const [y1, m1] = ymd.split('-').map(Number);
    const [y2, m2] = anchor.split('-').map(Number);
    return y1 === y2 && m1 === m2;
  }
  function getWeekRangeLabel(anchor: string) {
    const monday = getMonday(anchor);
    return `${formatPill(monday)} – ${formatPill(addDaysYMD(monday, 6))}`;
  }
  function getMonthRangeLabel(anchor: string) {
    if (!isValidDateYYYYMMDD(anchor)) return anchor;
    const [y, m] = anchor.split('-').map(Number);
    return `${formatPill(`${y}-${String(m).padStart(2,'0')}-01`)} – ${formatPill(monthEndYMD(anchor))}`;
  }

  // ← KEY CHANGE: helper that picks the relevant date field based on sortBy
  const getFilterDate = (b: Block): string | undefined =>
    sortBy === 'createdAt' ? b.createdAt : b.deadline;

  const passesDateFilter = (b: Block) => {
    if (!(b.indent > 0)) return true;
    const date = getFilterDate(b);
    if (!date || !isValidDateYYYYMMDD(date)) return false;
    if (dateMode === 'all') return true;
    if (dateMode === 'today') return date === focusDay;
    if (dateMode === 'week') return inWeekRange(date, focusDay);
    return inMonthRange(date, focusDay);
  };

  const splitDays = useMemo(() => {
    if (dateMode === 'today') return [focusDay];
    if (dateMode === 'week') { const monday = getMonday(focusDay); return Array.from({ length: 7 }).map((_, i) => addDaysYMD(monday, i)); }
    if (dateMode === 'month') {
      const days: string[] = []; let cur = monthStartYMD(focusDay); const end = monthEndYMD(focusDay);
      while (cur <= end) { days.push(cur); cur = addDaysYMD(cur, 1); }
      return days;
    }
    // 'all': collect unique values of the active date field
    const dated = blocks
      .filter(b => b.indent > 0 && b.archived !== true && (showHidden || b.isHidden !== true))
      .map(b => getFilterDate(b))
      .filter(isValidDateYYYYMMDD);
    const uniq = Array.from(new Set(dated)).sort();
    return uniq.length ? uniq : [focusDay];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateMode, focusDay, blocks, showHidden, sortBy]);

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

  const gamificationLines = useMemo(() => ['🔥 Good work, keep it up','💥 Nice one','🚀 Momentum','✅ One more done','🔥 You\'re on fire','📈 That\'s progress','💪 Strong move','🏆 Keep stacking wins','✨ Another step forward','🧼 Clean work','🎯 Locked in','⚡ Winning rhythm','🙌 Great job','🧠 Sharp move','💣 Boom, done','🌟 That was solid','🔥 Keep the streak alive','👏 Love that energy','🚀 Let\'s go','💪 You got this'], []);

  const showGamificationToast = () => {
    const msg = gamificationLines[Math.floor(Math.random() * gamificationLines.length)];
    setToastMsg(msg); setToastShow(true);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastShow(false), 4500);
  };

  const updateBlock = (id: string, patch: Partial<Block>) => {
    const isChecking = typeof patch.checked === 'boolean' && patch.checked === true;
    // Check in advance if this will complete the day (to skip notif in that case)
    const willCompleteDay = isChecking && dateMode === 'today' && (() => {
      const tasksForDay = blocks.filter(b => b.indent > 0 && b.archived !== true && !(b.isHidden === true && !showHidden) && isValidDateYYYYMMDD(b.deadline) && b.deadline === focusDay);
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
      const next = prev.map(b => {
        if (b.id !== id) return b;
        if (isChecking) return { ...b, ...patch, deadline: isValidDateYYYYMMDD(focusDay) ? focusDay : todayYMD(), isHidden: false };
        return { ...b, ...patch };
      });
      if (isChecking && dateMode === 'today') {
        const tasksForDay = next.filter(b => b.indent > 0 && b.archived !== true && !(b.isHidden === true && !showHidden) && isValidDateYYYYMMDD(b.deadline) && b.deadline === focusDay);
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

  const insertAfter = (id: string, block: Block) => {
    setCurrentBlocks(prev => { const i = prev.findIndex(b => b.id === id); const next = prev.slice(); next.splice(i + 1, 0, block); return next; });
    focusBlock(block.id, false);
  };

  const removeBlock = (id: string) => {
    setCurrentBlocks(prev => {
      if (prev.length === 1) return prev;
      const i = prev.findIndex(b => b.id === id);
      if (i < 0) return prev;
      if (prev[i]?.indent === 0) setCurrentCollapsed(c => { const { [id]: _omit, ...rest } = c; void _omit; return rest; });
      const next = prev.filter(b => b.id !== id);
      const target = next[Math.max(0, i - 1)];
      if (target) focusBlock(target.id, true);
      return next;
    });
  };

  const removeTitleSendChildrenToUNC = (listId: string) => {
    setCurrentBlocks(prev => {
      const i = prev.findIndex(b => b.id === listId);
      if (i < 0) return prev;
      const list = prev[i];
      if (list.indent !== 0 || isUncTitleBlock(list)) return prev;
      let end = i + 1;
      while (end < prev.length && prev[end].indent !== 0) end++;
      const children = prev.slice(i + 1, end).map(ch => ({ ...ch, indent: Math.max(1, ch.indent) }));
      let next = moveUncToTop(ensureUncExists(prev.slice(0, i).concat(prev.slice(end))));
      const { uncIndex, end: uncEnd } = findUncRange(next);
      if (uncIndex < 0) return next;
      next = next.slice(0, uncEnd).concat(children, next.slice(uncEnd));
      setCurrentCollapsed(c => { const { [listId]: _omit, ...rest } = c; void _omit; return rest; });
      const target = next[Math.max(0, uncIndex + 1)] ?? next[0];
      if (target) focusBlock(target.id, true);
      return next;
    });
  };

  const listTitlesRaw = useMemo(() => blocks.filter(b => b.indent === 0 && !isUncTitleBlock(b) && b.archived !== true).map(b => ({ id: b.id, text: (b.text || '').trim() })).filter(t => t.text.length > 0), [blocks]);
  const listTitles = useMemo(() => { const seen = new Set<string>(); return listTitlesRaw.filter(t => { const k = t.text.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); }, [listTitlesRaw]);
  const listIdByName = useMemo(() => { const m = new Map<string, string>(); for (const t of listTitlesRaw) { const k = t.text.toLowerCase(); if (!m.has(k)) m.set(k, t.id); } return m; }, [listTitlesRaw]);

  // ← NEW helper: builds a fresh task block with createdAt always set
  const makeTaskBlock = (overrides: Partial<Block> & { id: string }): Block => ({
    text: '',
    indent: 1,
    checked: false,
    deadline: isValidDateYYYYMMDD(focusDay) ? focusDay : todayYMD(),
    createdAt: todayYMD(),  // ← always stamped on creation
    isHidden: undefined,
    archived: undefined,
    ...overrides,
  });

  const addTaskUnderList = (listId: string, deadlineOverride?: string) => {
    const newTaskId = uid();
    const defaultDeadline = deadlineOverride && isValidDateYYYYMMDD(deadlineOverride) ? deadlineOverride : isValidDateYYYYMMDD(focusDay) ? focusDay : todayYMD();
    setCurrentBlocks(prev => {
      const base = moveUncToTop(ensureUncExists(prev));
      const i = base.findIndex(b => b.id === listId);
      if (i < 0) return base;
      let end = i + 1; while (end < base.length && base[end].indent !== 0) end++;
      const next = base.slice();
      next.splice(end, 0, makeTaskBlock({ id: newTaskId, deadline: defaultDeadline }));
      return next;
    });
    setCurrentCollapsed(prev => ({ ...prev, [listId]: false }));
    requestAnimationFrame(() => { const el = inputRefs.current[newTaskId]; if (!el) return; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); el.setSelectionRange(0, 0); });
  };

  const createList = (listText: string) => {
    const newListId = uid(); const newTaskId = uid();
    const name = (listText || '').trim() || 'New List';
    const existingId = listIdByName.get(name.toLowerCase());
    if (existingId) { addTaskUnderList(existingId); return { newListId: existingId, newTaskId: '' }; }
    setCurrentBlocks(prev => {
      const base = moveUncToTop(ensureUncExists(prev));
      const { end: uncEnd } = findUncRange(base);
      const insertAt = Math.max(uncEnd, base.length);
      const next = base.slice();
      // list header also gets createdAt for completeness
      next.splice(insertAt, 0, { id: newListId, text: name, indent: 0, createdAt: todayYMD() });
      next.splice(insertAt + 1, 0, makeTaskBlock({ id: newTaskId }));
      return next;
    });
    setCurrentCollapsed(prev => ({ ...prev, [newListId]: false }));
    requestAnimationFrame(() => { const el = inputRefs.current[newTaskId]; if (!el) return; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); el.setSelectionRange(0, 0); });
    return { newListId, newTaskId };
  };

  const [listModalOpen, setListModalOpen] = useState(false);
  const [listPickId, setListPickId] = useState<string>('');
  const [listNewText, setListNewText] = useState<string>('');

  const confirmListModal = () => {
    const newName = listNewText.trim();
    if (newName) { createList(newName); setListModalOpen(false); return; }
    let pickId = listPickId;
    if (!pickId) { const el = document.querySelector<HTMLInputElement>('input[name="listPick"]:checked'); if (el?.value) pickId = el.value; }
    if (pickId) { addTaskUnderList(pickId); setListModalOpen(false); return; }
    setListModalOpen(false);
  };

  const openNewListModal = () => { setListModalOpen(true); setListPickId(''); setListNewText(''); };

  const toggleList = (listId: string) => setCurrentCollapsed(prev => ({ ...prev, [listId]: !prev[listId] }));

  const hiddenMap = useMemo(() => {
    const hidden: Record<string, boolean> = {};
    let currentListId: string | null = null;
    for (const b of blocks) {
      const isList = b.indent === 0; const isUncList = isList && isUncTitleBlock(b);
      if (b.archived === true) { hidden[b.id] = true; if (isList) currentListId = null; continue; }
      if (b.isHidden === true && !showHidden) { hidden[b.id] = true; if (isList) currentListId = null; continue; }
      if (b.indent > 0 && !passesDateFilter(b)) { hidden[b.id] = true; continue; }
      if (isList) { currentListId = isUncList ? null : b.id; hidden[b.id] = false; continue; }
      hidden[b.id] = Boolean(currentListId && collapsed[currentListId]);
    }
    return hidden;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, collapsed, showHidden, dateMode, focusDay, sortBy]);

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

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>, b: Block) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextIndent = b.indent === 0 ? 1 : b.indent;
      // ← NEW: insertAfter now stamps createdAt
      insertAfter(b.id, nextIndent > 0
        ? makeTaskBlock({ id: uid(), indent: nextIndent, deadline: isValidDateYYYYMMDD(focusDay) ? focusDay : todayYMD() })
        : { id: uid(), text: '', indent: 0, createdAt: todayYMD() }
      );
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const MAX_INDENT = 6; const nextIndent = e.shiftKey ? Math.max(0, b.indent - 1) : Math.min(MAX_INDENT, b.indent + 1);
      updateBlock(b.id, { indent: nextIndent, checked: nextIndent === 0 ? undefined : b.checked ?? false, deadline: nextIndent === 0 ? undefined : b.deadline, isHidden: nextIndent === 0 ? undefined : b.isHidden, archived: nextIndent === 0 ? undefined : b.archived });
      return;
    }
    if (e.key === 'Backspace' && b.text === '') {
      if (b.indent === 0) {
        e.preventDefault(); e.stopPropagation();
        const now = Date.now(); const armed = armedDeleteListRef.current;
        if (armed?.id === b.id && now - armed.t < 800) { armedDeleteListRef.current = null; removeTitleSendChildrenToUNC(b.id); return; }
        armedDeleteListRef.current = { id: b.id, t: now }; return;
      }
      e.preventDefault(); e.stopPropagation(); removeBlock(b.id); return;
    }
  };

  const onDragStartRow = (e: React.DragEvent, id: string, index: number) => { dragRef.current = { id, fromIndex: index }; setDragOverId(id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch {} };
  const onDragOverRow = (e: React.DragEvent, overId: string) => { e.preventDefault(); if (!dragRef.current) return; if (dragOverId !== overId) setDragOverId(overId); };
  const onDropRow = (e: React.DragEvent, overId: string) => { e.preventDefault(); const drag = dragRef.current; if (!drag) return; const toIndex = blocks.findIndex(b => b.id === overId); if (toIndex < 0) return; setCurrentBlocks(prev => arrayMove(prev, drag.fromIndex, toIndex)); dragRef.current = null; setDragOverId(null); };
  const onDragEndRow = () => { dragRef.current = null; setDragOverId(null); };

  const listSections = useMemo<ListSection[]>(() => {
    const sections: ListSection[] = []; let current: ListSection | null = null;
    for (const b of blocks) {
      if (b.archived === true) continue;
      if (b.indent === 0) { if (isUncTitleBlock(b)) { current = null; continue; } current = { list: b, tasks: [] }; sections.push(current); continue; }
      if (!current) continue; current.tasks.push(b);
    }
    return sections;
  }, [blocks]);

  const isBrandNewEmpty = useMemo(() => blocks.length === 1 && isUncTitleBlock(blocks[0]), [blocks]);

  const renderTaskRow = (b: Block, indentPx: number) => {
    const pill = formatPill(b.deadline);
    return (
      <div key={b.id} className={['group flex items-center gap-2 px-0.5 py-1 rounded-md', b.isHidden && showHidden ? 'opacity-40' : ''].join(' ')} style={{ paddingLeft: indentPx }}>
        <div className="w-3 shrink-0" /><div className="w-3 shrink-0" />
        <button type="button" onClick={() => updateBlock(b.id, { checked: !b.checked })}
          className={['relative h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-[transform,background-color,border-color] duration-150 ease-out group-hover:scale-[1.06]', b.checked ? 'bg-emerald-500/15 border-emerald-400/70' : 'border-white/25'].join(' ')} title="Complete">
          {pulseId === b.id ? (<><span className="absolute -inset-2 rounded-full border border-emerald-400/35 animate-ping" /><span className="absolute -inset-3 rounded-full border border-emerald-300/20 animate-ping [animation-delay:90ms]" /><span className="absolute -inset-4 rounded-full border border-emerald-200/15 animate-ping [animation-delay:160ms]" /><span className="absolute -inset-2 rounded-full bg-emerald-500/10 blur-sm" /></>) : null}
          {b.checked ? <span className="text-emerald-300 text-xs">✓</span> : null}
        </button>
        <div className="min-w-0 flex flex-wrap items-center gap-[2px] w-full">
          <input ref={el => void (inputRefs.current[b.id] = el)} value={b.text} placeholder="Task…" onChange={e => updateBlock(b.id, { text: e.target.value })} onKeyDown={e => handleKey(e, b)}
            className={['bg-transparent outline-none text-sm flex-none', b.checked ? 'text-white/40 line-through' : 'text-white/80'].join(' ')} style={{ width:`${inputWidthPx(b.text)}px` }} />
          <button type="button" className={['shrink-0 text-[11px] px-1.5 py-0.5 rounded-full border transition-colors', pillClass(b.deadline, b.checked)].join(' ')} title={pill ? 'Change date' : 'Set date'}
            onClick={() => { const el = dateRefs.current[b.id]; if (!el) return; try { (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch {} el.click(); }}>
            {pill ? pill : '📅'}
          </button>
          <input ref={el => void (dateRefs.current[b.id] = el)} type="date" className="hidden" value={isValidDateYYYYMMDD(b.deadline) ? b.deadline : ''} onChange={e => { const v = e.target.value; updateBlock(b.id, { deadline: v ? v : undefined }); }} />
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
            <input ref={el => void (inputRefs.current[list.id] = el)} value={list.text} placeholder="List…" onChange={e => updateBlock(list.id, { text: e.target.value })} onKeyDown={e => handleKey(e, list)}
              className="bg-transparent outline-none text-sm text-white font-semibold flex-none" style={{ width:`${inputWidthPx(list.text)}px` }} />
            {opts?.subtitle ? <span className="text-[10px] text-white/30">{opts.subtitle}</span> : null}
          </div>
        </div>
        {showAddButton ? (
          <div className="flex items-center" style={{ paddingLeft: 24 }}>
            <button type="button" onClick={() => addTaskUnderList(list.id, opts?.virtualDay)}
              className="mt-1 text-[11px] px-2 py-1 rounded-md border border-white/10 text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 transition-colors">
              + task
            </button>
          </div>
        ) : null}
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
          const isList = b.indent === 0; const isTask = b.indent > 0;
          const inUncTasks = uncIndex >= 0 && idx >= uncStart && idx < uncEnd && b.indent > 0;
          const isDraggingOver = dragOverId === b.id && dragRef.current?.id !== b.id;
          const isDraggingMe = dragRef.current?.id === b.id;
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
                  <button type="button" onClick={() => updateBlock(b.id, { checked: !b.checked })}
                    className={['relative h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-[transform,background-color,border-color] duration-150 ease-out group-hover:scale-[1.06]', b.checked ? 'bg-emerald-500/15 border-emerald-400/70' : 'border-white/25'].join(' ')} title="Complete">
                    {pulseId === b.id ? (<><span className="absolute -inset-2 rounded-full border border-emerald-400/35 animate-ping" /><span className="absolute -inset-3 rounded-full border border-emerald-300/20 animate-ping [animation-delay:90ms]" /><span className="absolute -inset-4 rounded-full border border-emerald-200/15 animate-ping [animation-delay:160ms]" /><span className="absolute -inset-2 rounded-full bg-emerald-500/10 blur-sm" /></>) : null}
                    {b.checked ? <span className="text-emerald-300 text-xs">✓</span> : null}
                  </button>
                ) : null}
                <div className="min-w-0 flex flex-wrap items-center gap-[2px] w-full">
                  <input ref={el => void (inputRefs.current[b.id] = el)} value={b.text} placeholder={isList ? 'List…' : 'Task…'} onChange={e => updateBlock(b.id, { text: e.target.value })} onKeyDown={e => handleKey(e, b)}
                    className={['bg-transparent outline-none text-sm cursor-pointer transition-opacity duration-150 flex-none', isList ? 'text-white font-semibold' : b.checked ? 'text-white/40 line-through' : 'text-white/80'].join(' ')}
                    style={{ width:`${inputWidthPx(b.text)}px` }} />
                  {isTask ? (
                    <>
                      <button type="button" className={['shrink-0 text-[11px] px-1.5 py-0.5 rounded-full border transition-colors', pillClass(b.deadline, b.checked)].join(' ')} title="Set date"
                        onClick={() => { const el = dateRefs.current[b.id]; if (!el) return; try { (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch {} el.click(); }}>
                        {formatPill(b.deadline) || '📅'}
                      </button>
                      <input ref={el => void (dateRefs.current[b.id] = el)} type="date" className="hidden" value={isValidDateYYYYMMDD(b.deadline) ? b.deadline : ''} onChange={e => { const v = e.target.value; updateBlock(b.id, { deadline: v ? v : undefined }); }} />
                    </>
                  ) : isList && !isUncList ? (
                    <div className="flex items-center" style={{ paddingLeft: 24 }}>
                      <button type="button" onClick={() => addTaskUnderList(b.id)} className="mt-1 text-[11px] px-2 py-1 rounded-md border border-white/10 text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 transition-colors">
                        + task
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
          // ← filter tasks by the active date field (deadline or createdAt)
          tasks: section.tasks.filter(t => {
            if (t.archived === true) return false;
            if (!showHidden && t.isHidden === true) return false;
            const date = getFilterDate(t);
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

  // ← label in header changes depending on active sort axis
  const sortAxisLabel = sortBy === 'createdAt' ? 'created' : 'due';

  return (
    <div className="h-full w-full bg-gray-900 text-white overflow-y-auto">
      <ConfettiRain show={showConfetti} />
      <GamificationToast show={toastShow} message={toastMsg} />

      {/* ── Mobile drawer overlay ── */}
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
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={navigatePrev} disabled={navDisabled}
                    className="h-8 w-8 rounded-md border border-white/10 bg-white/5 text-white/70 hover:text-white/90 hover:bg-white/10 transition-colors disabled:opacity-25 disabled:cursor-not-allowed">‹</button>
                  <div className="px-3 py-1.5 rounded-md border border-white/10 bg-black/20">
                    <div className="text-[12px] font-semibold text-white/85 leading-none">{labelForYMD(focusDay)}</div>
                    <div className="text-[10px] text-white/40 mt-1 leading-none">{formatPill(focusDay)}</div>
                  </div>
                  <button type="button" onClick={navigateNext} disabled={navDisabled}
                    className="h-8 w-8 rounded-md border border-white/10 bg-white/5 text-white/70 hover:text-white/90 hover:bg-white/10 transition-colors disabled:opacity-25 disabled:cursor-not-allowed">›</button>
                  <button type="button" onClick={() => setFocusDay(todayYMD())} disabled={navDisabled}
                    className="ml-1 text-[11px] px-2 py-1 rounded-md border border-white/10 text-white/60 hover:text-white/85 hover:bg-white/5 transition-colors disabled:opacity-25 disabled:cursor-not-allowed">Now</button>
                </div>

                {/* Mobile: filters button */}
                <button type="button" onClick={() => setDrawerOpen(true)}
                  className="md:hidden flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:text-white/90 hover:bg-white/10 transition-colors">
                  <span>⚙</span>
                  <span>{dateMode}</span>
                  {splitMode ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> : null}
                </button>
              </div>

              <div className="flex items-center justify-between mb-3">
                <div className="text-white/100 text-[22px] font-bold">
                  {dateMode === 'today' && <>{labelForYMD(focusDay)} <span className="text-white/35">({formatPill(focusDay)})</span></>}
                  {dateMode === 'week' && <>Week <span className="text-white/35">{getWeekRangeLabel(focusDay)}</span></>}
                  {dateMode === 'month' && <>Month <span className="text-white/35">{getMonthRangeLabel(focusDay)}</span></>}
                  {dateMode === 'all' && <span className="text-white/35">All dated tasks</span>}
                </div>
                <div className="flex items-center gap-3">
                  {/* ← shows which axis is active */}
                  <div className="text-[11px] text-white/35">
                    by <span className="text-white/55">{sortAxisLabel}</span>
                  </div>
                  {splitMode ? <div className="text-[11px] text-white/35">Split: <span className="text-white/60">{splitDays.length} days</span></div> : null}
                </div>
              </div>

              {isBrandNewEmpty ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="text-sm font-semibold text-white/90">Start here</div>
                  <div className="text-[12px] text-white/50 mt-1">Create your first list and then add tasks under it.</div>
                  <button type="button" onClick={openNewListModal}
                    className="mt-4 max-w-[260px] w-full text-left text-[13px] px-4 py-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/20 transition-colors">
                    + New List
                  </button>
                  <div className="text-[11px] text-white/35 mt-3">Hint: after you create a list, you&apos;ll always see an <span className="text-white/55">+ task</span> button right below it.</div>
                </div>
              ) : splitMode ? renderSplitView() : renderNormalList()}
            </div>

            {/* Desktop sidebar actions */}
            <div className="hidden md:block w-[220px] shrink-0">
              <div className="sticky top-6">
                <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
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
