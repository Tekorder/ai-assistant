'use client';

import React, { useState } from 'react';
import { formatPill, type Habit } from '@/lib/datacenter';
import { habitColorStyle } from '@/app/assistant/_utils/habitColors';
import { logOn, type HabitLogIndex } from '@/app/assistant/_utils/habitSchedule';
import { setHabitMemo } from '@/app/assistant/_utils/habitActions';
import classes from '@/app/assistant/_theme/themes.module.css';
import { HabitModal, HabitPrimaryButton } from './HabitModal';

/** A note on one day of a habit — shown after check-in when the habit asks for it. */
export function MemoDialog({ habit, index, ymd, onClose }: {
  habit: Habit;
  index: HabitLogIndex;
  ymd: string;
  onClose: () => void;
}) {
  const [memo, setMemo] = useState(logOn(index, habit.id, ymd)?.memo ?? '');
  const save = () => { setHabitMemo(habit, ymd, memo); onClose(); };
  const color = habitColorStyle(habit.color);

  return (
    <HabitModal
      title={`${habit.emoji ?? ''} ${habit.text}`.trim()}
      onClose={onClose}
      width="max-w-sm"
      className={color.className}
      style={color.style}
      footer={<HabitPrimaryButton onClick={save}>Save memo</HabitPrimaryButton>}
    >
      <p className="mb-2 text-center text-[13px]" style={{ color: 'var(--assistant-text-muted)' }}>
        How did it go? · {formatPill(ymd)}
      </p>
      <textarea
        autoFocus
        value={memo}
        onChange={e => setMemo(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); }}
        rows={4}
        maxLength={4000}
        placeholder="Write a quick note…"
        aria-label="Memo"
        className={`w-full resize-none rounded-lg px-3 py-2 text-[14px] ${classes.panelInput}`}
      />
    </HabitModal>
  );
}
