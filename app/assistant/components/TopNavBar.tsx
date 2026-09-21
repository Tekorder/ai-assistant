'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { readProjectsLS, writeProjectsLS, cleanupEmptyTasks, closeSyncGates, type TaskFlagColor } from '@/lib/datacenter';
import { TaskFlagBadge } from './TaskFlag';
import classes from '@/app/assistant/_theme/themes.module.css';

export type View = 'chat' | 'reminders' | 'timeline' | 'archive' | 'quick' | 'calendar';

type Reminder = {
  id: string;
  title: string;
  date: string;
  time?: string;
  daily?: boolean;
  weekly?: boolean;
  dismissed?: boolean;
  priority?: boolean;
  flag?: TaskFlagColor;
};

interface TopNavBarProps {
  title: string;
  activeView: View;
  setActiveView: (v: View) => void;
  onHome: () => void;
  sidebarOpen: boolean;
  onOpenMenu: () => void;
  onToggleSidebar: () => void;
  habitsOpen: boolean;
  remindersOpen: boolean;
  activityOpen: boolean;
  listsOpen: boolean;
  timelineOpen?: boolean;
  calendarOpen?: boolean;
  onToggleHabits: () => void;
  onToggleReminders: () => void;
  onToggleActivity: () => void;
  onToggleLists: () => void;
  themeStyle?: 'light' | 'dark';
  onToggleTheme?: () => void;
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

export const NAV_ITEMS: { id: View; label: string; mobileLabel: string; icon: React.ReactNode }[] = [
  {
    id: 'quick',
    label: 'Workspace',
    mobileLabel: 'Work',
    icon: (
      <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 8.5l3 3 6-7" />
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


const CENTER_NAV: {
  id: 'lists' | 'habits' | 'reminders';
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'lists',
    label: 'Lists',
    icon: (
      <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <circle cx="2.5" cy="4" r="1" fill="currentColor" stroke="none" />
        <circle cx="2.5" cy="8" r="1" fill="currentColor" stroke="none" />
        <circle cx="2.5" cy="12" r="1" fill="currentColor" stroke="none" />
        <path strokeLinecap="round" d="M5.5 4h8M5.5 8h8M5.5 12h8" />
      </svg>
    ),
  },
  {
    id: 'habits',
    label: 'Habits',
    icon: (
      <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.5 3.5A5 5 0 0 1 13 8a5 5 0 0 1-5 5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.5 3.5V6H9" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.5A5 5 0 0 1 3 8a5 5 0 0 1 5-5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.5V10H7" />
      </svg>
    ),
  },
  {
    id: 'reminders',
    label: 'Reminders',
    icon: (
      <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path strokeLinecap="round" d="M8 2.5a4 4 0 0 1 4 4v2.5l1.2 1.2v.8H2.8v-.8L4 9V6.5a4 4 0 0 1 4-4z" />
        <path strokeLinecap="round" d="M6.3 12.5a1.8 1.8 0 0 0 3.4 0" />
      </svg>
    ),
  },
];

function YouTaskLogoMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="14" fill="currentColor" />
      <path
        d="M9.2 18.8c2.2 3.4 5.1 5 7.8 5 3.4 0 5.8-1.9 5.8-4.4 0-2.1-1.6-3.4-4.2-3.4-1.5 0-2.8.5-3.9 1.3"
        fill="none"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M10.4 16.2c1.7 2.4 3.8 3.5 5.8 3.5 2.3 0 3.8-1.2 3.8-2.8 0-1.3-.9-2.1-2.6-2.1-1.1 0-2.1.4-3 .9"
        fill="none"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M11.6 13.6c1.2 1.5 2.6 2.1 3.9 2.1 1.4 0 2.2-.7 2.2-1.6 0-.7-.5-1.1-1.4-1.1-.8 0-1.5.3-2.1.6"
        fill="none"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
  onOpenMenu,
  onToggleSidebar,
  habitsOpen,
  remindersOpen,
  timelineOpen = false,
  calendarOpen = false,
  onToggleHabits,
  onToggleReminders,
  themeStyle = 'light',
  onToggleTheme,
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

    closeSyncGates();
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

  // ── Current user label ──
  const [userName, setUserName] = useState('');
  const [userAvatar, setUserAvatar] = useState('');
  useEffect(() => {
    try {
      const name = localStorage.getItem('prisma_user_name');
      const email = localStorage.getItem('prisma_user_email') ?? '';
      const avatar = localStorage.getItem('prisma_user_avatar') ?? '';
      // Never display a raw email — fall back to its local part
      setUserName(name || email.split('@')[0] || '');
      setUserAvatar(avatar);
    } catch {}
  }, []);

  // ── Reminders state ──
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [hydrated, setHydrated]   = useState(false);
  const [dropOpen, setDropOpen]   = useState(false);
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
    setActiveView(v);
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

      {/* ── Top bar — designer reference layout ── */}
      <header className={`shrink-0 z-50 flex items-center px-4 md:px-6 ${classes.topNav}`}>
        {/* Left: brand */}
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <span className={classes.topNavBrand}>
            <YouTaskLogoMark className="h-7 w-7 shrink-0" />
          </span>
          <span className={`text-[17px] font-bold tracking-tight lowercase leading-none ${classes.topNavBrand}`}>
            youtask
          </span>
        </div>

        {/* Center: Lists / Habits / Reminders */}
        <nav className="hidden md:flex flex-1 items-center justify-center gap-2 min-w-0">
          {CENTER_NAV.map(item => {
            const isActive =
              item.id === 'lists' ? sidebarOpen
              : item.id === 'habits' ? habitsOpen
              : remindersOpen;
            const onClick =
              item.id === 'lists' ? onToggleSidebar
              : item.id === 'habits' ? onToggleHabits
              : onToggleReminders;
            return (
              <button
                key={item.id}
                type="button"
                onClick={onClick}
                className={[
                  'flex items-center gap-1.5 text-[13px] whitespace-nowrap shrink-0 transition-colors',
                  isActive ? classes.topNavCenterActive : classes.topNavCenterInactive,
                ].join(' ')}
                aria-pressed={isActive}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Mobile spacer */}
        <div className="flex-1 md:hidden" />

        {/* Right: moon / bell / profile */}
        <div className="flex items-center gap-1 md:gap-2 shrink-0">
          {onToggleTheme ? (
            <button
              type="button"
              onClick={onToggleTheme}
              className={classes.topNavIconBtn}
              aria-label={themeStyle === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              title={themeStyle === 'light' ? 'Dark mode' : 'Light mode'}
            >
              {themeStyle === 'light' ? (
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.2 9.4A5.5 5.5 0 0 1 6.6 2.8 5.6 5.6 0 1 0 13.2 9.4z" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <circle cx="8" cy="8" r="3.2" />
                  <path strokeLinecap="round" d="M8 1.5v1.4M8 13.1v1.4M1.5 8h1.4M13.1 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" />
                </svg>
              )}
            </button>
          ) : null}

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
                className={`relative ${classes.topNavIconBtn}`}
                aria-label="Notifications"
              >
                <span className={hasPending ? 'bell-ring inline-flex' : 'inline-flex'}>
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                    <path strokeLinecap="round" d="M8 2.5a4 4 0 0 1 4 4v2.5l1.2 1.2v.8H2.8v-.8L4 9V6.5a4 4 0 0 1 4-4z" />
                    <path strokeLinecap="round" d="M6.3 12.5a1.8 1.8 0 0 0 3.4 0" />
                  </svg>
                </span>
                {hasPending && (
                  <span className={classes.topNavBellBadge}>
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </button>

              {dropOpen && (
                <div
                  className="drop-in fixed left-3 right-3 top-14 md:absolute md:left-auto md:right-0 md:top-10 md:w-72 rounded-xl shadow-2xl overflow-hidden z-[200] isolate"
                  style={{ background: 'var(--assistant-panel-bg)', border: '1px solid var(--assistant-border-soft)' }}
                >
                  <div
                    className="flex items-center justify-between px-4 py-2.5 border-b"
                    style={{ borderBottomColor: 'var(--assistant-border-soft)' }}
                  >
                    <span className="text-[12px] font-semibold tracking-wide" style={{ color: 'var(--assistant-text-soft)' }}>
                      Today&apos;s reminders
                    </span>
                    {hasPending && (
                      <button
                        onClick={dismissAll}
                        className="text-[11px] transition-colors"
                        style={{ color: 'var(--assistant-text-faint)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--assistant-accent)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--assistant-text-faint)')}
                      >
                        Dismiss all
                      </button>
                    )}
                  </div>

                  <div className="max-h-64 overflow-y-auto">
                    {todayReminders.length === 0 ? (
                      <div className="px-4 py-5 text-[12px] text-center" style={{ color: 'var(--assistant-text-faint)' }}>
                        No reminders for today
                      </div>
                    ) : (
                      todayReminders.map(r => {
                        const isDone = !!r.dismissed;
                        return (
                          <div
                            key={r.id}
                            className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 group"
                            style={{ borderBottomColor: 'var(--assistant-border-soft)' }}
                          >
                            <span
                              className="shrink-0 w-2 h-2 rounded-full mt-0.5"
                              style={{ background: isDone ? 'rgba(52,211,153,.6)' : '#f87171' }}
                            />
                            <div className="flex-1 min-w-0">
                              <div
                                className="text-[13px] font-medium leading-snug truncate"
                                style={{
                                  color: isDone ? 'var(--assistant-text-faint)' : 'var(--assistant-text)',
                                  textDecoration: isDone ? 'line-through' : 'none',
                                }}
                              >
                                <TaskFlagBadge source={r} inline />
                                {r.title}
                              </div>
                              {(r.time || r.daily || r.weekly) && (
                                <div className="text-[11px] mt-0.5" style={{ color: 'var(--assistant-text-faint)' }}>
                                  {r.time && <span>{r.time}</span>}
                                  {r.daily  && <span className="ml-1">· daily</span>}
                                  {r.weekly && <span className="ml-1">· weekly</span>}
                                </div>
                              )}
                            </div>
                            {!isDone ? (
                              <button
                                onClick={() => dismissOne(r.id)}
                                className="shrink-0 opacity-0 group-hover:opacity-100 text-[11px] px-2 py-1 rounded-md transition-all"
                                style={{ background: 'var(--assistant-control-bg)', color: 'var(--assistant-text-muted)' }}
                              >
                                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.2 8.4l3 3 6.6-7" />
                                </svg>
                              </button>
                            ) : (
                              <span className="shrink-0" style={{ color: 'var(--assistant-tone-1)' }}>
                                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.2 8.4l3 3 6.6-7" />
                                </svg>
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {!hasPending && todayReminders.length > 0 && (
                    <div
                      className="px-4 py-2.5 border-t text-center text-[11px]"
                      style={{ borderTopColor: 'var(--assistant-border-soft)', color: 'var(--assistant-tone-1)' }}
                    >
                      All done for today
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onOpenMenu}
            className={`flex items-center gap-2 pl-1.5 pr-1 py-1 rounded-lg transition-colors ${classes.topNavProfile}`}
            aria-label="Open profile menu"
            title={userName ? `Signed in as ${userName}` : 'Profile'}
          >
            {userAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={userAvatar} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
            ) : (
              <span className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${classes.topNavAvatarFallback}`}>
                {(userName || 'U').slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="hidden sm:inline max-w-[140px] truncate text-[13px] font-medium">
              {userName || 'Account'}
            </span>
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6l4 4 4-4" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Bottom tab bar — mobile only: view tabs ── */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t"
        style={{ background: 'var(--assistant-bg)', borderColor: 'var(--assistant-border-soft)' }}
      >
        {NAV_ITEMS.map(item => {
          const isActive =
            item.id === 'timeline'
              ? activeView === 'timeline' || timelineOpen
              : item.id === 'calendar'
              ? activeView === 'calendar' || calendarOpen
              : activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSetActiveView(item.id)}
              className={`relative min-w-[56px] flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-all ${
                isActive ? classes.activeTab : classes.inactiveTab
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="text-[9px] font-medium">{item.mobileLabel}</span>
              {isActive && (
                <span className="absolute bottom-0 w-8 h-0.5 rounded-full" style={{ background: 'var(--assistant-accent)' }} />
              )}
            </button>
          );
        })}
      </div>

    </>
  );
}
