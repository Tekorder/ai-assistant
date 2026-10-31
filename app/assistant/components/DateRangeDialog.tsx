'use client';
import React, { useState } from 'react';
import classes from '@/app/assistant/_theme/themes.module.css';
import {
  addDaysYMD,
  getRangeLabel,
  monthEndYMD,
  monthStartYMD,
  todayYMD,
  type DateRange,
} from '@/lib/datacenter';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function shiftMonth(monthStart: string, delta: number): string {
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
 * "Ranges" filter popup: click the first day, then the last one (either order);
 * a third click starts over. Apply hands back an inclusive from/to.
 */
export function DateRangeDialog({
  initial,
  zIndex = 999,
  onCancel,
  onApply,
}: {
  initial?: DateRange;
  zIndex?: number;
  onCancel: () => void;
  onApply: (range: DateRange) => void;
}) {
  const [from, setFrom] = useState<string | null>(initial?.from ?? null);
  const [to, setTo] = useState<string | null>(initial?.to ?? null);
  const [hover, setHover] = useState<string | null>(null);
  const [month, setMonth] = useState(monthStartYMD(initial?.to ?? todayYMD()));
  const today = todayYMD();

  const pick = (ymd: string) => {
    if (!from || to) { setFrom(ymd); setTo(null); return; }
    if (ymd < from) { setTo(from); setFrom(ymd); } else setTo(ymd);
  };

  // While choosing the end, preview the span up to the hovered day
  const end = to ?? (from && hover ? hover : null);
  const lo = from && end ? (from < end ? from : end) : from;
  const hi = from && end ? (from < end ? end : from) : from;

  const preset = (r: DateRange) => { setFrom(r.from); setTo(r.to); setMonth(monthStartYMD(r.to)); };
  const presets: { label: string; range: DateRange }[] = [
    { label: 'Last 7 days', range: { from: addDaysYMD(today, -6), to: today } },
    { label: 'Last 30 days', range: { from: addDaysYMD(today, -29), to: today } },
    { label: 'Next 7 days', range: { from: today, to: addDaysYMD(today, 6) } },
    { label: 'This month', range: { from: monthStartYMD(today), to: monthEndYMD(today) } },
  ];

  const [y, m] = month.split('-').map(Number);
  const monthTitle = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const complete = from && to ? { from, to } : null;

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex }}>
      <button type="button" className={`absolute inset-0 ${classes.modalBackdrop}`} onClick={onCancel} aria-label="Close" />
      <div role="dialog" aria-label="Select a date range" className={`relative w-[92vw] max-w-sm ${classes.modalCard}`}>
        <div className={classes.modalHeader}>
          <div className={classes.modalTitle}>Select a date range</div>
          <div className="text-[12px] mt-1" style={{ color: 'var(--assistant-text-faint)' }}>
            {complete ? getRangeLabel(complete) : from ? 'Now pick the last day' : 'Pick the first day'}
          </div>
        </div>

        <div className="px-6 pt-4">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {presets.map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => preset(p.range)}
                className={`text-[12px] px-2.5 py-1 rounded-full ${classes.quickFilterInactive}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setMonth(mo => shiftMonth(mo, -1))} aria-label="Previous month"
              className={`grid place-items-center size-8 text-[22px] leading-none ${classes.quickNavArrow}`}>‹</button>
            <div className="text-[13px] font-semibold" style={{ color: 'var(--assistant-text)' }}>{monthTitle}</div>
            <button type="button" onClick={() => setMonth(mo => shiftMonth(mo, 1))} aria-label="Next month"
              className={`grid place-items-center size-8 text-[22px] leading-none ${classes.quickNavArrow}`}>›</button>
          </div>

          <div className="grid grid-cols-7 gap-y-1 text-center" onMouseLeave={() => setHover(null)}>
            {WEEKDAYS.map(w => (
              <div key={w} className="text-[11px] py-1" style={{ color: 'var(--assistant-text-faint)' }}>{w}</div>
            ))}
            {monthGrid(month).map((ymd, i) => {
              if (!ymd) return <div key={`blank-${i}`} />;
              const isEdge = ymd === lo || ymd === hi;
              const inside = !!lo && !!hi && ymd > lo && ymd < hi;
              return (
                <button
                  key={ymd}
                  type="button"
                  onClick={() => pick(ymd)}
                  onMouseEnter={() => setHover(ymd)}
                  className="h-8 text-[13px] rounded-md transition-colors"
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
        </div>

        <div className={`${classes.modalFooter} justify-end`}>
          <button type="button" onClick={onCancel} className={`text-[13px] px-3 py-2 rounded-md ${classes.quickModalSecondary}`}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!complete}
            onClick={() => { if (complete) onApply(complete); }}
            className={`text-[13px] font-semibold px-3 py-2 rounded-md disabled:opacity-40 ${classes.quickModalPrimary}`}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
