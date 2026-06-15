'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { RemindersProvider } from './_context/RemindersContext';
import { Sidebar } from './components/Sidebar';
import ChatBox from './components/Chatbox';
import Timeline from './components/Timeline';
import Quick from './components/Quick';
import CalendarView from './components/Calendar';
import TopNavBar from './components/TopNavBar';
import Menu from './components/Menu';
import HabitsPanel from './components/HabitsPanel';
import RemindersPanel from './components/RemindersPanel';
import ActivityLogPanel from './components/ActivityLogPanel';
import ChecklistsPanel from './components/ChecklistsPanel';
import { assistantThemes, getAssistantThemeVars, type AssistantThemeName } from './_theme/themes';
import classes from './_theme/themes.module.css';
import { PivotPanel, buildPrunedPivotTree, buildListPivotTree, type PivotTreeRow } from './components/Pivot';
import {
  UNC_TITLE,
  type Block,
  readProjectsLS,
  writeProjectsLS,
  updateBlock,
  formatPill,
  pillClass,
  todayYMD,
  isValidDateYYYYMMDD,
  dayDiffFromToday,
  LS_KEY_CHECKLISTS,
  readChecklistsLS,
  getTaskFlag,
} from '@/lib/datacenter';


type View = 'chat' | 'reminders' | 'timeline' | 'archive' | 'quick' | 'calendar';
const ASSISTANT_THEME_LS_KEY = 'assistant_theme_v1';

