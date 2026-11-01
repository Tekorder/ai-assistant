'use client';

import React, { useState } from 'react';
import { makeHabit, type Habit } from '@/lib/datacenter';
import { HABIT_CATEGORIES, habitFromTemplate, type HabitTemplate } from '@/app/assistant/_constants/habitTemplates';
import { habitColorStyle } from '@/app/assistant/_utils/habitColors';
import { goalSentence } from '@/app/assistant/_utils/habitSchedule';
import classes from '@/app/assistant/_theme/themes.module.css';
import { HabitIconButton, HabitModal } from './HabitModal';
import { HabitIdeas } from './HabitIdeas';

/**
 * Pick a template by category (its "+" opens the editor prefilled), start from
 * scratch with "Custom habit", or open the 💡 Habit Ideas packs.
 */
export function NewHabitDialog({ existing, startWithIdeas = false, onPick, onClose }: {
  /** Current habits — templates already in use get a ✓ */
  existing: Habit[];
  /** Open straight on the Habit ideas packs */
  startWithIdeas?: boolean;
  /** Hands the new (unsaved) habit to the editor */
  onPick: (habit: Habit) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState(HABIT_CATEGORIES[0].key);
  const [ideasOpen, setIdeasOpen] = useState(startWithIdeas);
  const shown = HABIT_CATEGORIES.find(c => c.key === category) ?? HABIT_CATEGORIES[0];
  const used = new Set(existing.filter(h => !h.archived).map(h => h.templateKey).filter(Boolean));

  if (ideasOpen) return <HabitIdeas existing={existing} onBack={() => setIdeasOpen(false)} onDone={onClose} />;

  return (
    <HabitModal
      title="New habit"
      onClose={onClose}
      right={<HabitIconButton label="Habit ideas" onClick={() => setIdeasOpen(true)}>💡</HabitIconButton>}
      footer={
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => onPick(makeHabit())}
            className="rounded-full px-6 py-2.5 text-[14px] font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--assistant-contrast-bg)', color: 'var(--assistant-contrast-text)' }}
          >
            Custom habit
          </button>
        </div>
      }
    >
      <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Categories">
        {HABIT_CATEGORIES.map(c => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={c.key === category}
            onClick={() => setCategory(c.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] ${c.key === category ? classes.quickFilterActive : classes.quickFilterInactive}`}
          >
            <span aria-hidden="true">{c.emoji}</span> {c.label}
          </button>
        ))}
      </div>
      <ul className="space-y-2" role="tabpanel" aria-label={shown.label}>
        {shown.templates.map(t => (
          <TemplateRow key={t.key} template={t} added={used.has(t.key)} onPick={() => onPick(makeHabit(habitFromTemplate(t)))} />
        ))}
      </ul>
    </HabitModal>
  );
}

function TemplateRow({ template, added, onPick }: { template: HabitTemplate; added: boolean; onPick: () => void }) {
  const color = habitColorStyle(template.color);
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className={`${color.className} flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors`}
        style={{ ...color.style, background: 'var(--habit-tint)' }}
      >
        <span className="text-[22px]" aria-hidden="true">{template.emoji}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold" style={{ color: 'var(--assistant-text)' }}>{template.name}</span>
          <span className="block text-[12px]" style={{ color: 'var(--habit-ink)' }}>{goalSentence(habitFromTemplate(template))}</span>
        </span>
        {added ? <span className="text-[11px]" style={{ color: 'var(--assistant-text-faint)' }}>Added ✓</span> : null}
        <span className="flex h-7 w-7 items-center justify-center rounded-full text-[16px]"
          style={{ background: 'var(--habit-color)', color: 'var(--habit-on)' }} aria-hidden="true">
          +
        </span>
      </button>
    </li>
  );
}
