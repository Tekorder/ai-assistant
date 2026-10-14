import { auth } from './firebase';
import { signOut, onAuthStateChanged, User } from 'firebase/auth';
import {
  isTekOrderSession, markTekOrderSession, clearAuthProviderMarker, logoutOfTekOrder,
} from './tekorderSso';
import { clearLocalAccountData, closeSyncGates, getDataOwner, prepareLocalDataForUser } from './datacenter';
import { apiFetch } from './api';
import {
  UID_KEY, USER_ID_KEY, EMAIL_KEY, NAME_KEY, AVATAR_KEY, PROFILE_KEYS, getCurrentUid,
} from './sessionStore';

/* ===================== Account session =====================
 * The only module components use for the signed-in identity: they ask here
 * for the uid/profile and call setSession/clearSession — never the storage
 * keys directly (those live in sessionStore). Account DATA (tasks, habits, …)
 * belongs to the datacenter; this module only calls into it on login/logout. */

export { getCurrentUid, getProfile, hasSession, subscribeSessionChange, type Profile } from './sessionStore';

/** Login-flow flags; these live in sessionStorage, not localStorage. */
const TWOFA_OK_KEY      = 'twofa_ok';
const TWOFA_PENDING_KEY = 'youtask_2fa';

export type SessionInput = {
  uid: string;
  prismaUserId: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  provider?: 'tekorder';
};

/* ===================== Login ===================== */

/**
 * Call on every login, before anything is synced. Hands this device's local
 * data to the incoming account (see prepareLocalDataForUser) and, when the
 * account changes, drops the previous account's cached profile. Decided by who
 * owns the local data, not by `firebase_uid` — logout removes that key but
 * leaves the data, so checking it let the next account inherit the tasks.
 */
export function prepareSessionFor(uid: string): void {
  try {
    const switching = getDataOwner() !== uid;
    prepareLocalDataForUser(uid);
    if (switching) PROFILE_KEYS.forEach(k => localStorage.removeItem(k));
  } catch {}
}

export function setSession(s: SessionInput): void {
  try {
    localStorage.setItem(USER_ID_KEY, s.prismaUserId);
    localStorage.setItem(EMAIL_KEY, s.email);
    localStorage.setItem(UID_KEY, s.uid);
    if (s.name) localStorage.setItem(NAME_KEY, s.name);
    if (s.avatarUrl) localStorage.setItem(AVATAR_KEY, s.avatarUrl);
    sessionStorage.setItem(TWOFA_OK_KEY, '1');
  } catch {}
  // An email that already had a Firebase/Google account keeps that real uid,
  // so a TekOrder session is flagged explicitly — validateSession must not
  // demand a Firebase Auth session for it (TekOrder never creates one).
  if (s.provider === 'tekorder') markTekOrderSession();
  else clearAuthProviderMarker();
}

/* ===================== Logout ===================== */

/** Drops the identity and profile cache. Account data is left to the caller. */
export function clearSession(): void {
  try {
    [UID_KEY, ...PROFILE_KEYS].forEach(k => localStorage.removeItem(k));
    sessionStorage.removeItem(TWOFA_OK_KEY);
    sessionStorage.removeItem(TWOFA_PENDING_KEY);
  } catch {}
  clearAuthProviderMarker();
  closeSyncGates();
}

/**
 * Signs out of Firebase (and TekOrder when asked) and empties the device.
 * `keepLocalData` leaves tasks/habits/… in place — for kicking out a broken
 * session without losing edits that may not have reached Postgres yet.
 */
export async function signOutAndClear(
  opts: { tekorder?: boolean; keepLocalData?: boolean } = {},
): Promise<void> {
  const wasTekOrder = isTekOrderSession(getCurrentUid());
  try { await signOut(auth); } catch {}
  if (opts.tekorder && wasTekOrder) {
    try { await logoutOfTekOrder(); } catch {}
  }
  if (!opts.keepLocalData) clearLocalAccountData();
  clearSession();
}

/* ===================== Validation ===================== */

export async function validateSession(): Promise<boolean> {
  // Local mode has no DB or real Firebase users — skip all validation
  if (process.env.NEXT_PUBLIC_DATABASE_MODE === 'local') return true;

  const storedUid = getCurrentUid();
  if (!storedUid) return false;

  // testuser is a dev bypass with no real Firebase account
  if (storedUid === 'testuser') return true;

  // TekOrder logins never create a real Firebase Auth session — they're
  // validated against our own DB below via the X-Firebase-UID header instead.
  if (!isTekOrderSession(storedUid)) {
    const firebaseUser = await new Promise<User | null>(resolve => {
      const unsub = onAuthStateChanged(auth, user => { unsub(); resolve(user); });
    });

    if (!firebaseUser || firebaseUser.uid !== storedUid) {
      await signOutAndClear();
      return false;
    }
  }

  try {
    const res = await apiFetch('/api/data/projects', { uid: storedUid });
    if (res.status === 401) {
      await signOutAndClear();
      return false;
    }
  } catch {
    // Network error — don't sign out, allow offline use
  }

  return true;
}
