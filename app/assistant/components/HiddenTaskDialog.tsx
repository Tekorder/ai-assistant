'use client';
import React, { useEffect, useRef, useState } from 'react';
import classes from '@/app/assistant/_theme/themes.module.css';

/** One active filter that keeps a just-created task out of view. */
export type HiddenTaskReason = { key: string; label: string; detail: string };

// "Don't show this again" — remembered per browser
const LS_KEY_MUTED = 'youtask_hidden_task_notice_muted';

export function isHiddenTaskNoticeMuted(): boolean {
  try { return localStorage.getItem(LS_KEY_MUTED) === '1'; } catch { return false; }
}

/**
 * Shown when a task the user just created or changed falls outside the current filters:
 * names each filter in the way and lets the user turn them off one by one, or all at once.
 */
export function HiddenTaskDialog({
  title = "Task saved — but it's hidden",
  taskText,
  reasons,
  onTurnOff,
  onClose,
}: {
  title?: string;
  taskText: string;
  reasons: HiddenTaskReason[];
  /** Turns off the given filters (by key) */
  onTurnOff: (keys: string[]) => void;
  onClose: () => void;
}) {
  // Filters already turned off from here, so their rows show "Off"
  const [off, setOff] = useState<string[]>([]);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const remaining = reasons.filter(r => !off.includes(r.key));

  // Every way out goes through here, so the checkbox is honored however the modal closes
  const close = () => {
    if (dontShowAgain) {
      try { localStorage.setItem(LS_KEY_MUTED, '1'); } catch {}
    }
    onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => { primaryRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const turnOff = (key: string) => {
    onTurnOff([key]);
    const next = [...off, key];
    setOff(next);
    // Last one gone → the task is in view, nothing left to say
    if (reasons.every(r => next.includes(r.key))) close();
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <button type="button" className={`absolute inset-0 ${classes.modalBackdrop}`} onClick={close} aria-label="Close" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="hidden-task-title"
        aria-describedby="hidden-task-desc"
        className={`relative w-full max-w-sm ${classes.modalCard}`}
      >
        <div className="px-5 pt-5 text-center">
          {/* Eye with a slash: saved, just not visible */}
          <div
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: 'color-mix(in srgb, var(--assistant-accent) 14%, transparent)', color: 'var(--assistant-accent)' }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3l18 18" />
              <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.5M6.6 6.6C4.5 8 3 10.1 2 12c1 2.5 5 7 10 7 1.9 0 3.6-.6 5-1.5" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            </svg>
          </div>
          <h2 id="hidden-task-title" className="text-[15px] font-semibold" style={{ color: 'var(--assistant-text)' }}>
            {title}
          </h2>
          <p id="hidden-task-desc" className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--assistant-text-muted)' }}>
            <span className="break-words font-medium" style={{ color: 'var(--assistant-text-soft)' }}>&ldquo;{taskText}&rdquo;</span>
            {' '}doesn&apos;t match {reasons.length === 1 ? 'this filter' : 'these filters'}. Turn {reasons.length === 1 ? 'it' : 'them'} off to see it.
          </p>
        </div>

        <ul className="mx-5 mt-4 space-y-1">
          {reasons.map(r => {
            const isOff = off.includes(r.key);
            return (
              <li
                key={r.key}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{ background: 'color-mix(in srgb, var(--assistant-text) 5%, transparent)' }}
              >
                <div className="min-w-0 flex-1">
                  <div className="break-words text-[13px] font-semibold" style={{ color: 'var(--assistant-text)', opacity: isOff ? 0.5 : 1 }}>
                    {r.label}
                  </div>
                  <div className="break-words text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>{r.detail}</div>
                </div>
                {isOff ? (
                  <span className="shrink-0 text-[12px] font-medium" style={{ color: 'var(--assistant-text-faint)' }}>Off</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => turnOff(r.key)}
                    className="shrink-0 rounded-full px-3 py-1 text-[12px] font-medium transition-colors"
                    style={{ color: 'var(--assistant-text)', background: 'color-mix(in srgb, var(--assistant-text) 8%, transparent)' }}
                  >
                    Turn off
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <label className="mx-5 mt-3 flex cursor-pointer select-none items-center gap-2 text-[12px]" style={{ color: 'var(--assistant-text-muted)' }}>
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={e => setDontShowAgain(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer"
            style={{ accentColor: 'var(--assistant-accent)' }}
          />
          Don&apos;t show this again
        </label>

        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <button type="button" onClick={close} className={`rounded-md px-3 py-2 text-[13px] ${classes.quickModalSecondary}`}>
            Keep filters
          </button>
          <button
            ref={primaryRef}
            type="button"
            onClick={() => { onTurnOff(remaining.map(r => r.key)); close(); }}
            className={`rounded-md px-3 py-2 text-[13px] font-medium ${classes.quickModalPrimary}`}
          >
            {remaining.length > 1 ? 'Turn all off & show it' : 'Show my task'}
          </button>
        </div>
      </div>
    </div>
  );
}
