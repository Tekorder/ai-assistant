'use client';

import React from 'react';

type ViewType = 'chat' | 'reminders' | 'timeline' | 'archive' | 'quick';

type Props = {
  title: string;
  activeView: ViewType;
  setActiveView: (v: ViewType) => void;
  onHome: () => void;
  onLogout: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
};

export default function TopNavBar({
  title,
  activeView,
  setActiveView,
  onHome,
  onLogout,
  sidebarOpen,
  onToggleSidebar,
}: Props) {
  const navBtn = (view: ViewType, label: string) => (
    <button
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
    <div className="h-14 flex items-center justify-between px-4 bg-gray-900 border-b border-white/10 backdrop-blur-md">

      {/* LEFT */}
      <div className="flex items-center gap-4">

        {/* 🔥 Sidebar Toggle */}
        <button
          onClick={onToggleSidebar}
          className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10 transition-all"
        >
          <div className="relative w-5 h-4">
            <span
              className={`absolute left-0 w-full h-[2px] bg-white transition-all duration-300 ${
                sidebarOpen ? 'rotate-45 top-2' : 'top-0'
              }`}
            />
            <span
              className={`absolute left-0 w-full h-[2px] bg-white transition-all duration-300 ${
                sidebarOpen ? 'opacity-0' : 'top-2'
              }`}
            />
            <span
              className={`absolute left-0 w-full h-[2px] bg-white transition-all duration-300 ${
                sidebarOpen ? '-rotate-45 top-2' : 'top-4'
              }`}
            />
          </div>
        </button>

        {/* Logo / Title */}
        <div
          onClick={onHome}
          className="text-white font-semibold text-lg cursor-pointer hover:opacity-80 transition-opacity"
        >
          {title}
        </div>
      </div>

      {/* CENTER NAV (desktop only) */}
      <div className="hidden md:flex items-center gap-2">
        {navBtn('quick', 'Home')}
        {navBtn('timeline', 'Timeline')}
        {navBtn('reminders', 'Reminders')}
        {navBtn('archive', 'Archive')}
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-3">

        {/* Status Dot */}
        <div className="hidden md:flex items-center gap-2 text-white/50 text-sm">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          Live
        </div>

        {/* Logout */}
        <button
          onClick={onLogout}
          className="px-3 py-1.5 rounded-lg text-sm text-white/60 hover:text-red-400 hover:bg-white/10 transition-all"
        >
          Logout
        </button>
      </div>
    </div>
  );
}