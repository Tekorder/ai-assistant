'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * App-wide tooltips. Any element with `data-tip="…"` gets one (use it instead of the
 * native `title`, which looks different on every browser). `data-tip-side` picks where it
 * opens; it flips to the other side and stays inside the viewport when it doesn't fit.
 *
 * One layer, mounted in the root layout, listens for hover / keyboard focus and portals a
 * single box into the themed root, so it's never clipped by a sidebar's overflow.
 */

export type TipSide = 'top' | 'bottom' | 'left' | 'right' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end';

const TOOLTIP_ID = 'yt-tooltip';
const SHOW_DELAY_MS = 300;
/** Moving from one tooltip to the next within this window shows it right away */
const WARM_MS = 400;
const GAP = 6;
const EDGE = 8;

type Tip = { target: HTMLElement; text: string; side: TipSide };

function tipTarget(node: EventTarget | null): HTMLElement | null {
  return node instanceof Element ? node.closest<HTMLElement>('[data-tip]') : null;
}

function readTip(target: HTMLElement): Tip | null {
  const text = target.dataset.tip?.trim();
  if (!text) return null;
  return { target, text, side: (target.dataset.tipSide as TipSide | undefined) ?? 'top' };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(v, Math.max(min, max)));
}

/** Top-left corner for a w×h box next to `a`, flipped / nudged to stay on screen */
function place(side: TipSide, a: DOMRect, w: number, h: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const [main, align] = side.split('-') as ['top' | 'bottom' | 'left' | 'right', 'start' | 'end' | undefined];
  let m = main;
  if (m === 'top' && a.top - GAP - h < EDGE && a.bottom + GAP + h <= vh - EDGE) m = 'bottom';
  else if (m === 'bottom' && a.bottom + GAP + h > vh - EDGE && a.top - GAP - h >= EDGE) m = 'top';
  else if (m === 'right' && a.right + GAP + w > vw - EDGE && a.left - GAP - w >= EDGE) m = 'left';
  else if (m === 'left' && a.left - GAP - w < EDGE && a.right + GAP + w <= vw - EDGE) m = 'right';

  let x: number;
  let y: number;
  if (m === 'top' || m === 'bottom') {
    y = m === 'top' ? a.top - GAP - h : a.bottom + GAP;
    x = align === 'start' ? a.left : align === 'end' ? a.right - w : a.left + a.width / 2 - w / 2;
  } else {
    x = m === 'right' ? a.right + GAP : a.left - GAP - w;
    y = a.top + a.height / 2 - h / 2;
  }
  return { x: clamp(x, EDGE, vw - EDGE - w), y: clamp(y, EDGE, vh - EDGE - h) };
}

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let timer: number | undefined;
    let current: HTMLElement | null = null;
    let visible = false;
    let hiddenAt = 0;

    const hide = () => {
      window.clearTimeout(timer);
      if (visible) hiddenAt = Date.now();
      visible = false;
      current = null;
      setTip(null);
    };
    const show = (target: HTMLElement, immediate: boolean) => {
      if (target === current) return;
      const next = readTip(target);
      const warm = visible || Date.now() - hiddenAt < WARM_MS;
      hide();
      if (!next) return;
      current = target;
      timer = window.setTimeout(() => {
        visible = true;
        setTip(next);
      }, immediate || warm ? 0 : SHOW_DELAY_MS);
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const target = tipTarget(e.target);
      if (target) show(target, false);
      else if (current) hide();
    };
    const onOut = (e: PointerEvent) => {
      // Pointer left the window
      if (!e.relatedTarget && current) hide();
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as Element;
      // Text fields always count as :focus-visible — a tip there would sit over what's being typed
      if (el.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      const target = tipTarget(el);
      if (target && el.matches(':focus-visible')) show(target, true);
    };
    const onFocusOut = () => { if (current) hide(); };
    // Typing (or Esc) clears it; Tab then shows the next element's tip on focus
    const onKey = () => { if (current) hide(); };
    const onDismiss = () => { if (current) hide(); };

    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('pointerout', onOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('pointerdown', onDismiss, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onDismiss, true);
    window.addEventListener('resize', onDismiss);
    window.addEventListener('blur', onDismiss);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('pointerout', onOut, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      document.removeEventListener('pointerdown', onDismiss, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onDismiss, true);
      window.removeEventListener('resize', onDismiss);
      window.removeEventListener('blur', onDismiss);
    };
  }, []);

  // Size to the text, then position — before paint, so it never flashes in the wrong spot
  useLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!tip || !box || !text) return;
    if (!tip.target.isConnected) { setTip(null); return; }

    // A wrapped box keeps its max-width, leaving a gap after the shorter lines;
    // shrink it to the widest line instead
    box.style.width = '';
    const lines = text.getClientRects();
    if (lines.length > 1) {
      let widest = 0;
      for (const r of lines) widest = Math.max(widest, r.width);
      const cs = getComputedStyle(box);
      const extra = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
        + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      box.style.width = `${Math.ceil(widest + extra)}px`;
    }

    const { width, height } = box.getBoundingClientRect();
    const { x, y } = place(tip.side, tip.target.getBoundingClientRect(), width, height);
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
    box.style.visibility = 'visible';
    const raf = requestAnimationFrame(() => { box.style.opacity = '1'; });

    // Screen readers: the tip describes its element (unless it already names it)
    const { target } = tip;
    const describe = !target.hasAttribute('aria-describedby') && target.getAttribute('aria-label') !== tip.text;
    if (describe) target.setAttribute('aria-describedby', TOOLTIP_ID);
    return () => {
      cancelAnimationFrame(raf);
      if (describe) target.removeAttribute('aria-describedby');
    };
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={boxRef}
      id={TOOLTIP_ID}
      role="tooltip"
      // yt-surface (globals.css): the theme's gradient, like every menu and modal
      className="yt-surface pointer-events-none fixed z-[10100] w-max max-w-[260px] whitespace-pre-line break-words rounded-md px-2 py-1 text-left text-[12px] font-medium leading-snug transition-opacity duration-100 [text-wrap:balance]"
      style={{
        left: 0,
        top: 0,
        visibility: 'hidden',
        opacity: 0,
      }}
    >
      <span ref={textRef}>{tip.text}</span>
    </div>,
    // Inside the themed root so the --assistant-* colors apply
    tip.target.closest('[data-assistant-root]') ?? document.body,
  );
}
