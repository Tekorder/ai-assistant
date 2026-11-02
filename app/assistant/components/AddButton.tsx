'use client';

import React from 'react';

/**
 * The app's one "add something" button: a filled pill in the theme's contrast color
 * ("+ New task", "+ New habit"…). `compact` drops the label for tight headers (docked
 * panels) and keeps it as the tooltip.
 */
export function AddButton({
  label,
  onClick,
  compact = false,
  className = '',
}: {
  /** e.g. "New task" — the "+" is added */
  label: string;
  onClick: () => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={compact ? label : undefined}
      data-tip={compact ? label : undefined}
      className={[
        'shrink-0 items-center justify-center rounded-full font-semibold transition-opacity hover:opacity-90',
        compact ? 'h-8 w-8' : 'gap-1.5 whitespace-nowrap px-4 py-1.5 text-[13px]',
        // Callers may hide it per breakpoint (e.g. "hidden md:flex"); default to flex
        /\b(hidden|flex)\b/.test(className) ? '' : 'flex',
        className,
      ].join(' ')}
      style={{ background: 'var(--assistant-contrast-bg)', color: 'var(--assistant-contrast-text)' }}
    >
      <svg viewBox="0 0 16 16" className={compact ? 'h-4 w-4' : 'h-3.5 w-3.5'} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <path strokeLinecap="round" d="M8 3v10M3 8h10" />
      </svg>
      {compact ? null : <span>{label}</span>}
    </button>
  );
}
