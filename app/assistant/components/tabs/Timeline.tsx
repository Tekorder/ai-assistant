'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  // Types
  type Block,
  // Constants
  LS_KEY_V2,
  LS_KEY_V1,
  // Utilities
  isValidDateYYYYMMDD,
  startOfLocalDay,
  todayYMD,
  toYMD,
  parseYMD,
  fmtColTitle,
  // Persistence
  readViewSources,
  VIEW_FILTER_EVENT,
  type ViewSource,
  writeSelectedProjectBlocks,
  isListVisible,
  getTaskFlag,
  addTaskUnderList,
  removeTaskAndSubtasks,
  updateBlock,
  type TaskFlagColor,
  type TaskNoteEntry,
} from '@/lib/datacenter';
import { TaskFlagIcon } from '../TaskFlag';
import { TaskNoteButton } from '../TaskNote';
import { DatePickerModal } from '../DatePickerModal';
import { useShowAllGroups } from '../../_hook/useShowAllGroups';
import { TaskCheckmark } from '../TaskCheckmark';
import classes from '@/app/assistant/_theme/themes.module.css';

/* ===================== Local UI types (no van a datacenter) ===================== */

type SubTask = {
  id: string;
  text: string;
  checked: boolean;
};

type Card = {
  id: string;
  listId: string | null;
  projectTitle: string;
  text: string;
  checked: boolean;
  deadline: string;
  subtasks: SubTask[];
  isHidden?: boolean;
  archived?: boolean;
  flag?: TaskFlagColor;
  notes?: TaskNoteEntry[];
};

/* ===================== Constants ===================== */

const OVERDUE_KEY = '__OVERDUE__';

/* ===================== Helpers (UI-only, no pertenecen a datacenter) ===================== */

function dayDiffFromToday(ymd: string): number {
  const target = startOfLocalDay(parseYMD(ymd));
  const today = startOfLocalDay(new Date());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}



function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function isDateWithinRange(ymd: string, fromYMD: string, toYMD: string): boolean {
  return ymd >= fromYMD && ymd <= toYMD;
}

/** Splits a column's (list-sorted) cards into consecutive runs of the same list. */
function groupByList(cards: Card[]): { listId: string | null; title: string; cards: Card[] }[] {
  const groups: { listId: string | null; title: string; cards: Card[] }[] = [];
  for (const c of cards) {
    const last = groups[groups.length - 1];
    if (last && last.listId === c.listId) last.cards.push(c);
    else groups.push({ listId: c.listId, title: c.projectTitle, cards: [c] });
  }
  return groups;
}

/* ===================== Row menu (⋮) ===================== */

const FLAG_CHOICES: TaskFlagColor[] = ['blue', 'yellow', 'red'];

function RowMenu({
  x,
  y,
  flag,
  onFlag,
  onReschedule,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  flag?: TaskFlagColor;
  onFlag: (flag: TaskFlagColor | undefined) => void;
  onReschedule: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Anchor the menu's right edge to the button, clamped inside the viewport.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.min(x - rect.width, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [x, y]);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  const item = (label: string, action: () => void, danger = false) => (
    <button
      type="button"
      role="menuitem"
      className={['yt-menu-item', danger ? 'is-danger' : ''].join(' ')}
      onClick={() => {
        action();
        onClose();
      }}
    >
      {label}
    </button>
  );

  return (
    <div ref={ref} className="yt-menu" style={{ left: pos.left, top: pos.top }} role="menu">
      {item('Reschedule', onReschedule)}
      {/* Flag: ⊘ clears it, then the colors (the active one is ringed) — same as Agenda's menu */}
      <div className="flex items-center gap-1 px-3 py-1.5" role="group" aria-label="Flag">
        <span className="flex-1 pr-2" style={{ color: 'var(--assistant-text)' }}>Flag</span>
        <button
          type="button"
          role="menuitemradio"
          aria-checked={!flag}
          aria-label="No flag"
          title="No flag"
          onClick={() => { onFlag(undefined); onClose(); }}
          className="grid h-6 w-6 place-items-center rounded-md text-[13px] transition-colors hover:bg-[var(--assistant-hover-bg)]"
          style={{ color: 'var(--assistant-text-faint)', boxShadow: !flag ? 'inset 0 0 0 1px var(--assistant-border-soft)' : undefined }}
        >
          ⊘
        </button>
        {FLAG_CHOICES.map(c => (
          <button
            key={c}
            type="button"
            role="menuitemradio"
            aria-checked={flag === c}
            aria-label={`${c} flag`}
            title={`${c[0].toUpperCase()}${c.slice(1)} flag`}
            onClick={() => { onFlag(flag === c ? undefined : c); onClose(); }}
            className="grid h-6 w-6 place-items-center rounded-md transition-colors hover:bg-[var(--assistant-hover-bg)]"
            style={flag === c ? { boxShadow: 'inset 0 0 0 1px var(--assistant-accent)' } : undefined}
          >
            <TaskFlagIcon color={c} className="h-3.5 w-3.5" glow={false} />
          </button>
        ))}
      </div>
      {item('Delete', onDelete, true)}
    </div>
  );
}

