'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { RemindersProvider } from './_context/RemindersContext';
import { QuickFiltersProvider } from './components/QuickFiltersContext';
import { Sidebar } from './components/Sidebar';
import ChatBox from './components/Chatbox';
import Timeline from './components/tabs/Timeline';
import Quick from './components/tabs/Quick';
import CalendarView from './components/tabs/Calendar';
import TopNavBar, { AccountActions, HeaderSearch, IconTip, NAV_ITEMS, PanelsMenuButton, type MenuAnchor } from './components/TopNavBar';
import Menu from './components/Menu';
import HabitsPanel from './components/HabitsPanel';
import RemindersPanel from './components/RemindersPanel';
import DayPanel from './components/DayPanel';
import ActivityLogPanel from './components/ActivityLogPanel';
import ChecklistsPanel from './components/ChecklistsPanel';
import SettingsPanel from './components/SettingsPanel';
import { ThemePicker } from './components/ThemePicker';
import { ShiftScrollHint } from './components/ShiftScrollHint';
import ProfilePanel from './components/ProfilePanel';
import ReminderNotifier from './components/ReminderNotifier';
import { assistantThemes, getAssistantThemeVars, getThemeCounterpart, type AssistantThemeName } from './_theme/themes';
import classes from './_theme/themes.module.css';
import { PivotPanel, buildPrunedPivotTree, buildListPivotTree, type PivotTreeRow } from './components/Pivot';
import {
  UNC_TITLE,
  type Block,
  readProjectsLS,
  writeProjectsLS,
  cleanupEmptyTasks,
  updateBlock,
  isValidDateYYYYMMDD,
  todayYMD,
  LS_KEY_CHECKLISTS,
  readChecklistsLS,
  getTaskFlag,
  loadFromDatabase,
  isProjectsHydrated,
  PROJECTS_HYDRATED_EVENT,
} from '@/lib/datacenter';
import { validateSession } from '@/lib/session';
import { useRouter } from 'next/navigation';
import { WALDY_CLEAR_CHAT_EVENT } from './_hook/useTaskMessaging';
import pkg from '../../package.json';

const APP_VERSION = pkg.version;


type View = 'chat' | 'reminders' | 'habits' | 'lists' | 'timeline' | 'archive' | 'quick' | 'calendar';
const ASSISTANT_THEME_LS_KEY = 'assistant_theme_v1';
const LAYOUT_LS_KEY = 'youtask_workspace_layout_v1';
const DOCK_LAYOUT_LS_KEY = 'youtask_dock_layout';
const RESTORABLE_VIEWS: View[] = ['quick', 'timeline', 'calendar', 'lists', 'habits', 'reminders'];

type SavedLayout = Partial<{
  activeView: View;
  sidebarOpen: boolean;
  habitsOpen: boolean;
  remindersOpen: boolean;
  activityOpen: boolean;
  listsOpen: boolean;
  pivots: Array<{ id: string; word: string; listId?: string }>;
  dayPanels: Array<{ id: string; ymd: string }>;
  dockOrder: string[];
}>;

