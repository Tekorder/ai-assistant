'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { readProjectsLS, writeProjectsLS, cleanupEmptyTasks } from '@/lib/datacenter';
import HabitsPanel from './HabitsPanel';
import RemindersPanel from './RemindersPanel';

type View = 'chat' | 'reminders' | 'timeline' | 'archive' | 'quick' | 'calendar';

type Reminder = {
  id: string;
  title: string;
  date: string;
  time?: string;
  daily?: boolean;
  weekly?: boolean;
  dismissed?: boolean;
};

interface TopNavBarProps {
  title: string;
  activeView: View;
  setActiveView: (v: View) => void;
  onHome: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const LS_REMINDERS = 'youtask_reminders_v1';
const PRISMA_USER_ID_KEY = 'prisma_user_id';
const TWOFA_SESSION_KEY = 'youtask_2fa';

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function readReminders(): Reminder[] {
  try {
    const raw = localStorage.getItem(LS_REMINDERS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.reminders) ? parsed.reminders : [];
  } catch { return []; }
}

function writeReminders(reminders: Reminder[]) {
  try {
    localStorage.setItem(LS_REMINDERS, JSON.stringify({ reminders }));
  } catch {}
}

function isReminderToday(r: Reminder, today: string): boolean {
  if (r.daily) return true;
  if (r.weekly) return weekdayOf(r.date) === weekdayOf(today);
  return r.date === today;
}

const NAV_ITEMS: { id: View; label: string; mobileLabel: string; icon: React.ReactNode }[] = [
 {
  id: 'quick',
  label: 'Daily',
  mobileLabel: 'Tasks',
  icon: (
    <svg
      viewBox="0 0 16 16"
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.5 8.5l3 3 6-7"
      />
    </svg>
  ),
},
 
  {
    id: 'timeline',
    label: 'Timeline',
    mobileLabel: 'Timeline',
    icon: (
      <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" d="M2 8h12" />
        <circle cx="5"  cy="8" r="1.5" fill="currentColor" />
        <circle cx="11" cy="8" r="1.5" fill="currentColor" />
        <path strokeLinecap="round" d="M5 5v6M11 5v6" />
      </svg>
    ),
  },
  {
    id: 'calendar',
    label: 'Calendar',
    mobileLabel: 'Cal',
    icon: (
      <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="1.5" y="2.5" width="13" height="12" rx="2" />
        <path strokeLinecap="round" d="M5 1v3M11 1v3M1.5 6.5h13" />
        <circle cx="5.5" cy="10" r="0.8" fill="currentColor" />
        <circle cx="8" cy="10" r="0.8" fill="currentColor" />
        <circle cx="10.5" cy="10" r="0.8" fill="currentColor" />
      </svg>
    ),
  },
];

const PANEL_NAV: { id: 'habits' | 'reminders'; label: string; mobileLabel: string; icon: React.ReactNode }[] = [
  {
    id: 'habits',
    label: 'Habits',
    mobileLabel: 'Habits',
    icon: (
      <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v2M8 12v2M2 8h2M12 8h2" />
        <circle cx="8" cy="8" r="3" />
      </svg>
    ),
  },
  {
    id: 'reminders',
    label: 'Reminders',
    mobileLabel: 'Remind',
    icon: (
      <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" d="M8 2.5a4 4 0 0 1 4 4v2.5l1.2 1.2v.8H2.8v-.8L4 9V6.5a4 4 0 0 1 4-4z" />
        <path strokeLinecap="round" d="M6 12.5a2 2 0 0 0 4 0" />
      </svg>
    ),
  },
];

/*
{
    id: 'archive',
    label: 'Trash',
    mobileLabel: 'Trash',
    icon: (
      <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" />
        <path strokeLinecap="round" d="M3.5 4.5l.75 8.25A1 1 0 0 0 5.25 13.5h5.5a1 1 0 0 0 1-.75L12.5 4.5" />
        <path strokeLinecap="round" d="M6.5 7.5v3M9.5 7.5v3" />
      </svg>
    ),
  },
*/

export default function TopNavBar({
  activeView,
  setActiveView,
  sidebarOpen,
  onToggleSidebar,
}: Omit<TopNavBarProps, 'title' | 'onHome'> & { title?: string; onHome?: () => void }) {
  const router = useRouter();

  const clearPrismaLocalStorage = useCallback(() => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith('prisma_user_')) keysToRemove.push(k);
      }
      // También se setea en login flow (no es prisma_, pero es parte de la sesión)
      keysToRemove.push('firebase_uid');
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {}

