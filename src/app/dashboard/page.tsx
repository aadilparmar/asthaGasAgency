"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import CalendarPicker from "@/components/CalendarPicker";
import { Donut, Histogram, HBars, CHART_COLORS } from "@/components/Charts";
import { formatCurrency, getMonthName, cn } from "@/lib/utils";

interface DashboardData {
  totalEmployees: number;
  deliveryStaff: number;
  officeStaff: number;
  monthlyDeliveries: number;
  todayDeliveries: number;
  todayOtp: number;
  monthlyOtp: number;
  monthlyRevenue: number;
  monthlyLoans: number;
  monthlyDeductions: number;
  otpBonus: number;
  dailyTrend: { date: string; count: number; otp: number; revenue: number }[];
  cylinderMix: { name: string; count: number; revenue: number }[];
  otpSplit: { otp: number; nonOtp: number };
  deductionBreakdown: { type: string; amount: number }[];
  topPerformers: { name: string; total: number }[];
  loanOutstanding: { name: string; amount: number }[];
  totalOutstanding: number;
  borrowerCount: number;
}

const DED_META: Record<string, { label: string; color: string }> = {
  pf: { label: "PF", color: "#3b82f6" },
  loan_instalment: { label: "Loan Instalment", color: "#f59e0b" },
  upad_1: { label: "UPAD 1st", color: "#10b981" },
  upad_15: { label: "UPAD 15th", color: "#8b5cf6" },
  upad_other: { label: "UPAD Other", color: "#f43f5e" },
};

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function DashboardPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard?month=${month}&year=${year}`);
      setData(await res.json());
    } catch { /* empty state */ }
    setLoading(false);
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const otpRate = data && data.monthlyDeliveries > 0
    ? Math.round((data.monthlyOtp / data.monthlyDeliveries) * 100) : 0;

  const stats = [
    {
      label: "Monthly Deliveries",
      value: data?.monthlyDeliveries?.toLocaleString("en-IN") || "0",
      sub: `Today: ${data?.todayDeliveries || 0} cylinders`,
      bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-700", iconBg: "bg-emerald-100",
      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    },
    {
      label: "Delivery Payout",
      value: formatCurrency(data?.monthlyRevenue || 0),
      sub: "Cylinder wages + OTP bonus",
      bg: "bg-blue-50", border: "border-blue-100", text: "text-blue-700", iconBg: "bg-blue-100",
      icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    },
    {
      label: "OTP Deliveries",
      value: data?.monthlyOtp?.toLocaleString("en-IN") || "0",
      sub: `${otpRate}% of all deliveries`,
      bg: "bg-violet-50", border: "border-violet-100", text: "text-violet-700", iconBg: "bg-violet-100",
      icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    },
    {
      label: "Outstanding Loans",
      value: formatCurrency(data?.totalOutstanding || 0),
      sub: `Across ${data?.borrowerCount || 0} staff`,
      bg: "bg-amber-50", border: "border-amber-100", text: "text-amber-700", iconBg: "bg-amber-100",
      icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
    },
  ];

  const quickActions = [
    { label: "Daily Entry", href: "/dashboard/daily-entry", icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" },
    { label: "Add Loan", href: "/dashboard/loans", icon: "M12 4v16m8-8H4" },
    { label: "Salary Sheet", href: "/dashboard/salary", icon: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" },
    { label: "Export Report", href: "/dashboard/reports", icon: "M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  ];

  // ── derived chart data ──────────────────────────────────────────────────────
  const dayBars = useMemo(() => (data?.dailyTrend || []).map((d) => {
    const dt = new Date(d.date);
    return {
      label: String(dt.getDate()),
      value: d.count,
      highlight: dt.getDay() === 0,
      tip: `${formatCurrency(d.revenue)} · ${d.otp} OTP`,
    };
  }), [data]);

  const weekdayBars = useMemo(() => {
    const sum: Record<number, number> = {};
    (data?.dailyTrend || []).forEach((d) => {
      const g = new Date(d.date).getDay();
      sum[g] = (sum[g] || 0) + d.count;
    });
    return [1, 2, 3, 4, 5, 6, 0].map((g) => ({ label: WD[g], value: sum[g] || 0, highlight: g === 0 }));
  }, [data]);

  const mixSlices = useMemo(() => (data?.cylinderMix || []).map((c, i) => ({
    label: c.name, value: c.count, color: CHART_COLORS[i % CHART_COLORS.length],
  })), [data]);

  const otpSlices = useMemo(() => [
    { label: "With OTP", value: data?.otpSplit.otp || 0, color: "#10b981" },
    { label: "Without OTP", value: data?.otpSplit.nonOtp || 0, color: "#cbd5e1" },
  ], [data]);

  const dedItems = useMemo(() => (data?.deductionBreakdown || [])
    .map((d) => ({ label: DED_META[d.type]?.label || d.type, value: d.amount, color: DED_META[d.type]?.color || "#94a3b8" }))
    .sort((a, b) => b.value - a.value), [data]);

  const perfItems = useMemo(() => (data?.topPerformers || []).map((p) => ({ label: p.name, value: p.total })), [data]);
  const loanItems = useMemo(() => (data?.loanOutstanding || []).map((l) => ({ label: l.name, value: l.amount, color: "#f59e0b" })), [data]);

  const cardTitle = (title: string, subtitle: string) => (
    <div className="mb-4">
      <h2 className="text-[13px] font-semibold text-slate-800">{title}</h2>
      <p className="text-[11px] text-slate-400">{subtitle}</p>
    </div>
  );

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Dashboard</h1>
          <p className="text-[13px] text-slate-500">Astha Gas Agency — Desainagar · {getMonthName(month)} {year}</p>
        </div>
        <CalendarPicker month={month} year={year} onMonthChange={(m, y) => { setMonth(m); setYear(y); }} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
          <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading dashboard...
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            {stats.map((s) => (
              <div key={s.label} className={cn(s.bg, "border", s.border, "rounded-lg p-4")}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-500">{s.label}</p>
                    <p className={cn("text-lg font-semibold mt-1 tabular-nums truncate", s.text)}>{s.value}</p>
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
                className="flex items-center gap-2.5 px-4 py-3 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                <svg className="w-4 h-4 flex-shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={a.icon} />
                </svg>
                {a.label}
              </Link>
            ))}
          </div>

          {/* Row A: Daily histogram + Cylinder mix pie */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-5">
              {cardTitle(`Daily Deliveries — ${getMonthName(month)} ${year}`, "Cylinders per day · hover for payout & OTP · Sundays in amber")}
              <Histogram data={dayBars} />
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              {cardTitle("Cylinder Mix", "Share of deliveries by cylinder type")}
              <Donut data={mixSlices} centerLabel="cylinders" />
            </div>
          </div>

          {/* Row B: Weekday histogram + OTP donut + Top performers */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              {cardTitle("Deliveries by Weekday", "Which days are busiest")}
              <Histogram data={weekdayBars} height={180} />
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              {cardTitle("OTP Adoption", "OTP-verified vs manual deliveries")}
              <Donut data={otpSlices} size={168} centerLabel="deliveries" />
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              {cardTitle("Top Performers", "Most cylinders delivered this month")}
              <HBars data={perfItems} rank />
            </div>
          </div>

          {/* Row C: Deductions + Outstanding loans */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              {cardTitle("Deductions Breakdown", `${getMonthName(month)} ${year} · total ${formatCurrency(data?.monthlyDeductions || 0)}`)}
              <HBars data={dedItems} valueFmt={(n) => formatCurrency(n)} />
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              {cardTitle("Outstanding Loans", `Current balances · total ${formatCurrency(data?.totalOutstanding || 0)}`)}
              <HBars data={loanItems} valueFmt={(n) => formatCurrency(n)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
