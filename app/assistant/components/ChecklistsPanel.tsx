'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  type Checklist,
  type ChecklistItem,
  LS_KEY_CHECKLISTS,
  readChecklistsLS,
  writeChecklistsLS,
  addChecklist as addChecklistArr,
  removeChecklist as removeChecklistArr,
  emptyChecklist as emptyChecklistArr,
  renameChecklist as renameChecklistArr,
  addChecklistItem as addChecklistItemArr,
  insertChecklistItemAfter as insertChecklistItemAfterArr,
  removeChecklistItem as removeChecklistItemArr,
  updateChecklistItem as updateChecklistItemArr,
  moveChecklistItem as moveChecklistItemArr,
  indentChecklistItem as indentChecklistItemArr,
  moveChecklist as moveChecklistArr,
  checklistIndent,
} from '@/lib/datacenter';
import classes from '@/app/assistant/_theme/themes.module.css';
import { TaskCheckmark } from './TaskCheckmark';
import { AgendaAddGhost, AGENDA_ADD_ANCHOR } from './AgendaList';

/** Left padding of an item row by depth (16px per level, like Agenda's subtasks). */
const itemRowPad = (indent: number) => 6 + (indent - 1) * 16;
/** The ghost's dashed circle lines up with the row's checkmark (the row itself is the drag handle). */
const ghostPad = itemRowPad;

type Props = {
  open: boolean;
  onClose: () => void;
  /** tab: a main-panel tab — no frame, title or close button; lists in a column beside the items */
  variant?: 'overlay' | 'dock' | 'tab';
};

