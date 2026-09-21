'use client';
import React, { createContext, useContext, useState } from 'react';
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

export function QuickFiltersProvider({ children }: { children: React.ReactNode }) {
  const [dateMode, setDateMode] = useState<DateMode>('all');
  const [showCompleted, setShowCompleted] = useState(true);
  const [hideOnHold, setHideOnHold] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('dueDate');
  const [taskFilter, setTaskFilter] = useState<TaskFilterTag>('none');

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
