"use client";

/**
 * CardRefillHeatmap — a GitHub-style contribution heatmap for consumer refills.
 *
 * Features:
 *  - 7-row × N-week grid of rounded squares, emerald 5-level intensity (GitHub palette)
 *  - Sparse day-of-week labels on the left (Mon / Wed / Fri)
 *  - Month labels on top, aligned to the first week containing the 1st of a month
 *  - Today's cell gets a subtle ring
 *  - Hover tooltip: "{count} refill(s) on {full date}"
 *  - Streak calculation: current streak + longest streak (consecutive days with activity)
 *  - Stats row: total · active days · current streak · longest streak
 *  - Legend on right: Less [□][■][■][■][■] More
 *  - Fully responsive — inner grid uses overflow-x-auto on small screens
 *  - Accessible: every cell has a descriptive aria-label
 *
 * Data contract: `data.refillHeatmap` is a flat list of { date, count, intensity }
 * sorted oldest → newest (typically last 91 days).
 */

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { DashboardData } from "./types";
import Card from "./Card";
import MiniStat from "./MiniStat";
import {
  HEATMAP_COLORS,
  DAY_SHORT,
  buildWeeks,
  computeMonthLabels,
  computeStreaks,
  formatLongDate,
} from "./utils";

// Grid dimensions — keep responsive via scale; these are the intrinsic SVG units.
const CELL = 12;                // square size
const GAP = 3;                  // between-cell gap
const DAY_LABEL_W = 28;         // left column for Mon/Wed/Fri labels
const MONTH_LABEL_H = 18;       // top strip for month labels
const TOP_MARGIN = 4;           // breathing room above month labels

interface CardRefillHeatmapProps {
  data: DashboardData | null;
}

