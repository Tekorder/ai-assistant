'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { getProfile, hasSession, signOutAndClear, subscribeSessionChange } from '@/lib/session';
import {
  readProjectsLS, writeProjectsLS, cleanupEmptyTasks,
  getSyncStatus, loadFromDatabase, SYNC_STATUS_EVENT, type SyncStatus, type SyncState,
  readRemindersLS, writeRemindersLS, LS_KEY_REMINDERS, type ReminderItem,
} from '@/lib/datacenter';
import { TaskFlagBadge } from './TaskFlag';
import classes from '@/app/assistant/_theme/themes.module.css';

export type View = 'chat' | 'reminders' | 'timeline' | 'archive' | 'quick' | 'calendar';

interface TopNavBarProps {
  title: string;
  activeView: View;
  setActiveView: (v: View) => void;
  onHome: () => void;
  onOpenMenu: () => void;
  /** Header search: opens a keyword panel, same as clicking a keyword */
  onSearchKeyword?: (word: string) => void;
  timelineOpen?: boolean;
  calendarOpen?: boolean;
  themeStyle?: 'light' | 'dark';
  onToggleTheme?: () => void;
}


function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function isReminderToday(r: ReminderItem, today: string): boolean {
  if (r.daily) return !r.days?.length || r.days.includes(weekdayOf(today));
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
    label: 'Check Lists',
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

const SYNC_DOT_COLOR: Record<SyncState, string> = {
  synced:     '#16a34a',
  syncing:    '#f59e0b',
  connecting: '#f59e0b',
  error:      '#dc2626',
  off:        '#9ca3af',
};

/** Green = sync is on and everything is saved to the server. Click retries when it isn't green. */
function SyncDot({ tipSide }: { tipSide?: TipSide } = {}) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  useEffect(() => {
    const update = () => setStatus(getSyncStatus());
    update();
    window.addEventListener(SYNC_STATUS_EVENT, update);
    return () => window.removeEventListener(SYNC_STATUS_EVENT, update);
  }, []);
  if (!status) return null;
  const busy = status.state === 'syncing' || status.state === 'connecting';
  const dot = (
    <button
      type="button"
      onClick={() => { if (status.state !== 'synced') void loadFromDatabase(); }}
      className="flex h-7 w-5 items-center justify-center shrink-0"
      title={tipSide ? undefined : status.message}
      aria-label={status.message}
    >
      <span className="relative flex h-2.5 w-2.5">
        {busy && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            style={{ background: SYNC_DOT_COLOR[status.state] }}
          />
        )}
        <span
          className="relative inline-flex h-2.5 w-2.5 rounded-full"
          style={{ background: SYNC_DOT_COLOR[status.state] }}
        />
      </span>
    </button>
  );
  return tipSide ? <IconTip label={status.message} side={tipSide}>{dot}</IconTip> : dot;
}

export type TipSide = 'right' | 'bottom' | 'bottom-start' | 'bottom-end' | 'top' | 'top-start' | 'top-end';

