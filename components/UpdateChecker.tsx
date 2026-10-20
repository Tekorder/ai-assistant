'use client';
import { useEffect, useState } from 'react';

const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? '';
const CHECK_EVERY_MS = 5 * 60 * 1000;

/**
 * Notices when a newer deploy is live so nobody has to press F5. Asks the server for
 * its build id every few minutes and whenever the tab comes back into view. If the tab
 * is in the background it reloads right away; if the person is looking at it, it shows
 * a "new version" bar instead of yanking the page out from under them.
 */
export function UpdateChecker() {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    if (!CLIENT_BUILD_ID || CLIENT_BUILD_ID.startsWith('local-')) return; // dev: id changes every restart
    let stale = false;

    const check = async () => {
      if (stale) {
        if (document.visibilityState === 'hidden') window.location.reload();
        return;
      }
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const { buildId } = (await res.json()) as { buildId?: string };
        if (!buildId || buildId === CLIENT_BUILD_ID) return;
        stale = true;
        if (document.visibilityState === 'hidden') window.location.reload();
        else setOutdated(true);
      } catch {
        // offline or mid-deploy: try again next time
      }
    };

    const onVisibility = () => { void check(); };
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, []);

  if (!outdated) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-[20000] flex -translate-x-1/2 items-center gap-3 rounded-full px-4 py-2 text-[13px] shadow-2xl"
      style={{ background: '#111827', color: '#fff', maxWidth: 'calc(100vw - 32px)' }}
    >
      <span>A new version of Youtask is available</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-black hover:bg-white/90"
      >
        Update
      </button>
    </div>
  );
}
