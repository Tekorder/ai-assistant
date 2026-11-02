'use client';

import React, { useState } from 'react';
import { makeHabit, readHabitsLS, writeHabitsLS, type Habit } from '@/lib/datacenter';
import { HABIT_IDEAS, habitFromTemplate, type HabitIdea } from '@/app/assistant/_constants/habitTemplates';
import { habitColorStyle } from '@/app/assistant/_utils/habitColors';
import { goalSentence } from '@/app/assistant/_utils/habitSchedule';
import { TaskCheckmark } from '../TaskCheckmark';
import { HabitIconButton, HabitModal, HabitPrimaryButton } from './HabitModal';

/** Goal packs: pick one, untick what you don't want, add the rest in one go. */
export function HabitIdeas({ existing, onBack, onDone }: {
  existing: Habit[];
  onBack: () => void;
  /** After adding a pack (closes the whole New habit flow) */
  onDone: () => void;
}) {
  const [idea, setIdea] = useState<HabitIdea | null>(null);
  const back = <HabitIconButton label="Back" onClick={idea ? () => setIdea(null) : onBack}>‹</HabitIconButton>;

  if (idea) return <IdeaPack idea={idea} existing={existing} left={back} onClose={onDone} />;

  return (
    <HabitModal title="Habit ideas" onClose={onDone} left={back}>
      <div className="grid grid-cols-2 gap-2.5">
        {HABIT_IDEAS.map(i => {
          const color = habitColorStyle(i.color);
          return (
            <button
              key={i.key}
              type="button"
              onClick={() => setIdea(i)}
              className={`${color.className} flex flex-col items-center gap-1.5 rounded-xl px-3 py-4 text-center transition-transform hover:-translate-y-0.5`}
              style={{ ...color.style, background: 'var(--assistant-surface)', border: '1px solid var(--assistant-border-soft)' }}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl text-[20px]" style={{ background: 'var(--habit-tint-strong)' }} aria-hidden="true">
                {i.emoji}
              </span>
              <span className="text-[14px] font-semibold" style={{ color: 'var(--assistant-text)' }}>{i.title}</span>
              <span className="text-[12px] leading-snug" style={{ color: 'var(--assistant-text-faint)' }}>{i.subtitle}</span>
            </button>
          );
        })}
      </div>
    </HabitModal>
  );
}

function IdeaPack({ idea, existing, left, onClose }: { idea: HabitIdea; existing: Habit[]; left: React.ReactNode; onClose: () => void }) {
  const used = new Set(existing.filter(h => !h.archived).map(h => h.templateKey));
  // Habits you already track start unticked
  const [picked, setPicked] = useState<Set<string>>(() => new Set(idea.templates.filter(t => !used.has(t.key)).map(t => t.key)));
  const toggle = (key: string) => setPicked(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const addAll = () => {
    const payload = readHabitsLS();
    const added = idea.templates.filter(t => picked.has(t.key)).map(t => makeHabit({ ...habitFromTemplate(t), group: idea.title }));
    writeHabitsLS({ ...payload, habits: [...payload.habits, ...added] });
    onClose();
  };

  const color = habitColorStyle(idea.color);
  return (
    <HabitModal
      title={`${idea.emoji} ${idea.title}`}
      onClose={onClose}
      left={left}
      className={color.className}
      style={color.style}
      footer={<HabitPrimaryButton onClick={addAll} disabled={picked.size === 0}>
        {picked.size === 0 ? 'Pick at least one' : `Add ${picked.size} habit${picked.size === 1 ? '' : 's'}`}
      </HabitPrimaryButton>}
    >
      <p className="mb-3 text-center text-[13px]" style={{ color: 'var(--assistant-text-muted)' }}>
        {idea.subtitle}. They&apos;re added to a &ldquo;{idea.title}&rdquo; group — tweak any of them later.
      </p>
      <ul className="space-y-2">
        {idea.templates.map(t => {
          const c = habitColorStyle(t.color);
          const on = picked.has(t.key);
          return (
            <li key={t.key}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(t.key)}
                className={`${c.className} flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-opacity`}
                style={{ ...c.style, background: 'var(--habit-tint)', opacity: on ? 1 : 0.6 }}
              >
                <span className="text-[22px]" aria-hidden="true">{t.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold" style={{ color: 'var(--assistant-text)' }}>{t.name}</span>
                  <span className="block text-[12px]" style={{ color: 'var(--habit-ink)' }}>
                    {goalSentence(habitFromTemplate(t))}{used.has(t.key) ? ' · already added' : ''}
                  </span>
                </span>
                <TaskCheckmark checked={on} />
              </button>
            </li>
          );
        })}
      </ul>
    </HabitModal>
  );
}
