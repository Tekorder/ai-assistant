'use client';
import React, { useEffect, useMemo, useState } from 'react';

import {
  type Block,
  LS_KEY_V2,
  LS_KEY_V1,
  isValidDateYYYYMMDD,
  startOfLocalDay,
  todayYMD,
  parseYMD,
  readSelectedProject,
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

const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/* ===================== Main Component ===================== */

export type MiniCalendarProps = {
  /** If set, clicking a day invokes this (compact picker; no day sidebar) */
  onPickDay?: (ymd: string) => void;
  compact?: boolean;
};

/** Compact month grid for side drawer (e.g. Quick). Full app calendar is `Calendar.tsx`. */
export default function MiniCalendar({ onPickDay, compact = false }: MiniCalendarProps) {
  const [blocks, setBlocks]             = useState<Block[]>([]);
  const [hydrated, setHydrated]         = useState(false);
  const [projectTitle, setProjectTitle] = useState<string>('Project');

  // Calendar nav
  const today = todayYMD();
  const [viewYear, setViewYear]   = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth()); // 0-based

  /* ── Load & sync ── */
  useEffect(() => {
    const load = () => {
      const snap = readSelectedProject();
      setBlocks(snap.blocks);
      setProjectTitle(snap.projectTitle);
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

  /** Visible tasks for a day (excludes dismissed/hidden tasks for count). */
  const getVisibleDayCards = (ymd: string): CalCard[] => {
    const cards = cardsByDate[ymd] ?? [];
    return cards.filter(c => c.isHidden !== true);
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

  /** One compact row: "4 tasks" + fraction + single progress bar */
  const renderDaySummary = (ymd: string) => {
    const visible = getVisibleDayCards(ymd);
    if (!visible.length) return null;
    const total = visible.length;
    const done = visible.filter(c => c.checked).length;
    const pct = total > 0 ? (done / total) * 100 : 0;
    const allDone = done === total && total > 0;
    return (
      <div className="mt-auto flex min-h-0 flex-col gap-0.5 pt-0.5">
        <div className="flex items-baseline justify-between gap-1 leading-none">
          <span className="text-[9px] font-semibold text-white/65 tabular-nums">
            {total} {total === 1 ? 'task' : 'tasks'}
          </span>
          <span className={`text-[8px] tabular-nums shrink-0 ${allDone ? 'text-emerald-400/95' : 'text-white/35'}`}>
            {allDone ? '✓' : `${done}/${total}`}
          </span>
        </div>
        <div className="h-[3px] w-full shrink-0 overflow-hidden rounded-full bg-black/35">
          <div
            className={`h-full rounded-full transition-all duration-300 ${allDone ? 'bg-emerald-400/95' : 'bg-[#52b352]/85'}`}
            style={{ width: `${pct}%`, minWidth: pct > 0 ? '4px' : undefined }}
          />
        </div>
      </div>
    );
  };

  if (!hydrated) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-transparent">
        <span className="text-[#d5fc43]/60 text-sm">Loading calendar…</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="w-full text-white p-2">
        <div className="flex items-center justify-between mb-2">
          <button type="button" onClick={prevMonth} className="h-6 w-6 rounded-md bg-white/10 text-white/70 hover:bg-white/16">‹</button>
          <div className="text-[12px] font-semibold text-white/85">
            {MONTH_NAMES[viewMonth]} <span className="text-[#52b352]/85">{viewYear}</span>
          </div>
          <button type="button" onClick={nextMonth} className="h-6 w-6 rounded-md bg-white/10 text-white/70 hover:bg-white/16">›</button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS_SHORT.map(wd => (
            <div key={wd} className="text-center text-[9px] text-white/35">{wd[0]}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {grid.map((ymd, idx) => {
            if (!ymd) return <div key={`empty-${idx}`} className="h-7 rounded-md bg-transparent" />;
            const isToday = ymd === today;
            const dayCards = getVisibleDayCards(ymd);
            const hasPending = dayCards.some(c => !c.checked);
            const hasDone = dayCards.some(c => c.checked);
            const [, , day] = ymd.split('-');
            return (
              <button
                key={ymd}
                type="button"
                onClick={() => onPickDay?.(ymd)}
                className={[
                  'h-7 rounded-md text-[11px] transition-colors',
                  isToday ? 'bg-[#52b352]/22 text-[#52b352]' : 'text-white/75 hover:bg-white/10',
                ].join(' ')}
                title={ymd}
              >
                <span className="inline-flex items-center gap-1">
                  {Number(day)}
                  {(hasPending || hasDone) ? (
                    <span className={['h-1.5 w-1.5 rounded-full', hasPending ? 'bg-rose-300/90' : 'bg-emerald-300/90'].join(' ')} />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-transparent text-white">
      <div className="w-full max-w-[min(100%,1000px)] mx-auto px-2 sm:px-3 py-2 md:py-3">

        {/* ── Header / nav bar (compact) ── */}
        <div className="mb-3 flex items-center justify-between rounded-xl border border-[#52b352]/12 bg-transparent px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,.06)] md:px-3 md:py-2.5">
          <div className="min-w-0">
            <h1 className="text-[15px] md:text-[17px] font-bold text-white leading-tight truncate">
              {MONTH_NAMES[viewMonth]}{' '}
              <span className="text-[#52b352]/85">{viewYear}</span>
            </h1>
            <p className="text-[10px] text-white/35 mt-0.5 truncate">{projectTitle}</p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={goToday}
              className="text-[10px] px-2 py-1 rounded-lg text-[#52b352] transition-all hover:scale-[1.02]"
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
              className="h-7 w-7 rounded-full text-[15px] leading-none text-black transition-all hover:scale-105 flex items-center justify-center"
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
              className="h-7 w-7 rounded-full text-[15px] leading-none text-black transition-all hover:scale-105 flex items-center justify-center"
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
        <div className="grid grid-cols-7 mb-0.5">
          {WEEKDAYS_SHORT.map(wd => (
            <div key={wd} className="text-center text-[9px] font-semibold text-[#d5fc43]/50 py-1 uppercase tracking-wide">
              <span className="hidden md:inline">{wd.slice(0, 3)}</span>
              <span className="md:hidden">{wd[0]}</span>
            </div>
          ))}
        </div>

        {/* ── Desktop: 7-col grid ── */}
        <div
          className="hidden md:grid grid-cols-7 grid-auto-rows-[minmax(72px,auto)] gap-0.5 overflow-hidden rounded-xl border border-[#52b352]/10 bg-transparent p-0.5"
          style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05)' }}
        >
          {grid.map((ymd, idx) => {
            const isToday    = ymd === today;
            const visible    = ymd ? getVisibleDayCards(ymd) : [];
            const hasCards   = visible.length > 0;
            const isPast     = ymd ? dayDiff(ymd) < 0 : false;
            const isOverdue  = isPast && hasCards && visible.some(c => !c.checked);
            const [,, dayNum] = ymd ? ymd.split('-') : ['', '', ''];

            return (
              <div
                key={idx}
                role={ymd && onPickDay ? 'button' : undefined}
                tabIndex={ymd && onPickDay ? 0 : undefined}
                onClick={() => { if (ymd && onPickDay) onPickDay(ymd); }}
                onKeyDown={e => { if (ymd && onPickDay && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPickDay(ymd); } }}
                className={[
                  'relative flex min-h-[72px] flex-col overflow-hidden rounded-lg p-1.5 transition-all duration-150',
                  ymd && onPickDay ? 'cursor-pointer' : '',
                ].join(' ')}
                style={ymd ? {
                  background: isOverdue
                    ? 'rgba(239,68,68,.06)'
                    : hasCards
                    ? 'linear-gradient(145deg, rgba(255,255,255,.06) 0%, rgba(255,255,255,.02) 100%)'
                    : 'rgba(88,88,88,.02)',
                  border: isToday
                    ? '1px solid rgba(82,179,82,.22)'
                    : isOverdue
                    ? '1px solid rgba(239,68,68,.15)'
                    : '1px solid rgba(255,255,255,.05)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.04)',
                } : {
                  background: 'rgba(0,0,0,.25)',
                  border: '1px solid rgba(255,255,255,.03)',
                }}
              >
                {ymd && (
                  <>
                    <div className="mb-0.5 flex shrink-0 items-center gap-0.5">
                      <div className={[
                        'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full text-[11px] font-semibold leading-none',
                        isToday
                          ? 'bg-[#d5fc43]/22 text-[#d5fc43] shadow-[0_0_10px_rgba(213,252,67,.18)]'
                          : isOverdue
                          ? 'text-red-300/85'
                          : 'text-white/55',
                      ].join(' ')}>
                        {parseInt(dayNum)}
                      </div>
                      {isOverdue && (
                        <span className="text-[7px] font-semibold uppercase leading-none text-red-400/75">
                          !
                        </span>
                      )}
                    </div>
                    {hasCards ? renderDaySummary(ymd) : null}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Mobile: 2-col grid (compact) ── */}
        <div className="md:hidden grid grid-cols-2 gap-1.5">
          {grid.filter(Boolean).map((ymd) => {
            if (!ymd) return null;
            const isToday    = ymd === today;
            const visible    = getVisibleDayCards(ymd);
            const hasAnyTask = visible.length > 0;
            const [,, dayNum] = ymd.split('-');
            const weekday    = new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
            const isPast     = dayDiff(ymd) < 0;
            const isOverdue  = isPast && hasAnyTask && visible.some(c => !c.checked);

            return (
              <div
                key={ymd}
                role={onPickDay ? 'button' : undefined}
                tabIndex={onPickDay ? 0 : undefined}
                onClick={() => { if (onPickDay) onPickDay(ymd); }}
                onKeyDown={e => { if (onPickDay && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPickDay(ymd); } }}
                className={['flex min-h-[88px] flex-col overflow-hidden rounded-lg p-2 transition-all duration-150', onPickDay ? 'cursor-pointer' : ''].join(' ')}
                style={{
                  background: isOverdue
                    ? 'rgba(239,68,68,.06)'
                    : isToday
                    ? 'linear-gradient(145deg, rgba(82,179,82,.12) 0%, rgba(82,179,82,.04) 100%)'
                    : hasAnyTask
                    ? 'linear-gradient(145deg, rgba(255,255,255,.06) 0%, rgba(255,255,255,.02) 100%)'
                    : 'rgba(88,88,88,.02)',
                  border: isToday
                    ? '1px solid rgba(82,179,82,.22)'
                    : isOverdue
                    ? '1px solid rgba(239,68,68,.15)'
                    : '1px solid rgba(255,255,255,.06)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05)',
                }}
              >
                <div className="mb-1 flex shrink-0 items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    <span className={[
                      'text-[15px] font-bold leading-none',
                      isOverdue ? 'text-red-300/85' :
                      isToday   ? 'text-[#d5fc43]' : 'text-white/80',
                    ].join(' ')}>
                      {parseInt(dayNum)}
                    </span>
                    <span className="text-[9px] uppercase text-white/35">{weekday}</span>
                  </div>
                  {isOverdue && (
                    <span className="text-[8px] font-semibold uppercase text-red-400/75">!</span>
                  )}
                </div>
                {hasAnyTask ? renderDaySummary(ymd) : (
                  <div className="text-[9px] text-white/20">—</div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}