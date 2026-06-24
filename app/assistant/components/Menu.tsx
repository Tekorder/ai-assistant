'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import classes from '@/app/assistant/_theme/themes.module.css';

const TWOFA_SESSION_KEY = 'youtask_2fa';

type MenuProps = {
  open: boolean;
  onClose: () => void;
  // Mobile-only panel toggles
  onToggleHabits?: () => void;
  onToggleReminders?: () => void;
  onToggleActivity?: () => void;
  onToggleLists?: () => void;
  onToggleChat?: () => void;
  habitsOpen?: boolean;
  remindersOpen?: boolean;
  activityOpen?: boolean;
  listsOpen?: boolean;
  chatOpen?: boolean;
};

export default function Menu({
  open,
  onClose,
  onToggleHabits,
  onToggleReminders,
  onToggleActivity,
  onToggleLists,
  onToggleChat,
  habitsOpen,
  remindersOpen,
  activityOpen,
  listsOpen,
  chatOpen,
}: MenuProps) {
  const router = useRouter();
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setIsClosing(false);
    } else if (shouldRender) {
      setIsClosing(true);
      const t = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, 260);
      return () => clearTimeout(t);
    }
  }, [open, shouldRender]);

  const clearPrismaLocalStorage = useCallback(() => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith('prisma_user_')) keysToRemove.push(k);
      }
      keysToRemove.push('firebase_uid');
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {}

    try {
      sessionStorage.removeItem('twofa_ok');
      sessionStorage.removeItem(TWOFA_SESSION_KEY);
    } catch {}
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch {
      // ignore
    } finally {
      clearPrismaLocalStorage();
    }
    onClose();
    router.replace('/');
  }, [clearPrismaLocalStorage, onClose, router]);

  if (!shouldRender) return null;

  const items = [
    {
      label: 'Profile',
      icon: (
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="8" cy="5.2" r="2.5" />
          <path strokeLinecap="round" d="M3 13c.8-2 2.6-3.2 5-3.2s4.2 1.2 5 3.2" />
        </svg>
      ),
    },
    {
      label: 'Settings',
      icon: (
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="8" cy="8" r="2.2" />
          <path strokeLinecap="round" d="M8 1.8v1.5M8 12.7v1.5M14.2 8h-1.5M3.3 8H1.8M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1M12.7 12.7l-1.1-1.1M4.4 4.4L3.3 3.3" />
        </svg>
      ),
    },
    {
      label: 'Themes',
      icon: (
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 1.8c-2.9 0-5.2 2.3-5.2 5.2A5.2 5.2 0 0 0 8 12.2c.9 0 1.5-.6 1.5-1.4 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.8.7-1.4 1.5-1.4h2.3c.9 0 1.7-.8 1.7-1.8C14 3.3 11.4 1.8 8 1.8Z" />
        </svg>
      ),
    },
    {
      label: 'Colaborators',
      icon: (
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="5.2" cy="6" r="1.8" />
          <circle cx="10.8" cy="6" r="1.8" />
          <path strokeLinecap="round" d="M2.4 12c.6-1.6 1.8-2.6 3.6-2.6S9 10.4 9.6 12M6.4 12c.6-1.6 1.8-2.6 3.6-2.6s3 .9 3.6 2.6" />
        </svg>
      ),
    },
  ] as const;

  return (
    <>
      <style>{`
        @keyframes menuSlideIn {
          from { transform: translateX(-100%); opacity: 0; }
          60% { opacity: 1; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes menuSlideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(-100%); opacity: 0; }
        }
        @keyframes menuOverlayIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes menuOverlayOut { from { opacity: 1; } to { opacity: 0; } }
      `}</style>
      <button
        type="button"
        className="fixed inset-0 z-[300]"
        style={{
          background: 'var(--assistant-overlay)',
          animation: isClosing ? 'menuOverlayOut 0.26s ease-out both' : 'menuOverlayIn 0.22s ease-out both',
        }}
        onClick={onClose}
        aria-label="Close menu"
      />

      <aside
        className="fixed left-0 top-0 z-[301] flex h-full w-[86%] max-w-[360px] flex-col shadow-2xl"
        style={{
          background: 'var(--assistant-bg)',
          color: 'var(--assistant-text)',
          borderRight: '1px solid color-mix(in srgb, var(--assistant-accent) 20%, transparent)',
          animation: isClosing
            ? 'menuSlideOut 0.26s cubic-bezier(0.4, 0, 1, 1) both'
            : 'menuSlideIn 0.32s cubic-bezier(0.22, 1, 0.36, 1) both',
        }}
      >
        <div
          className="relative flex items-center justify-center px-4 py-5"
          style={{ borderBottom: '1px solid var(--assistant-border-soft)' }}
        >
          <div className="flex flex-col items-center gap-2">
            <div
              className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full"
              style={{
                border: '1px solid color-mix(in srgb, var(--assistant-accent) 30%, transparent)',
                background: 'color-mix(in srgb, var(--assistant-accent) 10%, transparent)',
                boxShadow: '0 0 36px color-mix(in srgb, var(--assistant-accent) 25%, transparent)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-dark.png" alt="" className="h-24 w-24 object-contain" />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-md transition-colors ${classes.panelBtn}`}
            aria-label="Close menu"
            title="Close menu"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">

          {/* App items */}
          <div className="space-y-0.5">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${classes.panelBtn} ${classes.menuItem}`}
                style={{ color: 'var(--assistant-text-soft)' }}
              >
                <span className="inline-flex h-4 w-4 items-center justify-center shrink-0" style={{ color: 'var(--assistant-text-muted)' }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          {/* Panels — mobile only */}
          <div className="md:hidden mt-3">
            <div className="mb-3 border-t" style={{ borderColor: 'var(--assistant-border-soft)' }} />
            <div className="space-y-0.5">
              {([
                { label: 'Habits',    isOpen: habitsOpen,    onToggle: onToggleHabits,    icon: <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" strokeLinejoin="round" d="M8 2v2M8 12v2M2 8h2M12 8h2" /><circle cx="8" cy="8" r="3" /></svg> },
                { label: 'Reminders', isOpen: remindersOpen, onToggle: onToggleReminders, icon: <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" d="M8 2.5a4 4 0 0 1 4 4v2.5l1.2 1.2v.8H2.8v-.8L4 9V6.5a4 4 0 0 1 4-4z" /><path strokeLinecap="round" d="M6 12.5a2 2 0 0 0 4 0" /></svg> },
                { label: 'Activity',  isOpen: activityOpen,  onToggle: onToggleActivity,  icon: <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" strokeLinejoin="round" d="M2 10h2.5l1.2-3 2.1 6 1.8-4H14" /></svg> },
                { label: 'Lists',     isOpen: listsOpen,     onToggle: onToggleLists,     icon: <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="3" width="3" height="3" rx="0.6" /><rect x="2" y="10" width="3" height="3" rx="0.6" /><path strokeLinecap="round" d="M7 4.5h7M7 11.5h7" /></svg> },
                { label: 'AI Chat',   isOpen: chatOpen,      onToggle: onToggleChat,      icon: <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5" /></svg> },
              ] as const).map((panel) => (
                <button
                  key={panel.label}
                  type="button"
                  onClick={() => { onClose(); panel.onToggle?.(); }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${classes.panelBtn} ${classes.menuItem}`}
                  style={{ color: panel.isOpen ? 'var(--assistant-accent)' : 'var(--assistant-text-soft)' }}
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center shrink-0">
                    {panel.icon}
                  </span>
                  <span>{panel.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-3 py-3" style={{ borderTop: '1px solid var(--assistant-border-soft)' }}>
          <button
            type="button"
            onClick={handleLogout}
            className={`w-full rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium transition-colors ${classes.panelBtnDanger}`}
          >
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
