'use client';

import React, { useEffect, useState } from 'react';

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */
type Occupation = 'Student' | 'Professional' | 'Freelancer' | 'Other' | '';
type Profession =
  | 'Developer' | 'Designer' | 'CEO / Founder' | 'Product Manager'
  | 'Marketing' | 'Sales' | 'Operations' | 'Finance' | 'HR' | 'Other' | '';
type Goal =
  | 'Stay organized' | 'Hit deadlines' | 'Manage projects' | 'Build habits' | '';

const OCCUPATIONS: { value: Occupation; emoji: string }[] = [
  { value: 'Student',      emoji: '🎓' },
  { value: 'Professional', emoji: '💼' },
  { value: 'Freelancer',   emoji: '⚡' },
  { value: 'Other',        emoji: '🌐' },
];

const PROFESSIONS: { value: Profession; emoji: string }[] = [
  { value: 'Developer',       emoji: '💻' },
  { value: 'Designer',        emoji: '🎨' },
  { value: 'CEO / Founder',   emoji: '🏢' },
  { value: 'Product Manager', emoji: '📐' },
  { value: 'Marketing',       emoji: '📣' },
  { value: 'Sales',           emoji: '🤝' },
  { value: 'Operations',      emoji: '⚙️' },
  { value: 'Finance',         emoji: '📊' },
  { value: 'HR',              emoji: '👥' },
  { value: 'Other',           emoji: '✦'  },
];

const GOALS: { value: Goal; emoji: string; desc: string }[] = [
  { value: 'Stay organized',  emoji: '🗂️', desc: 'Keep everything structured and easy to find' },
  { value: 'Hit deadlines',   emoji: '⏰', desc: 'Never let a due date slip past you'           },
  { value: 'Manage projects', emoji: '🚀', desc: 'Coordinate complex work end-to-end'           },
  { value: 'Build habits',    emoji: '🔁', desc: 'Show up consistently, day after day'          },
];

const LS_OCCUPATION = 'youtask_occupation';
const LS_PROFESSION = 'youtask_profession';
const LS_GOAL       = 'youtask_goal';

function readOnboardingDone(): boolean {
  try { return !!localStorage.getItem(LS_OCCUPATION); } catch { return false; }
}
function saveOnboarding(o: Occupation, p: Profession, g: Goal) {
  try {
    localStorage.setItem(LS_OCCUPATION, o || 'skipped');
    localStorage.setItem(LS_PROFESSION, p || 'skipped');
    localStorage.setItem(LS_GOAL,       g || 'skipped');
  } catch {}
}

/* ─────────────────────────────────────────────
   STYLES
───────────────────────────────────────────── */

