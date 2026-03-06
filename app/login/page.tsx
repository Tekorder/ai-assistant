'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PlayFab, PlayFabClient } from 'playfab-sdk';

if (!process.env.NEXT_PUBLIC_PLAYFAB_TITLE_ID) {
  throw new Error('NEXT_PUBLIC_PLAYFAB_TITLE_ID is not defined');
}
PlayFab.settings.titleId = process.env.NEXT_PUBLIC_PLAYFAB_TITLE_ID;

// ======================
// 2FA Helpers
// ======================
function gen2FACode(): string {
  const n = Math.floor(Math.random() * 1_000_000);
  return String(n).padStart(6, '0');
}

function genSalt(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

type TwoFAStored = {
  salt: string;
  hash: string;
  exp: number; // ms epoch
};

const TWOFA_KEY = 'youtask_2fa';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // 2FA UI
  const [show2FA, setShow2FA] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [twoFAError, setTwoFAError] = useState<string>('');
  const [sending2FA, setSending2FA] = useState(false);
  const [verifying2FA, setVerifying2FA] = useState(false);

  // Login error
  const [loginError, setLoginError] = useState<string>('');

  // Ticket held until 2FA succeeds
  const [pendingTicket, setPendingTicket] = useState<string>('');

  const router = useRouter();

  const maskedEmail = useMemo(() => {
    const [u, d] = email.split('@');
    if (!u || !d) return email;
    const left = u.slice(0, 2);
    const right = u.slice(-1);
    return `${left}${'*'.repeat(Math.max(1, u.length - 3))}${right}@${d}`;
  }, [email]);

  function saveTicketAndGo(ticket: string) {
    sessionStorage.setItem('playfabTicket', ticket);
    sessionStorage.setItem('twofa_ok', '1');
    router.replace('/assistant');
  }

  function read2FA(): TwoFAStored | null {
    try {
      const raw = sessionStorage.getItem(TWOFA_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as TwoFAStored;
    } catch {
      return null;
    }
  }

  function clear2FA() {
    sessionStorage.removeItem(TWOFA_KEY);
  }

  async function createAndSend2FA(targetEmail: string) {
    setSending2FA(true);
    setTwoFAError('');

    try {
      const code = gen2FACode();
      const salt = genSalt(16);
      const exp = Date.now() + 5 * 60 * 1000; // 5 minutes
      const hash = await sha256Hex(`${code}:${salt}`);

      // Store ONLY hash + salt + exp
      const stored: TwoFAStored = { salt, hash, exp };
      sessionStorage.setItem(TWOFA_KEY, JSON.stringify(stored));

      // Send code via email
      const res = await fetch('/api/brevo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_email',
          email: targetEmail,
          template: 'twofa',
          data: {
            code,
            expiresMinutes: 5,
          },
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        throw new Error(j?.message || 'Failed to send the 2FA email');
      }
    } finally {
      setSending2FA(false);
    }
  }

  

 type PlayFabLoginResult = {
  data?: {
    SessionTicket?: string;
  };
};

function playfabLogin(email: string, password: string): Promise<PlayFabLoginResult> {
  return new Promise((resolve, reject) => {
    PlayFabClient.LoginWithEmailAddress({ TitleId: PlayFab.settings.titleId, Email: email, Password: password },
      (error, result) => {
        if (error) return reject(error);
        return resolve(result as PlayFabLoginResult);
      }
    );
  });
}

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setTwoFAError('');
    setCodeInput('');
    clear2FA();

    try {
      const result = await playfabLogin(email, password);
      const ticket = result?.data?.SessionTicket;

      if (!ticket) {
        setLoginError('Login failed: SessionTicket was not returned.');
        return;
      }

      // Hold ticket until 2FA completes
      setPendingTicket(ticket);

      // Send 2FA and open modal
      await createAndSend2FA(email);
      setShow2FA(true);
    } catch {
      setLoginError('Invalid credentials or connection error.');
    }
  };

  const verify2FA = async () => {
    setVerifying2FA(true);
    setTwoFAError('');

    try {
      const stored = read2FA();
      if (!stored) {
        setTwoFAError('No active code found. Please resend the code.');
        return;
      }

      if (Date.now() > stored.exp) {
        setTwoFAError('The code has expired. Please resend the code.');
        clear2FA();
        return;
      }

      const clean = codeInput.trim();
      if (clean.length !== 6) {
        setTwoFAError('Please enter all 6 digits.');
        return;
      }

      const candidateHash = await sha256Hex(`${clean}:${stored.salt}`);
      if (candidateHash !== stored.hash) {
        setTwoFAError('Invalid code.');
        return;
      }

      // ✅ OK
      clear2FA();
      setShow2FA(false);

      if (!pendingTicket) {
        setLoginError('Session not available. Please log in again.');
        return;
      }

      saveTicketAndGo(pendingTicket);
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
        setTwoFAError(e instanceof Error ? e.message : 'Failed to resend the code.');
      }
  };

  // Close modal with ESC (optional)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && show2FA) {
        // Optional: do not allow closing to enforce 2FA
        // setShow2FA(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show2FA]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1E1E1E] text-white p-6">
      <div className="w-full max-w-md p-8 bg-[#202124] rounded-2xl shadow-lg border border-[#3C4043]">
        <h2 className="text-2xl font-bold mb-6 text-center">
          Login <span className="text-[#8AB4F8]">Youtask</span>
        </h2>

        {loginError ? (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {loginError}
          </div>
        ) : null}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-sm text-[#BDC1C6]">Email</label>
            <input
              type="text"
              className="w-full mt-1 p-3 rounded-lg bg-[#2D2F31] border border-[#3C4043] text-white placeholder:text-[#BDC1C6] outline-none"
              placeholder="yourmail@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-sm text-[#BDC1C6]">Password</label>
            <input
              type="password"
              className="w-full mt-1 p-3 rounded-lg bg-[#2D2F31] border border-[#3C4043] text-white placeholder:text-[#BDC1C6] outline-none"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="w-full mt-4 p-3 rounded-lg bg-gradient-to-r from-blue-500 to-pink-500 text-white font-semibold hover:opacity-90 transition-opacity"
          >
            Login
          </button>
        </form>

        <p className="text-sm text-[#BDC1C6] mt-6 text-center">
          Don’t have an account? <Link href="/signup">Sign Up</Link>
        </p>
      </div>

      {/* ======================
          2FA MODAL
         ====================== */}
      {show2FA ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#111214] shadow-2xl">
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold">
                    <span className="text-[#8AB4F8]">2FA</span> Verification
                  </h3>
                  <p className="mt-1 text-sm text-[#BDC1C6]">
                    We sent a 6-digit code to <span className="text-white">{maskedEmail}</span>
                  </p>
                </div>

                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-pink-500/20 border border-white/10 flex items-center justify-center">
                  <span className="text-lg">🔐</span>
                </div>
              </div>

              {twoFAError ? (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                  {twoFAError}
                </div>
              ) : null}

              <div className="mt-5">
                <label className="text-sm text-[#BDC1C6]">Code</label>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={codeInput}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setCodeInput(v);
                  }}
                  className="w-full mt-1 p-3 rounded-lg bg-[#2D2F31] border border-[#3C4043] text-white placeholder:text-[#BDC1C6] outline-none tracking-[0.4em] text-center text-lg"
                  placeholder="••••••"
                />
                <p className="mt-2 text-xs text-[#BDC1C6]">
                  Expires in 5 minutes. If you didn’t receive it, check spam.
                </p>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  disabled={verifying2FA || sending2FA}
                  onClick={verify2FA}
                  className="flex-1 rounded-xl bg-gradient-to-r from-blue-500 to-pink-500 p-3 font-semibold hover:opacity-90 disabled:opacity-60"
                >
                  {verifying2FA ? 'Verifying...' : 'Verify'}
                </button>

                <button
                  type="button"
                  disabled={sending2FA || verifying2FA}
                  onClick={resend2FA}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm hover:bg-white/10 disabled:opacity-60"
                >
                  {sending2FA ? 'Sending...' : 'Resend'}
                </button>
              </div>

              <div className="mt-4 text-center text-xs text-[#BDC1C6]">
                Tip: you can paste the code and you’re done 😄
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
