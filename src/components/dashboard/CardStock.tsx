import Link from "next/link";
import { cn } from "@/lib/utils";
import type { DashboardData } from "./types";
import Card from "./Card";
import MiniStat from "./MiniStat";

interface CardStockProps {
  data: DashboardData | null;
}

export default function CardStock({ data }: CardStockProps) {
  const stock = data?.stockSnapshot || [];
  const max = Math.max(1, ...stock.flatMap((s) => [Math.max(0, s.full), Math.max(0, s.empty)]));

  return (
    <Card
      title="Stock Status"
      subtitle="Full vs empty per cylinder"
      icon="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
      action={
        <Link
          href="/dashboard/stock"
          className="text-[10px] font-mono text-slate-400 hover:text-slate-800 transition flex-shrink-0"
        >
          Manage →
        </Link>
      }
    >
      {stock.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-slate-400 text-xs">No cylinder types</div>
      ) : (
        <div className="space-y-3 w-full min-w-0">
          <div className="grid grid-cols-2 gap-2 pb-3 border-b border-slate-100 w-full min-w-0">
            <MiniStat label="Full" value={(data?.totalFull || 0).toLocaleString("en-IN")} tone="emerald" />
            <MiniStat label="Empty" value={(data?.totalEmpty || 0).toLocaleString("en-IN")} />
          </div>
          <div className="space-y-2 w-full min-w-0">
            {stock.map((s) => {
              const fp = (Math.max(0, s.full) / max) * 100;
              const ep = (Math.max(0, s.empty) / max) * 100;
              const isLow = s.full < 10;
              return (
                <div key={s.id} className="w-full min-w-0">
                  <div className="flex items-center justify-between mb-1 text-[11px] min-w-0 gap-2">
                    <span className="font-medium text-slate-700 truncate min-w-0 flex items-center gap-1.5">
                      {s.name}
                      {isLow && (
                        <span className="text-[8px] font-mono font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1 rounded flex-shrink-0">
                          LOW
                        </span>
                      )}
                    </span>
                    <span className="font-mono tabular-nums text-slate-500 flex-shrink-0">
                      <span className="text-emerald-700 font-semibold">{s.full}</span>
                      <span className="mx-1 text-slate-300">/</span>
                      <span className="text-sky-700 font-semibold">{s.empty}</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-0.5">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        isLow ? "bg-rose-500" : "bg-emerald-500",
                      )}
                      style={{ width: `${fp}%` }}
                    />
                  </div>
                  <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${ep}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
