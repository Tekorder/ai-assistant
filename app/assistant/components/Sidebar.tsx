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
  arrayMove,
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
  // Projects persistence
  readProjectsLS,
  writeProjectsLS,
} from '@/lib/datacenter';

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

  const [hintIndex, setHintIndex] = useState(0);
  const [deleteListConfirmId, setDeleteListConfirmId] = useState<string | null>(null);
  const [editingDateTaskId] = useState<string | null>(null);
  const [editingListTitleId, setEditingListTitleId] = useState<string | null>(null);

  /* ── Refs ── */
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const inlineDateRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const nudgeTimerRef = useRef<number | null>(null);
  const newTimerRef = useRef<number | null>(null);

  const dragRef = useRef<{ id: string; fromIndex: number } | null>(null);
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
    ?? moveUncToTop(ensureUncExists([{ id: uid(), text: '', indent: 0 }]));
const visibleLists = useMemo<Record<string, boolean>>(
  () => currentProject?.visibleLists ?? {},
  [currentProject?.visibleLists],
);

  /* ===================== setCurrentBlocks / setCurrentCollapsed ===================== */
  const setCurrentBlocks = (nextFn: Block[] | ((prev: Block[]) => Block[])) => {
    setProjects(prev => {
      if (!prev.length) {
        const base = moveUncToTop(ensureUncExists([{ id: uid(), text: '', indent: 0 }]));
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
      newBlocks = moveUncToTop(ensureUncExists(newBlocks));
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

    const toIndex = blocks.findIndex(b => b.id === overId);
    if (toIndex < 0) return;
    setCurrentBlocks(prev => arrayMove(prev, drag.fromIndex, toIndex));
    dragRef.current = null;
    setDragOverId(null);
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

  /* ===================== Render ===================== */
  return (
    <>
      <div className="hidden h-[calc(100%-5.5rem)] min-h-0 w-[calc(100%-1.5rem)] shrink-0 flex-col m-3 md:flex">
        <aside
          className="relative z-[60] flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#52b352]/55 bg-transparent shadow-[inset_0_1px_0_rgba(255,255,255,.06)]"
        >
        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 [scrollbar-gutter:stable]">
          <>
              <div className="flex items-center justify-start mt-2 mb-4 gap-2">
                <button
                  type="button"
                  onClick={handleAddNewList}
                  className="my-1 text-[11px] px-2 py-1 rounded-md bg-white/10 text-white/60 hover:text-white/80 hover:bg-white/16 transition-colors"
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
                      <div className="text-[12px] text-white/40 px-1 py-2">
                        No lists yet.
                      </div>
                    );
                  }
                  return listBlocks.map((b, idx) => {
                    const isVisible = visibleLists[b.id] !== false;
                    return (
                      <React.Fragment key={b.id}>
                        <div
                          draggable
                          onDragStart={e => onDragStartRow(e, b.id, idx)}
                          onDragOver={e => onDragOverRow(e, b.id)}
                          onDrop={e => onDropRow(e, b.id)}
                          onDragEnd={onDragEndRow}
                          className={[
                            'group flex items-center gap-1 px-0.5 py-1 rounded-md',
                            dragOverId === b.id && dragRef.current?.id !== b.id ? 'bg-white/7 outline outline-1 outline-white/10' : '',
                            dragRef.current?.id === b.id ? 'opacity-60' : '',
                          ].join(' ')}
                          style={{ paddingLeft: 2 }}
                        >
                          <div
                            className="w-3 shrink-0 text-white/20 select-none opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                            title="Drag"
                          >
                            ⋮⋮
                          </div>
                          <label className="relative h-4 w-4 shrink-0 flex items-center justify-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={() => toggleListVisibility(b.id)}
                              className="sr-only"
                            />
                            <span className={['h-3 w-3 rounded-full border transition-colors', isVisible ? 'border-[#d5fc43] bg-[#d5fc43]' : 'border-white/30 bg-transparent'].join(' ')} />
                          </label>

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
                                'w-full cursor-text bg-transparent text-sm font-semibold text-white outline-none transition-opacity duration-150',
                              ].join(' ')}
                            />
                          ) : (
                            <button
                              type="button"
                              data-youtask-block={b.id}
                              className="w-full truncate text-left text-sm font-semibold text-white underline decoration-[#d5fc43]/65 underline-offset-[3px] outline-none transition-colors hover:text-white"
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

                          <div className="text-[10px] uppercase tracking-[0.14em] text-white/35 pr-1">
                            {isVisible ? 'On' : 'Off'}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  });
                })()}
              </div>
          </>
        </div>

       {/* Fixed footer */}
          <div className="shrink-0 space-y-3 border-t border-white/10 bg-transparent px-4 py-3">
            <div className="rounded-2xl  px-3 py-3 min-h-[128px]">
              {hintIndex === 0 ? (
                <div>
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-xl border border-[#d5fc43]/30 bg-[#d5fc43]/12 flex items-center justify-center text-lg shrink-0">
                      🎨
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[#d5fc43]/75">
                        Hint
                      </div>
                      <div className="mt-1 text-[12px] leading-5 text-white/80">
                        Learn the duedate colors to understand your tasks faster.
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#d5fc43]/35 bg-[#d5fc43]/14 px-2 py-1 text-[11px] text-[#d5fc43]">
                      <span className="h-2 w-2 rounded-full bg-[#d5fc43]" />
                      Today
                    </span>

                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200">
                      <span className="h-2 w-2 rounded-full bg-emerald-300" />
                      Tomorrow
                    </span>

                    <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-200">
                      <span className="h-2 w-2 rounded-full bg-sky-300" />
                      Upcoming
                    </span>

                    <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200">
                      <span className="h-2 w-2 rounded-full bg-rose-300" />
                      Overdue
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-xl border border-[#d5fc43]/30 bg-[#d5fc43]/12 flex items-center justify-center text-lg shrink-0">
                    💡
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#d5fc43]/75">
                      Hint
                    </div>
                    <div className="mt-1 text-[12px] leading-5 text-white/80 transition-all">
                      {hintIndex === 1 && 'Use Daily view to get focused on today’s tasks.'}
                      {hintIndex === 2 && 'Use Organizer to plan your tasks based on your list.'}
                      {hintIndex === 3 && 'Use Timeline to check your week progress.'}
                      {hintIndex === 4 && 'Use Calendar to plan the future.'}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setHintIndex(i)}
                      className={[
                        'h-1.5 rounded-full transition-all',
                        i === hintIndex ? 'w-5 bg-[#d5fc43]' : 'w-1.5 bg-white/20 hover:bg-white/35',
                      ].join(' ')}
                      aria-label={`Go to slide ${i + 1}`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setHintIndex((prev) => (prev - 1 + 5) % 5)}
                    className="h-7 w-7 rounded-full bg-white/10 text-white/60 hover:text-white/85 hover:bg-white/16"
                    aria-label="Previous slide"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => setHintIndex((prev) => (prev + 1) % 5)}
                    className="h-7 w-7 rounded-full bg-white/10 text-white/60 hover:text-white/85 hover:bg-white/16"
                    aria-label="Next slide"
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>

       
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
          <div className="relative w-[92vw] max-w-md rounded-2xl border border-white/10 bg-black shadow-2xl">
            <div className="px-4 py-3 border-b border-white/10">
              <div className="text-sm font-semibold text-white/90">Estas por borrar una lista</div>
              <p className="text-[12px] text-white/65 mt-2 leading-relaxed">
                Estás por borrar una lista con todas sus tareas. ¿Seguro que quieres continuar?
              </p>
              {(() => {
                const t = blocks.find(x => x.id === deleteListConfirmId)?.text?.trim();
                if (!t) return null;
                return <div className="text-[11px] text-white/40 mt-2 truncate" title={t}>Lista: {t}</div>;
              })()}
            </div>
            <div className="px-4 py-3 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteListConfirmId(null);
                  armedDeleteListRef.current = null;
                }}
                className="text-[12px] px-3 py-2 rounded-md bg-white/10 text-white/70 hover:text-white/90 hover:bg-white/16 transition-colors"
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