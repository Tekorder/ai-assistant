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
import classes from '@/app/assistant/_theme/themes.module.css';

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
    if (b.archived) continue;
    if (!isValidDateYYYYMMDD(b.deadline)) continue;

    out.push({
      id:        b.id,
      listTitle: currentListTitle || projectTitle || 'General',
      text:      b.text || '',
      checked:   Boolean(b.checked),
      deadline:  b.deadline!,
      isHidden:  b.isHidden === true,
      archived:  b.archived
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
          <span className="text-[9px] font-semibold tabular-nums" style={{ color: 'var(--assistant-text-muted)' }}>
            {total} {total === 1 ? 'task' : 'tasks'}
          </span>
          <span
            className={`text-[8px] tabular-nums shrink-0 ${allDone ? 'text-emerald-400/95' : ''}`}
            style={!allDone ? { color: 'var(--assistant-text-faint)' } : undefined}
          >
            {allDone ? '✓' : `${done}/${total}`}
          </span>
        </div>
        <div className={`h-0.75 w-full shrink-0 overflow-hidden rounded-full ${classes.miniCalProgressBg}`}>
          <div
            className={`h-full rounded-full transition-all duration-300 ${allDone ? 'bg-emerald-400/95' : classes.miniCalProgressFill}`}
            style={{ width: `${pct}%`, minWidth: pct > 0 ? '4px' : undefined }}
          />
        </div>
      </div>
    );
  };

  if (!hydrated) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-transparent">
        <span className="text-sm" style={{ color: 'var(--assistant-accent)' }}>Loading calendar…</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="w-full p-2" style={{ color: 'var(--assistant-text)' }}>
        <div className="flex items-center justify-between mb-2">
          <button type="button" onClick={prevMonth} className={`h-6 w-6 rounded-md text-sm ${classes.miniCalNavBtn}`}>‹</button>
          <div className="text-[12px] font-semibold" style={{ color: 'var(--assistant-text-soft)' }}>
            {MONTH_NAMES[viewMonth]}{' '}
            <span style={{ color: 'var(--assistant-accent)' }}>{viewYear}</span>
          </div>
          <button type="button" onClick={nextMonth} className={`h-6 w-6 rounded-md text-sm ${classes.miniCalNavBtn}`}>›</button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS_SHORT.map(wd => (
            <div key={wd} className="text-center text-[9px]" style={{ color: 'var(--assistant-text-faint)' }}>{wd[0]}</div>
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
                  isToday ? classes.miniCalDayToday : classes.miniCalDayNormal,
                ].join(' ')}
                title={ymd}
              >
                <span className="inline-flex items-center gap-1">
                  {Number(day)}
                  {(hasPending || hasDone) ? (
                    <span className={['h-1.5 w-1.5 rounded-full', hasPending ? 'bg-rose-400/80' : 'bg-emerald-400/80'].join(' ')} />
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
    <div className="h-full w-full overflow-y-auto bg-transparent" style={{ color: 'var(--assistant-text)' }}>
      <div className="w-full max-w-[min(100%,1000px)] mx-auto px-2 sm:px-3 py-2 md:py-3">

        {/* ── Header / nav bar ── */}
        <div className="mb-3 flex items-center justify-between rounded-xl px-2.5 py-2 md:px-3 md:py-2.5"
          style={{ border: '1px solid color-mix(in srgb, var(--assistant-accent) 12%, transparent)', background: 'transparent', boxShadow: 'inset 0 1px 0 var(--assistant-highlight)' }}>
          <div className="min-w-0">
            <h1 className="text-[15px] md:text-[17px] font-bold leading-tight truncate" style={{ color: 'var(--assistant-text)' }}>
              {MONTH_NAMES[viewMonth]}{' '}
              <span style={{ color: 'var(--assistant-accent)' }}>{viewYear}</span>
            </h1>
            <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--assistant-text-faint)' }}>{projectTitle}</p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={goToday}
              className={`text-[10px] px-2 py-1 rounded-lg transition-all hover:scale-[1.02] ${classes.miniCalTodayBtn}`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={prevMonth}
              className={`h-7 w-7 rounded-full text-[15px] leading-none flex items-center justify-center ${classes.miniCalArrowBtn}`}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className={`h-7 w-7 rounded-full text-[15px] leading-none flex items-center justify-center ${classes.miniCalArrowBtn}`}
            >
              ›
            </button>
          </div>
        </div>

        {/* ── Weekday headers ── */}
        <div className="grid grid-cols-7 mb-0.5">
          {WEEKDAYS_SHORT.map(wd => (
            <div key={wd} className="text-center text-[9px] font-semibold py-1 uppercase tracking-wide" style={{ color: 'var(--assistant-text-faint)' }}>
              <span className="hidden md:inline">{wd.slice(0, 3)}</span>
              <span className="md:hidden">{wd[0]}</span>
            </div>
          ))}
        </div>

        {/* ── Desktop: 7-col grid ── */}
        <div
          className="hidden md:grid grid-cols-7 grid-auto-rows-[minmax(72px,auto)] gap-0.5 overflow-hidden rounded-xl p-0.5"
          style={{ border: '1px solid color-mix(in srgb, var(--assistant-accent) 10%, transparent)', background: 'transparent', boxShadow: 'inset 0 1px 0 var(--assistant-highlight)' }}
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
                  'relative flex min-h-18 flex-col overflow-hidden rounded-lg p-1.5 transition-all duration-150',
                  ymd && onPickDay ? 'cursor-pointer' : '',
                  ymd
                    ? isToday ? classes.miniCalCellToday : classes.miniCalCellDefault
                    : classes.miniCalCellEmpty,
                ].join(' ')}
                style={ymd ? {
                  background: isOverdue
                    ? 'rgba(239,68,68,.06)'
                    : hasCards
                    ? 'var(--assistant-surface)'
                    : 'transparent',
                  ...(isOverdue ? { borderColor: 'rgba(239,68,68,.25)' } : {}),
                } : {}}
              >
                {ymd && (
                  <>
                    <div className="mb-0.5 flex shrink-0 items-center gap-0.5">
                      <div className={[
                        'inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[11px] font-semibold leading-none',
                        isToday
                          ? classes.miniCalDayNumToday
                          : isOverdue
                          ? 'text-red-400/85'
                          : classes.miniCalDayNumDefault,
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

        {/* ── Mobile: 2-col grid ── */}
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
                className={[
                  'flex min-h-22 flex-col overflow-hidden rounded-lg p-2 transition-all duration-150',
                  onPickDay ? 'cursor-pointer' : '',
                  isToday ? classes.miniCalCellToday : classes.miniCalCellDefault,
                ].join(' ')}
                style={{
                  background: isOverdue
                    ? 'rgba(239,68,68,.06)'
                    : isToday
                    ? 'color-mix(in srgb, var(--assistant-accent) 8%, transparent)'
                    : hasAnyTask
                    ? 'var(--assistant-surface)'
                    : 'transparent',
                  ...(isOverdue ? { borderColor: 'rgba(239,68,68,.25)' } : {}),
                }}
              >
                <div className="mb-1 flex shrink-0 items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    <span className={[
                      'text-[15px] font-bold leading-none',
                      isOverdue ? 'text-red-400/85' : '',
                    ].join(' ')}
                      style={!isOverdue ? { color: isToday ? 'var(--assistant-accent)' : 'var(--assistant-text-soft)' } : undefined}
                    >
                      {parseInt(dayNum)}
                    </span>
                    <span className="text-[9px] uppercase" style={{ color: 'var(--assistant-text-faint)' }}>{weekday}</span>
                  </div>
                  {isOverdue && (
                    <span className="text-[8px] font-semibold uppercase text-red-400/75">!</span>
                  )}
                </div>
                {hasAnyTask ? renderDaySummary(ymd) : (
                  <div className="text-[9px]" style={{ color: 'var(--assistant-text-faint)' }}>—</div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
