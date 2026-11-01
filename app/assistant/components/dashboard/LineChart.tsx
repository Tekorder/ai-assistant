'use client';

import React, { useState } from 'react';
import { CHART_PAD, ChartGrid, ChartTooltip, GoalLine, chartTicks } from './BarChart';
import { useElementWidth } from './DashboardPieces';

/** Same props and look as BarChart, drawn as a line with a soft area under it. */
export function LineChart({ values, xLabel, tickEvery = 1, tooltip, height = 180, ariaLabel, color, goal }: {
  values: number[];
  xLabel: (i: number) => string;
  tickEvery?: number;
  tooltip: (i: number) => string;
  height?: number;
  ariaLabel: string;
  color?: string;
  goal?: { value: number; label: string };
}) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const PAD = CHART_PAD;
  const stroke = color ?? 'var(--assistant-accent)';
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const { top, ticks } = chartTicks(Math.max(0, ...values, goal?.value ?? 0));
  const band = values.length ? innerW / values.length : 0;
  const x = (i: number) => PAD.left + band * i + band / 2;
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const area = values.length
    ? `M${x(0)},${y(0)} L${points.replace(/ /g, ' L')} L${x(values.length - 1)},${y(0)} Z`
    : '';

  return (
    <div ref={wrapRef} className="relative w-full">
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} style={{ display: 'block' }}>
          <ChartGrid ticks={ticks} y={y} width={width} />
          {values.length > 0 ? (
            <>
              <path d={area} style={{ fill: `color-mix(in srgb, ${stroke} 14%, transparent)` }} />
              <polyline points={points} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke }} />
            </>
          ) : null}
          {values.map((v, i) => (
            <g key={i}>
              {v > 0 || hover === i ? (
                <circle cx={x(i)} cy={y(v)} r={hover === i ? 4 : 2.5} style={{ fill: stroke }} />
              ) : null}
              {i % tickEvery === 0 ? (
                <text x={x(i)} y={height - 6} textAnchor="middle" fontSize={11} style={{ fill: 'var(--assistant-text-muted)' }}>
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
          ))}
          {goal && goal.value > 0 ? <GoalLine y={y(goal.value)} width={width} label={goal.label} /> : null}
        </svg>
      ) : (
        <div style={{ height }} />
      )}

      {hover != null && width > 0 ? (
        <ChartTooltip left={x(hover)} top={y(values[hover]) - 44} width={width}>
          {tooltip(hover)}
        </ChartTooltip>
      ) : null}
    </div>
  );
}
