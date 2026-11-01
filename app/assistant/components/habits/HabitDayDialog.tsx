'use client';

import React, { useMemo } from 'react';
import { parseYMD } from '@/lib/datacenter';
import { useHabits, useToday } from '@/app/assistant/_hook/useHabits';
import { dayCompletion, habitsDueOn, indexHabitLogs } from '@/app/assistant/_utils/habitSchedule';
import { ProgressRing } from '../dashboard/ProgressRing';
import { HabitList } from './HabitList';
import { HabitModal } from './HabitModal';
import { useHabitDialogs } from './useHabitDialogs';

/** One day's habits (from the calendar): the same cards as Today, checked in for that day. */
export function HabitDayDialog({ ymd, onClose }: { ymd: string; onClose: () => void }) {
  const { habits, logs, checkInMethod } = useHabits();
  const today = useToday();
  const index = useMemo(() => indexHabitLogs(logs), [logs]);
  const due = useMemo(() => habitsDueOn(habits, ymd), [habits, ymd]);
  const { done, due: dueCount } = dayCompletion(habits, index, ymd, today);
  const { act, open, dialogs } = useHabitDialogs(habits, index);
  const future = ymd > today;

  const title = ymd === today ? 'Today'
    : parseYMD(ymd).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <>
      <HabitModal title={title} onClose={onClose} width="max-w-md">
        {due.length === 0 ? (
          <p className="py-10 text-center text-[14px]" style={{ color: 'var(--assistant-text-faint)' }}>No habits due this day.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 px-1">
              <ProgressRing value={dueCount ? done / dueCount : 0} size={44} stroke={4} color="var(--assistant-contrast-bg)">
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--assistant-text)' }}>
                  {dueCount ? Math.round((done / dueCount) * 100) : 0}%
                </span>
              </ProgressRing>
              <span className="text-[13px]" style={{ color: 'var(--assistant-text-muted)' }}>
                {future ? `${due.length} habit${due.length === 1 ? '' : 's'} planned — check-ins open on the day`
                  : `${done} of ${dueCount} done`}
              </span>
            </div>
            {/* Future days are read-only: nothing to check in yet */}
            <div style={future ? { pointerEvents: 'none', opacity: 0.6 } : undefined} aria-disabled={future || undefined}>
              <HabitList habits={due} index={index} ymd={ymd} today={today} method={checkInMethod} compact
                onAction={h => act(h, ymd)} onOpen={h => open(h, ymd)} />
            </div>
          </div>
        )}
      </HabitModal>
      {dialogs}
    </>
  );
}
