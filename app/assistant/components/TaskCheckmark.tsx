'use client';

import React from 'react';
import classes from '@/app/assistant/_theme/themes.module.css';

/**
 * The app's one checkmark look (Workspace's): an outlined circle when open, a filled
 * circle with a check when done. Visual only — the caller's button handles the click.
 */
export function TaskCheckmark({ checked, size = 'md' }: { checked: boolean; size?: 'md' | 'sm' }) {
  const box = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const tick = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';
  return checked ? (
    <span className={`flex shrink-0 items-center justify-center ${box} ${classes.quickCheckboxDone}`}>
      <svg viewBox="0 0 16 16" className={tick} fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.2 8.4l3 3 6.6-7" />
      </svg>
    </span>
  ) : (
    <span className={`shrink-0 ${box} ${classes.quickCheckbox}`} />
  );
}
