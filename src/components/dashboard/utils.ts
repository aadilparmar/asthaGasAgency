// Shared utilities + constants for the dashboard components.

import type { Period, RefillDay } from "./types";

// ---------- Formatting ----------

export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 10000000) return `${sign}${(abs / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `${sign}${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}K`;
  return `${sign}${Math.round(abs)}`;
}

// ---------- Period switcher config ----------

export const PERIODS: { key: Period; label: string; short: string }[] = [
  { key: "today", label: "Today",  short: "1D" },
  { key: "week",  label: "7 Days", short: "7D" },
  { key: "month", label: "Month",  short: "M" },
  { key: "fy",    label: "FY",     short: "FY" },
];

// ---------- SVG arc path (for donut slices) ----------

export function arcPath(
  cx: number, cy: number, outerR: number, innerR: number,
  startDeg: number, endDeg: number,
) {
  const sr = (startDeg * Math.PI) / 180;
  const er = (endDeg * Math.PI) / 180;
  const x1 = cx + outerR * Math.cos(sr);
  const y1 = cy + outerR * Math.sin(sr);
  const x2 = cx + outerR * Math.cos(er);
  const y2 = cy + outerR * Math.sin(er);
  const x3 = cx + innerR * Math.cos(er);
  const y3 = cy + innerR * Math.sin(er);
  const x4 = cx + innerR * Math.cos(sr);
  const y4 = cy + innerR * Math.sin(sr);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
}

// ---------- Heatmap: GitHub-style helpers ----------

// GitHub's actual emerald contribution palette (their latest, emerald branded)
export const HEATMAP_COLORS = [
  "#ebedf0", // 0 — empty
  "#9be9a8", // 1 — light
  "#40c463", // 2 — medium
  "#30a14e", // 3 — dark
  "#216e39", // 4 — darkest
];

export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ISO day-of-week where Monday = 0
export function isoDow(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

// Build 7-day columns from a flat list of RefillDays (oldest → newest).
// Pads start/end with nulls so weeks stay aligned.
export function buildWeeks(
  days: RefillDay[],
): ({ date: string; count: number; intensity: number; dayOfWeek: number } | null)[][] {
  if (days.length === 0) return [];
  const first = new Date(days[0].date + "T00:00:00Z");
  const firstDow = isoDow(first);

  const weeks: ({ date: string; count: number; intensity: number; dayOfWeek: number } | null)[][] = [];
  let current: ({ date: string; count: number; intensity: number; dayOfWeek: number } | null)[] = [];
  for (let i = 0; i < firstDow; i++) current.push(null);

  for (const d of days) {
    const dow = isoDow(new Date(d.date + "T00:00:00Z"));
    if (current.length === 7) {
      weeks.push(current);
      current = [];
    }
    while (current.length < dow) current.push(null);
    current.push({ ...d, dayOfWeek: dow });
  }
  if (current.length > 0) {
    while (current.length < 7) current.push(null);
    weeks.push(current);
  }
  return weeks;
}

// Map column index → month label, placed on the first week that contains day ≤ 7 of a new month.
export function computeMonthLabels(
  weeks: ReturnType<typeof buildWeeks>,
): Map<number, string> {
  const labels = new Map<number, string>();
  let lastMonth = -1;
  weeks.forEach((week, col) => {
    for (const day of week) {
      if (!day) continue;
      const date = new Date(day.date + "T00:00:00Z");
      const m = date.getUTCMonth();
      if (m !== lastMonth && date.getUTCDate() <= 7) {
        labels.set(col, MONTH_SHORT[m]);
        lastMonth = m;
        break;
      }
    }
  });
  return labels;
}

// Current + longest streaks (consecutive days with count > 0).
export function computeStreaks(days: RefillDay[]): { current: number; longest: number; bestDay: { date: string; count: number } | null } {
  let longest = 0;
  let running = 0;
  let bestDay: { date: string; count: number } | null = null;

  for (const d of days) {
    if (d.count > 0) {
      running++;
      if (running > longest) longest = running;
      if (!bestDay || d.count > bestDay.count) bestDay = { date: d.date, count: d.count };
    } else {
      running = 0;
    }
  }

  // Current streak — count from newest backward
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) current++;
    else break;
  }

  return { current, longest, bestDay };
}

// Format a YYYY-MM-DD into "Monday, 15 April 2026" (en-IN).
export function formatLongDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