/** Hover label for an icon button — says what it does. Pure CSS (no delay state). */
export function IconTip({
  label,
  side = 'right',
  children,
}: {
  label: React.ReactNode;
  /** -start / -end hug the button's left / right edge — for buttons near a clipping edge */
  side?: TipSide;
  children: React.ReactNode;
}) {
  const pos = {
    right: 'left-full top-1/2 ml-2 -translate-y-1/2',
    bottom: 'left-1/2 top-full mt-1.5 -translate-x-1/2',
    'bottom-start': 'left-0 top-full mt-1.5',
    'bottom-end': 'right-0 top-full mt-1.5',
    top: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
    'top-start': 'bottom-full left-0 mb-1.5',
    'top-end': 'bottom-full right-0 mb-1.5',
  }[side];
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-[200] w-max max-w-[220px] rounded-md px-2 py-1 text-[12px] font-medium leading-snug opacity-0 shadow-lg transition-opacity delay-150 duration-150 group-hover/tip:opacity-100 ${pos}`}
        style={{ background: 'var(--assistant-panel-bg)', color: 'var(--assistant-text)', border: '1px solid var(--assistant-border-soft)' }}
      >
        {label}
      </span>
    </span>
  );
}

/**
 * Icon button that pops a small menu with the Check Lists / Habits / Reminders
 * toggles (they used to sit in the header). The menu is portaled because the
 * sidebar and the rail clip their content; it stays open so several can be toggled.
 */
export function PanelsMenuButton({
  open,
  onToggle,
  side = 'below',
}: {
  open: Record<'lists' | 'habits' | 'reminders', boolean>;
  onToggle: Record<'lists' | 'habits' | 'reminders', () => void>;
  /** below: under the button (sidebar header) · right: beside it (closed-sidebar rail) */
  side?: 'below' | 'right';
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const toggleMenu = () => {
    if (!menuOpen && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos(side === 'right'
        ? { left: r.right + 8, top: r.top }
        : { left: Math.max(8, r.right - 200), top: r.bottom + 6 });
    }
    setMenuOpen(o => !o);
  };

  const anyOpen = open.lists || open.habits || open.reminders;
  const btn = (
    <button
      ref={btnRef}
      type="button"
      onClick={toggleMenu}
      className={`flex items-center justify-center rounded-md transition-colors ${side === 'right' ? 'h-9 w-9' : 'h-8 w-8'}`}
      style={{ color: menuOpen || anyOpen ? 'var(--assistant-text)' : 'var(--assistant-text-muted)' }}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      aria-label="Panels: Check Lists, Habits, Reminders"
    >
      <svg viewBox="0 0 16 16" className={side === 'right' ? 'h-6 w-6' : 'h-4 w-4'} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <rect x="2" y="2" width="5" height="5" rx="1.2" />
        <rect x="9" y="2" width="5" height="5" rx="1.2" />
        <rect x="2" y="9" width="5" height="5" rx="1.2" />
        <rect x="9" y="9" width="5" height="5" rx="1.2" />
      </svg>
    </button>
  );

  return (
    <>
      {menuOpen ? btn : (
        <IconTip label="Open Check Lists, Habits or Reminders" side={side === 'right' ? 'right' : 'bottom-end'}>
          {btn}
        </IconTip>
      )}
      {menuOpen && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="drop-in fixed z-[10060] w-[200px] rounded-xl p-1.5 shadow-2xl"
          style={{ ...pos, background: 'var(--assistant-panel-bg)', border: '1px solid var(--assistant-border-soft)' }}
        >
          {CENTER_NAV.map(item => {
            const isOn = open[item.id];
            return (
              <button
                key={item.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={isOn}
                onClick={onToggle[item.id]}
                className={[
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[14px] transition-colors',
                  isOn ? classes.topNavCenterActive : classes.topNavCenterInactive,
                ].join(' ')}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {isOn && (
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.2 8.4l3 3 6.6-7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>,
        document.querySelector('[data-assistant-root]') ?? document.body,
      )}
    </>
  );
}

type AccountActionsProps = {
  /**
   * top: header row (mobile) · footer: sidebar foot (desktop) · rail: vertical strip when
   * the sidebar is closed · bell: just the reminders bell (sidebar header, desktop)
   */
  placement: 'top' | 'footer' | 'rail' | 'bell';
  onOpenMenu: () => void;
  themeStyle?: 'light' | 'dark';
  onToggleTheme?: () => void;
  dockLayout?: 'stack' | 'accordion';
  onToggleDockLayout?: () => void;
};

/**
 * Panel layout / theme / reminders bell / sync dot / profile. Lives in the mobile
 * header and, on desktop, at the foot of the sidebar (ChatGPT-style).
 */
export function AccountActions({
  placement,
  onOpenMenu,
  themeStyle = 'light',
  onToggleTheme,
  dockLayout,
  onToggleDockLayout,
}: AccountActionsProps) {
  const [userName, setUserName] = useState('');
  const [userAvatar, setUserAvatar] = useState('');
  useEffect(() => {
    const { name, email, avatarUrl } = getProfile();
    // Never display a raw email — fall back to its local part
    setUserName(name || email.split('@')[0] || '');
    setUserAvatar(avatarUrl);
  }, []);

  // ── Reminders state ──
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [hydrated, setHydrated]   = useState(false);
  const [dropOpen, setDropOpen]   = useState(false);
  const [dropPos, setDropPos]     = useState<React.CSSProperties>({});
  const dropRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const today = todayYMD();

  const load = useCallback(() => {
    setReminders(readRemindersLS().reminders);
    setHydrated(true);
  }, []);

  useEffect(() => {
    load();
    const handler = (e: StorageEvent) => { if (e.key === LS_KEY_REMINDERS) load(); };
    window.addEventListener('storage', handler);
    window.addEventListener('youtask_reminders_updated', load);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('youtask_reminders_updated', load);
    };
  }, [load]);

  // Close dropdown on outside click (the menu is portaled, so check it too)
  useEffect(() => {
    if (!dropOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (dropRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropOpen]);

  const toggleDrop = () => {
    if (!dropOpen && placement !== 'top' && bellRef.current) {
      // Sidebar/rail are clipped containers → the menu is portaled and placed from the bell
      const r = bellRef.current.getBoundingClientRect();
      setDropPos(
        placement === 'rail' ? { left: r.right + 8, bottom: window.innerHeight - r.bottom }
        : placement === 'bell' ? { left: Math.max(8, r.right - 288), top: r.bottom + 6 }
        : { left: Math.max(8, r.left - 120), bottom: window.innerHeight - r.top + 8 },
      );
    }
    setDropOpen(o => !o);
  };

  const todayReminders = hydrated
    ? reminders.filter(r => isReminderToday(r, today) && r.title.trim().length > 0)
    : [];
  const pendingCount = todayReminders.filter(r => r.dismissedOn !== today).length;
  const hasPending   = pendingCount > 0;

  const dismissOne = (id: string) => {
    const next = reminders.map(r => r.id === id ? { ...r, dismissedOn: today } : r);
    setReminders(next);
    writeRemindersLS({ reminders: next });
  };

  const dismissAll = () => {
    const todayIds = new Set(todayReminders.map(r => r.id));
    const next = reminders.map(r => todayIds.has(r.id) ? { ...r, dismissedOn: today } : r);
    setReminders(next);
    writeRemindersLS({ reminders: next });
    setDropOpen(false);
  };

  // The closed-sidebar rail has room to spare → bigger icons
  const ic = placement === 'rail' ? 'h-6 w-6' : 'h-4 w-4';
  // Rail buttons grow with their icons (the CSS-module button is 2rem)
  const btnCls = placement === 'rail' ? `${classes.topNavIconBtn} !h-9 !w-9` : classes.topNavIconBtn;
  // Hover labels on desktop placements (mobile keeps native titles)
  const tipSide: TipSide | null =
    placement === 'rail' ? 'right' : placement === 'footer' ? 'top-end' : placement === 'bell' ? 'bottom-end' : null;
  const tip = (label: React.ReactNode, node: React.ReactNode) =>
    tipSide ? <IconTip label={label} side={tipSide}>{node}</IconTip> : node;

  const avatarSize = placement === 'rail' ? 'h-8 w-8' : 'h-7 w-7';
  const avatar = userAvatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={userAvatar} alt="" className={`${avatarSize} rounded-full object-cover shrink-0`} />
  ) : (
    <span className={`${avatarSize} rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0 ${classes.topNavAvatarFallback}`}>
      {(userName || 'U').slice(0, 1).toUpperCase()}
    </span>
  );

  const layoutBtn = onToggleDockLayout ? (
    // Like the moon/sun, the icon shows what a click switches to
    <span className={placement === 'top' ? 'hidden md:inline-flex' : 'inline-flex'}>
      {tip(
        dockLayout === 'accordion' ? 'Show panels side by side' : 'Show panels as an accordion',
        <button
          type="button"
          onClick={onToggleDockLayout}
          className={btnCls}
          aria-label={dockLayout === 'accordion' ? 'Show panels side by side' : 'Show panels as accordion'}
        >
          {dockLayout === 'accordion' ? (
            <svg viewBox="0 0 16 16" className={ic} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <rect x="1.8" y="2.5" width="12.4" height="11" rx="1.5" />
              <path d="M6 2.5v11M10 2.5v11" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className={ic} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <rect x="1.8" y="2.5" width="12.4" height="11" rx="1.5" />
              <path d="M1.8 5.5h12.4M1.8 8.5h12.4" />
            </svg>
          )}
        </button>,
      )}
    </span>
  ) : null;

  const themeBtn = onToggleTheme ? tip(
    themeStyle === 'light' ? 'Switch to dark mode' : 'Switch to light mode',
    <button
      type="button"
      onClick={onToggleTheme}
      className={btnCls}
      aria-label={themeStyle === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      title={tipSide ? undefined : themeStyle === 'light' ? 'Dark mode' : 'Light mode'}
    >
      {themeStyle === 'light' ? (
        <svg viewBox="0 0 16 16" className={ic} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.2 9.4A5.5 5.5 0 0 1 6.6 2.8 5.6 5.6 0 1 0 13.2 9.4z" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className={ic} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <circle cx="8" cy="8" r="3.2" />
          <path strokeLinecap="round" d="M8 1.5v1.4M8 13.1v1.4M1.5 8h1.4M13.1 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" />
        </svg>
      )}
    </button>,
  ) : null;

  const reminderMenu = (
    <div
      ref={menuRef}
      className={[
        'drop-in rounded-xl shadow-2xl overflow-hidden z-[10060] isolate',
        placement === 'top'
          ? 'fixed left-3 right-3 top-14 md:absolute md:left-auto md:right-0 md:top-10 md:w-72'
          : 'fixed w-72',
      ].join(' ')}
      style={{
        background: 'var(--assistant-panel-bg)',
        border: '1px solid var(--assistant-border-soft)',
        ...(placement === 'top' ? {} : dropPos),
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderBottomColor: 'var(--assistant-border-soft)' }}
      >
        <span className="text-[13px] font-semibold tracking-wide" style={{ color: 'var(--assistant-text-soft)' }}>
          Today&apos;s reminders
        </span>
        {hasPending && (
          <button
            onClick={dismissAll}
            className="text-[12px] transition-colors"
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
          <div className="px-4 py-5 text-[13px] text-center" style={{ color: 'var(--assistant-text-faint)' }}>
            No reminders for today
          </div>
        ) : (
          todayReminders.map(r => {
            const isDone = r.dismissedOn === today;
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
                    className="text-[14px] font-medium leading-snug truncate"
                    style={{
                      color: isDone ? 'var(--assistant-text-faint)' : 'var(--assistant-text)',
                      textDecoration: isDone ? 'line-through' : 'none',
                    }}
                  >
                    <TaskFlagBadge source={r} inline />
                    {r.title}
                  </div>
                  {(r.time || r.daily) && (
                    <div className="text-[12px] mt-0.5" style={{ color: 'var(--assistant-text-faint)' }}>
                      {r.time && <span>{r.time}</span>}
                      {r.daily  && <span className="ml-1">· daily</span>}
                    </div>
                  )}
                </div>
                {!isDone ? (
                  <button
                    onClick={() => dismissOne(r.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-[12px] px-2 py-1 rounded-md transition-all"
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
          className="px-4 py-2.5 border-t text-center text-[12px]"
          style={{ borderTopColor: 'var(--assistant-border-soft)', color: 'var(--assistant-tone-1)' }}
        >
          All done for today
        </div>
      )}
    </div>
  );

  const bellStatus =
    !todayReminders.length ? 'No reminders today'
    : hasPending ? `${pendingCount} reminder${pendingCount > 1 ? 's' : ''} pending`
    : 'All reminders done today';
  const bellButton = (
      <button
        ref={bellRef}
        type="button"
        onClick={toggleDrop}
        title={tipSide ? undefined : bellStatus}
        className={`relative ${btnCls}`}
        aria-label="Notifications"
      >
        <span className={hasPending ? 'bell-ring inline-flex' : 'inline-flex'}>
          <svg viewBox="0 0 16 16" className={ic} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
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
  );
  const bell = hydrated ? (
    <div ref={dropRef} className="relative">
      {dropOpen ? bellButton : tip(<>Today&apos;s reminders · {bellStatus}</>, bellButton)}
      {dropOpen && (placement === 'top'
        ? reminderMenu
        : createPortal(reminderMenu, document.querySelector('[data-assistant-root]') ?? document.body))}
    </div>
  ) : null;

  // In the footer the dot is the left-most item → its label opens toward the inside
  const syncDot = tipSide ? <SyncDot tipSide={placement === 'footer' ? 'top-start' : tipSide} /> : <SyncDot />;

  if (placement === 'bell') return bell;

  if (placement === 'rail') {
    return (
      <div className="flex flex-col items-center gap-1.5">
        {layoutBtn}
        {themeBtn}
        {bell}
        {syncDot}
        {tip(
          <>Menu &amp; account{userName ? ` · ${userName}` : ''}</>,
          <button
            type="button"
            onClick={onOpenMenu}
            className="rounded-full"
            aria-label="Open menu"
          >
            {avatar}
          </button>,
        )}
      </div>
    );
  }

  const profileBtn = (
    <button
      type="button"
      onClick={onOpenMenu}
      className={[
        'flex items-center gap-2 pl-1.5 pr-1 py-1 rounded-lg transition-colors',
        placement === 'footer' ? 'min-w-0 flex-1' : '',
        classes.topNavProfile,
      ].join(' ')}
      aria-label="Open menu"
      title={userName ? `Signed in as ${userName}` : 'Profile'}
    >
      {avatar}
      <span className={`${placement === 'footer' ? 'min-w-0 flex-1 text-left' : 'hidden sm:inline max-w-[140px]'} truncate text-[14px] font-medium`}>
        {userName || 'Account'}
      </span>
      {/* Menu icon — opens the drawer. In the sidebar it sits at the top instead. */}
      {placement !== 'footer' && (
        <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 opacity-80" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path strokeLinecap="round" d="M2.75 4.25h10.5M2.75 8h10.5M2.75 11.75h10.5" />
        </svg>
      )}
    </button>
  );

  if (placement === 'footer') {
    // One row: sync status · who you are · quick toggles on the right.
    // The bell lives in the sidebar header next to the panels menu.
    return (
      <div className="flex items-center gap-1">
        {syncDot}
        {profileBtn}
        {layoutBtn}
        {themeBtn}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 md:gap-2 shrink-0">
      {layoutBtn}
      {themeBtn}
      {bell}
      <SyncDot />
      {profileBtn}
    </div>
  );
}

/** Magnifier icon that expands into an input; Enter opens the keyword panel. */
function HeaderSearch({ onSearch }: { onSearch: (word: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const close = () => { setOpen(false); setValue(''); };

  if (!open) {
    return (
      <IconTip label="Search keyword" side="bottom-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={classes.topNavIconBtn}
          aria-label="Search keyword"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <circle cx="7" cy="7" r="4.5" />
            <path strokeLinecap="round" d="M10.4 10.4L14 14" />
          </svg>
        </button>
      </IconTip>
    );
  }

  return (
    <div
      className="flex h-8 w-[min(240px,60vw)] items-center gap-2 rounded-lg px-2.5"
      style={{ background: 'var(--assistant-control-bg)', border: '1px solid var(--assistant-border-soft)' }}
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ color: 'var(--assistant-text-muted)' }} aria-hidden>
        <circle cx="7" cy="7" r="4.5" />
        <path strokeLinecap="round" d="M10.4 10.4L14 14" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && value.trim()) { onSearch(value.trim()); close(); }
          else if (e.key === 'Escape') close();
        }}
        onBlur={() => { if (!value.trim()) close(); }}
        placeholder="Search keyword"
        aria-label="Search keyword"
        className="min-w-0 flex-1 bg-transparent text-[14px] outline-none"
        style={{ color: 'var(--assistant-text)' }}
      />
    </div>
  );
}

export default function TopNavBar({
  activeView,
  setActiveView,
  onOpenMenu,
  onSearchKeyword,
  timelineOpen = false,
  calendarOpen = false,
  themeStyle = 'light',
  onToggleTheme,
}: Omit<TopNavBarProps, 'title' | 'onHome'> & { title?: string; onHome?: () => void }) {
  const router = useRouter();

  const enforcePrismaSession = useCallback(() => {
    if (hasSession()) return;

    // No session (e.g. logged out in another tab): sign out and go Home. Local
    // data stays — it may hold edits that haven't reached Postgres yet.
    void signOutAndClear({ keepLocalData: true });
    router.replace('/');
  }, [router]);

  // ── Current user label ──
  // Warm both logo variants so the light/dark toggle swaps instantly (no blank frame)
  useEffect(() => {
    for (const src of ['/logoblue.png', '/logowhite-clean.png']) new Image().src = src;
  }, []);

  // Enforce session on mount + when tab refocuses or storage changes
  useEffect(() => {
    enforcePrismaSession();

    const unsubscribe = subscribeSessionChange(enforcePrismaSession);
    const onFocus = () => enforcePrismaSession();
    window.addEventListener('focus', onFocus);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', onFocus);
    };
  }, [enforcePrismaSession]);

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={themeStyle === 'dark' ? '/logowhite-clean.png' : '/logoblue.png'}
            alt="youtask"
            className="h-7 w-auto shrink-0"
          />
        </div>

        {/* Check Lists / Habits / Reminders moved to the sidebar's panels menu (PanelsMenuButton);
            on mobile they're in the drawer */}
        <div className="flex-1" />

        {onSearchKeyword && (
          <div className="flex items-center shrink-0 md:mr-0 mr-1">
            <HeaderSearch onSearch={onSearchKeyword} />
          </div>
        )}

        {/* Right: on mobile only — on desktop these live at the foot of the sidebar */}
        <div className="md:hidden">
          <AccountActions
            placement="top"
            onOpenMenu={onOpenMenu}
            themeStyle={themeStyle}
            onToggleTheme={onToggleTheme}
          />
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
              <span className="text-[10px] font-medium">{item.mobileLabel}</span>
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
