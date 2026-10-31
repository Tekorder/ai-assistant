'use client';

import React from 'react';
import classes from '@/app/assistant/_theme/themes.module.css';
import { formatPill, formatTime12, isValidDateYYYYMMDD, repeatDaysLabel } from '@/lib/datacenter';
import { TaskCheckmark } from './TaskCheckmark';

/*
 * Agenda's list layout, in pieces. Agenda is the reference; the dock panels (Day, Keyword/List)
 * build their lists from these same pieces so every task list in the app looks the same.
 *
 *   List title                             ⌄
 *     ○ Task text                    ⚑ ✎ ⋮
 *       October 23, 2026
 */

type DivProps = React.HTMLAttributes<HTMLDivElement>;

/** List title row: 14px semibold, optional collapse chevron at the end. */
export function AgendaListHeader({
  heading,
  collapsed,
  onToggleCollapse,
  onAddSection,
  className = '',
  style,
  ...rest
}: DivProps & {
  /** The title itself (text, or an input while it's being renamed) */
  heading: React.ReactNode;
  collapsed?: boolean;
  /** Shows the chevron when given */
  onToggleCollapse?: () => void;
  /** Shows the "Add section" button (two lines) next to the chevron when given */
  onAddSection?: () => void;
}) {
  return (
    <div
      {...rest}
      className={`group flex items-center gap-2 px-0.5 py-1 ${className}`}
      style={{ paddingLeft: 2, ...style }}
    >
      <div className="min-w-0 flex-1 flex flex-wrap items-center gap-0.5">{heading}</div>
      {onAddSection ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAddSection(); }}
          onMouseDown={(e) => e.stopPropagation()}
          className={`w-3 shrink-0 transition-colors ${classes.quickCollapseBtn}`}
          data-tip="Add section"
          aria-label="Add section"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path strokeLinecap="round" d="M3 6h10M3 10.5h10" />
          </svg>
        </button>
      ) : null}
      {onToggleCollapse ? (
        // Points down while open, left while collapsed
        <button
          type="button"
          onClick={onToggleCollapse}
          className={`w-3 shrink-0 mr-1 transition-colors ${classes.quickCollapseBtn}`}
          data-tip={collapsed ? 'Expand' : 'Collapse'}
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

/**
 * A section is a titled group among a list's rows; its tasks sit under the title:
 *   Section                       ×     ← AgendaSectionRow
 *     ○ Task
 *                                       ← AgendaSectionEnd (spacing / "Drag tasks here")
 */
export function AgendaSectionRow({
  heading,
  onRemove,
  className = '',
  style,
  ...rest
}: DivProps & {
  /** The section title (text, or an input while it's being renamed) */
  heading: React.ReactNode;
  /** Shows an × at the end of the row when given */
  onRemove?: () => void;
}) {
  return (
    <div
      {...rest}
      className={`group flex items-center gap-2 px-0.5 pt-2 pb-0.5 ${className}`}
      style={{ paddingLeft: agendaRowPad(1), ...style }}
    >
      <div className="min-w-0 max-w-[85%] flex items-center">{heading}</div>
      <span aria-hidden="true" className="min-w-6 flex-1" />
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          onMouseDown={(e) => e.stopPropagation()}
          className="shrink-0 mr-1 h-5 w-5 flex items-center justify-center rounded opacity-60 hover:opacity-100 focus-visible:opacity-100 transition-opacity"
          style={{ color: 'var(--assistant-text-faint)' }}
          data-tip="Delete section"
          aria-label="Delete section"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path strokeLinecap="round" d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

/** A section's closing gap; `children` (e.g. "Drag tasks here") shows in it while the section shows no tasks. */
export function AgendaSectionEnd({
  children,
  className = '',
  style,
  ...rest
}: DivProps) {
  return (
    <div
      {...rest}
      className={`pb-1.5 ${children ? 'pt-1' : 'pt-1.5'} ${className}`}
      style={{ paddingLeft: agendaRowPad(1), ...style }}
    >
      {children ? (
        <div className="pb-2 text-[12px] leading-[1.45]" style={{ paddingLeft: 24, color: 'var(--assistant-text-faint)' }}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Section title text style (shared by the read-only label and the rename input). */
export const agendaSectionTitleClass = 'text-[13px] font-medium leading-[1.45]';

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
      data-tip={title ?? (checked ? 'Mark as not done' : 'Complete')}
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

/**
 * The due date under a task's text, as plain faint text — plus its hour and repeat when set:
 *   October 26, 2026 · 6:00 AM · ↻ Every Monday
 * The date is clickable when `onClick` is given, the hour when `onTimeClick` is, the repeat when `onRepeatClick` is.
 * Without a date, a repeat still shows (with its hour): "6:00 AM · ↻ Every day".
 * `labeled` names it ("Due …"); `created` leads with the creation date ("Created … · Due …").
 */
export function AgendaDate({
  ymd,
  time,
  repeatDays,
  onClick,
  onTimeClick,
  onRepeatClick,
  labeled = false,
  created,
}: {
  ymd?: string;
  time?: string;
  repeatDays?: number[];
  onClick?: () => void;
  onTimeClick?: () => void;
  onRepeatClick?: () => void;
  /** Prefix the due date with "Due" */
  labeled?: boolean;
  /** Creation date (YYYY-MM-DD) shown first as "Created …" */
  created?: string;
}) {
  const cls = 'text-[12px] leading-[1.45]';
  const style = { color: 'var(--assistant-text-faint)' };
  const createdText = isValidDateYYYYMMDD(created) ? (
    <span className={cls} style={style}>Created {formatPill(created)}</span>
  ) : null;
  const hour = formatTime12(time);
  const repeat = repeatDaysLabel(repeatDays);
  const hasDate = isValidDateYYYYMMDD(ymd);
  if (!hasDate && !repeat) {
    return createdText ? <span className="-mt-1 self-start flex">{createdText}</span> : null;
  }
  const dueLabel = hasDate && (labeled || createdText) ? <span className={cls} style={style}>Due</span> : null;

  const date = !hasDate ? null : onClick ? (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseDown={(e) => e.stopPropagation()}
      aria-label="Change due date"
      data-tip="Change due date"
      className={`${cls} transition-colors hover:underline`}
      style={style}
    >
      {formatPill(ymd)}
    </button>
  ) : (
    <span className={cls} style={style}>{formatPill(ymd)}</span>
  );
  if (!hour && !repeat && !dueLabel) return <span className="-mt-1 self-start flex">{date}</span>;

  const repeatText = <>↻ {repeat}</>;
  const hourText = hour && onTimeClick ? (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onTimeClick(); }}
      onMouseDown={(e) => e.stopPropagation()}
      data-tip="Change time"
      className={`${cls} transition-colors hover:underline`}
      style={style}
    >
      {hour}
    </button>
  ) : hour ? (
    <span className={cls} style={style}>{hour}</span>
  ) : null;
  return (
    <span className="-mt-1 self-start flex flex-wrap items-baseline gap-x-1.5">
      {createdText}
      {createdText ? <span className={cls} style={style} aria-hidden="true">·</span> : null}
      {dueLabel}
      {date}
      {hourText ? (
        <>
          {date ? <span className={cls} style={style} aria-hidden="true">·</span> : null}
          {hourText}
        </>
      ) : null}
      {repeat ? (
        <>
          {date || hourText ? <span className={cls} style={style} aria-hidden="true">·</span> : null}
          {onRepeatClick ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRepeatClick(); }}
              onMouseDown={(e) => e.stopPropagation()}
              data-tip="Change repeat"
              className={`${cls} transition-colors hover:underline`}
              style={style}
            >
              {repeatText}
            </button>
          ) : (
            <span className={cls} style={style}>{repeatText}</span>
          )}
        </>
      ) : null}
    </span>
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
      data-tip="Task options"
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
