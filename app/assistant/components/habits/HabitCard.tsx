'use client';

import React, { useRef, useState } from 'react';
import { type Habit, type HabitCheckInMethod } from '@/lib/datacenter';
import { habitColorStyle } from '@/app/assistant/_utils/habitColors';
import { type DayStatus, formatProgress } from '@/app/assistant/_utils/habitSchedule';
import { formatStreak, type Streaks } from '@/app/assistant/_utils/habitStats';

/** Share of the card's width a swipe must travel to check in. */
const SWIPE_COMMIT = 0.42;

export type HabitCardData = {
  habit: Habit;
  status: DayStatus;
  /** Logged over the goal period vs the goal */
  total: number;
  /** 0–1 toward the goal */
  ratio: number;
  /** Done for the day it's shown on */
  checkedIn: boolean;
  streaks: Streaks;
};

/**
 * One habit for one day, tinted in its color with its progress filling the card.
 *   tap mode   — tapping the card checks in; "›" opens it
 *   swipe mode — swiping right checks in; tapping opens it
 * The round button on the right always checks in (keyboard / screen readers too).
 */
export function HabitCard({ data, method, compact, onAction, onOpen }: {
  data: HabitCardData;
  method: HabitCheckInMethod;
  compact?: boolean;
  onAction: () => void;
  onOpen: () => void;
}) {
  const { habit, status, total, ratio, checkedIn, streaks } = data;
  const color = habitColorStyle(habit.color);
  const quit = habit.kind === 'quit';
  const swipe = useSwipe(method === 'swipe', onAction);
  const skipped = status === 'skipped';

  const sub = [
    quit
      ? `${formatProgress(total, habit.goalValue, habit.goalUnit)}${status === 'missed' ? ' · over the limit' : ''}`
      : formatProgress(total, habit.goalValue, habit.goalUnit),
    habit.goalPeriod !== 'day' ? `this ${habit.goalPeriod}` : '',
    skipped ? 'Skipped' : '',
  ].filter(Boolean).join(' · ');

  const actionLabel = quit ? `Log one more for ${habit.text}`
    : checkedIn ? `Undo ${habit.text}`
    : habit.barAction === 'add' ? `Add an amount to ${habit.text}` : `Check in ${habit.text}`;

  return (
    <div
      ref={swipe.ref}
      {...swipe.handlers}
      onClick={() => {
        if (swipe.justSwiped()) return;
        if (method === 'tap') onAction(); else onOpen();
      }}
      className={`${color.className} group relative flex cursor-pointer select-none items-center gap-3 overflow-hidden rounded-2xl ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}
      style={{ ...color.style, background: 'var(--habit-tint)', opacity: skipped ? 0.6 : 1, touchAction: 'pan-y' }}
      data-habit-id={habit.id}
    >
      {/* Progress toward the goal fills the card from the left */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-300"
        style={{ width: `${(quit ? 0 : ratio) * 100}%`, background: 'var(--habit-tint-strong)' }} />
      {swipe.dx > 0 ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0"
          style={{ width: swipe.dx, background: 'color-mix(in srgb, var(--habit-color) 45%, transparent)' }} />
      ) : null}

      <span className={`relative flex shrink-0 items-center justify-center rounded-xl ${compact ? 'h-8 w-8 text-[18px]' : 'h-11 w-11 text-[24px]'}`}
        style={{ background: 'color-mix(in srgb, var(--assistant-surface) 70%, transparent)' }} aria-hidden="true">
        {habit.emoji || '✅'}
      </span>

      <div className="relative min-w-0 flex-1">
        <div className={`break-words font-semibold ${compact ? 'text-[13px]' : 'text-[15px]'}`} style={{ color: 'var(--assistant-text)' }}>
          {habit.text}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
          <span className="rounded-md px-1.5 font-medium tabular-nums" style={{ color: 'var(--habit-ink)', background: 'color-mix(in srgb, var(--assistant-surface) 55%, transparent)' }}>
            {sub}
          </span>
          {streaks.current > 0 ? (
            <span style={{ color: 'var(--assistant-text-muted)' }} data-tip={`Best: ${formatStreak(streaks.best, streaks.unit)}`}>
              🔥 {formatStreak(streaks.current, streaks.unit)}
            </span>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={e => { e.stopPropagation(); onAction(); }}
        aria-label={actionLabel}
        aria-pressed={quit ? undefined : checkedIn}
        data-tip={quit ? 'Log one more' : checkedIn ? 'Undo' : habit.barAction === 'add' ? 'Add amount' : 'Check in'}
        className={`relative flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-90 ${compact ? 'h-8 w-8' : 'h-9 w-9'}`}
        style={checkedIn
          ? { background: 'var(--habit-color)', color: 'var(--habit-on)' }
          : { border: '2px solid var(--habit-color)', color: 'var(--habit-ink)' }}
      >
        {checkedIn ? <CheckIcon /> : quit || habit.barAction === 'add' ? <span className="text-[18px] leading-none">+</span> : null}
      </button>
      {method === 'tap' ? (
        <button type="button" onClick={e => { e.stopPropagation(); onOpen(); }} aria-label={`Open ${habit.text}`} data-tip="Open"
          className="relative -mr-1 flex h-8 w-5 shrink-0 items-center justify-center text-[18px]" style={{ color: 'var(--assistant-text-faint)' }}>
          ›
        </button>
      ) : null}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.2 8.4l3 3 6.6-7" />
    </svg>
  );
}

/** Horizontal drag to the right; a vertical move first lets the page scroll. */
function useSwipe(enabled: boolean, onCommit: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; id: number; active: boolean } | null>(null);
  const swipedAt = useRef(0);
  const [dx, setDx] = useState(0);

  const end = (commit: boolean) => {
    const width = ref.current?.clientWidth ?? 1;
    if (start.current?.active) {
      swipedAt.current = Date.now();
      if (commit && dx > width * SWIPE_COMMIT) onCommit();
    }
    start.current = null;
    setDx(0);
  };

  const handlers = enabled ? {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, active: false };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      const mx = e.clientX - s.x;
      const my = e.clientY - s.y;
      if (!s.active) {
        if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { start.current = null; return; }   // scrolling
        if (mx < 10) return;
        s.active = true;
        ref.current?.setPointerCapture(e.pointerId);
      }
      setDx(Math.max(0, Math.min(mx, ref.current?.clientWidth ?? mx)));
    },
    onPointerUp: () => end(true),
    onPointerCancel: () => end(false),
  } : {};

  // A swipe ends with a click on the card — swallow it
  const justSwiped = () => Date.now() - swipedAt.current < 300;
  return { ref, handlers, dx, justSwiped };
}
