'use client';

import React, { useEffect, useRef, useState } from 'react';
import { formatPill, upsertHabitLS, type Habit } from '@/lib/datacenter';
import { habitColorStyle } from '@/app/assistant/_utils/habitColors';
import { type HabitLogIndex, dayStatus, formatAmount, goalSentence, progressOn, valueOn } from '@/app/assistant/_utils/habitSchedule';
import { addHabitAmount, clearHabitDay, isCheckedIn, isSkipped, setHabitSkipped } from '@/app/assistant/_utils/habitActions';
import classes from '@/app/assistant/_theme/themes.module.css';
import { Card } from '../dashboard/DashboardPieces';
import { ProgressRing } from '../dashboard/ProgressRing';
import { MonthStatusCalendar, YearHeatmap } from './HabitCalendars';
import { HabitDetailStats } from './HabitDetailStats';
import { HabitIconButton, HabitModal } from './HabitModal';

/** What one − / + press changes, by unit. */
const STEP: Record<string, number> = { min: 5, h: 0.5, ml: 250, L: 0.25, steps: 500, pages: 5, kcal: 50 };
const stepFor = (habit: Habit) => STEP[habit.goalUnit] ?? 1;
const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export type HabitDetailActions = {
  /** Main check-in action on a day (may open the amount / memo dialogs) */
  onAct: (habit: Habit, ymd: string) => void;
  onAmount: (habit: Habit, ymd: string) => void;
  onMemo: (habit: Habit, ymd: string) => void;
  onEdit: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
};

/**
 * One habit: today's (or a picked day's) progress up top with quick logging, then
 * its month, year, numbers, memos and charts. Picking a day in the calendar moves
 * the progress ring to that day.
 */
export function HabitDetail({ habit, index, today, initialDay, onClose, actions }: {
  habit: Habit;
  index: HabitLogIndex;
  today: string;
  initialDay: string;
  onClose: () => void;
  actions: HabitDetailActions;
}) {
  const [day, setDay] = useState(initialDay);
  const [month, setMonth] = useState(initialDay);
  const [year, setYear] = useState(Number(initialDay.slice(0, 4)));
  const color = habitColorStyle(habit.color);

  return (
    <HabitModal
      title={<span>{habit.emoji ? `${habit.emoji} ` : ''}{habit.text}</span>}
      ariaLabel={habit.text}
      onClose={onClose}
      width="max-w-2xl"
      right={<DetailMenu habit={habit} actions={actions} onClose={onClose} />}
      className={color.className}
      style={{
        ...color.style,
        background: 'linear-gradient(color-mix(in srgb, var(--habit-color) 9%, transparent), transparent 320px), var(--assistant-overlay-panel-bg, var(--assistant-panel-bg))',
      }}
    >
      <div className="space-y-3">
        {habit.archived ? (
          <p className="rounded-lg px-3 py-2 text-center text-[13px]" style={{ background: 'var(--assistant-control-bg)', color: 'var(--assistant-text-muted)' }}>
            Archived — it&apos;s hidden from Today. Restore it from the ⋯ menu.
          </p>
        ) : null}
        <DayHero habit={habit} index={index} day={day} today={today} onToday={() => setDay(today)} actions={actions} />
        <Card title="Calendar">
          <MonthStatusCalendar habit={habit} index={index} month={month} onMonth={setMonth} today={today} selected={day} onSelect={setDay} />
        </Card>
        <Card title="Year">
          <YearHeatmap habit={habit} index={index} year={year} onYear={setYear} today={today} />
        </Card>
        <HabitDetailStats habit={habit} index={index} today={today} month={month} />
      </div>
    </HabitModal>
  );
}

