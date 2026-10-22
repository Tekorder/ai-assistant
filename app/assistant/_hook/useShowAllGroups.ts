'use client';

import { useEffect, useState } from 'react';
import {
  LS_KEY_FOCUSED_LIST,
  LS_KEY_SHOW_ALL_GROUPS,
  VIEW_FILTER_EVENT,
  readFocusedList,
  readShowAllGroups,
  writeFocusedList,
  writeShowAllGroups,
  type FocusedList,
} from '@/lib/datacenter';

/** Re-reads a global view filter whenever any of them changes (this tab or another). */
function useViewFilter<T>(read: () => T, initial: T): T {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    const sync = () => setValue(read());
    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY_SHOW_ALL_GROUPS || e.key === LS_KEY_FOCUSED_LIST) sync();
    };
    window.addEventListener(VIEW_FILTER_EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(VIEW_FILTER_EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, [read]);

  return value;
}

/** The global "Show all" filter — every view using it re-renders when it flips. */
export function useShowAllGroups(): [boolean, (on: boolean) => void] {
  return [useViewFilter(readShowAllGroups, false), writeShowAllGroups];
}

/** The global focused-list filter (one list clicked in the Sidebar), or null. */
export function useFocusedList(): [FocusedList | null, (focus: FocusedList | null) => void] {
  return [useViewFilter(readFocusedList, null), writeFocusedList];
}
