'use client';

import React from 'react';
import Image from 'next/image';
import { cycleTaskFlag, getTaskFlag, type TaskFlagColor } from '@/lib/datacenter';

const FLAG_META: Record<TaskFlagColor, { src: string; label: string; glow: string }> = {
  blue: {
    src: '/flags/bflag.png',
    label: 'Blue flag',
    glow: 'drop-shadow(0 0 4px rgba(59,130,246,0.55)) drop-shadow(0 0 10px rgba(59,130,246,0.22))',
  },
  yellow: {
    src: '/flags/yflag.png',
    label: 'Yellow flag',
    glow: 'drop-shadow(0 0 4px rgba(234,179,8,0.55)) drop-shadow(0 0 10px rgba(250,204,21,0.2))',
  },
  red: {
    src: '/flags/rflag.png',
    label: 'Red flag — urgent',
    glow: 'drop-shadow(0 0 4px rgba(239,68,68,0.55)) drop-shadow(0 0 10px rgba(244,63,94,0.22))',
  },
};

export function TaskFlagIcon({
  color,
  className = 'h-4 w-4',
  glow = true,
}: {
  color: TaskFlagColor;
  className?: string;
  glow?: boolean;
}) {
  const meta = FLAG_META[color];
  return (
    <Image
      src={meta.src}
      alt=""
      aria-hidden
      width={16}
      height={16}
      draggable={false}
      className={[className, 'object-contain'].join(' ')}
      style={glow ? { filter: meta.glow } : undefined}
    />
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
      title={
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
      title={FLAG_META[flag].label}
      aria-label={FLAG_META[flag].label}
    >
      <TaskFlagIcon color={flag} />
    </span>
  );
}
