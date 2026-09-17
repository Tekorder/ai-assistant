'use client';

import React, { useEffect, useState } from 'react';
import classes from '@/app/assistant/_theme/themes.module.css';
import CompletedTasksChart from './CompletedTasksChart';

type ProfilePanelProps = {
  open: boolean;
  onClose: () => void;
  completedTasks?: { id: string; date: string }[];
};

export default function ProfilePanel({ open, onClose, completedTasks = [] }: ProfilePanelProps) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setIsClosing(false);
    } else if (shouldRender) {
      setIsClosing(true);
      const t = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, 220);
      return () => clearTimeout(t);
    }
  }, [open, shouldRender]);

  useEffect(() => {
    try {
      setName(localStorage.getItem('prisma_user_name') ?? '');
      setEmail(localStorage.getItem('prisma_user_email') ?? '');
    } catch {}
  }, [open]);

  if (!shouldRender) return null;

  const displayName = name || email.split('@')[0] || 'User';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <>
      <style>{`
        @keyframes profileScreenIn {
          from { transform: translateX(24px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes profileScreenOut {
          from { transform: translateX(0);    opacity: 1; }
          to   { transform: translateX(24px); opacity: 0; }
        }
      `}</style>
      <div
        className="fixed inset-0 z-[10050] flex flex-col overflow-y-auto"
        style={{
          background: 'var(--assistant-bg)',
          color: 'var(--assistant-text)',
          animation: isClosing
            ? 'profileScreenOut 0.22s ease-out both'
            : 'profileScreenIn 0.28s cubic-bezier(0.22, 1, 0.36, 1) both',
        }}
      >
        <div
          className="sticky top-0 flex items-center gap-3 px-4 py-4 md:px-8"
          style={{ borderBottom: '1px solid var(--assistant-border-soft)', background: 'var(--assistant-bg)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${classes.panelBtn}`}
            aria-label="Back"
            title="Back"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 3 4.5 8l5 5" />
            </svg>
          </button>
          <h1 className="text-[16px] font-semibold">Profile</h1>
        </div>

        <div className="mx-auto w-full max-w-[560px] flex-1 px-4 py-6 md:px-8">
          <div className="space-y-6">
            <section className="flex items-center gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-[20px] font-semibold"
                style={{
                  background: 'color-mix(in srgb, var(--assistant-accent) 15%, transparent)',
                  color: 'var(--assistant-accent)',
                  border: '1px solid color-mix(in srgb, var(--assistant-accent) 25%, transparent)',
                }}
              >
                {initial}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold">{displayName}</div>
                <div className="truncate text-[13px]" style={{ color: 'var(--assistant-text-soft)' }}>
                  {email}
                </div>
              </div>
            </section>

            <div style={{ borderTop: '1px solid var(--assistant-border-soft)' }} />

            <CompletedTasksChart tasks={completedTasks} />

            <div style={{ borderTop: '1px solid var(--assistant-border-soft)' }} />

            <section>
              <h2 className="text-[13px] font-medium mb-1.5" style={{ color: 'var(--assistant-text-muted)' }}>
                Plan
              </h2>
              <div className="flex items-center justify-between max-w-[280px] rounded-lg px-3.5 py-2.5" style={{ border: '1px solid var(--assistant-border-soft)' }}>
                <span className="text-[13px]" style={{ color: 'var(--assistant-text-soft)' }}>
                  Free
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    background: 'color-mix(in srgb, var(--assistant-accent) 12%, transparent)',
                    color: 'var(--assistant-accent)',
                  }}
                >
                  Current
                </span>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
