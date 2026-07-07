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

    const auth = getAuth(getAdminApp());
    const resetLink = await auth.generatePasswordResetLink(email);

    await sendEmailBrevo(email, 'reset', { resetLink });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const code = (err as { code?: string })?.code;

    // Don't reveal whether the email exists
    if (code === 'auth/user-not-found' || code === 'auth/email-not-found') {
      return NextResponse.json({ ok: true });
    }

    console.error('send-reset error:', err);
    return NextResponse.json(
      { ok: false, message: 'Failed to send reset email.' },
      { status: 500 }
    );
  }
}
