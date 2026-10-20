'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { addDaysYMD, isValidDateYYYYMMDD, todayYMD, type DateMode, type DateRange, type SortBy } from '@/lib/datacenter';

/** Extra task filters beyond date range (UI; priority is wired). */
export type TaskFilterTag = 'none' | 'priority' | 'someday' | 'scheduled';

type QuickFiltersContextValue = {
  dateMode: DateMode;
  setDateMode: (m: DateMode) => void;
  /** Custom from/to used when dateMode is 'range' */
  dateRange: DateRange;
  setDateRange: (r: DateRange) => void;
  showCompleted: boolean;
  setShowCompleted: (v: boolean | ((p: boolean) => boolean)) => void;
  /** Hide tasks with no due date ("Someday") */
  hideSomeday: boolean;
  setHideSomeday: (v: boolean | ((p: boolean) => boolean)) => void;
  sortBy: SortBy;
  setSortBy: (v: SortBy) => void;
  taskFilter: TaskFilterTag;
  setTaskFilter: (v: TaskFilterTag) => void;
  /** Live keyword filter for the workspace lists (not persisted) */
  searchQuery: string;
  setSearchQuery: (v: string) => void;
};

const QuickFiltersContext = createContext<QuickFiltersContextValue | null>(null);

const LS_KEY_QUICK_FILTERS = 'youtask_quick_filters_v1';

type SavedFilters = Partial<{
  dateMode: DateMode;
  dateRange: DateRange;
  showCompleted: boolean;
  hideSomeday: boolean;
  sortBy: SortBy;
  taskFilter: TaskFilterTag;
}>;

export function QuickFiltersProvider({ children }: { children: React.ReactNode }) {
  const [dateMode, setDateMode] = useState<DateMode>('all');
  const [dateRange, setDateRange] = useState<DateRange>(() => ({ from: addDaysYMD(todayYMD(), -6), to: todayYMD() }));
  const [showCompleted, setShowCompleted] = useState(true);
  const [hideSomeday, setHideSomeday] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');
  const [taskFilter, setTaskFilter] = useState<TaskFilterTag>('none');
  const [searchQuery, setSearchQuery] = useState('');
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY_QUICK_FILTERS);
      if (raw) {
        const saved = JSON.parse(raw) as SavedFilters;
        const r = saved.dateRange;
        const validRange = !!r && isValidDateYYYYMMDD(r.from) && isValidDateYYYYMMDD(r.to) && r.from <= r.to;
        if (validRange) setDateRange(r);
        if (saved.dateMode && (saved.dateMode !== 'range' || validRange)) setDateMode(saved.dateMode);
        if (typeof saved.showCompleted === 'boolean') setShowCompleted(saved.showCompleted);
        if (typeof saved.hideSomeday === 'boolean') setHideSomeday(saved.hideSomeday);
        // sortBy is not restored: every session starts on "Created Date"
        if (saved.taskFilter) setTaskFilter(saved.taskFilter);
      }
    } catch {}
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      const data: SavedFilters = { dateMode, dateRange, showCompleted, hideSomeday, sortBy, taskFilter };
      localStorage.setItem(LS_KEY_QUICK_FILTERS, JSON.stringify(data));
    } catch {}
  }, [restored, dateMode, dateRange, showCompleted, hideSomeday, sortBy, taskFilter]);

  return (
    <QuickFiltersContext.Provider
      value={{
        dateMode,
        setDateMode,
        dateRange,
        setDateRange,
        showCompleted,
        setShowCompleted,
        hideSomeday,
        setHideSomeday,
        sortBy,
        setSortBy,
        taskFilter,
        setTaskFilter,
        searchQuery,
        setSearchQuery,
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
