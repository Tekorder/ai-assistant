'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTodayReminders, type TodayReminder } from '../_hook/useTodayReminders';
import { habitColorStyle } from '../_utils/habitColors';
import { browserPermission, claimReminderAlert, readNotifyPrefs } from '../_utils/reminderAlerts';
import { TaskFlagIcon } from './TaskFlag';
import classes from '@/app/assistant/_theme/themes.module.css';

/** A reminder that came due longer ago than this (e.g. before the app was opened) stays in the bell, no alert. */
const GRACE_MINUTES = 15;
const TOAST_MS = 60_000;

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function playSound() {
  try { void new Audio('/sounds/notif.mp3').play().catch(() => {}); } catch {}
}

function showBrowserNotification(r: TodayReminder) {
  if (browserPermission() !== 'granted') return;
  try {
    const n = new Notification(`${r.emoji ? `${r.emoji} ` : ''}${r.title}`, {
      body: r.message || `Reminder · ${r.time}`,
      tag: r.key,
      icon: '/icon.png',
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch {}
}

/**
 * Alerts reminders as they come due while YouTask is open: an in-app toast (and
 * sound), plus a browser notification when the tab is in the background and the
 * person allowed it. Mount once. Each reminder alerts once per day per browser.
 */
export default function ReminderNotifier() {
  const { items, today, now, dismiss, checkIn } = useTodayReminders();
  const [toastKeys, setToastKeys] = useState<string[]>([]);

  useEffect(() => {
    const prefs = readNotifyPrefs();
    for (const r of items) {
      if (r.state !== 'due') continue;
      // Claimed even when too old to alert, so it never alerts late
      if (!claimReminderAlert(today, r.key)) continue;
      if (toMinutes(now) - toMinutes(r.time) > GRACE_MINUTES) continue;
      setToastKeys(keys => (keys.includes(r.key) ? keys : [...keys, r.key]));
      if (prefs.sound) playSound();
      if (prefs.browser && document.visibilityState === 'hidden') showBrowserNotification(r);
      window.setTimeout(() => setToastKeys(keys => keys.filter(k => k !== r.key)), TOAST_MS);
    }
  }, [items, today, now]);

  // Live items, so a toast leaves as soon as its reminder is handled anywhere
  const toasts = toastKeys
    .map(k => items.find(r => r.key === k))
    .filter((r): r is TodayReminder => Boolean(r) && r!.state === 'due');
  if (!toasts.length) return null;

  const hide = (key: string) => setToastKeys(keys => keys.filter(k => k !== key));

  return createPortal(
    // Above the chat bubble in the bottom-right corner
    <div className="pointer-events-none fixed bottom-24 right-4 z-[10040] flex w-[min(92vw,340px)] flex-col gap-2" aria-live="polite">
      {toasts.slice(-3).map(r => <ReminderToast key={r.key} r={r} onHide={() => hide(r.key)}
        onDismiss={() => { dismiss([r]); hide(r.key); }} onDone={() => { checkIn(r); hide(r.key); }} />)}
    </div>,
    document.querySelector('[data-assistant-root]') ?? document.body,
  );
}

function ReminderToast({ r, onHide, onDismiss, onDone }: {
  r: TodayReminder;
  onHide: () => void;
  onDismiss: () => void;
  onDone: () => void;
}) {
  const color = r.kind === 'habit' ? habitColorStyle(r.color) : null;
  return (
    <div
      role="status"
      className={`${color?.className ?? ''} drop-in pointer-events-auto relative overflow-hidden rounded-2xl p-3.5 pl-4 shadow-2xl ${classes.quickModal}`}
      style={color?.style}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1"
        style={{ background: r.kind === 'habit' ? 'var(--habit-color)' : 'var(--assistant-contrast-bg)' }} />
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-[20px] leading-none" aria-hidden="true">
          {r.emoji ?? (r.flag ? <TaskFlagIcon color={r.flag} className="h-4 w-4" /> : '🔔')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--assistant-text-faint)' }}>
            {r.kind === 'habit' ? 'Habit reminder' : 'Reminder'} · {r.time}
          </div>
          <div className="break-words text-[14px] font-semibold" style={{ color: 'var(--assistant-text)' }}>{r.title}</div>
          {r.message ? <div className="break-words text-[13px]" style={{ color: 'var(--assistant-text-soft)' }}>{r.message}</div> : null}
          <div className="mt-2 flex gap-2">
            {r.kind === 'habit' && r.habit?.kind === 'build' ? (
              <button type="button" onClick={onDone} className="rounded-full px-3 py-1 text-[12px] font-semibold"
                style={{ background: 'var(--habit-color)', color: 'var(--habit-on)' }}>
                Done
              </button>
            ) : null}
            <button type="button" onClick={onDismiss} className={`rounded-full px-3 py-1 text-[12px] font-medium ${classes.modalSecondaryButton}`}>
              Dismiss
            </button>
          </div>
        </div>
        <button type="button" onClick={onHide} aria-label="Hide" className={`-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-full text-[12px] ${classes.panelCloseBtn}`}>
          ✕
        </button>
      </div>
    </div>
  );
}
