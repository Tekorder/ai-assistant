import type { CSSProperties } from 'react';

export type AssistantThemeName =
    | 'tekorder'
    | 'bluedark'
    | 'mono'
    | 'monodark'
    | 'green'
    | 'greendark'
    | 'purple'
    | 'purpledark'
    | 'red'
    | 'reddark'
    | 'orange'
    | 'orangedark';

type AssistantTheme = {
    themeName: string;
    style: 'dark' | 'light';
    background: string;
    tone1: string;
    tone2: string;
    tone3: string;
    textColor: string;
    glassBoost: string;
    backgroundImage?: string;
    /** Page canvas behind everything (defaults to `background`) */
    canvas?: string;
    /** Blurred glow circle anchored bottom-left (defaults to tone1) */
    glowColor?: string;
    glowOpacity?: number;
    /** Solid "contrast" controls — active nav/filter, Logout, wizard Finish, date pill, checked box (defaults to tone1) */
    contrastBg?: string;
    /** Text/icons on top of contrastBg (defaults to white on light themes, black on dark) */
    contrastText?: string;
};

/*
 * Every theme is a family with a light and a dark mode. Pattern per family:
 *   light — neutral canvas, the family color as the glow, its "dark" shade for
 *           contrast buttons and text.
 *   dark  — a deep canvas of the same hue, the family color turned bright for
 *           contrast buttons, near-white text.
 */
