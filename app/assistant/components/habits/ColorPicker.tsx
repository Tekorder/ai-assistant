'use client';

import React, { useState } from 'react';
import { HABIT_PALETTES, getHabitColor, habitColorStyle } from '@/app/assistant/_utils/habitColors';
import { Segmented } from '../dashboard/DashboardPieces';
import { HabitModal } from './HabitModal';

const THEME = 'theme';

/** Palette tabs + swatches. "Theme" (no key) follows the app theme's own color. */
export function ColorPicker({ value, onPick, onClose }: {
  value?: string;
  onPick: (key: string | undefined) => void;
  onClose: () => void;
}) {
  const current = getHabitColor(value);
  const [palette, setPalette] = useState(
    HABIT_PALETTES.find(p => p.colors.some(c => c.key === current?.key))?.key ?? HABIT_PALETTES[0].key,
  );
  const shown = HABIT_PALETTES.find(p => p.key === palette) ?? HABIT_PALETTES[0];

  const pick = (key: string | undefined) => { onPick(key); onClose(); };

  return (
    <HabitModal title="Color" onClose={onClose} width="max-w-sm">
      <div className="mb-4 flex justify-center">
        <Segmented
          ariaLabel="Palette"
          value={palette}
          options={HABIT_PALETTES.map(p => ({ value: p.key, label: p.label }))}
          onChange={setPalette}
        />
      </div>
      <div className="grid grid-cols-6 gap-3 px-1" role="radiogroup" aria-label={`${shown.label} colors`}>
        {shown.colors.map(c => (
          <Swatch key={c.key} colorKey={c.key} label={c.label} selected={c.key === current?.key} onPick={() => pick(c.key)} />
        ))}
      </div>
      <button
        type="button"
        onClick={() => pick(undefined)}
        className="mt-4 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px]"
        style={{ background: 'var(--assistant-control-bg)', color: 'var(--assistant-text-soft)' }}
        aria-pressed={!current}
      >
        <Swatch colorKey={THEME} label="Theme color" selected={!current} onPick={() => pick(undefined)} asSpan />
        <span>
          <span className="font-medium" style={{ color: 'var(--assistant-text)' }}>Theme color</span>
          <span className="block text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>Follows the app theme you pick</span>
        </span>
      </button>
    </HabitModal>
  );
}

function Swatch({ colorKey, label, selected, onPick, asSpan }: {
  colorKey: string;
  label: string;
  selected: boolean;
  onPick: () => void;
  asSpan?: boolean;
}) {
  const { className, style } = habitColorStyle(colorKey === THEME ? undefined : colorKey);
  const dot = (
    <span
      className={`${className} block h-9 w-9 rounded-full transition-transform hover:scale-110`}
      style={{
        ...style,
        background: 'var(--habit-color)',
        boxShadow: selected ? '0 0 0 2px var(--assistant-panel-bg), 0 0 0 4px var(--habit-color)' : undefined,
      }}
    />
  );
  if (asSpan) return dot;
  return (
    <button type="button" role="radio" aria-checked={selected} aria-label={label} data-tip={label} onClick={onPick}
      className="flex items-center justify-center">
      {dot}
    </button>
  );
}
