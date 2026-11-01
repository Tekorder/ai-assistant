'use client';

import React from 'react';
import classes from '@/app/assistant/_theme/themes.module.css';

/** Pin, beside a dock panel's ✕: moves the panel up into the main panel's tabs. */
export function PanelPinButton({ onPin, label }: { onPin: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onPin}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${classes.panelCloseBtn}`}
      aria-label={`Pin ${label} as a tab`}
      data-tip="Pin as a tab"
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 2.5h4M6.6 2.5v3.6L4.5 9h7l-2.1-2.9V2.5" />
        <path d="M8 9v4.5" />
      </svg>
    </button>
  );
}
