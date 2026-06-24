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
} from '@/lib/datacenter';
import classes from '@/app/assistant/_theme/themes.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  variant?: 'overlay' | 'dock';
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

  const handleAddList = () => {
    const { lists: next, newList } = addChecklistArr(lists);
    persist(next, newList.id);
    setEditingTabId(newList.id);
    setEditingTabValue(newList.name);
    requestAnimationFrame(() => tabInputRef.current?.select());
  };

  const commitTabRename = () => {
    if (!editingTabId) return;
    const trimmed = editingTabValue.trim() || 'New list';
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

  const handleInsertAfter = (listId: string, afterId: string) => {
    const { lists: next, newItem } = insertChecklistItemAfterArr(lists, listId, afterId);
    persist(next, selectedId);
    if (newItem) focusItem(newItem.id);
  };

  const handleUpdateItem = (listId: string, itemId: string, patch: Partial<ChecklistItem>) => {
    const next = updateChecklistItemArr(lists, listId, itemId, patch);
    persist(next, selectedId);
  };

  const handleRemoveItem = (listId: string, itemId: string) => {
    const result = removeChecklistItemArr(lists, listId, itemId);
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

  const activeList = useMemo<Checklist | null>(
    () => lists.find(l => l.id === selectedId) ?? null,
    [lists, selectedId],
  );

  const completedCount = activeList?.items.filter(i => i.checked).length ?? 0;
  const totalCount     = activeList?.items.length ?? 0;

  if (!shouldRender) return null;

  const tabsRow = (
    <div className="px-3 pt-2 pb-2 shrink-0" style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
        {lists.map(l => {
          const isActive = l.id === selectedId;
          const isEditing = editingTabId === l.id;
          return (
            <div
              key={l.id}
              className={[
                'group relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium whitespace-nowrap shrink-0',
                isActive ? classes.panelTabActive : classes.panelTabInactive,
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
                  className="bg-transparent outline-none min-w-22.5 max-w-45 text-[12px]"
                  style={{ color: 'var(--assistant-text)' }}
                />
              ) : (
                <span className="truncate max-w-40">{l.name || 'List'}</span>
              )}
              {isActive && !isEditing && (
                <span className="text-[10px] tabular-nums" style={{ color: 'var(--assistant-text-faint)' }}>
                  {l.items.filter(i => i.checked).length}/{l.items.length}
                </span>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={handleAddList}
          className={`shrink-0 flex items-center justify-center h-7 w-7 rounded-lg ${classes.panelBtn}`}
          title="New list"
          aria-label="New list"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" d="M8 3.5v9M3.5 8h9" />
          </svg>
        </button>
      </div>
    </div>
  );

  const emptyState = (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-[13px]" style={{ color: 'var(--assistant-text-muted)' }}>No lists yet</div>
      <button type="button" onClick={handleAddList}
        className={`px-3 py-1.5 rounded-lg text-[12px] ${classes.panelBtn}`}>
        + Create your first list
      </button>
    </div>
  );

  const activeListBody = activeList ? (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-4 py-2.5 shrink-0 flex items-center justify-between gap-2"
        style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" onClick={() => handleAddItem(activeList.id)}
            className={`h-7 w-7 shrink-0 rounded-md flex items-center justify-center ${classes.panelBtn}`}
            title="New item" aria-label="New item">
            +
          </button>
          <button type="button" onClick={() => startTabRename(activeList)}
            className={`text-[12px] truncate ${classes.panelEmptyAddBtn}`} title="Rename list">
            Rename
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] tabular-nums mr-1" style={{ color: 'var(--assistant-text-faint)' }}>
            {completedCount}/{totalCount}
          </span>
          <button type="button" onClick={() => handleEmptyList(activeList.id)}
            className={`text-[11px] px-2 py-1 rounded-md ${classes.panelBtn}`}
            title="Remove every item from this list">
            Empty
          </button>
          <button type="button" onClick={() => setConfirmDeleteId(activeList.id)}
            className={`text-[11px] px-2 py-1 rounded-md ${classes.panelBtnDanger}`}
            title="Delete this list">
            Delete
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {activeList.items.length === 0 ? (
          <button type="button" onClick={() => handleAddItem(activeList.id)}
            className={`w-full text-left text-[12px] px-2 py-2 rounded-md ${classes.panelEmptyAddBtn}`}>
            + Add item
          </button>
        ) : (
          <div className="space-y-0.5">
            {activeList.items.map((item, idx) => {
              const isDraggingOver = dragOverItemId === item.id && dragRef.current?.id !== item.id;
              const isDraggingMe   = dragRef.current?.id === item.id;
              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={e => onDragStartItem(e, item.id, idx)}
                  onDragOver={e => onDragOverItem(e, item.id)}
                  onDrop={e => onDropItem(e, activeList.id, item.id)}
                  onDragEnd={onDragEndItem}
                  className={[
                    'group flex items-center gap-2 px-1.5 py-1.5 rounded-md',
                    isDraggingOver ? classes.dragOver : '',
                    isDraggingMe ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  <div className={`w-3 shrink-0 select-none opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing ${classes.dragHandle}`}
                    title="Drag to reorder">
                    <svg width="8" height="13" viewBox="0 0 8 13" fill="currentColor" aria-hidden="true">
                      <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
                      <circle cx="2" cy="6.5" r="1.2"/><circle cx="6" cy="6.5" r="1.2"/>
                      <circle cx="2" cy="11" r="1.2"/><circle cx="6" cy="11" r="1.2"/>
                    </svg>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUpdateItem(activeList.id, item.id, { checked: !item.checked })}
                    className={`h-4 w-4 rounded flex items-center justify-center shrink-0 transition-[transform,background-color] duration-150 ease-out group-hover:scale-[1.06] ${item.checked ? classes.panelCheckboxChecked : classes.panelCheckboxUnchecked}`}
                    aria-pressed={item.checked}
                    aria-label={item.checked ? 'Mark as not done' : 'Mark as done'}
                  >
                    {item.checked ? <span className="text-xs" style={{ color: 'var(--assistant-accent)' }}>✓</span> : null}
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
                    onClick={() => handleRemoveItem(activeList.id, item.id)}
                    className={`shrink-0 opacity-0 group-hover:opacity-100 text-[11px] px-1.5 py-0.5 rounded ${classes.panelItemDelete}`}
                    aria-label="Remove item"
                    title="Remove item"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            <button type="button" onClick={() => handleAddItem(activeList.id)}
              className={`w-full text-left text-[12px] px-2 py-1.5 rounded-md mt-1 ${classes.panelEmptyAddBtn}`}>
              + Add item
            </button>
          </div>
        )}
      </div>
    </div>
  ) : null;

  const confirmDelete = confirmDeleteId ? (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
      <div className={`w-65 rounded-xl p-4 shadow-2xl text-center ${classes.panelConfirmModal}`}>
        <div className="text-[13px] mb-1 font-semibold" style={{ color: 'var(--assistant-text-soft)' }}>Delete list?</div>
        <div className="text-[11px] mb-3" style={{ color: 'var(--assistant-text-muted)' }}>
          This will permanently remove the list and all its items.
        </div>
        <div className="flex items-center justify-center gap-2">
          <button type="button" onClick={() => setConfirmDeleteId(null)}
            className={`px-3 py-1.5 rounded-md text-[12px] ${classes.panelBtn}`}>
            Cancel
          </button>
          <button type="button" onClick={() => handleDeleteList(confirmDeleteId)}
            className={`px-3 py-1.5 rounded-md text-[12px] ${classes.panelBtnDanger}`}>
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

      <div className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}>
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold" style={{ color: 'var(--assistant-text-soft)' }}>Lists</h2>
          {lists.length > 0 && (
            <span className="text-[11px] tabular-nums" style={{ color: 'var(--assistant-text-faint)' }}>
              {lists.length} {lists.length === 1 ? 'list' : 'lists'}
            </span>
          )}
        </div>
        <button type="button" onClick={requestClose}
          className={`h-8 w-8 rounded-lg ${classes.panelBtn}`} aria-label="Close lists">
          ✕
        </button>
      </div>

      {lists.length > 0 && tabsRow}

      {lists.length === 0 ? emptyState : (activeList ? activeListBody : emptyState)}

      {confirmDelete}
    </>
  );

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
        className={`fixed left-3 top-3 z-201 flex h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] max-w-3xl flex-col overflow-hidden rounded-2xl ${classes.panelGlass}`}
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
