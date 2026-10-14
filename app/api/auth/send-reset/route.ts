import { NextResponse } from 'next/server';

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

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
        { ok: false, message: 'Password reset is not configured on the server.', detail: `Missing: ${missing.join(', ')}` },
        { status: 500 }
      );
    }

    // Imported lazily so a module-load failure (e.g. firebase-admin on an
    // unsupported Node version) comes back as JSON instead of the bare 500 page.
    let getAuth: typeof import('firebase-admin/auth').getAuth;
    let getAdminApp: typeof import('@/lib/firebase-admin').getAdminApp;
    let sendEmailBrevo: typeof import('@/lib/sendEmailBrevo').sendEmailBrevo;
    try {
      ({ getAuth } = await import('firebase-admin/auth'));
      ({ getAdminApp } = await import('@/lib/firebase-admin'));
      ({ sendEmailBrevo } = await import('@/lib/sendEmailBrevo'));
    } catch (err) {
      console.error('send-reset: failed to load server modules:', err);
      return NextResponse.json(
        { ok: false, message: 'Failed to send reset email.', detail: `Module load (Node ${process.version}): ${errorMessage(err)}` },
        { status: 500 }
      );
    }

    let resetLink: string;
    try {
      resetLink = await getAuth(getAdminApp()).generatePasswordResetLink(email);
    } catch (err) {
      const code = (err as { code?: string })?.code;

      // Don't reveal whether the email exists
      if (code === 'auth/user-not-found' || code === 'auth/email-not-found') {
        return NextResponse.json({ ok: true });
      }

      console.error('send-reset: Firebase reset link failed:', err);
      return NextResponse.json(
        { ok: false, message: 'Failed to send reset email.', detail: `Firebase: ${code ?? errorMessage(err)}` },
        { status: 500 }
      );
    }

    try {
      await sendEmailBrevo(email, 'reset', { resetLink });
    } catch (err) {
      console.error('send-reset: Brevo send failed:', err);
      return NextResponse.json(
        { ok: false, message: 'Failed to send reset email.', detail: `Email: ${errorMessage(err)}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('send-reset: unexpected error:', err);
    return NextResponse.json(
      { ok: false, message: 'Failed to send reset email.', detail: errorMessage(err) },
      { status: 500 }
    );
  }
}
