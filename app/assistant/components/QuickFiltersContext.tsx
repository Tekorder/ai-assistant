'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { DateMode, SortBy } from '@/lib/datacenter';

/** Extra task filters beyond date range (UI; priority is wired). */
export type TaskFilterTag = 'none' | 'priority' | 'someday' | 'scheduled';

type QuickFiltersContextValue = {
  dateMode: DateMode;
  setDateMode: (m: DateMode) => void;
  showCompleted: boolean;
  setShowCompleted: (v: boolean | ((p: boolean) => boolean)) => void;
  hideOnHold: boolean;
  setHideOnHold: (v: boolean | ((p: boolean) => boolean)) => void;
  sortBy: SortBy;
  setSortBy: (v: SortBy) => void;
  taskFilter: TaskFilterTag;
  setTaskFilter: (v: TaskFilterTag) => void;
};

const QuickFiltersContext = createContext<QuickFiltersContextValue | null>(null);

const LS_KEY_QUICK_FILTERS = 'youtask_quick_filters_v1';

type SavedFilters = Partial<{
  dateMode: DateMode;
  showCompleted: boolean;
  hideOnHold: boolean;
  sortBy: SortBy;
  taskFilter: TaskFilterTag;
}>;

export function QuickFiltersProvider({ children }: { children: React.ReactNode }) {
  const [dateMode, setDateMode] = useState<DateMode>('all');
  const [showCompleted, setShowCompleted] = useState(true);
  const [hideOnHold, setHideOnHold] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('dueDate');
  const [taskFilter, setTaskFilter] = useState<TaskFilterTag>('none');
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY_QUICK_FILTERS);
      if (raw) {
        const saved = JSON.parse(raw) as SavedFilters;
        if (saved.dateMode) setDateMode(saved.dateMode);
        if (typeof saved.showCompleted === 'boolean') setShowCompleted(saved.showCompleted);
        if (typeof saved.hideOnHold === 'boolean') setHideOnHold(saved.hideOnHold);
        if (saved.sortBy) setSortBy(saved.sortBy);
        if (saved.taskFilter) setTaskFilter(saved.taskFilter);
      }
    } catch {}
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      const data: SavedFilters = { dateMode, showCompleted, hideOnHold, sortBy, taskFilter };
      localStorage.setItem(LS_KEY_QUICK_FILTERS, JSON.stringify(data));
    } catch {}
  }, [restored, dateMode, showCompleted, hideOnHold, sortBy, taskFilter]);

  return (
    <QuickFiltersContext.Provider
      value={{
        dateMode,
        setDateMode,
        showCompleted,
        setShowCompleted,
        hideOnHold,
        setHideOnHold,
        sortBy,
        setSortBy,
        taskFilter,
        setTaskFilter,
      }}
    >
      {children}
    </QuickFiltersContext.Provider>
  );
}

export function useQuickFilters() {
  const ctx = useContext(QuickFiltersContext);
  if (!ctx) throw new Error('useQuickFilters must be used within QuickFiltersProvider');
  return ctx;
}