export const assistantThemes: Record<AssistantThemeName, AssistantTheme> = {
    /* ── Blue ── (light key kept as "tekorder" so saved preferences still resolve) */
    tekorder: {
	themeName: 'Blue',
	style: 'light',
	background: '#eef3f9',
	tone1: '#1a2b48',
	tone2: '#d7e4f2',
	tone3: '#9eb9d8',
	textColor: '#1a2b48',
	glassBoost: '16%',
	/* ── Theme parameters ───────────────────────── */
	canvas: '#E0E0E0',       // Color del fondo
	glowColor: '#5BACE3',    // Color del círculo (blur, abajo a la izquierda)
	glowOpacity: 1,
	contrastBg: '#18315C',   // Color de contraste de botones
	contrastText: '#FFFFFF', // Color de contraste de letras (sobre esos botones)
    },
    bluedark: {
	themeName: 'Blue',
	style: 'dark',
	background: '#0d1b31',
	tone1: '#5BACE3',
	tone2: '#15294a',
	tone3: '#2b5d93',
	textColor: '#e6f0fa',
	glassBoost: '40%',
	canvas: '#081326',
	glowColor: '#1f6fc4',
	glowOpacity: 0.55,
	contrastBg: '#5BACE3',
	contrastText: '#081326',
    },

    /* ── White ── white with black */
    mono: {
	themeName: 'White',
	style: 'light',
	background: '#ffffff',
	tone1: '#111111',
	tone2: '#ececec',
	tone3: '#bdbdbd',
	textColor: '#111111',
	glassBoost: '14%',
	canvas: '#F4F4F4',
	glowColor: '#CFCFCF',
	glowOpacity: 0.9,
	contrastBg: '#111111',
	contrastText: '#FFFFFF',
    },
    monodark: {
	themeName: 'White',
	style: 'dark',
	background: '#141414',
	tone1: '#ffffff',
	tone2: '#1f1f1f',
	tone3: '#3a3a3a',
	textColor: '#f2f2f2',
	glassBoost: '40%',
	canvas: '#0A0A0A',
	glowColor: '#5A5A5A',
	glowOpacity: 0.35,
	contrastBg: '#FFFFFF',
	contrastText: '#0A0A0A',
    },

    /* ── Green ── lime glow, dark green #134740 */
    green: {
	themeName: 'Green',
	style: 'light',
	background: '#eef4ef',
	tone1: '#134740',
	tone2: '#d9ead9',
	tone3: '#8fbf9f',
	textColor: '#134740',
	glassBoost: '16%',
	canvas: '#E0E0E0',
	glowColor: '#CBF376',    // rgba(203, 243, 118, 0.48)
	glowOpacity: 0.48,
	contrastBg: '#134740',
	contrastText: '#FFFFFF',
    },
    greendark: {
	themeName: 'Green',
	style: 'dark',
	background: '#0c2622',
	tone1: '#CBF376',
	tone2: '#123a33',
	tone3: '#2d6b58',
	textColor: '#e6f5ec',
	glassBoost: '40%',
	canvas: '#061814',
	glowColor: '#2e7d4f',
	glowOpacity: 0.5,
	contrastBg: '#CBF376',
	contrastText: '#0B2A24',
    },

    /* ── Purple ── dark purple #312F66 */
    purple: {
	themeName: 'Purple',
	style: 'light',
	background: '#f1f0fa',
	tone1: '#312F66',
	tone2: '#e2e0f5',
	tone3: '#a6a1dc',
	textColor: '#312F66',
	glassBoost: '16%',
	canvas: '#E0E0E0',
	glowColor: '#8B7CF6',
	glowOpacity: 0.85,
	contrastBg: '#312F66',
	contrastText: '#FFFFFF',
    },
    purpledark: {
	themeName: 'Purple',
	style: 'dark',
	background: '#16143a',
	tone1: '#b3a9ff',
	tone2: '#221f52',
	tone3: '#4b44a0',
	textColor: '#eceaff',
	glassBoost: '40%',
	canvas: '#0C0B22',
	glowColor: '#5a4ed6',
	glowOpacity: 0.5,
	contrastBg: '#B3A9FF',
	contrastText: '#0C0B22',
    },

    /* ── Red ── dark red #662723 */
    red: {
	themeName: 'Red',
	style: 'light',
	background: '#faf0ef',
	tone1: '#662723',
	tone2: '#f5dcd9',
	tone3: '#dc9a93',
	textColor: '#662723',
	glassBoost: '16%',
	canvas: '#E0E0E0',
	glowColor: '#F2786C',
	glowOpacity: 0.85,
	contrastBg: '#662723',
	contrastText: '#FFFFFF',
    },
    reddark: {
	themeName: 'Red',
	style: 'dark',
	background: '#2a100e',
	tone1: '#ff9d92',
	tone2: '#3d1714',
	tone3: '#7a2e28',
	textColor: '#fdeceb',
	glassBoost: '40%',
	canvas: '#1A0907',
	glowColor: '#b23a31',
	glowOpacity: 0.5,
	contrastBg: '#FF9D92',
	contrastText: '#1A0907',
    },

    /* ── Orange ── dark orange #663412 */
    orange: {
	themeName: 'Orange',
	style: 'light',
	background: '#faf3ec',
	tone1: '#663412',
	tone2: '#f5e3d2',
	tone3: '#e0ae80',
	textColor: '#663412',
	glassBoost: '16%',
	canvas: '#E0E0E0',
	glowColor: '#F6A659',
	glowOpacity: 0.85,
	contrastBg: '#663412',
	contrastText: '#FFFFFF',
    },
    orangedark: {
	themeName: 'Orange',
	style: 'dark',
	background: '#2a180b',
	tone1: '#ffb574',
	tone2: '#3d2410',
	tone3: '#7a4a22',
	textColor: '#fdf1e6',
	glassBoost: '40%',
	canvas: '#1A0E05',
	glowColor: '#c0661f',
	glowOpacity: 0.5,
	contrastBg: '#FFB574',
	contrastText: '#1A0E05',
    },
};

/* ===================== Families: every theme has a light and a dark mode ===================== */

export type ThemeFamily = { name: string; light: AssistantThemeName; dark: AssistantThemeName };

