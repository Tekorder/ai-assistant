'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from '@/lib/datacenter';

type View = 'chat' | 'reminders' | 'timeline' | 'archive' | 'quick' | 'calendar';

export default function App() {
  const [activeView, setActiveView] = useState<View>('quick');

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarClosing, setSidebarClosing] = useState(false);
  const [habitsOpen, setHabitsOpen] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [pivotInstances, setPivotInstances] = useState<
    Array<{ id: string; word: string; listId?: string }>
  >([]);

  const MIN_SIDEBAR = 360;
  const PANEL_WIDTH = 320;

  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
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
    }, 220);
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
      pivots: pivotInstances.length,
    };
  }, [
    isDesktop,
    sidebarOpen,
    habitsOpen,
    remindersOpen,
    activityOpen,
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

  const renderView = () => {
    if (activeView === 'timeline') return <Timeline />;
    if (activeView === 'calendar') return <CalendarView />;
    return <Quick onOpenPivot={requestOpenPivot} />;
  };

  const mainPanelSolo =
    !sidebarOpen && !habitsOpen && !remindersOpen && !activityOpen && pivotInstances.length === 0;
  const sidebarVisualOpen = sidebarOpen && !sidebarClosing;
  const mainPanelWidth = mainPanelSolo ? '90vw' : '70vw';

  const closePivotInstance = useCallback((id: string) => {
    setPivotInstances((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const lastPivot = pivotInstances[pivotInstances.length - 1] ?? null;

  return (
    <RemindersProvider>
      <div
        className="font-inter flex h-screen flex-col"
        style={{
          background: [
            'radial-gradient(ellipse 85% 70% at 50% -20%, rgba(82,179,82,.10) 0%, transparent 62%)',
            'radial-gradient(ellipse 55% 45% at 90% 85%, rgba(82,179,82,.07) 0%, transparent 62%)',
            'radial-gradient(ellipse 45% 55% at 5% 75%, rgba(42,120,42,.06) 0%, transparent 64%)',
            '#050505',
          ].join(', '),
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
          timelineOpen={activeView === 'timeline'}
          calendarOpen={activeView === 'calendar'}
          onToggleHabits={toggleHabits}
          onToggleReminders={toggleReminders}
          onToggleActivity={toggleActivity}
        />

        <div className="relative flex-1 overflow-hidden md:hidden">
          <div className="h-full overflow-hidden">{renderView()}</div>

          {(sidebarOpen || sidebarClosing) && (
            <button
              className="absolute inset-0 bg-black/50 transition-opacity duration-200"
              style={{ opacity: sidebarVisualOpen ? 1 : 0 }}
              onClick={requestCloseSidebar}
              aria-label="Close sidebar"
            />
          )}

          <div
            className={[
              'absolute left-0 top-0 h-full w-[86%] max-w-[360px] transform shadow-2xl transition-all duration-[460ms]',
              sidebarVisualOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0',
            ].join(' ')}
          >
            <div className="h-full overflow-hidden">
              <Sidebar onOpenPivot={requestOpenPivot} />
            </div>
          </div>
        </div>

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
              width: sidebarVisualOpen ? MIN_SIDEBAR : 0,
              opacity: sidebarVisualOpen ? 1 : 0,
              transform: sidebarVisualOpen ? 'translateX(0)' : 'translateX(-10px)',
              transition: 'width 460ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease, transform 460ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <div
              className="relative h-full overflow-hidden rounded-2xl"
              style={{
                width: MIN_SIDEBAR,
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,.04)',
              }}
            >
              <button
                type="button"
                  onClick={requestCloseSidebar}
                className="absolute right-5 top-3 z-[120] flex h-8 w-8 items-center justify-center rounded-md bg-black/35 text-white transition-colors hover:bg-black/55 hover:text-white"
                aria-label="Close sidebar"
                title="Close sidebar"
              >
                ✕
              </button>
              <Sidebar onOpenPivot={requestOpenPivot} />
            </div>
          </div>

          <div
            className="min-h-0 shrink-0 overflow-hidden"
            style={{
              width: mainPanelWidth,
              minWidth: mainPanelWidth,
              marginLeft: mainPanelSolo ? 'auto' : undefined,
              marginRight: mainPanelSolo ? 'auto' : undefined,
            }}
          >
            <div
              className="relative m-3 box-border flex h-[calc(100%-5.5rem)] min-h-0 w-[calc(100%-1.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl bg-transparent"
              style={{
                minWidth: `calc(${mainPanelWidth} - 1.5rem)`,
                border: '1px solid rgba(82,179,82,.5)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,.06)',
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
            }}
          >
            <div
              className="relative m-3 box-border flex h-[calc(100%-5.5rem)] min-h-0 w-[calc(100%-1.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl bg-transparent"
              style={{
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,.05)',
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
            }}
          >
            <div
              className="relative m-3 box-border flex h-[calc(100%-5.5rem)] min-h-0 w-[calc(100%-1.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl bg-transparent"
              style={{
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,.05)',
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
            }}
          >
            <div
              className="relative m-3 box-border flex h-[calc(100%-5.5rem)] min-h-0 w-[calc(100%-1.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl bg-transparent"
              style={{
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,.05)',
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
                      'inset 0 1px 0 rgba(255,255,255,.05)',
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

        <Menu open={menuOpen} onClose={() => setMenuOpen(false)} />

        {chatOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-[9998] bg-black/50"
              onClick={closeChatOverlay}
              aria-label="Close AI overlay"
            />
            <div
              className={[
                'fixed z-[9999] text-white',
                'right-5 bottom-24',
                'w-[500px] max-w-[90vw]',
                'h-[600px]',
                'rounded-2xl',
                'flex flex-col overflow-hidden',
              ].join(' ')}
              style={{
                background: '#050505',
                border: '1px solid rgba(82,179,82,.5)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
              }}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#050505] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-[#52b352] opacity-60 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#52b352] shadow-[0_0_10px_rgba(82,179,82,.8)]" />
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#52b352]/90">
                    Assistant
                  </span>
                  <span className="text-sm font-semibold text-white/90">AI chat</span>
                </div>
                <button
                  type="button"
                  onClick={closeChatOverlay}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden bg-[#050505]">
                <ChatBox showReminders={false} onCloseReminders={() => {}} />
              </div>
            </div>
          </>
        )}




        <div
          className="pointer-events-none fixed bottom-0 left-0 right-0 z-[45] border-t border-white/[0.08] bg-black px-4 py-2.5"
          role="status"
          aria-live="polite"
        >
          <div className="pointer-events-auto mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0 flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
                Today
              </span>
              <span className="text-[12px] text-white/70">
                <span className="font-semibold text-[#52b352] tabular-nums">{todayCompletedSummary.completed}</span>
                <span className="text-white/45"> / </span>
                <span className="tabular-nums text-white/55">{todayCompletedSummary.total}</span>
                <span className="text-white/40"> · completed</span>
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                Overdue
              </span>
              <span
                className={[
                  'min-w-[2rem] rounded-lg border px-2.5 py-1 text-center text-[13px] font-semibold tabular-nums',
                  overdueCount > 0
                    ? 'border-rose-500/35 bg-rose-500/10 text-rose-200'
                    : 'border-white/10 bg-white/5 text-white/45',
                ].join(' ')}
              >
                {overdueCount}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => (chatOpen ? closeChatOverlay() : openChatOverlay())}
          className="fixed bottom-20 right-5 z-[9999] flex h-14 w-14 items-center justify-center rounded-full bg-white/10 shadow-2xl backdrop-blur-md transition-all duration-200 hover:bg-white/15 active:scale-95 md:bottom-5"
          aria-label={chatOpen ? 'Close AI chat' : 'Open AI chat'}
          title={chatOpen ? 'Close chat' : 'AI Assistant'}
        >
          <span className="pointer-events-none absolute -right-1 -top-1">
            <span className="absolute inline-flex h-3 w-3 rounded-full bg-green-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-3 w-3 rounded-full border border-black/30 bg-green-400" />
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
      </div>
    </RemindersProvider>
  );
}
