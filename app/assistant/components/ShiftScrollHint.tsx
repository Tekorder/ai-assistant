'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * Toast teaching Shift + scroll when a downward wheel inside the horizontal deck
 * has nowhere left to go vertically (nothing under the cursor can scroll further)
 * but the deck itself can still scroll sideways.
 */

const DEAD_DELTA_TO_TRIGGER = 140; // px of "wasted" downward wheel before hinting — ignores stray flicks
const DEAD_WINDOW_MS = 700;        // those px must happen within this window
const VISIBLE_MS = 2600;
const COOLDOWN_MS = 15000;

/** True if some element between `target` and `stop` can still scroll down. */
function canScrollDownFrom(target: Element | null, stop: Element): boolean {
  for (let el = target; el && el !== stop; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
    if (el.scrollHeight - el.clientHeight <= 1) continue;
    if (el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
  }
  return false;
}

export function ShiftScrollHint({
  deckRef,
  enabled,
}: {
  deckRef: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const learnedRef = useRef(false);        // they already scroll sideways — stop hinting this session
  // -Infinity, not 0: performance.now() starts at page load, so 0 would block the first 15s
  const lastShownRef = useRef(Number.NEGATIVE_INFINITY);
  const deadRef = useRef({ sum: 0, since: 0 });
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const onWheel = (e: WheelEvent) => {
      const deck = deckRef.current;
      if (!deck || learnedRef.current) return;
      if (!(e.target instanceof Element) || !deck.contains(e.target)) return;

      // Already scrolling sideways (Shift + wheel, or a trackpad's horizontal swipe)
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        if (deck.scrollWidth - deck.clientWidth > 1) {
          learnedRef.current = true;
          setVisible(false);
        }
        return;
      }

      if (e.deltaY <= 0) return;                                  // only "scrolling down"
      if (deck.scrollWidth - deck.clientWidth <= 1) return;       // nothing off to the side
      if (canScrollDownFrom(e.target, deck)) {                    // the wheel is doing its job
        deadRef.current = { sum: 0, since: 0 };
        return;
      }

      const now = performance.now();
      const dead = deadRef.current;
      if (now - dead.since > DEAD_WINDOW_MS) { dead.sum = 0; dead.since = now; }
      dead.sum += e.deltaY;
      if (dead.sum < DEAD_DELTA_TO_TRIGGER) return;
      if (now - lastShownRef.current < COOLDOWN_MS) return;

      lastShownRef.current = now;
      deadRef.current = { sum: 0, since: 0 };
      setVisible(true);
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => setVisible(false), VISIBLE_MS);
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    };
  }, [deckRef, enabled]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-8 left-1/2 z-[9500] transition-all duration-300"
      style={{
        opacity: visible ? 1 : 0,
        transform: `translate(-50%, ${visible ? '0' : '8px'})`,
      }}
    >
      {visible ? (
        <div
          className="flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-[14px] font-medium shadow-lg"
          style={{
            background: 'var(--assistant-contrast-bg)',
            color: 'var(--assistant-contrast-text)',
            boxShadow: '0 10px 28px color-mix(in srgb, var(--assistant-contrast-bg) 35%, transparent)',
          }}
        >
          <kbd
            className="rounded-md px-1.5 py-0.5 text-[12px] font-semibold"
            style={{ background: 'color-mix(in srgb, var(--assistant-contrast-text) 18%, transparent)' }}
          >
            Shift
          </kbd>
          <span>+ scroll to scroll horizontally</span>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 5 1.5 8l3 3M11.5 5l3 3-3 3M1.5 8h13" />
          </svg>
        </div>
      ) : null}
    </div>
  );
}
