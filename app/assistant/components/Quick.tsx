// app/components/Quick.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

/* ===================== Types ===================== */
type Block = {
  id: string;
  text: string;
  indent: number; // 0 = title, 1+ = task/subtask
  checked?: boolean;
  deadline?: string; // YYYY-MM-DD (tasks)
  isHidden?: boolean; // dismissed
  archived?: boolean; // archived (never shown)
};

type Project = {
  project_id: string;
  title: string;
  blocks: Block[];
  collapsed: Record<string, boolean>; // (Sidebar)
  quickCollapsed?: Record<string, boolean>; // (Quick only)
};

type TitleSection = {
  title: Block;
  tasks: Block[];
};

type DateMode = 'today' | 'week' | 'month' | 'all';

/* ===================== Constants ===================== */
const LS_KEY_V2 = 'youtask_projects_v1';
const UNC_TITLE = 'Uncategorized';

/* ===================== Utils ===================== */
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
function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDaysYMD(baseYmd: string, deltaDays: number) {
  if (!isValidDateYYYYMMDD(baseYmd)) return baseYmd;
  const [y, m, d] = baseYmd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function formatPill(deadline?: string) {
  if (!deadline) return '';
  if (!isValidDateYYYYMMDD(deadline)) return '';
  const [y, m, d] = deadline.split('-');
  return `${d}/${m}/${y.slice(2)}`;
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
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
function monthStartYMD(anchor: string) {
  if (!isValidDateYYYYMMDD(anchor)) return anchor;
  const [y, m] = anchor.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}
function monthEndYMD(anchor: string) {
  if (!isValidDateYYYYMMDD(anchor)) return anchor;
  const [y, m] = anchor.split('-').map(Number);
  const lastDt = new Date(y, m, 0);
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDt.getDate()).padStart(2, '0')}`;
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

function makePersonalProject(
  blocks?: Block[],
  collapsed?: Record<string, boolean>,
  quickCollapsed?: Record<string, boolean>
): Project {
  return {
    project_id: pid(),
    title: 'Personal',
    blocks: blocks && blocks.length ? moveUncToTop(ensureUncExists(blocks)) : moveUncToTop(ensureUncExists([])),
    collapsed: collapsed && typeof collapsed === 'object' ? collapsed : {},
    quickCollapsed: quickCollapsed && typeof quickCollapsed === 'object' ? quickCollapsed : {},
  };
}

/* ===================== Projects LS ===================== */
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
            const loadedQuickCollapsed = p?.quickCollapsed && typeof p.quickCollapsed === 'object' ? p.quickCollapsed : {};

            return {
              project_id,
              title,
              blocks: loadedBlocks,
              collapsed: loadedCollapsed,
              quickCollapsed: loadedQuickCollapsed,
            } as Project;
          })
          .filter(Boolean)
      : [];

    const safeProjects = loadedProjects.length ? loadedProjects : [makePersonalProject()];
    const sel = typeof parsed?.selectedProjectId === 'string' ? parsed.selectedProjectId : safeProjects[0].project_id;

    return {
      projects: safeProjects,
      selectedProjectId: safeProjects.some((p) => p.project_id === sel) ? sel : safeProjects[0].project_id,
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

/* ===================== FX: Confetti + Sounds ===================== */
function ConfettiRain({ show }: { show: boolean }) {
  const pieces = useMemo(() => {
    const arr = Array.from({ length: 120 }).map((_, i) => {
      const left = Math.random() * 100;
      const delay = Math.random() * 0.8;
      const duration = 1.9 + Math.random() * 1.6;
      const size = 6 + Math.random() * 8;
      const rot = Math.random() * 360;
      const drift = Math.random() * 140 - 70;
      const opacity = 0.75 + Math.random() * 0.25;
      const hue = Math.floor(Math.random() * 360);
      return { i, left, delay, duration, size, rot, drift, opacity, hue };
    });
    return arr;
  }, []);

  if (!show) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translate3d(var(--drift), -12vh, 0) rotate(var(--rot)); opacity: 0; }
          10%  { opacity: var(--op); }
          100% { transform: translate3d(calc(var(--drift) * -1), 112vh, 0) rotate(calc(var(--rot) + 720deg)); opacity: 0; }
        }
      `}</style>

      {pieces.map((p) => (
        <span
          key={p.i}
          className="absolute top-0 rounded-sm shadow-sm"
          // @ts-ignore
          style={{
            left: `${p.left}vw`,
            width: `${p.size}px`,
            height: `${Math.max(6, p.size * 0.55)}px`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            // @ts-ignore
            '--rot': `${p.rot}deg`,
            // @ts-ignore
            '--drift': `${p.drift}px`,
            // @ts-ignore
            '--op': `${p.opacity}`,
            background: `hsl(${p.hue} 90% 60%)`,
            opacity: p.opacity,
            animationName: 'confettiFall',
            animationTimingFunction: 'linear',
            animationIterationCount: 1,
          }}
        />
      ))}
    </div>
  );
}

