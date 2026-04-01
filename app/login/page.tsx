'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  loginWithEmail,
  sendFirebaseReset,
  signInWithGoogle,
} from '@/lib/auth';

/* ─── 2FA Helpers ─────────────────────────────────────────── */
function gen2FACode(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
}
function genSalt(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
type TwoFAStored = { salt: string; hash: string; exp: number };
const TWOFA_KEY = 'youtask_2fa';

/* ─── Styles ───────────────────────────────────────────────── */
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
  .lp-input {
    width: 100%; padding: 11px 14px;
    background: rgba(255,255,255,.05);
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 10px; color: #f5f5f5;
    font-size: 14px; font-family: 'DM Sans', sans-serif;
    outline: none; transition: border-color .15s, background .15s;
  }
  .lp-input::placeholder { color: rgba(255,255,255,.25); }
  .lp-input:focus {
    border-color: rgba(213,252,67,.5);
    background: rgba(213,252,67,.06);
  }
  .lp-btn {
    width: 100%; padding: 12px; border-radius: 10px; border: none;
    background: #d5fc43; color: #0a0a0a;
    font-size: 14px; font-weight: 600;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer; transition: background .15s, opacity .15s, box-shadow .15s;
    box-shadow: 0 0 24px rgba(213,252,67,.25);
  }
  .lp-btn:hover:not(:disabled) { background: #c8f030; box-shadow: 0 0 32px rgba(213,252,67,.35); }
  .lp-btn:disabled { opacity: .45; cursor: not-allowed; }
  @keyframes lp-shake {
    0%,100% { transform: translateX(0);    }
    15%      { transform: translateX(-5px); }
    30%      { transform: translateX(4px);  }
    45%      { transform: translateX(-3px); }
    60%      { transform: translateX(3px);  }
    75%      { transform: translateX(-2px); }
    90%      { transform: translateX(1px);  }
  }
  .lp-shake { animation: lp-shake .45s cubic-bezier(.25,.9,.3,1); }
  .lp-google-btn {
    width: 100%; padding: 11px; border-radius: 10px;
    border: 1px solid rgba(255,255,255,.12);
    background: rgba(255,255,255,.04);
    color: #f5f5f5; font-size: 14px; font-weight: 500;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer; display: flex; align-items: center;
    justify-content: center; gap: 10;
    transition: background .15s, border-color .15s;
  }
  .lp-google-btn:hover:not(:disabled) {
    background: rgba(255,255,255,.08);
    border-color: rgba(255,255,255,.22);
  }
  .lp-google-btn:disabled { opacity: .45; cursor: not-allowed; }
  .lp-wordmark-wrap {
    display: flex;
    justify-content: center;
    margin: 4px 0 22px;
  }
  .lp-wordmark {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.38em;
    padding-left: 0.38em;
    text-transform: uppercase;
    color: #d5fc43;
    line-height: 1.3;
    text-shadow:
      0 0 16px rgba(213,252,67,.55),
      0 0 36px rgba(213,252,67,.3),
      0 0 2px rgba(255,255,255,.2);
    animation: lp-wordmark-pulse 3.2s ease-in-out infinite;
  }
  @keyframes lp-wordmark-pulse {
    0%, 100% { opacity: 1; filter: brightness(1); }
    50% { opacity: 0.92; filter: brightness(1.12); }
  }
`;

/* ─── Particle System ───────────────────────────────────────── */
type PState = 'moving' | 'frozen' | 'shaking' | 'exploding';
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bvx: number;
  bvy: number;
  r: number;
  alpha: number;
  decay: number;
  burst: boolean;
};

function ParticleCanvas({ pstate }: { pstate: PState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pts = useRef<Particle[]>([]);
  const raf = useRef<number>(0);
  const stateRef = useRef<PState>('moving');
  const shakePhase = useRef(0);

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
        decay: 0,
        burst: false,
      });
    }
  }, []);

  const explode = useCallback((w: number, h: number) => {
    const cx = w / 2,
      cy = h / 2;
    for (let i = 0; i < 80; i++) {
      const angle = (Math.PI * 2 * i) / 80 + Math.random() * 0.15;
      const spd = 5 + Math.random() * 18;
      pts.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        bvx: 0,
        bvy: 0,
        r: 3 + Math.random() * 9,
        alpha: 1,
        decay: 0.008 + Math.random() * 0.014,
        burst: true,
      });
    }
    for (let i = 0; i < 50; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 10;
      pts.current.push({
        x: cx + (Math.random() - 0.5) * 300,
        y: cy + (Math.random() - 0.5) * 300,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        bvx: 0,
        bvy: 0,
        r: 2 + Math.random() * 6,
        alpha: 0.9,
        decay: 0.012 + Math.random() * 0.018,
        burst: true,
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
      const W = canvas.width,
        H = canvas.height;
      const st = stateRef.current;
      let sx = 0,
        sy = 0;

      if (st === 'shaking') {
        shakePhase.current += 0.3;
        sx = Math.sin(shakePhase.current * 2.4) * 1.8;
        sy = Math.cos(shakePhase.current * 1.9) * 1.2;
      } else {
        shakePhase.current = 0;
      }

      ctx.save();
      ctx.clearRect(0, 0, W, H);
      ctx.translate(sx, sy);

      pts.current = pts.current.filter((p) => (p.burst ? p.alpha > 0.01 : true));

      for (const p of pts.current) {
        if (p.burst) {
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.95;
          p.vy *= 0.95;
          p.alpha -= p.decay;
        } else {
          if (st === 'moving') {
            p.vx += (p.bvx - p.vx) * 0.04;
            p.vy += (p.bvy - p.vy) * 0.04;
          } else if (st === 'frozen') {
            p.vx += (p.bvx * 0.05 - p.vx) * 0.06;
            p.vy += (p.bvy * 0.05 - p.vy) * 0.06;
          } else if (st === 'shaking') {
            p.vx = (Math.random() - 0.5) * 0.5;
            p.vy = (Math.random() - 0.5) * 0.5;
          } else if (st === 'exploding') {
            const dx = p.x - W / 2,
              dy = p.y - H / 2;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            p.vx += (dx / d) * 2.5;
            p.vy += (dy / d) * 2.5;
            p.alpha = Math.max(0.01, p.alpha - 0.02);
          }

          p.x += p.vx;
          p.y += p.vy;
          if (p.x < -20) p.x = W + 20;
          if (p.x > W + 20) p.x = -20;
          if (p.y < -20) p.y = H + 20;
          if (p.y > H + 20) p.y = -20;
        }

        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.5);
        g.addColorStop(0, `rgba(213,252,67,${p.alpha * 0.72})`);
        g.addColorStop(1, `rgba(213,252,67,0)`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(240,255,180,${p.alpha})`;
        ctx.fill();
      }

      ctx.restore();
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
    if (pstate === 'exploding') {
      const c = canvasRef.current;
      if (c) explode(c.width, c.height);
    }
  }, [pstate, explode]);

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

