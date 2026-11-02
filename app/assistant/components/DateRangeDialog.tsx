'use client';
import React, { useState } from 'react';
import classes from '@/app/assistant/_theme/themes.module.css';
import { CalendarMonth } from './CalendarMonth';
import {
  addDaysYMD,
  getRangeLabel,
  monthEndYMD,
  monthStartYMD,
  todayYMD,
  type DateRange,
} from '@/lib/datacenter';

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

          <CalendarMonth month={month} onMonthChange={setMonth} lo={lo} hi={hi} onPick={pick} onHover={setHover} />
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
