'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  type Block,
  LS_KEY_V2,
  LS_KEY_V1,
  isValidDateYYYYMMDD,
  startOfLocalDay,
  todayYMD,
  parseYMD,
  readSelectedProject,
  writeSelectedProjectBlocks,
  isListVisible,
  getTaskFlag,
  highestTaskFlag,
  type TaskFlagColor,
} from '@/lib/datacenter';
import { TaskFlagBadge, TaskFlagIcon } from './TaskFlag';

/* ===================== Local types ===================== */

type CalCard = {
  id: string;
  listTitle: string;
  text: string;
  checked: boolean;
  deadline: string;
  isHidden?: boolean;
  archived?: boolean;
  flag?: TaskFlagColor;
};

type DayGroup = {
  listTitle: string;
  count: number;
  cards: CalCard[];
  listId: string;
};

/* ===================== Helpers ===================== */

function getMonthGrid(year: number, month: number): (string | null)[] {
  // month: 0-based
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  // We want Mon-first: shift so Mon=0
  const startOffset = (firstDay + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(
      `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    );
  }
  // Pad to complete last week row
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function dayDiff(ymd: string): number {
  const target = startOfLocalDay(parseYMD(ymd));
  const today = startOfLocalDay(new Date());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function pillColorForList(index: number, isLight = false): string {
  if (isLight) {
    const palettes = [
      'bg-sky-500/12 text-sky-700 border-sky-500/25',
      'bg-violet-500/12 text-violet-700 border-violet-500/25',
      'bg-rose-500/12 text-rose-700 border-rose-400/25',
      'bg-cyan-500/12 text-cyan-700 border-cyan-400/25',
      'bg-teal-500/12 text-teal-700 border-teal-500/25',
      'bg-fuchsia-500/12 text-fuchsia-700 border-fuchsia-500/25',
      'bg-indigo-500/12 text-indigo-700 border-indigo-500/25',
      'bg-orange-500/12 text-orange-700 border-orange-400/25',
    ];
    return palettes[index % palettes.length];
  }
  const palettes = [
    'bg-[#d5fc43]/15 text-[#d5fc43] border-[#d5fc43]/28',
    'bg-sky-500/15 text-sky-200 border-sky-400/25',
    'bg-[#d5fc43]/10 text-[#d5fc43] border-[#d5fc43]/22',
    'bg-violet-500/15 text-violet-200 border-violet-400/25',
    'bg-[#d5fc43]/12 text-[#d5fc43] border-[#d5fc43]/26',
    'bg-cyan-500/15 text-cyan-200 border-cyan-400/25',
    'bg-[#d5fc43]/8 text-[#d5fc43]/95 border-[#d5fc43]/18',
    'bg-emerald-500/12 text-emerald-200 border-emerald-400/25',
  ];
  return palettes[index % palettes.length];
}

/** Pills inside month grid cells — no lime (lime reserved for calendar chrome / today / nav) */
function pillColorForCalendarCell(index: number, isLight = false): string {
  if (isLight) {
    const palettes = [
      'bg-sky-500/12 text-sky-700 border-sky-400/25',
      'bg-violet-500/12 text-violet-700 border-violet-400/25',
      'bg-rose-500/12 text-rose-700 border-rose-400/25',
      'bg-cyan-500/12 text-cyan-700 border-cyan-400/25',
      'bg-teal-500/12 text-teal-700 border-teal-400/25',
      'bg-fuchsia-500/12 text-fuchsia-700 border-fuchsia-400/25',
      'bg-indigo-500/12 text-indigo-700 border-indigo-400/25',
      'bg-orange-500/15 text-orange-700 border-orange-400/25',
    ];
    return palettes[index % palettes.length];
  }
  const palettes = [
    'bg-sky-500/15 text-sky-200 border-sky-400/25',
    'bg-violet-500/15 text-violet-200 border-violet-400/25',
    'bg-rose-500/15 text-rose-200 border-rose-400/25',
    'bg-cyan-500/15 text-cyan-200 border-cyan-400/25',
    'bg-teal-500/15 text-teal-200 border-teal-400/25',
    'bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/25',
    'bg-indigo-500/15 text-indigo-200 border-indigo-400/25',
    'bg-orange-500/18 text-orange-200 border-orange-400/25',
  ];
  return palettes[index % palettes.length];
}

const CALENDAR_CELL_FILL_COLORS = [
  'bg-sky-400',
  'bg-violet-400',
  'bg-rose-400',
  'bg-cyan-400',
  'bg-teal-400',
  'bg-fuchsia-400',
  'bg-indigo-400',
  'bg-orange-400',
] as const;

const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/* ===================== Sidebar Panel ===================== */

function DaySidebar({
  ymd,
  groups,
  onClose,
  onToggleDone,
  onReschedule,
  isLight,
}: {
  ymd: string;
  groups: DayGroup[];
  onClose: () => void;
  onToggleDone: (id: string) => void;
  onReschedule: (id: string, newDate: string) => void;
  isLight: boolean;
}) {
  const dateRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const diff = dayDiff(ymd);

  const dayLabel = (() => {
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff < 0) return `${Math.abs(diff)}d ago`;
    return `in ${diff}d`;
  })();

  const diffStyle = (() => {
    if (diff < 0) return { color: 'var(--assistant-danger-text)' };
    if (diff === 0) return { color: 'var(--assistant-tone-1)' };
    if (diff === 1) return { color: 'var(--assistant-tone-3)' };
    return { color: 'var(--assistant-text-soft)' };
  })();

  const allCards = groups.flatMap(g => g.cards);
  const doneCount = allCards.filter(c => c.checked).length;
  const totalCount = allCards.length;

  const openPicker = (id: string) => {
    const el = dateRefs.current[id];
    if (!el) return;
    try {
      (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch { el.click(); }
  };

  return (
    <>
      <button
        type="button"
        className="absolute inset-0 z-[200]"
        style={{ background: 'var(--assistant-overlay)' }}
        onClick={onClose}
        aria-label="Close"
      />
      <div
        className="absolute top-0 right-0 z-[201] flex h-full w-full max-w-md flex-col"
        style={{
          background: 'var(--assistant-panel-bg)',
          borderLeft: '1px solid color-mix(in srgb, var(--assistant-tone-1) 15%, transparent)',
          boxShadow: 'inset 1px 0 0 var(--assistant-border-soft)',
          animation: 'calSidebarIn 0.28s cubic-bezier(.22,.9,.28,1)',
        }}
      >
        <style>{`
          @keyframes calSidebarIn {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
        `}</style>

        {/* Header */}
        <div
          className="flex items-start justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[22px] font-bold leading-none" style={{ color: 'var(--assistant-text)' }}>
                {new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })}
              </span>
              <span
                className="text-[12px] font-semibold px-2 py-0.5 rounded-full"
                style={{ ...diffStyle, background: 'var(--assistant-control-bg)', border: '1px solid var(--assistant-border-soft)' }}
              >
                {dayLabel}
              </span>
            </div>
            <div className="text-[13px] mt-1" style={{ color: 'var(--assistant-text-muted)' }}>
              {new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1 rounded-full flex-1 overflow-hidden" style={{ background: 'var(--assistant-control-bg)' }}>
                <div
                  className="h-full rounded-full bg-[#d5fc43]/85 transition-all duration-500 shadow-[0_0_12px_rgba(213,252,67,.25)]"
                  style={{ width: totalCount ? `${(doneCount / totalCount) * 100}%` : '0%' }}
                />
              </div>
              <span className="text-[11px] shrink-0" style={{ color: 'var(--assistant-text-faint)' }}>{doneCount}/{totalCount}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:text-[#d5fc43] hover:bg-[#d5fc43]/10 transition-colors mt-1"
            style={{ color: 'var(--assistant-text-faint)' }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {groups.length === 0 ? (
            <div className="text-center py-12 text-[13px]" style={{ color: 'var(--assistant-text-faint)' }}>No tasks for this day.</div>
          ) : (
            groups.map((group, gi) => (
              <div key={group.listId} className="space-y-2">
                {/* List label */}
                <div className="flex items-center gap-2 px-1">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${pillColorForList(gi, isLight)}`}>
                    {group.listTitle}
                  </span>
                  <span className="text-[11px]" style={{ color: 'var(--assistant-text-faint)' }}>{group.cards.length} task{group.cards.length !== 1 ? 's' : ''}</span>
                </div>

                {/* Cards */}
                {group.cards.map(card => (
                  <div
                    key={card.id}
                    className="rounded-xl border transition-all duration-200"
                    style={{
                      background: 'var(--assistant-surface)',
                      borderColor: 'var(--assistant-border-soft)',
                      opacity: card.archived ? 0.4 : card.checked ? 0.6 : 1,
                    }}
                  >
                    <div className="p-3">
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="group flex items-start gap-2 min-w-0 flex-1">
                          {/* Checkbox / archived indicator */}
                          {card.archived ? (
                            <span
                              className="mt-0.5 h-4 w-4 rounded flex items-center justify-center shrink-0 text-[9px]"
                              style={{ border: '1px solid var(--assistant-border-soft)', color: 'var(--assistant-text-faint)' }}
                            >
                              ▣
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onToggleDone(card.id)}
                              className="relative mt-0.5 h-4 w-4 shrink-0 flex items-center justify-center group-hover:scale-[1.06] transition-transform"
                              title={card.checked ? 'Mark pending' : 'Mark done'}
                            >
                              {card.checked ? (
                                <span className="relative flex h-3 w-3 items-center justify-center">
                                  <span className="absolute h-2.5 w-2.5 rounded-full bg-[#d5fc43]/85 blur-[2px]" />
                                  <span className="absolute h-1.5 w-1.5 rounded-full bg-[#d5fc43]" />
                                </span>
                              ) : (
                                <span className="h-3 w-3 rounded transition-colors" style={{ border: '1px solid var(--assistant-border-soft)' }} />
                              )}
                            </button>
                          )}

                          {/* Text */}
                          <span
                            className="text-[13px] leading-snug"
                            style={{
                              color: card.archived || card.checked ? 'var(--assistant-text-muted)' : 'var(--assistant-text)',
                              textDecoration: card.archived || card.checked ? 'line-through' : 'none',
                            }}
                          >
                            <TaskFlagBadge source={{ flag: card.flag }} inline />
                            {card.text || '(no text)'}
                          </span>
                        </div>

                        {/* Reschedule — hide for archived */}
                        {!card.archived && (
                          <div className="shrink-0 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openPicker(card.id)}
                              className="text-[14px] opacity-40 hover:opacity-90 transition-opacity"
                              title="Reschedule"
                            >
                              📅
                            </button>
                            <input
                              ref={el => void (dateRefs.current[card.id] = el)}
                              type="date"
                              className="hidden"
                              value={isValidDateYYYYMMDD(card.deadline) ? card.deadline : ''}
                              onChange={e => { if (e.target.value) onReschedule(card.id, e.target.value); }}
                            />
                          </div>
                        )}
                        {card.archived && (
                          <span className="text-[9px] shrink-0" style={{ color: 'var(--assistant-text-faint)' }}>archived</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

/* ===================== Main Component ===================== */

export default function CalendarView({ isLight = false }: { isLight?: boolean }) {
  const [blocks, setBlocks]             = useState<Block[]>([]);
  const [hydrated, setHydrated]         = useState(false);
  const [projectId, setProjectId]       = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState<string>('Project');
  const [visibleLists, setVisibleLists] = useState<Record<string, boolean>>({});

  // Calendar nav
  const today = todayYMD();
  const [viewYear, setViewYear]   = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth()); // 0-based

  // Selected day sidebar
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  /* ── Load & sync ── */
  useEffect(() => {
    const load = () => {
      const snap = readSelectedProject();
      setBlocks(snap.blocks);
      setProjectTitle(snap.projectTitle);
      setProjectId(snap.project_id);
      setVisibleLists(snap.visibleLists);
      setHydrated(true);
    };
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY_V2 || e.key === LS_KEY_V1) load();
    };
    window.addEventListener('youtask_projects_updated', load);
    window.addEventListener('youtask_blocks_updated', load);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('youtask_projects_updated', load);
      window.removeEventListener('youtask_blocks_updated', load);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  /* ── Build cards from blocks ── */
  const allCards = useMemo<CalCard[]>(() => {
  const out: CalCard[] = [];
  let currentListTitle = '';
  let currentListId: string | null = null;
  let currentListVisible = true;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];

    if (b.indent === 0) {
      currentListTitle = (b.text || '').trim();
      currentListId = b.id;
      currentListVisible = isListVisible(visibleLists, b.id);
      continue;
    }

    if (b.indent !== 1) continue;
    if (currentListId && !currentListVisible) continue;
    if (b.archived) continue; // 👈 ocultar archivados
    if (!isValidDateYYYYMMDD(b.deadline)) continue;

    out.push({
      id:        b.id,
      listTitle: currentListTitle || projectTitle || 'General',
      text:      b.text || '',
      checked:   Boolean(b.checked),
      deadline:  b.deadline!,
      isHidden:  b.isHidden === true,
      archived:  b.archived,
      flag: getTaskFlag(b),
    });
  }

  return out;
}, [blocks, projectTitle, visibleLists]);

  /* ── Cards by date ── */
  const cardsByDate = useMemo(() => {
    const map: Record<string, CalCard[]> = {};
    for (const c of allCards) {
      if (!map[c.deadline]) map[c.deadline] = [];
      map[c.deadline].push(c);
    }
    return map;
  }, [allCards]);

  /* ── Groups for a given day (by list) ── */
  const getGroupsForDay = (ymd: string): DayGroup[] => {
    const cards = cardsByDate[ymd] || [];
    const byList: Record<string, { title: string; cards: CalCard[] }> = {};
    const order: string[] = [];
    for (const c of cards) {
      const key = c.listTitle;
      if (!byList[key]) { byList[key] = { title: key, cards: [] }; order.push(key); }
      byList[key].cards.push(c);
    }
    return order.map(k => ({
      listId:    k,
      listTitle: byList[k].title,
      count:     byList[k].cards.length,
      cards:     byList[k].cards,
    }));
  };

  /* ── Month grid ── */
  const grid = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  /* ── Navigation ── */
  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };
  const goToday = () => {
    setViewYear(new Date().getFullYear());
    setViewMonth(new Date().getMonth());
  };

  /* ── Actions ── */
  const handleToggleDone = (cardId: string) => {
    const next = blocks.map(x => ({ ...x }));
    const t = todayYMD();
    for (const b of next) {
      if (b.id !== cardId || b.indent !== 1) continue;
      const nextChecked = !Boolean(b.checked);
      b.checked = nextChecked;
      if (nextChecked) { b.deadline = t; b.isHidden = false; }
      break;
    }
    writeSelectedProjectBlocks(projectId, next);
    setBlocks(next);
  };

  const handleReschedule = (cardId: string, newDeadline: string) => {
    if (!isValidDateYYYYMMDD(newDeadline)) return;
    const next = blocks.map(x => ({ ...x }));
    for (const b of next) {
      if (b.id !== cardId || b.indent !== 1) continue;
      b.deadline = newDeadline;
      if (b.isHidden === true) b.isHidden = false;
      break;
    }
    writeSelectedProjectBlocks(projectId, next);
    setBlocks(next);
  };

  /* ── Unique list titles (for color assignment) ── */
  const listTitleIndex = useMemo(() => {
    const map: Record<string, number> = {};
    let i = 0;
    for (const c of allCards) {
      if (!(c.listTitle in map)) map[c.listTitle] = i++;
    }
    return map;
  }, [allCards]);

  /* ── Render pill dots for a day cell ── */
  const renderDayPills = (ymd: string) => {
    const groups = getGroupsForDay(ymd);
    if (!groups.length) return null;
    return (
      <div className="mt-1 flex flex-col gap-[4px]">
        {groups.slice(0, 3).map(g => {
          const done  = g.cards.filter(c => c.checked).length;
          const total = g.cards.length;
          const pct   = total > 0 ? (done / total) * 100 : 0;
          const allDone = done === total && total > 0;
          const idx   = listTitleIndex[g.listTitle] ?? 0;

          const fillColor = CALENDAR_CELL_FILL_COLORS[idx % CALENDAR_CELL_FILL_COLORS.length];

          return (
            <div
              key={g.listId}
              className={`relative overflow-hidden rounded-md border px-1.5 pt-[3px] pb-[5px] ${pillColorForCalendarCell(idx, isLight)}`}
              title={`${g.listTitle}: ${done}/${total}`}
            >
              {/* Label row */}
              <div className="flex items-center justify-between gap-1 leading-none mb-[4px]">
                <span className="text-[9px] md:text-[10px] font-medium truncate">
                  <span className="hidden md:inline">{g.listTitle}</span>
                  <span className="md:hidden">{g.listTitle.slice(0, 8)}</span>
                </span>
                <span className="text-[8px] md:text-[9px] opacity-60 shrink-0 tabular-nums">
                  {allDone ? '✓' : `${done}/${total}`}
                </span>
              </div>

              {/* Progress track */}
              <div className="h-[3px] w-full rounded-full overflow-hidden" style={{ background: 'var(--assistant-control-bg)' }}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.35)]' : fillColor}`}
                  style={{ width: `${pct}%`, opacity: allDone ? 0.95 : 0.8 }}
                />
              </div>
            </div>
          );
        })}
        {groups.length > 3 && (
          <div className="text-[9px] pl-1" style={{ color: 'var(--assistant-text-faint)' }}>+{groups.length - 3} more</div>
        )}
      </div>
    );
  };

  /* ── Selected day data ── */
  const selectedGroups = useMemo(
    () => selectedDay ? getGroupsForDay(selectedDay) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedDay, cardsByDate],
  );

  if (!hydrated) {
    return (
      <div className="h-full w-full bg-transparent flex items-center justify-center">
        <span className="text-sm" style={{ color: 'var(--assistant-tone-1)' }}>Loading calendar…</span>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-y-auto bg-transparent" style={{ color: 'var(--assistant-text)' }}>
      <div className="mx-auto max-w-6xl min-w-[770px] px-4 py-6 md:px-8 md:py-8">

        {/* ── Header / nav bar ── */}
        <div
          className="mb-6 flex items-center justify-between rounded-2xl border border-[#52b352]/12 bg-transparent px-4 py-3"
          style={{ boxShadow: 'inset 0 1px 0 var(--assistant-border-soft)' }}
        >
          <div>
            <h1 className="text-[24px] md:text-[28px] font-bold leading-none" style={{ color: 'var(--assistant-text)' }}>
              {MONTH_NAMES[viewMonth]}{' '}
              <span style={{ color: 'var(--assistant-tone-1)' }}>{viewYear}</span>
            </h1>
            <p className="text-[12px] mt-1" style={{ color: 'var(--assistant-text-faint)' }}>{projectTitle}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goToday}
              className="text-[11px] px-3 py-1.5 rounded-xl transition-all hover:scale-105"
              style={{
                color: 'var(--assistant-tone-1)',
                border: '1px solid color-mix(in srgb, var(--assistant-tone-1) 40%, transparent)',
                background: 'linear-gradient(135deg, color-mix(in srgb, var(--assistant-tone-1) 20%, transparent) 0%, color-mix(in srgb, var(--assistant-tone-1) 10%, transparent) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.1), 0 2px 8px rgba(0,0,0,.15)',
              }}
            >
              Today
            </button>
            <button
              type="button"
              onClick={prevMonth}
              className="h-8 w-8 flex items-center justify-center transition-colors"
              style={{ color: 'var(--assistant-text-soft)' }}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="h-8 w-8 flex items-center justify-center transition-colors"
              style={{ color: 'var(--assistant-text-soft)' }}
            >
              ›
            </button>
          </div>
        </div>

        {/* ── Weekday headers ── */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS_SHORT.map(wd => (
            <div key={wd} className="text-center py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--assistant-text-soft)' }}>
              <span className="hidden md:inline">{wd}</span>
              <span className="md:hidden">{wd[0]}</span>
            </div>
          ))}
        </div>

        {/* ── Desktop: 7-col grid ── */}
        <div className="hidden md:grid grid-cols-7 gap-[3px] rounded-2xl overflow-hidden border border-[#52b352]/10 p-[3px] bg-transparent"
          style={{
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05), 0 8px 32px rgba(0,0,0,.4)',
          }}>
          {grid.map((ymd, idx) => {
            const isToday    = ymd === today;
            const isSelected = ymd === selectedDay;
            const dayCards   = ymd ? (cardsByDate[ymd] ?? []) : [];
            const hasCards   = dayCards.length > 0;
            const isPast     = ymd ? dayDiff(ymd) < 0 : false;
            const isOverdue  = isPast && hasCards && dayCards.some(c => !c.checked);
            const [,, dayNum] = ymd ? ymd.split('-') : ['', '', ''];

            return (
              <div
                key={idx}
                onClick={() => ymd && setSelectedDay(prev => prev === ymd ? null : ymd)}
                className={[
                  'relative min-h-[100px] rounded-xl p-2 transition-all duration-150',
                  ymd ? 'cursor-pointer' : '',
                ].join(' ')}
                style={ymd ? {
                  background: isSelected
                    ? `linear-gradient(145deg, color-mix(in srgb, var(--assistant-tone-1) 20%, transparent) 0%, color-mix(in srgb, var(--assistant-tone-1) 8%, transparent) 100%)`
                    : isOverdue
                    ? 'rgba(239,68,68,.06)'
                    : hasCards
                    ? 'var(--assistant-surface)'
                    : 'transparent',
                  border: isSelected
                    ? `1px solid color-mix(in srgb, var(--assistant-tone-1) 30%, transparent)`
                    : isToday
                    ? `1px solid color-mix(in srgb, var(--assistant-tone-1) 22%, transparent)`
                    : isOverdue
                    ? '1px solid rgba(239,68,68,.15)'
                    : '1px solid var(--assistant-border-soft)',
                  boxShadow: isSelected
                    ? `inset 0 1px 0 rgba(255,255,255,.1), 0 2px 12px color-mix(in srgb, var(--assistant-tone-1) 15%, transparent)`
                    : 'none',
                } : {
                  background: 'var(--assistant-control-bg)',
                  border: '1px solid var(--assistant-border-soft)',
                }}
              >
                {ymd && (
                  <>
                    {/* Day number + status badge */}
                    <div className="flex items-center gap-1 mb-1">
                      <div
                        className="relative inline-flex items-center justify-center w-7 h-7 rounded-full text-[13px] font-semibold leading-none transition-colors shrink-0"
                        style={isToday ? {
                          background: `color-mix(in srgb, var(--assistant-tone-1) 18%, transparent)`,
                          color: 'var(--assistant-tone-1)',
                          border: `1px solid color-mix(in srgb, var(--assistant-tone-1) 40%, transparent)`,
                          boxShadow: `0 0 14px color-mix(in srgb, var(--assistant-tone-1) 22%, transparent)`,
                        } : isSelected ? {
                          background: `color-mix(in srgb, var(--assistant-tone-1) 14%, transparent)`,
                          color: 'var(--assistant-text)',
                          border: `1px solid color-mix(in srgb, var(--assistant-tone-1) 30%, transparent)`,
                        } : isOverdue ? {
                          color: 'var(--assistant-danger-text)',
                        } : {
                          color: 'var(--assistant-text-muted)',
                        }}
                      >
                        {parseInt(dayNum)}
                      </div>
                      {(() => {
                        const dayFlag = highestTaskFlag(
                          dayCards.filter(c => !c.checked).map(c => c.flag),
                        );
                        return dayFlag ? (
                          <span className="h-4 w-4 flex items-center justify-center" title="Has flagged task" aria-label="Has flagged task">
                            <TaskFlagIcon color={dayFlag} className="h-3.5 w-3.5" />
                          </span>
                        ) : null;
                      })()}
                      {isOverdue && (
                        <span className="text-[9px] font-semibold uppercase tracking-wide leading-none" style={{ color: 'var(--assistant-danger-text)' }}>
                          overdue
                        </span>
                      )}
                    </div>

                    {/* Pills */}
                    {renderDayPills(ymd)}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Mobile: 2-col grid ── */}
        <div className="md:hidden grid grid-cols-2 gap-2">
          {grid.filter(Boolean).map((ymd) => {
            if (!ymd) return null;
            const isToday    = ymd === today;
            const isSelected = ymd === selectedDay;
            const groups     = getGroupsForDay(ymd);
            const [,, dayNum] = ymd.split('-');
            const weekday    = new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
            const hasAnyTask = groups.length > 0;
            const isPast     = dayDiff(ymd) < 0;
            const isOverdue  = isPast && hasAnyTask && groups.flatMap(g => g.cards).some(c => !c.checked);

            return (
              <div
                key={ymd}
                onClick={() => setSelectedDay(prev => prev === ymd ? null : ymd)}
                className="rounded-xl p-3 cursor-pointer transition-all duration-150"
                style={{
                  background: isSelected
                    ? `linear-gradient(145deg, color-mix(in srgb, var(--assistant-tone-1) 20%, transparent) 0%, color-mix(in srgb, var(--assistant-tone-1) 8%, transparent) 100%)`
                    : isOverdue ? 'rgba(239,68,68,.06)'
                    : isToday
                    ? `linear-gradient(145deg, color-mix(in srgb, var(--assistant-tone-1) 14%, transparent) 0%, color-mix(in srgb, var(--assistant-tone-1) 5%, transparent) 100%)`
                    : hasAnyTask ? 'var(--assistant-surface)'
                    : 'transparent',
                  border: isSelected
                    ? `1px solid color-mix(in srgb, var(--assistant-tone-1) 30%, transparent)`
                    : isToday
                    ? `1px solid color-mix(in srgb, var(--assistant-tone-1) 22%, transparent)`
                    : isOverdue ? '1px solid rgba(239,68,68,.15)'
                    : '1px solid var(--assistant-border-soft)',
                  boxShadow: isSelected
                    ? `inset 0 1px 0 rgba(255,255,255,.1), 0 2px 12px color-mix(in srgb, var(--assistant-tone-1) 15%, transparent)`
                    : 'none',
                }}
              >
                {/* Day header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[18px] font-bold leading-none"
                      style={{
                        color: isOverdue ? 'var(--assistant-danger-text)'
                          : isToday ? 'var(--assistant-tone-1)'
                          : 'var(--assistant-text)',
                      }}
                    >
                      {parseInt(dayNum)}
                    </span>
                    <span className="text-[10px] uppercase" style={{ color: 'var(--assistant-text-faint)' }}>{weekday}</span>
                    {(() => {
                      const dayFlag = highestTaskFlag(
                        groups.flatMap(g => g.cards).filter(c => !c.checked).map(c => c.flag),
                      );
                      return dayFlag ? (
                        <span className="h-4 w-4 flex items-center justify-center" title="Has flagged task" aria-label="Has flagged task">
                          <TaskFlagIcon color={dayFlag} className="h-3.5 w-3.5" />
                        </span>
                      ) : null;
                    })()}
                  </div>
                  {isOverdue && (
                    <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: 'var(--assistant-danger-text)' }}>overdue</span>
                  )}
                </div>

                {/* Pills — all of them, no cap */}
                {groups.length > 0 ? (
                  <div className="space-y-[4px]">
                    {groups.map((g, gi) => {
                      const done  = g.cards.filter(c => c.checked).length;
                      const total = g.cards.length;
                      const pct   = total > 0 ? (done / total) * 100 : 0;
                      const pillDone = done === total && total > 0;
                      const colorIdx = listTitleIndex[g.listTitle] ?? gi;
                      const fillColor = CALENDAR_CELL_FILL_COLORS[colorIdx % CALENDAR_CELL_FILL_COLORS.length];
                      return (
                        <div
                          key={g.listId}
                          className={`relative overflow-hidden rounded-md border px-1.5 pt-[3px] pb-[5px] ${pillColorForCalendarCell(colorIdx, isLight)}`}
                          title={`${g.listTitle}: ${done}/${total}`}
                        >
                          <div className="flex items-center justify-between gap-1 leading-none mb-[4px]">
                            <span className="text-[9px] font-medium truncate">{g.listTitle.slice(0, 10)}</span>
                            <span className="text-[8px] opacity-60 shrink-0">{pillDone ? '✓' : `${done}/${total}`}</span>
                          </div>
                          <div className="h-[3px] w-full rounded-full overflow-hidden" style={{ background: 'var(--assistant-control-bg)' }}>
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${pillDone ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.35)]' : fillColor}`}
                              style={{ width: `${pct}%`, opacity: pillDone ? 0.95 : 0.8 }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {groups.length > 2 && (
                      <div className="text-[9px]" style={{ color: 'var(--assistant-text-faint)' }}>+{groups.length - 2}</div>
                    )}
                  </div>
                ) : (
                  <div className="text-[10px]" style={{ color: 'var(--assistant-text-faint)' }}>—</div>
                )}
              </div>
            );
          })}
        </div>

      </div>

      {selectedDay && (
        <DaySidebar
          ymd={selectedDay}
          groups={selectedGroups}
          isLight={isLight}
          onClose={() => setSelectedDay(null)}
          onToggleDone={id => {
            handleToggleDone(id);
          }}
          onReschedule={(id, date) => {
            handleReschedule(id, date);
            if (date.slice(0, 7) !== selectedDay.slice(0, 7)) {
              const [y, m] = date.split('-').map(Number);
              setViewYear(y);
              setViewMonth(m - 1);
              setSelectedDay(date);
            }
          }}
        />
      )}
    </div>
  );
}