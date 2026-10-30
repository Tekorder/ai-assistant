import 'server-only';
import { adminAuth } from './firebaseAdmin';
import { appUrl, sendEmail } from './sendEmail';

/* ===================== Password reset =====================
 * Our own reset flow on top of Firebase Auth:
 *   1. requestPasswordReset — Firebase Admin mints the one-time code (oobCode),
 *      we email a link to OUR page (/reset-password?oobCode=…) via Twilio.
 *   2. verifyResetCode      — the page checks the code and shows the email.
 *   3. confirmPasswordReset — Firebase sets the new password, we send a
 *      "password changed" notice.
 * Firebase still owns the password; we only own the emails and the page. */

const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1/accounts:resetPassword';

/** One reset email per address per minute (best effort: per server instance). */
const COOLDOWN_MS = 60_000;
const lastSent = new Map<string, number>();

export class ResetError extends Error {}

/**
 * Sends the reset email. Silently does nothing for unknown addresses or while
 * cooling down, so callers can't tell which emails have an account.
 */
export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ResetError('Enter a valid email address.');

  const now = Date.now();
  if (now - (lastSent.get(email) ?? 0) < COOLDOWN_MS) return;
  lastSent.set(email, now);

  // Look the user up first: with Firebase's email-enumeration protection on,
  // generatePasswordResetLink fails with a generic internal error for unknown emails
  try {
    await adminAuth().getUserByEmail(email);
  } catch (err) {
    if ((err as { code?: string })?.code === 'auth/user-not-found') return;
    throw err;
  }

  const firebaseLink = await adminAuth().generatePasswordResetLink(email);

  const oobCode = new URL(firebaseLink).searchParams.get('oobCode');
  if (!oobCode) throw new Error('Firebase reset link has no oobCode');

  const resetUrl = `${appUrl()}/reset-password?oobCode=${encodeURIComponent(oobCode)}`;
  await sendEmail(email, 'password_reset', { resetUrl });
}

/** Firebase's REST endpoint: with only oobCode it verifies, with newPassword it applies. */
async function identityToolkit(body: { oobCode: string; newPassword?: string }): Promise<{ email: string }> {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!key) throw new Error('NEXT_PUBLIC_FIREBASE_API_KEY is not defined');

  const res = await fetch(`${IDENTITY_TOOLKIT}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = String(json?.error?.message || '');
    if (message.startsWith('EXPIRED_OOB_CODE') || message.startsWith('INVALID_OOB_CODE')) {
      throw new ResetError('This reset link has expired or was already used. Request a new one.');
    }
    if (message.startsWith('WEAK_PASSWORD')) throw new ResetError('Password must be at least 6 characters.');
    if (message.startsWith('USER_DISABLED')) throw new ResetError('This account has been disabled.');
    throw new Error(`Firebase resetPassword failed: ${message || res.status}`);
  }

  return { email: String(json.email || '') };
}

export async function verifyResetCode(oobCode: string): Promise<string> {
  if (!oobCode) throw new ResetError('This reset link is invalid.');
  const { email } = await identityToolkit({ oobCode });
  return email;
}

export async function confirmPasswordReset(oobCode: string, newPassword: string): Promise<void> {
  if (!oobCode) throw new ResetError('This reset link is invalid.');
  if (newPassword.length < 6) throw new ResetError('Password must be at least 6 characters.');

  const { email } = await identityToolkit({ oobCode, newPassword });

  // The password is already changed; a failed notice must not fail the reset
  if (email) {
    await sendEmail(email, 'password_changed').catch((err) =>
      console.error('password_changed email failed:', err),
    );
  }
}
