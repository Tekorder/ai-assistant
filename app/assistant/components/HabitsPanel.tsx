'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useHabits, useToday } from '@/app/assistant/_hook/useHabits';
import { dayCompletion, habitsDueOn, indexHabitLogs } from '@/app/assistant/_utils/habitSchedule';
import classes from '@/app/assistant/_theme/themes.module.css';
import { PanelPinButton } from './PanelPinButton';
import HabitsView from './habits/HabitsView';
import { HabitList } from './habits/HabitList';
import { useHabitDialogs } from './habits/useHabitDialogs';

type Props = {
  open: boolean;
  onClose: () => void;
  /** tab: the full Habits view in the main panel · dock/overlay: today's check-in list */
  variant?: 'overlay' | 'dock' | 'tab';
  /** Shows a pin beside ✕ that moves the panel into the main panel's tabs */
  onPin?: () => void;
};

export default function HabitsPanel({ open, onClose, variant = 'overlay', onPin }: Props) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setIsClosing(false);
      return;
    }
    if (!shouldRender) return;
    setIsClosing(true);
    const t = window.setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
    }, 260);
    return () => window.clearTimeout(t);
  }, [open, shouldRender]);

  const requestClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      onClose();
    }, 220);
  };

  if (variant === 'tab') {
    return <HabitsView />;
  }

  if (!shouldRender) return null;

  const panelAnim = isClosing
    ? 'habitsPanelOut 0.24s cubic-bezier(0.4, 0, 1, 1) both'
    : 'habitsPanelIn 0.46s cubic-bezier(0.22, 1, 0.36, 1) 0.16s both';

  const body = (
    <>
      <style>{`
        @keyframes habitsPanelIn {
          from { transform: translateX(-34px); opacity: 0; filter: blur(1px); }
          60% { transform: translateX(3px); opacity: .92; filter: blur(0); }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes habitsPanelOut {
          from { transform: translateX(0); opacity: 1; filter: blur(0); }
          to { transform: translateX(14px); opacity: 0; filter: blur(1px); }
        }
      `}</style>
      <div className="flex h-[49px] items-center justify-between px-4 shrink-0"
        style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
        <h2 className="text-[16px] font-semibold" style={{ color: 'var(--assistant-text-soft)' }}>Habits</h2>
        <div className="flex items-center gap-1">
          {onPin ? <PanelPinButton onPin={onPin} label="Habits" /> : null}
          <button type="button" onClick={requestClose} className={`h-8 w-8 rounded-lg ${classes.panelCloseBtn}`} aria-label="Close">
            ✕
          </button>
        </div>
      </div>
      <TodayChecklist />
    </>
  );

  if (variant === 'dock') {
    return (
      <div
        className={`flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl ${classes.panelGlass}`}
        style={{ color: 'var(--assistant-text)', animation: panelAnim }}
      >
        {body}
      </div>
    );
  }

  return (
    <>
      <button type="button" className="fixed inset-0 z-200 bg-black/50" onClick={requestClose}
        aria-label="Close habits"
        style={{ animation: isClosing ? 'habitsOverlayOut 0.2s ease-out both' : 'habitsOverlayIn 0.22s ease-out both' }}
      />
      <div
        className={`fixed right-3 top-3 z-201 flex h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] max-w-md flex-col overflow-hidden rounded-2xl ${classes.panelGlass} ${classes.panelOverlay}`}
        style={{ color: 'var(--assistant-text)', animation: panelAnim }}
      >
        <style>{`
          @keyframes habitsOverlayIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes habitsOverlayOut { from { opacity: 1; } to { opacity: 0; } }
        `}</style>
        {body}
      </div>
    </>
  );
}

/** Dock / overlay body: today's due habits as compact cards, to check in quickly. */
function TodayChecklist() {
  const { habits, logs, checkInMethod } = useHabits();
  const today = useToday();
  const index = useMemo(() => indexHabitLogs(logs), [logs]);
  const due = useMemo(() => habitsDueOn(habits, today), [habits, today]);
  const { done, due: dueCount } = dayCompletion(habits, index, today, today);
  const { act, startNew, open, dialogs } = useHabitDialogs(habits, index);

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
        <span className="text-[13px]" style={{ color: 'var(--assistant-text-muted)' }}>
          Today{dueCount ? ` · ${done}/${dueCount} done` : ''}
        </span>
        <button type="button" onClick={() => startNew()} className={`h-8 w-8 shrink-0 rounded-md ${classes.panelBtn}`}
          data-tip="New habit" aria-label="New habit">
          +
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {due.length ? (
          <HabitList habits={due} index={index} ymd={today} today={today} method={checkInMethod} compact
            onAction={h => act(h, today)} onOpen={h => open(h, today)} />
        ) : (
          <p className="py-10 text-center text-[13px]" style={{ color: 'var(--assistant-text-faint)' }}>
            {habits.some(h => !h.archived) ? 'Nothing due today.' : 'No habits yet — add one with +.'}
          </p>
        )}
      </div>
      {dialogs}
    </>
  );
}
