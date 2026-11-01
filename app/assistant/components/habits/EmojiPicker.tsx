'use client';

import React, { useState } from 'react';
import { HABIT_EMOJIS } from '@/app/assistant/_constants/habitTemplates';
import classes from '@/app/assistant/_theme/themes.module.css';
import { HabitModal } from './HabitModal';

/** A curated emoji grid, plus a box to paste or type any other. */
export function EmojiPicker({ value, onPick, onClose }: {
  value?: string;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState('');
  const pick = (e: string) => { onPick(e); onClose(); };
  // Keep just the first symbol someone types or pastes
  const first = (s: string) => [...new Intl.Segmenter().segment(s.trim())][0]?.segment ?? '';

  return (
    <HabitModal title="Icon" onClose={onClose} width="max-w-sm">
      <div className="grid grid-cols-8 gap-1" role="radiogroup" aria-label="Icons">
        {HABIT_EMOJIS.map(e => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={e === value}
            onClick={() => pick(e)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-[22px] transition-colors hover:bg-[var(--assistant-hover-bg)]"
            style={e === value ? { background: 'var(--assistant-control-bg)', boxShadow: 'inset 0 0 0 2px var(--habit-color, var(--assistant-accent))' } : undefined}
          >
            {e}
          </button>
        ))}
      </div>
      <form
        className="mt-4 flex items-center gap-2"
        onSubmit={e => { e.preventDefault(); const em = first(custom); if (em) pick(em); }}
      >
        <input
          value={custom}
          onChange={e => setCustom(e.target.value)}
          placeholder="Or type / paste any emoji"
          aria-label="Custom emoji"
          className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-[14px] ${classes.panelInput}`}
        />
        <button type="submit" disabled={!first(custom)}
          className={`rounded-lg px-3 py-2 text-[13px] font-medium disabled:opacity-40 ${classes.modalSecondaryButton}`}>
          Use
        </button>
      </form>
    </HabitModal>
  );
}
