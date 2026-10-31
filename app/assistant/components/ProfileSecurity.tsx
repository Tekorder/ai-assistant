'use client';

import React, { useEffect, useState } from 'react';
import classes from '@/app/assistant/_theme/themes.module.css';
import { sendPasswordReset } from '@/lib/auth';
import { getCurrentUid } from '@/lib/session';
import { isTekOrderSession } from '@/lib/tekorderSso';

/* Matches the server's per-email cooldown (lib/passwordReset.ts) */
const RESEND_AFTER_MS = 60_000;

type Status = 'idle' | 'sending' | 'sent' | 'error';

/** Profile → Security: emails the user a link to our /reset-password page. */
export default function ProfileSecurity({ email }: { email: string }) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [canResend, setCanResend] = useState(true);
  const [tekorder, setTekorder] = useState(false);

  useEffect(() => {
    setTekorder(isTekOrderSession(getCurrentUid()));
  }, []);

  useEffect(() => {
    if (canResend) return;
    const t = setTimeout(() => setCanResend(true), RESEND_AFTER_MS);
    return () => clearTimeout(t);
  }, [canResend]);

  const send = async () => {
    setStatus('sending');
    setError('');
    try {
      await sendPasswordReset(email);
      setStatus('sent');
      setCanResend(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send reset email.');
      setStatus('error');
    }
  };

  // Local test account has no real email
  if (!email.includes('@')) return null;

  return (
    <section
      className="rounded-xl p-4"
      style={{ background: 'var(--assistant-surface)', border: '1px solid var(--assistant-border-soft)' }}
      aria-labelledby="profile-security-title"
    >
      <h2 id="profile-security-title" className="mb-3 text-[13px] font-medium" style={{ color: 'var(--assistant-text-muted)' }}>
        Security
      </h2>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold" style={{ color: 'var(--assistant-text)' }}>Password</div>
          <div className="break-words text-[13px]" style={{ color: 'var(--assistant-text-soft)' }}>
            {tekorder
              ? 'Your password is managed by your TekOrder account.'
              : status === 'sent'
                ? <>Reset link sent to <b style={{ color: 'var(--assistant-text)' }}>{email}</b>. It expires in 1 hour.</>
                : <>We&apos;ll email a secure link to <b style={{ color: 'var(--assistant-text)' }}>{email}</b> to choose a new password.</>}
          </div>
          {status === 'error' ? (
            <div className="mt-1 text-[13px]" style={{ color: 'var(--assistant-danger-text, #d03b3b)' }} role="alert">
              {error}
            </div>
          ) : null}
        </div>

        {!tekorder ? (
          <button
            type="button"
            onClick={send}
            disabled={status === 'sending' || !canResend}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-[14px] font-medium ${classes.wizardPrimaryBtn}`}
          >
            {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Send again' : 'Reset password'}
          </button>
        ) : null}
      </div>
    </section>
  );
}
