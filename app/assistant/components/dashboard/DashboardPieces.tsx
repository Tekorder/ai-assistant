'use client';

// Shared dashboard building blocks (Profile dashboard, habit stats). Theme-aware:
// everything reads the --assistant-* variables.

import React, { useLayoutEffect, useRef, useState } from 'react';

export const fmtPct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
export const fmtNum = (v: number, digits = 0) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(v);

export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function Card({ title, aside, children, className = '' }: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl p-4 ${className}`}
      style={{ background: 'var(--assistant-surface)', border: '1px solid var(--assistant-border-soft)' }}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-medium" style={{ color: 'var(--assistant-text-muted)' }}>{title}</h3>
        {aside ? <div className="text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Delta({ value, prev, kind = 'count', invert = false, prevLabel }: {
  value: number | null;
  prev: number | null;
  kind?: 'count' | 'pct';
  /** true when going down is the good direction (e.g. overdue) */
  invert?: boolean;
  prevLabel: string;
}) {
  if (value == null || prev == null) {
    return <span style={{ color: 'var(--assistant-text-faint)' }}>No data for {prevLabel}</span>;
  }
  const diff = value - prev;
  if (diff === 0) return <span style={{ color: 'var(--assistant-text-faint)' }}>Same as {prevLabel}</span>;
  const up = diff > 0;
  const good = invert ? !up : up;
  const amount = kind === 'pct' ? `${Math.abs(Math.round(diff * 100))} pts` : fmtNum(Math.abs(diff));
  return (
    <span style={{ color: 'var(--assistant-text-soft)' }}>
      <span
        aria-hidden="true"
        style={{ color: good ? 'var(--assistant-accent)' : 'var(--assistant-danger-text, #d03b3b)' }}
      >
        {up ? '▲' : '▼'}
      </span>{' '}
      {amount} vs {prevLabel}
    </span>
  );
}

export function KpiTile({ label, value, sub, icon }: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  /** Small leading mark (e.g. an emoji) above the value */
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="flex min-w-0 flex-col gap-1 rounded-xl px-4 py-3.5"
      style={{ background: 'var(--assistant-surface)', border: '1px solid var(--assistant-border-soft)' }}
    >
      {icon ? <div className="text-[18px] leading-none" aria-hidden="true">{icon}</div> : null}
      <div className="break-words text-[12px] font-medium" style={{ color: 'var(--assistant-text-muted)' }}>{label}</div>
      <div className="text-[28px] font-semibold leading-tight" style={{ color: 'var(--assistant-text)' }}>{value}</div>
      {sub ? <div className="break-words text-[12px]">{sub}</div> : null}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-20 items-center justify-center text-[13px]" style={{ color: 'var(--assistant-text-faint)' }}>
      {text}
    </div>
  );
}

/** Segmented control (Week | Month | Year …) in the app's radio-group look. */
export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex shrink-0 rounded-lg p-0.5"
      style={{ background: 'var(--assistant-control-bg)' }}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
            style={active
              ? { background: 'var(--assistant-contrast-bg)', color: 'var(--assistant-contrast-text)' }
              : { color: 'var(--assistant-text-muted)' }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
