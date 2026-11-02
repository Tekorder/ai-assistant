'use client';

import React, { useState } from 'react';
import { type Habit } from '@/lib/datacenter';
import { habitColorStyle } from '@/app/assistant/_utils/habitColors';
import { formatAmount, formatProgress, periodTotal, valueOn, type HabitLogIndex } from '@/app/assistant/_utils/habitSchedule';
import { addHabitAmount, clearHabitDay } from '@/app/assistant/_utils/habitActions';
import classes from '@/app/assistant/_theme/themes.module.css';
import { HabitModal, HabitPrimaryButton } from './HabitModal';

/** Rounds to what a person would log (no 0.30000000000000004). */
const tidy = (n: number) => Math.round(n * 100) / 100;

/**
 * Log an amount for one day: type it (hours also as h + min) or tap a quick step.
 * The amount is added to what's already logged that day.
 */
export function ValueEntryDialog({ habit, index, ymd, onClose, onLogged }: {
  habit: Habit;
  index: HabitLogIndex;
  ymd: string;
  onClose: () => void;
  /** After logging; `reachedGoal` = this entry completed the goal */
  onLogged?: (reachedGoal: boolean) => void;
}) {
  const hours = habit.goalUnit === 'h';
  const [amount, setAmount] = useState('');
  const [h, setH] = useState('');
  const [m, setM] = useState('');
  const value = hours ? tidy((Number(h) || 0) + (Number(m) || 0) / 60) : Number(amount);
  const valid = Number.isFinite(value) && value > 0;

  const day = valueOn(index, habit.id, ymd);
  const total = periodTotal(habit, index, ymd);
  const goal = habit.goalValue;
  const steps = [...new Set([1, goal >= 8 ? tidy(goal / 4) : 0, goal >= 2 ? tidy(goal / 2) : 0].filter(n => n > 0))];

  const log = (n: number) => {
    addHabitAmount(habit, index, ymd, n);
    onLogged?.(habit.kind === 'build' && total < goal && total + n >= goal);
    onClose();
  };

  const color = habitColorStyle(habit.color);
  return (
    <HabitModal
      title={`${habit.emoji ?? ''} ${habit.text}`.trim()}
      onClose={onClose}
      width="max-w-xs"
      className={color.className}
      style={color.style}
      footer={<HabitPrimaryButton onClick={() => valid && log(value)} disabled={!valid}>Add</HabitPrimaryButton>}
    >
      <p className="mb-3 text-center text-[13px]" style={{ color: 'var(--assistant-text-muted)' }}>
        {formatProgress(total, goal, habit.goalUnit)} this {habit.goalPeriod}
        {habit.goalPeriod !== 'day' && day > 0 ? ` · ${formatAmount(day, habit.goalUnit)} on this day` : ''}
      </p>
      <form onSubmit={e => { e.preventDefault(); if (valid) log(value); }} className="flex items-center justify-center gap-2">
        {hours ? (
          <>
            <input autoFocus type="number" min={0} inputMode="numeric" value={h} onChange={e => setH(e.target.value)}
              aria-label="Hours" placeholder="0" className={`w-16 rounded-lg px-2 py-2 text-center text-[18px] ${classes.panelInput}`} />
            <span style={{ color: 'var(--assistant-text-muted)' }}>h</span>
            <input type="number" min={0} max={59} inputMode="numeric" value={m} onChange={e => setM(e.target.value)}
              aria-label="Minutes" placeholder="0" className={`w-16 rounded-lg px-2 py-2 text-center text-[18px] ${classes.panelInput}`} />
            <span style={{ color: 'var(--assistant-text-muted)' }}>min</span>
          </>
        ) : (
          <>
            <input autoFocus type="number" min={0} step="any" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
              aria-label="Amount" placeholder="0" className={`w-28 rounded-lg px-2 py-2 text-center text-[18px] ${classes.panelInput}`} />
            <span style={{ color: 'var(--assistant-text-muted)' }}>{habit.goalUnit}</span>
          </>
        )}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {steps.map(n => (
          <button key={n} type="button" onClick={() => log(n)}
            className="rounded-full px-3 py-1 text-[13px] font-medium" style={{ background: 'var(--habit-tint-strong)', color: 'var(--assistant-text)' }}>
            +{formatAmount(n, habit.goalUnit)}
          </button>
        ))}
        {habit.kind === 'build' && total < goal ? (
          <button type="button" onClick={() => log(tidy(goal - total))}
            className="rounded-full px-3 py-1 text-[13px] font-medium" style={{ background: 'var(--habit-color)', color: 'var(--habit-on)' }}>
            Complete
          </button>
        ) : null}
      </div>
      {day > 0 ? (
        <button type="button" onClick={() => { clearHabitDay(habit, ymd); onClose(); }}
          className="mx-auto mt-3 block text-[12px] underline" style={{ color: 'var(--assistant-text-faint)' }}>
          Clear this day ({formatAmount(day, habit.goalUnit)})
        </button>
      ) : null}
    </HabitModal>
  );
}
