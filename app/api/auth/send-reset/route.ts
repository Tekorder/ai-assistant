import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '@/lib/firebase-admin';
import { sendEmailBrevo } from '@/lib/sendEmailBrevo';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ ok: false, message: 'Email is required.' }, { status: 400 });
    }

    const missing = [
      'FIREBASE_ADMIN_PROJECT_ID',
      'FIREBASE_ADMIN_CLIENT_EMAIL',
      'FIREBASE_ADMIN_PRIVATE_KEY',
    ].filter((k) => !process.env[k]);
    if (missing.length) {
      console.error('send-reset: missing env vars:', missing.join(', '));
      return NextResponse.json(
        { ok: false, message: 'Password reset is not configured on the server.' },
        { status: 500 }
      );
    }

    const auth = getAuth(getAdminApp());
    const resetLink = await auth.generatePasswordResetLink(email);

    try {
      await sendEmailBrevo(email, 'reset', { resetLink });
    } catch (err) {
      console.error('send-reset: Brevo send failed:', err);
      return NextResponse.json(
        { ok: false, message: 'Failed to send reset email.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const code = (err as { code?: string })?.code;

    // Don't reveal whether the email exists
    if (code === 'auth/user-not-found' || code === 'auth/email-not-found') {
      return NextResponse.json({ ok: true });
    }

    console.error('send-reset: Firebase reset link failed:', err);
    return NextResponse.json(
      { ok: false, message: 'Failed to send reset email.' },
      { status: 500 }
    );
  }
}
