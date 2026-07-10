"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

/** Shared palette (matches the app's slate/emerald/amber/blue/violet/rose tones). */
export const CHART_COLORS = [
  "#10b981", // emerald
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#f43f5e", // rose
  "#14b8a6", // teal
  "#64748b", // slate
];

/* ============================================================
   DONUT / PIE
   ============================================================ */
export interface Slice {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  data,
  size = 176,
  thickness = 26,
  unit = "",
  centerLabel = "Total",
  valueFmt = (n: number) => n.toLocaleString("en-IN"),
}: {
  data: Slice[];
  size?: number;
  thickness?: number;
  unit?: string;
  centerLabel?: string;
  valueFmt?: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = useMemo(() => data.reduce((a, d) => a + d.value, 0), [data]);
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;

  let offset = 0;
  const segments = data.map((d, i) => {
    const frac = total > 0 ? d.value / total : 0;
    const len = frac * circ;
    const seg = { d, i, len, offset };
    offset += len;
    return seg;
  });

  const active = hover !== null ? data[hover] : null;
  const centerTop = active ? valueFmt(active.value) : valueFmt(total);
  const centerBottom = active
    ? `${active.label} · ${total > 0 ? Math.round((active.value / total) * 100) : 0}%`
    : `${centerLabel}${unit ? ` (${unit})` : ""}`;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {total === 0 && (
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={thickness} />
            )}
            {total > 0 &&
              segments.map(({ d, i, len, offset }) => (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={hover === i ? thickness + 4 : thickness}
                  strokeDasharray={`${Math.max(len - 1.5, 0)} ${circ - Math.max(len - 1.5, 0)}`}
                  strokeDashoffset={-offset}
                  className="transition-all duration-150 cursor-pointer"
                  style={{ opacity: hover === null || hover === i ? 1 : 0.3 }}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              ))}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-semibold text-slate-800 tabular-nums leading-tight">{centerTop}</span>
          <span className="text-[11px] text-slate-400 mt-0.5 text-center px-2">{centerBottom}</span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2">
        {data.map((d, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md px-2 py-1 -mx-2 cursor-pointer transition-colors",
              hover === i ? "bg-slate-50" : ""
            )}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
              <span className="text-[13px] text-slate-600 truncate">{d.label}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[13px] font-medium text-slate-800 tabular-nums">{valueFmt(d.value)}</span>
              <span className="text-[11px] text-slate-400 tabular-nums w-9 text-right">
                {total > 0 ? Math.round((d.value / total) * 100) : 0}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   HISTOGRAM (vertical bars) with gridlines, average line & tooltip
   ============================================================ */
export interface Bar {
  label: string;
  value: number;
  highlight?: boolean;
  tip?: string; // extra tooltip line (e.g. "₹12,340 · 18 OTP")
}

export function Histogram({
  data,
  height = 208,
  color = "#334155",
  highlightColor = "#f59e0b",
  showAvg = true,
  valueFmt = (n: number) => n.toLocaleString("en-IN"),
}: {
  data: Bar[];
  height?: number;
  color?: string;
  highlightColor?: string;
  showAvg?: boolean;
  valueFmt?: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const niceMax = niceCeil(max);
  const avg = data.length ? data.reduce((a, d) => a + d.value, 0) / data.length : 0;
  const gridlines = [0.25, 0.5, 0.75, 1];

  if (data.length === 0) {
    return <div style={{ height }} className="flex items-center justify-center text-slate-400 text-sm">No data</div>;
  }

  return (
    <div>
      <div className="relative" style={{ height }}>
        {/* gridlines + y labels */}
        {gridlines.map((g) => (
          <div key={g} className="absolute left-0 right-0 border-t border-dashed border-slate-100" style={{ bottom: `${g * 100}%` }}>
            <span className="absolute -top-2 -left-1 text-[9px] text-slate-300 tabular-nums bg-white pr-1">
              {valueFmt(Math.round(niceMax * g))}
            </span>
          </div>
        ))}

        {/* average line */}
        {showAvg && avg > 0 && (
          <div
            className="absolute left-0 right-0 border-t border-dashed border-emerald-300 z-10"
            style={{ bottom: `${(avg / niceMax) * 100}%` }}
          >
            <span className="absolute -top-2 right-0 text-[9px] font-medium text-emerald-500 bg-white pl-1">
              avg {valueFmt(Math.round(avg))}
            </span>
          </div>
        )}

        {/* bars */}
        <div className="absolute inset-0 flex items-end gap-[3px]">
          {data.map((d, i) => {
            const pct = (d.value / niceMax) * 100;
            const isHover = hover === i;
            return (
              <div
                key={i}
                className="flex-1 h-full flex items-end cursor-pointer group"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div
                  className="w-full rounded-t-sm transition-all duration-150"
                  style={{
                    height: `${Math.max(pct, d.value > 0 ? 2 : 0)}%`,
                    background: d.highlight ? highlightColor : color,
                    opacity: hover === null || isHover ? 1 : 0.45,
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* tooltip */}
        {hover !== null && (
          <div
            className="absolute z-20 pointer-events-none -translate-x-1/2 -translate-y-2 bottom-full"
            style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
          >
            <div className="bg-slate-800 text-white rounded-md px-2.5 py-1.5 shadow-lg whitespace-nowrap">
              <div className="text-[11px] font-semibold tabular-nums">{valueFmt(data[hover].value)}</div>
              <div className="text-[10px] text-slate-300">{data[hover].label}</div>
              {data[hover].tip && <div className="text-[10px] text-emerald-300 tabular-nums">{data[hover].tip}</div>}
            </div>
          </div>
        )}
      </div>

      {/* x labels */}
      <div className="flex gap-[3px] mt-1.5">
        {data.map((d, i) => (
          <div
            key={i}
            className={cn(
              "flex-1 text-center text-[9px] tabular-nums truncate",
              d.highlight ? "text-amber-600 font-medium" : hover === i ? "text-slate-700 font-medium" : "text-slate-400"
            )}
          >
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   HORIZONTAL BARS (rankings / breakdowns)
   ============================================================ */
export interface HItem {
  label: string;
  value: number;
  color?: string;
  sub?: string;
}

export function HBars({
  data,
  rank = false,
  valueFmt = (n: number) => n.toLocaleString("en-IN"),
  barColor = "#94a3b8",
}: {
  data: HItem[];
  rank?: boolean;
  valueFmt?: (n: number) => string;
  barColor?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const rankCircle = ["bg-amber-500 text-white", "bg-slate-400 text-white", "bg-amber-700 text-white"];

  if (data.length === 0) {
    return <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No data yet</div>;
  }

  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-1 gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {rank && (
                <span
                  className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0",
                    rankCircle[i] || "bg-slate-200 text-slate-500"
                  )}
                >
                  {i + 1}
                </span>
              )}
              {!rank && d.color && (
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
              )}
              <span className="text-[13px] text-slate-700 truncate">{d.label}</span>
            </div>
            <span className="text-[13px] font-semibold text-slate-800 tabular-nums flex-shrink-0">
              {valueFmt(d.value)}
            </span>
          </div>
          <div className={cn("h-1.5 bg-slate-100 rounded-full overflow-hidden", rank && "ml-[30px]")}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color || barColor }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Round up to a clean axis maximum (e.g. 337 → 400, 1240 → 1500). */
function niceCeil(n: number): number {
  if (n <= 10) return Math.ceil(n);
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  const step = mag / 2;
  return Math.ceil(n / step) * step;
}
