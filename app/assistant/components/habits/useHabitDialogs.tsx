'use client';

import React, { useCallback, useState } from 'react';
import { type Habit } from '@/lib/datacenter';
import { type HabitLogIndex } from '@/app/assistant/_utils/habitSchedule';
import { checkInHabit } from '@/app/assistant/_utils/habitActions';
import { HabitEditor } from './HabitEditor';
import { NewHabitDialog } from './NewHabitDialog';
import { ValueEntryDialog } from './ValueEntryDialog';
import { MemoDialog } from './MemoDialog';

type Dialog =
  | { kind: 'new'; ideas: boolean }
  | { kind: 'edit'; habit: Habit; isNew: boolean }
  | { kind: 'amount'; habit: Habit; ymd: string }
  | { kind: 'memo'; habit: Habit; ymd: string };

/**
 * The habit flows any habits view needs — new (templates / ideas / custom),
 * edit, log an amount, memo after check-in. Render `dialogs` once; call the rest.
 */
export function useHabitDialogs(habits: Habit[], index: HabitLogIndex) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = useCallback(() => setDialog(null), []);

  /** The card's main action on `ymd`: an amount prompt, or a check-in (then the memo prompt). */
  const act = useCallback((habit: Habit, ymd: string) => {
    if (habit.kind === 'build' && habit.barAction === 'add') {
      setDialog({ kind: 'amount', habit, ymd });
      return;
    }
    const done = checkInHabit(habit, index, ymd);
    if (done && habit.memoOnComplete) setDialog({ kind: 'memo', habit, ymd });
  }, [index]);

  const startNew = useCallback((ideas = false) => setDialog({ kind: 'new', ideas }), []);
  const edit = useCallback((habit: Habit) => setDialog({ kind: 'edit', habit, isNew: false }), []);

  const groups = [...new Set(habits.map(h => h.group).filter((g): g is string => Boolean(g)))].sort();

  let dialogs: React.ReactNode = null;
  if (dialog?.kind === 'new') {
    dialogs = (
      <NewHabitDialog
        existing={habits}
        startWithIdeas={dialog.ideas}
        onPick={habit => setDialog({ kind: 'edit', habit, isNew: true })}
        onClose={close}
      />
    );
  } else if (dialog?.kind === 'edit') {
    dialogs = <HabitEditor habit={dialog.habit} isNew={dialog.isNew} groups={groups} onClose={close} />;
  } else if (dialog?.kind === 'amount') {
    const { habit, ymd } = dialog;
    dialogs = (
      <ValueEntryDialog
        habit={habit}
        index={index}
        ymd={ymd}
        onClose={close}
        onLogged={reached => { if (reached && habit.memoOnComplete) setDialog({ kind: 'memo', habit, ymd }); }}
      />
    );
  } else if (dialog?.kind === 'memo') {
    dialogs = <MemoDialog habit={dialog.habit} index={index} ymd={dialog.ymd} onClose={close} />;
  }

  return { act, startNew, edit, dialogs };
}
