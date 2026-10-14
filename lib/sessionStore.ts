/* ===================== Session storage (leaf module) =====================
 * Where the signed-in identity is stored, and the reads on it. No imports on
 * purpose: api.ts and the datacenter read the uid from here, and session.ts
 * (which imports the datacenter) writes through these keys — keeping this a
 * leaf avoids an import cycle. Components use lib/session, not this file. */

export const UID_KEY     = 'firebase_uid';
export const USER_ID_KEY = 'prisma_user_id';
export const EMAIL_KEY   = 'prisma_user_email';
export const NAME_KEY    = 'prisma_user_name';
export const AVATAR_KEY  = 'prisma_user_avatar';

/** Per-account profile cache — dropped on logout and on account switch. */
export const PROFILE_KEYS = [
  USER_ID_KEY, EMAIL_KEY, NAME_KEY, AVATAR_KEY,
  'youtask_occupation', 'youtask_profession', 'youtask_goal',
];

export type Profile = {
  prismaUserId: string;
  email: string;
  name: string;
  avatarUrl: string;
};

function read(key: string): string {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}

export function getCurrentUid(): string {
  return read(UID_KEY);
}

export function getProfile(): Profile {
  return {
    prismaUserId: read(USER_ID_KEY),
    email:        read(EMAIL_KEY),
    name:         read(NAME_KEY),
    avatarUrl:    read(AVATAR_KEY),
  };
}

/** A session exists once login has recorded the Prisma user id. */
export function hasSession(): boolean {
  return read(USER_ID_KEY) !== '';
}

/** Calls `cb` when another tab signs in or out. Returns the unsubscribe. */
export function subscribeSessionChange(cb: () => void): () => void {
  const handler = (e: StorageEvent) => { if (e.key === USER_ID_KEY) cb(); };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
