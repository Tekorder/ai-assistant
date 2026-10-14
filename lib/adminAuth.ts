import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// Admin access is separate from user auth: the user APIs trust a client-set
// X-Firebase-UID header, which is not good enough for an admin panel.
// One shared password (ADMIN_PASSWORD) -> httpOnly cookie holding an HMAC of it.
export const ADMIN_COOKIE = 'yt_admin';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function adminPassword(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  return pw && pw.length >= 8 ? pw : null;
}

function tokenFor(pw: string) {
  return createHmac('sha256', pw).update('youtask-admin-session').digest('hex');
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function isAdminConfigured() {
  return adminPassword() !== null;
}

export async function isAdmin() {
  // Local dev: skip the login entirely. Production still requires the password.
  if (process.env.NODE_ENV !== 'production') return true;
  const pw = adminPassword();
  if (!pw) return false;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return !!token && safeEqual(token, tokenFor(pw));
}

export async function requireAdmin() {
  if (!(await isAdmin())) redirect('/admin/login');
}

export async function startAdminSession(password: string) {
  const pw = adminPassword();
  if (!pw || !safeEqual(tokenFor(password), tokenFor(pw))) return false;
  (await cookies()).set(ADMIN_COOKIE, tokenFor(pw), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/admin',
    maxAge: MAX_AGE,
  });
  return true;
}

export async function endAdminSession() {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: '/admin' });
}
