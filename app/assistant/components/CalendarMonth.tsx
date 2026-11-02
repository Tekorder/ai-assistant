'use client';
import React from 'react';
import classes from '@/app/assistant/_theme/themes.module.css';
import { addDaysYMD, monthEndYMD, todayYMD } from '@/lib/datacenter';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function shiftMonth(monthStart: string, delta: number): string {
  const [y, m] = monthStart.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Monday-first grid for the month: leading blanks (null) then each day. */
function monthGrid(monthStart: string): (string | null)[] {
  const [y, m] = monthStart.split('-').map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const days: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let cur = monthStart, end = monthEndYMD(monthStart); cur <= end; cur = addDaysYMD(cur, 1)) days.push(cur);
  return days;
}

/**
 * Month header with arrows + day grid — the one calendar look every date picker shares.
 * `lo`/`hi` are the selected edges (the same day for a single pick); days between them are tinted.
 */
export function CalendarMonth({
  month,
  onMonthChange,
  lo,
  hi,
  min,
  onPick,
  onDoublePick,
  onHover,
}: {
  /** First day of the shown month ("2026-10-01") */
  month: string;
  onMonthChange: (month: string) => void;
  lo?: string | null;
  hi?: string | null;
  /** Days before this can't be picked */
  min?: string;
  onPick: (ymd: string) => void;
  onDoublePick?: (ymd: string) => void;
  onHover?: (ymd: string | null) => void;
}) {
  const today = todayYMD();
  const [y, m] = month.split('-').map(Number);
  const monthTitle = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => onMonthChange(shiftMonth(month, -1))} aria-label="Previous month"
          className={`grid place-items-center size-8 text-[22px] leading-none ${classes.quickNavArrow}`}>‹</button>
        <div className="text-[13px] font-semibold" style={{ color: 'var(--assistant-text)' }}>{monthTitle}</div>
        <button type="button" onClick={() => onMonthChange(shiftMonth(month, 1))} aria-label="Next month"
          className={`grid place-items-center size-8 text-[22px] leading-none ${classes.quickNavArrow}`}>›</button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center" onMouseLeave={() => onHover?.(null)}>
        {WEEKDAYS.map(w => (
          <div key={w} className="text-[11px] py-1" style={{ color: 'var(--assistant-text-faint)' }}>{w}</div>
        ))}
        {monthGrid(month).map((ymd, i) => {
          if (!ymd) return <div key={`blank-${i}`} />;
          const isEdge = ymd === lo || ymd === hi;
          const inside = !!lo && !!hi && ymd > lo && ymd < hi;
          const disabled = !!min && ymd < min;
          return (
            <button
              key={ymd}
              type="button"
              disabled={disabled}
              onClick={() => onPick(ymd)}
              onDoubleClick={onDoublePick ? () => onDoublePick(ymd) : undefined}
              onMouseEnter={() => onHover?.(ymd)}
              className="h-8 text-[13px] rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: isEdge ? 'var(--assistant-accent)' : inside ? 'var(--assistant-accent-bg)' : undefined,
                color: isEdge ? 'var(--assistant-contrast-text, #fff)' : 'var(--assistant-text)',
                fontWeight: isEdge || ymd === today ? 700 : 400,
                outline: ymd === today && !isEdge ? '1px solid var(--assistant-border-soft)' : undefined,
              }}
              aria-pressed={isEdge || inside}
              aria-label={ymd}
            >
              {Number(ymd.slice(8))}
            </button>
          );
        })}
      </div>
    </>
  );
}