export default function ChecklistsPanel({ open, onClose, variant = 'overlay' }: Props) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);

  const [lists, setLists] = useState<Checklist[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabValue, setEditingTabValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const itemInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const tabInputRef   = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ id: string; fromIndex: number } | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const listDragRef = useRef<number | null>(null);
  const [dragOverListId, setDragOverListId] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      const payload = readChecklistsLS();
      setLists(payload.lists);
      setSelectedId(prev => {
        const validPrev = prev && payload.lists.some(l => l.id === prev) ? prev : null;
        return validPrev ?? payload.selectedListId ?? payload.lists[0]?.id ?? null;
      });
    };
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY_CHECKLISTS) load();
    };
    window.addEventListener('youtask_checklists_updated', load);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('youtask_checklists_updated', load);
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

  const persist = (next: Checklist[], nextSelectedId?: string | null) => {
    setLists(next);
    const sel = nextSelectedId === undefined
      ? (selectedId && next.some(l => l.id === selectedId) ? selectedId : (next[0]?.id ?? null))
      : nextSelectedId;
    setSelectedId(sel);
    writeChecklistsLS({ lists: next, selectedListId: sel ?? undefined });
  };

  const focusItem = (id: string, caretToEnd = false) => {
    requestAnimationFrame(() => {
      const el = itemInputRefs.current[id];
      if (!el) return;
      el.focus();
      if (caretToEnd) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } else el.setSelectionRange(0, 0);
    });
  };

  /** New checklist at the end, or right after `afterId` (the hover "Checklist…") — named on the spot */
  const handleAddList = (afterId?: string) => {
    const { lists: next, newList } = addChecklistArr(lists, undefined, afterId);
    persist(next, newList.id);
    setEditingTabId(newList.id);
    setEditingTabValue(newList.name);
    requestAnimationFrame(() => tabInputRef.current?.select());
  };

  const commitTabRename = () => {
    if (!editingTabId) return;
    const trimmed = editingTabValue.trim() || 'New checklist';
    const next = renameChecklistArr(lists, editingTabId, trimmed);
    persist(next, selectedId);
    setEditingTabId(null);
    setEditingTabValue('');
  };

  const startTabRename = (l: Checklist) => {
    setEditingTabId(l.id);
    setEditingTabValue(l.name);
    requestAnimationFrame(() => tabInputRef.current?.select());
  };

  const handleDeleteList = (id: string) => {
    const result = removeChecklistArr(lists, id);
    persist(result.lists, result.focusId);
    setConfirmDeleteId(null);
  };

  const handleEmptyList = (id: string) => {
    const next = emptyChecklistArr(lists, id);
    persist(next, selectedId);
  };

  const handleAddItem = (listId: string) => {
    const { lists: next, newItem } = addChecklistItemArr(lists, listId);
    persist(next, selectedId);
    if (newItem) focusItem(newItem.id);
  };

  /** A sibling after the item (and its sub-items), or — `asFirstSubItem` — its first sub-item */
  const handleInsertAfter = (listId: string, afterId: string, asFirstSubItem = false) => {
    const { lists: next, newItem } = insertChecklistItemAfterArr(lists, listId, afterId, asFirstSubItem);
    persist(next, selectedId);
    if (newItem) focusItem(newItem.id);
  };

  const handleUpdateItem = (listId: string, itemId: string, patch: Partial<ChecklistItem>) => {
    const next = updateChecklistItemArr(lists, listId, itemId, patch);
    persist(next, selectedId);
  };

  const handleRemoveItem = (listId: string, itemId: string, withSubItems = false) => {
    const result = removeChecklistItemArr(lists, listId, itemId, withSubItems);
    persist(result.lists, selectedId);
    if (result.focusId) focusItem(result.focusId, true);
  };

  const handleItemKey = (
    e: React.KeyboardEvent<HTMLInputElement>,
    listId: string,
    item: ChecklistItem,
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInsertAfter(listId, item.id);
      return;
    }
    // Tab makes it a sub-item of the item above, Shift+Tab moves it back out
    if (e.key === 'Tab') {
      e.preventDefault();
      persist(indentChecklistItemArr(lists, listId, item.id, e.shiftKey ? -1 : 1), selectedId);
      focusItem(item.id, true);
      return;
    }
    if (e.key === 'Backspace' && item.text === '') {
      e.preventDefault();
      handleRemoveItem(listId, item.id);
    }
  };

  const onDragStartItem = (e: React.DragEvent, id: string, index: number) => {
    dragRef.current = { id, fromIndex: index };
    setDragOverItemId(id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch {}
  };
  const onDragOverItem = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    if (!dragRef.current) return;
    if (dragOverItemId !== overId) setDragOverItemId(overId);
  };
  const onDropItem = (e: React.DragEvent, listId: string, overId: string) => {
    e.preventDefault();
    const drag = dragRef.current;
    if (!drag) return;
    const list = lists.find(l => l.id === listId);
    if (!list) return;
    const toIndex = list.items.findIndex(it => it.id === overId);
    if (toIndex < 0) return;
    const next = moveChecklistItemArr(lists, listId, drag.fromIndex, toIndex);
    persist(next, selectedId);
    dragRef.current = null;
    setDragOverItemId(null);
  };
  const onDragEndItem = () => {
    dragRef.current = null;
    setDragOverItemId(null);
  };

  // Lists reorder by dragging too; their order is the array order (saved as `position`)
  const onDragStartList = (e: React.DragEvent, index: number) => {
    listDragRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', lists[index].id); } catch {}
  };
  const onDragOverList = (e: React.DragEvent, overId: string) => {
    if (listDragRef.current === null) return;
    e.preventDefault();
    if (dragOverListId !== overId) setDragOverListId(overId);
  };
  const onDropList = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const from = listDragRef.current;
    listDragRef.current = null;
    setDragOverListId(null);
    if (from === null || from === toIndex) return;
    persist(moveChecklistArr(lists, from, toIndex), selectedId);
  };
  const onDragEndList = () => {
    listDragRef.current = null;
    setDragOverListId(null);
  };

  const activeList = useMemo<Checklist | null>(
    () => lists.find(l => l.id === selectedId) ?? null,
    [lists, selectedId],
  );

  const completedCount = activeList?.items.filter(i => i.checked).length ?? 0;
  const totalCount     = activeList?.items.length ?? 0;

  if (!shouldRender) return null;

  const isTab = variant === 'tab';
  const tabsRow = (
    // Tab: a column on desktop, the usual scrolling row on phones
    <div
      className={isTab
        ? 'shrink-0 border-b px-3 py-2 md:w-[220px] md:overflow-y-auto md:border-b-0 md:border-r md:px-2 md:py-3'
        : 'px-3 pt-2 pb-2 shrink-0'}
      style={isTab ? { borderColor: 'var(--assistant-border-soft)' } : { borderBottom: '1px solid var(--assistant-border-soft)' }}
    >
      {/* Column (desktop tab): no gap — the tabs space themselves, so the collapsed hover
          ghosts between them don't add room */}
      <div className={isTab
        ? 'flex items-center gap-1 overflow-x-auto scrollbar-none md:flex-col md:items-stretch md:gap-0 md:overflow-x-visible'
        : 'flex items-center gap-1 overflow-x-auto scrollbar-none'}>
        {/* New checklist comes first */}
        {isTab ? (
          <button type="button" onClick={() => handleAddList()}
            className={`shrink-0 whitespace-nowrap text-left text-[13px] px-2.5 py-1.5 rounded-lg md:mb-1 md:w-full ${classes.panelEmptyAddBtn}`}>
            + New Checklist
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleAddList()}
            className={`shrink-0 flex items-center justify-center h-7 w-7 rounded-lg ${classes.panelBtn}`}
            data-tip="New checklist"
            aria-label="New checklist"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" d="M8 3.5v9M3.5 8h9" />
            </svg>
          </button>
        )}
        {lists.map((l, listIdx) => {
          const isActive = l.id === selectedId;
          const isEditing = editingTabId === l.id;
          // Desktop column only: resting on a list offers "Checklist…" right under it, like Agenda's tasks
          const offersGhost = isTab && !isEditing && listDragRef.current === null;
          return (
            <React.Fragment key={l.id}>
            <div
              draggable={!isEditing}
              onDragStart={e => onDragStartList(e, listIdx)}
              onDragOver={e => onDragOverList(e, l.id)}
              onDrop={e => onDropList(e, listIdx)}
              onDragEnd={onDragEndList}
              className={[
                'group relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium shrink-0',
                isTab ? 'whitespace-nowrap md:my-0.5 md:justify-between md:whitespace-normal' : 'whitespace-nowrap',
                isActive ? classes.panelTabActive : classes.panelTabInactive,
                dragOverListId === l.id && listDragRef.current !== listIdx ? classes.dragOver : '',
                offersGhost ? AGENDA_ADD_ANCHOR : '',
              ].join(' ')}
              onClick={() => {
                if (!isActive && !isEditing) {
                  setSelectedId(l.id);
                  writeChecklistsLS({ lists, selectedListId: l.id });
                }
              }}
              onDoubleClick={() => startTabRename(l)}
              role="tab"
              aria-selected={isActive}
            >
              {isEditing ? (
                <input
                  ref={tabInputRef}
                  value={editingTabValue}
                  onChange={e => setEditingTabValue(e.target.value)}
                  onBlur={commitTabRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitTabRename(); }
                    if (e.key === 'Escape') { e.preventDefault(); setEditingTabId(null); setEditingTabValue(''); }
                  }}
                  className="bg-transparent outline-none min-w-22.5 max-w-45 text-[13px]"
                  style={{ color: 'var(--assistant-text)' }}
                />
              ) : (
                <span className={`break-words ${isTab ? 'min-w-0' : 'max-w-40'}`}>{l.name || 'Checklist'}</span>
              )}
              {(isActive || isTab) && !isEditing && (
                <span className="text-[11px] tabular-nums" style={{ color: 'var(--assistant-text-faint)' }}>
                  {l.items.filter(i => i.checked).length}/{l.items.length}
                </span>
              )}
            </div>
            {/* Must directly follow the tab: CSS reveals it via .quick-add-anchor:hover + .quick-add-ghost.
                Phones show the lists as a row, where a ghost row doesn't fit */}
            {offersGhost && (
              <AgendaAddGhost
                onClick={() => handleAddList(l.id)}
                paddingLeft={10}
                label="Checklist…"
                ariaLabel="Add checklist"
                className="max-md:hidden"
                icon="plus"
              />
            )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );

  const emptyState = (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-[14px]" style={{ color: 'var(--assistant-text-muted)' }}>No checklists yet</div>
      <button type="button" onClick={() => handleAddList()}
        className={`px-3 py-1.5 rounded-lg text-[13px] ${classes.panelBtn}`}>
        + Create your first checklist
      </button>
    </div>
  );

  const activeListBody = activeList ? (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-4 py-2.5 shrink-0 flex items-center justify-between gap-2"
        style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
        {/* Renaming is a double-click on the list's tab */}
        <button type="button" onClick={() => handleAddItem(activeList.id)}
          className={`shrink-0 whitespace-nowrap text-[13px] px-2.5 py-1 rounded-lg ${classes.panelEmptyAddBtn}`}>
          + Item
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] tabular-nums mr-1" style={{ color: 'var(--assistant-text-faint)' }}>
            {completedCount}/{totalCount}
          </span>
          <button type="button" onClick={() => handleEmptyList(activeList.id)}
            className={`h-7 w-7 rounded-md flex items-center justify-center ${classes.panelBtn}`}
            data-tip="Remove every item from this checklist" aria-label="Empty checklist">
            {/* Eraser */}
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
              <path d="M9.5 2.5l4 4L7 13H4l-1.5-1.5a1 1 0 010-1.4z" />
              <path strokeLinecap="round" d="M6 6l4 4M7 13h7" />
            </svg>
          </button>
          <button type="button" onClick={() => setConfirmDeleteId(activeList.id)}
            className={`h-7 w-7 rounded-md flex items-center justify-center ${classes.panelBtnDanger}`}
            data-tip="Delete this checklist" aria-label="Delete checklist">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4" />
              <path d="M6.7 6.5v4.5M9.3 6.5v4.5" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {activeList.items.length === 0 ? (
          <button type="button" onClick={() => handleAddItem(activeList.id)}
            className={`w-full text-left text-[13px] px-2 py-2 rounded-md ${classes.panelEmptyAddBtn}`}>
            + Add item
          </button>
        ) : (
          <div className="space-y-0.5">
            {activeList.items.map((item, idx) => {
              const isDraggingOver = dragOverItemId === item.id && dragRef.current?.id !== item.id;
              const isDraggingMe   = dragRef.current?.id === item.id;
              const depth = checklistIndent(item);
              // Same as Agenda: an item shown with sub-items offers "Sub-item…" as their first;
              // otherwise a sibling right below it (a sub-item's sibling is a sub-item too)
              const nextItem = activeList.items[idx + 1];
              const hasSubItems = Boolean(nextItem && checklistIndent(nextItem) > depth);
              // Only under items with text, and not mid-drag
              const offersGhost = item.text.trim() !== '' && !dragRef.current;
              return (
                <React.Fragment key={item.id}>
                <div
                  draggable
                  onDragStart={e => onDragStartItem(e, item.id, idx)}
                  onDragOver={e => onDragOverItem(e, item.id)}
                  onDrop={e => onDropItem(e, activeList.id, item.id)}
                  onDragEnd={onDragEndItem}
                  className={[
                    'group flex items-center gap-2 px-1.5 py-1.5 rounded-md',
                    isDraggingOver ? classes.dragOver : '',
                    isDraggingMe ? 'opacity-60' : '',
                    offersGhost ? AGENDA_ADD_ANCHOR : '',
                  ].join(' ')}
                  style={{ paddingLeft: itemRowPad(depth) }}
                >
                  <button
                    type="button"
                    onClick={() => handleUpdateItem(activeList.id, item.id, { checked: !item.checked })}
                    className="check-glow h-4 w-4 rounded-full flex items-center justify-center shrink-0 transition-[transform,box-shadow] duration-150 ease-out group-hover:scale-[1.06]"
                    aria-pressed={item.checked}
                    aria-label={item.checked ? 'Mark as not done' : 'Mark as done'}
                  >
                    <TaskCheckmark checked={Boolean(item.checked)} />
                  </button>
                  <input
                    ref={el => void (itemInputRefs.current[item.id] = el)}
                    value={item.text}
                    placeholder="Item…"
                    onChange={e => handleUpdateItem(activeList.id, item.id, { text: e.target.value })}
                    onKeyDown={e => handleItemKey(e, activeList.id, item)}
                    className="w-full bg-transparent outline-none text-sm transition-opacity duration-150"
                    style={{
                      color: item.checked ? 'var(--assistant-text-faint)' : 'var(--assistant-text-soft)',
                      textDecoration: item.checked ? 'line-through' : 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(activeList.id, item.id, true)}
                    className={`shrink-0 opacity-0 group-hover:opacity-100 text-[12px] px-1.5 py-0.5 rounded ${classes.panelItemDelete}`}
                    aria-label="Remove item"
                    data-tip={hasSubItems ? 'Remove item and its sub-items' : 'Remove item'}
                  >
                    ✕
                  </button>
                </div>
                {/* Must directly follow the row: CSS reveals it via .quick-add-anchor:hover + .quick-add-ghost */}
                {offersGhost && (hasSubItems ? (
                  <AgendaAddGhost
                    onClick={() => handleInsertAfter(activeList.id, item.id, true)}
                    paddingLeft={ghostPad(depth + 1)}
                    label="Sub-item…"
                    ariaLabel="Add sub-item"
                    icon="plus"
                  />
                ) : (
                  <AgendaAddGhost
                    onClick={() => handleInsertAfter(activeList.id, item.id)}
                    paddingLeft={ghostPad(depth)}
                    label={depth > 1 ? 'Sub-item…' : 'Item…'}
                    ariaLabel={depth > 1 ? 'Add sub-item' : 'Add item'}
                    icon="plus"
                  />
                ))}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  ) : null;

  const confirmDelete = confirmDeleteId ? (
    <div className={`absolute inset-0 z-10 flex items-center justify-center ${classes.modalBackdrop}`}>
      <div role="alertdialog" className={`w-65 p-4 text-center ${classes.modalCard}`}>
        <div className="text-[14px] mb-1 font-semibold" style={{ color: 'var(--assistant-text-soft)' }}>Delete checklist?</div>
        <div className="text-[12px] mb-3" style={{ color: 'var(--assistant-text-muted)' }}>
          This will permanently remove the checklist and all its items.
        </div>
        <div className="flex items-center justify-center gap-2">
          <button type="button" onClick={() => setConfirmDeleteId(null)}
            className={`px-3 py-1.5 rounded-md text-[13px] ${classes.panelBtn}`}>
            Cancel
          </button>
          <button type="button" onClick={() => handleDeleteList(confirmDeleteId)}
            className={`px-3 py-1.5 rounded-md text-[13px] ${classes.panelBtnDanger}`}>
            Delete
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const panelAnim = isClosing
    ? 'checklistsPanelOut 0.24s cubic-bezier(0.4, 0, 1, 1) both'
    : 'checklistsPanelIn 0.46s cubic-bezier(0.22, 1, 0.36, 1) 0.16s both';

  const body = (
    <>
      <style>{`
        @keyframes checklistsPanelIn {
          from { transform: translateX(-34px); opacity: 0; filter: blur(1px); }
          60% { transform: translateX(3px); opacity: .92; filter: blur(0); }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes checklistsPanelOut {
          from { transform: translateX(0); opacity: 1; filter: blur(0); }
          to { transform: translateX(14px); opacity: 0; filter: blur(1px); }
        }
      `}</style>

      {!isTab && (
        <div className="flex h-[49px] items-center justify-between px-4 shrink-0"
          style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
          <div className="flex items-baseline gap-2">
            <h2 className="text-[16px] font-semibold" style={{ color: 'var(--assistant-text-soft)' }}>Checklists</h2>
            {lists.length > 0 && (
              <span className="text-[12px] tabular-nums" style={{ color: 'var(--assistant-text-faint)' }}>
                {lists.length} {lists.length === 1 ? 'list' : 'lists'}
              </span>
            )}
          </div>
          <button type="button" onClick={requestClose}
            className={`h-8 w-8 rounded-lg ${classes.panelCloseBtn}`} aria-label="Close lists">
            ✕
          </button>
        </div>
      )}

      {isTab && lists.length > 0 ? (
        // Lists in a column on the left, the open list's items fill the rest
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {tabsRow}
          {activeList ? activeListBody : emptyState}
        </div>
      ) : (
        <>
          {lists.length > 0 && tabsRow}
          {lists.length === 0 ? emptyState : (activeList ? activeListBody : emptyState)}
        </>
      )}

      {confirmDelete}
    </>
  );

  if (isTab) {
    return <div className="relative flex h-full min-h-0 w-full min-w-0 flex-col">{body}</div>;
  }

  if (variant === 'dock') {
    return (
      <div
        className={`relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl ${classes.panelGlass}`}
        style={{ color: 'var(--assistant-text)', animation: panelAnim }}
      >
        {body}
      </div>
    );
  }

  return (
    <>
      <button type="button" className="fixed inset-0 z-200 bg-black/50" onClick={requestClose}
        aria-label="Close lists"
        style={{ animation: isClosing ? 'checklistsOverlayOut 0.2s ease-out both' : 'checklistsOverlayIn 0.22s ease-out both' }}
      />
      <div
        className={`fixed left-3 top-3 z-201 flex h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] max-w-3xl flex-col overflow-hidden rounded-2xl ${classes.panelGlass} ${classes.panelOverlay}`}
        style={{ color: 'var(--assistant-text)', animation: panelAnim }}
      >
        <style>{`
          @keyframes checklistsOverlayIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes checklistsOverlayOut { from { opacity: 1; } to { opacity: 0; } }
        `}</style>
        {body}
      </div>
    </>
  );
}
