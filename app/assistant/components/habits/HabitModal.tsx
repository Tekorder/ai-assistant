'use client';

import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import classes from '@/app/assistant/_theme/themes.module.css';

// Open habit modals, bottom → top. Escape closes only the top one (the color
// picker over the editor, not both).
const stack: string[] = [];

/**
 * The habit dialogs' shell — portaled into the themed root like TaskRepeatModal:
 * backdrop, card, header (title + optional left/right buttons), scrolling body, footer.
 */
export function HabitModal({ title, onClose, left, right, footer, children, className = '', style, width = 'max-w-md', ariaLabel }: {
  title: React.ReactNode;
  onClose: () => void;
  /** Replaces the close button on the left (e.g. a back arrow) */
  left?: React.ReactNode;
  right?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Extra classes / CSS variables on the card (e.g. a habit's color) */
  className?: string;
  style?: React.CSSProperties;
  width?: string;
  ariaLabel?: string;
}) {
  const id = useId();
  // Callers pass inline closures; registering once keeps this modal's place in the stack
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    stack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === id) {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(id), 1);
    };
  }, [id]);

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-center justify-center p-3">
      <button type="button" className={`absolute inset-0 ${classes.modalBackdrop}`} onClick={onClose} aria-label="Close" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
        className={`relative flex max-h-[min(88vh,820px)] w-full ${width} flex-col overflow-hidden ${classes.modalCard} ${className}`}
        style={style}
      >
        <div className="grid shrink-0 grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2 px-4 pb-2 pt-4">
          {left ?? <HabitIconButton label="Close" onClick={onClose}>✕</HabitIconButton>}
          <div className="min-w-0 truncate text-center text-[16px] font-semibold" style={{ color: 'var(--assistant-text)' }}>
            {title}
          </div>
          <div className="flex justify-end">{right}</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer ? <div className="shrink-0 px-4 pb-4 pt-1">{footer}</div> : null}
      </div>
    </div>,
    document.querySelector('[data-assistant-root]') ?? document.body,
  );
}

/** Round icon button for modal headers. */
export function HabitIconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-tip={label}
      className={`flex h-9 w-9 items-center justify-center rounded-full text-[14px] ${classes.panelBtn}`}
    >
      {children}
    </button>
  );
}

/** A rounded group of rows inside a dialog (the reference's white cards). */
export function HabitSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl px-4 py-3 ${className}`}
      style={{ background: 'var(--assistant-surface)', border: '1px solid var(--assistant-border-soft)' }}>
      {children}
    </section>
  );
}

/** One labeled row in a HabitSection: label left, control right. */
export function HabitRow({ label, hint, children }: { label: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-[40px] items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="text-[14px] font-medium" style={{ color: 'var(--assistant-text)' }}>{label}</div>
        {hint ? <div className="text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>{hint}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/** On/off switch in the habit's color. */
export function HabitSwitch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
      style={{ background: on ? 'var(--habit-color, var(--assistant-contrast-bg))' : 'color-mix(in srgb, var(--assistant-text) 14%, transparent)' }}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]"
        style={{ left: on ? 'calc(100% - 1.375rem)' : '0.125rem' }}
      />
    </button>
  );
}

/** Pill choices (Anytime · Morning · …) in the habit's color. */
export function HabitChips<T extends string>({ value, options, onChange, ariaLabel }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${active ? '' : classes.modalSecondaryButton}`}
            style={active ? { background: 'var(--habit-color, var(--assistant-contrast-bg))', color: 'var(--habit-on, var(--assistant-contrast-text))' } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The dialog's main button, in the habit's color. */
export function HabitPrimaryButton({ children, onClick, disabled, type = 'button' }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-full px-4 py-2.5 text-[14px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
      style={{ background: 'var(--habit-color, var(--assistant-contrast-bg))', color: 'var(--habit-on, var(--assistant-contrast-text))' }}
    >
      {children}
    </button>
  );
}
