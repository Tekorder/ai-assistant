'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  type Habit,
  arrayMove,
  deleteHabitsLS,
  makeHabit,
  readHabitsLS,
  setHabitLogLS,
  todayYMD,
  updateHabit as updateHabitArr,
  writeHabitsLS,
} from '@/lib/datacenter';
import { useHabits } from '@/app/assistant/_hook/useHabits';
import { isGoalMet, periodTotal } from '@/app/assistant/_utils/habitSchedule';
import classes from '@/app/assistant/_theme/themes.module.css';
import { TaskCheckmark } from './TaskCheckmark';

type Props = {
  open: boolean;
  onClose: () => void;
  /** tab: a main-panel tab — no frame, title or close button */
  variant?: 'overlay' | 'dock' | 'tab';
};

export default function HabitsPanel({ open, onClose, variant = 'overlay' }: Props) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);
  const { habits: allHabits, logs } = useHabits();
  const habits = allHabits.filter(h => !h.archived);
  const today = todayYMD();
  const [draft, setDraft] = useState('');
  const [newId, setNewId] = useState<string | null>(null);
  const newTimerRef = useRef<number | null>(null);
  const dragRef = useRef<{ id: string } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (newTimerRef.current) window.clearTimeout(newTimerRef.current);
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

  const triggerNewLineAnim = (id: string) => {
    setNewId(id);
    if (newTimerRef.current) window.clearTimeout(newTimerRef.current);
    newTimerRef.current = window.setTimeout(() => setNewId(null), 220);
  };

  const persistHabits = (next: Habit[]) => {
    writeHabitsLS({ ...readHabitsLS(), habits: next });
  };

  const handleAddHabit = () => {
    const text = draft.trim();
    if (!text) return;
    const next = makeHabit({ text });
    persistHabits([...allHabits, next]);
    setDraft('');
    triggerNewLineAnim(next.id);
  };

  const handleUpdateHabit = (id: string, patch: Partial<Habit>) => {
    persistHabits(updateHabitArr(allHabits, id, patch));
  };

  /** Done for its period (today / this week) — toggling logs or clears today's amount. */
  const isDone = (h: Habit) => isGoalMet(h, periodTotal(h, logs, today));
  const toggleDone = (h: Habit) => setHabitLogLS(h.id, today, { value: isDone(h) ? 0 : h.goalValue });

  const commitText = (h: Habit, el: HTMLInputElement) => {
    const text = el.value.trim();
    if (!text) { el.value = h.text; return; }   // a habit can't be nameless — delete it instead
    if (text !== h.text) handleUpdateHabit(h.id, { text });
  };

  const onDragStartRow = (e: React.DragEvent, id: string) => {
    dragRef.current = { id };
    setDragOverId(id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch {}
  };

  const onDragOverRow = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    if (!dragRef.current) return;
    if (dragOverId !== overId) setDragOverId(overId);
  };

  const onDropRow = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    const drag = dragRef.current;
    if (!drag) return;
    const fromIndex = allHabits.findIndex(h => h.id === drag.id);
    const toIndex = allHabits.findIndex(h => h.id === overId);
    if (fromIndex < 0 || toIndex < 0) return;
    persistHabits(arrayMove(allHabits, fromIndex, toIndex));
    dragRef.current = null;
    setDragOverId(null);
  };

  const onDragEndRow = () => {
    dragRef.current = null;
    setDragOverId(null);
  };

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

      {variant !== 'tab' && (
        <div className="flex h-[49px] items-center justify-between px-4 shrink-0"
          style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
          <h2 className="text-[16px] font-semibold" style={{ color: 'var(--assistant-text-soft)' }}>Habits</h2>
          <button type="button" onClick={requestClose} className={`h-8 w-8 rounded-lg ${classes.panelCloseBtn}`} aria-label="Close">
            ✕
          </button>
        </div>
      )}

      <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleAddHabit}
            className={`h-8 w-8 shrink-0 rounded-md ${classes.panelBtn}`} data-tip="New habit">
            +
          </button>
          <input
            value={draft}
            placeholder="New habit…"
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddHabit(); } }}
            className={`h-8 w-full rounded-md px-2 text-sm ${classes.panelInput}`}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* As a main tab there's room for two columns */}
        <div className={variant === 'tab' ? 'grid grid-cols-1 gap-x-8 gap-y-1 lg:grid-cols-2' : 'space-y-1'}>
          {habits.map(h => {
            const done = isDone(h);
            const isDraggingOver = dragOverId === h.id && dragRef.current?.id !== h.id;
            const isDraggingMe = dragRef.current?.id === h.id;
            return (
              <div
                key={h.id}
                draggable
                onDragStart={e => onDragStartRow(e, h.id)}
                onDragOver={e => onDragOverRow(e, h.id)}
                onDrop={e => onDropRow(e, h.id)}
                onDragEnd={onDragEndRow}
                className={[
                  'group flex items-center gap-2 px-0.5 py-1 rounded-md',
                  isDraggingOver ? classes.dragOver : '',
                  isDraggingMe ? 'opacity-60' : '',
                  newId === h.id ? 'wadu-line-in' : '',
                ].join(' ')}
              >
                <div className={`w-3 shrink-0 select-none opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing ${classes.dragHandle}`} data-tip="Drag">
                  <svg width="8" height="13" viewBox="0 0 8 13" fill="currentColor" aria-hidden="true">
                    <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
                    <circle cx="2" cy="6.5" r="1.2"/><circle cx="6" cy="6.5" r="1.2"/>
                    <circle cx="2" cy="11" r="1.2"/><circle cx="6" cy="11" r="1.2"/>
                  </svg>
                </div>
                <button
                  type="button"
                  onClick={() => toggleDone(h)}
                  className="check-glow h-4 w-4 rounded-full flex items-center justify-center shrink-0 transition-[transform,box-shadow] duration-150 ease-out group-hover:scale-[1.06]"
                >
                  <TaskCheckmark checked={done} />
                </button>
                <input
                  key={h.text}
                  defaultValue={h.text}
                  placeholder="Habit…"
                  onBlur={e => commitText(h, e.currentTarget)}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  className="w-full bg-transparent outline-none text-sm cursor-pointer transition-opacity duration-150"
                  style={{
                    color: done ? 'var(--assistant-text-faint)' : 'var(--assistant-text-soft)',
                    textDecoration: done ? 'line-through' : 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleUpdateHabit(h.id, { goalPeriod: h.goalPeriod === 'week' ? 'day' : 'week' })}
                  className={`shrink-0 text-[12px] px-2 py-1 rounded-full ${h.goalPeriod === 'week' ? classes.panelAccentBadge : classes.panelNeutralBadge}`}
                >
                  {h.goalPeriod === 'week' ? 'Weekly' : 'Daily'}
                </button>
                <button
                  type="button"
                  onClick={() => deleteHabitsLS([h.id])}
                  className="shrink-0 text-[12px] opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--assistant-text-faint)' }}
                  data-tip="Delete habit"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );

  if (variant === 'tab') {
    return <div className="flex h-full min-h-0 w-full min-w-0 flex-col">{body}</div>;
  }

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
