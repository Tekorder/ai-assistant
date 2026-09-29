'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { registerWithEmail } from '@/lib/auth';
import {
  validateFirstName,
  validateLastName,
  validateEmail,
  validatePasswordMatch,
  validatePassword,
} from './_utils/validation';

/* ─── Styles ─────────────────────────────────────────────── */
/* Matches the login page (app/login/page.tsx). */
const STYLES = `
  .lp-wrap { font-family: var(--font-thicccboi), sans-serif; color: #1a2b48; }
  @keyframes lp-in {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  .lp-card  { animation: lp-in .35s cubic-bezier(.25,.9,.3,1) both; }
  .lp-row-1 { animation: lp-in .35s .08s cubic-bezier(.25,.9,.3,1) both; }
  .lp-row-2 { animation: lp-in .35s .14s cubic-bezier(.25,.9,.3,1) both; }
  .lp-row-3 { animation: lp-in .35s .20s cubic-bezier(.25,.9,.3,1) both; }
  .lp-row-4 { animation: lp-in .35s .26s cubic-bezier(.25,.9,.3,1) both; }
  .lp-row-5 { animation: lp-in .35s .32s cubic-bezier(.25,.9,.3,1) both; }
  .lp-row-6 { animation: lp-in .35s .38s cubic-bezier(.25,.9,.3,1) both; }
  .lp-input {
    width: 100%; padding: 11px 14px;
    background: rgba(0,0,0,.04);
    border: 1px solid rgba(0,0,0,.08);
    border-radius: 10px; color: #1a2b48;
    font-size: 15px; font-family: inherit;
    outline: none; transition: border-color .15s, background .15s;
    box-sizing: border-box;
  }
  .lp-input:hover { background: rgba(0,0,0,.05); }
  .lp-input::placeholder { color: rgba(0,0,0,.30); }
  .lp-input:focus {
    border-color: color-mix(in srgb, #1a2b48 45%, transparent);
    background: #ffffff;
  }
  .lp-input.lp-error {
    border-color: rgba(248,113,113,.45);
    background: rgba(248,113,113,.04);
  }
  .lp-btn {
    width: 100%; padding: 12px; border-radius: 10px; border: none;
    background: #18315c; color: #ffffff;
    font-size: 15px; font-weight: 600;
    font-family: inherit;
    cursor: pointer; transition: background .15s, opacity .15s, box-shadow .15s;
    box-shadow: 0 6px 18px rgba(24,49,92,.22);
  }
  .lp-btn:hover:not(:disabled) { background: #1a2b48; box-shadow: 0 8px 24px rgba(24,49,92,.30); }
  .lp-btn:disabled { opacity: .45; cursor: not-allowed; }
`;

/* ─── Particle Canvas ────────────────────────────────────── */
type PState = 'moving' | 'frozen';
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bvx: number;
  bvy: number;
  r: number;
  alpha: number;
};

