'use client';

import React, { useEffect } from 'react';
import classes from '@/app/assistant/_theme/themes.module.css';
import {
  assistantThemes,
  themeFamilies,
  getThemeFamily,
  getThemeSwatch,
  type AssistantThemeName,
} from '@/app/assistant/_theme/themes';

type Props = {
  selectedTheme: AssistantThemeName;
  onSelect: (name: AssistantThemeName) => void;
  onClose: () => void;
};

/** Theme chooser: pick a family, and light or dark within it. Applies live. */
export function ThemePicker({ selectedTheme, onSelect, onClose }: Props) {
  const mode = assistantThemes[selectedTheme].style;
  const currentFamily = getThemeFamily(selectedTheme);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setMode = (next: 'light' | 'dark') => {
    if (next !== mode) onSelect(currentFamily[next]);
  };

  return (
    <div className="fixed inset-0 z-[10040] flex items-center justify-center p-4">
      <style>{`
        @keyframes tpIn   { from { opacity: 0; transform: translateY(10px) scale(.985); } to { opacity: 1; transform: none; } }
        @keyframes tpFade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      <button
        type="button"
        className="absolute inset-0 cursor-default"
        style={{ background: 'var(--assistant-overlay)', backdropFilter: 'blur(4px)', animation: 'tpFade .2s ease-out both' }}
        onClick={onClose}
        aria-label="Close themes"
        tabIndex={-1}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tp-title"
        className="relative w-full max-w-[560px] overflow-hidden rounded-2xl"
        style={{
          background: 'var(--assistant-overlay-panel-bg, var(--assistant-panel-bg))',
          color: 'var(--assistant-text)',
          border: '1px solid var(--assistant-border-soft)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, .28)',
          animation: 'tpIn .28s cubic-bezier(.25,.9,.3,1) both',
        }}
      >
        <div className="flex items-center justify-between px-6 pt-5">
          <h2 id="tp-title" className="text-[19px] font-bold">Themes</h2>
          <button
            type="button"
            onClick={onClose}
            className={`-mr-2 flex h-8 w-8 items-center justify-center rounded-lg ${classes.panelCloseBtn}`}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Light / Dark */}
        <div className="px-6 pt-4">
          <div
            role="radiogroup"
            aria-label="Mode"
            className="inline-flex rounded-xl p-1"
            style={{ background: 'var(--assistant-control-bg)' }}
          >
            {(['light', 'dark'] as const).map(m => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-lg px-4 py-1.5 text-[14px] font-medium capitalize transition-colors ${
                  mode === m ? classes.quickFilterActive : ''
                }`}
                style={mode === m ? undefined : { color: 'var(--assistant-text-muted)' }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Families */}
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-3 px-6 pb-6 pt-4 sm:grid-cols-3">
          {themeFamilies.map(family => {
            const name = family[mode];
            const s = getThemeSwatch(name);
            const selected = family.name === currentFamily.name;
            return (
              <button
                key={family.name}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onSelect(name)}
                className="group text-left"
              >
                <div
                  className="relative h-[92px] overflow-hidden rounded-xl transition-transform duration-150 group-hover:-translate-y-0.5"
                  style={{
                    background: s.canvas,
                    boxShadow: selected
                      ? '0 0 0 2px var(--assistant-contrast-bg), 0 6px 16px rgba(0,0,0,.14)'
                      : '0 0 0 1px var(--assistant-border-soft)',
                  }}
                >
                  {/* Mini version of the page glow, pinned bottom-left like the real one */}
                  <span
                    aria-hidden="true"
                    className="absolute rounded-full"
                    style={{
                      left: -34, bottom: -52, width: 120, height: 120,
                      background: s.glow,
                      opacity: assistantThemes[name].glowOpacity ?? 0.55,
                      filter: 'blur(22px)',
                    }}
                  />
                  <span className="absolute left-3 top-3 block h-1.5 w-12 rounded-full" style={{ background: s.text, opacity: 0.7 }} />
                  <span className="absolute left-3 top-6 block h-1.5 w-8 rounded-full" style={{ background: s.text, opacity: 0.35 }} />
                  <span className="absolute bottom-3 right-3 block h-4 w-10 rounded-full" style={{ background: s.contrast }} />
                  {selected ? (
                    <span
                      className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full"
                      style={{ background: s.contrast, color: s.canvas }}
                      aria-hidden="true"
                    >
                      <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
                        <path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 px-0.5 text-[14px] font-medium" style={{ color: selected ? 'var(--assistant-text)' : 'var(--assistant-text-soft)' }}>
                  {family.name}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
