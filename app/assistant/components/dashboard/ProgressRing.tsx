'use client';

import React from 'react';

/**
 * Circular progress (0–1). The track and fill follow the theme unless a color is
 * given; anything passed as children is centered inside the ring.
 */
export function ProgressRing({ value, size = 120, stroke = 10, color, track, children, ariaLabel }: {
  value: number;
  size?: number;
  stroke?: number;
  /** Fill color (default: the theme accent) */
  color?: string;
  /** Track color (default: a faint mix of the text color) */
  track?: string;
  children?: React.ReactNode;
  ariaLabel?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value));
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}
      role={ariaLabel ? 'img' : undefined} aria-label={ariaLabel}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          style={{ stroke: track ?? 'color-mix(in srgb, var(--assistant-text-faint) 30%, transparent)' }} />
        {v > 0 ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${c * v} ${c}`}
            style={{ stroke: color ?? 'var(--assistant-accent)', transition: 'stroke-dasharray 320ms cubic-bezier(0.22, 1, 0.36, 1)' }} />
        ) : null}
      </svg>
      {children != null ? <div className="relative flex flex-col items-center justify-center text-center">{children}</div> : null}
    </div>
  );
}