export default function App() {
  const [selectedTheme, setSelectedTheme] = useState<AssistantThemeName>('purity');
  const theme = assistantThemes[selectedTheme];
  const [activeView, setActiveView] = useState<View>('quick');

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarClosing, setSidebarClosing] = useState(false);
  const [habitsOpen, setHabitsOpen] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);
  const [pivotInstances, setPivotInstances] = useState<
    Array<{ id: string; word: string; listId?: string }>
  >([]);

  const MIN_SIDEBAR = 360;
  const PANEL_WIDTH = 320;

  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
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

  const [chatOpen, setChatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deckRightPad, setDeckRightPad] = useState(40);
  const deckScrollRef = useRef<HTMLDivElement | null>(null);
  const sidebarCloseTimerRef = useRef<number | null>(null);
  const prevOpenRef = useRef({
    sidebar: false,
    habits: false,
    reminders: false,
    activity: false,
    lists: false,
    pivots: 0,
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

  const toggleSidebar = useCallback(() => {
    if (sidebarOpen) {
      requestCloseSidebar();
      return;
    }
    if (sidebarCloseTimerRef.current !== null) {
      window.clearTimeout(sidebarCloseTimerRef.current);
      sidebarCloseTimerRef.current = null;
    }
    setSidebarClosing(false);
    setSidebarOpen(true);
  }, [requestCloseSidebar, sidebarOpen]);
  const toggleHabits = useCallback(() => setHabitsOpen((v) => !v), []);
  const toggleReminders = useCallback(() => setRemindersOpen((v) => !v), []);
  const toggleActivity = useCallback(() => setActivityOpen((v) => !v), []);
  const toggleLists = useCallback(() => setListsOpen((v) => !v), []);

  useEffect(() => {
    return () => {
      if (sidebarCloseTimerRef.current !== null) window.clearTimeout(sidebarCloseTimerRef.current);
    };
  }, []);
  const updateDeckRightPad = useCallback((el: HTMLDivElement) => {
    const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    if (maxLeft <= 0) {
      setDeckRightPad(40);
      return;
    }
    const rightCap = maxLeft * 0.95;
    const progress = rightCap > 0 ? Math.min(1, Math.max(0, el.scrollLeft / rightCap)) : 0;
    const nextPad = Math.round(40 + progress * 80);
    setDeckRightPad((prev) => (prev === nextPad ? prev : nextPad));
  }, []);

  const clampDeckRightScroll = useCallback(() => {
    const el = deckScrollRef.current;
    if (!el) return;
    const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    const rightCap = maxLeft * 0.95;
    if (el.scrollLeft > rightCap) {
      el.scrollLeft = rightCap;
    }
    updateDeckRightPad(el);
  }, [updateDeckRightPad]);

  const requestOpenPivot = useCallback(
    (detail: {
      word: string;
      blockId: string | null;
      origin: 'quick' | 'sidebar';
      listId?: string | null;
    }) => {
      if (detail.listId) {
        const w = detail.word.trim() || 'List';
        const id = `list_${detail.listId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        setPivotInstances((prev) => [...prev, { id, word: w, listId: detail.listId! }]);
        return;
      }
      const word = detail.word.trim();
      if (!word) return;
      const id = `${word.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setPivotInstances((prev) => [...prev, { id, word }]);
    },
    [],
  );

  const openChatOverlay = useCallback(() => setChatOpen(true), []);

  const closeChatOverlay = useCallback(() => setChatOpen(false), []);

  useEffect(() => {
    if (isDesktop !== true) return;
    const prev = prevOpenRef.current;
    const sidebarAdded = !prev.sidebar && sidebarOpen;
    const rightPanelAdded =
      (!prev.habits && habitsOpen) ||
      (!prev.reminders && remindersOpen) ||
      (!prev.activity && activityOpen) ||
      (!prev.lists && listsOpen) ||
      pivotInstances.length > prev.pivots;

    const el = deckScrollRef.current;
    if (el) {
      if (sidebarAdded) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else if (rightPanelAdded) {
        el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
      }
    }

    prevOpenRef.current = {
      sidebar: sidebarOpen,
      habits: habitsOpen,
      reminders: remindersOpen,
      activity: activityOpen,
      lists: listsOpen,
      pivots: pivotInstances.length,
    };
  }, [
    isDesktop,
    sidebarOpen,
    habitsOpen,
    remindersOpen,
    activityOpen,
    listsOpen,
    pivotInstances.length,
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

  const todayCompletedSummary = useMemo(() => {
    const day = todayYMD();
    const dueToday = projectBlocks.filter((b) => {
      if (b.indent === 0 || b.archived === true) return false;
      if (b.isHidden === true) return false;
      return isValidDateYYYYMMDD(b.deadline) && b.deadline === day;
    });
    return {
      total: dueToday.length,
      completed: dueToday.filter((t) => t.checked === true).length,
    };
  }, [projectBlocks]);

  const overdueCount = useMemo(
    () =>
      projectBlocks.filter((b) => {
        if (b.indent === 0 || b.archived === true) return false;
        if (b.isHidden === true || b.checked === true) return false;
        const diff = dayDiffFromToday(b.deadline);
        return diff !== null && diff < 0;
      }).length,
    [projectBlocks],
  );

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

  const pillClassNike = useCallback((deadline?: string, checked?: boolean) => {
    return pillClass(deadline, checked);
  }, []);

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
    if (activeView === 'timeline') return <Timeline />;
    if (activeView === 'calendar') return <CalendarView isLight={isLight} />;
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
    pivotInstances.length === 0;
  const mainPanelWidth = mainPanelSolo ? '90vw' : '70vw';

  // Lists panel: starts as wide as the other side panels (PANEL_WIDTH),
  // grows ~60px per extra tab, and is capped at half the main dock width
  // (main is 70vw whenever any panel is open, including this one → cap at 35vw).
  const LISTS_TAB_STEP = 60;
  const desiredListsPx = PANEL_WIDTH + Math.max(0, listsCount - 1) * LISTS_TAB_STEP;
  const listsPanelWidth = `min(${desiredListsPx}px, 35vw)`;

  const closePivotInstance = useCallback((id: string) => {
    setPivotInstances((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const lastPivot = pivotInstances[pivotInstances.length - 1] ?? null;

  return (
    <RemindersProvider>
      <div
        className="font-inter flex h-screen flex-col"
        style={{
          ...getAssistantThemeVars(theme),
          background: [
            'linear-gradient(120deg, color-mix(in srgb, var(--assistant-tone-1) var(--assistant-glass-soft), transparent) 0%, transparent 38%)',
            'linear-gradient(300deg, color-mix(in srgb, var(--assistant-tone-3) var(--assistant-glass-soft), transparent) 0%, transparent 42%)',
            'radial-gradient(ellipse 120% 95% at 50% -30%, color-mix(in srgb, var(--assistant-tone-1) var(--assistant-glass-boost), transparent) 0%, transparent 58%)',
            'radial-gradient(ellipse 88% 70% at 16% 10%, color-mix(in srgb, var(--assistant-tone-2) var(--assistant-glass-tone2), transparent) 0%, transparent 62%)',
            'radial-gradient(ellipse 78% 65% at 88% 14%, color-mix(in srgb, var(--assistant-tone-3) var(--assistant-glass-strong), transparent) 0%, transparent 64%)',
            'radial-gradient(ellipse 80% 68% at 96% 88%, color-mix(in srgb, var(--assistant-tone-1) var(--assistant-glass-mid), transparent) 0%, transparent 66%)',
            'radial-gradient(ellipse 76% 70% at 6% 84%, color-mix(in srgb, var(--assistant-tone-3) var(--assistant-glass-strong), transparent) 0%, transparent 67%)',
            'radial-gradient(ellipse 96% 78% at 50% 122%, color-mix(in srgb, var(--assistant-tone-2) var(--assistant-glass-soft), transparent) 0%, transparent 72%)',
            'radial-gradient(ellipse 90% 48% at 50% 50%, color-mix(in srgb, var(--assistant-tone-1) var(--assistant-glass-center), transparent) 0%, transparent 70%)',
            'linear-gradient(to bottom, rgba(255,255,255,.035) 0%, rgba(255,255,255,.01) 16%, rgba(0,0,0,.18) 100%)',
            'var(--assistant-bg)',
          ].join(', '),
          color: 'var(--assistant-text)',
        }}
      >
        <TopNavBar
          title="Youtask"
          activeView={activeView}
          setActiveView={handleSetActiveViewFromNav}
          onHome={() => setActiveView('quick')}
          sidebarOpen={sidebarOpen}
          onOpenMenu={() => setMenuOpen(true)}
          onToggleSidebar={toggleSidebar}
          habitsOpen={habitsOpen}
          remindersOpen={remindersOpen}
          activityOpen={activityOpen}
          listsOpen={listsOpen}
          timelineOpen={activeView === 'timeline'}
          calendarOpen={activeView === 'calendar'}
          onToggleHabits={toggleHabits}
          onToggleReminders={toggleReminders}
          onToggleActivity={toggleActivity}
          onToggleLists={toggleLists}

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
              className={`md:hidden fixed left-3 top-3 z-[201] flex h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl ${classes.panelGlass}`}
              style={{
                color: 'var(--assistant-text)',
                animation: sidebarClosing
                  ? 'sidebarMobileOut 0.18s cubic-bezier(0.4, 0, 1, 1) both'
                  : 'sidebarMobileIn 0.46s cubic-bezier(0.22, 1, 0.36, 1) 0.06s both',
              }}
            >
              <button
                type="button"
                onClick={requestCloseSidebar}
                className="absolute right-3 top-4 z-[120] flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                style={{ background: 'color-mix(in srgb, var(--assistant-bg) 85%, transparent)', color: 'var(--assistant-text-muted)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--assistant-text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--assistant-text-muted)')}
                aria-label="Close sidebar"
                title="Close sidebar"
              >
                ✕
              </button>
              <div className="h-full overflow-hidden">
                <Sidebar
                  onOpenPivot={requestOpenPivot}
                  selectedTheme={selectedTheme}
                  onSelectTheme={handleSelectTheme}
                />
              </div>
            </div>
          </>
        )}

        <div
          ref={deckScrollRef}
          onScroll={clampDeckRightScroll}
          className="hidden min-h-0 flex-1 overflow-x-auto overflow-y-hidden touch-pan-x [-ms-overflow-style:auto] [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable_both-edges] [transform:scaleY(-1)] md:block"
        >
          <div className="flex h-full min-h-0 min-w-full [transform:scaleY(-1)]">
          <div className="h-full w-[40px] shrink-0" aria-hidden="true" />
          <div
            className="h-full"
            style={{
              height: '85vh',
              marginTop: '12px',
              width: sidebarVisualOpen ? MIN_SIDEBAR : 0,
              opacity: sidebarVisualOpen ? 1 : 0,
              transform: sidebarVisualOpen ? 'translateX(0)' : 'translateX(-10px)',
              transition: sidebarVisualOpen
                ? 'width 420ms cubic-bezier(0.22, 1, 0.36, 1) 0ms, opacity 300ms ease 200ms, transform 400ms cubic-bezier(0.22, 1, 0.36, 1) 200ms'
                : 'width 420ms cubic-bezier(0.22, 1, 0.36, 1) 200ms, opacity 180ms ease 0ms, transform 220ms cubic-bezier(0.22, 1, 0.36, 1) 0ms',
            }}
          >
            <div
              className="relative h-full overflow-hidden rounded-2xl"
              style={{
                width: MIN_SIDEBAR,
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,.04), 0 6px 16px rgba(0,0,0,.14)',
              }}
            >
              <button
                type="button"
                onClick={requestCloseSidebar}
                className="absolute right-5 top-4 z-[120] flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                style={{ background: 'color-mix(in srgb, var(--assistant-bg) 85%, transparent)', color: 'var(--assistant-text-muted)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--assistant-text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--assistant-text-muted)')}
                aria-label="Close sidebar"
                title="Close sidebar"
              >
                ✕
              </button>
              <Sidebar
                onOpenPivot={requestOpenPivot}
                selectedTheme={selectedTheme}
                onSelectTheme={handleSelectTheme}
              />
            </div>
          </div>

          <div
            className="min-h-0 shrink-0 overflow-hidden"
            style={{
              minWidth: mainPanelWidth,
              marginLeft: mainPanelSolo ? 'auto' : undefined,
              marginRight: mainPanelSolo ? 'auto' : undefined,
              transition: 'min-width 420ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <div
              className="relative m-3 box-border flex h-[calc(100%-5.5rem)] min-h-0 w-[calc(100%-1.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl bg-transparent"
              style={{
                minWidth: `calc(${mainPanelWidth} - 1.5rem)`,
                border: '1px solid color-mix(in srgb, var(--assistant-tone-1) 50%, transparent)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,.06), 0 6px 16px rgba(0,0,0,.14)',
                transition: 'min-width 420ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              {renderView()}
            </div>
          </div>

          <div
            className="h-full shrink-0"
            style={{
              width: habitsOpen && isDesktop === true ? PANEL_WIDTH : 0,
              opacity: habitsOpen && isDesktop === true ? 1 : 0,
              transform: habitsOpen && isDesktop === true ? 'translateX(0)' : 'translateX(10px)',
              transition:
                'width 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease, transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <div
              className="relative m-3 box-border flex h-[calc(100%-5.5rem)] min-h-0 w-[calc(100%-1.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl bg-transparent"
              style={{
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,.05), 0 6px 16px rgba(0,0,0,.14)',
              }}
            >
              {isDesktop && habitsOpen && (
                <HabitsPanel variant="dock" open onClose={() => setHabitsOpen(false)} />
              )}
            </div>
          </div>

          <div
            className="h-full shrink-0"
            style={{
              width: remindersOpen && isDesktop === true ? PANEL_WIDTH : 0,
              opacity: remindersOpen && isDesktop === true ? 1 : 0,
              transform: remindersOpen && isDesktop === true ? 'translateX(0)' : 'translateX(10px)',
              transition:
                'width 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease, transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <div
              className="relative m-3 box-border flex h-[calc(100%-5.5rem)] min-h-0 w-[calc(100%-1.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl bg-transparent"
              style={{
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,.05), 0 6px 16px rgba(0,0,0,.14)',
              }}
            >
              {isDesktop && remindersOpen && (
                <RemindersPanel variant="dock" open onClose={() => setRemindersOpen(false)} />
              )}
            </div>
          </div>

          <div
            className="h-full shrink-0"
            style={{
              width: activityOpen && isDesktop === true ? PANEL_WIDTH : 0,
              opacity: activityOpen && isDesktop === true ? 1 : 0,
              transform: activityOpen && isDesktop === true ? 'translateX(0)' : 'translateX(10px)',
              transition:
                'width 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease, transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <div
              className="relative m-3 box-border flex h-[calc(100%-5.5rem)] min-h-0 w-[calc(100%-1.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl bg-transparent"
              style={{
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,.05), 0 6px 16px rgba(0,0,0,.14)',
              }}
            >
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

          <div
            className="h-full shrink-0 overflow-hidden"
            style={{
              width: listsOpen && isDesktop === true ? listsPanelWidth : 0,
              opacity: listsOpen && isDesktop === true ? 1 : 0,
              transform:
                listsOpen && isDesktop === true ? 'translateX(0)' : 'translateX(10px)',
              transition:
                'width 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease, transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <div
              className="relative m-3 box-border flex h-[calc(100%-5.5rem)] min-h-0 w-[calc(100%-1.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl bg-transparent"
              style={{
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,.05), 0 6px 16px rgba(0,0,0,.14)',
              }}
            >
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
                style={{
                  width: PANEL_WIDTH,
                  opacity: 1,
                  transform: 'translateX(0)',
                }}
              >
                <div
                  className="relative m-3 box-border flex h-[calc(100%-5.5rem)] min-h-0 w-[calc(100%-1.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl bg-transparent"
                  style={{
                    boxShadow:
                      'inset 0 1px 0 rgba(255,255,255,.05), 0 6px 16px rgba(0,0,0,.14)',
                  }}
                >
                  <PivotPanel
                    variant="dock"
                    open
                    word={pivot.word}
                    pivotKind={pivot.listId ? 'list' : 'word'}
                    rows={pivotRowsById[pivot.id] ?? []}
                    onClose={() => closePivotInstance(pivot.id)}
                    onGoTo={handlePivotGoTo}
                    onToggleTask={handlePivotToggleTask}
                    pillText={(r: PivotTreeRow) => (r.indent > 0 ? formatPill(r.deadline) : '')}
                    pillClass={(r: PivotTreeRow) => pillClassNike(r.deadline, r.checked)}
                  />
                </div>
              </div>
            ))}
          <div className="h-full shrink-0" style={{ width: `${deckRightPad}px` }} aria-hidden="true" />
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
              pillText={(r: PivotTreeRow) => (r.indent > 0 ? formatPill(r.deadline) : '')}
              pillClass={(r: PivotTreeRow) => pillClassNike(r.deadline, r.checked)}
            />
          </>
        )}

        <Menu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onToggleHabits={toggleHabits}
          onToggleReminders={toggleReminders}
          onToggleActivity={toggleActivity}
          onToggleLists={toggleLists}
          onToggleChat={() => (chatOpen ? closeChatOverlay() : openChatOverlay())}
          habitsOpen={habitsOpen}
          remindersOpen={remindersOpen}
          activityOpen={activityOpen}
          listsOpen={listsOpen}
          chatOpen={chatOpen}
        />

        {chatOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-[9998]"
              style={{ background: 'var(--assistant-overlay)' }}
              onClick={closeChatOverlay}
              aria-label="Close AI overlay"
            />
            {/* Mobile: full-screen overlay. Desktop: floating widget bottom-right */}
            <div
              className={[
                `fixed z-[9999] flex flex-col overflow-hidden rounded-2xl ${classes.panelGlass}`,
                // mobile: full panel
                'left-3 top-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)]',
                // desktop: floating bubble
                'md:left-auto md:top-auto md:right-5 md:bottom-24 md:h-150 md:w-125 md:max-w-[90vw]',
              ].join(' ')}
              style={{ color: 'var(--assistant-text)' }}
            >
              <div
                className="flex shrink-0 items-center justify-between border-b px-4 py-3"
                style={{ borderColor: 'var(--assistant-border-soft)', background: 'var(--assistant-panel-bg)' }}
              >
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span
                      className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping"
                      style={{ background: 'var(--assistant-tone-1)' }}
                    />
                    <span
                      className="relative inline-flex h-2 w-2 rounded-full"
                      style={{
                        background: 'var(--assistant-tone-1)',
                        boxShadow: '0 0 10px color-mix(in srgb, var(--assistant-tone-1) 80%, transparent)',
                      }}
                    />
                  </span>
                  <span
                    className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                    style={{ color: 'var(--assistant-accent)' }}
                  >
                    Assistant
                  </span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--assistant-text-soft)' }}>AI chat</span>
                </div>
                <button
                  type="button"
                  onClick={closeChatOverlay}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${classes.panelBtn}`}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <ChatBox showReminders={false} onCloseReminders={() => {}} />
              </div>
            </div>
          </>
        )}




        <div
          className="pointer-events-none fixed bottom-0 left-0 right-0 z-[45] border-t px-4 py-2.5"
          style={{ borderColor: 'var(--assistant-border-soft)', background: 'var(--assistant-bg)' }}
          role="status"
          aria-live="polite"
        >
          <div className="pointer-events-auto mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0 flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--assistant-text-faint)' }}>
                Today
              </span>
              <span className="text-[12px]" style={{ color: 'var(--assistant-text-soft)' }}>
                <span className="font-semibold tabular-nums" style={{ color: 'var(--assistant-tone-1)' }}>
                  {todayCompletedSummary.completed}
                </span>
                <span style={{ color: 'var(--assistant-text-muted)' }}> / </span>
                <span className="tabular-nums" style={{ color: 'var(--assistant-text-soft)' }}>{todayCompletedSummary.total}</span>
                <span style={{ color: 'var(--assistant-text-faint)' }}> · completed</span>
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--assistant-text-faint)' }}>
                Overdue
              </span>
              <span
                className="min-w-[2rem] rounded-lg border px-2.5 py-1 text-center text-[13px] font-semibold tabular-nums"
                style={overdueCount > 0 ? {
                  borderColor: 'rgba(244,63,94,.35)',
                  background: 'rgba(244,63,94,.10)',
                  color: theme.style === 'light' ? '#be123c' : '#fda4af',
                } : {
                  borderColor: 'var(--assistant-border-soft)',
                  background: 'var(--assistant-surface)',
                  color: 'var(--assistant-text-muted)',
                }}
              >
                {overdueCount}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => (chatOpen ? closeChatOverlay() : openChatOverlay())}
          className="hidden md:flex fixed md:bottom-5 right-5 z-[9999] h-14 w-14 items-center justify-center rounded-full bg-white/10 shadow-2xl backdrop-blur-md transition-all duration-200 hover:bg-white/15 active:scale-95"
          aria-label={chatOpen ? 'Close AI chat' : 'Open AI chat'}
          title={chatOpen ? 'Close chat' : 'AI Assistant'}
        >
          <span className="pointer-events-none absolute -right-1 -top-1">
            <span
              className="absolute inline-flex h-3 w-3 rounded-full opacity-75 animate-ping"
              style={{ background: 'var(--assistant-tone-1)' }}
            />
            <span
              className="relative inline-flex h-3 w-3 rounded-full border border-black/30"
              style={{ background: 'var(--assistant-tone-1)' }}
            />
          </span>

          {chatOpen ? (
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 14h5" />
            </svg>
          )}
        </button>

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
    </RemindersProvider>
  );
}
