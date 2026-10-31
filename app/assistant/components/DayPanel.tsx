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
  formatPill,
  isRecurringTask,
  recurringShowsOn,
  isOccurrenceDone,
  toggleOccurrence,
  repeatDaysLabel,
  type TaskFlagColor,
  type TaskNoteEntry,
} from '@/lib/datacenter';
import { TaskRepeatModal } from './TaskRepeat';
import { TaskFlagButton } from './TaskFlag';
import { TaskNoteButton, TaskNoteModal } from './TaskNote';
import { TaskRowMenu } from './TaskRowMenu';
import { useShowAllGroups } from '../_hook/useShowAllGroups';
import { useQuickFilters } from './QuickFiltersContext';
import classes from '@/app/assistant/_theme/themes.module.css';
import { AgendaListHeader, AgendaListTitle, AgendaTaskRow, AgendaCheck, AgendaTaskText, AgendaDate, AgendaMenuButton } from './AgendaList';

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
  notes?: TaskNoteEntry[];
  createdAt?: string;
  dueTime?: string;
  repeatDays?: number[];
  doneDates?: string[];
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
  /** Weekday, "Nd ago" and date on one line, in a 49px header like the other panels */
  oneLineHeader?: boolean;
};

function dayDiff(ymd: string): number {
  const target = startOfLocalDay(parseYMD(ymd));
  const today = startOfLocalDay(new Date());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}


