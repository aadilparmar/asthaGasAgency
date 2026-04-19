"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { TrendPoint } from "./types";
import { fmtCompact } from "./utils";

interface LineChartProps {
  trend: TrendPoint[];
}

export default function LineChart({ trend }: LineChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 1000;
  const H = 280;
  const pad = { top: 20, right: 16, bottom: 32, left: 48 };
  const iw = W - pad.left - pad.right;
  const ih = H - pad.top - pad.bottom;

  const maxY = Math.max(1, ...trend.map((t) => Math.max(t.revenue, t.expenses)));

  const x = (i: number) =>
    pad.left + (trend.length === 1 ? iw / 2 : (i / (trend.length - 1)) * iw);
  const y = (v: number) => pad.top + ih - (v / maxY) * ih;

  const revLine = trend
    .map((t, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(t.revenue).toFixed(1)}`)
    .join(" ");
  const expLine = trend
    .map((t, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(t.expenses).toFixed(1)}`)
    .join(" ");
  const area =
    `M ${x(0).toFixed(1)} ${(pad.top + ih).toFixed(1)} ` +
    trend.map((t, i) => `L ${x(i).toFixed(1)} ${y(t.revenue).toFixed(1)}`).join(" ") +
    ` L ${x(trend.length - 1).toFixed(1)} ${(pad.top + ih).toFixed(1)} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxY);
  const step = trend.length > 15 ? Math.ceil(trend.length / 8) : 1;

  return (
    <div className="relative w-full h-full" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full block" preserveAspectRatio="none">
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
        </defs>

        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={pad.left} x2={W - pad.right}
              y1={y(v)} y2={y(v)}
              stroke="rgba(255,255,255,0.05)"
              strokeDasharray={i === 0 ? "0" : "2 4"}
            />
            <text
              x={pad.left - 8} y={y(v) + 3} textAnchor="end"
              fill="#64748b" style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
            >
              ₹{fmtCompact(v)}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#revGrad)" />
        <path d={expLine} fill="none" stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="4 4" strokeLinecap="round" opacity="0.85" />
        <path d={revLine} fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {trend.map((t, i) =>
          t.revenue > 0 ? (
            <circle
              key={i}
              cx={x(i)} cy={y(t.revenue)}
              r={hover === i ? 4.5 : 3}
              fill="#0a0a0f"
              stroke="#34d399"
              strokeWidth={hover === i ? 2.5 : 2}
            />
          ) : null,
        )}

        {hover !== null && (
          <line
            x1={x(hover)} x2={x(hover)}
            y1={pad.top} y2={pad.top + ih}
            stroke="rgba(52,211,153,0.3)"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
        )}

        {trend.map((_, i) => (
          <rect
            key={i}
            x={i === 0 ? 0 : (x(i - 1) + x(i)) / 2}
            y={0}
            width={
              i === 0
                ? (x(i) + x(i + 1)) / 2
                : i === trend.length - 1
                  ? W - (x(i - 1) + x(i)) / 2
                  : (x(i + 1) - x(i - 1)) / 2
            }
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            style={{ cursor: "crosshair" }}
          />
        ))}

        {trend.map((t, i) => {
          if (i % step !== 0 && i !== trend.length - 1) return null;
          return (
            <text
              key={i}
              x={x(i)}
              y={pad.top + ih + 20}
              textAnchor="middle"
              fill="#64748b"
              style={{ fontSize: 9, fontFamily: "var(--font-mono)" }}
            >
              {t.label}
            </text>
          );
        })}
      </svg>

      {hover !== null && trend[hover] && (
        <div
          className="absolute top-2 bg-slate-900 border border-emerald-400/30 rounded-lg px-2.5 py-1.5 text-[10px] shadow-lg pointer-events-none max-w-[180px]"
          style={{
            left: x(hover) / W > 0.6 ? "auto" : "8px",
            right: x(hover) / W > 0.6 ? "8px" : "auto",
          }}
        >
          <div className="font-mono uppercase tracking-wider text-slate-400 text-[9px] mb-0.5">
            {trend[hover].label}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-emerald-400">Rev</span>
            <span className="font-mono font-semibold text-emerald-400">
              {fmtCompact(trend[hover].revenue)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-rose-400">Exp</span>
            <span className="font-mono font-semibold text-rose-400">
              {fmtCompact(trend[hover].expenses)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 pt-0.5 mt-0.5 border-t border-white/10">
            <span className="text-slate-300">Net</span>
            <span
              className={cn(
                "font-mono font-semibold",
                trend[hover].net >= 0 ? "text-emerald-400" : "text-rose-400",
              )}
            >
              {fmtCompact(trend[hover].net)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