export const themeFamilies: ThemeFamily[] = [
    { name: 'Blue',   light: 'tekorder', dark: 'bluedark' },
    { name: 'White',  light: 'mono',     dark: 'monodark' },
    { name: 'Green',  light: 'green',    dark: 'greendark' },
    { name: 'Purple', light: 'purple',   dark: 'purpledark' },
    { name: 'Red',    light: 'red',      dark: 'reddark' },
    { name: 'Orange', light: 'orange',   dark: 'orangedark' },
];

export const DEFAULT_THEME_FAMILY = themeFamilies[0];

export function getThemeFamily(name: AssistantThemeName): ThemeFamily {
    return themeFamilies.find(f => f.light === name || f.dark === name) ?? DEFAULT_THEME_FAMILY;
}

/** The same family in the other mode — what the light/dark toggle switches to. */
export function getThemeCounterpart(name: AssistantThemeName): AssistantThemeName {
    const family = getThemeFamily(name);
    return family.light === name ? family.dark : family.light;
}

/** Colors a theme picker needs to preview a family mode without applying it. */
export function getThemeSwatch(name: AssistantThemeName) {
    const t = assistantThemes[name];
    return {
        canvas: t.canvas ?? t.background,
        glow: t.glowColor ?? t.tone1,
        contrast: t.contrastBg ?? t.tone1,
        text: t.textColor,
    };
}

