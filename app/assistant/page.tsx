'use client';

import React, { useEffect, useRef, useState } from 'react';
import { RemindersProvider } from './_context/RemindersContext';
import { Sidebar } from './components/Sidebar';
import ChatBox from './components/Chatbox';
import RemindersSection from './components/RemindersSection';
import Timeline from './components/Timeline';
import Archive from './components/Archive';
import Quick from './components/Quick';
import TopNavBar from './components/TopNavBar';

export default function App() {
  const [activeView, setActiveView] = useState<'reminders' | 'timeline' | 'archive' | 'quick'>('quick');

  // ✅ Sidebar toggle
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ✅ Sidebar resize (desktop)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);

  const MIN_SIDEBAR = 280;
  const MAX_SIDEBAR = 900;
  const [sidebarW, setSidebarW] = useState(500);

  // ✅ Chat overlay (web-agent style)
  const [chatOpen, setChatOpen] = useState(false);

  // (kept just in case you want to restore view-style chat later)
  const [lastView, setLastView] = useState<typeof activeView>('quick');

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      if (!sidebarOpen) return;

      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;

      const next = Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, x));
      setSidebarW(next);
    };

    const onUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [sidebarOpen]);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!sidebarOpen) return;
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const renderView = () => {
    if (activeView === 'timeline') return <Timeline onOpenArchive={() => setActiveView('archive')} />;
    if (activeView === 'archive') return <Archive onBackToTimeline={() => setActiveView('timeline')} />;
    if (activeView === 'quick') return <Quick />;
    return <RemindersSection />;
  };

  const openChatOverlay = () => {
    setLastView(activeView);
    setChatOpen(true);
  };

  const closeChatOverlay = () => {
    setChatOpen(false);
  };

  return (
    <RemindersProvider>
      <div className="h-screen bg-gray-900 font-inter flex flex-col">
        <TopNavBar
          title="Youtask"
          activeView={activeView as any}
          setActiveView={setActiveView as any}
          onHome={() => setActiveView('reminders')}
          onLogout={() => {}}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(v => !v)}
        />

        {/* ===================== MOBILE (Drawer) ===================== */}
        <div className="md:hidden flex-1 relative bg-gray-900 overflow-hidden">
          {/* Content */}
          <div className="h-full overflow-hidden">{renderView()}</div>

          {/* Drawer backdrop */}
          {sidebarOpen && (
            <button
              className="absolute inset-0 bg-black/50"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            />
          )}

          {/* Drawer panel */}
          <div
            className={[
              'absolute top-0 left-0 h-full w-[86%] max-w-[380px] bg-gray-800 shadow-2xl transform transition-transform',
              sidebarOpen ? 'translate-x-0' : '-translate-x-full',
            ].join(' ')}
          >
            <div className="h-full overflow-hidden">
              <Sidebar onListClick={() => setActiveView('reminders')} />
            </div>
          </div>
        </div>

        {/* ===================== DESKTOP ===================== */}
        <div ref={containerRef} className="hidden md:flex flex-1 bg-gray-900 overflow-hidden">
          {/* Sidebar */}
          <div
            className="h-full bg-gray-800 border-r border-white/10 overflow-hidden transition-[width] duration-200"
            style={{ width: sidebarOpen ? sidebarW : 0 }}
          >
            <div className="h-full" style={{ width: sidebarW }}>
              <Sidebar onListClick={() => setActiveView('reminders')} />
            </div>
          </div>

          {/* Resize handle (only when open) */}
          {sidebarOpen && (
            <div
              className="relative h-full w-[10px] cursor-col-resize group shrink-0"
              onMouseDown={startDrag}
              title="Arrastra para ajustar"
            >
              <div className="absolute inset-0" />
              <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-white/15 group-hover:bg-white/30 transition-colors" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-60">
                <div className="grid grid-cols-2 gap-1">
                  <span className="w-1 h-1 rounded-full bg-white/30" />
                  <span className="w-1 h-1 rounded-full bg-white/30" />
                  <span className="w-1 h-1 rounded-full bg-white/30" />
                  <span className="w-1 h-1 rounded-full bg-white/30" />
                </div>
              </div>
            </div>
          )}

          {/* Main content */}
          <div className="flex-1 min-w-0 overflow-hidden bg-gray-900">{renderView()}</div>
        </div>

        {/* ===================== CHAT OVERLAY (Web Agent) ===================== */}
        {chatOpen && (
          <>
            {/* Backdrop */}
            <button
              className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[9998]"
              onClick={closeChatOverlay}
              aria-label="Close AI overlay"
            />

            {/* Panel */}
            <div
              className={[
                'fixed z-[9999]',
                'right-5 bottom-24',
                'w-[500px] max-w-[90vw]',
                'h-[600px]',
                'bg-gray-900/95',
                'border border-white/10',
                'rounded-2xl',
                'shadow-2xl',
                'flex flex-col overflow-hidden',
              ].join(' ')}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-sm font-medium text-white">AI Assistant</span>
                </div>

                <button
                  type="button"
                  onClick={closeChatOverlay}
                  className="text-white/60 hover:text-white transition-colors"
                  aria-label="Close"
                  title="Close"
                >
                  ✕
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden">
                <ChatBox showReminders={false} onCloseReminders={() => {}} />
              </div>
            </div>
          </>
        )}

        {/* ===================== FLOATING CHAT BUBBLE ===================== */}
        <button
          type="button"
          onClick={() => (chatOpen ? closeChatOverlay() : openChatOverlay())}
          className={[
            'fixed z-[9999] right-5 bottom-5',
            'w-14 h-14 rounded-full',
            'bg-white/10 hover:bg-white/15 active:scale-95',
            'border border-white/15 shadow-2xl backdrop-blur-md',
            'flex items-center justify-center',
            'transition-all duration-200',
          ].join(' ')}
          aria-label={chatOpen ? 'Close AI chat' : 'Open AI chat'}
          title={chatOpen ? 'Close chat' : 'AI Assistant'}
        >
          {/* Status dot */}
          <span className="absolute -top-1 -right-1">
            <span className="absolute inline-flex h-3 w-3 rounded-full bg-green-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-green-400 border border-black/30" />
          </span>

          {/* Icon */}
          {chatOpen ? (
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 14h5" />
            </svg>
          )}
        </button>
      </div>
    </RemindersProvider>
  );
}