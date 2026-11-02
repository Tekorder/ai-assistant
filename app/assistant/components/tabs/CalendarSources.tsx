'use client';

// The calendar's Habits and Reminders sources (Tasks stay in Calendar.tsx):
// what each shows in a day cell, and the source toggle itself.

import React, { useEffect, useMemo, useState } from 'react';
import { formatTime12, parseYMD, type Habit } from '@/lib/datacenter';
import { useHabits } from '../../_hook/useHabits';
import { useReminderItems } from '../../_hook/useReminderItems';
import { type DayStatus, type HabitLogIndex, dayStatus, habitsDueOn, indexHabitLogs } from '../../_utils/habitSchedule';
import { habitColorStyle } from '../../_utils/habitColors';
import { type DayReminder, remindersOn } from '../../_utils/reminderSchedule';
import { TaskFlagIcon } from '../TaskFlag';
import { HabitModal } from '../habits/HabitModal';

export type CalendarSource = 'tasks' | 'habits' | 'reminders';
const SOURCE_KEY = 'youtask_calendar_source';

/** The calendar's source, remembered on this device. */
export function useCalendarSource(): [CalendarSource, (s: CalendarSource) => void] {
  const [source, setSource] = useState<CalendarSource>('tasks');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SOURCE_KEY);
      if (saved === 'habits' || saved === 'reminders') setSource(saved);
    } catch {}
  }, []);
  const set = (s: CalendarSource) => {
    setSource(s);
    try { localStorage.setItem(SOURCE_KEY, s); } catch {}
  };
  return [source, set];
}

