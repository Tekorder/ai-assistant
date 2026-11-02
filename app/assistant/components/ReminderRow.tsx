'use client';

import React from 'react';

/**
 * How a reminder time stands today. upcoming / due / done as in useTodayReminders;
 * off = not one of today's (another day, or not on its weekdays).
 */
export type ReminderChipState = 'upcoming' | 'due' | 'done' | 'off';

/**
 * One reminder row — the shared look of the Reminders tab (plain reminders and habit ones):
 * a round icon, the title, a schedule line, today's time chips and actions on the right.
 * Colors come from --habit-tint / --habit-ink when set (a habit's color), else the accent.
 */
export function ReminderRow({
  icon,
  title,
  meta,
  chips,
  actions,
  className = '',
  style,
  ...rest
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  meta: React.ReactNode;
  chips: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>) {
  return (
    <div className={`group flex items-start gap-2.5 rounded-lg px-1.5 py-1.5 ${className}`} style={style} {...rest}>
      {icon}
      <div className="min-w-0 flex-1">
        {title}
        <div className="text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>{meta}</div>
        <div className="mt-1 flex flex-wrap gap-1">{chips}</div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

/** The round icon at the start of a row (a habit's emoji, a bell). */
export function ReminderIcon({ children, onClick, label, tip }: {
  children: React.ReactNode;
  onClick?: () => void;
  label?: string;
  tip?: string;
}) {
  const cls = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[16px]';
  const style: React.CSSProperties = {
    background: 'var(--habit-tint, var(--assistant-accent-bg))',
    color: 'var(--habit-ink, var(--assistant-accent))',
  };
  return onClick ? (
    <button type="button" onClick={onClick} className={cls} style={style} aria-label={label} data-tip={tip}>{children}</button>
  ) : (
    <span className={cls} style={style} aria-hidden="true">{children}</span>
  );
}

/** A reminder time, marked with how it stands today. Clickable when `onClick` is given. */
export function ReminderTimeChip({ label, state, onClick }: {
  /** e.g. "06:30" or "9:45 AM" */
  label: string;
  state: ReminderChipState;
  onClick?: () => void;
}) {
  const style: React.CSSProperties =
    state === 'due' ? { background: 'color-mix(in srgb, var(--assistant-danger-text) 14%, transparent)', color: 'var(--assistant-danger-text)', fontWeight: 600 }
    : state === 'done' ? { background: 'var(--habit-tint, var(--assistant-accent-bg))', color: 'var(--assistant-text-faint)' }
    : state === 'upcoming' ? { background: 'var(--habit-tint, var(--assistant-accent-bg))', color: 'var(--habit-ink, var(--assistant-accent))' }
    : { background: 'var(--assistant-control-bg)', color: 'var(--assistant-text-faint)' };
  const tip = state === 'due' ? 'Due' : state === 'done' ? 'Done for today' : state === 'upcoming' ? 'Later today' : 'Not today';
  const text = <>{state === 'done' ? '✓ ' : ''}{label}{state === 'due' ? ' · Due' : ''}</>;
  const cls = 'rounded-full px-2 py-px text-[11px] tabular-nums';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} transition-opacity hover:opacity-80`} style={style} data-tip={`${tip} · change time`}>
      {text}
    </button>
  ) : (
    <span className={cls} style={style} data-tip={tip}>{text}</span>
  );
}

/** Filled "Done" pill and quiet "Dismiss" button, as the habit reminders use them. */
export function ReminderDoneButton({ onClick, tip, label = 'Done' }: { onClick: () => void; tip?: string; label?: string }) {
  return (
    <button type="button" onClick={onClick}
      className="rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ background: 'var(--habit-color, var(--assistant-accent))', color: 'var(--habit-on, var(--assistant-contrast-text, #fff))' }}
      data-tip={tip}>
      {label}
    </button>
  );
}

export function ReminderDismissButton({ onClick, tip = 'Dismiss for today', label }: { onClick: () => void; tip?: string; label?: string }) {
  return (
    <button type="button" onClick={onClick}
      className="rounded-md px-2 py-1 text-[12px]"
      style={{ background: 'var(--assistant-control-bg)', color: 'var(--assistant-text-muted)' }}
      aria-label={label} data-tip={tip}>
      Dismiss
    </button>
  );
}