export default function CardRefillHeatmap({ data }: CardRefillHeatmapProps) {
  const days = data?.refillHeatmap || [];
  const rawMax = data?.refillHeatmapMax || 1;
  const svgRef = useRef<SVGSVGElement>(null);

  const [hover, setHover] = useState<{
    date: string; count: number; cx: number; cy: number;
  } | null>(null);

  const weeks = useMemo(() => buildWeeks(days), [days]);
  const monthLabels = useMemo(() => computeMonthLabels(weeks), [weeks]);
  const streaks = useMemo(() => computeStreaks(days), [days]);

  const total = days.reduce((s, d) => s + d.count, 0);
  const activeDays = days.filter((d) => d.count > 0).length;
  const cols = weeks.length;

  // Today for ring highlight
  const todayStr = new Date().toISOString().slice(0, 10);

  // Intrinsic SVG size
  const svgWidth = DAY_LABEL_W + cols * CELL + Math.max(0, cols - 1) * GAP + 8;
  const svgHeight = TOP_MARGIN + MONTH_LABEL_H + 7 * CELL + 6 * GAP;

  return (
    <Card
      title="Refill Activity"
      subtitle={`${total.toLocaleString("en-IN")} refill${total === 1 ? "" : "s"} in the last ${days.length} days`}
      icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      action={
        <Link
          href="/dashboard/consumers"
          className="text-[10px] font-mono text-slate-400 hover:text-slate-800 transition flex-shrink-0"
        >
          View all →
        </Link>
      }
    >
      {days.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-slate-400 text-xs">No refills recorded</div>
      ) : (
        <div className="w-full min-w-0">
          {/* Heatmap grid — horizontally scrollable if narrow */}
          <div className="relative w-full min-w-0 overflow-x-auto pb-1">
            <svg
              ref={svgRef}
              width={svgWidth}
              height={svgHeight}
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="block"
              role="img"
              aria-label={`Refill activity heatmap — ${total} refills over ${days.length} days`}
            >
              {/* Month labels */}
              {Array.from(monthLabels.entries()).map(([col, label]) => (
                <text
                  key={`m-${col}`}
                  x={DAY_LABEL_W + col * (CELL + GAP)}
                  y={TOP_MARGIN + MONTH_LABEL_H - 6}
                  fontSize="10"
                  fontFamily="var(--font-mono)"
                  fill="#64748b"
                >
                  {label}
                </text>
              ))}

              {/* Day-of-week labels (sparse: Mon / Wed / Fri) */}
              {[0, 2, 4].map((row) => (
                <text
                  key={`d-${row}`}
                  x={DAY_LABEL_W - 8}
                  y={TOP_MARGIN + MONTH_LABEL_H + row * (CELL + GAP) + CELL - 2}
                  fontSize="10"
                  fontFamily="var(--font-mono)"
                  fill="#94a3b8"
                  textAnchor="end"
                >
                  {DAY_SHORT[row]}
                </text>
              ))}

              {/* Cells */}
              {weeks.map((week, col) =>
                week.map((day, row) => {
                  if (!day) return null;
                  const cx = DAY_LABEL_W + col * (CELL + GAP);
                  const cy = TOP_MARGIN + MONTH_LABEL_H + row * (CELL + GAP);
                  const isToday = day.date === todayStr;
                  const isHovered = hover?.date === day.date;
                  const ariaLabel = `${day.count} refill${day.count === 1 ? "" : "s"} on ${formatLongDate(day.date)}`;
                  return (
                    <rect
                      key={`c-${col}-${row}`}
                      x={cx}
                      y={cy}
                      width={CELL}
                      height={CELL}
                      rx="2"
                      ry="2"
                      fill={HEATMAP_COLORS[day.intensity]}
                      stroke={isToday ? "#0f766e" : isHovered ? "#047857" : "rgba(27,31,35,0.06)"}
                      strokeWidth={isToday || isHovered ? 1.2 : 1}
                      style={{ cursor: "pointer", transition: "stroke 0.12s" }}
                      aria-label={ariaLabel}
                      onMouseEnter={() =>
                        setHover({ date: day.date, count: day.count, cx: cx + CELL / 2, cy })
                      }
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                }),
              )}
            </svg>

            {/* Hover tooltip — positioned over the cell */}
            {hover && svgRef.current && (
              <HeatmapTooltip
                svgRef={svgRef as React.RefObject<SVGSVGElement>}
                cx={hover.cx}
                cy={hover.cy}
                date={hover.date}
                count={hover.count}
              />
            )}
          </div>

          {/* Legend + "best day" row */}
          <div className="flex items-center justify-between gap-3 mt-2 text-[10px] flex-wrap">
            <div className="font-mono text-slate-400 truncate">
              {streaks.bestDay ? (
                <>
                  Best day: <span className="font-semibold text-emerald-700">{streaks.bestDay.count}</span> on{" "}
                  <span className="text-slate-600">{formatLongDate(streaks.bestDay.date).split(",")[1]}</span>
                </>
              ) : (
                <span>No activity in this period</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 font-mono text-slate-400">
              <span>Less</span>
              <div className="flex gap-[3px]">
                {HEATMAP_COLORS.map((c, i) => (
                  <div
                    key={i}
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ background: c, border: i === 0 ? "1px solid rgba(27,31,35,0.06)" : undefined }}
                  />
                ))}
              </div>
              <span>More</span>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 mt-3 border-t border-slate-100 w-full min-w-0">
            <MiniStat label="Total" value={total.toLocaleString("en-IN")} tone="emerald" />
            <MiniStat label="Active" value={activeDays.toString()} sub={`of ${days.length} days`} />
            <MiniStat
              label="Current streak"
              value={`${streaks.current}d`}
              sub={streaks.current > 0 ? "active 🔥" : "none"}
              tone={streaks.current > 0 ? "emerald" : "slate"}
            />
            <MiniStat label="Longest streak" value={`${streaks.longest}d`} sub="best run" />
          </div>

          {/* Peak day callout */}
          {rawMax > 0 && (
            <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
              <svg className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>
                Peak single-day refills: <strong className="text-slate-700 font-mono">{rawMax}</strong>
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------
// Tooltip — positions itself above the hovered cell with auto-flip
// at the edges of the SVG so it never overflows the card.
// ------------------------------------------------------------
function HeatmapTooltip({
  svgRef, cx, cy, date, count,
}: {
  svgRef: React.RefObject<SVGSVGElement>;
  cx: number; cy: number; date: string; count: number;
}) {
  const svgRect = svgRef.current?.getBoundingClientRect();
  const parentRect = svgRef.current?.parentElement?.getBoundingClientRect();
  if (!svgRect || !parentRect) return null;

  // SVG cx/cy are in SVG coords; convert to CSS-pixel position within parent.
  // Since svg has width=svgWidth attribute matching viewBox, 1:1 in most layouts.
  const leftInParent = (svgRect.left - parentRect.left) + cx;
  const topInParent = (svgRect.top - parentRect.top) + cy;

  // Flip horizontally if near right edge
  const flipLeft = leftInParent > parentRect.width - 120;

  return (
    <div
      className="absolute z-20 bg-slate-900 text-white rounded-md px-2.5 py-1.5 shadow-lg pointer-events-none whitespace-nowrap"
      style={{
        left: flipLeft ? "auto" : leftInParent,
        right: flipLeft ? Math.max(0, parentRect.width - leftInParent) : "auto",
        top: topInParent - 8,
        transform: `translate(${flipLeft ? "50%" : "-50%"}, -100%)`,
      }}
    >
      <div className="text-[11px] font-semibold text-emerald-300 font-mono tabular-nums">
        {count === 0 ? "No refills" : `${count} refill${count === 1 ? "" : "s"}`}
      </div>
      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
        {formatLongDate(date)}
      </div>
      <svg
        className="absolute -bottom-[5px] left-1/2 -translate-x-1/2"
        width="10" height="5" viewBox="0 0 10 5"
      >
        <path d="M0 0 L5 5 L10 0 Z" fill="#0f172a" />
      </svg>
    </div>
  );
}