/** Tasks | Habits | Reminders — same look as the calendar's "Due date / Created" switch. */
export function SourceToggle({ value, onChange }: { value: CalendarSource; onChange: (s: CalendarSource) => void }) {
  return (
    <div role="radiogroup" aria-label="Show on the calendar" className="flex items-center rounded-xl p-0.5"
      style={{ background: 'var(--assistant-control-bg)' }}>
      {([['tasks', 'Tasks'], ['habits', 'Habits'], ['reminders', 'Reminders']] as const).map(([v, label]) => {
        const on = value === v;
        return (
          <button key={v} type="button" role="radio" aria-checked={on} onClick={() => onChange(v)}
            className="rounded-[10px] px-2.5 py-1 text-[12px] transition-colors"
            style={on
              ? { background: 'var(--assistant-contrast-bg)', color: 'var(--assistant-contrast-text)', fontWeight: 600 }
              : { color: 'var(--assistant-text-soft)' }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ===================== Habits ===================== */

export type HabitDayItem = { habit: Habit; status: DayStatus };

/** Each day's due habits with how they went, for the days on screen. */
export function useHabitCalendar(days: (string | null)[], today: string): Record<string, HabitDayItem[]> {
  const { habits, logs } = useHabits();
  const index: HabitLogIndex = useMemo(() => indexHabitLogs(logs), [logs]);
  return useMemo(() => {
    const out: Record<string, HabitDayItem[]> = {};
    for (const ymd of days) {
      if (!ymd) continue;
      const items = habitsDueOn(habits, ymd).map(habit => ({ habit, status: dayStatus(habit, index, ymd, today) }));
      if (items.length) out[ymd] = items;
    }
    return out;
  }, [days, habits, index, today]);
}

const STATUS_WORD: Record<DayStatus, string> = {
  done: 'done', partial: 'partly done', missed: 'missed', pending: 'to do', skipped: 'skipped', off: 'not due', future: 'planned',
};

/** A day's habits as little emoji dots in their colors, and a done/due bar. */
export function HabitDayPills({ items, max = 8 }: { items: HabitDayItem[]; max?: number }) {
  if (!items.length) return null;
  const judged = items.filter(i => i.status !== 'off' && i.status !== 'skipped' && i.status !== 'future');
  const done = judged.filter(i => i.status === 'done').length;
  const future = judged.length === 0;
  return (
    <div className="mt-1 space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {items.slice(0, max).map(({ habit, status }) => {
          const c = habitColorStyle(habit.color);
          const style: React.CSSProperties =
            status === 'done' ? { background: 'var(--habit-color)' }
            : status === 'partial' ? { background: 'var(--habit-tint-strong)' }
            : status === 'missed' ? { background: 'var(--habit-tint)', boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--assistant-danger-text) 60%, transparent)', opacity: 0.75 }
            : status === 'pending' ? { background: 'var(--habit-tint)', boxShadow: 'inset 0 0 0 1.5px var(--habit-color)' }
            : { background: 'var(--habit-tint)', opacity: 0.55 };
          return (
            <span key={habit.id} className={`${c.className} flex h-6 w-6 items-center justify-center rounded-full text-[12px]`}
              style={{ ...c.style, ...style }} data-tip={`${habit.text} · ${STATUS_WORD[status]}`}>
              {habit.emoji || '✅'}
            </span>
          );
        })}
        {items.length > max ? (
          <span className="flex h-6 items-center text-[10px]" style={{ color: 'var(--assistant-text-faint)' }}>+{items.length - max}</span>
        ) : null}
      </div>
      {!future ? (
        <div className="flex items-center gap-1.5" data-tip={`${done} of ${judged.length} done`}>
          <div className="h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: 'var(--assistant-control-bg)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(done / judged.length) * 100}%`, background: done === judged.length ? 'var(--assistant-success-text)' : 'var(--assistant-contrast-bg)' }} />
          </div>
          <span className="text-[10px] tabular-nums" style={{ color: 'var(--assistant-text-faint)' }}>
            {done === judged.length ? '✓' : `${done}/${judged.length}`}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/* ===================== Reminders ===================== */

/** Each day's reminders (standalone + habit) for the days on screen. */
export function useReminderCalendar(days: (string | null)[]): Record<string, DayReminder[]> {
  const reminders = useReminderItems();
  const { habits } = useHabits();
  return useMemo(() => {
    const out: Record<string, DayReminder[]> = {};
    for (const ymd of days) {
      if (!ymd) continue;
      const list = remindersOn(ymd, reminders, habits);
      if (list.length) out[ymd] = list;
    }
    return out;
  }, [days, reminders, habits]);
}

function ReminderLine({ r, past, large }: { r: DayReminder; past: boolean; large?: boolean }) {
  const c = r.kind === 'habit' ? habitColorStyle(r.color) : null;
  const icon = r.emoji ? <span aria-hidden="true">{r.emoji}</span>
    : r.flag ? <TaskFlagIcon color={r.flag} className="h-3 w-3 shrink-0" />
    : <span aria-hidden="true">🔔</span>;
  return (
    // In a day cell the time sits above the title, so narrow cells don't split words
    <div className={`${c?.className ?? ''} flex min-w-0 rounded-md px-1.5 ${large ? 'items-center gap-1.5 py-2 text-[14px]' : 'flex-col gap-0 py-[3px] text-[10px] md:text-[11px]'}`}
      style={{
        ...(c?.style ?? {}),
        background: r.kind === 'habit' ? 'var(--habit-tint)' : 'color-mix(in srgb, var(--assistant-text) 6%, transparent)',
        opacity: past || r.dismissed ? 0.6 : 1,
        textDecoration: r.dismissed ? 'line-through' : undefined,
      }}
      data-tip={`${formatTime12(r.time)} · ${r.title}${r.message ? ` — ${r.message}` : ''}`}>
      <span className="flex shrink-0 items-center gap-1">
        <span className="font-semibold tabular-nums" style={{ color: 'var(--assistant-text-muted)' }}>{r.time}</span>
        {icon}
      </span>
      <span className="min-w-0 break-words font-medium leading-tight" style={{ color: 'var(--assistant-text-soft)' }}>{r.title}</span>
    </div>
  );
}

/** A day's reminders, time first; the rest folded into "+N more". */
export function ReminderDayPills({ items, past, max = 3 }: { items: DayReminder[]; past: boolean; max?: number }) {
  if (!items.length) return null;
  return (
    <div className="mt-1 flex flex-col gap-[3px]">
      {items.slice(0, max).map(r => <ReminderLine key={r.key} r={r} past={past} />)}
      {items.length > max ? (
        <div className="pl-1 text-[10px]" style={{ color: 'var(--assistant-text-faint)' }}>+{items.length - max} more</div>
      ) : null}
    </div>
  );
}

/** Every reminder on one day (opened from the calendar). */
export function ReminderDayDialog({ ymd, items, today, onClose }: { ymd: string; items: DayReminder[]; today: string; onClose: () => void }) {
  const title = ymd === today ? 'Today' : parseYMD(ymd).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <HabitModal title={title} onClose={onClose} width="max-w-sm">
      {items.length ? (
        <div className="space-y-1.5">
          {items.map(r => <ReminderLine key={r.key} r={r} past={ymd < today} large />)}
          <p className="pt-2 text-center text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>
            Edit reminders in the Reminders tab, habit reminders in the habit.
          </p>
        </div>
      ) : (
        <p className="py-10 text-center text-[14px]" style={{ color: 'var(--assistant-text-faint)' }}>No reminders this day.</p>
      )}
    </HabitModal>
  );
}
