import { auth } from './firebase';
import { signOut, onAuthStateChanged, User } from 'firebase/auth';

const SESSION_KEYS = [
  'firebase_uid', 'prisma_user_id', 'prisma_user_email',
  'prisma_user_name', 'prisma_user_avatar',
  'youtask_projects_v1', 'youtask_blocks_v1',
  'youtask_habits_v1', 'youtask_reminders_v1', 'youtask_checklists_v1',
  'youtask_occupation', 'youtask_profession', 'youtask_goal',
  'youtask_trusted_browser_v1', 'youtask_2fa', 'twofa_ok',
];

export function clearSessionStorage() {
  try { SESSION_KEYS.forEach(k => localStorage.removeItem(k)); } catch {}
}

export async function signOutAndClear(): Promise<void> {
  clearSessionStorage();
  try { await signOut(auth); } catch {}
}

export async function validateSession(): Promise<boolean> {
  // Local mode has no DB or real Firebase users — skip all validation
  if (process.env.NEXT_PUBLIC_DATABASE_MODE === 'local') return true;

  const storedUid = localStorage.getItem('firebase_uid');
  if (!storedUid) return false;

  // testuser is a dev bypass with no real Firebase account
  if (storedUid === 'testuser') return true;

  const firebaseUser = await new Promise<User | null>(resolve => {
    const unsub = onAuthStateChanged(auth, user => { unsub(); resolve(user); });
  });

  if (!firebaseUser || firebaseUser.uid !== storedUid) {
    await signOutAndClear();
    return false;
  }

  try {
    const res = await fetch('/api/data/projects', {
      headers: { 'X-Firebase-UID': storedUid },
    });
    if (res.status === 401) {
      await signOutAndClear();
      return false;
    }
  } catch {
    // Network error — don't sign out, allow offline use
  }

  return true;
}
