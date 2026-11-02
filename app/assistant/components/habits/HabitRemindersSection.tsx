'use client';

import React, { useMemo } from 'react';
import { formatTime12, repeatDaysLabel, upsertHabitLS, type Habit } from '@/lib/datacenter';
import { useHabits } from '../../_hook/useHabits';
import { useTodayReminders, type TodayReminder } from '../../_hook/useTodayReminders';
import { habitColorStyle } from '../../_utils/habitColors';
import { indexHabitLogs, isDueOn } from '../../_utils/habitSchedule';
import { isCheckedIn } from '../../_utils/habitActions';
import { useHabitDialogs } from './useHabitDialogs';
import { TaskFlagButton } from '../TaskFlag';
import { ReminderRow, ReminderIcon, ReminderTimeChip, ReminderDoneButton, ReminderDismissButton } from '../ReminderRow';

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
              <ReminderRow
                key={h.id}
                className={color.className}
                style={color.style}
                icon={<ReminderIcon onClick={() => edit(h)} label={`Edit ${h.text}`} tip="Edit habit & reminders">{h.emoji ?? '•'}</ReminderIcon>}
                title={
                  <button type="button" onClick={() => edit(h)} className="block max-w-full text-left">
                    <span className="break-words text-[14px] font-medium" style={{ color: 'var(--assistant-text-soft)' }}>{h.text}</span>
                  </button>
                }
                meta={<>{h.reminderMessage ? <span className="break-words">{h.reminderMessage} · </span> : null}{scheduleLabel(h)}</>}
                chips={todays.map(({ time, item }) => (
                  <ReminderTimeChip key={time} label={formatTime12(time)} state={item?.state ?? 'off'} />
                ))}
                actions={
                  <>
                    <TaskFlagButton source={h} onChange={flag => upsertHabitLS({ ...h, flag })} />
                    {canCheckIn ? <ReminderDoneButton onClick={() => act(h, today)} tip="Check the habit in for today" /> : null}
                    {due.length ? <ReminderDismissButton onClick={() => dismiss(due)} label={`Dismiss ${h.text}`} /> : null}
                  </>
                }
              />
            );
          })}
        </div>
      )}
      {dialogs}
    </section>
  );
}
