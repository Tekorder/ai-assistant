'use client';

// TEMP: helpdesk.tekorder.com is returning 403/Cloudflare errors on every
// path (a DNS/Cloudflare config issue on the tekorder.com zone, unrelated to
// this app). Using the base44 origin directly until that's fixed — switch
// back to https://helpdesk.tekorder.com once it is, same protocol either way.
const TEKORDER_ORIGIN = 'https://helpdesk-dev.base44.app';

export type TekOrderUser = {
  user_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
};

function randomState(): string {
  return Array.from(crypto.getRandomValues(new Uint32Array(4))).join('');
}

/**
 * Opens the TekOrder SSO popup and resolves with the user info TekOrder
 * posts back once the person is signed in there. No client id/secret and no
 * server-to-server call — the browser gets the final identity directly.
 */
export function openTekOrderLogin(appDisplayName: string): Promise<TekOrderUser> {
  const state = randomState();
  sessionStorage.setItem('tekorder_sso_state', state);

  const url = new URL(`${TEKORDER_ORIGIN}/ssoauthorize`);
  url.searchParams.set('state', state);
  url.searchParams.set('origin', window.location.origin);
  url.searchParams.set('app_name', appDisplayName);

  const popup = window.open(url.toString(), 'tekorder-login', 'width=480,height=640');
  if (!popup) throw new Error('Popup blocked. Please allow popups for this site and try again.');

  return new Promise<TekOrderUser>((resolve, reject) => {
    let settled = false;

    function cleanup() {
      window.removeEventListener('message', handleMessage);
      window.clearInterval(closedCheck);
    }

    function handleMessage(event: MessageEvent) {
      if (event.origin !== TEKORDER_ORIGIN) return;
      if (event.data?.type !== 'tekorder-sso') return;
      settled = true;
      cleanup();

      const expectedState = sessionStorage.getItem('tekorder_sso_state');
      sessionStorage.removeItem('tekorder_sso_state');

      if (!event.data.state || event.data.state !== expectedState) {
        console.error('TekOrder SSO: state mismatch', {
          expected: expectedState,
          received: event.data.state,
        });
        reject(
          new Error(
            'TekOrder sign-in was rejected: the security check (state) didn’t match. Close this window and click "Continue with TekOrder" again.'
          )
        );
        return;
      }
      if (event.data.error) {
        reject(new Error(`TekOrder sign-in failed: ${event.data.error}`));
        return;
      }
      if (!event.data.user?.email) {
        console.error('TekOrder SSO: popup replied with no usable user/email', event.data);
        reject(
          new Error(
            'TekOrder sign-in failed: no account info (email) came back from TekOrder. Try again, and if it keeps happening this is a TekOrder-side issue, not this app.'
          )
        );
        return;
      }
      resolve(event.data.user as TekOrderUser);
    }

    window.addEventListener('message', handleMessage);

    const closedCheck = window.setInterval(() => {
      if (popup.closed && !settled) {
        cleanup();
        reject(new Error('Sign-in was cancelled.'));
      }
    }, 500);
  });
}

/** True for a `firebase_uid` value this app assigned during a TekOrder login (real or local-only fallback). */
export function isTekOrderSession(firebaseUid: string | null | undefined): boolean {
  if (!firebaseUid) return false;
  return firebaseUid.replace(/^local-/, '').startsWith('tekorder:');
}

/**
 * Ends the TekOrder session in the browser (via a popup to /ssologout) so a
 * later "Continue with TekOrder" click shows the login form again instead of
 * silently reusing the still-active TekOrder session. Only meaningful for a
 * session that started as `isTekOrderSession(...)`; safe to skip otherwise.
 */
export function logoutOfTekOrder(): Promise<void> {
  const state = randomState();
  const url = new URL(`${TEKORDER_ORIGIN}/ssologout`);
  url.searchParams.set('state', state);
  url.searchParams.set('origin', window.location.origin);

  const popup = window.open(url.toString(), 'tekorder-logout', 'width=420,height=280');

  return new Promise<void>((resolve) => {
    let settled = false;

    function cleanup() {
      window.removeEventListener('message', handleMessage);
      window.clearInterval(poll);
    }

    function finish() {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }

    function handleMessage(event: MessageEvent) {
      if (event.origin !== TEKORDER_ORIGIN) return;
      if (event.data?.type !== 'tekorder-sso-logout') return;
      finish();
    }

    if (!popup) {
      // Popup blocked — nothing to wait on, just fall through so the
      // caller's own logout still proceeds.
      finish();
      return;
    }

    window.addEventListener('message', handleMessage);

    // Fallback in case the popup is closed manually or never replies.
    const poll = window.setInterval(() => {
      if (popup.closed) finish();
    }, 500);
  });
}
