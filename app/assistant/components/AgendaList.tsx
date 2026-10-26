'use client';

import React from 'react';
import classes from '@/app/assistant/_theme/themes.module.css';
import { formatPill, isValidDateYYYYMMDD } from '@/lib/datacenter';
import { TaskCheckmark } from './TaskCheckmark';

/*
 * Agenda's list layout, in pieces. Agenda is the reference; the dock panels (Day, Keyword/List)
 * build their lists from these same pieces so every task list in the app looks the same.
 *
 *   List title ─────────────────────────── ⌄
 *     ○ Task text                    ⚑ ✎ ⋮
 *       October 23, 2026
 */

type DivProps = React.HTMLAttributes<HTMLDivElement>;

/** List title row: 14px semibold, thin rule under it, optional collapse chevron at the end. */
export function AgendaListHeader({
  heading,
  collapsed,
  onToggleCollapse,
  className = '',
  style,
  ...rest
}: DivProps & {
  /** The title itself (text, or an input while it's being renamed) */
  heading: React.ReactNode;
  collapsed?: boolean;
  /** Shows the chevron when given */
  onToggleCollapse?: () => void;
}) {
  return (
    <div
      {...rest}
      className={`group flex items-center gap-2 px-0.5 py-1 ${className}`}
      style={{ paddingLeft: 2, borderBottom: '1px solid var(--assistant-border-soft)', ...style }}
    >
      <div className="min-w-0 flex-1 flex flex-wrap items-center gap-0.5">{heading}</div>
      {onToggleCollapse ? (
        // Points down while open, left while collapsed
        <button
          type="button"
          onClick={onToggleCollapse}
          className={`w-3 shrink-0 mr-1 transition-colors ${classes.quickCollapseBtn}`}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <svg viewBox="0 0 16 16" className={`h-3 w-3 transition-transform ${collapsed ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6l4 4 4-4" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

/** Plain (read-only) list title text, for headers that don't rename in place. */
export function AgendaListTitle({ children }: { children: React.ReactNode }) {
  return (
    <span className="min-w-0 break-words text-[14px] md:text-sm font-semibold" style={{ color: 'var(--assistant-text)' }}>
      {children}
    </span>
  );
}

/**
 * Task row: checkmark · text with the due date under it · pinned extras (flag, note, ⋮) on the right.
 * Everything lines up with the text's first line.
 */
export function AgendaTaskRow({
  check,
  children,
  right,
  indent = 1,
  className = '',
  style,
  ...rest
}: DivProps & {
  check: React.ReactNode;
  /** Text, then the date (or anything else) stacked under it */
  children: React.ReactNode;
  right?: React.ReactNode;
  /** Task depth (1 = task, 2 = subtask…) */
  indent?: number;
}) {
  return (
    <div
      {...rest}
      className={`group flex items-start gap-2 px-0.5 py-1 ${className}`}
      style={{ paddingLeft: agendaRowPad(indent), ...style }}
    >
      {check}
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">{children}</div>
      {right}
    </div>
  );
}

/** Left padding of a task row at a given depth (also used by rows that sit between tasks). */
export const agendaRowPad = (indent: number) => 8 + (Math.max(1, indent) - 1) * 16;

/** The checkmark button, sized to the text's first line. `children` overlays it (e.g. Agenda's pulse). */
export function AgendaCheck({
  checked,
  onToggle,
  title,
  children,
}: {
  checked: boolean;
  onToggle?: () => void;
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
      disabled={!onToggle}
      className="relative flex h-[1.45em] w-4 shrink-0 items-center justify-center text-[14px] md:text-sm disabled:cursor-default"
      title={title ?? (checked ? 'Mark as not done' : 'Complete')}
    >
      {children}
      <TaskCheckmark checked={checked} />
    </button>
  );
}

/** Read-only task text (Agenda edits in place with its own textarea, same type). */
export function AgendaTaskText({
  checked,
  children,
  className = '',
  style,
}: {
  checked: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`text-[14px] md:text-sm whitespace-pre-wrap break-words leading-[1.45] min-h-[1.45em] ${className}`}
      style={{ color: checked ? 'var(--assistant-text-faint)' : 'var(--assistant-text-soft)', ...style }}
    >
      {children}
    </div>
  );
}

/** The due date under a task's text, as plain faint text. Clickable when `onClick` is given. */
export function AgendaDate({ ymd, onClick }: { ymd?: string; onClick?: () => void }) {
  if (!isValidDateYYYYMMDD(ymd)) return null;
  const cls = '-mt-1 self-start text-[12px] leading-[1.45]';
  const style = { color: 'var(--assistant-text-faint)' };
  return onClick ? (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseDown={(e) => e.stopPropagation()}
      aria-label="Change due date"
      title="Change due date"
      className={`${cls} transition-colors hover:underline`}
      style={style}
    >
      {formatPill(ymd)}
    </button>
  ) : (
    <span className={cls} style={style}>{formatPill(ymd)}</span>
  );
}

/** ⋮ on the right of a row: shows on hover, and stays while its menu is open. */
export function AgendaMenuButton({
  open,
  onOpen,
}: {
  open: boolean;
  /** Gets the button's rect, to anchor the menu */
  onOpen: (rect: DOMRect) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(e.currentTarget.getBoundingClientRect()); }}
      onMouseDown={(e) => e.stopPropagation()}
      aria-label="Task options"
      title="Task options"
      aria-haspopup="menu"
      aria-expanded={open}
      className={[
        'shrink-0 h-5 w-5 flex items-center justify-center rounded transition-opacity duration-150',
        open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
      ].join(' ')}
      // Full theme text color — the muted tone was too faint to spot
      style={{ color: 'var(--assistant-text)' }}
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
        <circle cx="8" cy="3.2" r="1.3" />
        <circle cx="8" cy="8" r="1.3" />
        <circle cx="8" cy="12.8" r="1.3" />
      </svg>
    </button>
  );
}
