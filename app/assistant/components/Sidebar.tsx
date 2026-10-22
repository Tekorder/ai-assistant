// app/components/Sidebar.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  // Types
  type Block,
  type Project,
  // Constants
  LS_KEY_V2,
  // Utilities
  uid,
  todayYMD,
  // Array structure
  isUncTitleBlock,
  ensureUncExists,
  moveUncToTop,
  makePersonalProject,
  ensureDefaultGroups,
  moveListToProject,
  // Block mutations
  updateBlock as updateBlockArr,
  insertBlockAfter,
  insertListAfter,
  removeBlock as removeBlockArr,
  removeListAndChildren,
  openTasksOf,
  moveOpenTasksToList,
  getListProgress,
  sortBlocksByOrder,
  // Projects persistence
  readProjectsLS,
  readLegacyBlocksLS,
  writeProjectsLS,
} from '@/lib/datacenter';
import classes from '@/app/assistant/_theme/themes.module.css';
import { useQuickFilters } from './QuickFiltersContext';
import { useShowAllGroups, useFocusedList } from '../_hook/useShowAllGroups';
import { DeleteWithOpenTasksDialog, buildMoveTargets } from './DeleteWithOpenTasksDialog';

const LS_KEY_COLLAPSED_GROUPS = 'youtask_sidebar_collapsed_groups';

type SidebarProps = {
  onOpenPivot?: (detail: {
    word: string;
    blockId: string | null;
    origin: 'sidebar';
    listId?: string | null;
  }) => void;
};

