'use client';

import React, { useEffect, useState } from 'react';
import { setCheckInMethodLS } from '@/lib/datacenter';
import { useHabits } from '../_hook/useHabits';
import {
  REMINDER_ALERTS_EVENT,
  browserPermission,
  readNotifyPrefs,
  writeNotifyPrefs,
  type NotifyPrefs,
} from '../_utils/reminderAlerts';
import classes from '@/app/assistant/_theme/themes.module.css';
import { HabitChips, HabitRow, HabitSwitch } from './habits/HabitModal';

/** Settings › Reminders & habits: alerts on this device, and how habits are checked in. */
export default function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotifyPrefs>({ browser: false, sound: true });
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const { checkInMethod } = useHabits();

  useEffect(() => {
    const sync = () => { setPrefs(readNotifyPrefs()); setPermission(browserPermission()); };
    sync();
    window.addEventListener(REMINDER_ALERTS_EVENT, sync);
    return () => window.removeEventListener(REMINDER_ALERTS_EVENT, sync);
  }, []);

  const save = (patch: Partial<NotifyPrefs>) => writeNotifyPrefs({ ...prefs, ...patch });

  const toggleBrowser = async (on: boolean) => {
    if (!on) { save({ browser: false }); return; }
    let p = browserPermission();
    if (p === 'default') p = await Notification.requestPermission();
    setPermission(p);
    save({ browser: p === 'granted' });
  };

  const test = () => {
    if (browserPermission() !== 'granted') return;
    try { new Notification('YouTask', { body: 'Notifications are on — reminders will show up here.', icon: '/icon.png' }); } catch {}
  };

  const hint =
    permission === 'unsupported' ? "This browser doesn't support notifications"
    : permission === 'denied' ? 'Blocked — allow notifications for this site in your browser settings'
    : 'When YouTask is open in a background tab';

  return (
    <section>
      <h2 className="text-[14px] font-medium mb-1.5" style={{ color: 'var(--assistant-text-muted)' }}>
        Reminders &amp; habits
      </h2>
      <p className="text-[14px] mb-2" style={{ color: 'var(--assistant-text-soft)' }}>
        Reminders and habit reminders alert you at their time while YouTask is open. These settings apply to this device.
      </p>
      <div className="max-w-[420px]">
        <HabitRow label="Browser notifications" hint={hint}>
          <HabitSwitch label="Browser notifications" on={prefs.browser && permission === 'granted'}
            onChange={on => { void toggleBrowser(on); }} />
        </HabitRow>
        {prefs.browser && permission === 'granted' ? (
          <button type="button" onClick={test} className={`mb-1 rounded-md px-2.5 py-1 text-[12px] ${classes.panelBtn}`}>
            Send a test notification
          </button>
        ) : null}
        <HabitRow label="Sound" hint="With the in-app alert">
          <HabitSwitch label="Sound" on={prefs.sound} onChange={sound => save({ sound })} />
        </HabitRow>
        <HabitRow label="Habit check-in" hint={checkInMethod === 'swipe' ? 'Swipe a habit card right; tap opens it' : 'Tap a habit card; › opens it'}>
          <HabitChips ariaLabel="Habit check-in" value={checkInMethod}
            options={[{ value: 'tap', label: 'Tap' }, { value: 'swipe', label: 'Swipe' }]}
            onChange={setCheckInMethodLS} />
        </HabitRow>
      </div>
    </section>
  );
}