export default function App() {
  const router = useRouter();
  const [selectedTheme, setSelectedTheme] = useState<AssistantThemeName>('tekorder');
  const theme = assistantThemes[selectedTheme];
  const [activeView, setActiveView] = useState<View>('quick');

  const handleSetActiveView = useCallback((v: View) => {
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
  }, [activeView]);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarClosing, setSidebarClosing] = useState(false);
  const [habitsOpen, setHabitsOpen] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themesOpen, setThemesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmClearChat, setConfirmClearChat] = useState(false);
  const [pivotInstances, setPivotInstances] = useState<
    Array<{ id: string; word: string; listId?: string }>
  >([]);
  const [dayPanelInstances, setDayPanelInstances] = useState<
    Array<{ id: string; ymd: string }>
  >([]);

  const MIN_SIDEBAR = 360;
  // Space left of the open sidebar (the sidebar card adds its own 12px margin on top)
  const RAIL_OPEN_GUTTER = 4;
  const DECK_RIGHT_PAD = 120;
  const PANEL_WIDTH = 320;

  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    console.log(`Youtask v${APP_VERSION}`);
  }, []);
  useEffect(() => {
    void (async () => {
      const valid = await validateSession();
      if (!valid) { router.replace('/login'); return; }
      void loadFromDatabase();
    })();
  }, [router]);
  useEffect(() => {
    const stored = window.localStorage.getItem(ASSISTANT_THEME_LS_KEY);
    if (!stored) return;
    if (stored in assistantThemes) setSelectedTheme(stored as AssistantThemeName);
  }, []);
  useEffect(() => {
    window.localStorage.setItem(ASSISTANT_THEME_LS_KEY, selectedTheme);
  }, [selectedTheme]);

  // Switching theme swaps the --assistant-* variables. CSS `transition`s can't
  // interpolate the gradient backgrounds, and the per-element color/background
  // transitions fire at staggered durations — so some elements lag behind others.
  // Use the View Transitions API to cross-fade the whole page old→new in one
  // synchronized animation. While the new state is captured, freeze the ad-hoc
  // per-element transitions so the live DOM snaps cleanly to the new theme.
  // Falls back to an instant (still synced) swap when unsupported or reduced-motion.
  const handleSelectTheme = useCallback((next: AssistantThemeName) => {
    const root = document.documentElement;
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!doc.startViewTransition || reduceMotion) {
      root.classList.add('theme-switching');
      flushSync(() => setSelectedTheme(next));
      void root.offsetWidth;
      root.classList.remove('theme-switching');
      return;
    }

    root.classList.add('theme-switching');
    const transition = doc.startViewTransition(() => {
      flushSync(() => setSelectedTheme(next));
    });
    transition.finished.finally(() => {
      root.classList.remove('theme-switching');
    });
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Right-dock panels stack newest-first, right after the main panel. Reopening a
  // panel that's already open restamps it to the front instead of duplicating it.
  // A panel keeps its slot while closing so its collapse doesn't reshuffle the others.
  // `seeded` holds keys restored from localStorage so their first appearance isn't restamped.
  // How the right-dock panels lay out: side-by-side columns or one accordion column.
  // A per-device preference.
  const [dockLayout, setDockLayout] = useState<'stack' | 'accordion'>('stack');
  // The one expanded accordion panel (or none). Expanding another collapses it, and
  // a new or re-requested panel takes over as the expanded one.
  const [accordionOpenKey, setAccordionOpenKey] = useState<string | null>(null);
  const setAccordionPanelOpen = useCallback((key: string, open: boolean) => {
    setAccordionOpenKey((prev) => (open ? key : prev === key ? null : prev));
  }, []);
  const accordionColumnRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    try {
      if (localStorage.getItem(DOCK_LAYOUT_LS_KEY) === 'accordion') setDockLayout('accordion');
    } catch {}
  }, []);
  const toggleDockLayout = useCallback(() => {
    setDockLayout((prev) => {
      const next = prev === 'stack' ? 'accordion' : 'stack';
      try { localStorage.setItem(DOCK_LAYOUT_LS_KEY, next); } catch {}
      return next;
    });
  }, []);

  const dockSeqRef = useRef<{ n: number; map: Record<string, number>; open: Set<string>; seeded: Set<string> }>({
    n: 0,
    map: {},
    open: new Set(),
    seeded: new Set(),
  });

  // Restore the saved workspace layout once we know the viewport. Panels are only
  // restored on desktop — on mobile they'd pop up as overlays on load.
  const [layoutRestored, setLayoutRestored] = useState(false);
  useEffect(() => {
    if (isDesktop === null || layoutRestored) return;
    let saved: SavedLayout | null = null;
    try {
      const raw = localStorage.getItem(LAYOUT_LS_KEY);
      if (raw) saved = JSON.parse(raw) as SavedLayout;
    } catch {}

    if (saved?.activeView && RESTORABLE_VIEWS.includes(saved.activeView)) setActiveView(saved.activeView);

    if (isDesktop) {
      if (!saved) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(saved.sidebarOpen !== false);
        setHabitsOpen(!!saved.habitsOpen);
        setRemindersOpen(!!saved.remindersOpen);
        setActivityOpen(!!saved.activityOpen);
        setListsOpen(!!saved.listsOpen);
        setPivotInstances(Array.isArray(saved.pivots) ? saved.pivots : []);
        setDayPanelInstances(
          Array.isArray(saved.dayPanels) ? saved.dayPanels.filter((d) => isValidDateYYYYMMDD(d.ymd)) : [],
        );
        const seq = dockSeqRef.current;
        for (const k of saved.dockOrder ?? []) {
          seq.map[k] = ++seq.n;
          seq.seeded.add(k);
        }
      }
    }
    setLayoutRestored(true);
  }, [isDesktop, layoutRestored]);

  // On load with no tasks anywhere, land on Workspace — that's where the
  // first-list wizard lives, even if the saved layout was Timeline/Calendar.
  // Runs once, after the layout restore and once the server has confirmed.
  useEffect(() => {
    if (!layoutRestored) return;
    let done = false;
    const check = () => {
      if (done || !isProjectsHydrated()) return;
      done = true;
      const hasTasks = (readProjectsLS()?.projects ?? []).some(p =>
        (p.blocks ?? []).some(b => b.indent > 0 && b.archived !== true && (b.text || '').trim() !== ''),
      );
      if (!hasTasks) setActiveView('quick');
    };
    check();
    window.addEventListener(PROJECTS_HYDRATED_EVENT, check);
    return () => window.removeEventListener(PROJECTS_HYDRATED_EVENT, check);
  }, [layoutRestored]);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatClosing, setChatClosing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Sidebar header search: while open its field replaces the header's icons
  const [sidebarSearchOpen, setSidebarSearchOpen] = useState(false);
  // Set → the menu pops from that button (desktop); null → drawer (mobile)
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const deckScrollRef = useRef<HTMLDivElement | null>(null);
  const sidebarCloseTimerRef = useRef<number | null>(null);
  const chatCloseTimerRef = useRef<number | null>(null);
  const prevOpenRef = useRef({
    sidebar: false,
    habits: false,
    reminders: false,
    activity: false,
    lists: false,
    pivots: 0,
    dayPanels: 0,
  });

  const requestCloseSidebar = useCallback(() => {
    if (!sidebarOpen || sidebarClosing) return;
    setSidebarClosing(true);
    if (sidebarCloseTimerRef.current !== null) window.clearTimeout(sidebarCloseTimerRef.current);
    sidebarCloseTimerRef.current = window.setTimeout(() => {
      sidebarCloseTimerRef.current = null;
      setSidebarOpen(false);
      setSidebarClosing(false);
    }, 200);
  }, [sidebarClosing, sidebarOpen]);

  const openSidebar = useCallback(() => {
    if (sidebarCloseTimerRef.current !== null) {
      window.clearTimeout(sidebarCloseTimerRef.current);
      sidebarCloseTimerRef.current = null;
    }
    setSidebarClosing(false);
    setSidebarOpen(true);
  }, []);
  // The sidebar was folded by scrolling the deck (not by hand) → scrolling back reopens it
  const scrollFoldedSidebarRef = useRef(false);
  const scrollFoldedAtRef = useRef(0);

  const toggleSidebar = useCallback(() => {
    // A hand toggle overrides the scroll fold: whatever they pick now stays
    scrollFoldedSidebarRef.current = false;
    if (sidebarOpen) {
      requestCloseSidebar();
      return;
    }
    openSidebar();
  }, [requestCloseSidebar, openSidebar, sidebarOpen]);
  const toggleHabits = useCallback(() => setHabitsOpen((v) => !v), []);
  const toggleReminders = useCallback(() => setRemindersOpen((v) => !v), []);
  const toggleActivity = useCallback(() => setActivityOpen((v) => !v), []);
  const toggleLists = useCallback(() => setListsOpen((v) => !v), []);

  useEffect(() => {
    return () => {
      if (sidebarCloseTimerRef.current !== null) window.clearTimeout(sidebarCloseTimerRef.current);
    };
  }, []);
  // Stack-mode carousel after the main panel: dock panels three per page
  const [carouselPage, setCarouselPage] = useState(0);

  /**
   * Ease the deck so the dock panel `key` is fully in view for `ms`, re-reading its
   * box every frame. Dock panels (Lists/Habits/Reminders/Activity) grow their width
   * from 0 over 420ms, so a one-shot scroll aims at the *old* box and the panel ends
   * up clipped. Following it keeps it in view as it grows. In stack mode the panel
   * lives in the carousel, so the carousel box is what gets revealed.
   */
  const followRafRef = useRef<number | null>(null);
  const followDeckToPanel = useCallback((key: string, ms = 600) => {
    if (followRafRef.current !== null) cancelAnimationFrame(followRafRef.current);
    const until = performance.now() + ms;
    const step = () => {
      const el = deckScrollRef.current;
      const panel =
        el?.querySelector<HTMLElement>('[data-deck-carousel]') ??
        el?.querySelector<HTMLElement>(`[data-dock-key="${CSS.escape(key)}"]`);
      if (!el || !panel) { followRafRef.current = null; return; }
      const left = panel.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
      const minLeft = left + panel.offsetWidth - el.clientWidth + 40;
      // Scroll as little as possible: reveal the right edge without hiding the left one
      const wanted = Math.min(Math.max(el.scrollLeft, minLeft), left - 12);
      const target = Math.max(0, Math.min(wanted, Math.max(0, el.scrollWidth - el.clientWidth)));
      const next = el.scrollLeft + (target - el.scrollLeft) * 0.22;
      el.scrollLeft = Math.abs(target - next) < 1 ? target : next;
      followRafRef.current = performance.now() < until ? requestAnimationFrame(step) : null;
    };
    followRafRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => () => {
    if (followRafRef.current !== null) cancelAnimationFrame(followRafRef.current);
  }, []);

  const pivotInstancesRef = useRef(pivotInstances);
  pivotInstancesRef.current = pivotInstances;
  const dayPanelInstancesRef = useRef(dayPanelInstances);
  dayPanelInstancesRef.current = dayPanelInstances;

  /**
   * An already-open panel was requested again: restamp it to the front of the dock
   * and move it to the end of its array (mobile overlays show the last instance).
   */
  const bringDockInstanceToFront = useCallback(
    <T extends { id: string }>(
      inst: T,
      setInstances: React.Dispatch<React.SetStateAction<T[]>>,
    ) => {
      const seq = dockSeqRef.current;
      seq.map[inst.id] = ++seq.n;
      setAccordionPanelOpen(inst.id, true); // a re-requested panel opens expanded
      setInstances((prev) => [...prev.filter((p) => p.id !== inst.id), inst]);
      if (isDesktop === true) followDeckToPanel(inst.id);
    },
    [isDesktop, followDeckToPanel, setAccordionPanelOpen],
  );

  const requestOpenPivot = useCallback(
    (detail: {
      word: string;
      blockId: string | null;
      origin: 'quick' | 'sidebar' | 'header';
      listId?: string | null;
    }) => {
      if (detail.listId) {
        const existing = pivotInstancesRef.current.find((p) => p.listId === detail.listId);
        if (existing) { bringDockInstanceToFront(existing, setPivotInstances); return; }
        const w = detail.word.trim() || 'List';
        const id = `list_${detail.listId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        setPivotInstances((prev) => [...prev, { id, word: w, listId: detail.listId! }]);
        return;
      }
      const word = detail.word.trim();
      if (!word) return;
      const existing = pivotInstancesRef.current.find(
        (p) => !p.listId && p.word.toLowerCase() === word.toLowerCase(),
      );
      if (existing) { bringDockInstanceToFront(existing, setPivotInstances); return; }
      const id = `${word.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setPivotInstances((prev) => [...prev, { id, word }]);
    },
    [bringDockInstanceToFront],
  );

  const requestOpenDayPanel = useCallback((ymd: string) => {
    if (!isValidDateYYYYMMDD(ymd)) return;
    const existing = dayPanelInstancesRef.current.find((p) => p.ymd === ymd);
    if (existing) { bringDockInstanceToFront(existing, setDayPanelInstances); return; }
    const id = `day_${ymd}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setDayPanelInstances((prev) => [...prev, { id, ymd }]);
  }, [bringDockInstanceToFront]);

  const closeDayPanelInstance = useCallback((id: string) => {
    setDayPanelInstances((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const openDayYmids = useMemo(
    () => dayPanelInstances.map((p) => p.ymd),
    [dayPanelInstances],
  );

  const openChatOverlay = useCallback(() => {
    if (chatCloseTimerRef.current !== null) {
      window.clearTimeout(chatCloseTimerRef.current);
      chatCloseTimerRef.current = null;
    }
    setChatClosing(false);
    setChatOpen(true);
  }, []);

  const closeChatOverlay = useCallback(() => {
    if (!chatOpen || chatClosing) return;
    setChatClosing(true);
    chatCloseTimerRef.current = window.setTimeout(() => {
      chatCloseTimerRef.current = null;
      setChatOpen(false);
      setChatClosing(false);
    }, 200);
  }, [chatClosing, chatOpen]);

  useEffect(() => {
    return () => {
      if (chatCloseTimerRef.current !== null) window.clearTimeout(chatCloseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isDesktop !== true) return;
    const prev = prevOpenRef.current;
    const sidebarAdded = !prev.sidebar && sidebarOpen;
    const rightPanelAdded =
      (!prev.habits && habitsOpen) ||
      (!prev.reminders && remindersOpen) ||
      (!prev.activity && activityOpen) ||
      (!prev.lists && listsOpen) ||
      pivotInstances.length > prev.pivots ||
      dayPanelInstances.length > prev.dayPanels;

    const el = deckScrollRef.current;
    if (el) {
      if (sidebarAdded) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else if (rightPanelAdded) {
        // The newest panel is the one with the highest stamp
        const seq = dockSeqRef.current;
        let newest: string | null = null;
        for (const k of seq.open) if (newest === null || seq.map[k] > seq.map[newest]) newest = k;
        if (newest) followDeckToPanel(newest);
      }
    }

    prevOpenRef.current = {
      sidebar: sidebarOpen,
      habits: habitsOpen,
      reminders: remindersOpen,
      activity: activityOpen,
      lists: listsOpen,
      pivots: pivotInstances.length,
      dayPanels: dayPanelInstances.length,
    };
  }, [
    isDesktop,
    sidebarOpen,
    habitsOpen,
    remindersOpen,
    activityOpen,
    listsOpen,
    pivotInstances.length,
    dayPanelInstances.length,
    followDeckToPanel,
  ]);

  const [projectBlocks, setProjectBlocks] = useState<Block[]>([]);
  useEffect(() => {
    const load = () => {
      const p = readProjectsLS();
      if (!p?.projects?.length) {
        setProjectBlocks([]);
        return;
      }
      const proj =
        p.projects.find((x) => x.project_id === p.selectedProjectId) ?? p.projects[0];
      setProjectBlocks(proj?.blocks ?? []);
    };
    load();
    window.addEventListener('youtask_projects_updated', load);
    window.addEventListener('youtask_blocks_updated', load);
    return () => {
      window.removeEventListener('youtask_projects_updated', load);
      window.removeEventListener('youtask_blocks_updated', load);
    };
  }, []);

  const [listsCount, setListsCount] = useState(0);
  useEffect(() => {
    const load = () => {
      try {
        setListsCount(readChecklistsLS().lists.length);
      } catch {
        setListsCount(0);
      }
    };
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY_CHECKLISTS) load();
    };
    window.addEventListener('youtask_checklists_updated', load);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('youtask_checklists_updated', load);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const pivotRowsById = useMemo<Record<string, PivotTreeRow[]>>(() => {
    const out: Record<string, PivotTreeRow[]> = {};
    for (const p of pivotInstances) {
      out[p.id] = p.listId
        ? buildListPivotTree(projectBlocks, p.listId, { uncTitle: UNC_TITLE })
        : buildPrunedPivotTree(projectBlocks, p.word, { uncTitle: UNC_TITLE });
    }
    return out;
  }, [pivotInstances, projectBlocks]);

  const activityTasks = useMemo(
    () =>
      projectBlocks
        .filter((b) => b.indent > 0 && b.checked === true && isValidDateYYYYMMDD(b.deadline))
        .map((b) => ({
          id: b.id,
          text: b.text ?? '',
          date: b.deadline as string,
          flag: getTaskFlag(b),
        })),
    [projectBlocks],
  );

  const handlePivotToggleTask = useCallback((blockId: string, nextChecked: boolean) => {
    const payload = readProjectsLS();
    if (!payload?.projects?.length) return;
    const pid = payload.selectedProjectId;
    const pi = payload.projects.findIndex((p) => p.project_id === pid);
    if (pi < 0) return;
    const proj = payload.projects[pi];
    const newBlocks = updateBlock(proj.blocks, blockId, { checked: nextChecked });
    const projects = [...payload.projects];
    projects[pi] = { ...proj, blocks: newBlocks };
    writeProjectsLS({ projects, selectedProjectId: payload.selectedProjectId });
  }, []);

  const handlePivotGoTo = useCallback((blockId: string) => {
    requestAnimationFrame(() => {
      try {
        const el = document.querySelector<HTMLElement>(
          `[data-youtask-block="${CSS.escape(blockId)}"]`,
        );
        el?.focus();
      } catch {
        const el = document.querySelector<HTMLElement>(`[data-youtask-block="${blockId}"]`);
        el?.focus();
      }
    });
  }, []);

  const handleSetActiveViewFromNav = useCallback((v: View) => {
    setActiveView(v);
  }, []);

  const isLight = theme.style === 'light';

  const renderView = () => {
    if (activeView === 'timeline') {
      return (
        <div className="mx-auto h-full min-h-0 w-full max-w-6xl px-3 md:px-8">
          <Timeline />
        </div>
      );
    }
    if (activeView === 'calendar') {
      return (
        <CalendarView
          isLight={isLight}
          onOpenDayPanel={requestOpenDayPanel}
          openDayYmids={openDayYmids}
        />
      );
    }
    if (activeView === 'lists' || activeView === 'habits' || activeView === 'reminders') {
      const backToAgenda = () => setActiveView('quick');
      return (
        // Same width as the tabs bar, so the tab content uses the whole panel
        <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col px-3 md:px-8">
          {activeView === 'lists' ? <ChecklistsPanel variant="tab" open onClose={backToAgenda} />
            : activeView === 'habits' ? <HabitsPanel variant="tab" open onClose={backToAgenda} />
            : <RemindersPanel variant="tab" open onClose={backToAgenda} />}
        </div>
      );
    }
    return <Quick onOpenPivot={requestOpenPivot} />;
  };

  const sidebarVisualOpen = sidebarOpen && !sidebarClosing;
  // Quick.tsx growth is keyed off sidebarOpen (which flips at the close timeout),
  // not sidebarVisualOpen — so on close the area holds while the content fades,
  // then collapses + Quick stretches back together once the timeout fires.
  const mainPanelSolo =
    !sidebarOpen &&
    !habitsOpen &&
    !remindersOpen &&
    !activityOpen &&
    !listsOpen &&
    pivotInstances.length === 0 &&
    dayPanelInstances.length === 0;
  const mainPanelWidth = mainPanelSolo ? '90vw' : '70vw';

  // Side panel width (shared by every dock panel except Sidebar and main): starts at PANEL_WIDTH,
  // grows ~60px per extra tab, and is capped at half the main dock width
  // (main is 70vw whenever any panel is open, including this one → cap at 35vw).
  const LISTS_TAB_STEP = 60;
  const desiredListsPx = PANEL_WIDTH + Math.max(0, listsCount - 1) * LISTS_TAB_STEP;
  const listsPanelWidth = `min(${desiredListsPx}px, 35vw)`;
  // Reminders rows carry date + time + daily inputs → twice the shared panel width
  const remindersPanelWidth = `calc(${listsPanelWidth} * 2)`;

  const closePivotInstance = useCallback((id: string) => {
    setPivotInstances((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const openDockKeys = [
    habitsOpen && 'habits',
    remindersOpen && 'reminders',
    activityOpen && 'activity',
    listsOpen && 'lists',
    ...pivotInstances.map((p) => p.id),
    ...dayPanelInstances.map((d) => d.id),
  ].filter(Boolean) as string[];
  {
    const seq = dockSeqRef.current;
    for (const k of openDockKeys) {
      if (!seq.open.has(k) && !seq.seeded.delete(k)) seq.map[k] = ++seq.n;
    }
    seq.open = new Set(openDockKeys);
  }
  const dockStamp = (key: string) => dockSeqRef.current.map[key] ?? 1;
  // Higher stamp → lower flex order, so the newest panel sits first. Stays positive
  // so dock panels always come after the sidebar and main panel (order 0).
  const dockOrder = (key: string) => 1_000_000_000 - dockStamp(key);

  // Accordion mode: one column; each panel expands/collapses on its own
  const newestDockKey = openDockKeys.reduce<string | null>(
    (best, k) => (best === null || dockStamp(k) > dockStamp(best) ? k : best),
    null,
  );
  // The newest panel changed (opened, re-requested, or the newest one closed) → it
  // becomes the expanded one. Set during render so the old panel never flashes open.
  const [accordionSeenNewest, setAccordionSeenNewest] = useState<string | null>(null);
  if (newestDockKey !== accordionSeenNewest) {
    setAccordionSeenNewest(newestDockKey);
    setAccordionOpenKey(newestDockKey);
  }
  const isAccordionExpanded = (key: string) => accordionOpenKey === key;
  const isAccordion = dockLayout === 'accordion';
  const ACCORDION_BAR = '49px'; // = panel header height (h-[49px]) → only the title bar shows
  // Day panels have a two-line header (weekday + date), so their collapsed bar is taller
  const accordionBarHeight = (key: string) => (dayPanelInstances.some(d => d.id === key) ? '72px' : ACCORDION_BAR);

  // Stack-mode carousel: open dock panels in visual order (newest first), three per
  // page. The carousel is as wide as the current page and slides between pages.
  const CAROUSEL_PAGE_SIZE = 3;
  const carouselPages: string[][] = [];
  {
    const visual = [...openDockKeys].sort((a, b) => dockOrder(a) - dockOrder(b));
    for (let i = 0; i < visual.length; i += CAROUSEL_PAGE_SIZE) carouselPages.push(visual.slice(i, i + CAROUSEL_PAGE_SIZE));
  }
  // A new or re-requested panel sits first → show the first page
  const [carouselSeenNewest, setCarouselSeenNewest] = useState<string | null>(null);
  if (newestDockKey !== carouselSeenNewest) {
    setCarouselSeenNewest(newestDockKey);
    setCarouselPage(0);
  }
  const activeCarouselPage = Math.min(carouselPage, Math.max(0, carouselPages.length - 1));
  const dockWidthOf = (key: string) => (key === 'reminders' ? remindersPanelWidth : listsPanelWidth);
  const sumWidths = (keys: string[]) => (keys.length ? `calc(${keys.map(dockWidthOf).join(' + ')})` : '0px');
  const carouselWidth = sumWidths(carouselPages[activeCarouselPage] ?? []);
  const carouselShift = sumWidths(carouselPages.slice(0, activeCarouselPage).flat());

  const dockSlotStyle = (key: string, open: boolean, width: string): React.CSSProperties => {
    const visible = open && isDesktop === true;
    if (isAccordion) {
      const expanded = visible && isAccordionExpanded(key);
      return {
        order: dockOrder(key),
        width: '100%',
        // Expanded: as tall as its content, one after another; collapsed: just the title bar
        flex: '0 0 auto',
        height: !visible ? 0 : expanded ? 'auto' : `calc(${accordionBarHeight(key)} + 0.75rem)`,
        opacity: visible ? 1 : 0,
        overflow: 'hidden',
        transition: 'opacity 260ms ease',
      };
    }
    return {
      order: dockOrder(key),
      width: visible ? width : 0,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateX(0)' : 'translateX(10px)',
      transition:
        'width 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease, transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
    };
  };
  // Stack: top margin + room for the bottom bar. Accordion: the column holds the bottom
  // room; an expanded panel takes its content height, a collapsed one only its title bar.
  const dockSlotInnerClass = (key: string) =>
    !isAccordion
      ? 'relative m-3 box-border flex h-[calc(100%-5.5rem)] min-h-0 w-[calc(100%-1.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl'
      // Accordion items are separated by a top rule (no rounded card) so they read as rows, not titles
      : isAccordionExpanded(key)
      ? 'relative mx-3 mt-3 box-border flex h-auto w-[calc(100%-1.5rem)] shrink-0 flex-col overflow-hidden border-t [border-top-color:var(--assistant-border-soft)]'
      : 'relative mx-3 mt-3 box-border flex h-[calc(100%-0.75rem)] min-h-0 w-[calc(100%-1.5rem)] shrink-0 flex-col overflow-hidden border-t [border-top-color:var(--assistant-border-soft)]';
  // Clicking a panel's title bar toggles it; the ✕ (right 3.5rem) stays clickable.
  // The chevron sits in the header's left padding, just before the title.
  const accordionBar = (key: string, label: string) => {
    if (!isAccordion) return null;
    const expanded = isAccordionExpanded(key);
    return (
      <button
        type="button"
        onClick={() => setAccordionPanelOpen(key, !expanded)}
        // Chevron lines up with the header's first line (centered in a 49px bar), even on
        // the taller two-line day headers — the whole header stays clickable
        className="absolute left-0 top-0 z-10 flex cursor-pointer items-start"
        style={{
          height: accordionBarHeight(key),
          paddingTop: `calc((${ACCORDION_BAR} - 12px) / 2)`,
          right: '3.5rem',
          color: 'var(--assistant-text-muted)',
        }}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
        data-tip={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
      >
        <svg
          viewBox="0 0 16 16"
          className="ml-[2px] h-3 w-3 shrink-0 transition-transform duration-150"
          style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6l4 4 4-4" />
        </svg>
      </button>
    );
  };

  // Panel view (stack): scrolling the deck to the right folds the sidebar into the rail,
  // which stays pinned on the left. Programmatic scrolls (following a newly opened
  // panel, or back to 0 when the sidebar opens) don't count. A sidebar folded this way
  // opens again once the deck is scrolled back to the start; one that was already closed
  // (or that the person opened/closed by hand meanwhile) is left alone.
  const [deckScrolled, setDeckScrolled] = useState(false);
  useEffect(() => {
    const el = deckScrollRef.current;
    if (!el || isAccordion || isDesktop !== true) { setDeckScrolled(false); return; }
    let lastLeft = el.scrollLeft;
    const reopenIfAutoFolded = () => {
      if (!scrollFoldedSidebarRef.current || sidebarOpen) return;
      // While the fold animates the deck narrows and its scroll clamps back toward 0 — not a "scroll back"
      if (performance.now() - scrollFoldedAtRef.current < 700) return;
      scrollFoldedSidebarRef.current = false;
      openSidebar();
    };
    const onScroll = () => {
      const left = el.scrollLeft;
      const forward = left > lastLeft;
      lastLeft = left;
      setDeckScrolled(left > 0);
      if (forward && left > 24 && followRafRef.current === null && sidebarOpen && !sidebarClosing) {
        scrollFoldedSidebarRef.current = true;
        scrollFoldedAtRef.current = performance.now();
        requestCloseSidebar();
      } else if (!forward && left <= 0) {
        reopenIfAutoFolded();
      }
    };
    // Already at the start (or nothing left to scroll): a leftward wheel / swipe still means "back"
    const onWheel = (e: WheelEvent) => {
      const leftward = e.deltaX < 0 || (e.shiftKey && e.deltaY < 0);
      if (leftward && el.scrollLeft <= 0) reopenIfAutoFolded();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
    };
  }, [isAccordion, isDesktop, requestCloseSidebar, openSidebar, sidebarOpen, sidebarClosing]);

  // Entering accordion mode: the deck no longer scrolls sideways, so drop any offset
  useEffect(() => {
    if (isAccordion && deckScrollRef.current) deckScrollRef.current.scrollLeft = 0;
  }, [isAccordion]);

  // With ~25 bars the newest panel can sit below the fold — bring it into view
  useEffect(() => {
    if (!isAccordion || !newestDockKey) return;
    const col = accordionColumnRef.current;
    const slot = col?.querySelector<HTMLElement>(`[data-dock-key="${CSS.escape(newestDockKey)}"]`);
    if (!col || !slot) return;
    const top = slot.offsetTop; // column is `relative` → offset within its scroll content
    if (top < col.scrollTop || top + slot.offsetHeight > col.scrollTop + col.clientHeight) {
      col.scrollTo({ top: Math.max(0, top - 8), behavior: 'smooth' });
    }
  }, [isAccordion, newestDockKey]);

  // Oldest → newest, so restoring replays the stamps in the same relative order
  const dockOrderSignature = openDockKeys
    .slice()
    .sort((a, b) => dockStamp(a) - dockStamp(b))
    .join('|');

  useEffect(() => {
    if (!layoutRestored || isDesktop !== true) return;
    const data: SavedLayout = {
      activeView,
      sidebarOpen,
      habitsOpen,
      remindersOpen,
      activityOpen,
      listsOpen,
      pivots: pivotInstances,
      dayPanels: dayPanelInstances,
      dockOrder: dockOrderSignature ? dockOrderSignature.split('|') : [],
    };
    try {
      localStorage.setItem(LAYOUT_LS_KEY, JSON.stringify(data));
    } catch {}
  }, [
    layoutRestored,
    isDesktop,
    activeView,
    sidebarOpen,
    habitsOpen,
    remindersOpen,
    activityOpen,
    listsOpen,
    pivotInstances,
    dayPanelInstances,
    dockOrderSignature,
  ]);

  // Check Lists / Habits / Reminders toggles (sidebar header + closed-sidebar rail)
  const panelsMenuProps = {
    open: { lists: listsOpen, habits: habitsOpen, reminders: remindersOpen },
    onToggle: { lists: toggleLists, habits: toggleHabits, reminders: toggleReminders },
  };

  // Shared by the sidebar foot and the closed-sidebar rail
  const accountActionsProps = {
    // A second click on the name / avatar closes the popover
    onOpenMenu: (anchor?: MenuAnchor) => { setMenuAnchor(anchor ?? null); setMenuOpen(o => (anchor ? !o : true)); },
    themeStyle: theme.style,
    // Stay in the same family, flip light <-> dark
    onToggleTheme: () => handleSelectTheme(getThemeCounterpart(selectedTheme)),
    dockLayout,
    onToggleDockLayout: toggleDockLayout,
  };

  // Sidebar contents (header icons, lists, profile foot): the desktop drawer and the mobile overlay
  const renderSidebarShell = (mobile: boolean) => {
    // On mobile Check Lists / Habits / Reminders are tabs, so the panels menu switches tab;
    // the deck's layout toggle doesn't apply there
    const showTab = (v: View) => () => { requestCloseSidebar(); handleSetActiveViewFromNav(v); };
    const panels = mobile
      ? { ...panelsMenuProps, onToggle: { lists: showTab('lists'), habits: showTab('habits'), reminders: showTab('reminders') } }
      : panelsMenuProps;
    const account = mobile ? { ...accountActionsProps, onToggleDockLayout: undefined } : accountActionsProps;
    return (
      <>
        <div className="absolute right-3 top-3 z-[120]">
          <IconTip label={mobile ? 'Close' : 'Hide sidebar'} side="bottom-end">
            <button
              type="button"
              onClick={mobile ? requestCloseSidebar : toggleSidebar}
              className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
              style={{ color: 'var(--assistant-text-muted)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--assistant-text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--assistant-text-muted)')}
              aria-label={mobile ? 'Close sidebar' : 'Collapse sidebar'}
            >
              {mobile ? (
                // Mobile: a full-screen overlay → a plain close X
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path strokeLinecap="round" d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
                </svg>
              ) : (
                // Open state: divider sits right — the panel is wide
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
                  <path d="M10.5 2.5v11" />
                </svg>
              )}
            </button>
          </IconTip>
        </div>
        {/* Logo — top-left, opposite the collapse button (the menu opens from the name in the foot) */}
        <div className="absolute left-4 top-3 z-[110] flex h-8 items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={theme.style === 'dark' ? '/logowhite-clean.png' : '/logoblue.png'}
            alt="youtask"
            className="h-[28px] w-auto shrink-0"
          />
        </div>
        {/* Search + reminders bell + Check Lists / Habits / Reminders menu — left of the collapse
            button. While searching, the field takes the place of all three icons */}
        <div className="absolute right-[3.25rem] top-3 z-[120] flex items-center gap-1">
          <HeaderSearch
            compact
            open={sidebarSearchOpen}
            onOpenChange={setSidebarSearchOpen}
            onSearch={(word) => {
              if (mobile) requestCloseSidebar();
              requestOpenPivot({ word, blockId: null, origin: 'header' });
            }}
          />
          {!sidebarSearchOpen && (
            <>
              <AccountActions placement="bell" {...account} />
              <PanelsMenuButton {...panels} side="below" />
            </>
          )}
        </div>
        {/* Starts under the menu/collapse buttons; its top rule sits on the main panel's tab line */}
        <div
          className="mt-[48px] flex min-h-0 flex-1 flex-col"
          style={{ borderTop: '1px solid var(--assistant-border-soft)' }}
        >
          <Sidebar
            onOpenPivot={requestOpenPivot}
          />
        </div>
        {/* ChatGPT-style foot: profile + layout / theme / reminders / sync */}
        <div className="shrink-0 px-2 py-2" style={{ borderTop: '1px solid var(--assistant-border-soft)' }}>
          <AccountActions placement="footer" {...account} />
        </div>
      </>
    );
  };

  const lastPivot = pivotInstances[pivotInstances.length - 1] ?? null;
  const lastDayPanel = dayPanelInstances[dayPanelInstances.length - 1] ?? null;

  return (
    <RemindersProvider>
    <QuickFiltersProvider>
      <div
        data-assistant-root
        data-theme-style={theme.style}
        // `isolate` scopes the glow's z-index:-1 to this root: behind the UI, above the canvas
        className="relative isolate flex h-screen flex-col"
        style={{
          ...getAssistantThemeVars(theme),
          background: 'var(--assistant-canvas)',
          color: 'var(--assistant-text)',
        }}
      >
        <div aria-hidden="true" className="assistant-bg-glow" />
        <TopNavBar
          title="Youtask"
          activeView={activeView}
          setActiveView={handleSetActiveViewFromNav}
          onHome={() => setActiveView('quick')}
          // Mobile: the avatar opens the sidelist (same as desktop's); its foot opens the menu popover
          onOpenMenu={openSidebar}
          onSearchKeyword={(word) => requestOpenPivot({ word, blockId: null, origin: 'header' })}
          timelineOpen={activeView === 'timeline'}
          calendarOpen={activeView === 'calendar'}
          themeStyle={theme.style}
          onToggleTheme={() => {
            // Stay in the same family, flip light <-> dark
            handleSelectTheme(getThemeCounterpart(selectedTheme));
          }}
        />

        <div className="relative flex-1 overflow-hidden md:hidden">
          <div className="h-full overflow-y-auto">{renderView()}</div>
        </div>

        {/* Mobile sidebar — fixed overlay above bottom nav */}
        {(sidebarOpen || sidebarClosing) && (
          <>
            <style>{`
              @keyframes sidebarMobileOverlayIn { from { opacity: 0; } to { opacity: 1; } }
              @keyframes sidebarMobileOverlayOut { from { opacity: 1; } to { opacity: 0; } }
              @keyframes sidebarMobileIn {
                from { transform: translateX(-34px); opacity: 0; filter: blur(1px); }
                60% { transform: translateX(3px); opacity: .92; filter: blur(0); }
                to { transform: translateX(0); opacity: 1; }
              }
              @keyframes sidebarMobileOut {
                from { transform: translateX(0); opacity: 1; filter: blur(0); }
                to { transform: translateX(-20px); opacity: 0; filter: blur(1px); }
              }
            `}</style>
            <button
              type="button"
              className="md:hidden fixed inset-0 z-[200]"
              onClick={requestCloseSidebar}
              aria-label="Close sidebar"
              style={{
                background: 'var(--assistant-overlay)',
                animation: sidebarClosing
                  ? 'sidebarMobileOverlayOut 0.18s ease-out both'
                  : 'sidebarMobileOverlayIn 0.22s ease-out both',
              }}
            />
            <div
              className={`md:hidden fixed left-3 top-3 z-[201] flex h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl ${classes.panelGlass} ${classes.panelOverlay}`}
              style={{
                color: 'var(--assistant-text)',
                animation: sidebarClosing
                  ? 'sidebarMobileOut 0.18s cubic-bezier(0.4, 0, 1, 1) both'
                  : 'sidebarMobileIn 0.46s cubic-bezier(0.22, 1, 0.36, 1) 0.06s both',
              }}
            >
              {isDesktop === false && renderSidebarShell(true)}
            </div>
          </>
        )}

        <div
          ref={deckScrollRef}
          // The dock's horizontal scrollbar is the one visible scrollbar in the app, pinned to the bottom
          // Accordion mode is three columns that fit the window (sidebar | main | accordion) → no horizontal scroll
          className={`deck-scrollbar hidden min-h-0 flex-1 overflow-y-hidden md:block ${
            isAccordion ? 'overflow-x-hidden' : 'overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]'
          }`}
        >
          <div className="flex h-full min-h-0 min-w-full">
          {/* Rail: 80px while the sidebar is closed (big icons sit ~36px off the screen edge);
              just a thin gutter when it's open (its icons are hidden then), so the sidebar sits
              near the edge. Sticky: it stays put while the panels scroll sideways under it */}
          <div
            className="sticky left-0 z-[125] h-full shrink-0"
            style={{
              width: sidebarVisualOpen ? RAIL_OPEN_GUTTER : 80,
              transition: 'width 420ms cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          >
            {/* Scrolled → opaque strip so panels passing underneath don't show through the icons.
                Fixed (not clipped by the deck) so it also covers the scrollbar's lane at the bottom */}
            {deckScrolled && (
              <div
                aria-hidden="true"
                className="pointer-events-none fixed bottom-0 left-0 top-0 -z-10"
                style={{
                  width: sidebarVisualOpen ? RAIL_OPEN_GUTTER : 80,
                  // Light themes: frosted glass — the page's glow still shows through, the panels
                  // behind are blurred away. Dark themes: their flat canvas already blends in.
                  ...(theme.style === 'light'
                    ? {
                        background: 'color-mix(in srgb, var(--assistant-canvas) 30%, transparent)',
                        backdropFilter: 'blur(28px) saturate(1.2)',
                        WebkitBackdropFilter: 'blur(28px) saturate(1.2)',
                      }
                    : { background: 'var(--assistant-canvas)' }),
                }}
              />
            )}
            {/* Rail (sidebar closed): short logo, expand and panels stacked at the top, centered; the menu is the avatar at the foot */}
            <div
              // Centered a touch right of the strip's middle → more air from the screen edge
              className="absolute left-7 right-0 top-6 z-[120] flex flex-col items-center gap-1.5 transition-opacity"
              style={{ opacity: sidebarVisualOpen ? 0 : 1, pointerEvents: sidebarVisualOpen ? 'none' : 'auto' }}
              aria-hidden={sidebarVisualOpen}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={theme.style === 'dark' ? '/logoshort-white.png' : '/logoshort-blue.png'}
                alt="youtask"
                className="mb-2 h-7 w-auto shrink-0"
              />
              <IconTip label="Show sidebar" side="right">
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className="flex h-9 w-9 items-center justify-center rounded-md transition-colors"
                  style={{ color: 'var(--assistant-text-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--assistant-text)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--assistant-text-muted)')}
                  aria-label="Expand sidebar"
                  tabIndex={sidebarVisualOpen ? -1 : 0}
                >
                  {/* Closed state: divider hugs the left — the panel is collapsed */}
                  <svg viewBox="0 0 16 16" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
                    <path d="M5.5 2.5v11" />
                  </svg>
                </button>
              </IconTip>
              {isDesktop === true && <PanelsMenuButton {...panelsMenuProps} side="right" />}
            </div>
            {/* Sidebar closed → its footer controls stack here, level with the sidebar's foot */}
            <div
              className="absolute bottom-3 left-7 right-0 z-[120] flex justify-center pb-2 transition-opacity"
              style={{ opacity: sidebarVisualOpen ? 0 : 1, pointerEvents: sidebarVisualOpen ? 'none' : 'auto' }}
              aria-hidden={sidebarVisualOpen}
            >
              {isDesktop === true && <AccountActions placement="rail" {...accountActionsProps} />}
            </div>
          </div>
          {/* Drawer: the panel is pinned to the slot's right edge, so as the slot narrows the
              panel slides out to the left (and back in) — no fade, it stays solid the whole way */}
          <div
            className="flex h-full shrink-0 justify-end overflow-hidden"
            style={{
              width: sidebarVisualOpen ? MIN_SIDEBAR : 0,
              transition: 'width 420ms cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          >
            <div
              // Full height: no bottom room here (that room is for the chat button, on the right)
              className="relative m-3 box-border flex h-[calc(100%-1.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl"
              style={{
                width: `calc(${MIN_SIDEBAR}px - 1.5rem)`,
              }}
            >
              {isDesktop === true && renderSidebarShell(false)}
            </div>
          </div>

          <div
            // Accordion: the main panel takes whatever the sidebar and the accordion leave
            className={`min-h-0 overflow-hidden flex flex-col ${isAccordion ? 'min-w-0 flex-1' : 'shrink-0'}`}
            style={{
              // Accordion: keep a usable floor — the accordion column gives way instead
              minWidth: isAccordion ? 'min(560px, 50vw)' : mainPanelWidth,
              marginLeft: mainPanelSolo && !isAccordion ? 'auto' : undefined,
              marginRight: mainPanelSolo && !isAccordion ? 'auto' : undefined,
              transition: 'min-width 420ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            {/* MAINPANEL — tabs + active view as one unit inside the dock. Full height: the
                bottom room (5.5rem) is only for the dock carousel's bullets */}
            <div
              className={`relative m-3 box-border flex h-[calc(100%-1.5rem)] min-h-0 w-[calc(100%-1.5rem)] shrink-0 flex-col overflow-hidden ${classes.mainPanel}`}
              style={{
                minWidth: isAccordion ? 0 : `calc(${mainPanelWidth} - 1.5rem)`,
                transition: 'min-width 420ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              <div className="shrink-0 mx-auto w-full max-w-6xl px-3 md:px-8">
                <div className={`px-3 ${classes.mainTabsBar}`}>
                  {NAV_ITEMS.map(item => {
                    const isActive = activeView === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSetActiveView(item.id)}
                        className={[
                          'flex items-center justify-center text-[14px] leading-none transition-colors duration-150 whitespace-nowrap shrink-0',
                          isActive ? classes.mainTabActive : classes.mainTabInactive,
                        ].join(' ')}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className={`relative min-h-0 flex-1 flex flex-col overflow-hidden ${classes.mainPanelBody}`}>
                {renderView()}
              </div>
            </div>
          </div>

          {(() => {
          const dockPanels = (
          <>
          <div className="h-full shrink-0" data-dock-key="habits" style={dockSlotStyle('habits', habitsOpen, listsPanelWidth)}>
            <div className={dockSlotInnerClass('habits')}>
              {accordionBar('habits', 'Habits')}
              {isDesktop && habitsOpen && (
                <HabitsPanel variant="dock" open onClose={() => setHabitsOpen(false)} />
              )}
            </div>
          </div>

          <div className="h-full shrink-0" data-dock-key="reminders" style={dockSlotStyle('reminders', remindersOpen, remindersPanelWidth)}>
            <div className={dockSlotInnerClass('reminders')}>
              {accordionBar('reminders', 'Reminders')}
              {isDesktop && remindersOpen && (
                <RemindersPanel variant="dock" open onClose={() => setRemindersOpen(false)} />
              )}
            </div>
          </div>

          <div className="h-full shrink-0" data-dock-key="activity" style={dockSlotStyle('activity', activityOpen, listsPanelWidth)}>
            <div className={dockSlotInnerClass('activity')}>
              {accordionBar('activity', 'Activity Log')}
              {isDesktop && activityOpen && (
                <ActivityLogPanel
                  variant="dock"
                  open
                  onClose={() => setActivityOpen(false)}
                  tasks={activityTasks}
                />
              )}
            </div>
          </div>

          <div className="h-full shrink-0 overflow-hidden" data-dock-key="lists" style={dockSlotStyle('lists', listsOpen, listsPanelWidth)}>
            <div className={dockSlotInnerClass('lists')}>
              {accordionBar('lists', 'Check Lists')}
              {isDesktop && listsOpen && (
                <ChecklistsPanel variant="dock" open onClose={() => setListsOpen(false)} />
              )}
            </div>
          </div>

          {isDesktop &&
            pivotInstances.map((pivot) => (
              <div
                key={pivot.id}
                className="h-full shrink-0"
                data-dock-key={pivot.id}
                style={dockSlotStyle(pivot.id, true, listsPanelWidth)}
              >
                <div className={dockSlotInnerClass(pivot.id)}>
                  {accordionBar(pivot.id, `${pivot.listId ? 'List' : 'Keyword'}: ${pivot.word}`)}
                  <PivotPanel
                    variant="dock"
                    open
                    word={pivot.word}
                    pivotKind={pivot.listId ? 'list' : 'word'}
                    rows={pivotRowsById[pivot.id] ?? []}
                    onClose={() => closePivotInstance(pivot.id)}
                    onGoTo={handlePivotGoTo}
                    onToggleTask={handlePivotToggleTask}
                  />
                </div>
              </div>
            ))}

          {isDesktop &&
            dayPanelInstances.map((day) => (
              <div
                key={day.id}
                className="h-full shrink-0"
                data-dock-key={day.id}
                style={dockSlotStyle(day.id, true, listsPanelWidth)}
              >
                <div className={dockSlotInnerClass(day.id)}>
                  {accordionBar(day.id, day.ymd)}
                  <DayPanel
                    variant="dock"
                    open
                    ymd={day.ymd}
                    // Side by side: one-line header like the other panels; the accordion keeps two lines
                    oneLineHeader={!isAccordion}
                    onClose={() => closeDayPanelInstance(day.id)}
                  />
                </div>
              </div>
            ))}
          </>
          );
          if (!isAccordion) {
            const go = (page: number) => setCarouselPage(Math.max(0, Math.min(page, carouselPages.length - 1)));
            const pageBtn = 'grid size-6 place-items-center rounded-full text-[16px] leading-none transition-opacity disabled:opacity-30';
            // Carousel right after the main panel: as wide as the current page of three;
            // the row of panels slides underneath it
            return (
              <div
                data-deck-carousel
                className="relative h-full shrink-0 overflow-hidden"
                style={{ order: 1, width: carouselWidth, transition: 'width 420ms cubic-bezier(0.22, 1, 0.36, 1)' }}
              >
                <div
                  className="flex h-full"
                  style={{
                    transform: `translateX(calc(-1 * ${carouselShift}))`,
                    transition: 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                >
                  {dockPanels}
                </div>
                {/* Bullets in the room the panels leave at the bottom */}
                {carouselPages.length > 1 && (
                  <nav
                    aria-label="Panel pages"
                    className="absolute bottom-5 left-1/2 z-[150] flex -translate-x-1/2 items-center gap-1 rounded-full px-1.5 py-1"
                    style={{ border: '1px solid var(--assistant-border-soft)' }}
                  >
                    <button
                      type="button"
                      onClick={() => go(activeCarouselPage - 1)}
                      disabled={activeCarouselPage === 0}
                      className={pageBtn}
                      style={{ color: 'var(--assistant-text-muted)' }}
                      aria-label="Previous panels"
                    >
                      ‹
                    </button>
                    {carouselPages.map((page, i) => {
                      const label = `Panels ${i * CAROUSEL_PAGE_SIZE + 1}–${i * CAROUSEL_PAGE_SIZE + page.length}`;
                      const active = i === activeCarouselPage;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => go(i)}
                          className="grid h-6 place-items-center px-0.5"
                          aria-label={label}
                          aria-current={active ? 'page' : undefined}
                          data-tip={label}
                        >
                          <span
                            className="block h-2 rounded-full transition-all duration-300"
                            style={{
                              width: active ? 20 : 8,
                              background: active
                                ? 'var(--assistant-accent)'
                                : 'color-mix(in srgb, var(--assistant-text) 28%, transparent)',
                            }}
                          />
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => go(activeCarouselPage + 1)}
                      disabled={activeCarouselPage === carouselPages.length - 1}
                      className={pageBtn}
                      style={{ color: 'var(--assistant-text-muted)' }}
                      aria-label="Next panels"
                    >
                      ›
                    </button>
                  </nav>
                )}
              </div>
            );
          }
          // One column right after the main panel; it holds the bottom room the
          // stacked slots reserve individually
          return (
            <div
              ref={accordionColumnRef}
              // Scrolls vertically once the bars + the expanded panel outgrow the deck
              className="deck-scrollbar relative flex h-full shrink flex-col overflow-y-auto overflow-x-hidden"
              style={{
                order: 1,
                // ~64% of the Reminders width (75% less 15%), so expanding a different panel never resizes
                // the column; shrinks (down to 240px) when the window can't also fit the main panel's floor
                width: openDockKeys.length && isDesktop === true ? `calc(${remindersPanelWidth} * 0.6375)` : 0,
                minWidth: openDockKeys.length && isDesktop === true ? 240 : 0,
                // Push the first item down so its top rule lands on the main panel's tab line
                // (main tabs bar: 0.75rem margin + 49px tall, line in its last px)
                paddingTop: '48px',
                paddingBottom: '4.75rem',
                transition: 'width 420ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              {dockPanels}
            </div>
          );
          })()}
          {/* Fixed tail room so the last panel scrolls fully clear of the window edge */}
          <div className="h-full shrink-0" style={{ order: Number.MAX_SAFE_INTEGER, width: isAccordion ? 0 : DECK_RIGHT_PAD }} aria-hidden="true" />
          </div>
        </div>

        {isDesktop === false && (
          <>
            <HabitsPanel variant="overlay" open={habitsOpen} onClose={() => setHabitsOpen(false)} />
            <RemindersPanel
              variant="overlay"
              open={remindersOpen}
              onClose={() => setRemindersOpen(false)}
            />
            <ActivityLogPanel
              variant="overlay"
              open={activityOpen}
              onClose={() => setActivityOpen(false)}
              tasks={activityTasks}
            />
            <ChecklistsPanel
              variant="overlay"
              open={listsOpen}
              onClose={() => setListsOpen(false)}
            />
            <PivotPanel
              variant="overlay"
              open={Boolean(lastPivot)}
              word={lastPivot?.word ?? ''}
              pivotKind={lastPivot?.listId ? 'list' : 'word'}
              rows={lastPivot ? (pivotRowsById[lastPivot.id] ?? []) : []}
              onClose={() => {
                if (lastPivot) closePivotInstance(lastPivot.id);
              }}
              onGoTo={handlePivotGoTo}
              onToggleTask={handlePivotToggleTask}
            />
            <DayPanel
              variant="overlay"
              open={Boolean(lastDayPanel)}
              ymd={lastDayPanel?.ymd ?? todayYMD()}
              onClose={() => {
                if (lastDayPanel) closeDayPanelInstance(lastDayPanel.id);
              }}
            />
          </>
        )}

        <Menu
          open={menuOpen}
          anchor={menuAnchor}
          onClose={() => setMenuOpen(false)}
          themeStyle={theme.style}
          onToggleHabits={toggleHabits}
          onToggleReminders={toggleReminders}
          onToggleActivity={toggleActivity}
          onToggleLists={toggleLists}
          onToggleChat={() => (chatOpen ? closeChatOverlay() : openChatOverlay())}
          // On mobile the sidelist overlay would sit over the dialog → close it first
          onOpenSettings={() => { if (isDesktop === false) requestCloseSidebar(); setSettingsOpen(true); }}
          onOpenProfile={() => { if (isDesktop === false) requestCloseSidebar(); setProfileOpen(true); }}
          onOpenThemes={() => { if (isDesktop === false) requestCloseSidebar(); setThemesOpen(true); }}
          habitsOpen={habitsOpen}
          remindersOpen={remindersOpen}
          activityOpen={activityOpen}
          listsOpen={listsOpen}
          chatOpen={chatOpen}
        />

        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        {/* Desktop only — the horizontal deck doesn't exist on mobile */}
        <ShiftScrollHint deckRef={deckScrollRef} enabled={isDesktop === true} />
        {themesOpen ? (
          <ThemePicker
            selectedTheme={selectedTheme}
            onSelect={handleSelectTheme}
            onClose={() => setThemesOpen(false)}
          />
        ) : null}
        <ProfilePanel open={profileOpen} onClose={() => setProfileOpen(false)} />
        {/* Toasts / browser notifications as reminders come due */}
        <ReminderNotifier />

        {(chatOpen || chatClosing) && (
          <>
            <style>{`
              @keyframes chatOverlayIn  { from { opacity: 0; } to { opacity: 1; } }
              @keyframes chatOverlayOut { from { opacity: 1; } to { opacity: 0; } }
              @keyframes chatPanelIn {
                0%   { opacity: 0; transform: translateY(18px) scale(.94); filter: blur(3px); }
                60%  { opacity: 1; transform: translateY(-3px) scale(1.012); filter: blur(0); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
              }
              @keyframes chatPanelOut {
                from { opacity: 1; transform: translateY(0) scale(1); }
                to   { opacity: 0; transform: translateY(12px) scale(.95); filter: blur(2px); }
              }
            `}</style>
            <button
              type="button"
              className="fixed inset-0 z-[9998]"
              style={{
                background: 'var(--assistant-overlay)',
                animation: chatClosing
                  ? 'chatOverlayOut 0.18s ease-out both'
                  : 'chatOverlayIn 0.22s ease-out both',
              }}
              onClick={closeChatOverlay}
              aria-label="Close AI overlay"
            />
            {/* Mobile: full-screen overlay. Desktop: floating widget bottom-right */}
            <div
              className={[
                `fixed z-[9999] flex flex-col overflow-hidden rounded-2xl ${classes.panelGlass} ${classes.panelOverlay}`,
                // mobile: full panel
                'left-3 top-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)]',
                // desktop: floating bubble, full height between top-5 and bottom-24
                'md:left-auto md:top-5 md:right-5 md:bottom-24 md:w-125 md:max-w-[90vw]',
              ].join(' ')}
              style={{
                color: 'var(--assistant-text)',
                transformOrigin: 'bottom right',
                animation: chatClosing
                  ? 'chatPanelOut 0.18s cubic-bezier(0.4, 0, 1, 1) both'
                  : 'chatPanelIn 0.42s cubic-bezier(0.22, 1, 0.36, 1) both',
              }}
            >
              <div
                className="flex shrink-0 items-center justify-between border-b px-4 py-3"
                style={{ borderColor: 'var(--assistant-border-soft)', background: 'var(--assistant-panel-bg)' }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {/* Avatar with online dot */}
                  <span className="relative h-10 w-10 shrink-0">
                    <span className="absolute inset-0 overflow-hidden rounded-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/waldy-octopus.png" alt="" className="h-full w-full scale-[1.12] object-cover" />
                    </span>
                    <span
                      className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-[#22c55e]"
                      style={{ border: '2px solid var(--assistant-panel-bg)' }}
                    />
                  </span>
                  <div className="min-w-0 leading-tight">
                    <div className="break-words text-[15px] font-semibold" style={{ color: 'var(--assistant-text)' }}>
                      Chat with Octo Bahama
                    </div>
                    <div className="break-words text-[12px]" style={{ color: 'var(--assistant-text-muted)' }}>
                      AI assistant · Online
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setConfirmClearChat(true)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${classes.panelBtn}`}
                    aria-label="Clear chat memory"
                    data-tip="Clear chat memory"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={closeChatOverlay}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${classes.panelCloseBtn}`}
                    aria-label="Close"
                  >
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <ChatBox showReminders={false} onCloseReminders={() => {}} />
              </div>
            </div>
          </>
        )}

        {confirmClearChat && (
          <div className="fixed inset-0 z-[10060] flex items-center justify-center p-5">
            <button
              type="button"
              className={`fixed inset-0 ${classes.modalBackdrop}`}
              onClick={() => setConfirmClearChat(false)}
              aria-label="Cancel"
            />
            <div
              role="alertdialog"
              className={`relative z-10 w-full max-w-[360px] p-6 ${classes.modalCard}`}
            >
              <h3 className={`mb-2 ${classes.modalTitle}`}>Clear chat memory?</h3>
              <p className="text-[14px] mb-5" style={{ color: 'var(--assistant-text-soft)' }}>
                Do you want to clear the chat memory?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmClearChat(false)}
                  className={`flex-1 rounded-lg px-3.5 py-2.5 text-[14px] font-medium transition-colors ${classes.panelBtn}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new Event(WALDY_CLEAR_CHAT_EVENT));
                    setConfirmClearChat(false);
                  }}
                  className="flex-1 rounded-lg px-3.5 py-2.5 text-[14px] font-medium transition-colors"
                  style={{ background: '#f87171', color: '#1a0505' }}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        {!chatOpen && (
          <button
            type="button"
            onClick={openChatOverlay}
            className="hidden md:flex fixed md:bottom-5 right-5 z-[9999] h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-all duration-200 hover:scale-105 active:scale-95"
            aria-label="Open AI chat"
            data-tip="Chat with Octo Bahama"
          >
            {/* Octo avatar — scaled up a bit so the circle crops the image's dark corners */}
            <span className="absolute inset-0 overflow-hidden rounded-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/waldy-octopus.png" alt="" className="h-full w-full scale-[1.12] object-cover" />
            </span>

            {/* Online dot */}
            <span className="pointer-events-none absolute bottom-0 right-0 flex h-4 w-4">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-60 animate-ping" />
              <span
                className="relative inline-flex h-4 w-4 rounded-full bg-[#22c55e]"
                style={{ border: '2.5px solid var(--assistant-bg)' }}
              />
            </span>
          </button>
        )}

        <style jsx global>{`
          [class*='bg-[#050505]'] { background-color: var(--assistant-bg) !important; }
          [class*='text-[#52b352]'] { color: var(--assistant-tone-1) !important; }
          [class*='bg-[#52b352]'] { background-color: var(--assistant-tone-1) !important; }
          [class*='border-[#52b352]'] { border-color: color-mix(in srgb, var(--assistant-tone-1) 60%, transparent) !important; }
          [class*='text-[#d5fc43]'] { color: var(--assistant-tone-2) !important; }
          [class*='bg-[#d5fc43]'] { background-color: var(--assistant-tone-2) !important; }
          [class*='border-[#d5fc43]'] { border-color: color-mix(in srgb, var(--assistant-tone-2) 55%, transparent) !important; }

          /* Active chips/buttons that used same bg/text tone: force white label/icon for contrast */
          [class*='bg-[#d5fc43]'][class*='text-[#d5fc43]'],
          [class*='bg-[#52b352]'][class*='text-[#52b352]'] {
            color: #fff !important;
          }
          [class*='bg-[#d5fc43]'][class*='text-[#d5fc43]'] [class*='text-[#d5fc43]'],
          [class*='bg-[#52b352]'][class*='text-[#52b352]'] [class*='text-[#52b352]'] {
            color: #fff !important;
          }
          [class*='bg-[#52b352]'][class*='text-[#52b352]'] {
            background-color: color-mix(in srgb, var(--assistant-tone-3) 82%, black) !important;
          }
          [class*='bg-[#52b352]'][class*='text-[#52b352]'][class*='hover:bg-[#52b352]']:hover {
            background-color: color-mix(in srgb, var(--assistant-tone-3) 90%, black) !important;
          }

          /* Date pill combo in Quick: make it dark and readable */
          [class*='bg-emerald-'][class*='text-emerald-'],
          [class*='bg-green-'][class*='text-green-'] {
            background-color: color-mix(in srgb, var(--assistant-tone-3) 80%, black) !important;
            color: #fff !important;
          }
          [class*='hover:bg-emerald-']:hover,
          [class*='hover:bg-green-']:hover {
            background-color: color-mix(in srgb, var(--assistant-tone-3) 88%, black) !important;
          }

          /* Normalize hardcoded green/emerald utilities into current theme */
          [class*='text-emerald-'],
          [class*='text-green-'] {
            color: var(--assistant-tone-1) !important;
          }
          [class*='bg-emerald-'],
          [class*='bg-green-'] {
            background-color: var(--assistant-tone-1) !important;
          }
          [class*='border-emerald-'],
          [class*='border-green-'] {
            border-color: color-mix(in srgb, var(--assistant-tone-1) 60%, transparent) !important;
          }
        `}</style>
      </div>
    </QuickFiltersProvider>
    </RemindersProvider>
  );
}