export default function DayPanel({
  open,
  onClose,
  ymd,
  variant = 'overlay',
  oneLineHeader = false,
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
        if (b.indent !== 1 || b.section) continue;
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
          notes: b.notes,
          createdAt: b.createdAt,
          dueTime: b.dueTime,
          repeatDays: b.repeatDays,
          doneDates: b.doneDates,
        });
      }
    }
    return out;
  }, [sources, showAll, byCreated]);

  const groups = useMemo<DayGroup[]>(() => {
    // A recurring task shows on each of its days, done or open per day (not under "View by: Created")
    const cards = allCards.flatMap(c => {
      if (!byCreated && isRecurringTask(c)) {
        return recurringShowsOn(c, ymd) ? [{ ...c, deadline: ymd, checked: isOccurrenceDone(c, ymd) }] : [];
      }
      return c.day === ymd ? [c] : [];
    });
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
  }, [allCards, ymd, byCreated]);

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
    // A recurring task is done per day — this panel's day
    if (!byCreated && isRecurringTask(card)) {
      mutateHolding(cardId, bl => bl.map(b => (b.id === cardId ? toggleOccurrence(b, ymd) : b)));
      return;
    }
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

  const patchTask = (cardId: string, patch: Partial<Block>) =>
    mutateHolding(cardId, bl => bl.map(b => (b.id === cardId && b.indent === 1 ? { ...b, ...patch } : b)));

  // ⋮ menu of a task row (same menu as Agenda, minus in-place edit and reminders)
  const [taskMenu, setTaskMenu] = useState<{ cardId: string; x: number; y: number } | null>(null);
  const [noteCardId, setNoteCardId] = useState<string | null>(null);
  const [repeatCardId, setRepeatCardId] = useState<string | null>(null);

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

      {oneLineHeader ? (
        // Same 49px header as the other panels, always one row
        <div
          className="flex min-h-[49px] items-center justify-between gap-2 px-4 py-1.5 shrink-0"
          style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}
        >
          {/* One row: never wraps. @container lets the date scale to the room left (cqw) */}
          <div className="@container flex min-w-0 flex-1 flex-nowrap items-center gap-2 whitespace-nowrap">
            <span className="text-[16px] font-semibold leading-none" style={{ color: 'var(--assistant-text-soft)' }}>
              {new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })}
            </span>
            <span
              className="shrink-0 text-[12px] font-semibold px-2 py-0.5 rounded-full"
              style={{ ...diffStyle, background: 'var(--assistant-control-bg)', border: '1px solid var(--assistant-border-soft)' }}
            >
              {dayLabel}
            </span>
            {/* Full size (13px) with room to spare; shrinks down to 10px in a narrow panel */}
            <span style={{ color: 'var(--assistant-text-muted)', fontSize: 'clamp(10px, 4cqw, 13px)' }}>
              {formatPill(ymd)}
            </span>
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
      ) : (
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
            {formatPill(ymd)}
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
      )}

      {/* Same list layout as Agenda: list title + rule, then task rows */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {groups.length === 0 ? (
          <div className="text-center py-10 text-[14px]" style={{ color: 'var(--assistant-text-faint)' }}>
            No tasks for this day.
          </div>
        ) : (
          <div className="space-y-1">
            {groups.map(group => (
              <React.Fragment key={group.listId}>
                <AgendaListHeader heading={<AgendaListTitle>{group.listTitle}</AgendaListTitle>} />
                {group.cards.map(card => (
                  <AgendaTaskRow
                    key={card.id}
                    style={card.archived ? { opacity: 0.5 } : undefined}
                    check={
                      <AgendaCheck
                        checked={card.checked}
                        onToggle={card.archived ? undefined : () => handleToggleDone(card.id)}
                      />
                    }
                    right={
                      card.archived ? (
                        <span className="shrink-0 text-[11px] leading-[1.45rem]" style={{ color: 'var(--assistant-text-faint)' }}>archived</span>
                      ) : (
                        <>
                          {card.flag ? (
                            <TaskFlagButton source={{ flag: card.flag }} onChange={next => patchTask(card.id, { flag: next, priority: undefined })} />
                          ) : null}
                          {card.notes?.length ? (
                            <TaskNoteButton task={card} onChange={notes => patchTask(card.id, { notes })} />
                          ) : null}
                          <AgendaMenuButton
                            open={taskMenu?.cardId === card.id}
                            onOpen={r => setTaskMenu(prev => (prev?.cardId === card.id ? null : { cardId: card.id, x: r.right, y: r.bottom + 4 }))}
                          />
                        </>
                      )
                    }
                  >
                    <AgendaTaskText checked={card.checked || Boolean(card.archived)}>{card.text || '(no text)'}</AgendaTaskText>
                    <AgendaDate
                      ymd={card.deadline}
                      time={card.dueTime}
                      repeatDays={card.repeatDays}
                      onClick={card.archived ? undefined : () => openPicker(card.id)}
                      onRepeatClick={card.archived ? undefined : () => setRepeatCardId(card.id)}
                    />
                    {/* Native picker behind the date (and the menu's "Change due date") */}
                    <input
                      ref={el => void (dateRefs.current[card.id] = el)}
                      type="date"
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden="true"
                      value={isValidDateYYYYMMDD(card.deadline) ? card.deadline : ''}
                      onChange={e => {
                        if (e.target.value) handleReschedule(card.id, e.target.value);
                      }}
                    />
                  </AgendaTaskRow>
                ))}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {(() => {
        const card = taskMenu ? allCards.find(c => c.id === taskMenu.cardId) : undefined;
        return taskMenu && card ? (
          <TaskRowMenu
            x={taskMenu.x}
            y={taskMenu.y}
            createdAt={card.createdAt}
            flag={card.flag}
            hasNote={Boolean(card.notes?.length)}
            hasDueDate={isValidDateYYYYMMDD(card.deadline)}
            repeatLabel={repeatDaysLabel(card.repeatDays)}
            onDueDate={() => openPicker(card.id)}
            onRepeat={() => setRepeatCardId(card.id)}
            onFlag={flag => patchTask(card.id, { flag, priority: undefined })}
            onNote={() => setNoteCardId(card.id)}
            onDelete={() => setDeleteConfirmId(card.id)}
            onClose={() => setTaskMenu(null)}
          />
        ) : null;
      })()}
      {(() => {
        const card = noteCardId ? allCards.find(c => c.id === noteCardId) : undefined;
        return card ? (
          <TaskNoteModal task={card} onChange={notes => patchTask(card.id, { notes })} onClose={() => setNoteCardId(null)} />
        ) : null;
      })()}
      {(() => {
        // The task itself, not the per-day copy — the modal edits the real date
        const card = repeatCardId ? allCards.find(c => c.id === repeatCardId) : undefined;
        return card ? (
          <TaskRepeatModal task={card} onSave={patch => patchTask(card.id, patch)} onClose={() => setRepeatCardId(null)} />
        ) : null;
      })()}

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
            className={`fixed inset-0 ${classes.modalBackdrop}`}
            onClick={() => setDeleteConfirmId(null)}
            aria-label="Cancel"
          />
          <div
            role="alertdialog"
            className={`relative z-10 w-full max-w-[320px] p-6 ${classes.modalCard}`}
          >
            <h3 className={`mb-2 ${classes.modalTitle}`}>Delete task?</h3>
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
                className={`text-[13px] font-medium px-3 py-2 rounded-lg ${classes.panelBtnDanger}`}
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
