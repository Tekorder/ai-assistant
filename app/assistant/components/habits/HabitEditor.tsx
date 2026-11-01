'use client';

import React, { useState } from 'react';
import { upsertHabitLS, type Habit } from '@/lib/datacenter';
import { getHabitColor, habitColorStyle } from '@/app/assistant/_utils/habitColors';
import classes from '@/app/assistant/_theme/themes.module.css';
import { ColorPicker } from './ColorPicker';
import { EmojiPicker } from './EmojiPicker';
import { ALL_DAYS, BehaviorSection, GoalSection, ReminderSection, TermSection, TimeRangeSection } from './HabitEditorSections';
import { HabitModal, HabitPrimaryButton, HabitRow, HabitSection } from './HabitModal';

/**
 * Create or edit a habit. The whole dialog takes the habit's color as you pick it.
 * `isNew` only changes the wording; saving upserts either way.
 */
export function HabitEditor({ habit, isNew, groups, onClose, onSaved }: {
  habit: Habit;
  isNew: boolean;
  /** Existing group names, offered as suggestions */
  groups: string[];
  onClose: () => void;
  onSaved?: (habit: Habit) => void;
}) {
  const [draft, setDraft] = useState<Habit>(habit);
  const [days, setDays] = useState<number[]>(habit.taskDays.length ? habit.taskDays : ALL_DAYS);
  const [picker, setPicker] = useState<'color' | 'emoji' | null>(null);
  const patch = (p: Partial<Habit>) => setDraft(d => ({ ...d, ...p }));

  const name = draft.text.trim();
  const goalOk = Number.isFinite(draft.goalValue) && (draft.kind === 'quit' || draft.goalValue > 0);
  const daysOk = draft.goalPeriod !== 'day' || days.length > 0;
  const termOk = !draft.endDate || draft.endDate >= draft.startDate;
  const problem = !name ? 'Give the habit a name'
    : !goalOk ? (draft.kind === 'quit' ? 'Enter how many times at most' : 'Enter a goal above 0')
    : !daysOk ? 'Pick at least one day'
    : !termOk ? 'The end date is before the start'
    : null;

  const save = () => {
    if (problem) return;
    const saved: Habit = {
      ...draft,
      text: name,
      description: draft.description?.trim() || undefined,
      group: draft.group?.trim() || undefined,
      goalUnit: draft.goalUnit.trim() || 'times',
      reminderMessage: draft.reminderMessage?.trim() || undefined,
      taskDays: days.length === 7 ? [] : [...days].sort((a, b) => a - b),
      remindersOn: draft.remindersOn && draft.reminderTimes.length > 0,
    };
    upsertHabitLS(saved);
    onSaved?.(saved);
    onClose();
  };

  const color = habitColorStyle(draft.color);

  return (
    <>
      <HabitModal
        title={<span>{draft.emoji ? `${draft.emoji} ` : ''}{name || (isNew ? 'New habit' : 'Edit habit')}</span>}
        ariaLabel={isNew ? 'New habit' : 'Edit habit'}
        onClose={onClose}
        className={color.className}
        // A faint wash of the habit's color over the theme's dialog background (which may be a gradient)
        style={{
          ...color.style,
          background: 'linear-gradient(color-mix(in srgb, var(--habit-color) 8%, transparent), color-mix(in srgb, var(--habit-color) 8%, transparent)), var(--assistant-overlay-panel-bg, var(--assistant-panel-bg))',
        }}
        footer={
          <div className="flex flex-col items-center gap-1.5">
            {problem ? <span className="text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>{problem}</span> : null}
            <div className="w-full max-w-[260px]">
              <HabitPrimaryButton onClick={save} disabled={Boolean(problem)}>{isNew ? 'Add habit' : 'Save'}</HabitPrimaryButton>
            </div>
          </div>
        }
      >
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); save(); }}>
          <HabitSection>
            <div className="flex items-center gap-3 py-1">
              <button
                type="button"
                onClick={() => setPicker('emoji')}
                aria-label="Choose icon"
                data-tip="Choose icon"
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-[28px]"
                style={{ background: 'var(--habit-tint)', border: '1.5px dashed var(--habit-color)' }}
              >
                {draft.emoji || '＋'}
              </button>
              <div className="min-w-0 flex-1">
                <input
                  autoFocus={isNew && !habit.text}
                  value={draft.text}
                  onChange={e => patch({ text: e.target.value })}
                  placeholder="Habit name"
                  aria-label="Habit name"
                  maxLength={120}
                  className="w-full bg-transparent pb-1 text-[16px] font-semibold outline-none"
                  style={{ color: 'var(--assistant-text)', borderBottom: '1px solid var(--assistant-border-soft)' }}
                />
                <input
                  value={draft.description ?? ''}
                  onChange={e => patch({ description: e.target.value })}
                  placeholder="Description (optional)"
                  aria-label="Description"
                  className="mt-1.5 w-full bg-transparent text-[13px] outline-none"
                  style={{ color: 'var(--assistant-text-soft)' }}
                />
              </div>
            </div>
            <HabitRow label="Color">
              <button type="button" onClick={() => setPicker('color')} className="flex items-center gap-2 text-[13px]"
                style={{ color: 'var(--assistant-text-muted)' }}>
                {getHabitColor(draft.color)?.label ?? 'Theme'}
                <span className="h-6 w-12 rounded-full" style={{ background: 'var(--habit-color)' }} />
                <span aria-hidden="true">›</span>
              </button>
            </HabitRow>
            <HabitRow label="Group">
              <input
                list="habit-groups"
                value={draft.group ?? ''}
                onChange={e => patch({ group: e.target.value })}
                placeholder="Optional"
                aria-label="Group"
                className={`w-36 rounded-lg px-2.5 py-1.5 text-right text-[14px] ${classes.panelInput}`}
              />
              <datalist id="habit-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
            </HabitRow>
          </HabitSection>

          <GoalSection draft={draft} patch={patch} days={days} setDays={setDays} />
          <TimeRangeSection draft={draft} patch={patch} />
          <ReminderSection draft={draft} patch={patch} />
          <BehaviorSection draft={draft} patch={patch} />
          <TermSection draft={draft} patch={patch} />
          {/* Enter in a field saves */}
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>
      </HabitModal>

      {picker === 'color' ? <ColorPicker value={draft.color} onPick={c => patch({ color: c })} onClose={() => setPicker(null)} /> : null}
      {picker === 'emoji' ? <EmojiPicker value={draft.emoji} onPick={emoji => patch({ emoji })} onClose={() => setPicker(null)} /> : null}
    </>
  );
}
