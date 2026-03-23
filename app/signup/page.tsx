'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useEffect, useCallback } from 'react';
import { registerWithEmail } from '@/lib/auth';
import {
  validateUsername,
  validateDisplayName,
  validateEmail,
  validatePasswordMatch,
  validatePassword,
} from './_utils/validation';

/* ─── Styles (same as login) ───────────────────────────────── */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');
  .lp-wrap { font-family: 'DM Sans', sans-serif; }
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
    background: rgba(255,255,255,.05);
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 10px; color: #f5f5f5;
    font-size: 14px; font-family: 'DM Sans', sans-serif;
    outline: none; transition: border-color .15s, background .15s;
    box-sizing: border-box;
  }
  .lp-input::placeholder { color: rgba(255,255,255,.25); }
  .lp-input:focus {
    border-color: rgba(52,211,153,.45);
    background: rgba(52,211,153,.04);
  }
  .lp-input.lp-error {
    border-color: rgba(248,113,113,.45);
    background: rgba(248,113,113,.04);
  }
  .lp-btn {
    width: 100%; padding: 12px; border-radius: 10px; border: none;
    background: #fff; color: #0a0a0a;
    font-size: 14px; font-weight: 600;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer; transition: background .15s, opacity .15s;
  }
  .lp-btn:hover:not(:disabled) { background: #e8e8e8; }
  .lp-btn:disabled { opacity: .45; cursor: not-allowed; }
  .lp-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: #34d399;
    box-shadow: 0 0 0 0 rgba(52,211,153,.4);
    animation: lp-dot-pulse 2s ease-in-out infinite;
  }
  @keyframes lp-dot-pulse {
    0%,100% { box-shadow: 0 0 0 0   rgba(52,211,153,.4); }
    50%      { box-shadow: 0 0 0 6px rgba(52,211,153,0);  }
  }
`;

/* ─── Particle Canvas (same as login) ─────────────────────── */
type PState = 'moving' | 'frozen';
type Particle = {
  x: number; y: number;
  vx: number; vy: number;
  bvx: number; bvy: number;
  r: number; alpha: number;
};

function ParticleCanvas({ pstate }: { pstate: PState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pts       = useRef<Particle[]>([]);
  const raf       = useRef<number>(0);
  const stateRef  = useRef<PState>('moving');

  const seed = useCallback((w: number, h: number) => {
    pts.current = [];
    for (let i = 0; i < 45; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 2.5 + Math.random() * 4.5;
      const bvx   = Math.cos(angle) * spd;
      const bvy   = Math.sin(angle) * spd;
      pts.current.push({
        x: Math.random() * w, y: Math.random() * h,
        vx: bvx, vy: bvy, bvx, bvy,
        r: 4 + Math.random() * 7,
        alpha: 0.35 + Math.random() * 0.45,
      });
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext('2d')!;
    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      seed(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);
    const loop = () => {
      const W = canvas.width, H = canvas.height;
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
        p.x += p.vx; p.y += p.vy;
        if (p.x < -20) p.x = W + 20;
        if (p.x > W+20) p.x = -20;
        if (p.y < -20) p.y = H + 20;
        if (p.y > H+20) p.y = -20;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.5);
        g.addColorStop(0, `rgba(52,211,153,${p.alpha * 0.7})`);
        g.addColorStop(1, `rgba(52,211,153,0)`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(167,243,208,${p.alpha})`; ctx.fill();
      }
      raf.current = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf.current);
    };
  }, [seed]);

  useEffect(() => { stateRef.current = pstate; }, [pstate]);

  return <canvas ref={canvasRef} style={{ position:'fixed', inset:0, zIndex:0, pointerEvents:'none', display:'block' }} />;
}

