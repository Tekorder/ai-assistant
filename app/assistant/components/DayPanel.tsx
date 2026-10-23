'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  type Block,
  LS_KEY_V2,
  LS_KEY_V1,
  isValidDateYYYYMMDD,
  startOfLocalDay,
  parseYMD,
  readViewSources,
  VIEW_FILTER_EVENT,
  type ViewSource,
  writeSelectedProjectBlocks,
  isListVisible,
  isUncTitleBlock,
  addTaskUnderList as addTaskUnderListArr,
  removeTaskAndSubtasks,
  updateBlock,
  getTaskFlag,
  type TaskFlagColor,
} from '@/lib/datacenter';
import { TaskFlagBadge } from './TaskFlag';
import { useShowAllGroups } from '../_hook/useShowAllGroups';
import { useQuickFilters } from './QuickFiltersContext';
import classes from '@/app/assistant/_theme/themes.module.css';
import { TaskCheckmark } from './TaskCheckmark';

type CalCard = {
  id: string;
  listTitle: string;
  text: string;
  checked: boolean;
  deadline: string;
  /** The day the task sits on: its due date, or its creation date under "View by: Created" */
  day: string;
  isHidden?: boolean;
  archived?: boolean;
  flag?: TaskFlagColor;
};

type DayGroup = {
  listTitle: string;
  count: number;
  cards: CalCard[];
  listId: string;
};

type ListOption = {
  id: string;
  text: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  ymd: string;
  variant?: 'overlay' | 'dock';
  isLight?: boolean;
};

