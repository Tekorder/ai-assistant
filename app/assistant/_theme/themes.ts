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
    | 'deepsea'
    | 'cloud';

type AssistantTheme = {
    themeName: string;
    style: 'dark' | 'light';
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
	style: 'dark',
	background: '#050505',
	tone1: '#52b352',
	tone2: '#181d04',
	tone3: '#2e8b2e',
	textColor: '#ffffff',
	glassBoost: '32%',
    },
    ocean: {
	themeName: 'Ocean',
	style: 'dark',
	background: '#06111a',
	tone1: '#33a1ff',
	tone2: '#122c32',
	tone3: '#0f5f94',
	textColor: '#eaf6ff',
	glassBoost: '40%',
    },
    purity: {
	themeName: 'Purity',
	style: 'dark',
	background: '#09060b',
	tone1: '#8a1f3d',
	tone2: '#251029',
	tone3: '#4b1b63',
	textColor: '#f3e9ff',
	glassBoost: '42%',
    },
    vader: {
	themeName: 'Vader',
	style: 'dark',
	background: '#000000',
	tone1: '#ffffff',
	tone2: '#1a1a1a',
	tone3: '#2a2a2a',
	textColor: '#ffffff',
	glassBoost: '44%',
    },
    obsidian: {
	themeName: 'Obsidian',
	style: 'dark',
	background: '#0a0c10',
	tone1: '#8ea0b8',
	tone2: '#171c24',
	tone3: '#2a3442',
	textColor: '#e8edf5',
	glassBoost: '41%',
    },
    midnight: {
	themeName: 'Midnight',
	style: 'dark',
	background: '#04070f',
	tone1: '#5f79d6',
	tone2: '#121a30',
	tone3: '#22355c',
	textColor: '#e7eeff',
	glassBoost: '42%',
    },
    ember: {
	themeName: 'Ember',
	style: 'dark',
	background: '#0d0808',
	tone1: '#b24a3a',
	tone2: '#2a1310',
	tone3: '#5a2720',
	textColor: '#ffe9e4',
	glassBoost: '43%',
    },
    nebula: {
	themeName: 'Nebula',
	style: 'dark',
	background: '#08060f',
	tone1: '#7f58c9',
	tone2: '#1a1230',
	tone3: '#3b2a6d',
	textColor: '#f0e9ff',
	glassBoost: '44%',
    },
    graphite: {
	themeName: 'Graphite',
	style: 'dark',
	background: '#0b0b0d',
	tone1: '#7aa2ff',
	tone2: '#2a1f33',
	tone3: '#3f4658',
	textColor: '#edf0f3',
	glassBoost: '40%',
    },
    aurora: {
	themeName: 'Aurora',
	style: 'dark',
	background: '#05090a',
	tone1: '#3edfb5',
	tone2: '#1f2e4a',
	tone3: '#5b3f88',
	textColor: '#e8fffb',
	glassBoost: '45%',
    },
    bloodmoon: {
	themeName: 'Bloodmoon',
	style: 'dark',
	background: '#0b0607',
	tone1: '#c94663',
	tone2: '#2b1935',
	tone3: '#6f2c3f',
	textColor: '#ffeaf0',
	glassBoost: '46%',
    },
    deepsea: {
	themeName: 'Deepsea',
	style: 'dark',
	background: '#04080d',
	tone1: '#4d86d1',
	tone2: '#1a2e4f',
	tone3: '#1f6d6a',
	textColor: '#e9f4ff',
	glassBoost: '43%',
    },
    cloud: {
	themeName: 'Cloud',
	style: 'light',
	background: '#f7f9fc',
	tone1: '#5b8cff',
	tone2: '#dfe7f7',
	tone3: '#aabce8',
	textColor: '#1c2430',
	glassBoost: '22%',
    },
};

export const getAssistantThemeVars = (theme: AssistantTheme): CSSProperties => {
    const isLight = theme.style === 'light';
    const glassBoostValue = Number.parseFloat(theme.glassBoost) || 38;
    const glassSoft = `${Math.round(glassBoostValue * 0.42)}%`;
    const glassMid = `${Math.round(glassBoostValue * 0.52)}%`;
    const glassStrong = `${Math.round(glassBoostValue * 0.62)}%`;
    const glassTone2 = `${Math.round(glassBoostValue * 0.56)}%`;
    const glassCenter = `${Math.round(glassBoostValue * 0.22)}%`;
    return {
	'--assistant-bg': theme.background,
	'--assistant-bg-style': isLight
	? '#ffffff'
	: '#000000',
	'--assistant-tone-1': theme.tone1,
	'--assistant-tone-2': theme.tone2,
	'--assistant-tone-3': theme.tone3,
	'--assistant-text': theme.textColor,
	'--assistant-text-strong': theme.textColor,

'--assistant-text-soft': isLight
  ? 'rgba(0,0,0,.65)'
  : 'rgba(255,255,255,.65)',

'--assistant-text-muted': isLight
  ? 'rgba(0,0,0,.45)'
  : 'rgba(255,255,255,.45)',

'--assistant-text-faint': isLight
  ? 'rgba(0,0,0,.30)'
  : 'rgba(255,255,255,.30)',

'--assistant-panel-bg': isLight
  ? 'rgba(255,255,255,.92)'
  : 'rgba(0,0,0,.92)',

'--assistant-header-bg': isLight
  ? 'rgba(255,255,255,.90)'
  : 'rgba(0,0,0,.45)',

'--assistant-active-text': '#d5fc43',

'--assistant-active-bg': theme.tone2,

	'--assistant-overlay': isLight
	? 'rgba(255,255,255,.35)'
	: 'rgba(0,0,0,.5)',

	'--assistant-border-soft': isLight
	? 'rgba(0,0,0,.08)'
	: 'rgba(255,255,255,.08)',

	'--assistant-text-hover': isLight
	? 'rgba(0,0,0,.80)'
	: 'rgba(255,255,255,.80)',

	'--assistant-hover-bg': isLight
	? 'rgba(0,0,0,.05)'
	: 'rgba(255,255,255,.08)',
	'--assistant-control-bg': isLight
  ? 'rgba(0,0,0,.04)'
  : 'rgba(255,255,255,.08)',

	'--assistant-button-active-bg': isLight
	? 'rgba(0,0,0,.08)'
	: 'rgba(255,255,255,.12)',

	'--assistant-button-text': isLight
	? 'rgba(0,0,0,.6)'
	: 'rgba(255,255,255,.6)',

	'--assistant-button-text-hover': isLight
	? 'rgba(0,0,0,.85)'
	: 'rgba(255,255,255,.85)',
	'--assistant-highlight': isLight
	? 'rgba(255,255,255,.6)'
	: 'rgba(255,255,255,.06)',

	'--assistant-button-text-active': theme.textColor,
	'--assistant-tab-bg': theme.tone2,
	'--assistant-accent': theme.tone1,
	'--assistant-accent-bg': `color-mix(in srgb, ${theme.tone1} 22%, transparent)`,
	'--assistant-glass-boost': theme.glassBoost,
	'--assistant-glass-soft': glassSoft,
	'--assistant-glass-mid': glassMid,
	'--assistant-glass-strong': glassStrong,
	'--assistant-glass-tone2': glassTone2,
	'--assistant-glass-center': glassCenter,
	'--assistant-surface': isLight
	? 'rgba(255,255,255,.75)'
	: 'rgba(255,255,255,.05)',

	'--assistant-surface-hover': isLight
	? 'rgba(0,0,0,.05)'
	: 'rgba(255,255,255,.10)',
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
