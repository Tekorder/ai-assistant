'use client';

import React, { useMemo } from 'react';
import { repeatDaysLabel, type Habit } from '@/lib/datacenter';
import { useHabits } from '../../_hook/useHabits';
import { useTodayReminders, type TodayReminder } from '../../_hook/useTodayReminders';
import { habitColorStyle } from '../../_utils/habitColors';
import { indexHabitLogs, isDueOn } from '../../_utils/habitSchedule';
import { isCheckedIn } from '../../_utils/habitActions';
import { useHabitDialogs } from './useHabitDialogs';

/** When a habit reminds: its task days, or every day. */
function scheduleLabel(h: Habit): string {
  return h.goalPeriod === 'day' && h.taskDays.length ? repeatDaysLabel(h.taskDays) : 'Every day';
}

/**
 * The Reminders tab's "Habit reminders": every habit with reminders on, its times
 * and how each one stands today. Reminders are set in the habit itself, so a
 * row opens the habit's editor.
 */
export function HabitRemindersSection({ columns = false }: { columns?: boolean }) {
  const { habits, logs } = useHabits();
  const index = useMemo(() => indexHabitLogs(logs), [logs]);
  const { items, today, dismiss } = useTodayReminders();
  const { act, edit, dialogs } = useHabitDialogs(habits, index);

  const byKey = useMemo(() => new Map(items.map(r => [r.key, r])), [items]);
  const withReminders = useMemo(() => habits
    .filter(h => !h.archived && h.remindersOn && h.reminderTimes.length && !(h.endDate && h.endDate < today))
    .sort((a, b) => [...a.reminderTimes].sort()[0].localeCompare([...b.reminderTimes].sort()[0])), [habits, today]);

  if (!habits.some(h => !h.archived)) return null;

  return (
    <section className="mt-6 pt-4" style={{ borderTop: '1px solid var(--assistant-border-soft)' }} aria-label="Habit reminders">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-[13px] font-semibold" style={{ color: 'var(--assistant-text-muted)' }}>Habit reminders</h3>
        {withReminders.length ? (
          <span className="text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>{withReminders.length}</span>
        ) : null}
      </div>

      {withReminders.length === 0 ? (
        <p className="text-[13px]" style={{ color: 'var(--assistant-text-faint)' }}>
          None yet. Turn on Reminders in a habit&apos;s settings and they&apos;ll show up here.
        </p>
      ) : (
        <div className={columns ? 'grid grid-cols-1 gap-x-8 gap-y-1 lg:grid-cols-2' : 'space-y-1'}>
          {withReminders.map(h => {
            const todays = [...h.reminderTimes].sort().map(time => ({ time, item: byKey.get(`h:${h.id}@${time}`) }));
            const due = todays.map(t => t.item).filter((r): r is TodayReminder => r?.state === 'due');
            const canCheckIn = h.kind === 'build' && isDueOn(h, today) && !isCheckedIn(h, index, today);
            const color = habitColorStyle(h.color);
            return (
              <div key={h.id} className={`${color.className} group flex items-start gap-2.5 rounded-lg px-1.5 py-1.5`} style={color.style}>
                <button type="button" onClick={() => edit(h)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[16px]"
                  style={{ background: 'var(--habit-tint)' }}
                  aria-label={`Edit ${h.text}`} data-tip="Edit habit & reminders">
                  {h.emoji ?? '•'}
                </button>

                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => edit(h)} className="block max-w-full text-left">
                    <span className="break-words text-[14px] font-medium" style={{ color: 'var(--assistant-text-soft)' }}>{h.text}</span>
                  </button>
                  <div className="text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>
                    {h.reminderMessage ? <span className="break-words">{h.reminderMessage} · </span> : null}
                    {scheduleLabel(h)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {todays.map(({ time, item }) => <TimeChip key={time} time={time} item={item} />)}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {canCheckIn ? (
                    <button type="button" onClick={() => act(h, today)}
                      className="rounded-full px-2.5 py-1 text-[12px] font-semibold"
                      style={{ background: 'var(--habit-color)', color: 'var(--habit-on)' }}
                      data-tip="Check the habit in for today">
                      Done
                    </button>
                  ) : null}
                  {due.length ? (
                    <button type="button" onClick={() => dismiss(due)}
                      className="rounded-md px-2 py-1 text-[12px]"
                      style={{ background: 'var(--assistant-control-bg)', color: 'var(--assistant-text-muted)' }}
                      aria-label={`Dismiss ${h.text}`} data-tip="Dismiss for today">
                      Dismiss
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {dialogs}
    </section>
  );
}

/** A reminder time, marked with how it stands today (no mark: not one of the habit's days). */
function TimeChip({ time, item }: { time: string; item?: TodayReminder }) {
  const state = item?.state;
  const style: React.CSSProperties =
    state === 'due' ? { background: 'color-mix(in srgb, var(--assistant-danger-text) 14%, transparent)', color: 'var(--assistant-danger-text)', fontWeight: 600 }
    : state === 'done' ? { background: 'var(--habit-tint)', color: 'var(--assistant-text-faint)' }
    : state === 'upcoming' ? { background: 'var(--habit-tint)', color: 'var(--habit-ink)' }
    : { background: 'var(--assistant-control-bg)', color: 'var(--assistant-text-faint)' };
  const tip = state === 'due' ? 'Due' : state === 'done' ? 'Done for today' : state === 'upcoming' ? 'Later today' : 'Not today';
  return (
    <span className="rounded-full px-2 py-px text-[11px] tabular-nums" style={style} data-tip={tip}>
      {state === 'done' ? '✓ ' : ''}{time}{state === 'due' ? ' · Due' : ''}
    </span>
  );
}
