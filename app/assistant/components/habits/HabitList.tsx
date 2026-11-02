'use client';

import React, { useMemo } from 'react';
import { type Habit, type HabitCheckInMethod, type HabitTimeRange } from '@/lib/datacenter';
import { type HabitLogIndex, TIME_RANGES, dayStatus, progressOn } from '@/app/assistant/_utils/habitSchedule';
import { habitStreaks } from '@/app/assistant/_utils/habitStats';
import { isCheckedIn } from '@/app/assistant/_utils/habitActions';
import { HabitCard, type HabitCardData } from './HabitCard';

const SECTION_ORDER: HabitTimeRange[] = ['morning', 'afternoon', 'evening', 'anytime'];

export function habitCardData(habit: Habit, index: HabitLogIndex, ymd: string, today: string): HabitCardData {
  const p = progressOn(habit, index, ymd);
  return {
    habit,
    status: dayStatus(habit, index, ymd, today),
    total: p.total,
    ratio: p.ratio,
    checkedIn: isCheckedIn(habit, index, ymd),
    streaks: habitStreaks(habit, index, today),
  };
}

/**
 * The habits due on one day, grouped by time of day (headers only when more than
 * one part of the day is used). Done ones sink to the end of their group.
 */
export function HabitList({ habits, index, ymd, today, method, compact, columns, onAction, onOpen }: {
  /** Already filtered to the habits due that day */
  habits: Habit[];
  index: HabitLogIndex;
  ymd: string;
  today: string;
  method: HabitCheckInMethod;
  compact?: boolean;
  /** Two columns on wide screens (the main tab) */
  columns?: boolean;
  onAction: (habit: Habit) => void;
  onOpen: (habit: Habit) => void;
}) {
  const sections = useMemo(() => {
    const cards = habits.map(h => habitCardData(h, index, ymd, today));
    return SECTION_ORDER
      .map(range => ({
        range,
        label: TIME_RANGES.find(t => t.value === range)!.label,
        cards: cards.filter(c => c.habit.timeRange === range)
          .sort((a, b) => Number(a.checkedIn) - Number(b.checkedIn)),
      }))
      .filter(s => s.cards.length > 0);
  }, [habits, index, ymd, today]);

  return (
    <div className="space-y-4">
      {sections.map(s => (
        <section key={s.range} aria-label={s.label}>
          {sections.length > 1 ? (
            <h3 className="mb-1.5 px-1 text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--assistant-text-faint)' }}>
              {s.label}
            </h3>
          ) : null}
          <div className={columns ? 'grid grid-cols-1 gap-2 lg:grid-cols-2' : 'space-y-2'}>
            {s.cards.map(c => (
              <HabitCard
                key={c.habit.id}
                data={c}
                method={method}
                compact={compact}
                onAction={() => onAction(c.habit)}
                onOpen={() => onOpen(c.habit)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