    try {
      sessionStorage.removeItem('twofa_ok');
      sessionStorage.removeItem(TWOFA_SESSION_KEY);
    } catch {}
  }, []);

  const enforcePrismaSession = useCallback(() => {
    let ok = false;
    try {
      ok = !!localStorage.getItem(PRISMA_USER_ID_KEY);
    } catch {
      ok = false;
    }
    if (ok) return;

    // Si falta prisma_user_id, cerramos sesión Firebase y mandamos a Home.
    void signOut(auth).catch(() => {});
    clearPrismaLocalStorage();
    router.replace('/');
  }, [clearPrismaLocalStorage, router]);

  // ── Reminders state ──
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [hydrated, setHydrated]   = useState(false);
  const [dropOpen, setDropOpen]   = useState(false);
  const [slidePanel, setSlidePanel] = useState<null | 'habits' | 'reminders'>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const today = todayYMD();

  // Enforce session on mount + when tab refocuses or storage changes
  useEffect(() => {
    enforcePrismaSession();

    const onStorage = (e: StorageEvent) => {
      if (e.key === PRISMA_USER_ID_KEY) enforcePrismaSession();
    };
    const onFocus = () => enforcePrismaSession();

    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
    };
  }, [enforcePrismaSession]);

  const load = useCallback(() => {
    setReminders(readReminders());
    setHydrated(true);
  }, []);

  useEffect(() => {
    load();
    const handler = (e: StorageEvent) => { if (e.key === LS_REMINDERS) load(); };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [load]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropOpen]);

  const todayReminders = hydrated
    ? reminders.filter(r => isReminderToday(r, today) && r.title.trim().length > 0)
    : [];
  const pendingCount = todayReminders.filter(r => !r.dismissed).length;
  const hasPending   = pendingCount > 0;

  const dismissOne = (id: string) => {
    const next = reminders.map(r => r.id === id ? { ...r, dismissed: true } : r);
    setReminders(next);
    writeReminders(next);
  };

  const dismissAll = () => {
    const todayIds = new Set(todayReminders.map(r => r.id));
    const next = reminders.map(r => todayIds.has(r.id) ? { ...r, dismissed: true } : r);
    setReminders(next);
    writeReminders(next);
    setDropOpen(false);
  };

  // ── Navigation ──
  const handleSetActiveView = (v: View) => {
    if (activeView === 'quick' && v !== 'quick') {
      const payload = readProjectsLS();
      if (payload) {
        writeProjectsLS({
          ...payload,
          projects: payload.projects.map(p => ({
            ...p,
            blocks: cleanupEmptyTasks(p.blocks),
          })),
        });
      }
    }
    setSlidePanel(null);
    setActiveView(v);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // ignore
    } finally {
      clearPrismaLocalStorage();
    }
    router.replace('/');
  };

  return (
    <>
      <style>{`
        @keyframes bellRing {
          0%,55%,100% { transform: rotate(0deg);   }
          60%          { transform: rotate(18deg);  }
          65%          { transform: rotate(-15deg); }
          70%          { transform: rotate(12deg);  }
          75%          { transform: rotate(-9deg);  }
          80%          { transform: rotate(6deg);   }
          85%          { transform: rotate(-3deg);  }
          90%          { transform: rotate(1deg);   }
        }
        .bell-ring {
          display: inline-block;
          transform-origin: 50% 2px;
          animation: bellRing 2s ease-in-out infinite;
        }
        @keyframes dropIn {
          from { opacity:0; transform: translateY(-6px) scale(.97); }
          to   { opacity:1; transform: translateY(0)    scale(1);   }
        }
        .drop-in { animation: dropIn .18s cubic-bezier(.25,.9,.3,1) forwards; }
      `}</style>

      {/* ── Top bar ── */}
      <header className="shrink-0 h-12 bg-black border-b border-white/8 flex items-center px-3 md:px-4 gap-2 z-50">

        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-9 w-auto object-contain shrink-0" />

        {/* Sidebar toggle */}
        <button
          type="button"
          onClick={onToggleSidebar}
          className={[
            'h-8 w-8 rounded-lg flex items-center justify-center transition-colors shrink-0',
            sidebarOpen
              ? 'bg-[#d5fc43]/22 text-[#d5fc43]'
              : 'text-white/50 hover:text-white/85 hover:bg-white/10',
          ].join(' ')}
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path strokeLinecap="round" d="M2 4h12M2 8h12M2 12h12" />
          </svg>
        </button>

      

        {/* Divider */}
        <div className="hidden md:block w-px h-5 bg-white/10 mx-1 shrink-0" />

        {/* Nav tabs */}
        <nav className="hidden md:flex items-center gap-0.5 flex-1 overflow-x-auto scrollbar-none">
          {NAV_ITEMS.map(item => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSetActiveView(item.id)}
                className={[
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150 whitespace-nowrap shrink-0',
                  isActive
                    ? 'bg-[#d5fc43]/22 text-[#d5fc43]'
                    : 'text-white/45 hover:text-white/80 hover:bg-white/8',
                ].join(' ')}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className={isActive ? 'text-[#d5fc43]' : 'text-white/45'}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
          {PANEL_NAV.map(item => {
            const isOpen = slidePanel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSlidePanel(p => (p === item.id ? null : item.id))}
                className={[
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150 whitespace-nowrap shrink-0',
                  isOpen
                    ? 'bg-[#d5fc43]/22 text-[#d5fc43]'
                    : 'text-white/45 hover:text-white/80 hover:bg-white/8',
                ].join(' ')}
                aria-expanded={isOpen}
              >
                <span className={isOpen ? 'text-[#d5fc43]' : 'text-white/45'}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Spacer on mobile */}
        <div className="flex-1 md:hidden" />

        {/* Divider */}
        <div className="w-px h-5 bg-white/10 mx-1 shrink-0" />

        {/* ── Bell ── */}
        {hydrated && (
          <div ref={dropRef} className="relative">
            <button
              type="button"
              onClick={() => setDropOpen(o => !o)}
              title={
                !todayReminders.length ? 'No reminders today'
                : hasPending ? `${pendingCount} reminder${pendingCount > 1 ? 's' : ''} pending`
                : 'All reminders done today'
              }
              className="relative h-8 w-8 flex items-center justify-center rounded-lg text-white/45 hover:text-[#d5fc43] hover:bg-[#d5fc43]/12 transition-colors shrink-0"
            >
              <span
                className={hasPending ? 'bell-ring' : ''}
                style={{ fontSize: 16, lineHeight: 1 }}
              >
                🔔
              </span>
              {hasPending && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-[3px] flex items-center justify-center rounded-full bg-red-500 text-white ring-2 ring-gray-900"
                  style={{ fontSize: 10, fontWeight: 700, lineHeight: 1 }}
                >
                  {pendingCount}
                </span>
              )}
            </button>

            {/* Dropdown */}
            {dropOpen && (
              <div className="drop-in absolute right-0 top-10 w-72 rounded-xl border border-white/10 bg-black shadow-2xl overflow-hidden z-[200] isolate">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
                  <span className="text-[12px] font-semibold text-white/70 tracking-wide">
                    Today s reminders
                  </span>
                  {hasPending && (
                    <button
                      onClick={dismissAll}
                      className="text-[11px] text-white/40 hover:text-[#d5fc43] transition-colors"
                    >
                      Dismiss all
                    </button>
                  )}
                </div>

                <div className="max-h-64 overflow-y-auto">
                  {todayReminders.length === 0 ? (
                    <div className="px-4 py-5 text-[12px] text-white/35 text-center">
                      No reminders for today
                    </div>
                  ) : (
                    todayReminders.map(r => {
                      const isDone = !!r.dismissed;
                      return (
                        <div
                          key={r.id}
                          className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0 group"
                        >
                          <span
                            className="shrink-0 w-2 h-2 rounded-full mt-0.5"
                            style={{ background: isDone ? 'rgba(52,211,153,.5)' : '#f87171' }}
                          />
                          <div className="flex-1 min-w-0">
                            <div
                              className="text-[13px] font-medium leading-snug truncate"
                              style={{
                                color: isDone ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.85)',
                                textDecoration: isDone ? 'line-through' : 'none',
                              }}
                            >
                              {r.title}
                            </div>
                            {(r.time || r.daily || r.weekly) && (
                              <div className="text-[11px] text-white/30 mt-0.5">
                                {r.time && <span>{r.time}</span>}
                                {r.daily  && <span className="ml-1">· daily</span>}
                                {r.weekly && <span className="ml-1">· weekly</span>}
                              </div>
                            )}
                          </div>
                          {!isDone ? (
                            <button
                              onClick={() => dismissOne(r.id)}
                              className="shrink-0 opacity-0 group-hover:opacity-100 text-[11px] px-2 py-1 rounded-md bg-white/10 text-white/40 hover:text-[#d5fc43] hover:bg-[#d5fc43]/15 transition-all"
                            >
                              ✓
                            </button>
                          ) : (
                            <span className="shrink-0 text-[11px] text-[#d5fc43]/80">✓</span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {!hasPending && todayReminders.length > 0 && (
                  <div className="px-4 py-2.5 border-t border-white/8 text-center text-[11px] text-[#d5fc43]/80">
                    All done for today 🎉
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          className="h-8 w-8 rounded-lg flex items-center justify-center text-white/45 hover:text-[#d5fc43] hover:bg-[#d5fc43]/12 transition-colors shrink-0"
          aria-label="Sign out"
          title="Sign out"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path strokeLinecap="round" d="M6 8h7M11 6l2 2-2 2" />
            <path strokeLinecap="round" d="M10 4V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-1" />
          </svg>
        </button>

      </header>

      {/* ── Bottom tab bar — mobile only ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex bg-black border-t border-white/10 overflow-x-auto">
        {NAV_ITEMS.map(item => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSetActiveView(item.id)}
              className={`relative min-w-[56px] flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-all ${
                isActive ? 'text-white' : 'text-white/40 hover:text-white/70'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="text-[9px] font-medium">{item.mobileLabel}</span>
              {isActive && (
                <span className="absolute bottom-0 w-8 h-0.5 bg-[#d5fc43] rounded-full" />
              )}
            </button>
          );
        })}
        {PANEL_NAV.map(item => {
          const isOpen = slidePanel === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSlidePanel(p => (p === item.id ? null : item.id))}
              className={`relative min-w-[56px] flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-all ${
                isOpen ? 'text-[#d5fc43]' : 'text-white/40 hover:text-white/70'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="text-[9px] font-medium">{item.mobileLabel}</span>
              {isOpen && (
                <span className="absolute bottom-0 w-8 h-0.5 bg-[#d5fc43] rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      <HabitsPanel open={slidePanel === 'habits'} onClose={() => setSlidePanel(null)} />
      <RemindersPanel open={slidePanel === 'reminders'} onClose={() => setSlidePanel(null)} />
    </>
  );
}