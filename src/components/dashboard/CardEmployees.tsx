import { cn } from "@/lib/utils";
import type { DashboardData } from "./types";
import Card from "./Card";
import MiniStat from "./MiniStat";

interface CardEmployeesProps {
  data: DashboardData | null;
}

export default function CardEmployees({ data }: CardEmployeesProps) {
  const emp = data?.employeePerformance || [];
  const max = Math.max(1, ...emp.map((e) => e.nsDom));
  const total = emp.reduce((s, e) => s + e.nsDom, 0);

  return (
    <Card
      title="Delivery Performance"
      subtitle={`${emp.length} delivery staff`}
      icon="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
    >
      {emp.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-slate-400 text-xs">No delivery data</div>
      ) : (
        <div className="w-full min-w-0 overflow-hidden">
          <div className="flex items-end gap-1 sm:gap-2 h-40 pb-5 relative w-full min-w-0 overflow-hidden">
            <div className="absolute bottom-5 left-0 right-0 border-b border-dashed border-slate-200" />
            {emp.map((e, i) => {
              const h = (e.nsDom / max) * 100;
              const isTop = i < 3;
              return (
                <div key={e.id} className="flex-1 flex flex-col items-center justify-end min-w-0 group relative">
                  <div className="mb-0.5 text-[9px] sm:text-[10px] font-mono font-semibold text-slate-800 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums whitespace-nowrap">
                    {e.nsDom}
                  </div>
                  <div
                    className={cn(
                      "w-full rounded-t-md relative overflow-hidden transition-all",
                      isTop
                        ? "bg-gradient-to-t from-emerald-500 to-emerald-300"
                        : "bg-gradient-to-t from-slate-400 to-slate-300",
                    )}
                    style={{ height: `${Math.max(h, 3)}%`, minHeight: 3 }}
                  >
                    {isTop && h > 25 && (
                      <div className="absolute top-1 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white/95 flex items-center justify-center font-mono text-[9px] font-bold text-emerald-700">
                        {i + 1}
                      </div>
                    )}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 overflow-hidden text-center px-0.5">
                    <div className="text-[9px] font-mono text-slate-500 truncate" title={e.name}>
                      {e.name.length > 7 ? e.name.slice(0, 6) + "…" : e.name}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 w-full min-w-0">
            <MiniStat label="Top" value={emp[0]?.name.slice(0, 8) || "—"} sub={`${emp[0]?.nsDom || 0} cyl`} tone="emerald" />
            <MiniStat label="Total" value={total.toLocaleString("en-IN")} sub="cylinders" />
            <MiniStat label="Avg" value={Math.round(total / Math.max(1, emp.length)).toString()} sub="per person" />
            <MiniStat label="Range" value={`${emp[0]?.nsDom || 0}-${emp[emp.length - 1]?.nsDom || 0}`} sub="high / low" />
          </div>
        </div>
      )}
    </Card>
  );
}