/* ─── Main Component ───────────────────────────────────────── */
export default function SignUpPage() {
  const router = useRouter();

  const [username,         setUsername]         = useState('');
  const [displayName,      setDisplayName]      = useState('');
  const [email,            setEmail]            = useState('');
  const [password,         setPassword]         = useState('');
  const [confirmPassword,  setConfirmPassword]  = useState('');

  const [usernameError,    setUsernameError]    = useState('');
  const [displayNameError, setDisplayNameError] = useState('');
  const [emailError,       setEmailError]       = useState('');
  const [passwordError,    setPasswordError]    = useState('');

  const [isLoading,   setIsLoading]   = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [pstate,      setPstate]      = useState<PState>('moving');

  /* ── Validation handlers ── */
  const handleUsernameChange = (v: string) => {
    setUsername(v);
    setUsernameError(validateUsername(v).error);
  };
  const handleDisplayNameChange = (v: string) => {
    setDisplayName(v);
    setDisplayNameError(validateDisplayName(v).error);
  };
  const handleEmailChange = (v: string) => {
    setEmail(v);
    setEmailError(validateEmail(v).error);
  };
  const handlePasswordChange = (v: string) => {
    setPassword(v);
    if (confirmPassword.length > 0) {
      setPasswordError(validatePassword(v).error || validatePasswordMatch(v, confirmPassword).error);
    }
  };
  const handleConfirmPasswordChange = (v: string) => {
    setConfirmPassword(v);
    setPasswordError(validatePasswordMatch(password, v).error);
  };

  const isFormValid = () => !!(
    username && displayName && email && password && confirmPassword &&
    !usernameError && !displayNameError && !emailError && !passwordError &&
    password.length >= 6
  );

  /* ── Submit ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setIsLoading(true);
    try {
      await registerWithEmail(email, password);
      const res = await fetch('/api/brevo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_email', email,
          template: 'welcome', displayName, username, data: {},
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) console.warn('Welcome email failed:', out.message);
      router.push('/login');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/email-already-in-use') {
        setEmailError('This email is already registered.');
      } else {
        setSubmitError('Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  /* ── Shared styles ── */
  const label: React.CSSProperties = {
    fontSize: 12, color: 'rgba(255,255,255,.45)',
    fontWeight: 500, display: 'block', marginBottom: 6,
  };
  const errorMsg: React.CSSProperties = {
    fontSize: 12, color: '#fca5a5', marginTop: 5,
  };
  const accentLine: React.CSSProperties = {
    height: 2,
    background: 'linear-gradient(90deg,transparent,rgba(52,211,153,.55),transparent)',
  };

  return (
    <div className="lp-wrap" style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0c0c0c', padding: '24px 20px', position: 'relative', overflow: 'hidden',
    }}>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <ParticleCanvas pstate={pstate} />

      {/* Ambient glow */}
      <div style={{
        position: 'absolute', width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(52,211,153,.05) 0%, transparent 65%)',
        pointerEvents: 'none', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
      }} />

      {/* Card */}
      <div className="lp-card" style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 400,
        borderRadius: 18, border: '1px solid rgba(255,255,255,.1)',
        background: '#111111',
        boxShadow: '0 24px 64px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.06)',
        overflow: 'hidden',
      }}>
        <div style={accentLine} />
        <div style={{ padding: '36px 32px 32px' }}>

          {/* Header */}
          <div className="lp-row-1" style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div className="lp-dot" />
              <span style={{ fontSize: 11, color: 'rgba(52,211,153,.7)', letterSpacing: '0.2em', fontWeight: 600 }}>YOUTASK</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#f5f5f5', letterSpacing: '-.025em', lineHeight: 1.2 }}>Create account</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,.38)', marginTop: 4 }}>Fill in your details to get started</div>
          </div>

          {/* Global error */}
          {submitError && (
            <div className="lp-row-1" style={{
              marginBottom: 16, padding: '10px 14px', borderRadius: 10,
              border: '1px solid rgba(248,113,113,.25)', background: 'rgba(248,113,113,.08)',
              fontSize: 13, color: '#fca5a5',
            }}>{submitError}</div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Username */}
            <div className="lp-row-2">
              <label style={label}>Username</label>
              <input className={`lp-input${usernameError ? ' lp-error' : ''}`}
                type="text" placeholder="usuario123"
                value={username} onChange={e => handleUsernameChange(e.target.value)}
                onFocus={() => setPstate('frozen')} onBlur={() => setPstate('moving')}
                required />
              {usernameError && <div style={errorMsg}>{usernameError}</div>}
            </div>

            {/* Display name */}
            <div className="lp-row-2">
              <label style={label}>Display Name</label>
              <input className={`lp-input${displayNameError ? ' lp-error' : ''}`}
                type="text" placeholder="Juan Pérez"
                value={displayName} onChange={e => handleDisplayNameChange(e.target.value)}
                onFocus={() => setPstate('frozen')} onBlur={() => setPstate('moving')}
                required />
              {displayNameError && <div style={errorMsg}>{displayNameError}</div>}
            </div>

            {/* Email */}
            <div className="lp-row-3">
              <label style={label}>Email</label>
              <input className={`lp-input${emailError ? ' lp-error' : ''}`}
                type="email" placeholder="you@example.com"
                value={email} onChange={e => handleEmailChange(e.target.value)}
                onFocus={() => setPstate('frozen')} onBlur={() => setPstate('moving')}
                required autoComplete="email" />
              {emailError && <div style={errorMsg}>{emailError}</div>}
            </div>

            {/* Password */}
            <div className="lp-row-4">
              <label style={label}>Password</label>
              <input className="lp-input"
                type="password" placeholder="••••••••"
                value={password} onChange={e => handlePasswordChange(e.target.value)}
                onFocus={() => setPstate('frozen')} onBlur={() => setPstate('moving')}
                required minLength={6} autoComplete="new-password" />
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.25)', marginTop: 5 }}>Minimum 6 characters</div>
            </div>

            {/* Confirm password */}
            <div className="lp-row-5">
              <label style={label}>Confirm Password</label>
              <input className={`lp-input${passwordError ? ' lp-error' : ''}`}
                type="password" placeholder="••••••••"
                value={confirmPassword} onChange={e => handleConfirmPasswordChange(e.target.value)}
                onFocus={() => setPstate('frozen')} onBlur={() => setPstate('moving')}
                required autoComplete="new-password" />
              {passwordError && <div style={errorMsg}>{passwordError}</div>}
              {!passwordError && confirmPassword.length > 0 && (
                <div style={{ fontSize: 12, color: 'rgba(52,211,153,.7)', marginTop: 5 }}>✓ Passwords match</div>
              )}
            </div>

            {/* Submit */}
            <div className="lp-row-6" style={{ marginTop: 6 }}>
              <button type="submit" className="lp-btn" disabled={!isFormValid() || isLoading}>
                {isLoading ? 'Creating account…' : 'Create account'}
              </button>
            </div>
          </form>

          <div className="lp-row-6" style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,.3)' }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: 'rgba(52,211,153,.8)', textDecoration: 'none', fontWeight: 500 }}>Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}