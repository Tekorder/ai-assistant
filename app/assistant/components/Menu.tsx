'use client';

import React, { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import classes from '@/app/assistant/_theme/themes.module.css';

const TWOFA_SESSION_KEY = 'youtask_2fa';

type MenuProps = {
  open: boolean;
  onClose: () => void;
};

export default function Menu({ open, onClose }: MenuProps) {
  const router = useRouter();

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

  if (!open) return null;

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
      <button
        type="button"
        className="fixed inset-0 z-[300]"
        style={{ background: 'var(--assistant-overlay)' }}
        onClick={onClose}
        aria-label="Close menu"
      />

      <aside
        className="fixed left-0 top-0 z-[301] flex h-full w-[86%] max-w-[360px] flex-col shadow-2xl"
        style={{
          background: 'var(--assistant-bg)',
          color: 'var(--assistant-text)',
          borderRight: '1px solid color-mix(in srgb, var(--assistant-accent) 20%, transparent)',
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
              <img src="/logo.png" alt="" className="h-24 w-24 object-contain" />
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

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1.5">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors ${classes.panelBtn}`}
                style={{ border: '1px solid var(--assistant-border-soft)' }}
              >
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{
                    border: '1px solid var(--assistant-border-soft)',
                    background: 'var(--assistant-control-bg)',
                    color: 'var(--assistant-text-muted)',
                  }}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="px-3 py-3" style={{ borderTop: '1px solid var(--assistant-border-soft)' }}>
          <button
            type="button"
            onClick={handleLogout}
            className={`w-full rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${classes.panelBtnDanger}`}
          >
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
