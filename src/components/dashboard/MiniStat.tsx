import { cn } from "@/lib/utils";

interface MiniStatProps {
  label: string;
  value: string;
  sub?: string;
  tone?: "emerald" | "rose" | "sky" | "violet" | "slate";
}

const TONE_MAP: Record<string, string> = {
  emerald: "text-emerald-700",
  rose:    "text-rose-700",
  sky:     "text-sky-700",
  violet:  "text-violet-700",
  slate:   "text-slate-900",
};

export default function MiniStat({ label, value, sub, tone = "slate" }: MiniStatProps) {
  return (
    <div className="min-w-0 overflow-hidden">
      <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500 mb-0.5 truncate">
        {label}
      </div>
      <div className={cn("font-display text-sm font-semibold tabular-nums truncate", TONE_MAP[tone])}>
        {value}
      </div>
      {sub && <div className="text-[9px] font-mono text-slate-400 truncate">{sub}</div>}
    </div>
  );
}