/* ===================== Gamification Toast ===================== */
function GamificationToast({
  show,
  message,
}: {
  show: boolean;
  message: string;
}) {
  if (!show) return null;

  return (
    <>
      <style>{`
        @keyframes gamiToastIn {
          0% {
            opacity: 0;
            transform: translate(-50%, 18px) scale(0.96);
            filter: blur(6px);
          }
          60% {
            opacity: 1;
            transform: translate(-50%, -2px) scale(1.02);
            filter: blur(0);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, 0px) scale(1);
            filter: blur(0);
          }
        }

        @keyframes gamiShine {
          0%   { transform: translateX(-160%) skewX(-20deg); opacity: 0; }
          10%  { opacity: .10; }
          25%  { opacity: .22; }
          40%  { opacity: .10; }
          100% { transform: translateX(260%) skewX(-20deg); opacity: 0; }
        }

        @keyframes gamiPulseGlow {
          0%, 100% { box-shadow: 0 10px 30px rgba(16,185,129,.14), inset 0 1px 0 rgba(255,255,255,.06); }
          50%      { box-shadow: 0 12px 38px rgba(16,185,129,.22), inset 0 1px 0 rgba(255,255,255,.09); }
        }
      `}</style>

      <div className="pointer-events-none fixed left-1/2 bottom-8 z-[9998]">
        <div
          className={[
            'relative overflow-hidden',
            'min-w-[320px] md:min-w-[420px] max-w-[90vw]',
            'rounded-3xl border border-emerald-400/20',
            'bg-gray-950/95 backdrop-blur-xl',
            'px-6 py-5 md:px-8 md:py-6',
            'text-center',
          ].join(' ')}
          style={{
            transform: 'translateX(-50%)',
            animation: 'gamiToastIn .35s cubic-bezier(.22,.9,.28,1), gamiPulseGlow 1.6s ease-in-out infinite',
          }}
        >
          <span
            className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-white/10 blur-md"
            style={{ animation: 'gamiShine 2.8s ease-in-out infinite' }}
          />

          <div className="mb-2 flex items-center justify-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.9)]" />
            <span className="text-[11px] md:text-[12px] font-semibold uppercase tracking-[0.24em] text-emerald-300/90">
              Progress
            </span>
          </div>

          <div className="text-[16px] md:text-[20px] font-semibold text-white/95 leading-tight">{message}</div>
        </div>
      </div>
    </>
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
  const [showEmptyEntities, setShowEmptyEntities] = useState(true);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const dateRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const dragRef = useRef<{ id: string; fromIndex: number } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const lastWrittenRef = useRef<string>('');
  const applyingExternalRef = useRef(false);

  const armedDeleteTitleRef = useRef<{ id: string; t: number } | null>(null);

  const audioCheckRef = useRef<HTMLAudioElement | null>(null);
  const audioDoneRef = useRef<HTMLAudioElement | null>(null);

  const [pulseId, setPulseId] = useState<string | null>(null);
  const pulseTimerRef = useRef<number | null>(null);

  const [showConfetti, setShowConfetti] = useState(false);
  const confettiTimerRef = useRef<number | null>(null);

  const completedDayRef = useRef<string>('');

  const [toastShow, setToastShow] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    audioCheckRef.current = new Audio('/sounds/notif.mp3');
    audioDoneRef.current = new Audio('/sounds/notif2.mp3');

    audioCheckRef.current.preload = 'auto';
    audioDoneRef.current.preload = 'auto';

    audioCheckRef.current.volume = 1;
    audioDoneRef.current.volume = 1;

    return () => {
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
      if (confettiTimerRef.current) window.clearTimeout(confettiTimerRef.current);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  /* ===================== Current project helpers ===================== */
  const currentProjectIndex = useMemo(() => {
    return Math.max(0, projects.findIndex((p) => p.project_id === selectedProjectId));
  }, [projects, selectedProjectId]);

  const currentProject = projects[currentProjectIndex];
  const blocks: Block[] = currentProject?.blocks ?? moveUncToTop(ensureUncExists([]));
  const collapsed: Record<string, boolean> = currentProject?.quickCollapsed ?? {};

  const setCurrentBlocks = (nextBlocksOrFn: Block[] | ((prev: Block[]) => Block[])) => {
    setProjects((prev) => {
      if (!prev.length) {
        const personal = makePersonalProject(
          typeof nextBlocksOrFn === 'function' ? nextBlocksOrFn([]) : nextBlocksOrFn,
          {},
          {}
        );
        setSelectedProjectId(personal.project_id);
        return [personal];
      }

      const idx = prev.findIndex((p) => p.project_id === selectedProjectId);
      const safeIdx = idx >= 0 ? idx : 0;

      const next = prev.map((p) => ({ ...p }));
      const oldBlocks = next[safeIdx].blocks ?? moveUncToTop(ensureUncExists([]));
      let newBlocks = typeof nextBlocksOrFn === 'function' ? nextBlocksOrFn(oldBlocks) : nextBlocksOrFn;

      newBlocks = moveUncToTop(ensureUncExists(newBlocks));
      next[safeIdx] = { ...next[safeIdx], blocks: newBlocks };
      return next;
    });
  };

  const setCurrentCollapsed = (
    nextCollapsedOrFn: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)
  ) => {
    setProjects((prev) => {
      if (!prev.length) {
        const qc = typeof nextCollapsedOrFn === 'function' ? nextCollapsedOrFn({}) : nextCollapsedOrFn;
        const personal = makePersonalProject(moveUncToTop(ensureUncExists([])), {}, qc);
        setSelectedProjectId(personal.project_id);
        return [personal];
      }

      const idx = prev.findIndex((p) => p.project_id === selectedProjectId);
      const safeIdx = idx >= 0 ? idx : 0;

      const next = prev.map((p) => ({ ...p }));
      const oldCol = next[safeIdx].quickCollapsed ?? {};
      const newCol = typeof nextCollapsedOrFn === 'function' ? nextCollapsedOrFn(oldCol) : nextCollapsedOrFn;

      next[safeIdx] = { ...next[safeIdx], quickCollapsed: newCol };
      return next;
    });
  };

  /* ===================== Load + sync ===================== */
  useEffect(() => {
    try {
      const payload = readProjectsLS();
      if (payload) {
        setProjects(payload.projects);
        setSelectedProjectId(payload.selectedProjectId || payload.projects[0]?.project_id || '');
        lastWrittenRef.current = JSON.stringify({
          projects: payload.projects,
          selectedProjectId: payload.selectedProjectId,
        });
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

  /* ===================== Focus helper ===================== */
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

  /* ===================== Date helpers ===================== */
  function getMonday(ymd: string) {
    if (!isValidDateYYYYMMDD(ymd)) return ymd;

    const [y, m, d] = ymd.split('-').map(Number);
    const date = new Date(y, m - 1, d);

    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function inWeekRange(ymd: string, anchor: string) {
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

  function inMonthRange(ymd: string, anchor: string) {
    if (!isValidDateYYYYMMDD(ymd) || !isValidDateYYYYMMDD(anchor)) return false;
    const [y1, m1] = ymd.split('-').map(Number);
    const [y2, m2] = anchor.split('-').map(Number);
    return y1 === y2 && m1 === m2;
  }

  function getWeekRangeLabel(anchor: string) {
    const monday = getMonday(anchor);
    const sunday = addDaysYMD(monday, 6);
    return `${formatPill(monday)} – ${formatPill(sunday)}`;
  }

  function getMonthRangeLabel(anchor: string) {
    if (!isValidDateYYYYMMDD(anchor)) return anchor;
    const [y, m] = anchor.split('-').map(Number);
    const first = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDt = new Date(y, m, 0);
    const last = `${y}-${String(m).padStart(2, '0')}-${String(lastDt.getDate()).padStart(2, '0')}`;
    return `${formatPill(first)} – ${formatPill(last)}`;
  }

  const passesDateFilter = (b: Block) => {
    if (!(b.indent > 0)) return true;
    if (!b.deadline || !isValidDateYYYYMMDD(b.deadline)) return false;
    if (dateMode === 'all') return true;
    if (dateMode === 'today') return b.deadline === focusDay;
    if (dateMode === 'week') return inWeekRange(b.deadline, focusDay);
    return inMonthRange(b.deadline, focusDay);
  };

  const splitDays = useMemo(() => {
    if (dateMode === 'today') return [focusDay];

    if (dateMode === 'week') {
      const monday = getMonday(focusDay);
      return Array.from({ length: 7 }).map((_, i) => addDaysYMD(monday, i));
    }

    if (dateMode === 'month') {
      const start = monthStartYMD(focusDay);
      const end = monthEndYMD(focusDay);

      const days: string[] = [];
      let cur = start;
      while (cur <= end) {
        days.push(cur);
        cur = addDaysYMD(cur, 1);
      }
      return days;
    }

    const dated = blocks
      .filter((b) => b.indent > 0)
      .filter((b) => b.archived !== true)
      .filter((b) => (showHidden ? true : b.isHidden !== true))
      .map((b) => b.deadline)
      .filter(isValidDateYYYYMMDD);

    const uniq = Array.from(new Set(dated)).sort();
    return uniq.length ? uniq : [focusDay];
  }, [dateMode, focusDay, blocks, showHidden]);

  /* ===================== Pagination helpers ===================== */
  const navigatePrev = () => {
    if (dateMode === 'today') {
      setFocusDay((d) => addDaysYMD(d, -1));
    } else if (dateMode === 'week') {
      setFocusDay((d) => addDaysYMD(d, -7));
    } else if (dateMode === 'month') {
      setFocusDay((d) => {
        if (!isValidDateYYYYMMDD(d)) return d;
        const [y, m] = d.split('-').map(Number);
        const prev = m === 1 ? new Date(y - 1, 11, 1) : new Date(y, m - 2, 1);
        return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`;
      });
    }
  };

  const navigateNext = () => {
    if (dateMode === 'today') {
      setFocusDay((d) => addDaysYMD(d, +1));
    } else if (dateMode === 'week') {
      setFocusDay((d) => addDaysYMD(d, +7));
    } else if (dateMode === 'month') {
      setFocusDay((d) => {
        if (!isValidDateYYYYMMDD(d)) return d;
        const [y, m] = d.split('-').map(Number);
        const next = m === 12 ? new Date(y + 1, 0, 1) : new Date(y, m, 1);
        return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
      });
    }
  };

  const navDisabled = dateMode === 'all';

  const navPrevTitle =
    dateMode === 'week' ? 'Previous week' : dateMode === 'month' ? 'Previous month' : 'Previous day';
  const navNextTitle =
    dateMode === 'week' ? 'Next week' : dateMode === 'month' ? 'Next month' : 'Next day';

  /* ===================== Gamification ===================== */
  const gamificationLines = useMemo(
    () => [
      '🔥 Good work, keep it up',
      '💥 Nice one',
      '🚀 Momentum',
      '✅ One more done',
      '🔥 You re on fire',
      '📈 That s progress',
      '💪 Strong move',
      '🏆 Keep stacking wins',
      '✨ Another step forward',
      '🧼 Clean work',
      '🎯 Locked in',
      '⚡ Winning rhythm',
      '🙌 Great job',
      '🧠 Sharp move',
      '💣 Boom, done',
      '🌟 That was solid',
      '🔥 Keep the streak alive',
      '👏 Love that energy',
      '🚀 Lets go',
      '💪 You got this',
    ],
    []
  );

  const showGamificationToast = () => {
    const msg = gamificationLines[Math.floor(Math.random() * gamificationLines.length)];
    setToastMsg(msg);
    setToastShow(true);

    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastShow(false);
    }, 4500);
  };

  /* ===================== Core actions ===================== */
  const updateBlock = (id: string, patch: Partial<Block>) => {
    if (typeof patch.checked === 'boolean' && patch.checked === true) {
      setPulseId(id);
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = window.setTimeout(() => setPulseId(null), 520);

      const a = audioCheckRef.current;
      if (a) {
        try {
          a.currentTime = 0;
          a.play();
        } catch {}
      }

      showGamificationToast();
    }

    setCurrentBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;

        if (typeof patch.checked === 'boolean' && patch.checked === true) {
          return {
            ...b,
            ...patch,
            deadline: isValidDateYYYYMMDD(focusDay) ? focusDay : todayYMD(),
            isHidden: false,
          };
        }

        return { ...b, ...patch };
      })
    );
  };

  const insertAfter = (id: string, block: Block) => {
    setCurrentBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      const next = prev.slice();
      next.splice(i + 1, 0, block);
      return next;
    });
    focusBlock(block.id, false);
  };

  const removeBlock = (id: string) => {
    setCurrentBlocks((prev) => {
      if (prev.length === 1) return prev;
      const i = prev.findIndex((b) => b.id === id);
      if (i < 0) return prev;

      const isTitle = prev[i]?.indent === 0;
      if (isTitle) {
        setCurrentCollapsed((c) => {
          const { [id]: _, ...rest } = c;
          return rest;
        });
      }

      const next = prev.filter((b) => b.id !== id);
      const target = next[Math.max(0, i - 1)];
      if (target) focusBlock(target.id, true);
      return next;
    });
  };

  const removeTitleSendChildrenToUNC = (titleId: string) => {
    setCurrentBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === titleId);
      if (i < 0) return prev;

      const title = prev[i];
      if (title.indent !== 0) return prev;
      if (isUncTitleBlock(title)) return prev;

      let end = i + 1;
      while (end < prev.length && prev[end].indent !== 0) end++;

      const children = prev.slice(i + 1, end).map((ch) => ({
        ...ch,
        indent: Math.max(1, ch.indent),
      }));

      let next = prev.slice(0, i).concat(prev.slice(end));
      next = moveUncToTop(ensureUncExists(next));

      const { uncIndex, end: uncEnd } = findUncRange(next);
      if (uncIndex < 0) return next;

      const insertAt = uncEnd;
      next = next.slice(0, insertAt).concat(children, next.slice(insertAt));

      setCurrentCollapsed((c) => {
        const { [titleId]: _, ...rest } = c;
        return rest;
      });

      const target = next[Math.max(0, uncIndex + 1)] ?? next[0];
      if (target) focusBlock(target.id, true);

      return next;
    });
  };

  /* ===================== Entity helpers ===================== */
  const entityTitlesRaw = useMemo(() => {
    return blocks
      .filter((b) => b.indent === 0)
      .filter((b) => !isUncTitleBlock(b))
      .filter((b) => b.archived !== true)
      .map((b) => ({ id: b.id, text: (b.text || '').trim() }))
      .filter((t) => t.text.length > 0);
  }, [blocks]);

  const entityTitles = useMemo(() => {
    const seen = new Set<string>();
    return entityTitlesRaw.filter((t) => {
      const key = t.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [entityTitlesRaw]);

  const entityIdByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of entityTitlesRaw) {
      const k = t.text.toLowerCase();
      if (!m.has(k)) m.set(k, t.id);
    }
    return m;
  }, [entityTitlesRaw]);

  const addTaskUnderTitle = (titleId: string, deadlineOverride?: string) => {
    const newTaskId = uid();
    const defaultDeadline =
      deadlineOverride && isValidDateYYYYMMDD(deadlineOverride)
        ? deadlineOverride
        : isValidDateYYYYMMDD(focusDay)
          ? focusDay
          : todayYMD();

    setCurrentBlocks((prev) => {
      const base = moveUncToTop(ensureUncExists(prev));
      const i = base.findIndex((b) => b.id === titleId);
      if (i < 0) return base;

      let end = i + 1;
      while (end < base.length && base[end].indent !== 0) end++;

      const next = base.slice();
      next.splice(end, 0, {
        id: newTaskId,
        text: '',
        indent: 1,
        checked: false,
        deadline: defaultDeadline,
        isHidden: undefined,
        archived: undefined,
      });

      return next;
    });

    setCurrentCollapsed((prev) => ({ ...prev, [titleId]: false }));

    requestAnimationFrame(() => {
      const el = inputRefs.current[newTaskId];
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
      el.setSelectionRange(0, 0);
    });
  };

  const createTitleAtEnd = (titleText: string) => {
    const newTitleId = uid();
    const newTaskId = uid();

    const name = (titleText || '').trim() || 'New Entity';
    const key = name.toLowerCase();
    const existingId = entityIdByName.get(key);

    if (existingId) {
      addTaskUnderTitle(existingId);
      return { newTitleId: existingId, newTaskId: '' };
    }

    const defaultDeadline = isValidDateYYYYMMDD(focusDay) ? focusDay : todayYMD();

    setCurrentBlocks((prev) => {
      const base = moveUncToTop(ensureUncExists(prev));
      const { end: uncEnd } = findUncRange(base);
      const insertAt = Math.max(uncEnd, base.length);

      const next = base.slice();

      next.splice(insertAt, 0, { id: newTitleId, text: name, indent: 0 });

      next.splice(insertAt + 1, 0, {
        id: newTaskId,
        text: '',
        indent: 1,
        checked: false,
        deadline: defaultDeadline,
        isHidden: undefined,
        archived: undefined,
      });

      return next;
    });

    setCurrentCollapsed((prev) => ({ ...prev, [newTitleId]: false }));

    requestAnimationFrame(() => {
      const el = inputRefs.current[newTaskId];
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
      el.setSelectionRange(0, 0);
    });

    return { newTitleId, newTaskId };
  };

  /* ===================== Entity modal ===================== */
  const [entityModalOpen, setEntityModalOpen] = useState(false);
  const [entityPickId, setEntityPickId] = useState<string>('');
  const [entityNewText, setEntityNewText] = useState<string>('');

  const confirmEntityModal = () => {
    const newName = entityNewText.trim();

    if (newName) {
      createTitleAtEnd(newName);
      setEntityModalOpen(false);
      return;
    }

    let pickId = entityPickId;
    if (!pickId) {
      const el = document.querySelector<HTMLInputElement>('input[name="entityPick"]:checked');
      if (el?.value) pickId = el.value;
    }

    if (pickId) {
      addTaskUnderTitle(pickId);
      setEntityModalOpen(false);
      return;
    }

    setEntityModalOpen(false);
  };

  const toggleTitle = (titleId: string) => {
    setCurrentCollapsed((prev) => ({ ...prev, [titleId]: !prev[titleId] }));
  };

  /* ===================== Hidden map normal mode ===================== */
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

      if (b.indent > 0 && !passesDateFilter(b)) {
        hidden[b.id] = true;
        continue;
      }

      if (isTitle) {
        currentTitleId = isUncTitle ? null : b.id;
        hidden[b.id] = false;
        continue;
      }

      hidden[b.id] = Boolean(currentTitleId && collapsed[currentTitleId]);
    }

    return hidden;
  }, [blocks, collapsed, showHidden, dateMode, focusDay]);

  /* ===================== Day completion detector ===================== */
  useEffect(() => {
    if (!hydrated) return;

    if (dateMode !== 'today') {
      completedDayRef.current = '';
      return;
    }

    const tasksForFocusDay = blocks.filter((b) => {
      if (!(b.indent > 0)) return false;
      if (b.archived === true) return false;
      if (b.isHidden === true && !showHidden) return false;
      if (!isValidDateYYYYMMDD(b.deadline)) return false;
      return b.deadline === focusDay;
    });

    if (!tasksForFocusDay.length) {
      completedDayRef.current = '';
      return;
    }

    const allDone = tasksForFocusDay.every((t) => t.checked === true);

    if (allDone) {
      if (completedDayRef.current !== focusDay) {
        completedDayRef.current = focusDay;

        const a2 = audioDoneRef.current;
        if (a2) {
          try {
            a2.currentTime = 0;
            a2.play();
          } catch {}
        }

        setShowConfetti(true);
        if (confettiTimerRef.current) window.clearTimeout(confettiTimerRef.current);
        confettiTimerRef.current = window.setTimeout(() => setShowConfetti(false), 2600);
      }
    } else {
      completedDayRef.current = '';
    }
  }, [blocks, focusDay, dateMode, hydrated, showHidden]);

  /* ===================== Text measurement ===================== */
  let __textMeasureCanvas: HTMLCanvasElement | null = null;

  function measureTextWidth(text: string, font: string) {
    if (!__textMeasureCanvas) {
      __textMeasureCanvas = document.createElement('canvas');
    }

    const context = __textMeasureCanvas.getContext('2d');
    if (!context) return text.length * 9;

    context.font = font;
    return context.measureText(text).width;
  }

  function inputWidthPx(text: string) {
    const safe = text || '   ';
    const font = '14px ui-sans-serif, system-ui, -apple-system, Segoe UI';
    const width = measureTextWidth(safe, font);

    const chars = safe.length;
    const factor = Math.floor(chars * 1.1);

    const basePadding = 8;
    const padding = basePadding + factor;

    const min = 60;

    return Math.max(min, width + padding);
  }

  /* ===================== Keyboard ===================== */
  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>, b: Block) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextIndent = b.indent === 0 ? 1 : b.indent;

      insertAfter(b.id, {
        id: uid(),
        text: '',
        indent: nextIndent,
        checked: nextIndent > 0 ? false : undefined,
        deadline: nextIndent > 0 ? (isValidDateYYYYMMDD(focusDay) ? focusDay : todayYMD()) : undefined,
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
        checked: nextIndent === 0 ? undefined : b.checked ?? false,
        deadline: nextIndent === 0 ? undefined : b.deadline,
        isHidden: nextIndent === 0 ? undefined : b.isHidden,
        archived: nextIndent === 0 ? undefined : b.archived,
      });

      return;
    }

    if (e.key === 'Backspace' && b.text === '') {
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

        armedDeleteTitleRef.current = { id: b.id, t: now };
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      removeBlock(b.id);
      return;
    }
  };

  /* ===================== Drag (normal mode only) ===================== */
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

    const toIndex = blocks.findIndex((b) => b.id === overId);
    if (toIndex < 0) return;

    setCurrentBlocks((prev) => arrayMove(prev, drag.fromIndex, toIndex));

    dragRef.current = null;
    setDragOverId(null);
  };
  const onDragEndRow = () => {
    dragRef.current = null;
    setDragOverId(null);
  };

  /* ===================== Derived groups for split ===================== */
  const titleSections = useMemo<TitleSection[]>(() => {
    const sections: TitleSection[] = [];
    let current: TitleSection | null = null;

    for (const b of blocks) {
      if (b.archived === true) continue;

      if (b.indent === 0) {
        if (isUncTitleBlock(b)) {
          current = null;
          continue;
        }

        current = { title: b, tasks: [] };
        sections.push(current);
        continue;
      }

      if (!current) continue;
      current.tasks.push(b);
    }

    return sections;
  }, [blocks]);

  /* ===================== Empty state ===================== */
  const isBrandNewEmpty = useMemo(() => {
    return blocks.length === 1 && isUncTitleBlock(blocks[0]);
  }, [blocks]);

  /* ===================== Shared row renderers ===================== */
  const renderTaskRow = (b: Block, indentPx: number) => {
    const pill = formatPill(b.deadline);

    return (
      <div
        key={b.id}
        className={[
          'group flex items-center gap-2 px-0.5 py-1 rounded-md',
          b.isHidden && showHidden ? 'opacity-40' : '',
        ].join(' ')}
        style={{ paddingLeft: indentPx }}
      >
        <div className="w-3 shrink-0" />

        <div className="w-3 shrink-0" />

        <button
          type="button"
          onClick={() => updateBlock(b.id, { checked: !b.checked })}
          className={[
            'relative h-4 w-4 rounded border flex items-center justify-center shrink-0',
            'transition-[transform,background-color,border-color] duration-150 ease-out',
            'group-hover:scale-[1.06]',
            b.checked ? 'bg-emerald-500/15 border-emerald-400/70' : 'border-white/25',
          ].join(' ')}
          title="Complete"
        >
          {pulseId === b.id ? (
            <>
              <span className="absolute -inset-2 rounded-full border border-emerald-400/35 animate-ping" />
              <span className="absolute -inset-3 rounded-full border border-emerald-300/20 animate-ping [animation-delay:90ms]" />
              <span className="absolute -inset-4 rounded-full border border-emerald-200/15 animate-ping [animation-delay:160ms]" />
              <span className="absolute -inset-2 rounded-full bg-emerald-500/10 blur-sm" />
            </>
          ) : null}

          {b.checked ? <span className="text-emerald-300 text-xs">✓</span> : null}
        </button>

        <div className="min-w-0 flex flex-wrap items-center gap-[2px] w-full">
          <input
            ref={(el) => (inputRefs.current[b.id] = el)}
            value={b.text}
            placeholder="Task…"
            onChange={(e) => updateBlock(b.id, { text: e.target.value })}
            onKeyDown={(e) => handleKey(e, b)}
            className={[
              'bg-transparent outline-none text-sm flex-none',
              b.checked ? 'text-white/40 line-through' : 'text-white/80',
            ].join(' ')}
            style={{ width: `${inputWidthPx(b.text)}px` }}
          />

          <button
            type="button"
            className={[
              'shrink-0 text-[11px] px-1.5 py-0.5 rounded-full border transition-colors',
              pillClass(b.deadline, b.checked),
            ].join(' ')}
            title={pill ? 'Change date' : 'Set date'}
            onClick={() => {
              const el = dateRefs.current[b.id];
              if (!el) return;
              try {
                // @ts-ignore
                el.showPicker?.();
              } catch {}
              el.click();
            }}
          >
            {pill ? pill : '📅'}
          </button>

          <input
            ref={(el) => (dateRefs.current[b.id] = el)}
            type="date"
            className="hidden"
            value={isValidDateYYYYMMDD(b.deadline) ? b.deadline : ''}
            onChange={(e) => {
              const v = e.target.value;
              updateBlock(b.id, { deadline: v ? v : undefined });
            }}
          />
        </div>
      </div>
    );
  };

  const renderTitleRow = (
    title: Block,
    opts?: {
      virtualDay?: string;
      showAddButton?: boolean;
      subtitle?: string;
    }
  ) => {
    const showAddButton = opts?.showAddButton !== false;
    const virtualDay = opts?.virtualDay;

    return (
      <React.Fragment key={`${title.id}${virtualDay ? `__${virtualDay}` : ''}`}>
        <div className="group flex items-center gap-2 px-0.5 py-1 rounded-md" style={{ paddingLeft: 2 }}>
          <div className="w-3 shrink-0 text-white/20 select-none opacity-0">⋮⋮</div>

          <button
            type="button"
            onClick={() => toggleTitle(title.id)}
            className="w-3 shrink-0 text-white/35 hover:text-white/60 transition-colors"
            title={collapsed[title.id] ? 'Expand' : 'Collapse'}
          >
            {collapsed[title.id] ? '▸' : '▾'}
          </button>

          <div className="min-w-0 flex flex-wrap items-center gap-2 w-full">
            <input
              ref={(el) => (inputRefs.current[title.id] = el)}
              value={title.text}
              placeholder="Title…"
              onChange={(e) => updateBlock(title.id, { text: e.target.value })}
              onKeyDown={(e) => handleKey(e, title)}
              className="bg-transparent outline-none text-sm text-white font-semibold flex-none"
              style={{ width: `${inputWidthPx(title.text)}px` }}
            />

            {opts?.subtitle ? <span className="text-[10px] text-white/30">{opts.subtitle}</span> : null}
          </div>
        </div>

        {showAddButton ? (
          <div className="flex items-center" style={{ paddingLeft: 24 }}>
            <button
              type="button"
              onClick={() => addTaskUnderTitle(title.id, virtualDay)}
              className={[
                'mt-1 text-[11px] px-2 py-1 rounded-md border',
                'border-white/10 text-white/50 hover:text-white/80',
                'bg-white/5 hover:bg-white/10 transition-colors',
              ].join(' ')}
            >
              + task
            </button>
          </div>
        ) : null}
      </React.Fragment>
    );
  };

  /* ===================== Render normal list ===================== */
  const renderNormalList = () => {
    const { uncIndex, start: uncStart, end: uncEnd } = findUncRange(blocks);

    return (
      <div className="space-y-1">
        {blocks.map((b, idx) => {
          if (uncIndex >= 0 && idx === uncIndex) return null;
          if (hiddenMap[b.id]) return null;

          const isTitle = b.indent === 0;
          const isTask = b.indent > 0;
          const inUncTasks = uncIndex >= 0 && idx >= uncStart && idx < uncEnd && b.indent > 0;

          const isDraggingOver = dragOverId === b.id && dragRef.current?.id !== b.id;
          const isDraggingMe = dragRef.current?.id === b.id;
          const isUncTitle = isTitle && isUncTitleBlock(b);

          return (
            <React.Fragment key={b.id}>
              <div
                draggable
                onDragStart={(e) => onDragStartRow(e, b.id, idx)}
                onDragOver={(e) => onDragOverRow(e, b.id)}
                onDrop={(e) => onDropRow(e, b.id)}
                onDragEnd={onDragEndRow}
                className={[
                  'group flex items-center gap-2 px-0.5 py-1 rounded-md',
                  b.isHidden && showHidden ? 'opacity-40' : '',
                  isDraggingOver ? 'bg-white/7 outline outline-1 outline-white/10' : '',
                  isDraggingMe ? 'opacity-60' : '',
                ].join(' ')}
                style={{
                  paddingLeft: isTitle ? 2 : inUncTasks ? 6 : 8 + b.indent * 16,
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
                      'relative h-4 w-4 rounded border flex items-center justify-center shrink-0',
                      'transition-[transform,background-color,border-color] duration-150 ease-out',
                      'group-hover:scale-[1.06]',
                      b.checked ? 'bg-emerald-500/15 border-emerald-400/70' : 'border-white/25',
                    ].join(' ')}
                    title="Complete"
                  >
                    {pulseId === b.id ? (
                      <>
                        <span className="absolute -inset-2 rounded-full border border-emerald-400/35 animate-ping" />
                        <span className="absolute -inset-3 rounded-full border border-emerald-300/20 animate-ping [animation-delay:90ms]" />
                        <span className="absolute -inset-4 rounded-full border border-emerald-200/15 animate-ping [animation-delay:160ms]" />
                        <span className="absolute -inset-2 rounded-full bg-emerald-500/10 blur-sm" />
                      </>
                    ) : null}

                    {b.checked ? <span className="text-emerald-300 text-xs">✓</span> : null}
                  </button>
                ) : null}

                <div className="min-w-0 flex flex-wrap items-center gap-[2px] w-full">
                  <input
                    ref={(el) => (inputRefs.current[b.id] = el)}
                    value={b.text}
                    placeholder={isTitle ? 'Title…' : 'Task…'}
                    onChange={(e) => updateBlock(b.id, { text: e.target.value })}
                    onKeyDown={(e) => handleKey(e, b)}
                    className={[
                      'bg-transparent outline-none text-sm cursor-pointer transition-opacity duration-150 flex-none',
                      isTitle ? 'text-white font-semibold' : b.checked ? 'text-white/40 line-through' : 'text-white/80',
                    ].join(' ')}
                    style={{ width: `${inputWidthPx(b.text)}px` }}
                  />

                  {isTask ? (
                    <>
                      <button
                        type="button"
                        className={[
                          'shrink-0 text-[11px] px-1.5 py-0.5 rounded-full border transition-colors',
                          pillClass(b.deadline, b.checked),
                        ].join(' ')}
                        title="Set date"
                        onClick={() => {
                          const el = dateRefs.current[b.id];
                          if (!el) return;
                          try {
                            // @ts-ignore
                            el.showPicker?.();
                          } catch {}
                          el.click();
                        }}
                      >
                        {formatPill(b.deadline) || '📅'}
                      </button>

                      <input
                        ref={(el) => (dateRefs.current[b.id] = el)}
                        type="date"
                        className="hidden"
                        value={isValidDateYYYYMMDD(b.deadline) ? b.deadline : ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateBlock(b.id, { deadline: v ? v : undefined });
                        }}
                      />
                    </>
                  ) : null}
                </div>
              </div>

              {isTitle && !isUncTitle ? (
                <div className="flex items-center" style={{ paddingLeft: 24 }}>
                  <button
                    type="button"
                    onClick={() => addTaskUnderTitle(b.id)}
                    className={[
                      'mt-1 text-[11px] px-2 py-1 rounded-md border',
                      'border-white/10 text-white/50 hover:text-white/80',
                      'bg-white/5 hover:bg-white/10 transition-colors',
                    ].join(' ')}
                  >
                    + task
                  </button>
                </div>
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  /* ===================== Render split list ===================== */
  const renderSplitList = () => {
    return (
      <div className="space-y-8">
        {splitDays.map((day) => {
          const daySections = titleSections
            .map((section) => {
              const tasks = section.tasks
                .filter((t) => t.archived !== true)
                .filter((t) => (showHidden ? true : t.isHidden !== true))
                .filter((t) => isValidDateYYYYMMDD(t.deadline))
                .filter((t) => t.deadline === day);

              return { title: section.title, tasks };
            })
            .filter((section) => {
              if (showEmptyEntities) return true;
              return section.tasks.length > 0;
            });

          if (!daySections.length) return null;

          return (
            <div key={day} className="rounded-2xl overflow-hidden">
              <div className="px-4 py-3 ">
                <div className="text-[18px] md:text-[20px] font-bold text-white/95">{weekdayLabel(day)}</div>
                <div className="text-[17px] text-white/40 mt-0.5">
                  {labelForYMD(day)} · {fullDateLabel(day)}
                </div>
              </div>

              <div className="p-3 md:p-4 space-y-5">
                {daySections.map((section) => {
                  const isCollapsed = !!collapsed[section.title.id];

                  return (
                    <div key={`${day}__${section.title.id}`} className="space-y-1">
                      {renderTitleRow(section.title, {
                        virtualDay: day,
                        showAddButton: true,
                        subtitle: section.tasks.length ? `${section.tasks.length} task${section.tasks.length === 1 ? '' : 's'}` : 'empty',
                      })}

                      {!isCollapsed ? (
                        section.tasks.length ? (
                          <div className="space-y-1">
                            {section.tasks.map((task) => renderTaskRow(task, 8 + task.indent * 16))}
                          </div>
                        ) : (
                          <div className="pl-10 pt-1 text-[11px] text-white/28">No tasks for this day.</div>
                        )
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="h-full w-full bg-gray-900 text-white overflow-y-auto">
      <ConfettiRain show={showConfetti} />
      <GamificationToast show={toastShow} message={toastMsg} />

      <div className="h-full w-full bg-gray-900 text-white">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8">
          <div className="flex gap-4">
            <div className="min-w-0 flex-1">
              {/* ===================== Date pagination header ===================== */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={navigatePrev}
                    disabled={navDisabled}
                    className="h-8 w-8 rounded-md border border-white/10 bg-white/5 text-white/70 hover:text-white/90 hover:bg-white/10 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                    title={navPrevTitle}
                    aria-label={navPrevTitle}
                  >
                    ‹
                  </button>

                  <div className="px-3 py-1.5 rounded-md border border-white/10 bg-black/20">
                    <div className="text-[12px] font-semibold text-white/85 leading-none">{labelForYMD(focusDay)}</div>
                    <div className="text-[10px] text-white/40 mt-1 leading-none">{formatPill(focusDay)}</div>
                  </div>

                  <button
                    type="button"
                    onClick={navigateNext}
                    disabled={navDisabled}
                    className="h-8 w-8 rounded-md border border-white/10 bg-white/5 text-white/70 hover:text-white/90 hover:bg-white/10 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                    title={navNextTitle}
                    aria-label={navNextTitle}
                  >
                    ›
                  </button>

                  <button
                    type="button"
                    onClick={() => setFocusDay(todayYMD())}
                    disabled={navDisabled}
                    className="ml-1 text-[11px] px-2 py-1 rounded-md border border-white/10 text-white/60 hover:text-white/85 hover:bg-white/5 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                    title="Jump to real today"
                  >
                    Now
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between mb-3">
                <div className="text-white/100 text-[22px] font-bold">
                  {dateMode === 'today' && (
                    <>
                      {labelForYMD(focusDay)} <span className="text-white/35">({formatPill(focusDay)})</span>
                    </>
                  )}
                  {dateMode === 'week' && (
                    <>
                      Week <span className="text-white/35">{getWeekRangeLabel(focusDay)}</span>
                    </>
                  )}
                  {dateMode === 'month' && (
                    <>
                      Month <span className="text-white/35">{getMonthRangeLabel(focusDay)}</span>
                    </>
                  )}
                  {dateMode === 'all' && (
                    <>
                      <span className="text-white/35">All dated tasks</span>
                    </>
                  )}
                </div>

                {splitMode ? (
                  <div className="text-[11px] text-white/35">
                    Split mode: <span className="text-white/60">{splitDays.length} day blocks</span>
                  </div>
                ) : null}
              </div>

              {isBrandNewEmpty ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="text-sm font-semibold text-white/90">Start here</div>
                  <div className="text-[12px] text-white/50 mt-1">
                    Create your first list and then add tasks under it.
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setEntityModalOpen(true);
                      setEntityPickId('');
                      setEntityNewText('');
                    }}
                    className={[
                      'mt-4 max-w-[260px] w-full text-left text-[13px] px-4 py-3 rounded-2xl border',
                      'border-emerald-400/25 bg-emerald-500/15 text-emerald-100',
                      'hover:bg-emerald-500/20 transition-colors',
                    ].join(' ')}
                    title="Create your first List"
                  >
                    + New Entity
                  </button>

                  <div className="text-[11px] text-white/35 mt-3">
                    Hint: after you create a list, you'll always see an <span className="text-white/55">Add task</span>{' '}
                    button right below it.
                  </div>
                </div>
              ) : splitMode ? (
                renderSplitList()
              ) : (
                renderNormalList()
              )}
            </div>

            <div className="hidden md:block w-[220px] shrink-0">
              <div className="sticky top-6">
                <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
                  <div className="px-3 py-2 border-b border-white/10">
                    <div className="text-[11px] text-white/50">Actions</div>
                  </div>

                  <div className="p-2 space-y-2" style={{ height: '78vh' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setEntityModalOpen(true);
                        setEntityPickId('');
                        setEntityNewText('');
                      }}
                      className="w-full text-left text-[12px] px-3 py-2 rounded-xl border transition-colors border-emerald-400/25 bg-emerald-500/15 text-emerald-100"
                    >
                      + New List
                    </button>

                    <button
                      type="button"
                      onClick={() => setSplitMode((s) => !s)}
                      className={[
                        'w-full flex items-center justify-between text-[12px] px-3 py-2 rounded-xl border transition-colors',
                        splitMode
                          ? 'border-emerald-400/25 bg-emerald-500/15 text-emerald-100'
                          : 'border-white/10 text-white/70 hover:text-white/90 hover:bg-white/5',
                      ].join(' ')}
                      title="Split current range by day"
                    >
                      <span>Split</span>
                      <span
                        className={[
                          'inline-flex h-5 w-9 rounded-full p-[2px] transition-colors',
                          splitMode ? 'bg-emerald-400/25' : 'bg-white/10',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'h-4 w-4 rounded-full bg-white transition-transform',
                            splitMode ? 'translate-x-4' : 'translate-x-0',
                          ].join(' ')}
                        />
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowEmptyEntities((s) => !s)}
                      className={[
                        'w-full flex items-center justify-between text-[12px] px-3 py-2 rounded-xl border transition-colors',
                        showEmptyEntities
                          ? 'border-emerald-400/25 bg-emerald-500/15 text-emerald-100'
                          : 'border-white/10 text-white/70 hover:text-white/90 hover:bg-white/5',
                      ].join(' ')}
                      title="Keep empty lists visible in split mode"
                    >
                      <span>Empty Lists</span>
                      <span
                        className={[
                          'inline-flex h-5 w-9 rounded-full p-[2px] transition-colors',
                          showEmptyEntities ? 'bg-emerald-400/25' : 'bg-white/10',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'h-4 w-4 rounded-full bg-white transition-transform',
                            showEmptyEntities ? 'translate-x-4' : 'translate-x-0',
                          ].join(' ')}
                        />
                      </span>
                    </button>

                    <div className="h-px bg-white/10 my-1" />

                    <div className="px-3 py-2 border-b border-white/10">
                      <div className="text-[11px] text-white/50">Filters</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDateMode('today')}
                      className={[
                        'w-full text-left text-[12px] px-3 py-2 rounded-xl border transition-colors',
                        dateMode === 'today'
                          ? 'border-emerald-400/25 bg-emerald-500/15 text-emerald-100'
                          : 'border-white/10 text-white/70 hover:text-white/90 hover:bg-white/5',
                      ].join(' ')}
                    >
                      Today
                    </button>

                    <button
                      type="button"
                      onClick={() => setDateMode('week')}
                      className={[
                        'w-full text-left text-[12px] px-3 py-2 rounded-xl border transition-colors',
                        dateMode === 'week'
                          ? 'border-emerald-400/25 bg-emerald-500/15 text-emerald-100'
                          : 'border-white/10 text-white/70 hover:text-white/90 hover:bg-white/5',
                      ].join(' ')}
                    >
                      Week
                    </button>

                    <button
                      type="button"
                      onClick={() => setDateMode('month')}
                      className={[
                        'w-full text-left text-[12px] px-3 py-2 rounded-xl border transition-colors',
                        dateMode === 'month'
                          ? 'border-emerald-400/25 bg-emerald-500/15 text-emerald-100'
                          : 'border-white/10 text-white/70 hover:text-white/90 hover:bg-white/5',
                      ].join(' ')}
                    >
                      Month
                    </button>

                    <button
                      type="button"
                      onClick={() => setDateMode('all')}
                      className={[
                        'w-full text-left text-[12px] px-3 py-2 rounded-xl border transition-colors',
                        dateMode === 'all'
                          ? 'border-emerald-400/25 bg-emerald-500/15 text-emerald-100'
                          : 'border-white/10 text-white/70 hover:text-white/90 hover:bg-white/5',
                      ].join(' ')}
                      title="Show all dated tasks"
                    >
                      All
                    </button>

                    <div className="h-px bg-white/10 my-1" />

                    <button
                      type="button"
                      onClick={() => setShowHidden((s) => !s)}
                      className={[
                        'w-full text-left text-[12px] px-3 py-2 rounded-xl border transition-colors',
                        showHidden
                          ? 'border-emerald-400/25 bg-emerald-500/15 text-emerald-100'
                          : 'border-white/10 text-white/70 hover:text-white/90 hover:bg-white/5',
                      ].join(' ')}
                    >
                      {showHidden ? 'Showing dismissed' : 'Hide dismissed'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {entityModalOpen ? (
          <div className="fixed inset-0 z-[999] flex items-center justify-center">
            <button
              type="button"
              className="absolute inset-0 bg-black/60"
              onClick={() => setEntityModalOpen(false)}
              aria-label="Close"
            />

            <div className="relative w-[92vw] max-w-md rounded-2xl border border-white/10 bg-gray-950 shadow-2xl">
              <div className="px-4 py-3 border-b border-white/10">
                <div className="text-sm font-semibold text-white/90">Select or create List</div>
                <div className="text-[11px] text-white/45 mt-0.5">
                  Pick an existing title to add a task under it, or type a new one.
                </div>
              </div>

              <div className="px-4 py-3">
                <div className="mb-3">
                  <div className="text-[11px] text-white/50 mb-1">Create new</div>
                  <input
                    value={entityNewText}
                    onChange={(e) => setEntityNewText(e.target.value)}
                    placeholder="Type a new list name…"
                    className={[
                      'w-full bg-black/20 border border-white/10 rounded-md',
                      'text-white/85 text-[12px] px-3 py-2 outline-none',
                      'hover:bg-black/25 focus:border-white/20',
                    ].join(' ')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        confirmEntityModal();
                      }
                      if (e.key === 'Escape') setEntityModalOpen(false);
                    }}
                  />
                  <div className="text-[11px] text-white/35 mt-1">
                    If that entity already exists, it will not create a duplicate. It just adds a task under it.
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-white/50 mb-1">Or select existing</div>

                  <div className="max-h-56 overflow-auto rounded-xl border border-white/10 bg-white/5">
                    {entityTitles.length ? (
                      <div className="p-2 space-y-1">
                        {entityTitles.map((t) => (
                          <label
                            key={t.id}
                            className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
                          >
                            <input
                              type="radio"
                              name="entityPick"
                              value={t.id}
                              checked={entityPickId === t.id}
                              onChange={(e) => setEntityPickId(e.target.value)}
                              onClick={(e) => {
                                const v = (e.currentTarget as HTMLInputElement).value;
                                if (v) setEntityPickId(v);
                              }}
                            />
                            <span className="text-[12px] text-white/85">{t.text}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 text-[12px] text-white/45">No entities yet.</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-4 py-3 border-t border-white/10 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEntityModalOpen(false)}
                  className="text-[12px] px-3 py-2 rounded-md border border-white/10 text-white/70 hover:text-white/90 hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={confirmEntityModal}
                  className="text-[12px] px-3 py-2 rounded-md border border-emerald-400/25 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/20 transition-colors"
                >
                  Select
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
