'use client';

import React, { useState } from 'react';
import { fmtNum, useElementWidth } from './DashboardPieces';

/** Rounded top corners only — the data end is rounded, the baseline end stays square. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

/** Y-axis top and its ticks: whole numbers up to 4, else 4 even steps. */
export function chartTicks(max: number): { top: number; ticks: number[] } {
  if (max <= 4) {
    const top = Math.max(1, Math.ceil(max));
    return { top, ticks: Array.from({ length: top + 1 }, (_, i) => i) };
  }
  const top = Math.ceil(max / 4) * 4;
  return { top, ticks: [0, top / 4, top / 2, (top * 3) / 4, top] };
}

const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** Y-axis label: "1,875", or "12.5K" once it gets long. */
export const fmtTick = (v: number) => (v >= 10000 ? compactFmt.format(v) : fmtNum(v, 1));

export type ChartPad = { top: number; right: number; bottom: number; left: number };

/** Chart padding — the left side fits the widest y label; the top leaves room for the peak's label. */
export function chartPad(ticks: number[]): ChartPad {
  const longest = Math.max(1, ...ticks.map(t => fmtTick(t).length));
  return { top: 22, right: 12, bottom: 24, left: Math.max(32, Math.round(longest * 6.6) + 14) };
}

/** Horizontal gridlines with their labels — shared by the bar and line charts. */
export function ChartGrid({ ticks, y, width, pad }: { ticks: number[]; y: (v: number) => number; width: number; pad: ChartPad }) {
  return (
    <>
      {ticks.map(t => (
        <g key={t}>
          <line
            x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)}
            style={{ stroke: 'var(--assistant-border-soft)' }}
            strokeWidth={1}
            opacity={t === 0 ? 1 : 0.6}
          />
          <text
            x={pad.left - 10} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11}
            style={{ fill: 'var(--assistant-text-faint)', fontVariantNumeric: 'tabular-nums' }}
          >
            {fmtTick(t)}
          </text>
        </g>
      ))}
    </>
  );
}

/** Dashed target line (e.g. a habit's goal per day). */
export function GoalLine({ y, width, label, pad }: { y: number; width: number; label: string; pad: ChartPad }) {
  return (
    <g>
      <line x1={pad.left} x2={width - pad.right} y1={y} y2={y}
        strokeDasharray="4 4" strokeWidth={1} style={{ stroke: 'var(--assistant-text-muted)' }} />
      <text x={width - pad.right} y={y - 4} textAnchor="end" fontSize={10}
        style={{ fill: 'var(--assistant-text-muted)' }}>
        {label}
      </text>
    </g>
  );
}

export function ChartTooltip({ left, top, width, children }: { left: number; top: number; width: number; children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12px] shadow-lg"
      style={{
        left: Math.min(Math.max(left, 60), width - 60),
        top: Math.max(0, top),
        transform: 'translateX(-50%)',
        background: 'var(--assistant-panel-bg)',
        border: '1px solid var(--assistant-border-soft)',
        color: 'var(--assistant-text)',
      }}
    >
      {children}
    </div>
  );
}

export function BarChart({ values, xLabel, tickEvery = 1, tooltip, height = 180, ariaLabel, mutedFrom, color, compare, goal }: {
  values: number[];
  xLabel: (i: number) => string;
  tickEvery?: number;
  tooltip: (i: number) => string;
  height?: number;
  ariaLabel: string;
  /** Indices >= this are in the future (drawn as empty slots) */
  mutedFrom?: number;
  /** Bar fill (default: the theme accent) */
  color?: string;
  /** A second, muted series drawn beside each bar (e.g. last week) */
  compare?: number[];
  /** Dashed target line */
  goal?: { value: number; label: string };
}) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const fill = color ?? 'var(--assistant-accent)';
  const { top, ticks } = chartTicks(Math.max(0, ...values, ...(compare ?? []), goal?.value ?? 0));
  const PAD = chartPad(ticks);
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const band = values.length ? innerW / values.length : 0;
  const pair = compare ? 2 : 1;
  const barW = Math.max(2, Math.min((band - 2) / pair - (pair - 1), 36));
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const maxIdx = values.reduce((best, v, i) => (v > values[best] ? i : best), 0);

  return (
    <div ref={wrapRef} className="relative w-full">
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} style={{ display: 'block' }}>
          <ChartGrid ticks={ticks} y={y} width={width} pad={PAD} />

          {values.map((v, i) => {
            const cx = PAD.left + band * i + band / 2;
            const future = mutedFrom != null && i >= mutedFrom;
            const h = (v / top) * innerH;
            const prev = compare?.[i] ?? 0;
            // With a comparison the previous value sits left, the current right
            const x = compare ? cx + 1 : cx - barW / 2;
            return (
              <g key={i}>
                {compare && prev > 0 ? (
                  <path
                    d={barPath(cx - 1 - barW, y(prev), barW, (prev / top) * innerH)}
                    style={{ fill: 'color-mix(in srgb, var(--assistant-text-faint) 45%, transparent)' }}
                    opacity={hover == null || hover === i ? 1 : 0.4}
                  />
                ) : null}
                {v > 0 ? (
                  <path
                    d={barPath(x, y(v), barW, h)}
                    style={{ fill }}
                    opacity={hover == null || hover === i ? 1 : 0.4}
                  />
                ) : null}
                {/* Direct label on the peak only */}
                {i === maxIdx && v > 0 && hover == null ? (
                  <text
                    x={x + barW / 2} y={y(v) - 6} textAnchor="middle" fontSize={11} fontWeight={600}
                    style={{ fill: 'var(--assistant-text-soft)' }}
                  >
                    {fmtNum(v, 1)}
                  </text>
                ) : null}
                {i % tickEvery === 0 ? (
                  <text
                    x={cx} y={height - 6} textAnchor="middle" fontSize={11}
                    style={{ fill: future ? 'var(--assistant-text-faint)' : 'var(--assistant-text-muted)', opacity: future ? 0.5 : 1 }}
                  >
                    {xLabel(i)}
                  </text>
                ) : null}
                <rect
                  x={PAD.left + band * i} y={PAD.top} width={band} height={innerH}
                  fill="transparent"
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(h0 => (h0 === i ? null : h0))}
                />
              </g>
            );
          })}

          {goal && goal.value > 0 ? <GoalLine y={y(goal.value)} width={width} label={goal.label} pad={PAD} /> : null}
        </svg>
      ) : (
        <div style={{ height }} />
      )}

      {hover != null && width > 0 ? (
        <ChartTooltip left={PAD.left + band * hover + band / 2} top={y(Math.max(values[hover], compare?.[hover] ?? 0)) - 44} width={width}>
          {tooltip(hover)}
        </ChartTooltip>
      ) : null}
    </div>
  );
}
