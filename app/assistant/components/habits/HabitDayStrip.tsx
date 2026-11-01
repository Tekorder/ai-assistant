'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { addDaysYMD, parseYMD, type Habit } from '@/lib/datacenter';
import { type HabitLogIndex, dayCompletion, eachDay } from '@/app/assistant/_utils/habitSchedule';
import { ProgressRing } from '../dashboard/ProgressRing';

const DAYS_BACK = 30;
const LETTERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * The last month up to today; each day's ring fills with the share of its due
 * habits done. Picking a past day lets you check in for it.
 */
export function HabitDayStrip({ habits, index, today, selected, onSelect }: {
  habits: Habit[];
  index: HabitLogIndex;
  today: string;
  selected: string;
  onSelect: (ymd: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const days = useMemo(() => eachDay(addDaysYMD(today, -DAYS_BACK), today).map(ymd => {
    const { done, due } = dayCompletion(habits, index, ymd, today);
    return { ymd, done, due };
  }), [habits, index, today]);

  // Start scrolled to today
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [today]);

  return (
    // inline-size containment: a month of days scrolls instead of widening the panel
    <div ref={scrollRef} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" style={{ contain: 'inline-size' }} role="listbox" aria-label="Day">
      {days.map(d => {
        const isSel = d.ymd === selected;
        const date = parseYMD(d.ymd);
        const label = d.due ? `${d.done} of ${d.due} done` : 'Nothing due';
        return (
          <button
            key={d.ymd}
            type="button"
            role="option"
            aria-selected={isSel}
            onClick={() => onSelect(d.ymd)}
            data-tip={`${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${label}`}
            className="flex w-11 shrink-0 flex-col items-center gap-1 rounded-xl py-1.5 transition-colors"
            style={isSel ? { background: 'var(--assistant-control-bg)', boxShadow: 'inset 0 0 0 1px var(--assistant-border-soft)' } : undefined}
          >
            <span className="text-[11px] font-medium" style={{ color: isSel || d.ymd === today ? 'var(--assistant-text)' : 'var(--assistant-text-faint)' }}>
              {LETTERS[date.getDay()]}
            </span>
            <ProgressRing value={d.due ? d.done / d.due : 0} size={34} stroke={3} color="var(--assistant-contrast-bg)">
              <span className="text-[12px] font-semibold tabular-nums" style={{ color: d.ymd === today ? 'var(--assistant-text)' : 'var(--assistant-text-soft)' }}>
                {date.getDate()}
              </span>
            </ProgressRing>
          </button>
        );
      })}
    </div>
  );
}
