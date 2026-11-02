'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { deleteHabitsLS, type Habit } from '@/lib/datacenter';
import { useToday } from '@/app/assistant/_hook/useHabits';
import { type HabitLogIndex } from '@/app/assistant/_utils/habitSchedule';
import { checkInHabit } from '@/app/assistant/_utils/habitActions';
import classes from '@/app/assistant/_theme/themes.module.css';
import { HabitDetail, type HabitDetailActions } from './HabitDetail';
import { HabitEditor } from './HabitEditor';
import { HabitManager } from './HabitManager';
import { HabitModal } from './HabitModal';
import { NewHabitDialog } from './NewHabitDialog';
import { ValueEntryDialog } from './ValueEntryDialog';
import { MemoDialog } from './MemoDialog';

type Dialog =
  | { kind: 'new'; ideas: boolean }
  | { kind: 'edit'; habit: Habit; isNew: boolean }
  | { kind: 'amount'; habit: Habit; ymd: string }
  | { kind: 'memo'; habit: Habit; ymd: string }
  | { kind: 'delete'; habit: Habit };

/**
 * The habit flows any habits view needs — new (templates / ideas / custom), the
 * habit's detail page, edit, log an amount, memo after check-in, delete. Render
 * `dialogs` once; call the rest. Dialogs open on top of the detail page.
 */
export function useHabitDialogs(habits: Habit[], index: HabitLogIndex) {
  const today = useToday();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [detail, setDetail] = useState<{ id: string; ymd: string } | null>(null);
  const [managing, setManaging] = useState(false);
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
  /** Opens the habit's page, its progress ring on `ymd` (default today). */
  const open = useCallback((habit: Habit, ymd?: string) => setDetail({ id: habit.id, ymd: ymd ?? today }), [today]);

  const manage = useCallback(() => setManaging(true), []);

  const groups = useMemo(() => [...new Set(habits.map(h => h.group).filter((g): g is string => Boolean(g)))].sort(), [habits]);

  const detailActions: HabitDetailActions = {
    onAct: act,
    onAmount: (habit, ymd) => setDialog({ kind: 'amount', habit, ymd }),
    onMemo: (habit, ymd) => setDialog({ kind: 'memo', habit, ymd }),
    onEdit: edit,
    onDelete: habit => setDialog({ kind: 'delete', habit }),
  };
  // Always the live habit, so an edit shows right away
  const detailHabit = detail ? habits.find(h => h.id === detail.id) : undefined;

  let top: React.ReactNode = null;
  if (dialog?.kind === 'new') {
    top = (
      <NewHabitDialog
        existing={habits}
        startWithIdeas={dialog.ideas}
        onPick={habit => setDialog({ kind: 'edit', habit, isNew: true })}
        onClose={close}
      />
    );
  } else if (dialog?.kind === 'edit') {
    top = <HabitEditor habit={dialog.habit} isNew={dialog.isNew} groups={groups} onClose={close} />;
  } else if (dialog?.kind === 'amount') {
    const { habit, ymd } = dialog;
    top = (
      <ValueEntryDialog
        habit={habit}
        index={index}
        ymd={ymd}
        onClose={close}
        onLogged={reached => { if (reached && habit.memoOnComplete) setDialog({ kind: 'memo', habit, ymd }); }}
      />
    );
  } else if (dialog?.kind === 'memo') {
    top = <MemoDialog habit={dialog.habit} index={index} ymd={dialog.ymd} onClose={close} />;
  } else if (dialog?.kind === 'delete') {
    const { habit } = dialog;
    top = (
      <DeleteHabitDialog
        habit={habit}
        onCancel={close}
        onDelete={() => { deleteHabitsLS([habit.id]); setDialog(null); setDetail(null); }}
      />
    );
  }

  // Bottom → top: manager, a habit's page, then any dialog
  const dialogs = (
    <>
      {managing ? (
        <HabitManager
          habits={habits}
          onClose={() => setManaging(false)}
          onOpen={h => open(h)}
          onEdit={edit}
          onDelete={habit => setDialog({ kind: 'delete', habit })}
        />
      ) : null}
      {detailHabit && detail ? (
        <HabitDetail
          key={detailHabit.id}
          habit={detailHabit}
          index={index}
          today={today}
          initialDay={detail.ymd}
          onClose={() => setDetail(null)}
          actions={detailActions}
        />
      ) : null}
      {top}
    </>
  );

  return { act, startNew, edit, open, manage, dialogs };
}

function DeleteHabitDialog({ habit, onCancel, onDelete }: { habit: Habit; onCancel: () => void; onDelete: () => void }) {
  return (
    <HabitModal
      title="Delete habit?"
      onClose={onCancel}
      width="max-w-sm"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={`rounded-md px-3 py-2 text-[13px] ${classes.modalSecondaryButton}`}>Cancel</button>
          <button type="button" onClick={onDelete} className={`rounded-md px-3 py-2 text-[13px] font-semibold ${classes.panelBtnDanger}`}>Delete</button>
        </div>
      }
    >
      <p className="text-[14px]" style={{ color: 'var(--assistant-text-soft)' }}>
        <strong style={{ color: 'var(--assistant-text)' }}>{habit.emoji ? `${habit.emoji} ` : ''}{habit.text}</strong> and its whole
        history — check-ins, streaks and memos — will be deleted. To keep the history, archive it instead.
      </p>
    </HabitModal>
  );
}