/* ─────────────────────────────────────────────
   PROGRESS DOTS
───────────────────────────────────────────── */
function ProgressDots({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{
          display: 'block',
          borderRadius: 99,
          transition: 'all .3s cubic-bezier(.25,.9,.3,1)',
          width:  i === step ? 18 : 6,
          height: 6,
          background: i === step
            ? '#34d399'
            : i < step
              ? 'rgba(52,211,153,.35)'
              : 'rgba(255,255,255,.15)',
        }} />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   STEP 0 — OCCUPATION
───────────────────────────────────────────── */
function StepOccupation({ value, onChange }: { value: Occupation; onChange:(v:Occupation)=>void }) {
  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: '#f5f5f5', letterSpacing: '-.025em', lineHeight: 1.25, marginBottom: 6 }}>
          Whats your role?
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>
          Helps us tailor the defaults to how you work.
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {OCCUPATIONS.map((o, i) => (
          <button key={o.value} type="button"
            className={`ob-opt ob-chip ${value === o.value ? 'ob-selected' : ''}`}
            style={{ animationDelay: `${i * 0.05}s`, padding: '18px 14px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, textAlign: 'left' }}
            onClick={() => onChange(o.value)}>
            <span style={{ fontSize: 28, lineHeight: 1 }}>{o.emoji}</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: value === o.value ? '#d1fae5' : 'rgba(255,255,255,.75)' }}>
                {o.value}
              </span>
              <span className="ob-check">
                {value === o.value && (
                  <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                    <path d="M1 3.5L3.5 6L8 1" stroke="#0a0a0a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   STEP 1 — PROFESSION
───────────────────────────────────────────── */
function StepProfession({ value, onChange }: { value: Profession; onChange:(v:Profession)=>void }) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: '#f5f5f5', letterSpacing: '-.025em', lineHeight: 1.25, marginBottom: 6 }}>
          What do you do?
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>
          Pick the closest fit.
        </div>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7,
        maxHeight: '44vh', overflowY: 'auto', paddingRight: 4,
        scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,.1) transparent',
      }}>
        {PROFESSIONS.map((p, i) => (
          <button key={p.value} type="button"
            className={`ob-opt ob-chip ${value === p.value ? 'ob-selected' : ''}`}
            style={{ animationDelay: `${i * 0.035}s`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}
            onClick={() => onChange(p.value)}>
            <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{p.emoji}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: value === p.value ? '#d1fae5' : 'rgba(255,255,255,.65)', flex: 1, textAlign: 'left' }}>
              {p.value}
            </span>
            <span className="ob-check" style={{ width: 14, height: 14 }}>
              {value === p.value && (
                <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                  <path d="M1 3L3 5L7 1" stroke="#0a0a0a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   STEP 2 — GOAL
───────────────────────────────────────────── */
function StepGoal({ value, onChange }: { value: Goal; onChange:(v:Goal)=>void }) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: '#f5f5f5', letterSpacing: '-.025em', lineHeight: 1.25, marginBottom: 6 }}>
          Whats your main goal?
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>
          Well shape your defaults around this.
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {GOALS.map((g, i) => (
          <button key={g.value} type="button"
            className={`ob-opt ob-chip ${value === g.value ? 'ob-selected' : ''}`}
            style={{ animationDelay: `${i * 0.06}s`, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}
            onClick={() => onChange(g.value)}>
            <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{g.emoji}</span>
            <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: value === g.value ? '#d1fae5' : '#f0f0f0', marginBottom: 2 }}>
                {g.value}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', lineHeight: 1.45 }}>
                {g.desc}
              </div>
            </div>
            <span className="ob-check">
              {value === g.value && (
                <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                  <path d="M1 3.5L3.5 6L8 1" stroke="#0a0a0a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN MODAL
───────────────────────────────────────────── */
export function OnboardingModal() {
  const [open,       setOpen]       = useState(false);
  const [step,       setStep]       = useState(0);
  const [dir,        setDir]        = useState<1 | -1>(1);
  const [animating,  setAnimating]  = useState(false);
  const [occupation, setOccupation] = useState<Occupation>('');
  const [profession, setProfession] = useState<Profession>('');
  const [goal,       setGoal]       = useState<Goal>('');

  const TOTAL = 3;

  useEffect(() => { if (!readOnboardingDone()) setOpen(true); }, []);

  const goTo = (nextStep: number, direction: 1 | -1) => {
    if (animating) return;
    setDir(direction);
    setAnimating(true);
    setTimeout(() => { setStep(nextStep); setAnimating(false); }, 210);
  };

  const handleNext = () => { if (step < TOTAL - 1) goTo(step + 1, 1); else finish(); };
  const handleBack = () => { if (step > 0) goTo(step - 1, -1); };
  const finish = (skip = false) => {
    saveOnboarding(skip ? '' : occupation, skip ? '' : profession, skip ? '' : goal);
    setOpen(false);
  };

  const canNext = step === 0 ? occupation !== '' : step === 1 ? profession !== '' : goal !== '';
  const enterClass = dir === 1 ? 'ob-enter-r' : 'ob-enter-l';
  const exitClass  = dir === 1 ? 'ob-exit-r'  : 'ob-exit-l';

  if (!open) return null;

  return (
    <div className="ob-wrap">
    

      {/* Backdrop */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(12px)',
      }}>

        {/* Card */}
        <div className="ob-card" style={{
          width: 'min(800px, 100vw)',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,.1)',
          background: '#111111',
          boxShadow: '0 24px 64px rgba(0,0,0,.6), 0 1px 0 rgba(255,255,255,.06) inset',
          overflow: 'hidden',
        }}>

          {/* Top bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px 12px',
            borderBottom: '1px solid rgba(255,255,255,.07)',
          }}>
            <ProgressDots step={step} total={TOTAL} />
            <button type="button" onClick={() => finish(true)} style={{
              fontSize: 12, color: 'rgba(255,255,255,.28)', background: 'none',
              border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
              padding: '4px 8px', borderRadius: 6, transition: 'color .13s, background .13s',
            }}
              onMouseEnter={e => { e.currentTarget.style.color='rgba(255,255,255,.65)'; e.currentTarget.style.background='rgba(255,255,255,.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.color='rgba(255,255,255,.28)'; e.currentTarget.style.background='transparent'; }}>
              Skip
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '28px 24px 24px' }}>

            {/* Step content */}
            <div style={{ position: 'relative', overflow: 'hidden', minHeight: 300 }}>
              <div key={step} className={animating ? exitClass : enterClass}>
                {step === 0 && <StepOccupation value={occupation} onChange={setOccupation} />}
                {step === 1 && <StepProfession value={profession} onChange={setProfession} />}
                {step === 2 && <StepGoal       value={goal}       onChange={setGoal}       />}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'rgba(255,255,255,.07)', margin: '20px 0' }} />

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              {step > 0 && (
                <button type="button" onClick={handleBack} className="ob-btn-back">
                  ← Back
                </button>
              )}
              <button type="button" onClick={handleNext} disabled={!canNext} className="ob-btn-next">
                {step === TOTAL - 1 ? 'Get started' : 'Continue'}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}