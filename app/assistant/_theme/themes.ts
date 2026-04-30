import type { CSSProperties } from 'react';

export type AssistantThemeName =
  | 'matrix'
  | 'ocean'
  | 'purity'
  | 'vader'
  | 'obsidian'
  | 'midnight'
  | 'ember'
  | 'nebula'
  | 'graphite'
  | 'aurora'
  | 'bloodmoon'
  | 'deepsea';

type AssistantTheme = {
  themeName: string;
  background: string;
  tone1: string;
  tone2: string;
  tone3: string;
  textColor: string;
  glassBoost: string;
};

export const assistantThemes: Record<AssistantThemeName, AssistantTheme> = {
  matrix: {
    themeName: 'Matrix',
    background: '#050505',
    tone1: '#52b352',
    tone2: '#181d04',
    tone3: '#2e8b2e',
    textColor: '#ffffff',
    glassBoost: '32%',
  },
  ocean: {
    themeName: 'Ocean',
    background: '#06111a',
    tone1: '#33a1ff',
    tone2: '#122c32',
    tone3: '#0f5f94',
    textColor: '#eaf6ff',
    glassBoost: '40%',
  },
  purity: {
    themeName: 'Purity',
    background: '#09060b',
    tone1: '#8a1f3d',
    tone2: '#251029',
    tone3: '#4b1b63',
    textColor: '#f3e9ff',
    glassBoost: '42%',
  },
  vader: {
    themeName: 'Vader',
    background: '#000000',
    tone1: '#ffffff',
    tone2: '#1a1a1a',
    tone3: '#2a2a2a',
    textColor: '#ffffff',
    glassBoost: '44%',
  },
  obsidian: {
    themeName: 'Obsidian',
    background: '#0a0c10',
    tone1: '#8ea0b8',
    tone2: '#171c24',
    tone3: '#2a3442',
    textColor: '#e8edf5',
    glassBoost: '41%',
  },
  midnight: {
    themeName: 'Midnight',
    background: '#04070f',
    tone1: '#5f79d6',
    tone2: '#121a30',
    tone3: '#22355c',
    textColor: '#e7eeff',
    glassBoost: '42%',
  },
  ember: {
    themeName: 'Ember',
    background: '#0d0808',
    tone1: '#b24a3a',
    tone2: '#2a1310',
    tone3: '#5a2720',
    textColor: '#ffe9e4',
    glassBoost: '43%',
  },
  nebula: {
    themeName: 'Nebula',
    background: '#08060f',
    tone1: '#7f58c9',
    tone2: '#1a1230',
    tone3: '#3b2a6d',
    textColor: '#f0e9ff',
    glassBoost: '44%',
  },
  graphite: {
    themeName: 'Graphite',
    background: '#0b0b0d',
    tone1: '#7aa2ff',
    tone2: '#2a1f33',
    tone3: '#3f4658',
    textColor: '#edf0f3',
    glassBoost: '40%',
  },
  aurora: {
    themeName: 'Aurora',
    background: '#05090a',
    tone1: '#3edfb5',
    tone2: '#1f2e4a',
    tone3: '#5b3f88',
    textColor: '#e8fffb',
    glassBoost: '45%',
  },
  bloodmoon: {
    themeName: 'Bloodmoon',
    background: '#0b0607',
    tone1: '#c94663',
    tone2: '#2b1935',
    tone3: '#6f2c3f',
    textColor: '#ffeaf0',
    glassBoost: '46%',
  },
  deepsea: {
    themeName: 'Deepsea',
    background: '#04080d',
    tone1: '#4d86d1',
    tone2: '#1a2e4f',
    tone3: '#1f6d6a',
    textColor: '#e9f4ff',
    glassBoost: '43%',
  },
};

export const getAssistantThemeVars = (theme: AssistantTheme): CSSProperties => {
  const glassBoostValue = Number.parseFloat(theme.glassBoost) || 38;
  const glassSoft = `${Math.round(glassBoostValue * 0.42)}%`;
  const glassMid = `${Math.round(glassBoostValue * 0.52)}%`;
  const glassStrong = `${Math.round(glassBoostValue * 0.62)}%`;
  const glassTone2 = `${Math.round(glassBoostValue * 0.56)}%`;
  const glassCenter = `${Math.round(glassBoostValue * 0.22)}%`;
  return {
    '--assistant-bg': theme.background,
    '--assistant-tone-1': theme.tone1,
    '--assistant-tone-2': theme.tone2,
    '--assistant-tone-3': theme.tone3,
    '--assistant-text': theme.textColor,
    '--assistant-overlay': 'rgba(0,0,0,.5)',
    '--assistant-border-soft': 'rgba(255,255,255,.08)',
    '--assistant-glass-boost': theme.glassBoost,
    '--assistant-glass-soft': glassSoft,
    '--assistant-glass-mid': glassMid,
    '--assistant-glass-strong': glassStrong,
    '--assistant-glass-tone2': glassTone2,
    '--assistant-glass-center': glassCenter,
    '--assistant-glass-bg': [
      'linear-gradient(160deg, color-mix(in srgb, var(--assistant-tone-1) 16%, transparent) 0%, transparent 42%)',
      'linear-gradient(12deg, color-mix(in srgb, var(--assistant-tone-3) 12%, transparent) 0%, transparent 55%)',
      'linear-gradient(to bottom, rgba(255,255,255,.08) 0%, rgba(255,255,255,.02) 24%, rgba(0,0,0,.22) 100%)',
      'color-mix(in srgb, var(--assistant-bg) 80%, black)',
    ].join(', '),
    '--assistant-panel-shadow': [
      '0 22px 60px rgba(0,0,0,.52)',
      '0 8px 24px rgba(0,0,0,.35)',
      '0 0 0 1px rgba(255,255,255,.04)',
      'inset 0 1px 0 rgba(255,255,255,.10)',
    ].join(', '),
  } as CSSProperties;
};