export const getAssistantThemeVars = (theme: AssistantTheme): CSSProperties => {
    const isLight = theme.style === 'light';
    const hasImage = Boolean(theme.backgroundImage);
    const glassBoostValue = Number.parseFloat(theme.glassBoost) || 38;
    const glassSoft = `${Math.round(glassBoostValue * 0.42)}%`;
    const glassMid = `${Math.round(glassBoostValue * 0.52)}%`;
    const glassStrong = `${Math.round(glassBoostValue * 0.62)}%`;
    const glassTone2 = `${Math.round(glassBoostValue * 0.56)}%`;
    const glassCenter = `${Math.round(glassBoostValue * 0.22)}%`;
    return {
	'--assistant-bg': theme.background,
	'--assistant-canvas': theme.canvas ?? theme.background,
	'--assistant-bg-glow-color': theme.glowColor ?? theme.tone1,
	// Dark themes get a dimmer glow so it reads as light, not a colored blob
	'--assistant-bg-glow-opacity': String(theme.glowOpacity ?? (isLight ? 0.55 : 0.35)),
	// Timeline columns: frosted white on light themes, a faint lift on dark ones
	'--assistant-column-bg': isLight
	? 'linear-gradient(180deg, rgba(255, 255, 255, 0.29) 0%, rgba(255, 255, 255, 0.24) 100%)'
	: 'linear-gradient(180deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.04) 100%)',
	// Tinted with each theme's contrast color (Blue → the original rgba(17,37,77,.40))
	'--assistant-column-shadow': isLight
	? `0 20px 40px 0 color-mix(in srgb, ${theme.contrastBg ?? theme.tone1} 40%, transparent)`
	: '0 20px 40px 0 rgba(0, 0, 0, 0.45)',
	'--assistant-row-divider': isLight ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.09)',
	'--assistant-contrast-bg': theme.contrastBg ?? theme.tone1,
	'--assistant-contrast-text': theme.contrastText ?? (isLight ? '#ffffff' : '#000000'),
	'--assistant-bg-style': isLight
	? '#ffffff'
	: '#000000',
	'--assistant-tone-1': theme.tone1,
	'--assistant-tone-2': theme.tone2,
	'--assistant-tone-3': theme.tone3,
	'--assistant-text': theme.textColor,
	'--assistant-text-strong': theme.textColor,
'--assistant-glow':
  '0 0 18px color-mix(in srgb, var(--assistant-accent) 35%, transparent), ' +
  '0 0 40px color-mix(in srgb, var(--assistant-accent) 20%, transparent)',
'--assistant-text-soft': isLight
  ? 'rgba(0,0,0,.65)'
  : 'rgba(255,255,255,.65)',

'--assistant-text-muted': isLight
  ? 'rgba(0,0,0,.45)'
  : 'rgba(255,255,255,.45)',

'--assistant-text-faint': isLight
  ? 'rgba(0,0,0,.30)'
  : 'rgba(255,255,255,.30)',

'--assistant-panel-bg': hasImage
  ? 'linear-gradient(rgba(255,255,255,.25), rgba(255,255,255,.2))'
  : isLight
  ? 'rgba(255,255,255,.92)'
  : 'rgba(0,0,0,.92)',

'--assistant-header-bg': hasImage
  ? 'linear-gradient(rgba(255,255,255,.25), rgba(255,255,255,.2))'
  : isLight
  ? 'rgba(255,255,255,.90)'
  : 'rgba(0,0,0,.45)',

'--assistant-panel-blur': hasImage ? 'blur(16px)' : 'none',

'--assistant-active-text': '#d5fc43',

'--assistant-active-bg': theme.tone2,

	'--assistant-overlay': isLight
	? 'rgba(255,255,255,.35)'
	: 'rgba(0,0,0,.5)',

	'--assistant-border-soft': hasImage
	? 'rgba(255,255,255,.3)'
	: isLight
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
	'--assistant-glass-bg': hasImage
	? 'linear-gradient(rgba(255,255,255,.25), rgba(255,255,255,.2))'
	: isLight ? [
	    'linear-gradient(160deg, color-mix(in srgb, var(--assistant-tone-1) 12%, transparent) 0%, transparent 42%)',
	    'linear-gradient(12deg, color-mix(in srgb, var(--assistant-tone-3) 8%, transparent) 0%, transparent 55%)',
	    'linear-gradient(to bottom, rgba(255,255,255,.80) 0%, rgba(255,255,255,.60) 100%)',
	    'color-mix(in srgb, var(--assistant-bg) 95%, white)',
	].join(', ') : [
	    'linear-gradient(160deg, color-mix(in srgb, var(--assistant-tone-1) 16%, transparent) 0%, transparent 42%)',
	    'linear-gradient(12deg, color-mix(in srgb, var(--assistant-tone-3) 12%, transparent) 0%, transparent 55%)',
	    'linear-gradient(to bottom, rgba(255,255,255,.08) 0%, rgba(255,255,255,.02) 24%, rgba(0,0,0,.22) 100%)',
	    'color-mix(in srgb, var(--assistant-bg) 80%, black)',
	].join(', '),
	'--assistant-overlay-panel-bg': hasImage
	? [
	    'linear-gradient(160deg, color-mix(in srgb, var(--assistant-tone-1) 12%, transparent) 0%, transparent 42%)',
	    'linear-gradient(12deg, color-mix(in srgb, var(--assistant-tone-3) 8%, transparent) 0%, transparent 55%)',
	    'linear-gradient(to bottom, rgba(255,255,255,.95) 0%, rgba(255,255,255,.90) 100%)',
	    'color-mix(in srgb, var(--assistant-bg) 95%, white)',
	].join(', ')
	: 'var(--assistant-glass-bg)',
	'--assistant-danger-text': isLight ? '#be123c' : '#fca5a5',
	'--assistant-panel-shadow': isLight
	? hasImage
	  ? [
	      '0 2px 6px 0 rgba(17,37,77,.05)',
	      'inset 0 0 0 1px rgba(255,255,255,.3)',
	  ].join(', ')
	  : [
	      '0 12px 28px rgba(17,24,39,.10)',
	      '0 3px 10px rgba(17,24,39,.06)',
	      '0 0 0 1px rgba(17,24,39,.04)',
	      'inset 0 1px 0 rgba(255,255,255,.5)',
	  ].join(', ')
	: [
	    '0 22px 60px rgba(0,0,0,.52)',
	    '0 8px 24px rgba(0,0,0,.35)',
	    '0 0 0 1px rgba(255,255,255,.04)',
	    'inset 0 1px 0 rgba(255,255,255,.10)',
	].join(', '),
    } as CSSProperties;
};
