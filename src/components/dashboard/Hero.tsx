"use client";

import type { DashboardData, Period } from "./types";
import { fmtCompact } from "./utils";
import KpiCard from "./KpiCard";
import PeriodSwitcher from "./PeriodSwitcher";
import LegendDot from "./LegendDot";
import LineChart from "./LineChart";

interface HeroProps {
  data: DashboardData | null;
  period: Period;
  setPeriod: (p: Period) => void;
  loading: boolean;
}

export default function Hero({ data, period, setPeriod, loading }: HeroProps) {
  return (
    <section className="relative dashboard-hero grid-pattern text-white rounded-2xl overflow-hidden w-full min-w-0">
      <div className="noise" />
      <div className="relative p-4 sm:p-5 md:p-6 w-full min-w-0">
        {/* Topline: agency label + period switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 w-full min-w-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-shrink">
            <div className="w-1 h-7 bg-emerald-400 rounded-full flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-emerald-400/80 truncate">
                Astha Gas Agency
              </div>
              <div className="font-display text-lg md:text-xl font-semibold tracking-tight truncate">
                {data?.label || "Loading…"}
              </div>
            </div>
          </div>
          <PeriodSwitcher period={period} onChange={setPeriod} />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5 w-full min-w-0">
          <KpiCard
            label="Revenue"
            value={loading ? null : data?.kpis.revenue.current ?? 0}
            delta={data?.kpis.revenue.delta ?? null}
            accent="emerald"
          />
          <KpiCard
            label="Net Income"
            value={loading ? null : data?.kpis.netIncome.current ?? 0}
            delta={data?.kpis.netIncome.delta ?? null}
            accent={(data?.kpis.netIncome.current ?? 0) >= 0 ? "emerald" : "rose"}
          />
          <KpiCard
            label="Expenses"
            value={loading ? null : data?.kpis.expenses.current ?? 0}
            delta={data?.kpis.expenses.delta ?? null}
            deltaInverted
            accent="slate"
          />
          <KpiCard
            label="Deliveries"
            value={loading ? null : data?.kpis.deliveries.current ?? 0}
            delta={data?.kpis.deliveries.delta ?? null}
            accent="sky"
            raw
          />
        </div>

        {/* Line chart card */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 sm:p-4 overflow-hidden w-full min-w-0">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3 min-w-0">
            <div className="min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-400 truncate">
                Cash Flow
              </div>
              <div className="font-display text-sm sm:text-base text-white font-medium truncate">
                Revenue vs Expenses
              </div>
            </div>
            <div className="flex items-center gap-3 text-[10px] flex-shrink-0">
              <LegendDot color="#34d399" label="Revenue" />
              <LegendDot color="#f43f5e" label="Expenses" dashed />
            </div>
          </div>

          <div className="h-[200px] sm:h-[240px] md:h-[260px] relative w-full min-w-0 overflow-hidden">
            {loading ? (
              <div className="h-full w-full bg-white/5 rounded animate-pulse" />
            ) : data?.revenueTrend && data.revenueTrend.length > 0 ? (
              <LineChart trend={data.revenueTrend} />
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                No data yet
              </div>
            )}
          </div>

          {data && (
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/10 min-w-0">
              <StripStat
                label="Peak"
                value={
                  data.revenueTrend.length > 0
                    ? `₹${fmtCompact(Math.max(...data.revenueTrend.map((t) => t.revenue)))}`
                    : "—"
                }
                color="emerald"
              />
              <StripStat
                label="Avg/day"
                value={
                  data.revenueTrend.length > 0
                    ? `₹${fmtCompact(data.kpis.revenue.current / Math.max(1, data.revenueTrend.filter((t) => t.revenue > 0).length))}`
                    : "—"
                }
                color="slate"
              />
              <StripStat
                label="Margin"
                value={
                  data.kpis.revenue.current > 0
                    ? `${((data.kpis.netIncome.current / data.kpis.revenue.current) * 100).toFixed(0)}%`
                    : "—"
                }
                color="emerald"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function StripStat({ label, value, color }: { label: string; value: string; color: "emerald" | "slate" | "rose" }) {
  const cm = { emerald: "text-emerald-400", slate: "text-slate-300", rose: "text-rose-400" };
  return (
    <div className="min-w-0 overflow-hidden">
      <div className="text-[9px] font-mono uppercase tracking-[0.12em] text-slate-500 mb-0.5 truncate">{label}</div>
      <div className={`font-mono text-xs sm:text-sm font-semibold tabular-nums truncate ${cm[color]}`}>
        {value}
      </div>
    </div>
  );
}
