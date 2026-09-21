// app/components/Sidebar.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  // Types
  type Block,
  type Project,
  // Constants
  LS_KEY_V2,
  LS_KEY_V1,
  // Utilities
  uid,
  todayYMD,
  // Array structure
  isUncTitleBlock,
  findUncRange,
  ensureUncExists,
  moveUncToTop,
  normalizeLoadedBlocks,
  makePersonalProject,
  // Block mutations
  updateBlock as updateBlockArr,
  insertBlockAfter,
  removeBlock as removeBlockArr,
  removeTitleSendChildrenToUnc,
  addNewList as addNewListArr,
  sortBlocksByOrder,
  // Projects persistence
  readProjectsLS,
  writeProjectsLS,
} from '@/lib/datacenter';
import classes from '@/app/assistant/_theme/themes.module.css';

type SidebarProps = {
  onOpenPivot?: (detail: {
    word: string;
    blockId: string | null;
    origin: 'sidebar';
    listId?: string | null;
  }) => void;
};

export const Sidebar: React.FC<SidebarProps> = ({ onOpenPivot }) => {
  const buildAllCollapsedFromBlocks = (listBlocks: Block[]): Record<string, boolean> => {
    const next: Record<string, boolean> = {};
    for (const b of listBlocks) {
      if (b.indent === 0 && !isUncTitleBlock(b) && b.archived !== true) next[b.id] = true;
    }
    return next;
  };

  /* ── Projects ── */
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  const [hydrated, setHydrated] = useState(false);

  const [deleteListConfirmId, setDeleteListConfirmId] = useState<string | null>(null);
  const [editingDateTaskId] = useState<string | null>(null);
  const [editingListTitleId, setEditingListTitleId] = useState<string | null>(null);
  const [pivotSearch, setPivotSearch] = useState('');

  /* ── Refs ── */
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const inlineDateRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const nudgeTimerRef = useRef<number | null>(null);
  const newTimerRef = useRef<number | null>(null);

  const dragRef = useRef<{ id: string } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const lastWrittenRef = useRef<string>('');
  const applyingExternalRef = useRef(false);
  const armedDeleteListRef = useRef<{ id: string; t: number } | null>(null);

  /* ── Derived state ── */
  const currentProjectIndex = useMemo(
    () => Math.max(0, projects.findIndex(p => p.project_id === selectedProjectId)),
    [projects, selectedProjectId],
  );
  const currentProject = projects[currentProjectIndex];
  const blocks: Block[] = currentProject?.blocks
    ?? moveUncToTop(ensureUncExists([]));
const visibleLists = useMemo<Record<string, boolean>>(
  () => currentProject?.visibleLists ?? {},
  [currentProject?.visibleLists],
);

  /* ===================== setCurrentBlocks / setCurrentCollapsed ===================== */
  const setCurrentBlocks = (nextFn: Block[] | ((prev: Block[]) => Block[])) => {
    setProjects(prev => {
      if (!prev.length) {
        const base = moveUncToTop(ensureUncExists([]));
        const personal = makePersonalProject(
          typeof nextFn === 'function' ? nextFn(base) : nextFn, {},
        );
        setSelectedProjectId(personal.project_id);
        return [personal];
      }
      const idx = prev.findIndex(p => p.project_id === selectedProjectId);
      const safeIdx = idx >= 0 ? idx : 0;
      const next = prev.map(p => ({ ...p }));
      const old = next[safeIdx].blocks ?? moveUncToTop(ensureUncExists([]));
      let newBlocks = typeof nextFn === 'function' ? nextFn(old) : nextFn;
      newBlocks = sortBlocksByOrder(moveUncToTop(ensureUncExists(newBlocks)));
      next[safeIdx] = { ...next[safeIdx], blocks: newBlocks };
      return next;
    });
  };

  const setCurrentCollapsed = (
    nextFn: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>),
  ) => {
    setProjects(prev => {
      if (!prev.length) {
        const personal = makePersonalProject(
          moveUncToTop(ensureUncExists([])),
          typeof nextFn === 'function' ? nextFn({}) : nextFn,
        );
        setSelectedProjectId(personal.project_id);
        return [personal];
      }
      const idx = prev.findIndex(p => p.project_id === selectedProjectId);
      const safeIdx = idx >= 0 ? idx : 0;
      const next = prev.map(p => ({ ...p }));
      const old = next[safeIdx].collapsed ?? {};
      const newCol = typeof nextFn === 'function' ? nextFn(old) : nextFn;
      next[safeIdx] = { ...next[safeIdx], collapsed: newCol };
      return next;
    });
  };

  const setCurrentVisibleLists = (
    nextFn: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>),
  ) => {
    setProjects(prev => {
      if (!prev.length) {
        const personal = makePersonalProject(
          moveUncToTop(ensureUncExists([])),
          {},
          {},
          typeof nextFn === 'function' ? nextFn({}) : nextFn,
        );
        setSelectedProjectId(personal.project_id);
        return [personal];
      }
      const idx = prev.findIndex(p => p.project_id === selectedProjectId);
      const safeIdx = idx >= 0 ? idx : 0;
      const next = prev.map(p => ({ ...p }));
      const old = next[safeIdx].visibleLists ?? {};
      const newVisible = typeof nextFn === 'function' ? nextFn(old) : nextFn;
      next[safeIdx] = { ...next[safeIdx], visibleLists: newVisible };
      return next;
    });
  };

  /* ===================== Initial load — Projects ===================== */
  useEffect(() => {
    try {
      const payload = readProjectsLS();
      if (payload) {
        const normalized = payload.projects.map(p => {
          const newCollapsed = buildAllCollapsedFromBlocks(p.blocks ?? []);
          return { ...p, collapsed: newCollapsed };
        });
        setProjects(normalized);
        setSelectedProjectId(payload.selectedProjectId || normalized[0].project_id);
        lastWrittenRef.current = JSON.stringify({ projects: normalized, selectedProjectId: payload.selectedProjectId });
        return;
      }

      const rawV1 = localStorage.getItem(LS_KEY_V1);
      if (rawV1) {
        const parsed = JSON.parse(rawV1);
        const loadedBlocks = normalizeLoadedBlocks(parsed?.blocks ?? parsed);
        const loadedCollapsed = buildAllCollapsedFromBlocks(loadedBlocks);
        const personal = makePersonalProject(loadedBlocks, loadedCollapsed);
        setProjects([personal]);
        setSelectedProjectId(personal.project_id);
        const boot = { projects: [personal], selectedProjectId: personal.project_id };
        lastWrittenRef.current = JSON.stringify(boot);
        writeProjectsLS(boot);
        return;
      }

      const personal = makePersonalProject();
      setProjects([personal]);
      setSelectedProjectId(personal.project_id);
      const boot = { projects: [personal], selectedProjectId: personal.project_id };
      lastWrittenRef.current = JSON.stringify(boot);
      writeProjectsLS(boot);
    } catch {
      const personal = makePersonalProject();
      setProjects([personal]);
      setSelectedProjectId(personal.project_id);
      const boot = { projects: [personal], selectedProjectId: personal.project_id };
      lastWrittenRef.current = JSON.stringify(boot);
      writeProjectsLS(boot);
    }
  }, []);



  /* ===================== Sync from Quick (cross-tab) ===================== */
  useEffect(() => {
    const applyFromLS = () => {
      const payload = readProjectsLS();
      if (!payload) return;
      const nextStr = JSON.stringify({ projects: payload.projects, selectedProjectId: payload.selectedProjectId });
      if (nextStr === lastWrittenRef.current) return;
      applyingExternalRef.current = true;
      setProjects(payload.projects);
      setSelectedProjectId(payload.selectedProjectId || payload.projects[0]?.project_id || '');
      lastWrittenRef.current = nextStr;
      setTimeout(() => { applyingExternalRef.current = false; }, 0);
    };
    const onStorage = (e: StorageEvent) => { if (e.key === LS_KEY_V2) applyFromLS(); };
    window.addEventListener('youtask_projects_updated', applyFromLS);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('youtask_projects_updated', applyFromLS);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    return () => {
      if (nudgeTimerRef.current) window.clearTimeout(nudgeTimerRef.current);
      if (newTimerRef.current) window.clearTimeout(newTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!editingDateTaskId) return;
    const input = inlineDateRefs.current[editingDateTaskId];
    if (!input) return;
    requestAnimationFrame(() => {
      input.focus();
      try {
        const picker = input as HTMLInputElement & { showPicker?: () => void };
        if (typeof picker.showPicker === 'function') picker.showPicker();
        else input.click();
      } catch {
        input.click();
      }
    });
  }, [editingDateTaskId]);

  /* ===================== Save Projects ===================== */
  useEffect(() => {
    if (!hydrated || applyingExternalRef.current) return;
    try {
      const payload = { projects, selectedProjectId };
      const nextStr = JSON.stringify(payload);
      if (nextStr === lastWrittenRef.current) return;
      lastWrittenRef.current = nextStr;
      writeProjectsLS(payload);
    } catch {}
  }, [projects, selectedProjectId, hydrated]);

  /* ===================== Focus helpers ===================== */
  const focusBlock = (id: string, caretToEnd = false) => {
    requestAnimationFrame(() => {
      const el = inputRefs.current[id];
      if (!el) return;
      el.focus();
      if (caretToEnd) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } else el.setSelectionRange(0, 0);
    });
  };

  const triggerNudge = () => {
    if (nudgeTimerRef.current) window.clearTimeout(nudgeTimerRef.current);
    nudgeTimerRef.current = window.setTimeout(() => {}, 180);
  };

  const triggerNewLineAnim = () => {
    if (newTimerRef.current) window.clearTimeout(newTimerRef.current);
    newTimerRef.current = window.setTimeout(() => {}, 220);
  };

  /* ===================== Tasks — wrappers ===================== */
  const handleUpdateBlock = (id: string, patch: Partial<Block>) => {
    setCurrentBlocks(prev => updateBlockArr(prev, id, patch));
  };

  const handleInsertAfter = (id: string, block: Block) => {
    setCurrentBlocks(prev => insertBlockAfter(prev, id, block));
    triggerNewLineAnim();
    focusBlock(block.id, false);
  };

  const handleRemoveBlock = (id: string) => {
    setCurrentBlocks(prev => {
      const i = prev.findIndex(b => b.id === id);
      const isList = prev[i]?.indent === 0;
      if (isList) {
        setCurrentCollapsed(c => {
          const { [id]: _omit, ...rest } = c;
          void _omit;
          return rest;
        });
      }
      const next = removeBlockArr(prev, id);
      const target = next[Math.max(0, i - 1)];
      if (target) focusBlock(target.id, true);
      return next;
    });
  };

  const handleRemoveTitle = (listId: string) => {
    setCurrentBlocks(prev => {
      const next = removeTitleSendChildrenToUnc(prev, listId);
      if (next === prev) return prev;
      setCurrentCollapsed(c => {
        const { [listId]: _omit, ...rest } = c;
        void _omit;
        return rest;
      });
      const { uncIndex } = findUncRange(next);
      const target = next[Math.max(0, uncIndex + 1)] ?? next[0];
      if (target) focusBlock(target.id, true);
      return next;
    });
  };

  const handleConfirmDeleteList = (listId: string) => {
    setDeleteListConfirmId(null);
    armedDeleteListRef.current = null;
    handleRemoveTitle(listId);
  };


  const handleAddNewList = () => {
    let newListId = '';
    setCurrentBlocks(prev => {
      const result = addNewListArr(prev);
      newListId = result.newListId;
      return result.blocks;
    });
    triggerNewLineAnim();
    requestAnimationFrame(() => {
      const el = inputRefs.current[newListId];
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
      el.setSelectionRange(0, el.value.length);
    });
  };

  const toggleListVisibility = (listId: string) =>
    setCurrentVisibleLists(prev => ({ ...prev, [listId]: prev[listId] === false }));

  /* ── Keyboard (tasks) ── */
  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>, b: Block) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextIndent = b.indent === 0 ? 1 : b.indent;
      handleInsertAfter(b.id, {
        id: uid(),
        text: '',
        indent: nextIndent,
        parentId: nextIndent === 0 ? null : (b.indent === 0 ? b.id : b.parentId),
        order: b.order + 1,
        checked: nextIndent > 0 ? false : undefined,
        deadline: nextIndent > 0 ? todayYMD() : undefined,
        isHidden: undefined,
        archived: undefined,
      });
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const MAX_INDENT = 6;
      const nextIndent = e.shiftKey ? Math.max(0, b.indent - 1) : Math.min(MAX_INDENT, b.indent + 1);
      handleUpdateBlock(b.id, {
        indent: nextIndent,
        checked: nextIndent === 0 ? undefined : b.checked ?? false,
        deadline: nextIndent === 0 ? undefined : b.deadline,
        isHidden: nextIndent === 0 ? undefined : b.isHidden,
        archived: nextIndent === 0 ? undefined : b.archived,
      });
      triggerNudge();
      return;
    }

    if (e.key === 'Backspace' && b.text === '') {
      if (b.indent === 0) {
        e.preventDefault();
        e.stopPropagation();
        const now = Date.now();
        const armed = armedDeleteListRef.current;
        if (armed?.id === b.id && now - armed.t < 800) {
          armedDeleteListRef.current = null;
          setDeleteListConfirmId(b.id);
          return;
        }
        armedDeleteListRef.current = { id: b.id, t: now };
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      handleRemoveBlock(b.id);
    }
  };

  /* ===================== Drag & drop ===================== */
  const onDragStartRow = (e: React.DragEvent, id: string) => {
    e.stopPropagation();
    dragRef.current = { id };
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
    dragRef.current = null;
    setDragOverId(null);
    if (!drag || drag.id === overId) return;

    setCurrentBlocks(prev => {
      const dragged = prev.find(b => b.id === drag.id);
      const target = prev.find(b => b.id === overId);
      if (!dragged || !target) return prev;
      if (dragged.indent !== 0 || target.indent !== 0) return prev;
      if (isUncTitleBlock(dragged) || isUncTitleBlock(target)) return prev;

      // Reorder list roots (same order field Quick uses → workspace updates)
      const roots = prev
        .filter(b => b.indent === 0 && !isUncTitleBlock(b) && b.id !== drag.id)
        .sort((a, b) => a.order - b.order);
      const insertIdx = roots.findIndex(b => b.id === overId);
      let at: number;
      if (insertIdx < 0) {
        at = roots.length;
      } else if (dragged.order > target.order) {
        at = insertIdx; // dragging up → before target
      } else {
        at = insertIdx + 1; // dragging down → after target
      }
      roots.splice(at, 0, dragged);

      return prev.map(b => {
        if (b.indent !== 0 || isUncTitleBlock(b)) return b;
        const i = roots.findIndex(r => r.id === b.id);
        return i >= 0 ? { ...b, order: i } : b;
      });
    });
  };

  const onDragEndRow = () => {
    dragRef.current = null;
    setDragOverId(null);
  };

  const openPivotForList = (block: Block) => {
    if (block.indent !== 0) return;
    if (isUncTitleBlock(block)) return;
    const title = (block.text || '').trim() || 'List';
    onOpenPivot?.({ word: title, blockId: block.id, listId: block.id, origin: 'sidebar' });
  };

  const listTitleSignature = (value: string) =>
    value
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(part => part.toLocaleLowerCase())
      .sort()
      .join(' ');

  const openPivotFromSearch = (rawValue: string) => {
    const query = rawValue.trim();
    if (!query) return;

    const querySignature = listTitleSignature(query);
    const matchedList = blocks.find(b => {
      if (b.indent !== 0) return false;
      if (isUncTitleBlock(b)) return false;
      if (b.archived === true) return false;
      const title = (b.text || '').trim();
      if (!title) return false;
      return listTitleSignature(title) === querySignature;
    });

    if (matchedList) {
      const title = (matchedList.text || '').trim() || query;
      onOpenPivot?.({
        word: title,
        blockId: matchedList.id,
        listId: matchedList.id,
        origin: 'sidebar',
      });
      return;
    }

    onOpenPivot?.({ word: query, blockId: null, origin: 'sidebar' });
  };

  /* ===================== Render ===================== */
  return (
    <>
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <aside
        className={`relative z-60 flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl ${classes.panelGlass}`}
      >
        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 pt-2 md:px-4 md:pb-4 md:pt-[4.25rem]">
          <>
              <input
                type="text"
                value={pivotSearch}
                onChange={e => setPivotSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    openPivotFromSearch(pivotSearch);
                  }
                }}
                placeholder="Search keyword"
                className={`mb-3 w-full rounded-xl px-3 py-2 text-[12px] ${classes.quickSearchInput}`}
              />

              <div className="flex items-center justify-start mb-2.5 md:mb-4 gap-2">
                <button
                  type="button"
                  onClick={handleAddNewList}
                  className={`${classes.panelBtn} my-1 text-[11px] px-2 py-1 rounded-md`}
                  title="Add a new list"
                >
                  + New List
                </button>
              </div>

              <div className="space-y-1">
                {(() => {
                  const listBlocks = blocks.filter(b => b.indent === 0 && !isUncTitleBlock(b) && b.archived !== true);
                  if (!listBlocks.length) {
                    return (
                      <div className="text-[12px] px-1 py-2" style={{ color: 'var(--assistant-text-faint)' }}>
                        No lists yet.
                      </div>
                    );
                  }
                  return listBlocks.map((b) => {
                    const isVisible = visibleLists[b.id] !== false;
                    return (
                      <React.Fragment key={b.id}>
                        <div
                          onDragOver={e => onDragOverRow(e, b.id)}
                          onDrop={e => onDropRow(e, b.id)}
                          className={[
                            'group flex items-center gap-1 px-0.5 py-1 rounded-md',
                            dragOverId === b.id && dragRef.current?.id !== b.id ? classes.dragOver : '',
                            dragRef.current?.id === b.id ? 'opacity-60' : '',
                          ].join(' ')}
                          style={{ paddingLeft: 2 }}
                        >
                          <div
                            draggable
                            onDragStart={e => onDragStartRow(e, b.id)}
                            onDragEnd={onDragEndRow}
                            className="w-5 shrink-0 select-none flex items-center justify-center cursor-grab active:cursor-grabbing opacity-40 group-hover:opacity-100 transition-opacity"
                            style={{ color: 'var(--assistant-text-faint)' }}
                            title="Drag to reorder"
                            aria-label="Drag to reorder"
                          >
                            <svg width="8" height="13" viewBox="0 0 8 13" fill="currentColor" aria-hidden="true">
                              <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
                              <circle cx="2" cy="6.5" r="1.2"/><circle cx="6" cy="6.5" r="1.2"/>
                              <circle cx="2" cy="11" r="1.2"/><circle cx="6" cy="11" r="1.2"/>
                            </svg>
                          </div>

                          {editingListTitleId === b.id ? (
                            <input
                              data-youtask-block={b.id}
                              ref={el => void (inputRefs.current[b.id] = el)}
                              value={b.text}
                              placeholder="List…"
                              onChange={e => handleUpdateBlock(b.id, { text: e.target.value })}
                              onKeyDown={e => handleKey(e, b)}
                              onBlur={() => setEditingListTitleId(null)}
                              className={[
                                'w-full cursor-text bg-transparent text-[13px] md:text-sm font-semibold outline-none transition-opacity duration-150',
                              ].join(' ')}
                                style={{color: 'var(--assistant-text)'}}
                            />
                          ) : (
                            <button
                              type="button"
                              data-youtask-block={b.id}
                              className="w-full truncate text-left text-[13px] md:text-sm font-semibold underline underline-offset-[3px] outline-none transition-colors"
                                style={{color: 'var(--assistant-text)',textDecorationColor: 'color-mix(in srgb, var(--assistant-accent) 65%, transparent)',}}
                              onClick={() => openPivotForList(b)}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                setEditingListTitleId(b.id);
                                requestAnimationFrame(() => inputRefs.current[b.id]?.focus());
                              }}
                            >
                              {(b.text || '').trim() ? b.text : 'List…'}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleListVisibility(b.id);
                            }}
                            className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                            style={{ color: isVisible ? 'var(--assistant-accent)' : 'var(--assistant-text-faint)' }}
                            title={isVisible ? 'Hide list' : 'Show list'}
                            aria-label={isVisible ? 'Hide list' : 'Show list'}
                            aria-pressed={isVisible}
                          >
                            {isVisible ? (
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
                                <circle cx="12" cy="12" r="2.75" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.6 10.7a2.75 2.75 0 0 0 3.7 3.7" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.9 5.6A10.4 10.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16.6 16.6 0 0 1-3.2 3.6" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.1 6.2A16.7 16.7 0 0 0 2.5 12S6 18.5 12 18.5c1.1 0 2.1-.2 3.1-.5" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </React.Fragment>
                    );
                  });
                })()}
              </div>
          </>
        </div>
        </aside>
      </div>

      {deleteListConfirmId ? (
        <div className="fixed inset-0 z-[999] flex items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              setDeleteListConfirmId(null);
              armedDeleteListRef.current = null;
            }}
            aria-label="Close"
          />
            <div
              className="relative w-[92vw] max-w-md rounded-2xl shadow-2xl"
              style={{
                border: '1px solid var(--assistant-border-soft)',
                background: 'var(--assistant-panel-bg)',
              }}>
            <div
              className="px-4 py-3"
              style={{
                borderBottom: '1px solid var(--assistant-border-soft)',
              }}
            >
              <div className="text-sm font-semibold"   style={{ color: 'var(--assistant-text)' }}>Estas por borrar una lista</div>
              <p className="text-[12px]  mt-2 leading-relaxed" style={{ color: 'var(--assistant-text-muted)' }}>
                Estás por borrar una lista con todas sus tareas. ¿Seguro que quieres continuar?
              </p>
              {(() => {
                const t = blocks.find(x => x.id === deleteListConfirmId)?.text?.trim();
                if (!t) return null;
                return <div className="text-[11px]  mt-2 truncate" title={t} style={{ color: 'var(--assistant-text-faint)' }}>Lista: {t}</div>;
              })()}
            </div>
            <div className="px-4 py-3  flex items-center justify-end gap-2"  style={{borderTop: '1px solid var(--assistant-border-soft)'}}>
              <button
                type="button"
                onClick={() => {
                  setDeleteListConfirmId(null);
                  armedDeleteListRef.current = null;
                }}
                className={`${classes.modalSecondaryButton} text-[12px] px-3 py-2 rounded-md`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteListConfirmId) handleConfirmDeleteList(deleteListConfirmId);
                }}
                className="text-[12px] px-3 py-2 rounded-md bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 transition-colors"
              >
                Si, borrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </>
  );
};