function dayDiff(ymd: string): number {
  const target = startOfLocalDay(parseYMD(ymd));
  const today = startOfLocalDay(new Date());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function pillColorForList(index: number, isLight = false): string {
  if (isLight) {
    const palettes = [
      'bg-sky-500/12 text-sky-700 border-sky-500/25',
      'bg-violet-500/12 text-violet-700 border-violet-500/25',
      'bg-rose-500/12 text-rose-700 border-rose-400/25',
      'bg-cyan-500/12 text-cyan-700 border-cyan-400/25',
      'bg-teal-500/12 text-teal-700 border-teal-500/25',
      'bg-fuchsia-500/12 text-fuchsia-700 border-fuchsia-500/25',
      'bg-indigo-500/12 text-indigo-700 border-indigo-500/25',
      'bg-orange-500/12 text-orange-700 border-orange-400/25',
    ];
    return palettes[index % palettes.length];
  }
  const palettes = [
    'bg-[#d5fc43]/15 text-[#d5fc43] border-[#d5fc43]/28',
    'bg-sky-500/15 text-sky-200 border-sky-400/25',
    'bg-[#d5fc43]/10 text-[#d5fc43] border-[#d5fc43]/22',
    'bg-violet-500/15 text-violet-200 border-violet-400/25',
    'bg-[#d5fc43]/12 text-[#d5fc43] border-[#d5fc43]/26',
    'bg-cyan-500/15 text-cyan-200 border-cyan-400/25',
    'bg-[#d5fc43]/8 text-[#d5fc43]/95 border-[#d5fc43]/18',
    'bg-emerald-500/12 text-emerald-200 border-emerald-400/25',
  ];
  return palettes[index % palettes.length];
}

export default function DayPanel({
  open,
  onClose,
  ymd,
  variant = 'overlay',
  isLight = false,
}: Props) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);

  // One entry per group shown: the selected group, or every group under "Show all"
  const [sources, setSources] = useState<ViewSource[]>([]);
  const [showAll] = useShowAllGroups();
  const blocks = useMemo(() => sources.flatMap(s => s.blocks), [sources]);
  // Same "View by" as Workspace and the Calendar: due date or creation date
  const { sortBy } = useQuickFilters();
  const byCreated = sortBy === 'createdAt';

  const dateRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newTaskListId, setNewTaskListId] = useState('');
  const [newTaskText, setNewTaskText] = useState('');
  const newTaskInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const load = () => setSources(readViewSources());
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY_V2 || e.key === LS_KEY_V1) load();
    };
    window.addEventListener('youtask_projects_updated', load);
    window.addEventListener('youtask_blocks_updated', load);
    window.addEventListener(VIEW_FILTER_EVENT, load);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('youtask_projects_updated', load);
      window.removeEventListener('youtask_blocks_updated', load);
      window.removeEventListener(VIEW_FILTER_EVENT, load);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

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

  const allCards = useMemo<CalCard[]>(() => {
    const out: CalCard[] = [];
    for (const { blocks: groupBlocks, visibleLists, title: groupTitle } of sources) {
      let currentListTitle = '';
      let currentListId: string | null = null;
      let currentListVisible = true;

      for (const b of groupBlocks) {
        if (b.indent === 0) {
          currentListTitle = (b.text || '').trim();
          currentListId = b.id;
          currentListVisible = isListVisible(visibleLists, b.id);
          continue;
        }
        if (b.indent !== 1) continue;
        if (currentListId && !currentListVisible) continue;
        if (b.archived) continue;
        if (!isValidDateYYYYMMDD(byCreated ? b.createdAt : b.deadline)) continue;
        const listTitle = currentListTitle || groupTitle || 'General';
        out.push({
          id: b.id,
          // Under "Show all" the group name leads, so same-named lists in different groups stay apart
          listTitle: showAll ? `${groupTitle} · ${listTitle}` : listTitle,
          text: b.text || '',
          checked: Boolean(b.checked),
          deadline: b.deadline ?? '',
          day: (byCreated ? b.createdAt : b.deadline)!,
          isHidden: b.isHidden === true,
          archived: b.archived,
          flag: getTaskFlag(b),
        });
      }
    }
    return out;
  }, [sources, showAll, byCreated]);

  const groups = useMemo<DayGroup[]>(() => {
    const cards = allCards.filter(c => c.day === ymd);
    const byList: Record<string, { title: string; cards: CalCard[] }> = {};
    const order: string[] = [];
    for (const c of cards) {
      const key = c.listTitle;
      if (!byList[key]) {
        byList[key] = { title: key, cards: [] };
        order.push(key);
      }
      byList[key].cards.push(c);
    }
    return order.map(k => ({
      listId: k,
      listTitle: byList[k].title,
      count: byList[k].cards.length,
      cards: byList[k].cards,
    }));
  }, [allCards, ymd]);

  const listOptions = useMemo<ListOption[]>(() => {
    const out: ListOption[] = [];
    for (const s of sources) {
      // Same-named lists dedupe within a group; across groups they're labeled by group
      const seen = new Set<string>();
      for (const b of s.blocks) {
        if (b.indent !== 0 || isUncTitleBlock(b) || b.archived) continue;
        // While a list is focused, new tasks can only go into that list
        if (s.focusListTitle && !isListVisible(s.visibleLists, b.id)) continue;
        const text = (b.text || '').trim();
        if (!text) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ id: b.id, text: showAll ? `${s.title} · ${text}` : text });
      }
    }
    return out;
  }, [sources, showAll]);

  useEffect(() => {
    if (!addOpen) return;
    if (!newTaskListId && listOptions.length) setNewTaskListId(listOptions[0].id);
    requestAnimationFrame(() => newTaskInputRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addOpen]);

  /** Applies `fn` to the group holding `blockId`, saves that group and updates the view. */
  const mutateHolding = (blockId: string, fn: (groupBlocks: Block[]) => Block[]) => {
    const src = sources.find(s => s.blocks.some(b => b.id === blockId));
    if (!src) return;
    const nextBlocks = fn(src.blocks);
    writeSelectedProjectBlocks(src.project_id, nextBlocks);
    setSources(prev => prev.map(s => (s === src ? { ...s, blocks: nextBlocks } : s)));
  };

  const handleToggleDone = (cardId: string) => {
    const card = blocks.find(b => b.id === cardId && b.indent === 1);
    if (!card) return;
    mutateHolding(cardId, bl => updateBlock(bl, cardId, { checked: !card.checked }));
  };

  const handleDelete = (cardId: string) => {
    mutateHolding(cardId, bl => removeTaskAndSubtasks(bl, cardId));
  };

  const handleReschedule = (cardId: string, newDeadline: string) => {
    if (!isValidDateYYYYMMDD(newDeadline)) return;
    // Rescheduling also un-hides the task
    mutateHolding(cardId, bl => bl.map(b => (
      b.id === cardId && b.indent === 1 ? { ...b, deadline: newDeadline, isHidden: false } : b
    )));
  };

  const handleAddTask = (listId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    mutateHolding(listId, bl => addTaskUnderListArr(bl, listId, { text: trimmed, deadline: ymd }).blocks);
  };

  const submitNewTask = () => {
    const text = newTaskText.trim();
    if (!text || !newTaskListId) return;
    handleAddTask(newTaskListId, text);
    setNewTaskText('');
    requestAnimationFrame(() => newTaskInputRef.current?.focus());
  };

  const openPicker = (id: string) => {
    const el = dateRefs.current[id];
    if (!el) return;
    try {
      (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      el.click();
    }
  };

  if (!shouldRender) return null;

  const diff = dayDiff(ymd);
  const dayLabel = (() => {
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff < 0) return `${Math.abs(diff)}d ago`;
    return `in ${diff}d`;
  })();

  const diffStyle = (() => {
    if (diff < 0) return { color: 'var(--assistant-danger-text)' };
    if (diff === 0) return { color: 'var(--assistant-tone-1)' };
    if (diff === 1) return { color: 'var(--assistant-tone-3)' };
    return { color: 'var(--assistant-text-soft)' };
  })();

  const allDayCards = groups.flatMap(g => g.cards);
  const doneCount = allDayCards.filter(c => c.checked).length;
  const totalCount = allDayCards.length;

  const panelAnim = isClosing
    ? 'dayPanelOut 0.24s cubic-bezier(0.4, 0, 1, 1) both'
    : 'dayPanelIn 0.46s cubic-bezier(0.22, 1, 0.36, 1) 0.16s both';

  const body = (
    <>
      <style>{`
        @keyframes dayPanelIn {
          from { transform: translateX(-34px); opacity: 0; filter: blur(1px); }
          60% { transform: translateX(3px); opacity: .92; filter: blur(0); }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes dayPanelOut {
          from { transform: translateX(0); opacity: 1; filter: blur(0); }
          to { transform: translateX(14px); opacity: 0; filter: blur(1px); }
        }
      `}</style>

      <div
        className="flex items-start justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}
      >
        <div className="min-w-0 pr-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[16px] font-semibold leading-none" style={{ color: 'var(--assistant-text-soft)' }}>
              {new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })}
            </span>
            <span
              className="text-[12px] font-semibold px-2 py-0.5 rounded-full"
              style={{ ...diffStyle, background: 'var(--assistant-control-bg)', border: '1px solid var(--assistant-border-soft)' }}
            >
              {dayLabel}
            </span>
          </div>
          <div className="text-[13px] mt-1" style={{ color: 'var(--assistant-text-muted)' }}>
            {new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1 rounded-full flex-1 overflow-hidden" style={{ background: 'var(--assistant-control-bg)' }}>
              <div
                className="h-full rounded-full bg-[#d5fc43]/85 transition-all duration-500 shadow-[0_0_12px_rgba(213,252,67,.25)]"
                style={{ width: totalCount ? `${(doneCount / totalCount) * 100}%` : '0%' }}
              />
            </div>
            <span className="text-[12px] shrink-0" style={{ color: 'var(--assistant-text-faint)' }}>
              {doneCount}/{totalCount}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={requestClose}
          className={`h-8 w-8 shrink-0 rounded-lg ${classes.panelCloseBtn}`}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {groups.length === 0 ? (
          <div className="text-center py-10 text-[14px]" style={{ color: 'var(--assistant-text-faint)' }}>
            No tasks for this day.
          </div>
        ) : (
          groups.map((group, gi) => (
            <div key={group.listId} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-full border ${pillColorForList(gi, isLight)}`}>
                  {group.listTitle}
                </span>
                <span className="text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>
                  {group.cards.length} task{group.cards.length !== 1 ? 's' : ''}
                </span>
              </div>

              {group.cards.map(card => (
                <div
                  key={card.id}
                  className="rounded-xl border transition-all duration-200"
                  style={{
                    background: 'var(--assistant-surface)',
                    borderColor: 'var(--assistant-border-soft)',
                    opacity: card.archived ? 0.4 : card.checked ? 0.6 : 1,
                  }}
                >
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="group flex items-start gap-2 min-w-0 flex-1">
                        {card.archived ? (
                          <span
                            className="mt-0.5 h-4 w-4 rounded flex items-center justify-center shrink-0 text-[10px]"
                            style={{ border: '1px solid var(--assistant-border-soft)', color: 'var(--assistant-text-faint)' }}
                          >
                            ▣
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleDone(card.id)}
                            className="check-glow relative mt-0.5 h-4 w-4 shrink-0 flex items-center justify-center rounded-full group-hover:scale-[1.06] transition-[transform,box-shadow]"
                            title={card.checked ? 'Mark pending' : 'Mark done'}
                          >
                            <TaskCheckmark checked={Boolean(card.checked)} />
                          </button>
                        )}

                        <span
                          className="text-[14px] leading-snug"
                          style={{
                            color: card.archived || card.checked ? 'var(--assistant-text-muted)' : 'var(--assistant-text)',
                            textDecoration: card.archived || card.checked ? 'line-through' : 'none',
                          }}
                        >
                          <TaskFlagBadge source={{ flag: card.flag }} inline />
                          {card.text || '(no text)'}
                        </span>
                      </div>

                      {!card.archived && (
                        <div className="shrink-0 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openPicker(card.id)}
                            className="text-[15px] opacity-40 hover:opacity-90 transition-opacity"
                            title="Reschedule"
                          >
                            📅
                          </button>
                          <input
                            ref={el => void (dateRefs.current[card.id] = el)}
                            type="date"
                            className="hidden"
                            value={isValidDateYYYYMMDD(card.deadline) ? card.deadline : ''}
                            onChange={e => {
                              if (e.target.value) handleReschedule(card.id, e.target.value);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(card.id)}
                            className="text-[15px] opacity-40 hover:opacity-90 transition-opacity"
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                      {card.archived && (
                        <span className="text-[10px] shrink-0" style={{ color: 'var(--assistant-text-faint)' }}>
                          archived
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      <div className="shrink-0 px-4 py-3" style={{ borderTop: '1px solid var(--assistant-border-soft)' }}>
        {addOpen ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <select
                value={newTaskListId}
                onChange={e => setNewTaskListId(e.target.value)}
                className="text-[13px] rounded-lg px-2 py-2 flex-1 min-w-0"
                style={{
                  background: 'var(--assistant-control-bg)',
                  border: '1px solid var(--assistant-border-soft)',
                  color: 'var(--assistant-text)',
                }}
              >
                {listOptions.length === 0 && <option value="">No lists</option>}
                {listOptions.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.text}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setAddOpen(false);
                  setNewTaskText('');
                }}
                className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-lg transition-colors ${classes.panelBtn}`}
                title="Cancel"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={newTaskInputRef}
                type="text"
                value={newTaskText}
                onChange={e => setNewTaskText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitNewTask();
                  }
                  if (e.key === 'Escape') {
                    setAddOpen(false);
                    setNewTaskText('');
                  }
                }}
                placeholder="Task name…"
                className="text-[14px] rounded-lg px-3 py-2 flex-1 min-w-0"
                style={{
                  background: 'var(--assistant-surface)',
                  border: '1px solid var(--assistant-border-soft)',
                  color: 'var(--assistant-text)',
                }}
              />
              <button
                type="button"
                onClick={submitNewTask}
                disabled={!newTaskText.trim() || !newTaskListId}
                className="text-[13px] font-semibold px-3 py-2 rounded-lg shrink-0 transition-opacity disabled:opacity-40"
                style={{ color: '#0a0a0a', background: '#d5fc43' }}
              >
                Add
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="w-full text-[14px] font-semibold px-3 py-2.5 rounded-xl transition-all hover:scale-[1.01] flex items-center justify-center gap-1.5"
            style={{
              color: 'var(--assistant-tone-1)',
              border: '1px solid color-mix(in srgb, var(--assistant-tone-1) 40%, transparent)',
              background:
                'linear-gradient(135deg, color-mix(in srgb, var(--assistant-tone-1) 16%, transparent) 0%, color-mix(in srgb, var(--assistant-tone-1) 8%, transparent) 100%)',
            }}
          >
            <span className="text-[16px] leading-none">+</span> Add task
          </button>
        )}
      </div>

      {deleteConfirmId && (
        <div className="fixed inset-0 z-300 flex items-center justify-center p-5">
          <button
            type="button"
            className="fixed inset-0"
            style={{ background: 'var(--assistant-overlay)' }}
            onClick={() => setDeleteConfirmId(null)}
            aria-label="Cancel"
          />
          <div
            className="relative z-10 w-full max-w-[320px] rounded-2xl p-4 shadow-2xl"
            style={{
              background: 'var(--assistant-bg)',
              color: 'var(--assistant-text)',
              border: '1px solid var(--assistant-border-soft)',
            }}
          >
            <h3 className="text-[15px] font-semibold mb-1.5">Delete task?</h3>
            <p className="text-[13px] mb-4" style={{ color: 'var(--assistant-text-soft)' }}>
              This can&apos;t be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="text-[13px] px-3 py-2 rounded-lg"
                style={{ color: 'var(--assistant-text-muted)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDelete(deleteConfirmId);
                  setDeleteConfirmId(null);
                }}
                className="text-[13px] px-3 py-2 rounded-lg bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

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
      <button
        type="button"
        className="fixed inset-0 z-200 bg-black/50"
        onClick={requestClose}
        aria-label="Close day panel"
        style={{
          animation: isClosing ? 'dayOverlayOut 0.2s ease-out both' : 'dayOverlayIn 0.22s ease-out both',
        }}
      />
      <div
        className={`fixed right-3 top-3 z-201 flex h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] max-w-md flex-col overflow-hidden rounded-2xl ${classes.panelGlass} ${classes.panelOverlay}`}
        style={{ color: 'var(--assistant-text)', animation: panelAnim }}
      >
        <style>{`
          @keyframes dayOverlayIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes dayOverlayOut { from { opacity: 1; } to { opacity: 0; } }
        `}</style>
        {body}
      </div>
    </>
  );
}
