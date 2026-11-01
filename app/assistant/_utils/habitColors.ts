// Habit color palettes. A habit stores only a key ("coral"); how it renders comes
// from the .yt-habit rules in globals.css, which mix it with the active theme.

import type { CSSProperties } from 'react';

export type HabitColor = { key: string; label: string; hex: string };
export type HabitPalette = { key: string; label: string; colors: HabitColor[] };

const c = (key: string, label: string, hex: string): HabitColor => ({ key, label, hex });

export const HABIT_PALETTES: HabitPalette[] = [
  {
    key: 'vivid',
    label: 'Vivid',
    colors: [
      c('coral', 'Coral', '#F2545B'),
      c('tangerine', 'Tangerine', '#F7883A'),
      c('sunflower', 'Sunflower', '#EDB723'),
      c('lime', 'Lime', '#7CB82F'),
      c('mint', 'Mint', '#22B58A'),
      c('aqua', 'Aqua', '#17A9C1'),
      c('sky', 'Sky', '#3B8FE8'),
      c('indigo', 'Indigo', '#5B5FE0'),
      c('violet', 'Violet', '#8E5BE8'),
      c('grape', 'Grape', '#B44AD6'),
      c('pink', 'Pink', '#E8559C'),
      c('rose', 'Rose', '#D9416A'),
    ],
  },
  {
    key: 'muted',
    label: 'Muted',
    colors: [
      c('sage', 'Sage', '#8FA58F'),
      c('moss', 'Moss', '#77876A'),
      c('dust-blue', 'Dust blue', '#8299B0'),
      c('slate', 'Slate', '#66788E'),
      c('mauve', 'Mauve', '#A28AA2'),
      c('lilac', 'Lilac', '#AE9FC4'),
      c('clay', 'Clay', '#BF907F'),
      c('blush', 'Blush', '#CC9A9A'),
      c('sand', 'Sand', '#BFAB8A'),
      c('taupe', 'Taupe', '#A0907F'),
      c('stone', 'Stone', '#94948B'),
      c('fog', 'Fog', '#A6ACAA'),
    ],
  },
  {
    key: 'vintage',
    label: 'Vintage',
    colors: [
      c('brick', 'Brick', '#B0442F'),
      c('rust', 'Rust', '#C2653A'),
      c('ochre', 'Ochre', '#C9922B'),
      c('mustard', 'Mustard', '#B59A24'),
      c('olive', 'Olive', '#6B7A38'),
      c('forest', 'Forest', '#3E6A43'),
      c('teal', 'Teal', '#2C716B'),
      c('navy', 'Navy', '#34507A'),
      c('denim', 'Denim', '#55779E'),
      c('plum', 'Plum', '#7A4166'),
      c('cocoa', 'Cocoa', '#7A5236'),
      c('charcoal', 'Charcoal', '#4C4C47'),
    ],
  },
];

const BY_KEY = new Map(HABIT_PALETTES.flatMap(p => p.colors).map(col => [col.key, col]));

export function getHabitColor(key?: string): HabitColor | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

/** Relative luminance (WCAG) of a #rrggbb color. */
function luminance(hex: string): number {
  const ch = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
}

/** The color lifted toward white the way dark themes show it (82% color + 18% white). */
function liftedHex(hex: string): string {
  const out = [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.82 + 255 * 0.18));
  return `#${out.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Dark or light text, whichever contrasts more with `hex`. */
function onColor(hex: string): string {
  return luminance(hex) > 0.3 ? '#14161a' : '#ffffff';
}

/**
 * Props for an element that renders in a habit's color: add the `yt-habit` class
 * and these CSS variables, then use var(--habit-color) / --habit-tint / --habit-ink /
 * --habit-on inside. An unknown or missing key follows the theme's own color.
 */
export function habitColorStyle(key?: string): { className: string; style: CSSProperties } {
  const col = getHabitColor(key);
  if (!col) return { className: 'yt-habit', style: {} };
  return {
    className: 'yt-habit',
    style: {
      '--habit-base': col.hex,
      '--habit-on-light': onColor(col.hex),
      '--habit-on-dark': onColor(liftedHex(col.hex)),
    } as CSSProperties,
  };
}
