import { cn } from "@/lib/utils";
import type { Period } from "./types";
import { PERIODS } from "./utils";

interface PeriodSwitcherProps {
  period: Period;
  onChange: (p: Period) => void;
}

export default function PeriodSwitcher({ period, onChange }: PeriodSwitcherProps) {
  return (
    <div className="inline-flex items-center bg-white/5 border border-white/10 rounded-full p-0.5 flex-shrink-0 self-start sm:self-auto">
      {PERIODS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={cn(
            "px-2.5 sm:px-3 py-1 text-[10px] sm:text-[11px] font-mono font-medium uppercase rounded-full transition-all",
            period === p.key
              ? "bg-emerald-400 text-slate-950 shadow-sm"
              : "text-slate-400 hover:text-white",
          )}
        >
          <span className="hidden sm:inline">{p.label}</span>
          <span className="sm:hidden">{p.short}</span>
        </button>
      ))}
    </div>
  );
}
