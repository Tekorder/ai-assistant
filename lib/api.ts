import { getCurrentUid } from './sessionStore';

/* ===================== API client =====================
 * The app's one door to our API. Every data request goes through apiFetch so
 * the server address and the caller's identity are set in one place:
 *   - NEXT_PUBLIC_API_BASE_URL is empty on the web (same origin) and points
 *     at the deployed server in a native build;
 *   - identity is the X-Firebase-UID header today — when the server starts
 *     verifying tokens, only this file changes. */

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, '');

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * fetch() against our API. Sends the signed-in uid unless `uid` overrides it —
 * the sync lanes pass the uid they were gated on, so a request can't go out
 * under an account that signed in after the check.
 */
export function apiFetch(path: string, init: RequestInit & { uid?: string } = {}): Promise<Response> {
  const { uid = getCurrentUid(), ...rest } = init;
  const headers = new Headers(rest.headers);
  if (uid) headers.set('X-Firebase-UID', uid);
  return fetch(apiUrl(path), { ...rest, headers });
}
