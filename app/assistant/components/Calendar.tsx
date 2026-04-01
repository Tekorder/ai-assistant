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
} from '@/lib/datacenter';

/* ===================== Local types ===================== */

type CalCard = {
  id: string;
  listTitle: string;
  text: string;
  checked: boolean;
  deadline: string;
  isHidden?: boolean;
  archived?: boolean;
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

function pillColorForList(index: number): string {
  /* Lime-first NRC palette; extra hues only to separate adjacent lists */
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
function pillColorForCalendarCell(index: number): string {
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
}: {
  ymd: string;
  groups: DayGroup[];
  onClose: () => void;
  onToggleDone: (id: string) => void;
  onReschedule: (id: string, newDate: string) => void;
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

  const diffClass = (() => {
    if (diff < 0) return 'text-red-300';
    if (diff === 0) return 'text-[#d5fc43]';
    if (diff === 1) return 'text-emerald-300';
    return 'text-sky-300';
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

  // Animation: slide in from right
  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close"
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full z-[201] flex flex-col"
        style={{
          width: 'min(420px, 92vw)',
          animation: 'calSidebarIn 0.28s cubic-bezier(.22,.9,.28,1)',
          background: [
            'linear-gradient(160deg, rgba(82,179,82,.07) 0%, transparent 35%)',
            'linear-gradient(to bottom, rgba(255,255,255,.05) 0%, transparent 18%)',
            'rgba(7,7,7,0.82)',
          ].join(', '),
          backdropFilter: 'blur(28px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.4)',
          borderLeft: '1px solid rgba(82,179,82,.12)',
          boxShadow: [
            '-4px 0 60px rgba(0,0,0,.6)',
            '-1px 0 0 rgba(255,255,255,.04)',
            'inset 1px 0 0 rgba(255,255,255,.05)',
            '0 0 80px rgba(82,179,82,.06)',
          ].join(', '),
        }}
      >
        <style>{`
          @keyframes calSidebarIn {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
        `}</style>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[22px] font-bold text-white leading-none">
                {new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })}
              </span>
              <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-full bg-white/8 border border-white/10 ${diffClass}`}>
                {dayLabel}
              </span>
            </div>
            <div className="text-[13px] text-white/45 mt-1">
              {new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1 rounded-full bg-white/10 flex-1 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#d5fc43]/85 transition-all duration-500 shadow-[0_0_12px_rgba(213,252,67,.25)]"
                  style={{ width: totalCount ? `${(doneCount / totalCount) * 100}%` : '0%' }}
                />
              </div>
              <span className="text-[11px] text-white/40 shrink-0">{doneCount}/{totalCount}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-[#d5fc43] hover:bg-[#d5fc43]/10 transition-colors mt-1"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {groups.length === 0 ? (
            <div className="text-center py-12 text-white/30 text-[13px]">No tasks for this day.</div>
          ) : (
            groups.map((group, gi) => (
              <div key={group.listId} className="space-y-2">
                {/* List label */}
                <div className="flex items-center gap-2 px-1">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${pillColorForList(gi)}`}>
                    {group.listTitle}
                  </span>
                  <span className="text-[11px] text-white/30">{group.cards.length} task{group.cards.length !== 1 ? 's' : ''}</span>
                </div>

                {/* Cards */}
                {group.cards.map(card => (
                  <div
                    key={card.id}
                    className={[
                      'rounded-xl border transition-all duration-200',
                      card.archived
                        ? 'bg-white/2 border-white/5 opacity-40'
                        : card.checked
                        ? 'bg-white/3 border-white/6 opacity-55'
                        : 'bg-white/6 border-white/10 hover:bg-white/8',
                    ].join(' ')}
                  >
                    <div className="p-3">
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="group flex items-start gap-2 min-w-0 flex-1">
                          {/* Checkbox / archived indicator */}
                          {card.archived ? (
                            <span className="mt-0.5 h-4 w-4 rounded border border-white/15 flex items-center justify-center shrink-0 text-white/30 text-[9px]">
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
                                <span className="h-3 w-3 rounded border border-white/25 group-hover:border-white/40 transition-colors" />
                              )}
                            </button>
                          )}

                          {/* Text */}
                          <span
                            className={[
                              'text-[13px] leading-snug',
                              card.archived
                                ? 'line-through text-white/25'
                                : card.checked
                                ? 'line-through text-white/35'
                                : 'text-white/85',
                            ].join(' ')}
                          >
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
                          <span className="text-[9px] text-white/25 shrink-0">archived</span>
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

export default function CalendarView() {
  const [blocks, setBlocks]             = useState<Block[]>([]);
  const [hydrated, setHydrated]         = useState(false);
  const [projectId, setProjectId]       = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState<string>('Project');

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

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];

    if (b.indent === 0) {
      currentListTitle = (b.text || '').trim();
      continue;
    }

    if (b.indent !== 1) continue;
    if (b.archived) continue; // 👈 ocultar archivados
    if (!isValidDateYYYYMMDD(b.deadline)) continue;

    out.push({
      id:        b.id,
      listTitle: currentListTitle || projectTitle || 'General',
      text:      b.text || '',
      checked:   Boolean(b.checked),
      deadline:  b.deadline!,
      isHidden:  b.isHidden === true,
      archived:  b.archived // error aqui 
    });
  }

  return out;
}, [blocks, projectTitle]);

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
              className={`relative overflow-hidden rounded-md border px-1.5 pt-[3px] pb-[5px] ${pillColorForCalendarCell(idx)}`}
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
              <div className="h-[3px] w-full rounded-full bg-black/30 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.35)]' : fillColor}`}
                  style={{ width: `${pct}%`, opacity: allDone ? 0.95 : 0.8 }}
                />
              </div>
            </div>
          );
        })}
        {groups.length > 3 && (
          <div className="text-[9px] text-white/35 pl-1">+{groups.length - 3} more</div>
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
      <div className="h-full w-full bg-[#060606] flex items-center justify-center">
        <span className="text-[#d5fc43]/60 text-sm">Loading calendar…</span>
      </div>
    );
  }

  return (
    <div className="h-full w-full text-white overflow-y-auto"
      style={{
        background: [
          'radial-gradient(ellipse 80% 55% at 50% -5%,  rgba(82,179,82,.08) 0%, transparent 60%)',
          'radial-gradient(ellipse 55% 40% at 95%  95%,  rgba(82,179,82,.05) 0%, transparent 55%)',
          'radial-gradient(ellipse 40% 50% at 0%   80%,  rgba(50,130,50,.04) 0%, transparent 60%)',
          '#060606',
        ].join(', '),
      }}>
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8">

        {/* ── Header / nav bar ── */}
        <div className="flex items-center justify-between mb-6 rounded-2xl px-4 py-3"
          style={{
            background: [
              'linear-gradient(135deg, rgba(82,179,82,.07) 0%, transparent 45%)',
              'linear-gradient(to bottom, rgba(255,255,255,.06) 0%, transparent 30%)',
              'rgba(10,10,10,0.65)',
            ].join(', '),
            backdropFilter: 'blur(18px) saturate(1.3)',
            WebkitBackdropFilter: 'blur(18px) saturate(1.3)',
            border: '1px solid rgba(82,179,82,.09)',
            boxShadow: [
              '0 0 0 1px rgba(255,255,255,.04)',
              'inset 0 1px 0 rgba(255,255,255,.09)',
              '0 4px 24px rgba(0,0,0,.4)',
            ].join(', '),
          }}>
          <div>
            <h1 className="text-[24px] md:text-[28px] font-bold text-white leading-none">
              {MONTH_NAMES[viewMonth]}{' '}
              <span className="text-[#52b352]/85">{viewYear}</span>
            </h1>
            <p className="text-[12px] text-white/40 mt-1">{projectTitle}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goToday}
              className="text-[11px] px-3 py-1.5 rounded-xl border border-[#52b352]/40 text-[#52b352] transition-all hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, rgba(82,179,82,.2) 0%, rgba(82,179,82,.1) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.1), 0 2px 8px rgba(0,0,0,.25)',
              }}
            >
              Today
            </button>
            <button
              type="button"
              onClick={prevMonth}
              className="h-8 w-8 rounded-full border border-[#52b352]/70 text-black transition-all hover:scale-105 flex items-center justify-center"
              style={{
                background: 'linear-gradient(145deg, #72d472 0%, #52b352 55%, #2e8b2e 100%)',
                boxShadow: '0 2px 10px rgba(82,179,82,.3), inset 0 1px 0 rgba(255,255,255,.3)',
              }}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="h-8 w-8 rounded-full border border-[#52b352]/70 text-black transition-all hover:scale-105 flex items-center justify-center"
              style={{
                background: 'linear-gradient(145deg, #72d472 0%, #52b352 55%, #2e8b2e 100%)',
                boxShadow: '0 2px 10px rgba(82,179,82,.3), inset 0 1px 0 rgba(255,255,255,.3)',
              }}
            >
              ›
            </button>
          </div>
        </div>

        {/* ── Weekday headers ── */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS_SHORT.map(wd => (
            <div key={wd} className="text-center text-[11px] font-semibold text-[#d5fc43]/55 py-2 uppercase tracking-wider">
              <span className="hidden md:inline">{wd}</span>
              <span className="md:hidden">{wd[0]}</span>
            </div>
          ))}
        </div>

        {/* ── Desktop: 7-col grid ── */}
        <div className="hidden md:grid grid-cols-7 gap-[3px] rounded-2xl overflow-hidden p-[3px]"
          style={{
            background: 'rgba(8,8,8,0.5)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(82,179,82,.08)',
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
                    ? 'linear-gradient(145deg, rgba(82,179,82,.2) 0%, rgba(82,179,82,.08) 100%)'
                    : isOverdue
                    ? 'rgba(239,68,68,.06)'
                    : hasCards
                    ? 'linear-gradient(145deg, rgba(255,255,255,.06) 0%, rgba(255,255,255,.02) 100%)'
                    : 'rgba(88,88,88,.02)',
                  border: isSelected
                    ? '1px solid rgba(82,179,82,.3)'
                    : isToday
                    ? '1px solid rgba(82,179,82,.22)'
                    : isOverdue
                    ? '1px solid rgba(239,68,68,.15)'
                    : '1px solid rgba(255,255,255,.05)',
                  boxShadow: isSelected
                    ? 'inset 0 1px 0 rgba(255,255,255,.1), 0 2px 12px rgba(82,179,82,.15)'
                    : 'inset 0 1px 0 rgba(255,255,255,.04)',
                } : {
                  background: 'rgba(0,0,0,.25)',
                  border: '1px solid rgba(255,255,255,.03)',
                }}
              >
                {ymd && (
                  <>
                    {/* Day number + status badge */}
                    <div className="flex items-center gap-1 mb-1">
                      <div className={[
                        'relative inline-flex items-center justify-center w-7 h-7 rounded-full text-[13px] font-semibold leading-none transition-colors shrink-0',
                        isToday
                          ? 'bg-[#d5fc43]/18 text-[#d5fc43] border border-[#d5fc43]/40 shadow-[0_0_14px_rgba(213,252,67,.22)]'
                          : isSelected
                          ? 'bg-[#d5fc43]/14 text-white border border-[#d5fc43]/30'
                          : isOverdue
                          ? 'text-red-300/80'
                          : 'text-white/60',
                      ].join(' ')}>
                        {parseInt(dayNum)}
                      </div>
                      {isOverdue && (
                        <span className="text-[9px] font-semibold text-red-400/70 uppercase tracking-wide leading-none">
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
                    ? 'linear-gradient(145deg, rgba(82,179,82,.2) 0%, rgba(82,179,82,.08) 100%)'
                    : isOverdue
                    ? 'rgba(239,68,68,.06)'
                    : isToday
                    ? 'linear-gradient(145deg, rgba(82,179,82,.14) 0%, rgba(82,179,82,.05) 100%)'
                    : hasAnyTask
                    ? 'linear-gradient(145deg, rgba(255,255,255,.06) 0%, rgba(255,255,255,.02) 100%)'
                    : 'rgba(88,88,88,.02)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: isSelected
                    ? '1px solid rgba(82,179,82,.3)'
                    : isToday
                    ? '1px solid rgba(82,179,82,.22)'
                    : isOverdue
                    ? '1px solid rgba(239,68,68,.15)'
                    : '1px solid rgba(255,255,255,.06)',
                  boxShadow: isSelected
                    ? 'inset 0 1px 0 rgba(255,255,255,.1), 0 2px 12px rgba(82,179,82,.15)'
                    : 'inset 0 1px 0 rgba(255,255,255,.05)',
                }}
              >
                {/* Day header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className={[
                      'text-[18px] font-bold leading-none',
                      isOverdue ? 'text-red-300/80' :
                      isToday   ? 'text-[#d5fc43]' : 'text-white/85',
                    ].join(' ')}>
                      {parseInt(dayNum)}
                    </span>
                    <span className="text-[10px] text-white/35 uppercase">{weekday}</span>
                  </div>
                  {isOverdue && (
                    <span className="text-[9px] font-semibold text-red-400/70 uppercase tracking-wide">overdue</span>
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
                          className={`relative overflow-hidden rounded-md border px-1.5 pt-[3px] pb-[5px] ${pillColorForCalendarCell(colorIdx)}`}
                          title={`${g.listTitle}: ${done}/${total}`}
                        >
                          <div className="flex items-center justify-between gap-1 leading-none mb-[4px]">
                            <span className="text-[9px] font-medium truncate">{g.listTitle.slice(0, 10)}</span>
                            <span className="text-[8px] opacity-60 shrink-0">{pillDone ? '✓' : `${done}/${total}`}</span>
                          </div>
                          <div className="h-[3px] w-full rounded-full bg-black/30 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${pillDone ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.35)]' : fillColor}`}
                              style={{ width: `${pct}%`, opacity: pillDone ? 0.95 : 0.8 }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {groups.length > 2 && (
                      <div className="text-[9px] text-white/30">+{groups.length - 2}</div>
                    )}
                  </div>
                ) : (
                  <div className="text-[10px] text-white/20">—</div>
                )}
              </div>
            );
          })}
        </div>

      </div>

      {/* ── Day Sidebar ── */}
      {selectedDay && (
        <DaySidebar
          ymd={selectedDay}
          groups={selectedGroups}
          onClose={() => setSelectedDay(null)}
          onToggleDone={id => {
            handleToggleDone(id);
          }}
          onReschedule={(id, date) => {
            handleReschedule(id, date);
            // If rescheduled to a different month, close sidebar
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