export const Sidebar: React.FC<SidebarProps> = () => {
  const { sortBy, hideSomeday } = useQuickFilters();

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
  const [listMenu, setListMenu] = useState<{ listId: string; x: number; y: number } | null>(null);
  const [groupsModalOpen, setGroupsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  // Sidebar group (project) collapse state — UI-only, persisted per browser
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const groupDragRef = useRef<string | null>(null);
  const [groupDragOverId, setGroupDragOverId] = useState<string | null>(null);
  const [deleteGroupConfirmId, setDeleteGroupConfirmId] = useState<string | null>(null);
  // Group being deleted while it still has unchecked tasks (move-or-delete dialog)
  const [deleteGroupDialogId, setDeleteGroupDialogId] = useState<string | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<{ id: string; draft: string } | null>(null);
  // Group a dragged list is hovering when it's about to move to another group
  const [listDropGroupId, setListDropGroupId] = useState<string | null>(null);

  /* ── Refs ── */
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const inlineDateRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const nudgeTimerRef = useRef<number | null>(null);
  const newTimerRef = useRef<number | null>(null);

  const dragRef = useRef<{ id: string; projectId: string } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const lastWrittenRef = useRef<string>('');
  const applyingExternalRef = useRef(false);
  const armedDeleteListRef = useRef<{ id: string; t: number } | null>(null);

  const [showAllGroups, setShowAllGroups] = useShowAllGroups();
  const [focusedList, setFocusedList] = useFocusedList();
  const toggleFocusedList = (projectId: string, listId: string) =>
    setFocusedList(focusedList?.listId === listId ? null : { projectId, listId });
  // Back to the plain view of the selected group
  const clearViewFilters = () => {
    if (showAllGroups) setShowAllGroups(false);
    if (focusedList) setFocusedList(null);
  };

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

  // Selecting another group drops a focused list from the previous one
  useEffect(() => {
    if (!selectedProjectId || !focusedList) return;
    if (focusedList.projectId !== selectedProjectId) setFocusedList(null);
  }, [selectedProjectId, focusedList, setFocusedList]);

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

      const loadedBlocks = readLegacyBlocksLS();
      if (loadedBlocks) {
        const loadedCollapsed = buildAllCollapsedFromBlocks(loadedBlocks);
        const personal = makePersonalProject(loadedBlocks, loadedCollapsed);
        const all = ensureDefaultGroups([personal]);
        setProjects(all);
        setSelectedProjectId(personal.project_id);
        const boot = { projects: all, selectedProjectId: personal.project_id };
        lastWrittenRef.current = JSON.stringify(boot);
        writeProjectsLS(boot);
        return;
      }

      const all = ensureDefaultGroups([]);
      setProjects(all);
      setSelectedProjectId(all[0].project_id);
      const boot = { projects: all, selectedProjectId: all[0].project_id };
      lastWrittenRef.current = JSON.stringify(boot);
      writeProjectsLS(boot);
    } catch {
      const all = ensureDefaultGroups([]);
      setProjects(all);
      setSelectedProjectId(all[0].project_id);
      const boot = { projects: all, selectedProjectId: all[0].project_id };
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
    try {
      const raw = localStorage.getItem(LS_KEY_COLLAPSED_GROUPS);
      if (raw) setCollapsedGroups(JSON.parse(raw) ?? {});
    } catch {}
  }, []);

  useEffect(() => {
    if (!listMenu) return;
    const close = () => setListMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [listMenu]);

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

  const handleDeleteList = (listId: string) => {
    setCurrentBlocks(prev => removeListAndChildren(prev, listId));
    setCurrentCollapsed(c => {
      const { [listId]: _omit, ...rest } = c;
      void _omit;
      return rest;
    });
    setCurrentVisibleLists(v => {
      const { [listId]: _omit, ...rest } = v;
      void _omit;
      return rest;
    });
    if (editingListTitleId === listId) setEditingListTitleId(null);
  };

  const handleConfirmDeleteList = (listId: string) => {
    setDeleteListConfirmId(null);
    armedDeleteListRef.current = null;
    handleDeleteList(listId);
  };

  // Rescue the list's unchecked tasks into another list (any group), then delete it
  const handleMoveAndDeleteList = (listId: string, toProjectId: string, toListId: string) => {
    const fromProjectId = currentProject?.project_id;
    if (!fromProjectId) return;
    setProjects(prev => moveOpenTasksToList(prev, fromProjectId, [listId], toProjectId, toListId));
    handleConfirmDeleteList(listId);
  };


  const handleAddNewProject = (rawTitle: string) => {
    const title = rawTitle.trim();
    setNewProjectName('');
    if (!title) return;
    const project = { ...makePersonalProject(), title };
    setProjects(prev => [...prev, project]);
    setSelectedProjectId(project.project_id);
  };

  const closeGroupsModal = () => {
    setGroupsModalOpen(false);
    setNewProjectName('');
    setDeleteGroupConfirmId(null);
    setDeleteGroupDialogId(null);
    setRenamingGroup(null);
    groupDragRef.current = null;
    setGroupDragOverId(null);
  };

  // There's always at least one group — the last one can't be deleted
  const handleDeleteProject = (projectId: string) => {
    setDeleteGroupConfirmId(null);
    setDeleteGroupDialogId(null);
    if (projects.length <= 1) return;
    setProjects(prev => (prev.length <= 1 ? prev : prev.filter(p => p.project_id !== projectId)));
    if (selectedProjectId === projectId) {
      setSelectedProjectId(projects.find(p => p.project_id !== projectId)?.project_id ?? '');
    }
  };

  const groupOpenTasks = (project: Project) =>
    openTasksOf(project.blocks ?? [], (project.blocks ?? []).filter(b => b.indent === 0).map(b => b.id));

  // A group with unchecked tasks asks where they go (dialog); otherwise the inline confirm
  const requestDeleteProject = (project: Project) => {
    if (groupOpenTasks(project).length > 0) setDeleteGroupDialogId(project.project_id);
    else setDeleteGroupConfirmId(project.project_id);
  };

  const handleMoveAndDeleteProject = (projectId: string, toProjectId: string, toListId: string) => {
    const project = projects.find(p => p.project_id === projectId);
    if (!project) return;
    const listIds = (project.blocks ?? []).filter(b => b.indent === 0).map(b => b.id);
    setProjects(prev => moveOpenTasksToList(prev, projectId, listIds, toProjectId, toListId));
    handleDeleteProject(projectId);
  };

  const startRenameProject = (project: Project) => {
    setDeleteGroupConfirmId(null);
    setRenamingGroup({ id: project.project_id, draft: project.title });
  };

  // Blank names are ignored — the group keeps its old one
  const commitRenameProject = () => {
    if (!renamingGroup) return;
    const title = renamingGroup.draft.trim();
    setRenamingGroup(null);
    if (!title) return;
    setProjects(prev => prev.map(p => (p.project_id === renamingGroup.id && p.title !== title ? { ...p, title } : p)));
  };

  // Moves the dragged group into the target's slot (before it when dragging up, after when dragging down).
  const handleDropGroup = (overId: string) => {
    const dragId = groupDragRef.current;
    groupDragRef.current = null;
    setGroupDragOverId(null);
    if (!dragId || dragId === overId) return;
    setProjects(prev => {
      const from = prev.findIndex(p => p.project_id === dragId);
      const to = prev.findIndex(p => p.project_id === overId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  useEffect(() => {
    if (!groupsModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeGroupsModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [groupsModalOpen]);

  const toggleGroupCollapsed = (projectId: string) => {
    setCollapsedGroups(prev => {
      const next = { ...prev, [projectId]: !prev[projectId] };
      try { localStorage.setItem(LS_KEY_COLLAPSED_GROUPS, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const toggleListVisibility = (listId: string) =>
    setCurrentVisibleLists(prev => ({ ...prev, [listId]: prev[listId] === false }));

  // New list right below another one (like Workspace's "Task…" row), title ready to type
  const handleAddListAfter = (listId: string) => {
    const newListId = uid();
    setCurrentBlocks(prev => insertListAfter(prev, listId, newListId));
    setEditingListTitleId(newListId);
    requestAnimationFrame(() => inputRefs.current[newListId]?.focus());
  };

  // Leaving a brand-new list without a name (and with no tasks) drops it
  const handleListTitleBlur = (b: Block) => {
    setEditingListTitleId(prev => (prev === b.id ? null : prev));
    if ((b.text || '').trim()) return;
    setCurrentBlocks(prev => (prev.some(x => x.parentId === b.id) ? prev : prev.filter(x => x.id !== b.id)));
  };

  /* ── Keyboard (tasks) ── */
  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>, b: Block) => {
    if (e.key === 'Enter' && b.indent === 0) {
      // On a list title: Enter starts the next list
      e.preventDefault();
      if ((b.text || '').trim()) handleAddListAfter(b.id);
      return;
    }
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
        // Due date only while viewing by Due Date or hiding Someday; the creation date is always set
        deadline: nextIndent > 0 && (sortBy === 'dueDate' || hideSomeday) ? todayYMD() : undefined,
        createdAt: todayYMD(),
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
  const onDragStartRow = (e: React.DragEvent, id: string, projectId: string) => {
    e.stopPropagation();
    dragRef.current = { id, projectId };
    setDragOverId(id);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', id);
    } catch {}
  };

  const onDragOverRow = (e: React.DragEvent, overId: string, overProjectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragRef.current) return;
    if (dragOverId !== overId) setDragOverId(overId);
    const crossGroup = dragRef.current.projectId !== overProjectId ? overProjectId : null;
    if (listDropGroupId !== crossGroup) setListDropGroupId(crossGroup);
  };

  // Hovering a group (its header, empty area or gaps) while dragging a list from another one
  const onDragOverGroup = (e: React.DragEvent, projectId: string) => {
    if (!dragRef.current) return;
    e.preventDefault();
    if (dragOverId !== null) setDragOverId(null);
    const crossGroup = dragRef.current.projectId !== projectId ? projectId : null;
    if (listDropGroupId !== crossGroup) setListDropGroupId(crossGroup);
  };

  /** Drop on a group outside any row → the list moves to the end of that group. */
  const onDropGroup = (e: React.DragEvent, projectId: string) => {
    const drag = dragRef.current;
    if (!drag) return;
    e.preventDefault();
    dragRef.current = null;
    setDragOverId(null);
    setListDropGroupId(null);
    if (drag.projectId === projectId) return;
    setProjects(prev => moveListToProject(prev, drag.id, projectId, null));
  };

  const onDropRow = (e: React.DragEvent, overId: string, overProjectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const drag = dragRef.current;
    dragRef.current = null;
    setDragOverId(null);
    setListDropGroupId(null);
    if (!drag || drag.id === overId) return;

    // Into another group → lands right before the list it was dropped on
    if (drag.projectId !== overProjectId) {
      setProjects(prev => moveListToProject(prev, drag.id, overProjectId, overId));
      return;
    }

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
    setListDropGroupId(null);
  };

  // Lives on the first group's title row (right-aligned)
  const manageGroupsButton = (
    <button
      type="button"
      onClick={() => setGroupsModalOpen(true)}
      data-group-manage
      className={`${classes.panelCloseBtn} flex h-7 w-7 shrink-0 items-center justify-center rounded-md`}
      // Theme text color: navy on light themes, white on dark (icon keeps its .72 opacity)
      style={{ color: 'var(--assistant-text)' }}
      title="Manage groups"
      aria-label="Manage groups"
      aria-haspopup="dialog"
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
            d="M2.5 5C2.5 4.83424 2.56585 4.67527 2.68306 4.55806C2.80027 4.44085 2.95924 4.375 3.125 4.375H16.875C17.0408 4.375 17.1997 4.44085 17.3169 4.55806C17.4342 4.67527 17.5 4.83424 17.5 5C17.5 5.16576 17.4342 5.32473 17.3169 5.44194C17.1997 5.55915 17.0408 5.625 16.875 5.625H3.125C2.95924 5.625 2.80027 5.55915 2.68306 5.44194C2.56585 5.32473 2.5 5.16576 2.5 5ZM3.125 10.625H16.875C17.0408 10.625 17.1997 10.5592 17.3169 10.4419C17.4342 10.3247 17.5 10.1658 17.5 10C17.5 9.83424 17.4342 9.67527 17.3169 9.55806C17.1997 9.44085 17.0408 9.375 16.875 9.375H3.125C2.95924 9.375 2.80027 9.44085 2.68306 9.55806C2.56585 9.67527 2.5 9.83424 2.5 10C2.5 10.1658 2.56585 10.3247 2.68306 10.4419C2.80027 10.5592 2.95924 10.625 3.125 10.625ZM11.25 14.375H3.125C2.95924 14.375 2.80027 14.4408 2.68306 14.5581C2.56585 14.6753 2.5 14.8342 2.5 15C2.5 15.1658 2.56585 15.3247 2.68306 15.4419C2.80027 15.5592 2.95924 15.625 3.125 15.625H11.25C11.4158 15.625 11.5747 15.5592 11.6919 15.4419C11.8092 15.3247 11.875 15.1658 11.875 15C11.875 14.8342 11.8092 14.6753 11.6919 14.5581C11.5747 14.4408 11.4158 14.375 11.25 14.375ZM18.125 14.375H16.875V13.125C16.875 12.9592 16.8092 12.8003 16.6919 12.6831C16.5747 12.5658 16.4158 12.5 16.25 12.5C16.0842 12.5 15.9253 12.5658 15.8081 12.6831C15.6908 12.8003 15.625 12.9592 15.625 13.125V14.375H14.375C14.2092 14.375 14.0503 14.4408 13.9331 14.5581C13.8158 14.6753 13.75 14.8342 13.75 15C13.75 15.1658 13.8158 15.3247 13.9331 15.4419C14.0503 15.5592 14.2092 15.625 14.375 15.625H15.625V16.875C15.625 17.0408 15.6908 17.1997 15.8081 17.3169C15.9253 17.4342 16.0842 17.5 16.25 17.5C16.4158 17.5 16.5747 17.4342 16.6919 17.3169C16.8092 17.1997 16.875 17.0408 16.875 16.875V15.625H18.125C18.2908 15.625 18.4497 15.5592 18.5669 15.4419C18.6842 15.3247 18.75 15.1658 18.75 15C18.75 14.8342 18.6842 14.6753 18.5669 14.5581C18.4497 14.4408 18.2908 14.375 18.125 14.375Z"
          fill="currentColor"
          fillOpacity="0.72"
        />
      </svg>
    </button>
  );

  /* ===================== Render ===================== */
  return (
    <>
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <aside
        className={`relative z-60 flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl ${classes.panelGlass}`}
      >
        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 pt-2 md:px-4 md:pb-4 md:pt-3">
          <>
              {/* Workspace, Calendar and Timeline show every group (hidden lists too) while on */}
              {/* Looks and behaves like a list row: click to show everything, click again (or any list/group) to leave */}
              <div
                role="button"
                tabIndex={0}
                aria-pressed={showAllGroups}
                onClick={() => setShowAllGroups(!showAllGroups)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowAllGroups(!showAllGroups); }
                }}
                title={showAllGroups ? 'Showing every group and list — click to go back to the selected group' : 'Show every group and list'}
                className="mb-3 flex cursor-pointer select-none items-center gap-1 rounded-md px-0.5 py-1"
                style={{ paddingLeft: 2 }}
              >
                <div className="w-5 shrink-0 flex items-center justify-center" style={{ color: showAllGroups ? 'var(--assistant-accent)' : 'var(--assistant-text-faint)' }}>
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                    <rect x="2" y="2" width="5" height="5" rx="1.2" />
                    <rect x="9" y="2" width="5" height="5" rx="1.2" />
                    <rect x="2" y="9" width="5" height="5" rx="1.2" />
                    <rect x="9" y="9" width="5" height="5" rx="1.2" />
                  </svg>
                </div>
                <span
                  className={[
                    'min-w-0 truncate text-left text-[14px] md:text-sm font-semibold',
                    showAllGroups ? 'underline decoration-2 underline-offset-[3px]' : '',
                  ].join(' ')}
                  style={{
                    color: 'var(--assistant-text)',
                    textDecorationColor: showAllGroups ? 'var(--assistant-accent)' : undefined,
                  }}
                >
                  Show all
                </span>
              </div>
              <div className="space-y-4">
              {projects.map((project, projectIndex) => {
                const isCurrent = project.project_id === currentProject?.project_id;
                const isGroupCollapsed = collapsedGroups[project.project_id] === true;
                const listBlocks = (project.blocks ?? []).filter(b => b.indent === 0 && !isUncTitleBlock(b) && b.archived !== true);
                return (
              <div
                key={project.project_id}
                // Row actions operate on the selected project, so select this one first
                // (but not when opening the groups modal — that shouldn't switch groups).
                onMouseDownCapture={e => {
                  if ((e.target as HTMLElement).closest('[data-group-manage]')) return;
                  if (!isCurrent) setSelectedProjectId(project.project_id);
                }}
                onDragOver={e => onDragOverGroup(e, project.project_id)}
                onDrop={e => onDropGroup(e, project.project_id)}
                className={[
                  'rounded-lg transition-colors',
                  listDropGroupId === project.project_id ? classes.dragOver : '',
                ].join(' ')}
              >
                <div className="mb-1 flex items-center gap-2">
                  <div
                    className="flex min-w-0 flex-1 items-center gap-1 px-1 text-left text-[12px] font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--assistant-text-soft)' }}
                  >
                    {/* The chevron collapses; clicking the name selects the group and clears any view filter */}
                    <button
                      type="button"
                      onClick={() => toggleGroupCollapsed(project.project_id)}
                      className="shrink-0 flex h-4 w-4 items-center justify-center"
                      title={isGroupCollapsed ? 'Expand group' : 'Collapse group'}
                      aria-label={isGroupCollapsed ? `Expand ${project.title}` : `Collapse ${project.title}`}
                      aria-expanded={!isGroupCollapsed}
                    >
                      <svg
                        viewBox="0 0 16 16"
                        className="h-3 w-3 shrink-0 transition-transform duration-150"
                        style={{ transform: isGroupCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6l4 4 4-4" />
                      </svg>
                    </button>
                    <span
                      role="button"
                      tabIndex={0}
                      className={[
                        'truncate cursor-pointer select-none',
                        isCurrent ? 'font-bold underline underline-offset-[3px]' : '',
                      ].join(' ')}
                      style={isCurrent ? { color: 'var(--assistant-text)' } : undefined}
                      title={project.title}
                      aria-current={isCurrent ? 'true' : undefined}
                      onClick={clearViewFilters}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedProjectId(project.project_id);
                          clearViewFilters();
                        }
                      }}
                    >
                      {project.title}
                    </span>
                  </div>
                  {projectIndex === 0 ? manageGroupsButton : null}
                </div>

              {isGroupCollapsed ? null : (
              <div className="space-y-1 pl-3">
                {(() => {
                  if (!listBlocks.length) {
                    return (
                      <div className="text-[13px] px-1 py-2" style={{ color: 'var(--assistant-text-faint)' }}>
                        No lists yet.
                      </div>
                    );
                  }
                  return listBlocks.map((b) => {
                    const hasTitle = (b.text || '').trim() !== '';
                    const typingThis = editingListTitleId === b.id;
                    return (
                      <React.Fragment key={b.id}>
                        <div
                          onDragOver={e => onDragOverRow(e, b.id, project.project_id)}
                          onDrop={e => onDropRow(e, b.id, project.project_id)}
                          className={[
                            'group flex items-center gap-1 px-0.5 py-1 rounded-md',
                            dragOverId === b.id && dragRef.current?.id !== b.id ? classes.dragOver : '',
                            dragRef.current?.id === b.id ? 'opacity-60' : '',
                            hasTitle && !typingThis ? 'side-add-anchor' : '',
                          ].join(' ')}
                          style={{ paddingLeft: 2 }}
                        >
                          <div
                            draggable
                            onDragStart={e => onDragStartRow(e, b.id, project.project_id)}
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
                              onBlur={() => handleListTitleBlur(b)}
                              className={[
                                'w-full cursor-text bg-transparent text-[14px] md:text-sm font-semibold outline-none transition-opacity duration-150',
                              ].join(' ')}
                                style={{color: 'var(--assistant-text)'}}
                            />
                          ) : (
                            <div className="min-w-0 flex-1 flex items-center gap-1">
                              <span
                                data-youtask-block={b.id}
                                role="button"
                                tabIndex={0}
                                aria-pressed={focusedList?.listId === b.id}
                                title={focusedList?.listId === b.id ? 'Showing only this list — click to show all lists' : 'Show only this list'}
                                className={[
                                  'min-w-0 cursor-pointer select-none truncate text-left text-[14px] md:text-sm font-semibold',
                                  focusedList?.listId === b.id ? 'underline decoration-2 underline-offset-[3px]' : '',
                                ].join(' ')}
                                style={{
                                  color: 'var(--assistant-text)',
                                  textDecorationColor: focusedList?.listId === b.id ? 'var(--assistant-accent)' : undefined,
                                }}
                                // Global filter: Workspace, Calendar and Timeline show only this list (click again to undo)
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFocusedList(project.project_id, b.id);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    toggleFocusedList(project.project_id, b.id);
                                  }
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setEditingListTitleId(b.id);
                                  requestAnimationFrame(() => inputRefs.current[b.id]?.focus());
                                }}
                              >
                                {(b.text || '').trim() ? b.text : 'List…'}
                              </span>
                              {(() => {
                                const p = getListProgress(project.blocks ?? [], b.id);
                                return (
                                  <span className="shrink-0 text-[12px] font-medium tabular-nums" style={{ color: 'var(--assistant-text-faint)' }}>
                                    ({p.done}/{p.total})
                                  </span>
                                );
                              })()}
                            </div>
                          )}

                          {/* mousedown on the group selects its project first, so the toggle hits the right one */}
                          {project.visibleLists?.[b.id] === false ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleListVisibility(b.id);
                              }}
                              className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100"
                              style={{ color: 'var(--assistant-text-faint)' }}
                              title="Hidden — click to show"
                              aria-label="Show list"
                            >
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.6 10.7a2.75 2.75 0 0 0 3.7 3.7" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.9 5.6A10.4 10.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16.6 16.6 0 0 1-3.2 3.6" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.1 6.2A16.7 16.7 0 0 0 2.5 12S6 18.5 12 18.5c1.1 0 2.1-.2 3.1-.5" />
                              </svg>
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onMouseDown={e => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              const r = e.currentTarget.getBoundingClientRect();
                              setListMenu(prev =>
                                prev?.listId === b.id ? null : { listId: b.id, x: r.right, y: r.bottom + 4 },
                              );
                            }}
                            className={[
                              'shrink-0 flex h-7 w-7 items-center justify-center rounded-md transition-opacity',
                              listMenu?.listId === b.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-70 hover:!opacity-100',
                            ].join(' ')}
                            style={{ color: 'var(--assistant-text-faint)' }}
                            title="List options"
                            aria-label="List options"
                            aria-haspopup="menu"
                            aria-expanded={listMenu?.listId === b.id}
                          >
                            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                              <circle cx="8" cy="3.2" r="1.3" />
                              <circle cx="8" cy="8" r="1.3" />
                              <circle cx="8" cy="12.8" r="1.3" />
                            </svg>
                          </button>
                        </div>
                        {/* Ghost "List…" row — on hover under a named list, never while its title is being typed.
                            Must directly follow the row: CSS reveals it via .side-add-anchor:hover + .side-add-ghost */}
                        {hasTitle && !typingThis && (
                          <button
                            type="button"
                            onClick={() => handleAddListAfter(b.id)}
                            aria-label="Add list"
                            className="side-add-ghost flex w-full items-center gap-1 text-left"
                            style={{ paddingLeft: 2 }}
                          >
                            <span className="w-5 shrink-0 text-center text-[14px] leading-none" style={{ color: 'var(--assistant-text-faint)' }}>+</span>
                            <span className="text-[14px] md:text-sm font-semibold" style={{ color: 'var(--assistant-text-faint)' }}>List…</span>
                          </button>
                        )}
                      </React.Fragment>
                    );
                  });
                })()}
              </div>
              )}
              </div>
                );
              })}
              </div>
          </>
        </div>
        </aside>
      </div>

      {listMenu ? createPortal(
        (() => {
          const listId = listMenu.listId;
          const p = getListProgress(blocks, listId);
          const isVisible = visibleLists[listId] !== false;
          return (
            <div
              role="menu"
              className="fixed z-[10030] flex items-center gap-1 rounded-lg px-2 py-1 shadow-xl"
              style={{
                left: listMenu.x,
                top: listMenu.y,
                transform: 'translateX(-100%)',
                background: 'var(--assistant-panel-bg)',
                border: '1px solid var(--assistant-border-soft)',
              }}
              onMouseDown={e => e.stopPropagation()}
            >
              <span className="shrink-0 text-[12px] tabular-nums" style={{ color: 'var(--assistant-text-faint)' }}>
                ({p.done}/{p.total})
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleListVisibility(listId);
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
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteListConfirmId(listId);
                  setListMenu(null);
                }}
                className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:!text-rose-400"
                style={{ color: 'var(--assistant-text-faint)' }}
                title="Delete list"
                aria-label="Delete list"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9.5 7V4.5h5V7M6 7l1 12.5h10L18 7M10 11v5M14 11v5" />
                </svg>
              </button>
            </div>
          );
        })(),
        document.querySelector('[data-assistant-root]') ?? document.body,
      ) : null}

      {groupsModalOpen ? createPortal(
        <div className="fixed inset-0 z-[10050] flex items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={closeGroupsModal}
            aria-label="Close groups"
          />
          <div
            role="dialog"
            aria-label="Groups"
            className="relative w-[92vw] max-w-sm rounded-2xl shadow-2xl"
            style={{
              border: '1px solid var(--assistant-border-soft)',
              background: 'var(--assistant-panel-bg)',
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}
            >
              <div className="text-sm font-semibold" style={{ color: 'var(--assistant-text)' }}>Groups</div>
              <button
                type="button"
                onClick={closeGroupsModal}
                className={`h-8 w-8 rounded-lg ${classes.panelCloseBtn}`}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="px-4 py-3">
              <form
                className="flex items-center gap-2"
                onSubmit={e => { e.preventDefault(); handleAddNewProject(newProjectName); }}
              >
                <input
                  autoFocus
                  type="text"
                  value={newProjectName}
                  placeholder="New group name…"
                  onChange={e => setNewProjectName(e.target.value)}
                  className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-[13px] ${classes.quickSearchInput}`}
                />
                <button
                  type="submit"
                  disabled={!newProjectName.trim()}
                  className={`${classes.panelBtn} shrink-0 text-[13px] px-3 py-1.5 rounded-md`}
                >
                  Add
                </button>
              </form>

              <div className="mt-3 max-h-[50vh] space-y-1 overflow-y-auto">
                {projects.map(project => {
                  const confirming = deleteGroupConfirmId === project.project_id;
                  const renaming = renamingGroup?.id === project.project_id;
                  const canDelete = projects.length > 1;
                  return (
                  <div
                    key={project.project_id}
                    draggable={!renaming}
                    onDragStart={e => {
                      groupDragRef.current = project.project_id;
                      e.dataTransfer.effectAllowed = 'move';
                      try { e.dataTransfer.setData('text/plain', project.project_id); } catch {}
                    }}
                    onDragOver={e => {
                      e.preventDefault();
                      if (groupDragRef.current && groupDragOverId !== project.project_id) setGroupDragOverId(project.project_id);
                    }}
                    onDrop={e => { e.preventDefault(); handleDropGroup(project.project_id); }}
                    onDragEnd={() => { groupDragRef.current = null; setGroupDragOverId(null); }}
                    className={[
                      'group flex items-center gap-2 rounded-md px-1.5 py-1.5',
                      renaming ? '' : 'cursor-grab active:cursor-grabbing',
                      groupDragOverId === project.project_id && groupDragRef.current !== project.project_id ? classes.dragOver : '',
                      groupDragRef.current === project.project_id ? 'opacity-60' : '',
                    ].join(' ')}
                  >
                    <span
                      className="w-5 shrink-0 flex items-center justify-center opacity-40 group-hover:opacity-100 transition-opacity"
                      style={{ color: 'var(--assistant-text-faint)' }}
                      aria-hidden="true"
                    >
                      <svg width="8" height="13" viewBox="0 0 8 13" fill="currentColor">
                        <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
                        <circle cx="2" cy="6.5" r="1.2"/><circle cx="6" cy="6.5" r="1.2"/>
                        <circle cx="2" cy="11" r="1.2"/><circle cx="6" cy="11" r="1.2"/>
                      </svg>
                    </span>
                    {renaming ? (
                      <input
                        autoFocus
                        type="text"
                        value={renamingGroup.draft}
                        onChange={e => setRenamingGroup({ id: project.project_id, draft: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); commitRenameProject(); }
                          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setRenamingGroup(null); }
                        }}
                        onBlur={commitRenameProject}
                        onFocus={e => e.currentTarget.select()}
                        className={`min-w-0 flex-1 rounded-md px-2 py-1 text-[13px] font-semibold ${classes.quickSearchInput}`}
                        aria-label="Group name"
                      />
                    ) : (
                      <span
                        className="min-w-0 flex-1 truncate text-[13px] font-semibold uppercase tracking-wide"
                        style={{ color: 'var(--assistant-text-soft)' }}
                        title={confirming ? project.title : 'Double-click to rename'}
                        onDoubleClick={() => { if (!confirming) startRenameProject(project); }}
                      >
                        {confirming ? `Delete ${project.title}?` : project.title}
                      </span>
                    )}
                    {renaming ? null : !confirming ? (
                      <button
                        type="button"
                        onClick={() => startRenameProject(project)}
                        className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity"
                        style={{ color: 'var(--assistant-text-faint)' }}
                        title="Rename group"
                        aria-label={`Rename group ${project.title}`}
                      >
                        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 2.5l3 3L5.5 13.5H2.5v-3L10.5 2.5z" />
                        </svg>
                      </button>
                    ) : null}
                    {renaming || !canDelete ? null : confirming ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleDeleteProject(project.project_id)}
                          className="shrink-0 rounded-md px-2 py-1 text-[12px] bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteGroupConfirmId(null)}
                          className={`${classes.panelBtn} shrink-0 rounded-md px-2 py-1 text-[12px]`}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => requestDeleteProject(project)}
                        className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:!text-rose-400 transition-[opacity,color]"
                        style={{ color: 'var(--assistant-text-faint)' }}
                        title="Delete group"
                        aria-label={`Delete group ${project.title}`}
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9.5 7V4.5h5V7M6 7l1 12.5h10L18 7M10 11v5M14 11v5" />
                        </svg>
                      </button>
                    )}
                  </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>
                Drag to reorder. Double-click a name to rename it.
              </p>
              {deleteGroupConfirmId ? (
                <p className="mt-1 text-[12px] text-rose-300">
                  Warning: deleting a group also deletes all its lists and tasks. This can&apos;t be undone.
                </p>
              ) : null}
            </div>
          </div>
        </div>,
        document.querySelector('[data-assistant-root]') ?? document.body,
      ) : null}

      {deleteListConfirmId ? createPortal(
        <DeleteWithOpenTasksDialog
          key={deleteListConfirmId}
          kind="list"
          name={blocks.find(x => x.id === deleteListConfirmId)?.text?.trim()}
          openCount={openTasksOf(blocks, [deleteListConfirmId]).length}
          targets={buildMoveTargets(projects, { listIds: [deleteListConfirmId] })}
          defaultProjectId={currentProject?.project_id}
          zIndex={10050}
          onCancel={() => { setDeleteListConfirmId(null); armedDeleteListRef.current = null; }}
          onDelete={() => handleConfirmDeleteList(deleteListConfirmId)}
          onMoveAndDelete={(toProjectId, toListId) => handleMoveAndDeleteList(deleteListConfirmId, toProjectId, toListId)}
        />,
        document.querySelector('[data-assistant-root]') ?? document.body,
      ) : null}

      {deleteGroupDialogId ? createPortal(
        (() => {
          const project = projects.find(p => p.project_id === deleteGroupDialogId);
          if (!project) return null;
          return (
            <DeleteWithOpenTasksDialog
              key={deleteGroupDialogId}
              kind="group"
              name={project.title}
              openCount={groupOpenTasks(project).length}
              targets={buildMoveTargets(projects, { projectId: deleteGroupDialogId })}
              zIndex={10060}
              onCancel={() => setDeleteGroupDialogId(null)}
              onDelete={() => handleDeleteProject(deleteGroupDialogId)}
              onMoveAndDelete={(toProjectId, toListId) => handleMoveAndDeleteProject(deleteGroupDialogId, toProjectId, toListId)}
            />
          );
        })(),
        document.querySelector('[data-assistant-root]') ?? document.body,
      ) : null}

    </>
  );
};
