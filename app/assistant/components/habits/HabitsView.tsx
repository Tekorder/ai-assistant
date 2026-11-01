'use client';

import React, { useMemo, useState } from 'react';
import { parseYMD } from '@/lib/datacenter';
import { useHabits, useToday } from '@/app/assistant/_hook/useHabits';
import { habitsDueOn, indexHabitLogs } from '@/app/assistant/_utils/habitSchedule';
import classes from '@/app/assistant/_theme/themes.module.css';
import { HabitDayStrip } from './HabitDayStrip';
import { HabitList } from './HabitList';
import { useHabitDialogs } from './useHabitDialogs';

const ALL = '__all__';

/** The Habits tab: day strip, group filter and the day's habits as cards. */
export default function HabitsView() {
  const { habits, logs, checkInMethod } = useHabits();
  const today = useToday();
  const [picked, setPicked] = useState<string | null>(null);
  const [group, setGroup] = useState(ALL);
  const ymd = picked && picked <= today ? picked : today;

  const index = useMemo(() => indexHabitLogs(logs), [logs]);
  const active = useMemo(() => habits.filter(h => !h.archived), [habits]);
  const groups = useMemo(() => [...new Set(active.map(h => h.group).filter((g): g is string => Boolean(g)))].sort(), [active]);
  const shownGroup = group !== ALL && groups.includes(group) ? group : ALL;
  const inGroup = useMemo(() => (shownGroup === ALL ? active : active.filter(h => h.group === shownGroup)), [active, shownGroup]);
  const due = useMemo(() => habitsDueOn(inGroup, ymd), [inGroup, ymd]);

  const { act, startNew, open, dialogs } = useHabitDialogs(habits, index);

  const isToday = ymd === today;
  const dayLabel = isToday ? 'Today' : parseYMD(ymd).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col" style={{ contain: 'inline-size' }}>
      <div className="shrink-0 space-y-3 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="truncate text-[20px] font-semibold" style={{ color: 'var(--assistant-text)' }}>{dayLabel}</h2>
            {!isToday ? (
              <button type="button" onClick={() => setPicked(null)} className="shrink-0 text-[13px] underline"
                style={{ color: 'var(--assistant-text-muted)' }}>
                Back to today
              </button>
            ) : null}
          </div>
          <button type="button" onClick={() => startNew()}
            className="shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--assistant-contrast-bg)', color: 'var(--assistant-contrast-text)' }}>
            + New habit
          </button>
        </div>

        {active.length > 0 ? <HabitDayStrip habits={inGroup} index={index} today={today} selected={ymd} onSelect={setPicked} /> : null}

        {groups.length > 0 ? (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Group">
            {[ALL, ...groups].map(g => (
              <button key={g} type="button" role="radio" aria-checked={g === shownGroup} onClick={() => setGroup(g)}
                className={`rounded-full px-3 py-1 text-[13px] ${g === shownGroup ? classes.quickFilterActive : classes.quickFilterInactive}`}>
                {g === ALL ? 'All' : g}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {active.length === 0 ? (
          <EmptyState onNew={() => startNew()} onIdeas={() => startNew(true)} />
        ) : due.length === 0 ? (
          <p className="py-16 text-center text-[14px]" style={{ color: 'var(--assistant-text-faint)' }}>
            Nothing due {isToday ? 'today' : 'on this day'}{shownGroup !== ALL ? ` in ${shownGroup}` : ''}.
          </p>
        ) : (
          <HabitList
            habits={due}
            index={index}
            ymd={ymd}
            today={today}
            method={checkInMethod}
            columns
            onAction={h => act(h, ymd)}
            onOpen={h => open(h, ymd)}
          />
        )}
      </div>
      {dialogs}
    </div>
  );
}

function EmptyState({ onNew, onIdeas }: { onNew: () => void; onIdeas: () => void }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-16 text-center">
      <span className="text-[44px]" aria-hidden="true">🌱</span>
      <h3 className="text-[17px] font-semibold" style={{ color: 'var(--assistant-text)' }}>Start a habit</h3>
      <p className="text-[14px]" style={{ color: 'var(--assistant-text-muted)' }}>
        Pick one from the templates, or let a goal pack set up a few for you.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={onNew} className="rounded-full px-4 py-2 text-[13px] font-semibold"
          style={{ background: 'var(--assistant-contrast-bg)', color: 'var(--assistant-contrast-text)' }}>
          + New habit
        </button>
        <button type="button" onClick={onIdeas} className={`rounded-full px-4 py-2 text-[13px] font-medium ${classes.modalSecondaryButton}`}>
          💡 Habit ideas
        </button>
      </div>
    </div>
  );
}