function DayHero({ habit, index, day, today, onToday, actions }: {
  habit: Habit;
  index: HabitLogIndex;
  day: string;
  today: string;
  onToday: () => void;
  actions: HabitDetailActions;
}) {
  const p = progressOn(habit, index, day);
  const quit = habit.kind === 'quit';
  const status = dayStatus(habit, index, day, today);
  const checked = isCheckedIn(habit, index, day);
  const skipped = isSkipped(index, habit, day);
  const dayValue = valueOn(index, habit.id, day);
  const step = stepFor(habit);
  const amount = (v: number) => formatAmount(Math.round(v * 100) / 100, habit.goalUnit);
  const num = (v: number) => numFmt.format(Math.round(v * 100) / 100);
  const ringValue = quit ? (habit.goalValue > 0 ? Math.min(1, p.total / habit.goalValue) : p.total > 0 ? 1 : 0) : p.ratio;

  return (
    <section className="flex flex-col items-center gap-3 pt-1">
      <div className="text-[13px]" style={{ color: 'var(--assistant-text-muted)' }}>
        {day === today ? 'Today' : formatPill(day)}
        {habit.goalPeriod !== 'day' ? ` · this ${habit.goalPeriod}` : ''}
        {day !== today ? <> · <button type="button" onClick={onToday} className="underline">back to today</button></> : null}
      </div>
      <div className="flex items-center gap-4">
        <RoundButton label={`Remove ${amount(step)}`} disabled={dayValue <= 0} onClick={() => addHabitAmount(habit, index, day, -step)}>−</RoundButton>
        <ProgressRing value={ringValue} size={176} stroke={12}
          color={quit && !p.met ? 'var(--assistant-danger-text)' : 'var(--habit-color)'}
          ariaLabel={`${amount(p.total)} ${quit ? 'of at most' : 'of'} ${amount(p.goal)}`}>
          <span className="text-[30px] leading-none" aria-hidden="true">{habit.emoji || '✅'}</span>
          <span className="mt-1 text-[30px] font-bold tabular-nums leading-tight" style={{ color: 'var(--assistant-text)' }}>{num(p.total)}</span>
          <span className="text-[12px]" style={{ color: 'var(--assistant-text-muted)' }}>
            {quit ? 'at most' : 'of'} {amount(p.goal)}
          </span>
        </ProgressRing>
        <RoundButton label={`Add ${amount(step)}`} onClick={() => addHabitAmount(habit, index, day, step)}>+</RoundButton>
      </div>
      <p className="text-[12px] font-medium" style={{ color: 'var(--habit-ink)' }}>{goalSentence(habit)}</p>

      <div className="flex items-center gap-3">
        <RoundButton small label="Clear this day" disabled={dayValue <= 0 && !skipped} onClick={() => clearHabitDay(habit, day)}>↺</RoundButton>
        {quit ? (
          <PillButton onClick={() => addHabitAmount(habit, index, day, 1)}>+1 slip</PillButton>
        ) : (
          <PillButton onClick={() => actions.onAmount(habit, day)}>Add amount</PillButton>
        )}
        {!quit ? (
          <RoundButton small label={checked ? 'Done' : 'Mark done'} active={checked} onClick={() => actions.onAct({ ...habit, barAction: 'done' }, day)}>✓</RoundButton>
        ) : null}
      </div>
      <div className="flex gap-4 text-[12px]" style={{ color: 'var(--assistant-text-muted)' }}>
        <button type="button" className="underline" onClick={() => setHabitSkipped(habit, day, !skipped)}
          disabled={status === 'future'}>
          {skipped ? 'Unskip this day' : 'Skip this day'}
        </button>
        <button type="button" className="underline" onClick={() => actions.onMemo(habit, day)}>Memo</button>
      </div>
    </section>
  );
}

function RoundButton({ label, onClick, disabled, active, small, children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} data-tip={label}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold transition-transform active:scale-90 disabled:opacity-35 ${small ? 'h-10 w-10 text-[16px]' : 'h-12 w-12 text-[22px]'}`}
      style={active
        ? { background: 'var(--habit-color)', color: 'var(--habit-on)' }
        : { background: 'var(--habit-tint-strong)', color: 'var(--assistant-text)' }}>
      {children}
    </button>
  );
}

function PillButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="rounded-full px-6 py-2.5 text-[14px] font-semibold transition-opacity hover:opacity-90"
      style={{ background: 'var(--habit-color)', color: 'var(--habit-on)' }}>
      {children}
    </button>
  );
}

/** ⋯ menu: Edit · Archive / Restore · Delete. */
function DetailMenu({ habit, actions, onClose }: { habit: Habit; actions: HabitDetailActions; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  const item = (label: string, run: () => void, danger = false) => (
    <button type="button" role="menuitem" onClick={() => { setOpen(false); run(); }}
      className={`yt-menu-item text-[14px] ${danger ? 'is-danger' : ''}`}>
      {label}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <HabitIconButton label="More" onClick={() => setOpen(o => !o)}>⋯</HabitIconButton>
      {open ? (
        <div role="menu" className={`absolute right-0 top-11 z-10 w-40 overflow-hidden rounded-xl py-1 shadow-xl ${classes.quickModal}`}>
          {item('Edit', () => actions.onEdit(habit))}
          {habit.archived
            ? item('Restore', () => upsertHabitLS({ ...habit, archived: false }))
            : item('Archive', () => { upsertHabitLS({ ...habit, archived: true }); onClose(); })}
          {item('Delete', () => actions.onDelete(habit), true)}
        </div>
      ) : null}
    </div>
  );
}
