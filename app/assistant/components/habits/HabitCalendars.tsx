'use client';

import React, { useMemo } from 'react';
import { addDaysYMD, type Habit } from '@/lib/datacenter';
import {
  type DayStatus,
  type HabitLogIndex,
  dayStatus,
  eachDay,
  monthGrid,
  mondayIndex,
  shiftMonth,
} from '@/app/assistant/_utils/habitSchedule';
import { MONTH_SHORT } from '@/app/assistant/_utils/habitStats';
import classes from '@/app/assistant/_theme/themes.module.css';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const STATUS_LABEL: Record<DayStatus, string> = {
  done: 'Done', partial: 'Partly done', missed: 'Missed', pending: 'Not done yet',
  skipped: 'Skipped', off: 'Not due', future: 'Upcoming',
};

/** Day cell colors by status, in the habit's color (inside a .yt-habit element). */
function statusStyle(s: DayStatus): React.CSSProperties {
  switch (s) {
    case 'done': return { background: 'var(--habit-color)', color: 'var(--habit-on)' };
    case 'partial': return { background: 'var(--habit-tint-strong)', color: 'var(--assistant-text)' };
    case 'missed': return { boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--assistant-danger-text) 55%, transparent)', color: 'var(--assistant-text-soft)' };
    case 'pending': return { boxShadow: 'inset 0 0 0 1.5px var(--habit-color)', color: 'var(--assistant-text)' };
    case 'skipped': return { boxShadow: 'inset 0 0 0 1.5px var(--assistant-border-soft)', color: 'var(--assistant-text-faint)', textDecoration: 'line-through' };
    case 'off': return { color: 'var(--assistant-text-muted)' };
    case 'future': return { color: 'var(--assistant-text-faint)' };
  }
}

/** One month of a habit: each day colored by how it went. Clicking a past day selects it. */
export function MonthStatusCalendar({ habit, index, month, onMonth, today, selected, onSelect }: {
  habit: Habit;
  index: HabitLogIndex;
  /** Any day of the month shown */
  month: string;
  onMonth: (month: string) => void;
  today: string;
  selected: string;
  onSelect: (ymd: string) => void;
}) {
  const cells = useMemo(() => monthGrid(month).map(d => (d ? { ymd: d, status: dayStatus(habit, index, d, today) } : null)),
    [habit, index, month, today]);
  const [y, m] = month.split('-').map(Number);
  const canNext = shiftMonth(month, 1) <= today;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => onMonth(shiftMonth(month, -1))} aria-label="Previous month"
          className={`flex h-8 w-8 items-center justify-center rounded-full ${classes.panelBtn}`}>‹</button>
        <div className="text-[14px] font-semibold" style={{ color: 'var(--assistant-text)' }}>
          {new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </div>
        <button type="button" onClick={() => onMonth(shiftMonth(month, 1))} disabled={!canNext} aria-label="Next month"
          className={`flex h-8 w-8 items-center justify-center rounded-full ${classes.panelBtn}`}>›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {LETTERS.map((l, i) => (
          <div key={i} className="pb-1 text-[11px] font-semibold" style={{ color: 'var(--assistant-text-faint)' }}>{l}</div>
        ))}
        {cells.map((c, i) => c ? (
          <button
            key={c.ymd}
            type="button"
            disabled={c.ymd > today}
            onClick={() => onSelect(c.ymd)}
            data-tip={`${c.ymd} · ${STATUS_LABEL[c.status]}`}
            aria-label={`${c.ymd}: ${STATUS_LABEL[c.status]}`}
            aria-pressed={c.ymd === selected}
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-medium tabular-nums transition-transform hover:scale-105 disabled:hover:scale-100"
            style={{
              ...statusStyle(c.status),
              ...(c.ymd === selected ? { outline: '2px solid var(--assistant-text)', outlineOffset: 2 } : {}),
            }}
          >
            {Number(c.ymd.slice(8))}
          </button>
        ) : <div key={`pad${i}`} />)}
      </div>
    </div>
  );
}

/** A year of a habit at a glance — one square per day, weeks as columns. */
export function YearHeatmap({ habit, index, year, onYear, today }: {
  habit: Habit;
  index: HabitLogIndex;
  year: number;
  onYear: (year: number) => void;
  today: string;
}) {
  const { cells, monthStarts } = useMemo(() => {
    const first = `${year}-01-01`;
    const start = addDaysYMD(first, -mondayIndex(first));
    const out = eachDay(start, `${year}-12-31`).map(d => ({
      ymd: d,
      inYear: d.startsWith(String(year)),
      status: d.startsWith(String(year)) ? dayStatus(habit, index, d, today) : 'off' as DayStatus,
    }));
    // Column where each month starts, for the labels above
    const starts = Array.from({ length: 12 }, (_, m) => Math.floor(out.findIndex(c => c.ymd === `${year}-${String(m + 1).padStart(2, '0')}-01`) / 7));
    return { cells: out, monthStarts: starts };
  }, [habit, index, year, today]);
  const weeks = Math.ceil(cells.length / 7);
  const thisYear = Number(today.slice(0, 4));

  const fill = (s: DayStatus) =>
    s === 'done' ? 'var(--habit-color)'
    : s === 'partial' ? 'color-mix(in srgb, var(--habit-color) 45%, transparent)'
    : s === 'missed' ? 'color-mix(in srgb, var(--assistant-danger-text) 22%, transparent)'
    : 'color-mix(in srgb, var(--assistant-text) 7%, transparent)';

  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-1">
        <button type="button" onClick={() => onYear(year - 1)} aria-label="Previous year"
          className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] ${classes.panelBtn}`}>‹</button>
        <span className="w-12 text-center text-[13px] font-semibold tabular-nums" style={{ color: 'var(--assistant-text)' }}>{year}</span>
        <button type="button" onClick={() => onYear(year + 1)} disabled={year >= thisYear} aria-label="Next year"
          className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] ${classes.panelBtn}`}>›</button>
      </div>
      <div className="overflow-x-auto pb-1" style={{ contain: 'inline-size' }}>
        <div className="relative mb-1 h-4" style={{ width: weeks * 13 }}>
          {monthStarts.map((col, m) => (
            <span key={m} className="absolute text-[10px]" style={{ left: col * 13, color: 'var(--assistant-text-faint)' }}>{MONTH_SHORT[m]}</span>
          ))}
        </div>
        <div className="grid grid-flow-col gap-[3px]" style={{ gridTemplateRows: 'repeat(7, 10px)', gridAutoColumns: '10px' }}
          role="img" aria-label={`${habit.text} in ${year}`}>
          {cells.map(c => (
            <div key={c.ymd} className="rounded-[2px]" data-tip={c.inYear ? `${c.ymd} · ${STATUS_LABEL[c.status]}` : undefined}
              style={{ background: c.inYear ? fill(c.status) : 'transparent' }} />
          ))}
        </div>
      </div>
    </div>
  );
}
