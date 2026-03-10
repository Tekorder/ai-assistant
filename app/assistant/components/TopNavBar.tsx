'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';


type ViewType = 'chat' | 'reminders' | 'timeline' | 'archive' | 'quick';

type Reminder = {
  id: string;
  title: string;
  date: string;
  time?: string;
  daily?: boolean;
  weekly?: boolean;   // if true, matches by weekday of `date`
  dismissed?: boolean;
};

type Props = {
  title: string;
  activeView: ViewType;
  setActiveView: (v: ViewType) => void;
  onHome: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
};

const LS_REMINDERS = 'youtask_reminders_v1';

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Returns 0=Sun,1=Mon,...6=Sat for a YYYY-MM-DD string
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

export default function TopNavBar({
  title,
  activeView,
  setActiveView,
  onHome,
  sidebarOpen,
  onToggleSidebar,
}: Props) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [hydrated, setHydrated]   = useState(false);
  const [dropOpen, setDropOpen]   = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const today = todayYMD();

  const load = useCallback(() => {
    setReminders(readReminders());
    setHydrated(true);
  }, []);

  const router = useRouter();

    const handleLogout = () => {
      sessionStorage.removeItem('playfabTicket');
      sessionStorage.removeItem('twofa_ok');
      router.replace('/login');
    };

  useEffect(() => {
    load();
    // Sync if another tab/component writes to the same key
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
    ? reminders.filter(r => isReminderToday(r, today))
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

  const navItems: { view: ViewType; label: string; icon: string }[] = [
    { view: 'quick',    label: 'Home',     icon: '⚡' },
    { view: 'timeline', label: 'Timeline', icon: '📅' },
    { view: 'archive',  label: 'Archive',  icon: '🗑️' },
  ];

  const navBtn = (view: ViewType, label: string) => (
    <button
      key={view}
      onClick={() => setActiveView(view)}
      className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
        activeView === view
          ? 'bg-white/15 text-white'
          : 'text-white/60 hover:text-white hover:bg-white/10'
      }`}
    >
      {label}
    </button>
  );

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
      <div className="h-14 flex items-center justify-between px-4 bg-gray-900 border-b border-white/10 backdrop-blur-md">

        {/* LEFT */}
        <div className="flex items-center gap-4">
          <button
            onClick={onToggleSidebar}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10 transition-all"
          >
            <div className="relative w-5 h-4">
              <span className={`absolute left-0 w-full h-[2px] bg-white transition-all duration-300 ${sidebarOpen ? 'rotate-45 top-2' : 'top-0'}`} />
              <span className={`absolute left-0 w-full h-[2px] bg-white transition-all duration-300 ${sidebarOpen ? 'opacity-0' : 'top-2'}`} />
              <span className={`absolute left-0 w-full h-[2px] bg-white transition-all duration-300 ${sidebarOpen ? '-rotate-45 top-2' : 'top-4'}`} />
            </div>
          </button>

          <div
            onClick={onHome}
            className="text-white font-semibold text-lg cursor-pointer hover:opacity-80 transition-opacity"
          >
            {title}
          </div>
        </div>

        {/* CENTER — desktop only */}
        <div className="hidden md:flex items-center gap-2">
          {navItems.map(n => navBtn(n.view, n.label))}
        </div>

        {/* RIGHT */}
        <div className="flex items-center gap-3">

          {/* ── Bell — always visible once hydrated ── */}
          {hydrated && (
            <div ref={dropRef} className="relative">
              <button
                onClick={() => setDropOpen(o => !o)}
                title={
                  !todayReminders.length ? 'No reminders today'
                  : hasPending ? `${pendingCount} reminder${pendingCount > 1 ? 's' : ''} pending`
                  : 'All reminders done today'
                }
                className="relative w-9 h-9 flex items-center justify-center rounded-lg transition-all hover:bg-white/10"
              >
                <span
                  className={hasPending ? 'bell-ring' : ''}
                  style={{ fontSize: 18, lineHeight: 1 }}
                >
                  🔔
                </span>

                {/* Pending count badge */}
                {hasPending && (
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-[3px] flex items-center justify-center rounded-full bg-red-500 text-white ring-2 ring-gray-900"
                    style={{ fontSize: 10, fontWeight: 700, lineHeight: 1 }}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>

              {/* ── Dropdown ── */}
              {dropOpen && (
                <div className="drop-in absolute right-0 top-11 w-72 rounded-xl border border-white/10 bg-gray-950 shadow-2xl overflow-hidden z-[200]">

                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
                    <span className="text-[12px] font-semibold text-white/70 tracking-wide">
                      Todays reminders
                    </span>
                    {hasPending && (
                      <button
                        onClick={dismissAll}
                        className="text-[11px] text-white/40 hover:text-emerald-400 transition-colors"
                      >
                        Dismiss all
                      </button>
                    )}
                  </div>

                  {/* List */}
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
                            {/* Status dot */}
                            <span
                              className="shrink-0 w-2 h-2 rounded-full mt-0.5"
                              style={{ background: isDone ? 'rgba(52,211,153,.5)' : '#f87171' }}
                            />

                            {/* Content */}
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

                            {/* Dismiss / done indicator */}
                            {!isDone ? (
                              <button
                                onClick={() => dismissOne(r.id)}
                                className="shrink-0 opacity-0 group-hover:opacity-100 text-[11px] px-2 py-1 rounded-md border border-white/10 text-white/40 hover:text-emerald-400 hover:border-emerald-400/30 transition-all"
                              >
                                ✓
                              </button>
                            ) : (
                              <span className="shrink-0 text-[11px] text-emerald-500/60">✓</span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Footer */}
                  {!hasPending && todayReminders.length > 0 && (
                    <div className="px-4 py-2.5 border-t border-white/8 text-center text-[11px] text-emerald-400/70">
                      All done for today 🎉
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="hidden md:flex items-center gap-2 text-white/50 text-sm">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Live
          </div>

          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-lg text-sm text-white/60 hover:text-red-400 hover:bg-white/10 transition-all"
          >
            Logout
          </button>
        </div>
      </div>

      {/* ── Bottom tab bar — mobile only ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex bg-gray-900 border-t border-white/10">
        {navItems.map(n => (
          <button
            key={n.view}
            onClick={() => setActiveView(n.view)}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-all ${
              activeView === n.view ? 'text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            <span className="text-xl leading-none">{n.icon}</span>
            <span className="text-[10px] font-medium">{n.label}</span>
            {activeView === n.view && (
              <span className="absolute bottom-0 w-8 h-0.5 bg-white rounded-full" />
            )}
          </button>
        ))}
      </div>
    </>
  );
}