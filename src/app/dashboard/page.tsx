"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import CalendarPicker from "@/components/CalendarPicker";
import { formatCurrency, getMonthName, cn } from "@/lib/utils";

interface DashboardData {
  totalEmployees: number;
  deliveryStaff: number;
  officeStaff: number;
  monthlyDeliveries: number;
  todayDeliveries: number;
  monthlyLoans: number;
  monthlyDeductions: number;
  dailyTrend: { date: string; count: number }[];
  topPerformers: { name: string; total: number }[];
}

export default function DashboardPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard?month=${month}&year=${year}`);
      setData(await res.json());
    } catch { /* empty state */ }
    setLoading(false);
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const stats = [
    {
      label: "Total Employees",
      value: data?.totalEmployees || 0,
      sub: `${data?.deliveryStaff || 0} delivery, ${data?.officeStaff || 0} office`,
      bg: "bg-blue-50", border: "border-blue-100", text: "text-blue-700", iconBg: "bg-blue-100",
      icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
    },
    {
      label: "Monthly Deliveries",
      value: data?.monthlyDeliveries?.toLocaleString("en-IN") || "0",
      sub: `Today: ${data?.todayDeliveries || 0}`,
      bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-700", iconBg: "bg-emerald-100",
      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    },
    {
      label: "Loans This Month",
      value: formatCurrency(data?.monthlyLoans || 0),
      sub: "New loans disbursed",
      bg: "bg-amber-50", border: "border-amber-100", text: "text-amber-700", iconBg: "bg-amber-100",
      icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
    },
    {
      label: "Total Deductions",
      value: formatCurrency(data?.monthlyDeductions || 0),
      sub: "PF + Loans + Advances",
      bg: "bg-rose-50", border: "border-rose-100", text: "text-rose-700", iconBg: "bg-rose-100",
      icon: "M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z",
    },
  ];

  const maxDelivery = Math.max(...(data?.dailyTrend?.map((d) => d.count) || [1]));

  const quickActions = [
    { label: "Daily Entry", href: "/dashboard/daily-entry", icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" },
    { label: "Add Loan", href: "/dashboard/loans", icon: "M12 4v16m8-8H4" },
    { label: "Salary Sheet", href: "/dashboard/salary", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
    { label: "Export Report", href: "/dashboard/reports", icon: "M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  ];

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Dashboard</h1>
          <p className="text-[13px] text-slate-500">Astha Gas Agency — Desainagar</p>
        </div>
        <CalendarPicker month={month} year={year} onMonthChange={(m, y) => { setMonth(m); setYear(y); }} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading...</div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {stats.map((s) => (
              <div key={s.label} className={cn(s.bg, "border", s.border, "rounded-lg p-4")}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500">{s.label}</p>
                    <p className={cn("text-lg font-semibold mt-1 tabular-nums", s.text)}>{s.value}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{s.sub}</p>
                  </div>
                  <div className={cn("w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0", s.iconBg)}>
                    <svg className={cn("w-4 h-4", s.text)} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={s.icon} />
                    </svg>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
            {quickActions.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="flex items-center gap-2.5 px-4 py-3 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <svg className="w-4 h-4 flex-shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={a.icon} />
                </svg>
                {a.label}
              </Link>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Daily Trend */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-5">
              <h2 className="text-[13px] font-semibold text-slate-800 mb-4">
                Daily Deliveries — {getMonthName(month)} {year}
              </h2>
              {data?.dailyTrend && data.dailyTrend.length > 0 ? (
                <div className="flex items-end gap-[3px] h-48">
                  {data.dailyTrend.map((d, i) => {
                    const pct = (d.count / maxDelivery) * 100;
                    const date = new Date(d.date).getDate();
                    const isHovered = hoveredBar === i;
                    const dow = new Date(d.date).getDay();
                    const isSunday = dow === 0;

                    return (
                      <div
                        key={i}
                        className="flex-1 flex flex-col items-center gap-1 group cursor-pointer"
                        onMouseEnter={() => setHoveredBar(i)}
                        onMouseLeave={() => setHoveredBar(null)}
                      >
                        <span className={cn(
                          "text-[9px] font-medium tabular-nums transition-opacity",
                          isHovered ? "opacity-100 text-slate-700" : "opacity-0 text-slate-400"
                        )}>
                          {d.count}
                        </span>
                        <div
                          className={cn(
                            "w-full rounded-t-sm min-h-[4px] transition-colors duration-150",
                            isSunday ? "bg-amber-200" : isHovered ? "bg-slate-500" : "bg-slate-300"
                          )}
                          style={{ height: `${Math.max(pct, 3)}%` }}
                        />
                        <span className={cn(
                          "text-[9px] font-medium tabular-nums",
                          isSunday ? "text-amber-600" : isHovered ? "text-slate-700" : "text-slate-400"
                        )}>
                          {date}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                  No delivery data for this month
                </div>
              )}
            </div>

            {/* Top Performers */}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h2 className="text-[13px] font-semibold text-slate-800 mb-4">Top Performers</h2>
              {data?.topPerformers && data.topPerformers.length > 0 ? (
                <div className="space-y-3">
                  {data.topPerformers.map((p, i) => {
                    const maxTotal = data.topPerformers[0]?.total || 1;
                    const pct = (p.total / maxTotal) * 100;
                    const circleColors = ["bg-amber-500 text-white", "bg-slate-400 text-white", "bg-amber-700 text-white"];
                    const barColors = ["bg-amber-400", "bg-slate-300", "bg-amber-300"];
                    const circleClass = circleColors[i] || "bg-slate-200 text-slate-500";
                    const barClass = barColors[i] || "bg-slate-200";

                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2.5">
                            <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold", circleClass)}>
                              {i + 1}
                            </span>
                            <span className="text-sm text-slate-700">{p.name}</span>
                          </div>
                          <span className="text-sm font-semibold text-slate-800 tabular-nums">
                            {p.total.toLocaleString("en-IN")}
                          </span>
                        </div>
                        <div className="ml-8 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full", barClass)} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No data yet</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
