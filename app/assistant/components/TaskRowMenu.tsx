'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isValidDateYYYYMMDD, formatPill, type TaskFlagColor } from '@/lib/datacenter';
import { TaskFlagIcon } from './TaskFlag';

const FLAG_CHOICES: TaskFlagColor[] = ['blue', 'yellow', 'red'];

/** The ⋮ menu of a Workspace task: created date on top, then the task actions. */
export function TaskRowMenu({
  x,
  y,
  createdAt,
  flag,
  hasNote,
  hasDueDate,
  onEdit,
  repeatLabel,
  onDueDate,
  onRepeat,
  onFlag,
  onNote,
  onReminder,
  onDelete,
  onClose,
}: {
  /** Anchor: the ⋮ button's right edge and bottom */
  x: number;
  y: number;
  createdAt?: string;
  flag?: TaskFlagColor;
  hasNote: boolean;
  hasDueDate: boolean;
  /** The task's repeat ("Every Monday"); empty when it doesn't repeat */
  repeatLabel?: string;
  /** Edit / note / reminder are left out of the menu when not given (e.g. in the dock panels) */
  onEdit?: () => void;
  onDueDate: () => void;
  onRepeat?: () => void;
  onFlag: (flag: TaskFlagColor | undefined) => void;
  onNote?: () => void;
  onReminder?: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Right edge on the button, clamped inside the viewport (opens upward near the bottom)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.min(x - rect.width, window.innerWidth - rect.width - 8);
    const top = y + rect.height > window.innerHeight - 8 ? y - rect.height - 28 : y;
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  const item = (label: string, action: () => void, danger = false) => (
    <button
      type="button"
      role="menuitem"
      className={['yt-menu-item', danger ? 'is-danger' : ''].join(' ')}
      onClick={() => { action(); onClose(); }}
    >
      {label}
    </button>
  );

  const created = isValidDateYYYYMMDD(createdAt)
    ? formatPill(createdAt)
    : null;
  const divider = <div className="my-1 h-px" style={{ background: 'var(--assistant-border-soft)' }} />;

  return createPortal(
    <div
      ref={ref}
      className="yt-menu"
      style={{ left: pos.left, top: pos.top, minWidth: 196 }}
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {created ? (
        <>
          <div className="px-3 pb-1.5 pt-1.5 text-[11px] font-medium" style={{ color: 'var(--assistant-text-faint)' }}>
            Created {created}
          </div>
          {divider}
        </>
      ) : null}

      {onEdit && item('Edit', onEdit)}
      {item(hasDueDate ? 'Change due date' : 'Set due date', onDueDate)}
      {onRepeat && item(repeatLabel ? `Repeat: ${repeatLabel}` : 'Repeat…', onRepeat)}

      {/* Flag: pick a color right here (the active one is ringed; ⊘ clears it) */}
      <div className="flex items-center gap-1 px-3 py-1.5" role="group" aria-label="Flag">
        <span className="flex-1 text-[13px]" style={{ color: 'var(--assistant-text)' }}>Flag</span>
        {FLAG_CHOICES.map((c) => (
          <button
            key={c}
            type="button"
            role="menuitemradio"
            aria-checked={flag === c}
            aria-label={`${c} flag`}
            title={`${c[0].toUpperCase()}${c.slice(1)} flag`}
            onClick={() => { onFlag(flag === c ? undefined : c); onClose(); }}
            className="grid h-6 w-6 place-items-center rounded-md transition-colors hover:bg-[var(--assistant-hover-bg)]"
            style={flag === c ? { boxShadow: 'inset 0 0 0 1px var(--assistant-accent)' } : undefined}
          >
            <TaskFlagIcon color={c} className="h-3.5 w-3.5" glow={false} />
          </button>
        ))}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={!flag}
          aria-label="No flag"
          title="No flag"
          onClick={() => { onFlag(undefined); onClose(); }}
          className="grid h-6 w-6 place-items-center rounded-md text-[13px] transition-colors hover:bg-[var(--assistant-hover-bg)]"
          style={{ color: 'var(--assistant-text-faint)', boxShadow: !flag ? 'inset 0 0 0 1px var(--assistant-border-soft)' : undefined }}
        >
          ⊘
        </button>
      </div>

      {onNote && item(hasNote ? 'Edit note' : 'Add note', onNote)}
      {onReminder && item('Set reminder', onReminder)}
      {divider}
      {item('Delete', onDelete, true)}
    </div>,
    document.querySelector('[data-assistant-root]') ?? document.body,
  );
}
