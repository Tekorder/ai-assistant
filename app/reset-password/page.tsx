'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import { validatePassword, validatePasswordMatch } from '@/app/signup/_utils/validation';

/* ─── Styles ───────────────────────────────────────────────── */
/* Same card look as the login page (app/login/page.tsx). */
const STYLES = `
  .rp-wrap { font-family: var(--font-thicccboi), sans-serif; color: #1a2b48; }
  @keyframes rp-in {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  .rp-card { animation: rp-in .35s cubic-bezier(.25,.9,.3,1) both; }
  .rp-input {
    width: 100%; padding: 11px 14px;
    background: rgba(0,0,0,.04);
    border: 1px solid rgba(0,0,0,.08);
    border-radius: 10px; color: #1a2b48;
    font-size: 15px; font-family: inherit;
    outline: none; transition: border-color .15s, background .15s;
  }
  .rp-input:hover { background: rgba(0,0,0,.05); }
  .rp-input::placeholder { color: rgba(0,0,0,.30); }
  .rp-input:focus {
    border-color: color-mix(in srgb, #1a2b48 45%, transparent);
    background: #ffffff;
  }
  .rp-btn {
    display: block; width: 100%; padding: 12px; border-radius: 10px; border: none;
    background: #18315c; color: #ffffff; text-align: center; text-decoration: none;
    font-size: 15px; font-weight: 600; font-family: inherit;
    cursor: pointer; transition: background .15s, opacity .15s, box-shadow .15s;
    box-shadow: 0 6px 18px rgba(24,49,92,.22);
  }
  .rp-btn:hover:not(:disabled) { background: #1a2b48; box-shadow: 0 8px 24px rgba(24,49,92,.30); }
  .rp-btn:disabled { opacity: .45; cursor: not-allowed; }
`;

const label: React.CSSProperties = {
  display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: 'rgba(26,43,72,.75)',
};

const errorBox: React.CSSProperties = {
  marginBottom: 16, padding: '10px 14px', borderRadius: 10,
  border: '1px solid rgba(248,113,113,.25)', background: 'rgba(248,113,113,.08)',
  fontSize: 14, color: '#be123c',
};

async function callEmailApi(body: Record<string, string>): Promise<{ ok?: boolean; message?: string; email?: string }> {
  const res = await fetch(apiUrl('/api/email'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out?.ok === false) throw new Error(out?.message || 'Something went wrong. Please try again.');
  return out;
}

type Step = 'checking' | 'invalid' | 'form' | 'done';

function ResetPasswordForm() {
  const oobCode = useSearchParams().get('oobCode') ?? '';

  const [step, setStep] = useState<Step>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!oobCode) {
      setError('This reset link is invalid.');
      setStep('invalid');
      return;
    }
    callEmailApi({ action: 'verify_reset_code', oobCode })
      .then(out => {
        setEmail(out.email ?? '');
        setStep('form');
      })
      .catch(e => {
        setError(e instanceof Error ? e.message : 'This reset link is invalid.');
        setStep('invalid');
      });
  }, [oobCode]);

  const passwordError = validatePassword(password).error || validatePasswordMatch(password, confirm).error;
  const canSubmit = password.length >= 6 && confirm.length > 0 && !passwordError && !saving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setSaving(true);
    try {
      await callEmailApi({ action: 'confirm_password_reset', oobCode, newPassword: password });
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
    } finally {
      setSaving(false);
    }
  };

  if (step === 'checking') {
    return <p style={{ textAlign: 'center', fontSize: 15, color: 'rgba(26,43,72,.65)' }}>Checking your link…</p>;
  }

  if (step === 'invalid') {
    return (
      <>
        <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>Link not valid</h1>
        <div style={errorBox}>{error}</div>
        <Link href="/login" className="rp-btn">Back to sign in</Link>
      </>
    );
  }

  if (step === 'done') {
    return (
      <>
        <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>Password updated</h1>
        <p style={{ margin: '0 0 20px', fontSize: 15, lineHeight: 1.5, color: 'rgba(26,43,72,.75)' }}>
          Your password has been changed. You can now sign in with your new password.
        </p>
        <Link href="/login" className="rp-btn">Go to sign in</Link>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700 }}>Choose a new password</h1>
      <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.5, color: 'rgba(26,43,72,.70)' }}>
        For <strong style={{ color: '#1a2b48' }}>{email}</strong>
      </p>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ marginBottom: 14 }}>
        <label style={label} htmlFor="rp-new">New password</label>
        <input
          id="rp-new"
          className="rp-input"
          type="password"
          placeholder="At least 6 characters"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="new-password"
          autoFocus
        />
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={label} htmlFor="rp-confirm">Confirm new password</label>
        <input
          id="rp-confirm"
          className="rp-input"
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      <div style={{ minHeight: 20, marginBottom: 12, fontSize: 13, color: '#be123c' }}>
        {password || confirm ? passwordError : ''}
      </div>

      <button type="submit" className="rp-btn" disabled={!canSubmit}>
        {saving ? 'Saving…' : 'Save new password'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div
      className="rp-wrap"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(145deg, #f8fafc 0%, #f1f5fa 22%, #e4eef7 48%, #d0e2f2 72%, #b8d2eb 100%)',
        padding: 20,
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div
        className="rp-card"
        style={{
          width: '100%',
          maxWidth: 400,
          borderRadius: 18,
          border: '1px solid rgba(17,24,39,.06)',
          background: 'rgba(255,255,255,.92)',
          boxShadow: '0 12px 28px rgba(17,24,39,.10), 0 3px 10px rgba(17,24,39,.06)',
          overflow: 'hidden',
        }}
      >
        <div style={{ height: 2, background: 'linear-gradient(90deg,transparent,rgba(26,43,72,.35),transparent)' }} />
        <div style={{ padding: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 26 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logoblue.png" alt="youtask" style={{ height: 40, width: 'auto', objectFit: 'contain' }} />
          </div>
          <Suspense fallback={null}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
