import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  UserCredential,
} from 'firebase/auth';
import { auth } from './firebase';
import { apiUrl } from './api';

export async function loginWithEmail(
  email: string,
  password: string
): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerWithEmail(
  email: string,
  password: string
): Promise<UserCredential> {
  return createUserWithEmailAndPassword(auth, email, password);
}

/**
 * Asks our server to email a password reset link (our design, sent via Twilio).
 * Resolves for unknown emails too, so the UI can't reveal who has an account.
 */
export async function sendPasswordReset(email: string): Promise<void> {
  const res = await fetch(apiUrl('/api/email'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'password_reset', email }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out?.ok === false) {
    throw new Error(out?.message || 'Failed to send reset email.');
  }
}

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle(): Promise<UserCredential> {
  return signInWithPopup(auth, googleProvider);
}