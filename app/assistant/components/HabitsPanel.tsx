'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  type HabitBlock,
  type HabitsPayload,
  LS_KEY_HABITS,
  arrayMove,
  makeDefaultHabit,
  ensureOneHabit,
  readHabitsLS,
  writeHabitsLS,
  applyHabitResets,
  forceResetHabits,
  insertHabitAfter as insertHabitAfterArr,
  removeHabit as removeHabitArr,
  updateHabit as updateHabitArr,
} from '@/lib/datacenter';

type Props = {
  open: boolean;
  onClose: () => void;
  /** `dock` = flex column like Sidebar (pushes main). `overlay` = fixed sheet (mobile). */
  variant?: 'overlay' | 'dock';
};

/** Sin capa de fondo propia: el gradiente vive en app/assistant/page.tsx */
const panelGlass: React.CSSProperties = {
  background: 'rgba(8,8,8,0.42)',
  backdropFilter: 'blur(16px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
  border: '1px solid color-mix(in srgb, var(--assistant-tone-1, #52b352) 50%, transparent)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06), 0 6px 16px rgba(0,0,0,.14)',
};

export default function HabitsPanel({ open, onClose, variant = 'overlay' }: Props) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);
  const [habits, setHabits] = useState<HabitBlock[]>([makeDefaultHabit()]);
  const [habitsMeta, setHabitsMeta] = useState<{ lastDaily?: string; lastWeekly?: string }>({});
  const habitInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [newId, setNewId] = useState<string | null>(null);
  const newTimerRef = useRef<number | null>(null);
  const dragRef = useRef<{ id: string; fromIndex: number } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      const raw = readHabitsLS();
      const payload = applyHabitResets(raw);
      const next = ensureOneHabit(payload.habits);
      setHabits(next);
      setHabitsMeta({ lastDaily: payload.lastDailyResetYMD, lastWeekly: payload.lastWeeklyResetYMD });
      const needWrite =
        raw.lastDailyResetYMD !== payload.lastDailyResetYMD ||
        raw.lastWeeklyResetYMD !== payload.lastWeeklyResetYMD ||
        JSON.stringify(raw.habits) !== JSON.stringify(next);
      if (needWrite) writeHabitsLS({ ...payload, habits: next });
    };
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY_HABITS) load();
    };
    window.addEventListener('youtask_habits_updated', load);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('youtask_habits_updated', load);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

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

  const focusHabit = (id: string, caretToEnd = false) => {
    requestAnimationFrame(() => {
      const el = habitInputRefs.current[id];
      if (!el) return;
      el.focus();
      if (caretToEnd) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } else el.setSelectionRange(0, 0);
    });
  };

  const triggerNewLineAnim = (id: string) => {
    setNewId(id);
    if (newTimerRef.current) window.clearTimeout(newTimerRef.current);
    newTimerRef.current = window.setTimeout(() => setNewId(null), 220);
  };

  const persistHabits = (next: HabitBlock[], metaOverride?: Partial<HabitsPayload>) => {
    setHabits(next);
    writeHabitsLS({
      habits: next,
      lastDailyResetYMD: metaOverride?.lastDailyResetYMD ?? habitsMeta.lastDaily,
      lastWeeklyResetYMD: metaOverride?.lastWeeklyResetYMD ?? habitsMeta.lastWeekly,
    });
  };

  const handleAddHabit = () => {
    const next = makeDefaultHabit();
    persistHabits([...habits, next]);
    focusHabit(next.id, false);
  };

  const handleUpdateHabit = (id: string, patch: Partial<HabitBlock>) => {
    persistHabits(updateHabitArr(habits, id, patch));
  };

  const handleRemoveHabit = (id: string) => {
    const result = removeHabitArr(habits, id);
    persistHabits(result.habits);
    focusHabit(result.focusId, result.habits.length === 1);
  };

  const handleInsertHabitAfter = (id: string) => {
    const result = insertHabitAfterArr(habits, id);
    persistHabits(result.habits);
    triggerNewLineAnim(result.newHabit.id);
    focusHabit(result.newHabit.id, false);
  };

  const handleForceResetHabits = () => {
    const payload = forceResetHabits(habits, { lastDaily: habitsMeta.lastDaily, lastWeekly: habitsMeta.lastWeekly });
    setHabitsMeta({ lastDaily: payload.lastDailyResetYMD, lastWeekly: payload.lastWeeklyResetYMD });
    persistHabits(payload.habits, payload);
  };

  const handleHabitKey = (e: React.KeyboardEvent<HTMLInputElement>, h: HabitBlock) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInsertHabitAfter(h.id);
      return;
    }
    if (e.key === 'Backspace' && h.text === '') {
      e.preventDefault();
      handleRemoveHabit(h.id);
    }
  };

  const onDragStartRow = (e: React.DragEvent, id: string, index: number) => {
    dragRef.current = { id, fromIndex: index };
    setDragOverId(id);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', id);
    } catch {}
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
    const toIndex = habits.findIndex(h => h.id === overId);
    if (toIndex < 0) return;
    const next = arrayMove(habits, drag.fromIndex, toIndex);
    persistHabits(next);
    dragRef.current = null;
    setDragOverId(null);
  };

  const onDragEndRow = () => {
    dragRef.current = null;
    setDragOverId(null);
  };

  if (!shouldRender) return null;

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

        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] shrink-0">
          <h2 className="text-[15px] font-semibold text-white/90">Habits</h2>
          <button
            type="button"
            onClick={requestClose}
            className="h-8 w-8 rounded-lg text-white/50 hover:text-white hover:bg-white/12 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-3 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAddHabit}
                className="h-8 w-8 shrink-0 rounded-md bg-white/10 text-white/80 hover:text-white hover:bg-white/16 transition-all"
                title="New habit"
              >
                +
              </button>
              <button
                type="button"
                onClick={handleForceResetHabits}
                className="text-[11px] px-2 py-1 rounded-md bg-white/10 text-white/60 hover:text-white/80 hover:bg-white/16 transition-colors"
                title="Reset now"
              >
                Reset
              </button>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-white/35">
            Daily reset: {habitsMeta.lastDaily || '—'} · Weekly reset (Monday): {habitsMeta.lastWeekly || '—'}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-1">
            {habits.map((h, idx) => {
              const isDraggingOver = dragOverId === h.id && dragRef.current?.id !== h.id;
              const isDraggingMe = dragRef.current?.id === h.id;
              return (
                <div
                  key={h.id}
                  draggable
                  onDragStart={e => onDragStartRow(e, h.id, idx)}
                  onDragOver={e => onDragOverRow(e, h.id)}
                  onDrop={e => onDropRow(e, h.id)}
                  onDragEnd={onDragEndRow}
                  className={[
                    'group flex items-center gap-2 px-0.5 py-1 rounded-md',
                    isDraggingOver ? 'bg-white/7 outline outline-1 outline-white/10' : '',
                    isDraggingMe ? 'opacity-60' : '',
                    newId === h.id ? 'wadu-line-in' : '',
                  ].join(' ')}
                >
                  <div className="w-3 shrink-0 text-white/20 select-none opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" title="Drag">
                    ⋮⋮
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUpdateHabit(h.id, { checked: !h.checked })}
                    className={[
                      'h-4 w-4 rounded flex items-center justify-center shrink-0 transition-[transform,background-color] duration-150 ease-out group-hover:scale-[1.06]',
                      h.checked ? 'bg-[#52b352]/28' : 'bg-white/10',
                    ].join(' ')}
                  >
                    {h.checked ? <span className="text-[#52b352] text-xs">✓</span> : null}
                  </button>
                  <input
                    ref={el => void (habitInputRefs.current[h.id] = el)}
                    value={h.text}
                    placeholder="Habit…"
                    onChange={e => handleUpdateHabit(h.id, { text: e.target.value })}
                    onKeyDown={e => handleHabitKey(e, h)}
                    className={[
                      'w-full bg-transparent outline-none text-sm cursor-pointer transition-opacity duration-150',
                      h.checked ? 'text-white/40 line-through' : 'text-white/80',
                    ].join(' ')}
                  />
                  <button
                    type="button"
                    onClick={() => handleUpdateHabit(h.id, { weekly: !h.weekly })}
                    className={[
                      'shrink-0 text-[11px] px-2 py-1 rounded-full transition-colors',
                      h.weekly
                        ? 'bg-[#52b352]/20 text-[#52b352]'
                        : 'bg-white/8 text-white/40 hover:text-white/60 hover:bg-white/12',
                    ].join(' ')}
                  >
                    {h.weekly ? 'Weekly' : 'Daily'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
    </>
  );

  if (variant === 'dock') {
    return (
      <div
        className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl text-white"
        style={{
          ...panelGlass,
          animation: isClosing
            ? 'habitsPanelOut 0.24s cubic-bezier(0.4, 0, 1, 1) both'
            : 'habitsPanelIn 0.46s cubic-bezier(0.22, 1, 0.36, 1) 0.16s both',
        }}
      >
        {body}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[200] bg-black/50"
        onClick={requestClose}
        aria-label="Close habits"
        style={{
          animation: isClosing
            ? 'habitsOverlayOut 0.2s ease-out both'
            : 'habitsOverlayIn 0.22s ease-out both',
        }}
      />
      <div
        className="fixed right-3 top-3 z-[201] flex h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] max-w-md flex-col overflow-hidden rounded-2xl text-white"
        style={{
          animation: isClosing
            ? 'habitsPanelOut 0.24s cubic-bezier(0.4, 0, 1, 1) both'
            : 'habitsPanelIn 0.46s cubic-bezier(0.22, 1, 0.36, 1) 0.16s both',
          ...panelGlass,
        }}
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
