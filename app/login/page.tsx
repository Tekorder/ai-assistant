'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PlayFab, PlayFabClient } from 'playfab-sdk';

if (!process.env.NEXT_PUBLIC_PLAYFAB_TITLE_ID) {
  throw new Error('NEXT_PUBLIC_PLAYFAB_TITLE_ID is not defined');
}
PlayFab.settings.titleId = process.env.NEXT_PUBLIC_PLAYFAB_TITLE_ID;

/* ─── 2FA Helpers (unchanged) ─────────────────────────────── */
function gen2FACode(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
}
function genSalt(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
type TwoFAStored = { salt: string; hash: string; exp: number };
const TWOFA_KEY = 'youtask_2fa';

type PlayFabLoginResult = { data?: { SessionTicket?: string } };
function playfabLogin(email: string, password: string): Promise<PlayFabLoginResult> {
  return new Promise((resolve, reject) => {
    PlayFabClient.LoginWithEmailAddress(
      { TitleId: PlayFab.settings.titleId, Email: email, Password: password },
      (error, result) => { if (error) return reject(error); return resolve(result as PlayFabLoginResult); }
    );
  });
}

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
    border-radius: 10px;
    color: #f5f5f5;
    font-size: 14px;
    font-family: 'DM Sans', sans-serif;
    outline: none;
    transition: border-color .15s, background .15s;
  }
  .lp-input::placeholder { color: rgba(255,255,255,.25); }
  .lp-input:focus {
    border-color: rgba(52,211,153,.45);
    background: rgba(52,211,153,.04);
  }

  .lp-btn {
    width: 100%; padding: 12px;
    border-radius: 10px; border: none;
    background: #fff; color: #0a0a0a;
    font-size: 14px; font-weight: 600;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer; transition: background .15s, opacity .15s;
  }
  .lp-btn:hover:not(:disabled) { background: #e8e8e8; }
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

/* ─── Particle System ───────────────────────────────────────── */
// state: 'moving' | 'frozen' | 'shaking' | 'exploding'
type PState = 'moving' | 'frozen' | 'shaking' | 'exploding';

type Particle = {
  x: number; y: number;
  vx: number; vy: number;
  bvx: number; bvy: number;   // base velocity (moving target)
  r: number; alpha: number;
  decay: number;
  burst: boolean;
};

function ParticleCanvas({ pstate }: { pstate: PState }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const pts        = useRef<Particle[]>([]);
  const raf        = useRef<number>(0);
  const stateRef   = useRef<PState>('moving');
  const shakePhase = useRef(0);

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
        decay: 0, burst: false,
      });
    }
  }, []);

  const explode = useCallback((w: number, h: number) => {
    const cx = w / 2, cy = h / 2;
    // Big radial burst
    for (let i = 0; i < 80; i++) {
      const angle = (Math.PI * 2 * i) / 80 + Math.random() * 0.15;
      const spd   = 5 + Math.random() * 18;
      pts.current.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
        bvx: 0, bvy: 0,
        r: 3 + Math.random() * 9,
        alpha: 1,
        decay: 0.008 + Math.random() * 0.014,
        burst: true,
      });
    }
    // Scatter secondary
    for (let i = 0; i < 50; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 3 + Math.random() * 10;
      pts.current.push({
        x: cx + (Math.random() - 0.5) * 300,
        y: cy + (Math.random() - 0.5) * 300,
        vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
        bvx: 0, bvy: 0,
        r: 2 + Math.random() * 6,
        alpha: 0.9,
        decay: 0.012 + Math.random() * 0.018,
        burst: true,
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

      // Screen shake offset during 'shaking'
      let sx = 0, sy = 0;
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

      // Prune dead burst particles
      pts.current = pts.current.filter(p => p.burst ? p.alpha > 0.01 : true);

      for (const p of pts.current) {
        if (p.burst) {
          p.x += p.vx; p.y += p.vy;
          p.vx *= 0.95; p.vy *= 0.95;
          p.alpha -= p.decay;
        } else {
          if (st === 'moving') {
            // ease back to base speed
            p.vx += (p.bvx - p.vx) * 0.04;
            p.vy += (p.bvy - p.vy) * 0.04;
          } else if (st === 'frozen') {
            // slow to 20% of base speed — cámara lenta
            p.vx += (p.bvx * 0.05 - p.vx) * 0.06;
            p.vy += (p.bvy * 0.05 - p.vy) * 0.06;
          } else if (st === 'shaking') {
            p.vx = (Math.random() - 0.5) * 0.5;
            p.vy = (Math.random() - 0.5) * 0.5;
          } else if (st === 'exploding') {
            // ambient particles flee outward
            const dx = p.x - W/2, dy = p.y - H/2;
            const d  = Math.sqrt(dx*dx + dy*dy) || 1;
            p.vx += (dx/d) * 2.5;
            p.vy += (dy/d) * 2.5;
            p.alpha = Math.max(0.01, p.alpha - 0.02);
          }
          p.x += p.vx; p.y += p.vy;
          // wrap
          if (p.x < -20) p.x = W + 20;
          if (p.x > W+20) p.x = -20;
          if (p.y < -20) p.y = H + 20;
          if (p.y > H+20) p.y = -20;
        }

        // Glow halo
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.5);
        g.addColorStop(0, `rgba(52,211,153,${p.alpha * 0.7})`);
        g.addColorStop(1, `rgba(52,211,153,0)`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();

        // Solid core
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(167,243,208,${p.alpha})`;
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

  return <canvas ref={canvasRef} style={{ position:'fixed', inset:0, zIndex:0, pointerEvents:'none', display:'block' }} />;
}

export default function LoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  // Particle state machine
  const [pstate, setPstate] = useState<PState>('moving');
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [show2FA,       setShow2FA]       = useState(false);
  const [codeInput,     setCodeInput]     = useState('');
  const [twoFAError,    setTwoFAError]    = useState('');
  const [sending2FA,    setSending2FA]    = useState(false);
  const [verifying2FA,  setVerifying2FA]  = useState(false);
  const [loginError,    setLoginError]    = useState('');
  const [pendingTicket, setPendingTicket] = useState('');

  const handleEmailFocus  = () => setPstate('frozen');
  const handleEmailBlur   = () => setPstate('moving');
  const handlePasswordFocus = () => {
    setPstate('shaking');
  };
  const handlePasswordBlur  = () => setPstate('moving');

  useEffect(() => () => { if (shakeTimer.current) clearTimeout(shakeTimer.current); }, []);

  const router = useRouter();

  const maskedEmail = useMemo(() => {
    const [u, d] = email.split('@');
    if (!u || !d) return email;
    return `${u.slice(0,2)}${'*'.repeat(Math.max(1, u.length-3))}${u.slice(-1)}@${d}`;
  }, [email]);

  function saveTicketAndGo(ticket: string) {
    sessionStorage.setItem('playfabTicket', ticket);
    sessionStorage.setItem('twofa_ok', '1');
    router.replace('/assistant');
  }
  function read2FA(): TwoFAStored | null {
    try { const r = sessionStorage.getItem(TWOFA_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
  }
  function clear2FA() { sessionStorage.removeItem(TWOFA_KEY); }

  async function createAndSend2FA(targetEmail: string) {
    setSending2FA(true); setTwoFAError('');
    try {
      const code = gen2FACode(); const salt = genSalt(16);
      const exp = Date.now() + 5 * 60 * 1000;
      const hash = await sha256Hex(`${code}:${salt}`);
      sessionStorage.setItem(TWOFA_KEY, JSON.stringify({ salt, hash, exp }));
      const res = await fetch('/api/brevo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_email', email: targetEmail, template: 'twofa', data: { code, expiresMinutes: 5 } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) throw new Error(j?.message || 'Failed to send the 2FA email');
    } finally { setSending2FA(false); }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(''); setTwoFAError(''); setCodeInput(''); clear2FA();
    setLoading(true);
    try {
      const result = await playfabLogin(email, password);
      const ticket = result?.data?.SessionTicket;
      if (!ticket) { setLoginError('Login failed: no session returned.'); setPstate('moving'); return; }
      setPendingTicket(ticket);
      setPstate('exploding'); // 💥 only on success
      await createAndSend2FA(email);
      setShow2FA(true);
    } catch { setLoginError('Invalid credentials or connection error.'); setPstate('moving'); }
    finally { setLoading(false); }
  };

  const verify2FA = async () => {
    setVerifying2FA(true); setTwoFAError('');
    try {
      const stored = read2FA();
      if (!stored) { setTwoFAError('No active code. Please resend.'); return; }
      if (Date.now() > stored.exp) { setTwoFAError('Code expired. Please resend.'); clear2FA(); return; }
      const clean = codeInput.trim();
      if (clean.length !== 6) { setTwoFAError('Enter all 6 digits.'); return; }
      if (await sha256Hex(`${clean}:${stored.salt}`) !== stored.hash) { setTwoFAError('Invalid code.'); return; }
      clear2FA(); setShow2FA(false);
      if (!pendingTicket) { setLoginError('Session lost. Please log in again.'); return; }
      saveTicketAndGo(pendingTicket);
    } finally { setVerifying2FA(false); }
  };

  const resend2FA = async () => {
    setTwoFAError(''); setCodeInput('');
    try { await createAndSend2FA(email); }
    catch (e) { setTwoFAError(e instanceof Error ? e.message : 'Failed to resend.'); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && show2FA) {} };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show2FA]);

  return (
    <div className="lp-wrap" style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0c0c0c', padding: 20, position: 'relative', overflow: 'hidden',
    }}>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      {/* Particle canvas */}
      <ParticleCanvas pstate={pstate} />

      {/* Ambient background glow */}
      <div style={{
        position: 'absolute', width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(52,211,153,.05) 0%, transparent 65%)',
        pointerEvents: 'none', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
      }} />

      {/* Card */}
      <div className="lp-card" style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 400,
        borderRadius: 18, border: '1px solid rgba(255,255,255,.1)',
        background: '#111111',
        boxShadow: '0 24px 64px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.06)',
        overflow: 'hidden',
      }}>

        {/* Top accent line */}
        <div style={{
          height: 2,
          background: 'linear-gradient(90deg, transparent, rgba(52,211,153,.55), transparent)',
        }} />

        <div style={{ padding: '36px 32px 32px' }}>

          {/* Logo / title */}
          <div className="lp-row-1" style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div className="lp-dot" />
              <span style={{ fontSize: 11, color: 'rgba(52,211,153,.7)', letterSpacing: '0.2em', fontWeight: 600 }}>
                YOUTASK
              </span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#f5f5f5', letterSpacing: '-.025em', lineHeight: 1.2 }}>
              Welcome back
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,.38)', marginTop: 4 }}>
              Sign in to continue
            </div>
          </div>

          {/* Error */}
          {loginError && (
            <div className="lp-row-1" style={{
              marginBottom: 16, padding: '10px 14px', borderRadius: 10,
              border: '1px solid rgba(248,113,113,.25)', background: 'rgba(248,113,113,.08)',
              fontSize: 13, color: '#fca5a5',
            }}>
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Email */}
            <div className="lp-row-2">
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
                Email
              </label>
              <input
                type="text" className="lp-input"
                placeholder="you@example.com"
                value={email} onChange={e => setEmail(e.target.value)}
                onFocus={handleEmailFocus}
                onBlur={handleEmailBlur}
                required autoComplete="email"
              />
            </div>

            <div className="lp-row-3">
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password" className="lp-input"
                placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
                onFocus={handlePasswordFocus}
                onBlur={handlePasswordBlur}
                required autoComplete="current-password"
              />
            </div>

            {/* Submit */}
            <div className="lp-row-4" style={{ marginTop: 4 }}>
              <button type="submit" className="lp-btn" disabled={loading || sending2FA}>
                {loading ? 'Signing in…' : 'Continue'}
              </button>
            </div>
          </form>

          {/* Footer */}
          <div className="lp-row-4" style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,.3)' }}>
            No account?{' '}
            <Link href="/signup" style={{ color: 'rgba(52,211,153,.8)', textDecoration: 'none', fontWeight: 500 }}>
              Sign up
            </Link>
          </div>
        </div>
      </div>

      {/* ── 2FA Modal ── */}
      {show2FA && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(10px)',
        }}>
          <div className="lp-card" style={{
            width: '100%', maxWidth: 400, borderRadius: 18,
            border: '1px solid rgba(255,255,255,.1)', background: '#111111',
            boxShadow: '0 32px 80px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.06)',
            overflow: 'hidden',
          }}>
            <div style={{ height: 2, background: 'linear-gradient(90deg,transparent,rgba(52,211,153,.55),transparent)' }} />

            <div style={{ padding: '32px 32px 28px' }}>

              {/* Header */}
              <div className="lp-row-1" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: '#f5f5f5', letterSpacing: '-.02em', marginBottom: 4 }}>
                    Check your email
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,.38)', lineHeight: 1.5 }}>
                    We sent a code to{' '}
                    <span style={{ color: 'rgba(255,255,255,.75)' }}>{maskedEmail}</span>
                  </div>
                </div>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  border: '1px solid rgba(255,255,255,.1)', background: 'rgba(52,211,153,.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                }}>
                  🔐
                </div>
              </div>

              {/* 2FA Error */}
              {twoFAError && (
                <div style={{
                  marginBottom: 16, padding: '10px 14px', borderRadius: 10,
                  border: '1px solid rgba(248,113,113,.25)', background: 'rgba(248,113,113,.08)',
                  fontSize: 13, color: '#fca5a5',
                }}>
                  {twoFAError}
                </div>
              )}

              {/* Code input */}
              <div className="lp-row-2" style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
                  6-digit code
                </label>
                <input
                  className="lp-input"
                  inputMode="numeric" pattern="[0-9]*" maxLength={6}
                  value={codeInput}
                  onChange={e => setCodeInput(e.target.value.replace(/\D/g,'').slice(0,6))}
                  style={{ textAlign: 'center', letterSpacing: '0.45em', fontSize: 20, fontWeight: 600 }}
                  placeholder="· · · · · ·"
                  autoFocus
                />
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.25)', marginTop: 8 }}>
                  Expires in 5 min · check spam if needed
                </div>
              </div>

              {/* Actions */}
              <div className="lp-row-3" style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button" className="lp-btn" disabled={verifying2FA || sending2FA}
                  onClick={verify2FA}
                >
                  {verifying2FA ? 'Verifying…' : 'Verify'}
                </button>
                <button
                  type="button" disabled={sending2FA || verifying2FA}
                  onClick={resend2FA}
                  style={{
                    padding: '12px 18px', borderRadius: 10, flexShrink: 0,
                    border: '1px solid rgba(255,255,255,.1)', background: 'transparent',
                    color: 'rgba(255,255,255,.5)', fontSize: 13, fontWeight: 500,
                    fontFamily: "'DM Sans',sans-serif", cursor: 'pointer', transition: 'all .15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,.06)'; e.currentTarget.style.color='rgba(255,255,255,.85)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='rgba(255,255,255,.5)'; }}
                >
                  {sending2FA ? 'Sending…' : 'Resend'}
                </button>
              </div>

              <div className="lp-row-4" style={{ marginTop: 16, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,.22)' }}>
                Tip: paste the code and youre done 😄
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}