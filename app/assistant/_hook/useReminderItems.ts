'use client';

import { useEffect, useState } from 'react';
import { LS_KEY_REMINDERS, readRemindersLS, type ReminderItem } from '@/lib/datacenter';

/** Standalone reminders, re-read whenever they change (this tab or another). */
export function useReminderItems(): ReminderItem[] {
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  useEffect(() => {
    const sync = () => setReminders(readRemindersLS().reminders);
    sync();
    const onStorage = (e: StorageEvent) => { if (e.key === LS_KEY_REMINDERS) sync(); };
    window.addEventListener('youtask_reminders_updated', sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('youtask_reminders_updated', sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return reminders;
}