/* ─── Main Component ───────────────────────────────────────── */
export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [pstate, setPstate] = useState<PState>('moving');

  const [show2FA, setShow2FA] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [twoFAError, setTwoFAError] = useState('');
  const [sending2FA, setSending2FA] = useState(false);
  const [verifying2FA, setVerifying2FA] = useState(false);
  const [pendingUID, setPendingUID] = useState('');
  const [pendingFirebaseUser, setPendingFirebaseUser] = useState<{
    email: string;
    name: string | null;
    avatarUrl: string | null;
    firebaseUid: string;
  } | null>(null);

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const maskedEmail = useMemo(() => {
    const [u, d] = email.split('@');
    if (!u || !d) return email;
    return `${u.slice(0, 2)}${'*'.repeat(Math.max(1, u.length - 3))}${u.slice(-1)}@${d}`;
  }, [email]);

  function read2FA(): TwoFAStored | null {
    try {
      const r = sessionStorage.getItem(TWOFA_KEY);
      return r ? JSON.parse(r) : null;
    } catch {
      return null;
    }
  }

  function clear2FA() {
    sessionStorage.removeItem(TWOFA_KEY);
  }

  async function upsertPrismaUser(payload: {
    email: string;
    name?: string | null;
    avatarUrl?: string | null;
    firebaseUid?: string;
  }) {
    const res = await fetch('/api/auth/upsert-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json?.ok || !json?.user?.id) {
      throw new Error(json?.message || 'Failed to sync user with database.');
    }

    localStorage.setItem('prisma_user_id', json.user.id);
    localStorage.setItem('prisma_user_email', json.user.email ?? payload.email);
    if (json.user.name) localStorage.setItem('prisma_user_name', json.user.name);
    if (json.user.avatarUrl) localStorage.setItem('prisma_user_avatar', json.user.avatarUrl);

    return json.user as {
      id: string;
      email: string;
      name: string | null;
      username: string | null;
      avatarUrl: string | null;
      timezone: string;
      selectedProjectLocalId: string | null;
    };
  }

  async function createAndSend2FA(targetEmail: string) {
    setSending2FA(true);
    setTwoFAError('');
    try {
      const code = gen2FACode();
      const salt = genSalt(16);
      const exp = Date.now() + 5 * 60 * 1000;
      const hash = await sha256Hex(`${code}:${salt}`);

      sessionStorage.setItem(TWOFA_KEY, JSON.stringify({ salt, hash, exp }));

      const res = await fetch('/api/brevo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_email',
          email: targetEmail,
          template: 'twofa',
          data: { code, expiresMinutes: 5 },
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        throw new Error(j?.message || 'Failed to send 2FA email');
      }
    } finally {
      setSending2FA(false);
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setTwoFAError('');
    setCodeInput('');
    clear2FA();

    setLoading(true);
    try {
      const cred = await loginWithEmail(email, password);

      const firebaseEmail = cred.user.email?.trim().toLowerCase() || email.trim().toLowerCase();
      const firebaseName = cred.user.displayName || null;
      const firebaseAvatar = cred.user.photoURL || null;
      const firebaseUid = cred.user.uid;

      setPendingUID(firebaseUid);
      setPendingFirebaseUser({
        email: firebaseEmail,
        name: firebaseName,
        avatarUrl: firebaseAvatar,
        firebaseUid,
      });

      setPstate('exploding');
      await createAndSend2FA(firebaseEmail);
      setShow2FA(true);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential'
      ) {
        setLoginError('Invalid email or password.');
      } else {
        setLoginError('Connection error. Please try again.');
      }
      setPstate('moving');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoginError('');
    setLoading(true);

    try {
      const cred = await signInWithGoogle();

      const firebaseEmail = cred.user.email?.trim().toLowerCase();
      if (!firebaseEmail) {
        throw new Error('Google account did not return an email.');
      }

      await upsertPrismaUser({
        email: firebaseEmail,
        name: cred.user.displayName || null,
        avatarUrl: cred.user.photoURL || null,
        firebaseUid: cred.user.uid,
      });

      sessionStorage.setItem('twofa_ok', '1');
      router.replace('/assistant');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      ) {
        return;
      }
      setLoginError(
        err instanceof Error
          ? err.message
          : 'Google sign-in failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const verify2FA = async () => {
    setVerifying2FA(true);
    setTwoFAError('');

    try {
      const stored = read2FA();

      if (!stored) {
        setTwoFAError('No active code. Please resend.');
        return;
      }

      if (Date.now() > stored.exp) {
        setTwoFAError('Code expired. Please resend.');
        clear2FA();
        return;
      }

      const clean = codeInput.trim();
      if (clean.length !== 6) {
        setTwoFAError('Enter all 6 digits.');
        return;
      }

      const computed = await sha256Hex(`${clean}:${stored.salt}`);
      if (computed !== stored.hash) {
        setTwoFAError('Invalid code.');
        return;
      }

      clear2FA();
      setShow2FA(false);

      if (!pendingUID || !pendingFirebaseUser?.email) {
        setLoginError('Session lost. Please log in again.');
        return;
      }

      await upsertPrismaUser({
        email: pendingFirebaseUser.email,
        name: pendingFirebaseUser.name,
        avatarUrl: pendingFirebaseUser.avatarUrl,
        firebaseUid: pendingFirebaseUser.firebaseUid,
      });

      sessionStorage.setItem('twofa_ok', '1');
      localStorage.setItem('firebase_uid', pendingUID);

      router.replace('/assistant');
    } catch (err) {
      setTwoFAError(
        err instanceof Error ? err.message : 'Could not verify login.'
      );
    } finally {
      setVerifying2FA(false);
    }
  };

  const resend2FA = async () => {
    setTwoFAError('');
    setCodeInput('');
    try {
      await createAndSend2FA(email);
    } catch (e) {
      setTwoFAError(e instanceof Error ? e.message : 'Failed to resend.');
    }
  };

  const handleForgotSubmit = async () => {
    setForgotError('');
    setForgotLoading(true);
    try {
      await sendFirebaseReset(forgotEmail);
      setForgotSuccess(true);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'auth/user-not-found') {
        setForgotError('No account found with that email.');
      } else {
        setForgotError(e instanceof Error ? e.message : 'Something went wrong.');
      }
    } finally {
      setForgotLoading(false);
    }
  };

  const openForgot = () => {
    setForgotEmail(email);
    setForgotError('');
    setForgotSuccess(false);
    setShowForgot(true);
  };

  const closeForgot = () => {
    setShowForgot(false);
    setForgotSuccess(false);
    setForgotError('');
  };

  const modalOverlay: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    background: 'rgba(0,0,0,.75)',
    backdropFilter: 'blur(10px)',
  };

  const modalCard: React.CSSProperties = {
    width: '100%',
    maxWidth: 400,
    borderRadius: 18,
    border: '1px solid rgba(255,255,255,.12)',
    background: 'rgba(12,12,12,.88)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    boxShadow:
      '0 32px 80px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.06)',
    overflow: 'hidden',
  };

  const accentLine: React.CSSProperties = {
    height: 2,
    background:
      'linear-gradient(90deg,transparent,rgba(213,252,67,.55),transparent)',
  };

  return (
    <div
      className="lp-wrap"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000000',
        padding: 20,
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
            'radial-gradient(circle, rgba(213,252,67,.07) 0%, transparent 62%)',
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
          border: '1px solid rgba(255,255,255,.12)',
          background: 'rgba(12,12,12,.78)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          boxShadow:
            '0 24px 64px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.06)',
          overflow: 'hidden',
        }}
      >
        <div style={accentLine} />
        <div style={{ padding: '4px 32px 32px' }}>
          <div className="lp-row-1" style={{ marginBottom: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt=""
                style={{
                  width: 'min(34%, 320px)',
                  height: 'auto',
                  objectFit: 'contain',
                }}
              />
            </div>
          </div>

          <div className="lp-wordmark-wrap">
            <p className="lp-wordmark">Utask</p>
          </div>

          {loginError && (
            <div
              className="lp-row-1"
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid rgba(248,113,113,.25)',
                background: 'rgba(248,113,113,.08)',
                fontSize: 13,
                color: '#fca5a5',
              }}
            >
              {loginError}
            </div>
          )}

          <form
            onSubmit={handleLogin}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <div className="lp-row-2">
              <label
                style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,.45)',
                  fontWeight: 500,
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                Email
              </label>
              <input
                type="text"
                className="lp-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setPstate('frozen')}
                onBlur={() => setPstate('moving')}
                required
                autoComplete="email"
              />
            </div>

            <div className="lp-row-3">
              <label
                style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,.45)',
                  fontWeight: 500,
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                Password
              </label>
              <input
                type="password"
                className="lp-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setPstate('shaking')}
                onBlur={() => setPstate('moving')}
                required
                autoComplete="current-password"
              />
              <div style={{ textAlign: 'right', marginTop: 6 }}>
                <button
                  type="button"
                  onClick={openForgot}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: 12,
                    color: 'rgba(213,252,67,.85)',
                    cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Forgot password?
                </button>
              </div>
            </div>

            <div
              className="lp-row-4"
              style={{
                marginTop: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <button
                type="submit"
                className="lp-btn"
                disabled={loading || sending2FA}
              >
                {loading ? 'Signing in…' : 'Continue'}
              </button>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  margin: '2px 0',
                }}
              >
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: 'rgba(255,255,255,.08)',
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    color: 'rgba(255,255,255,.22)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  or
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: 'rgba(255,255,255,.08)',
                  }}
                />
              </div>

              <button
                type="button"
                className="lp-google-btn"
                onClick={handleGoogleLogin}
                disabled={loading || sending2FA}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 48 48"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fill="#FFC107"
                    d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.5 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"
                  />
                  <path
                    fill="#FF3D00"
                    d="M6.3 14.7l6.6 4.8C14.5 16.1 19 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.5 29.6 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"
                  />
                  <path
                    fill="#4CAF50"
                    d="M24 44c5.4 0 10.3-2 14-5.2l-6.5-5.5C29.5 35 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-8H6.1C9.4 35.6 16.2 44 24 44z"
                  />
                  <path
                    fill="#1976D2"
                    d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.8l6.5 5.5C41.4 36.3 44 30.6 44 24c0-1.2-.1-2.4-.4-3.5z"
                  />
                </svg>
                Continue with Google
              </button>
            </div>
          </form>

          <div
            className="lp-row-4"
            style={{
              marginTop: 24,
              textAlign: 'center',
              fontSize: 13,
              color: 'rgba(255,255,255,.3)',
            }}
          >
            No account?{' '}
            <Link
              href="/signup"
              style={{
                color: 'rgba(213,252,67,.88)',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              Sign up
            </Link>
          </div>
        </div>
      </div>

      {show2FA && (
        <div style={modalOverlay}>
          <div className="lp-card" style={modalCard}>
            <div style={accentLine} />
            <div style={{ padding: '32px 32px 28px' }}>
              <div
                className="lp-row-1"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  marginBottom: 24,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 600,
                      color: '#f5f5f5',
                      letterSpacing: '-.02em',
                      marginBottom: 4,
                    }}
                  >
                    Check your email
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'rgba(255,255,255,.38)',
                      lineHeight: 1.5,
                    }}
                  >
                    We sent a code to{' '}
                    <span style={{ color: 'rgba(255,255,255,.75)' }}>
                      {maskedEmail}
                    </span>
                  </div>
                </div>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    flexShrink: 0,
                    border: '1px solid rgba(255,255,255,.1)',
                    background: 'rgba(213,252,67,.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                  }}
                >
                  🔐
                </div>
              </div>

              {twoFAError && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid rgba(248,113,113,.25)',
                    background: 'rgba(248,113,113,.08)',
                    fontSize: 13,
                    color: '#fca5a5',
                  }}
                >
                  {twoFAError}
                </div>
              )}

              <div className="lp-row-2" style={{ marginBottom: 20 }}>
                <label
                  style={{
                    fontSize: 12,
                    color: 'rgba(255,255,255,.45)',
                    fontWeight: 500,
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  6-digit code
                </label>
                <input
                  className="lp-input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={codeInput}
                  onChange={(e) =>
                    setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  style={{
                    textAlign: 'center',
                    letterSpacing: '0.45em',
                    fontSize: 20,
                    fontWeight: 600,
                  }}
                  placeholder="· · · · · ·"
                  autoFocus
                />
                <div
                  style={{
                    fontSize: 12,
                    color: 'rgba(255,255,255,.25)',
                    marginTop: 8,
                  }}
                >
                  Expires in 5 min · check spam if needed
                </div>
              </div>

              <div className="lp-row-3" style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="lp-btn"
                  disabled={verifying2FA || sending2FA}
                  onClick={verify2FA}
                >
                  {verifying2FA ? 'Verifying…' : 'Verify'}
                </button>
                <button
                  type="button"
                  disabled={sending2FA || verifying2FA}
                  onClick={resend2FA}
                  style={{
                    padding: '12px 18px',
                    borderRadius: 10,
                    flexShrink: 0,
                    border: '1px solid rgba(255,255,255,.1)',
                    background: 'transparent',
                    color: 'rgba(255,255,255,.5)',
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: "'DM Sans',sans-serif",
                    cursor: 'pointer',
                    transition: 'all .15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,.06)';
                    e.currentTarget.style.color = 'rgba(255,255,255,.85)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'rgba(255,255,255,.5)';
                  }}
                >
                  {sending2FA ? 'Sending…' : 'Resend'}
                </button>
              </div>

              <div
                className="lp-row-4"
                style={{
                  marginTop: 16,
                  textAlign: 'center',
                  fontSize: 12,
                  color: 'rgba(255,255,255,.22)',
                }}
              >
                Tip: paste the code and you re done 😄
              </div>
            </div>
          </div>
        </div>
      )}

      {showForgot && (
        <div style={modalOverlay}>
          <div className="lp-card" style={modalCard}>
            <div style={accentLine} />
            <div style={{ padding: '32px 32px 28px' }}>
              <div
                className="lp-row-1"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  marginBottom: 24,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 600,
                      color: '#f5f5f5',
                      letterSpacing: '-.02em',
                      marginBottom: 4,
                    }}
                  >
                    Reset password
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'rgba(255,255,255,.38)',
                      lineHeight: 1.5,
                    }}
                  >
                    {forgotSuccess
                      ? 'Check your inbox for next steps.'
                      : "We'll send a recovery link to your email."}
                  </div>
                </div>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    flexShrink: 0,
                    border: '1px solid rgba(255,255,255,.1)',
                    background: 'rgba(213,252,67,.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                  }}
                >
                  🔑
                </div>
              </div>

              {forgotError && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid rgba(248,113,113,.25)',
                    background: 'rgba(248,113,113,.08)',
                    fontSize: 13,
                    color: '#fca5a5',
                  }}
                >
                  {forgotError}
                </div>
              )}

              {forgotSuccess ? (
                <>
                  <div
                    style={{
                      padding: '14px',
                      borderRadius: 10,
                      border: '1px solid rgba(213,252,67,.28)',
                      background: 'rgba(213,252,67,.1)',
                      fontSize: 13,
                      color: 'rgba(213,252,67,.95)',
                      marginBottom: 20,
                    }}
                  >
                    ✓ Recovery email sent to <strong>{forgotEmail}</strong>
                  </div>
                  <button type="button" className="lp-btn" onClick={closeForgot}>
                    Back to login
                  </button>
                </>
              ) : (
                <>
                  <div className="lp-row-2" style={{ marginBottom: 20 }}>
                    <label
                      style={{
                        fontSize: 12,
                        color: 'rgba(255,255,255,.45)',
                        fontWeight: 500,
                        display: 'block',
                        marginBottom: 6,
                      }}
                    >
                      Email
                    </label>
                    <input
                      type="email"
                      className="lp-input"
                      placeholder="you@example.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="lp-row-3" style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="lp-btn"
                      disabled={forgotLoading || !forgotEmail}
                      onClick={handleForgotSubmit}
                    >
                      {forgotLoading ? 'Sending…' : 'Send recovery email'}
                    </button>
                    <button
                      type="button"
                      onClick={closeForgot}
                      style={{
                        padding: '12px 18px',
                        borderRadius: 10,
                        flexShrink: 0,
                        border: '1px solid rgba(255,255,255,.1)',
                        background: 'transparent',
                        color: 'rgba(255,255,255,.5)',
                        fontSize: 13,
                        fontWeight: 500,
                        fontFamily: "'DM Sans',sans-serif",
                        cursor: 'pointer',
                        transition: 'all .15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,.06)';
                        e.currentTarget.style.color = 'rgba(255,255,255,.85)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'rgba(255,255,255,.5)';
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}