function ParticleCanvas({ pstate }: { pstate: PState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pts = useRef<Particle[]>([]);
  const raf = useRef<number>(0);
  const stateRef = useRef<PState>('moving');

  const seed = useCallback((w: number, h: number) => {
    pts.current = [];
    for (let i = 0; i < 45; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 2.5 + Math.random() * 4.5;
      const bvx = Math.cos(angle) * spd;
      const bvy = Math.sin(angle) * spd;
      pts.current.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: bvx,
        vy: bvy,
        bvx,
        bvy,
        r: 4 + Math.random() * 7,
        alpha: 0.35 + Math.random() * 0.45,
      });
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      seed(canvas.width, canvas.height);
    };

    resize();
    window.addEventListener('resize', resize);

    const loop = () => {
      const W = canvas.width;
      const H = canvas.height;
      const st = stateRef.current;

      ctx.clearRect(0, 0, W, H);

      for (const p of pts.current) {
        if (st === 'moving') {
          p.vx += (p.bvx - p.vx) * 0.04;
          p.vy += (p.bvy - p.vy) * 0.04;
        } else {
          p.vx += (p.bvx * 0.05 - p.vx) * 0.06;
          p.vy += (p.bvy * 0.05 - p.vy) * 0.06;
        }

        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -20) p.x = W + 20;
        if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20;
        if (p.y > H + 20) p.y = -20;

        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.5);
        g.addColorStop(0, `rgba(158,185,216,${p.alpha * 0.55})`);
        g.addColorStop(1, `rgba(158,185,216,0)`);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(26,43,72,${p.alpha * 0.28})`;
        ctx.fill();
      }

      raf.current = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf.current);
    };
  }, [seed]);

  useEffect(() => {
    stateRef.current = pstate;
  }, [pstate]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        display: 'block',
      }}
    />
  );
}

/* ─── Main Component ─────────────────────────────────────── */
export default function SignUpPage() {
  const router = useRouter();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [firstNameError, setFirstNameError] = useState('');
  const [lastNameError, setLastNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [pstate, setPstate] = useState<PState>('moving');

  const handleFirstNameChange = (v: string) => {
    setFirstName(v);
    setFirstNameError(validateFirstName(v.trim()).error);
  };

  const handleLastNameChange = (v: string) => {
    setLastName(v);
    setLastNameError(validateLastName(v.trim()).error);
  };

  const handleEmailChange = (v: string) => {
    setEmail(v);
    setEmailError(validateEmail(v).error);
  };

  const handlePasswordChange = (v: string) => {
    setPassword(v);
    if (confirmPassword.length > 0) {
      setPasswordError(
        validatePassword(v).error || validatePasswordMatch(v, confirmPassword).error
      );
    } else {
      setPasswordError(validatePassword(v).error);
    }
  };

  const handleConfirmPasswordChange = (v: string) => {
    setConfirmPassword(v);
    setPasswordError(validatePasswordMatch(password, v).error);
  };

  const isFormValid = () =>
    !!(
      firstName.trim() &&
      lastName.trim() &&
      email &&
      password &&
      confirmPassword &&
      !firstNameError &&
      !lastNameError &&
      !emailError &&
      !passwordError &&
      password.length >= 6
    );

  async function syncPrismaUser(payload: {
    email: string;
    name: string;
    firebaseUid: string;
    avatarUrl?: string | null;
  }) {
    const res = await fetch('/api/auth/upsert-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json?.ok || !json?.user?.id) {
      throw new Error(json?.message || 'Failed to create user in database.');
    }

    return json.user;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSubmitError('');
    setIsLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = `${firstName.trim()} ${lastName.trim()}`;

      const cred = await registerWithEmail(cleanEmail, password);

      await syncPrismaUser({
        email: cleanEmail,
        name: cleanName,
        firebaseUid: cred.user.uid,
        avatarUrl: cred.user.photoURL || null,
      });

      const res = await fetch('/api/brevo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_email',
          email: cleanEmail,
          template: 'welcome',
          displayName: cleanName,
          data: {},
        }),
      });

      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) {
        console.warn('Welcome email failed:', out.message);
      }

      router.push('/login');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      const message = err instanceof Error ? err.message : '';

      if (code === 'auth/email-already-in-use') {
        setEmailError('This email is already registered.');
      } else if (
        message.toLowerCase().includes('email') &&
        message.toLowerCase().includes('registered')
      ) {
        setEmailError('This email is already registered.');
      } else {
        setSubmitError('Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const label: React.CSSProperties = {
    fontSize: 13,
    color: 'rgba(0,0,0,.45)',
    fontWeight: 500,
    display: 'block',
    marginBottom: 6,
  };

  const errorMsg: React.CSSProperties = {
    fontSize: 13,
    color: '#be123c',
    marginTop: 5,
  };

  const accentLine: React.CSSProperties = {
    height: 2,
    background:
      'linear-gradient(90deg,transparent,rgba(26,43,72,.35),transparent)',
  };

  return (
    <div
      className="lp-wrap"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(145deg, #f8fafc 0%, #f1f5fa 22%, #e4eef7 48%, #d0e2f2 72%, #b8d2eb 100%)',
        padding: '24px 20px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <ParticleCanvas pstate={pstate} />

      <div
        style={{
          position: 'absolute',
          width: 640,
          height: 640,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(255,255,255,.55) 0%, transparent 62%)',
          pointerEvents: 'none',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          zIndex: 1,
        }}
      />

      <div
        className="lp-card"
        style={{
          position: 'relative',
          zIndex: 2,
          width: '100%',
          maxWidth: 400,
          borderRadius: 18,
          border: '1px solid rgba(17,24,39,.06)',
          background: 'rgba(255,255,255,.92)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          boxShadow:
            '0 12px 28px rgba(17,24,39,.10), 0 3px 10px rgba(17,24,39,.06), inset 0 1px 0 rgba(255,255,255,.5)',
          overflow: 'hidden',
        }}
      >
        <div style={accentLine} />
        <div style={{ padding: '32px 32px 32px' }}>
          <div
            className="lp-row-1"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              marginBottom: 22,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logoblue.png"
              alt="youtask"
              style={{
                height: 40,
                width: 'auto',
                objectFit: 'contain',
              }}
            />
          </div>

          <div className="lp-row-1" style={{ marginBottom: 22 }}>
            <div
              style={{
                fontSize: 21,
                fontWeight: 600,
                color: '#1a2b48',
                letterSpacing: '-.025em',
                lineHeight: 1.2,
                textAlign: 'center',
              }}
            >
              Create account
            </div>

            <div
              style={{
                fontSize: 14,
                color: 'rgba(0,0,0,.50)',
                marginTop: 6,
                textAlign: 'center',
              }}
            >
              Fill in your details to get started
            </div>
          </div>

          {submitError && (
            <div
              className="lp-row-1"
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid rgba(248,113,113,.25)',
                background: 'rgba(248,113,113,.08)',
                fontSize: 14,
                color: '#be123c',
              }}
            >
              {submitError}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <div className="lp-row-2" style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={label}>First name</label>
                <input
                  className={`lp-input${firstNameError ? ' lp-error' : ''}`}
                  type="text"
                  placeholder="John"
                  value={firstName}
                  onChange={(e) => handleFirstNameChange(e.target.value)}
                  onFocus={() => setPstate('frozen')}
                  onBlur={() => setPstate('moving')}
                  required
                  autoComplete="given-name"
                />
                {firstNameError && <div style={errorMsg}>{firstNameError}</div>}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={label}>Last name</label>
                <input
                  className={`lp-input${lastNameError ? ' lp-error' : ''}`}
                  type="text"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => handleLastNameChange(e.target.value)}
                  onFocus={() => setPstate('frozen')}
                  onBlur={() => setPstate('moving')}
                  required
                  autoComplete="family-name"
                />
                {lastNameError && <div style={errorMsg}>{lastNameError}</div>}
              </div>
            </div>

            <div className="lp-row-3">
              <label style={label}>Email</label>
              <input
                className={`lp-input${emailError ? ' lp-error' : ''}`}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                onFocus={() => setPstate('frozen')}
                onBlur={() => setPstate('moving')}
                required
                autoComplete="email"
              />
              {emailError && <div style={errorMsg}>{emailError}</div>}
            </div>

            <div className="lp-row-4">
              <label style={label}>Password</label>
              <input
                className={`lp-input${passwordError ? ' lp-error' : ''}`}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => handlePasswordChange(e.target.value)}
                onFocus={() => setPstate('frozen')}
                onBlur={() => setPstate('moving')}
                required
                minLength={6}
                autoComplete="new-password"
              />
              <div
                style={{
                  fontSize: 13,
                  color: 'rgba(0,0,0,.35)',
                  marginTop: 5,
                }}
              >
                Minimum 6 characters
              </div>
            </div>

            <div className="lp-row-5">
              <label style={label}>Confirm Password</label>
              <input
                className={`lp-input${passwordError ? ' lp-error' : ''}`}
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => handleConfirmPasswordChange(e.target.value)}
                onFocus={() => setPstate('frozen')}
                onBlur={() => setPstate('moving')}
                required
                autoComplete="new-password"
              />
              {passwordError && <div style={errorMsg}>{passwordError}</div>}
              {!passwordError && confirmPassword.length > 0 && (
                <div
                  style={{
                    fontSize: 13,
                    color: '#15803d',
                    marginTop: 5,
                  }}
                >
                  ✓ Passwords match
                </div>
              )}
            </div>

            <div className="lp-row-6" style={{ marginTop: 6 }}>
              <button
                type="submit"
                className="lp-btn"
                disabled={!isFormValid() || isLoading}
              >
                {isLoading ? 'Creating account…' : 'Create account'}
              </button>
            </div>
          </form>

          <div
            className="lp-row-6"
            style={{
              marginTop: 24,
              textAlign: 'center',
              fontSize: 14,
              color: 'rgba(0,0,0,.45)',
            }}
          >
            Already have an account?{' '}
            <Link
              href="/login"
              style={{
                color: '#1a2b48',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}