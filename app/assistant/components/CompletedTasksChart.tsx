'use client';

import React, { useMemo, useRef, useState } from 'react';

type Task = { id: string; date: string };

type Props = {
  tasks: Task[];
};

const VIEW_W = 520;
const VIEW_H = 132;
const PAD = { top: 14, right: 10, bottom: 22, left: 10 };
const INNER_W = VIEW_W - PAD.left - PAD.right;
const INNER_H = VIEW_H - PAD.top - PAD.bottom;

export default function CompletedTasksChart({ tasks }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverDay, setHoverDay] = useState<number | null>(null);

  const { points, total, todayDate, daysInMonth, monthLabel, maxValue } = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayDate = now.getDate();

    const dailyCounts = new Array(daysInMonth).fill(0);
    for (const t of tasks) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t.date);
      if (!m) continue;
      const ty = Number(m[1]);
      const tm = Number(m[2]) - 1;
      const td = Number(m[3]);
      if (ty === year && tm === month && td >= 1 && td <= daysInMonth) {
        dailyCounts[td - 1] += 1;
      }
    }

    let running = 0;
    const cumulative: number[] = [];
    for (let i = 0; i < daysInMonth; i++) {
      running += dailyCounts[i];
      cumulative.push(running);
    }

    const points = Array.from({ length: todayDate }, (_, i) => ({
      day: i + 1,
      value: cumulative[i],
    }));

    const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(now);

    return {
      points,
      total: cumulative[todayDate - 1] ?? 0,
      todayDate,
      daysInMonth,
      monthLabel,
      maxValue: Math.max(1, cumulative[todayDate - 1] ?? 0),
    };
  }, [tasks]);

  const xScale = (day: number) =>
    PAD.left + ((day - 1) / Math.max(1, daysInMonth - 1)) * INNER_W;
  const yScale = (value: number) =>
    PAD.top + INNER_H - (value / maxValue) * INNER_H;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.day)},${yScale(p.value)}`).join(' ');
  const baselineY = PAD.top + INNER_H;
  const areaPath =
    points.length > 0
      ? `${linePath} L${xScale(points[points.length - 1].day)},${baselineY} L${xScale(points[0].day)},${baselineY} Z`
      : '';

  const activeDay = hoverDay ?? todayDate;
  const activePoint = points.find((p) => p.day === activeDay) ?? points[points.length - 1];

  const dayLabel = (day: number) =>
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
      new Date(new Date().getFullYear(), new Date().getMonth(), day),
    );

  const handlePointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = VIEW_W / rect.width;
    const xSvg = (e.clientX - rect.left) * scaleX;
    const raw = 1 + ((xSvg - PAD.left) / INNER_W) * (daysInMonth - 1);
    const clamped = Math.min(todayDate, Math.max(1, Math.round(raw)));
    setHoverDay(clamped);
  };

  const hasData = total > 0;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-1.5">
        <h2 className="text-[13px] font-medium" style={{ color: 'var(--assistant-text-muted)' }}>
          Completed tasks this {monthLabel}
        </h2>
        {activePoint && hasData && (
          <div className="text-[12px]" style={{ color: 'var(--assistant-text-faint)' }}>
            <span className="font-semibold" style={{ color: 'var(--assistant-text)' }}>
              {activePoint.value}
            </span>{' '}
            done · {dayLabel(activePoint.day)}
          </div>
        )}
      </div>

      <div
        className="rounded-lg px-1 pt-3 pb-1"
        style={{ background: 'var(--assistant-surface)', border: '1px solid var(--assistant-border-soft)' }}
      >
        {!hasData ? (
          <div
            className="flex h-[100px] items-center justify-center text-[12px]"
            style={{ color: 'var(--assistant-text-faint)' }}
          >
            No completed tasks yet this {monthLabel.toLowerCase()}.
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="w-full"
            style={{ height: 'auto', display: 'block' }}
            role="img"
            aria-label={`You have completed ${total} task${total === 1 ? '' : 's'} so far this ${monthLabel}, as of ${dayLabel(todayDate)}.`}
          >
            <defs>
              <linearGradient id="completedTasksFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: 'var(--assistant-accent)', stopOpacity: 0.16 }} />
                <stop offset="100%" style={{ stopColor: 'var(--assistant-accent)', stopOpacity: 0 }} />
              </linearGradient>
            </defs>

            {/* Recessive gridlines */}
            <line
              x1={PAD.left}
              x2={VIEW_W - PAD.right}
              y1={baselineY}
              y2={baselineY}
              style={{ stroke: 'var(--assistant-border-soft)' }}
              strokeWidth={1}
            />
            <line
              x1={PAD.left}
              x2={VIEW_W - PAD.right}
              y1={PAD.top}
              y2={PAD.top}
              style={{ stroke: 'var(--assistant-border-soft)' }}
              strokeWidth={1}
              opacity={0.6}
            />

            {/* Crosshair on hover */}
            {hoverDay != null && activePoint && (
              <line
                x1={xScale(activePoint.day)}
                x2={xScale(activePoint.day)}
                y1={PAD.top}
                y2={baselineY}
                style={{ stroke: 'var(--assistant-border-soft)' }}
                strokeWidth={1}
              />
            )}

            {areaPath && <path d={areaPath} fill="url(#completedTasksFill)" stroke="none" />}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                style={{ stroke: 'var(--assistant-accent)' }}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Active point marker (today by default, or hovered day) */}
            {activePoint && (
              <>
                <circle
                  cx={xScale(activePoint.day)}
                  cy={yScale(activePoint.value)}
                  r={6}
                  style={{ fill: 'var(--assistant-surface)' }}
                />
                <circle
                  cx={xScale(activePoint.day)}
                  cy={yScale(activePoint.value)}
                  r={4}
                  style={{ fill: 'var(--assistant-accent)' }}
                />
              </>
            )}

            {/* X-axis labels: start of month + today */}
            <text
              x={xScale(1)}
              y={VIEW_H - 4}
              fontSize={11}
              textAnchor="start"
              style={{ fill: 'var(--assistant-text-faint)' }}
            >
              1
            </text>
            <text
              x={xScale(todayDate)}
              y={VIEW_H - 4}
              fontSize={11}
              textAnchor="end"
              style={{ fill: 'var(--assistant-text-faint)' }}
            >
              {dayLabel(todayDate)}
            </text>

            {/* Invisible hit area for hover */}
            <rect
              x={PAD.left}
              y={0}
              width={INNER_W}
              height={VIEW_H}
              fill="transparent"
              onPointerMove={handlePointerMove}
              onPointerLeave={() => setHoverDay(null)}
            />
          </svg>
        )}
      </div>

      {hasData && (
        <span className="sr-only">
          You have completed {total} task{total === 1 ? '' : 's'} so far this {monthLabel}, as of {dayLabel(todayDate)}.
        </span>
      )}
    </section>
  );
}