/* ===================== Component ===================== */

export default function Timeline() {
  // One entry per group shown: the selected group, or every group under "Show all"
  const [sources, setSources] = useState<ViewSource[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [showAll] = useShowAllGroups();
  const [showCompleted, setShowCompleted] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => monthStart(new Date()));
  const [rescheduleCardId, setRescheduleCardId] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<{ cardId: string; x: number; y: number } | null>(null);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [editingTextCardId, setEditingTextCardId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');
  const [newTask, setNewTask] = useState<{ text: string; listId: string; deadline: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const inlineTextRefs = useRef<Record<string, HTMLInputElement | null>>({});

  /* ── Load & sync ── */
  useEffect(() => {
    const load = () => {
      setSources(readViewSources());
      setHydrated(true);
    };

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

  const blocks = useMemo(() => sources.flatMap(s => s.blocks), [sources]);
  const headerTitle = sources[0]?.focusListTitle
    ? `${sources[0].title} › ${sources[0].focusListTitle}`
    : showAll ? 'All groups' : (sources[0]?.title || 'Group');

  /** Applies `fn` to the group holding `blockId`, saves that group and updates the view. */
  const mutateHolding = (blockId: string, fn: (groupBlocks: Block[]) => Block[]) => {
    const src = sources.find(s => s.blocks.some(b => b.id === blockId));
    if (!src) return;
    const nextBlocks = fn(src.blocks);
    writeSelectedProjectBlocks(src.project_id, nextBlocks);
    setSources(prev => prev.map(s => (s === src ? { ...s, blocks: nextBlocks } : s)));
  };

  /* ── Cuando entras a Show Completed, cae al mes actual ── */
  useEffect(() => {
    if (showCompleted) {
      setVisibleMonth(monthStart(new Date()));
    }
  }, [showCompleted]);

  /* ── Build cards ── */
  const cards = useMemo<Card[]>(() => {
    const out: Card[] = [];
    for (const { blocks, visibleLists, title: projectTitle } of sources) {
    let currentSectionTitle = '';
    let currentSectionId: string | null = null;
    let currentSectionVisible = true;

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];

      if (b.indent === 0) {
        currentSectionTitle = (b.text || '').trim();
        currentSectionId = b.id;
        currentSectionVisible = isListVisible(visibleLists, b.id);
        continue;
      }

      if (b.indent !== 1 || b.section) continue;
      if (currentSectionId && !currentSectionVisible) continue;
      if (!isValidDateYYYYMMDD(b.deadline)) continue;
      if (b.archived === true) continue;

      const checked = Boolean(b.checked);
      const isHidden = b.isHidden === true;

      if (!showCompleted && (checked || isHidden)) continue;

      const subtasks: SubTask[] = [];
      let j = i + 1;
      while (j < blocks.length && blocks[j].indent > 1) {
        const sb = blocks[j];
        if (sb.archived !== true) {
          subtasks.push({
            id: sb.id,
            text: sb.text || '',
            checked: Boolean(sb.checked),
          });
        }
        j++;
      }

      const listTitle = currentSectionTitle || projectTitle || 'General';
      out.push({
        id: b.id,
        listId: currentSectionId,
        // Under "Show all" the group name leads, so same-named lists in different groups read apart
        projectTitle: showAll ? `${projectTitle} · ${listTitle}` : listTitle,
        text: b.text || '',
        checked,
        deadline: b.deadline!,
        subtasks,
        isHidden,
        archived: false,
        flag: getTaskFlag(b),
        notes: b.notes,
      });
    }
    }

    return out;
  }, [sources, showCompleted, showAll]);

  /* ── Range normal (modo timeline clásico) ── */
  const normalRange = useMemo(() => {
    const deadlines = cards.map(c => c.deadline).filter(isValidDateYYYYMMDD);
    if (!deadlines.length) return null;

    deadlines.sort();
    const t = todayYMD();
    const max = deadlines[deadlines.length - 1];

    return {
      min: t,
      max: max < t ? t : max,
    };
  }, [cards]);

  /* ── Rango del mes seleccionado para Show Completed ── */
  const completedMonthRange = useMemo(() => {
    const from = toYMD(monthStart(visibleMonth));
    const to = toYMD(monthEnd(visibleMonth));
    return { from, to };
  }, [visibleMonth]);

  /* ── Cards by column ── */
  const cardsByDate = useMemo(() => {
    const map: Record<string, Card[]> = {};
    const t0 = startOfLocalDay(new Date()).getTime();

    for (const c of cards) {
      if (showCompleted) {
        if (!isDateWithinRange(c.deadline, completedMonthRange.from, completedMonthRange.to)) {
          continue;
        }

        const key = c.deadline;
        if (!map[key]) map[key] = [];
        map[key].push(c);
        continue;
      }

      const cd = startOfLocalDay(parseYMD(c.deadline)).getTime();
      const key = cd < t0 ? OVERDUE_KEY : c.deadline;
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }

    // Always grouped by list (title, then id so same-named lists stay apart);
    // inside a list: overdue by date, Show Completed puts done tasks last
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        const byList = (a.projectTitle || '').localeCompare(b.projectTitle || '')
          || (a.listId || '').localeCompare(b.listId || '');
        if (byList) return byList;
        if (!showCompleted && k === OVERDUE_KEY) return a.deadline.localeCompare(b.deadline);
        if (showCompleted && a.checked !== b.checked) return a.checked ? 1 : -1;
        return 0;
      });
    }

    return map;
  }, [cards, showCompleted, completedMonthRange]);

  const overdueCount = useMemo(
    () => (showCompleted ? 0 : (cardsByDate[OVERDUE_KEY]?.length ?? 0)),
    [cardsByDate, showCompleted],
  );

  /* ── Columns ── */
  const columns = useMemo(() => {
    if (showCompleted) {
      return Object.keys(cardsByDate)
        .filter(k => k !== OVERDUE_KEY)
        .sort((a, b) => a.localeCompare(b));
    }

    // Non-completed: only show columns that actually have cards (skip empty dates).
    // Always keep OVERDUE_KEY first, then future dates sorted ascending.
    const dateKeys = Object.keys(cardsByDate)
      .filter(k => k !== OVERDUE_KEY && (cardsByDate[k]?.length ?? 0) > 0)
      .sort((a, b) => a.localeCompare(b));

    const hasOverdue = (cardsByDate[OVERDUE_KEY]?.length ?? 0) > 0;
    return hasOverdue ? [OVERDUE_KEY, ...dateKeys] : dateKeys;
  }, [showCompleted, cardsByDate]);

  const listOptions = useMemo(
    () =>
      sources.flatMap(s =>
        s.blocks
          // While a list is focused, new tasks can only go into that list
          .filter(b => b.indent === 0 && b.archived !== true && (!s.focusListTitle || isListVisible(s.visibleLists, b.id)))
          .map(b => {
            const title = (b.text || '').trim() || 'Uncategorized';
            return { id: b.id, title: showAll ? `${s.title} · ${title}` : title };
          }),
      ),
    [sources, showAll],
  );

  const nowMonth = useMemo(() => monthStart(new Date()), []);

  const canGoNextMonth = useMemo(() => {
    return monthStart(visibleMonth).getTime() < nowMonth.getTime();
  }, [visibleMonth, nowMonth]);



  /* ── Actions ── */
  const toggleDone = (cardId: string) => {
    // Tasks and subtasks alike; updateBlock cascades the check to parents/children
    const card = blocks.find(b => b.id === cardId && b.indent > 0);
    if (!card) return;
    mutateHolding(cardId, bl => updateBlock(bl, cardId, { checked: !card.checked }));
  };

  const patchTask = (cardId: string, patch: Partial<Block>) =>
    mutateHolding(cardId, bl => bl.map(b => (b.id === cardId && b.indent === 1 ? { ...b, ...patch } : b)));

  const rescheduleDeadline = (cardId: string, newDeadline: string) => {
    if (!isValidDateYYYYMMDD(newDeadline)) return;
    // Rescheduling also un-hides the task
    patchTask(cardId, { deadline: newDeadline, isHidden: false });
  };

  const setFlag = (cardId: string, flag: TaskFlagColor | undefined) =>
    patchTask(cardId, { flag, priority: undefined });

  const deleteTask = (cardId: string) =>
    mutateHolding(cardId, bl => removeTaskAndSubtasks(bl, cardId));

  const renameTask = (cardId: string, text: string) => patchTask(cardId, { text });

  const handleCreateTask = () => {
    setNewTask({ text: '', listId: listOptions[0]?.id ?? '', deadline: todayYMD() });
  };

  const submitNewTask = () => {
    if (!newTask || !newTask.text.trim() || !isValidDateYYYYMMDD(newTask.deadline)) return;
    const { listId, deadline, text } = newTask;
    const add = (bl: Block[]) => addTaskUnderList(bl, listId || null, { deadline, text }).blocks;
    if (listId) {
      mutateHolding(listId, add);
    } else if (sources[0]) {
      // No lists anywhere → Uncategorized of the first group shown
      const src = sources[0];
      const nextBlocks = add(src.blocks);
      writeSelectedProjectBlocks(src.project_id, nextBlocks);
      setSources(prev => prev.map(s => (s === src ? { ...s, blocks: nextBlocks } : s)));
    }
    setNewTask(null);
  };

  useEffect(() => {
    if (!editingTextCardId) return;
    const input = inlineTextRefs.current[editingTextCardId];
    if (!input) return;
    requestAnimationFrame(() => input.focus());
  }, [editingTextCardId]);

  const commitTaskText = (cardId: string) => {
    renameTask(cardId, draftText);
    setEditingTextCardId(null);
  };

  /* ── Drag and drop rescheduling ── */
  const handleCardDragStart = (e: React.DragEvent, cardId: string) => {
    setDraggingCardId(cardId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cardId);
  };

  const handleCardDragEnd = () => {
    setDraggingCardId(null);
    setDragOverCol(null);
  };

  const handleColDragOver = (e: React.DragEvent, colKey: string) => {
    if (colKey === OVERDUE_KEY) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== colKey) setDragOverCol(colKey);
  };

  const handleColDragLeave = (colKey: string) => {
    setDragOverCol(prev => (prev === colKey ? null : prev));
  };

  const handleColDrop = (e: React.DragEvent, colKey: string) => {
    if (colKey === OVERDUE_KEY) return;
    e.preventDefault();
    const cardId = e.dataTransfer.getData('text/plain') || draggingCardId;
    if (cardId) rescheduleDeadline(cardId, colKey);
    setDraggingCardId(null);
    setDragOverCol(null);
  };

  /* ── Render ── */
  if (!hydrated) {
    return (
      <div className="youtask-timeline-root">
        <div className="youtask-timeline-top">
          <div className="youtask-timeline-title">Timeline</div>
        </div>
        <div className="youtask-timeline-loading">Cargando timeline…</div>
      </div>
    );
  }

  return (
    <div className="youtask-timeline-root">
      <div className="youtask-timeline-top">
        <div className="youtask-timeline-title">
          Timeline

          {!showCompleted ? (
            <span className="youtask-timeline-sub">
              {' '}· {headerTitle}
              {!normalRange
                ? ' · (sin deadlines)'
                : ` · Overdue (${overdueCount}) · ${columns.filter(k => k !== OVERDUE_KEY).length} column${columns.filter(k => k !== OVERDUE_KEY).length === 1 ? '' : 's'}`}
            </span>
          ) : (
            <span
              className="youtask-timeline-sub"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                marginLeft: 10,
              }}
            >
              <button
                type="button"
                className="youtask-timeline-monthnav"
                onClick={() => setVisibleMonth(prev => addMonths(prev, -1))}
                data-tip="Previous month"
                aria-label="Previous month"
              >
                ‹
              </button>

              <span className="youtask-timeline-monthlabel">
                {monthLabel(visibleMonth)}
              </span>

              <button
                type="button"
                className="youtask-timeline-monthnav"
                onClick={() => {
                  if (canGoNextMonth) {
                    setVisibleMonth(prev => addMonths(prev, 1));
                  }
                }}
                data-tip="Next month"
                aria-label="Next month"
                disabled={!canGoNextMonth}
              >
                ›
              </button>
            </span>
          )}
        </div>

        <div className="youtask-timeline-actions">
          <button
            type="button"
            className={['youtask-timeline-toggle', showCompleted ? 'is-on' : ''].join(' ')}
            onClick={() => setShowCompleted(v => !v)}
            data-tip="Muestra tasks del mes completo, tanto completados como pendientes, ocultando días sin activity. Archived no aparece aquí."
          >
            {showCompleted ? '✓ Show Completed' : 'Show Completed'}
          </button>

          <button
            type="button"
            className="youtask-timeline-addbtn"
            onClick={handleCreateTask}
            data-tip="Add task"
            aria-label="Add task"
          >
            +
          </button>
        </div>
      </div>

      {columns.length === 0 ? (
        <div className="youtask-timeline-empty">
          {showCompleted
            ? `No tasks in ${monthLabel(visibleMonth)}.`
            : 'No tasks yet.'}
        </div>
      ) : (
        <div className="youtask-timeline-board">
          {columns.map(colKey => {
            const list = cardsByDate[colKey] || [];
            const isOverdueCol = !showCompleted && colKey === OVERDUE_KEY;
            const title = isOverdueCol ? 'Overdue' : fmtColTitle(colKey);
            const diff = isOverdueCol ? -1 : dayDiffFromToday(colKey);

            const hasOpen = list.some(c => !c.checked);
            const showOverduePill = showCompleted ? diff < 0 && hasOpen : diff < 0;

            const pillText = (() => {
              if (isOverdueCol || showOverduePill) return 'Overdue';
              if (diff === 0) return 'Today';
              if (diff === 1) return 'Tomorrow';
              if (diff > 1) return `+${diff}d`;
              return '';
            })();

            return (
              <div key={colKey} className="yt-col">
                <div className="yt-col-header">
                  <div
                    className={['yt-col-title', showOverduePill ? 'is-overdue' : ''].join(' ')}
                    data-tip={isOverdueCol ? `${list.length} overdue` : colKey}
                  >
                    {title}
                  </div>

                  {pillText && !isOverdueCol ? (
                    <div className={['yt-col-when', showOverduePill ? 'is-overdue' : ''].join(' ')}>
                      {pillText}
                    </div>
                  ) : null}
                </div>

                <div
                  className={['yt-col-body', dragOverCol === colKey && colKey !== OVERDUE_KEY ? 'is-dragover' : ''].join(' ')}
                  onDragOver={e => handleColDragOver(e, colKey)}
                  onDragLeave={() => handleColDragLeave(colKey)}
                  onDrop={e => handleColDrop(e, colKey)}
                >
                  {list.length === 0 ? (
                    <div className="yt-empty">—</div>
                  ) : (
                    groupByList(list).map(group => (
                      <div key={group.listId ?? group.title} className="yt-group">
                        <div className="yt-group-title" data-tip={group.title}>{group.title}</div>
                        {group.cards.map(card => {
                      const overdueDays = isOverdueCol
                        ? Math.max(0, -dayDiffFromToday(card.deadline))
                        : 0;

                      return (
                        <div
                          key={card.id}
                          className={[
                            'yt-row',
                            card.checked ? 'is-done' : '',
                            draggingCardId === card.id ? 'is-dragging' : '',
                            rowMenu?.cardId === card.id ? 'is-menu-open' : '',
                          ].join(' ')}
                          data-tip={isOverdueCol ? `${fmtColTitle(card.deadline)} · ${overdueDays}d late` : undefined}
                          draggable
                          onDragStart={e => handleCardDragStart(e, card.id)}
                          onDragEnd={handleCardDragEnd}
                        >
                          <button
                            type="button"
                            className={['yt-check check-glow', card.checked ? 'is-on' : ''].join(' ')}
                            onClick={() => toggleDone(card.id)}
                            data-tip={card.checked ? 'Mark as pending' : 'Mark as completed'}
                            aria-label={card.checked ? 'Completed' : 'Mark completed'}
                            aria-pressed={card.checked}
                          >
                            <TaskCheckmark checked={Boolean(card.checked)} />
                          </button>

                          <div className="yt-row-main">
                            {editingTextCardId === card.id ? (
                              <input
                                ref={el => { inlineTextRefs.current[card.id] = el; }}
                                className="yt-row-title-input"
                                value={draftText}
                                onChange={e => setDraftText(e.target.value)}
                                onBlur={() => commitTaskText(card.id)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { e.preventDefault(); commitTaskText(card.id); }
                                  if (e.key === 'Escape') setEditingTextCardId(null);
                                }}
                                placeholder="Task name"
                              />
                            ) : (
                              <div
                                className="yt-row-title"
                                onDoubleClick={() => { setDraftText(card.text); setEditingTextCardId(card.id); }}
                              >
                                {card.text || '(sin texto)'}
                                {card.flag ? (
                                  <span className="yt-row-flag" data-tip={`${card.flag[0].toUpperCase()}${card.flag.slice(1)} flag`}>
                                    <TaskFlagIcon color={card.flag} className="h-[13px] w-[13px]" />
                                  </span>
                                ) : null}
                                {/* Note (only when set), right after the flag — same as Agenda */}
                                {card.notes?.length ? (
                                  <TaskNoteButton
                                    task={card}
                                    onChange={notes => patchTask(card.id, { notes })}
                                    // Inline, so it sits on the title's line like the flag
                                    className="ml-1 !inline-flex align-middle"
                                  />
                                ) : null}
                              </div>
                            )}


                            {card.subtasks.length > 0 ? (
                              <div className="yt-subtasks">
                                {card.subtasks.map(st => (
                                  <div key={st.id} className={['yt-subtask', st.checked ? 'is-done' : ''].join(' ')}>
                                    <button
                                      type="button"
                                      className={['yt-check yt-subcheck check-glow', st.checked ? 'is-on' : ''].join(' ')}
                                      onClick={() => toggleDone(st.id)}
                                      data-tip={st.checked ? 'Mark as pending' : 'Mark as completed'}
                                      aria-label={st.checked ? 'Completed' : 'Mark completed'}
                                      aria-pressed={st.checked}
                                    >
                                      <TaskCheckmark checked={Boolean(st.checked)} size="sm" />
                                    </button>
                                    <span className="yt-subtext">{st.text || '(subtask)'}</span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>

                          {/* Just the ⋮ (flag lives in its menu), in its own slot so it never covers the title */}
                          <div className="yt-row-actions">
                            <button
                              type="button"
                              className="yt-row-iconbtn"
                              onMouseDown={e => e.stopPropagation()}
                              onClick={e => {
                                const r = e.currentTarget.getBoundingClientRect();
                                setRowMenu(prev =>
                                  prev?.cardId === card.id ? null : { cardId: card.id, x: r.right, y: r.bottom + 4 },
                                );
                              }}
                              data-tip="Task options"
                              aria-label="Task options"
                              aria-haspopup="menu"
                              aria-expanded={rowMenu?.cardId === card.id}
                            >
                              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
                                <circle cx="8" cy="3.2" r="1.2" />
                                <circle cx="8" cy="8" r="1.2" />
                                <circle cx="8" cy="12.8" r="1.2" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                        })}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {newTask && (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center p-5">
          <button
            type="button"
            className={`fixed inset-0 ${classes.modalBackdrop}`}
            onClick={() => setNewTask(null)}
            aria-label="Cancel"
          />
          <form
            role="dialog"
            aria-label="New task"
            className={`relative z-10 w-full max-w-[360px] p-6 ${classes.modalCard}`}
            onSubmit={e => { e.preventDefault(); submitNewTask(); }}
            onKeyDown={e => { if (e.key === 'Escape') setNewTask(null); }}
          >
            <h3 className={`mb-4 ${classes.modalTitle}`}>New task</h3>

            <input
              autoFocus
              value={newTask.text}
              onChange={e => setNewTask({ ...newTask, text: e.target.value })}
              placeholder="Task name"
              className="w-full rounded-lg px-3 py-2 text-[14px] outline-none"
              style={{ border: '1px solid var(--assistant-border-soft)', background: 'var(--assistant-control-bg)', color: 'var(--assistant-text)' }}
            />

            <label className="mt-3 block text-[12px] font-medium" style={{ color: 'var(--assistant-text-muted)' }}>
              Due date
              <input
                type="date"
                lang="en-US"
                value={newTask.deadline}
                onChange={e => setNewTask({ ...newTask, deadline: e.target.value })}
                className="mt-1 block w-full rounded-lg px-3 py-2 text-[14px] outline-none"
                style={{ border: '1px solid var(--assistant-border-soft)', background: 'var(--assistant-control-bg)', color: 'var(--assistant-text)' }}
              />
            </label>

            <label className="mt-3 block text-[12px] font-medium" style={{ color: 'var(--assistant-text-muted)' }}>
              List
              <select
                value={newTask.listId}
                onChange={e => setNewTask({ ...newTask, listId: e.target.value })}
                className="mt-1 block w-full rounded-lg px-3 py-2 text-[14px] outline-none"
                style={{ border: '1px solid var(--assistant-border-soft)', background: 'var(--assistant-control-bg)', color: 'var(--assistant-text)' }}
              >
                {listOptions.length === 0 ? <option value="">Uncategorized</option> : null}
                {listOptions.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.title}</option>
                ))}
              </select>
            </label>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewTask(null)}
                className="text-[13px] px-3 py-2 rounded-lg"
                style={{ color: 'var(--assistant-text-muted)' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newTask.text.trim() || !isValidDateYYYYMMDD(newTask.deadline)}
                className="text-[13px] font-semibold px-3 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--assistant-contrast-bg)', color: 'var(--assistant-contrast-text)' }}
              >
                Add task
              </button>
            </div>
          </form>
        </div>
      )}

      {rescheduleCardId && (
        <DatePickerModal
          title="Reschedule"
          subtitle={cards.find(c => c.id === rescheduleCardId)?.text}
          value={cards.find(c => c.id === rescheduleCardId)?.deadline}
          onPick={ymd => rescheduleDeadline(rescheduleCardId, ymd)}
          onClose={() => setRescheduleCardId(null)}
        />
      )}

      {deleteConfirmId && (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center p-5">
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
                onClick={() => { deleteTask(deleteConfirmId); setDeleteConfirmId(null); }}
                className={`text-[13px] font-medium px-3 py-2 rounded-lg ${classes.panelBtnDanger}`}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {rowMenu ? (
        <RowMenu
          x={rowMenu.x}
          y={rowMenu.y}
          flag={cards.find(c => c.id === rowMenu.cardId)?.flag}
          onFlag={flag => setFlag(rowMenu.cardId, flag)}
          onReschedule={() => setRescheduleCardId(rowMenu.cardId)}
          onDelete={() => setDeleteConfirmId(rowMenu.cardId)}
          onClose={() => setRowMenu(null)}
        />
      ) : null}
    </div>
  );
}