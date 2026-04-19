import { cn } from "@/lib/utils";
import { fmtCompact } from "./utils";

type Accent = "emerald" | "rose" | "slate" | "sky";

interface KpiCardProps {
  label: string;
  value: number | null;
  delta: number | null;
  accent: Accent;
  deltaInverted?: boolean;
  raw?: boolean;
}

const ACCENT_MAP: Record<Accent, string> = {
  emerald: "text-emerald-400",
  rose:    "text-rose-400",
  slate:   "text-white",
  sky:     "text-sky-400",
};

export default function KpiCard({ label, value, delta, accent, deltaInverted, raw }: KpiCardProps) {
  const deltaColor = delta === null
    ? "text-slate-500"
    : (deltaInverted ? delta < 0 : delta >= 0)
      ? "text-emerald-400"
      : "text-rose-400";

  const valueText = value === null ? "—" : raw ? value.toLocaleString("en-IN") : fmtCompact(value);
  const valuePrefix = value !== null && !raw ? "₹" : "";
  const valueSuffix = value !== null && raw ? " cyl" : "";

  return (
    <div className="min-w-0 overflow-hidden">
      <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400 mb-1 truncate">
        {label}
      </div>
      <div className={cn("font-display font-semibold tracking-tight leading-none truncate", ACCENT_MAP[accent])}>
        {value === null ? (
          <div className="h-8 sm:h-10 w-16 bg-white/5 rounded animate-pulse" />
        ) : (
          <>
            <span className="text-xl sm:text-2xl md:text-3xl">{valuePrefix}{valueText}</span>
            <span className="text-[10px] sm:text-xs font-mono font-normal text-slate-400 ml-1">{valueSuffix}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-1.5 text-[9px] sm:text-[10px] font-mono min-w-0">
        {delta !== null ? (
          <span className={cn("flex items-center gap-0.5 font-semibold flex-shrink-0", deltaColor)}>
            <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor">
              {delta >= 0 ? <path d="M5 1l4 5H6v3H4V6H1z" /> : <path d="M5 9l-4-5h3V1h2v3h3z" />}
            </svg>
            {Math.abs(delta).toFixed(0)}%
          </span>
        ) : (
          <span className="text-slate-500 flex-shrink-0">—</span>
        )}
        <span className="text-slate-500 truncate">vs prev</span>
      </div>
    </div>
  );
}
