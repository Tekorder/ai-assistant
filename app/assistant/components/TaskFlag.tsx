'use client';

import React from 'react';
import { cycleTaskFlag, getTaskFlag, type TaskFlagColor } from '@/lib/datacenter';

// Flat pennants in the theme's status colors (blue → info, yellow → warning, red → danger)
const FLAG_META: Record<TaskFlagColor, { color: string; label: string }> = {
  blue:   { color: 'var(--assistant-info-text, #3b82f6)', label: 'Blue flag' },
  yellow: { color: 'var(--assistant-warning-text, #d97706)', label: 'Yellow flag' },
  red:    { color: 'var(--assistant-danger-text, #e11d48)', label: 'Red flag — urgent' },
};

export function TaskFlagIcon({
  color,
  className = 'h-4 w-4',
}: {
  color: TaskFlagColor;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: FLAG_META[color].color }}
    >
      <path d="M3.75 14.25V2" />
      <path d="M3.75 2.75h8.5l-2 3.25 2 3.25h-8.5" fill="currentColor" fillOpacity=".28" />
    </svg>
  );
}

type FlagSource = { flag?: TaskFlagColor; priority?: boolean };

export function TaskFlagButton({
  source,
  onChange,
  className = '',
}: {
  source: FlagSource;
  onChange: (next: TaskFlagColor | undefined) => void;
  className?: string;
}) {
  const flag = getTaskFlag(source);
  const [hovered, setHovered] = React.useState(false);
  const previewColor: TaskFlagColor = flag ?? 'blue';
  const visible = Boolean(flag) || hovered;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onChange(cycleTaskFlag(flag));
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-pressed={Boolean(flag)}
      aria-label={
        flag
          ? `${FLAG_META[flag].label} — click to change`
          : 'Add flag — click to set blue'
      }
      data-tip={
        flag
          ? `${FLAG_META[flag].label} — click to change`
          : 'Add flag'
      }
      className={[
        'relative z-10 shrink-0 h-4 w-4 flex items-center justify-center select-none pointer-events-auto transition-all duration-150',
        flag
          ? 'opacity-100'
          : visible
            ? 'opacity-40 hover:!opacity-80 hover:scale-110'
            : 'opacity-0 group-hover:opacity-40 hover:!opacity-80 hover:scale-110',
        className,
      ].join(' ')}
    >
      <TaskFlagIcon color={previewColor} />
    </button>
  );
}

export function TaskFlagBadge({
  source,
  inline = false,
  className = '',
}: {
  source: FlagSource;
  inline?: boolean;
  className?: string;
}) {
  const flag = getTaskFlag(source);
  if (!flag) return null;

  return (
    <span
      className={[
        inline
          ? 'mr-1 inline-flex align-[-1px] h-4 w-4 items-center justify-center'
          : 'shrink-0 h-4 w-4 flex items-center justify-center',
        className,
      ].join(' ')}
      data-tip={FLAG_META[flag].label}
      aria-label={FLAG_META[flag].label}
    >
      <TaskFlagIcon color={flag} />
    </span>
  );
}
