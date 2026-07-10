"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import CalendarPicker from "@/components/CalendarPicker";
import CustomSelect from "@/components/CustomSelect";
import Toast from "@/components/Toast";
import { Donut, Histogram, HBars, CHART_COLORS } from "@/components/Charts";
import { formatCurrency, getMonthName, getFinancialYear, cn } from "@/lib/utils";
import {
  DED_LABELS,
  type SalaryRow, type SalaryTotals, type AnalyticsData,
  type RegisterRow, type RegisterType, type LoanTxn,
} from "@/lib/exports";

interface SalaryApi { employees: SalaryRow[]; totals: SalaryTotals; otpBonus: number }

interface DeliveryApiRow {
  employeeId: string;
  date: string;
  count: number;
  otpCount: number;
  employee: { id: string; name: string };
  cylinderType: { id: string; name: string; price: number };
}

type Tab = "salary" | "register" | "loans" | "analytics";
type Filter = "all" | "delivery" | "office";

const DED_KEYS = Object.keys(DED_LABELS);
const DED_COLORS: Record<string, string> = {
  pf: "#3b82f6", loan_instalment: "#f59e0b", upad_1: "#10b981", upad_15: "#8b5cf6", upad_other: "#f43f5e",
};

const TABS: { key: Tab; label: string }[] = [
  { key: "salary", label: "Salary Sheet" },
  { key: "register", label: "Delivery Register" },
  { key: "loans", label: "Loan Statement" },
  { key: "analytics", label: "Analytics" },
];

function pctDelta(cur: number, prev: number): number | null {
  if (!isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

function DeltaChip({ cur, prev, invert = false }: { cur: number; prev: number; invert?: boolean }) {
  const d = pctDelta(cur, prev);
  if (d === null) return <span className="text-[10px] text-slate-300">— vs last month</span>;
  const up = d >= 0;
  const good = invert ? !up : up;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium tabular-nums", good ? "text-emerald-600" : "text-rose-600")}>
      <svg className={cn("w-2.5 h-2.5", !up && "rotate-180")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
      </svg>
      {Math.abs(d).toFixed(1)}% vs last month
    </span>
  );
}

export default function ReportsPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [tab, setTab] = useState<Tab>("salary");
  const [filter, setFilter] = useState<Filter>("all");

  const [salary, setSalary] = useState<SalaryApi | null>(null);
  const [prevTotals, setPrevTotals] = useState<SalaryTotals | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryApiRow[]>([]);
  const [loanTxns, setLoanTxns] = useState<LoanTxn[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const pm = month === 1 ? 12 : month - 1;
    const py = month === 1 ? year - 1 : year;
    try {
      const [salRes, prevRes, dashRes, delRes, loanRes] = await Promise.all([
        fetch(`/api/salary?month=${month}&year=${year}`),
        fetch(`/api/salary?month=${pm}&year=${py}`),
        fetch(`/api/dashboard?month=${month}&year=${year}`),
        fetch(`/api/daily-deliveries?month=${month}&year=${year}`),
        fetch(`/api/loans?month=${month}&year=${year}`),
      ]);
      if (!salRes.ok || !dashRes.ok) throw new Error("load failed");
      setSalary(await salRes.json());
      setPrevTotals(prevRes.ok ? (await prevRes.json()).totals : null);
      setAnalytics(await dashRes.json());
      setDeliveries(delRes.ok ? await delRes.json() : []);
      setLoanTxns(loanRes.ok ? await loanRes.json() : []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  // ── derived data ────────────────────────────────────────────────────────────
  const filteredSalaryRows = useMemo(
    () => (salary?.employees || []).filter((r) => filter === "all" || r.employee.type === filter),
    [salary, filter]
  );

  const filteredTotals = useMemo(() => filteredSalaryRows.reduce(
    (a, r) => ({
      totalDeliveries: a.totalDeliveries + r.totalDeliveries,
      totalOtpCount: a.totalOtpCount + r.totalOtpCount,
      grossSalary: a.grossSalary + r.grossSalary,
      totalDeductions: a.totalDeductions + r.totalDeductions,
      netPayable: a.netPayable + r.netPayable,
      openingLoan: a.openingLoan + r.openingLoan,
      additionalLoan: a.additionalLoan + r.additionalLoan,
      loanCarryForward: a.loanCarryForward + r.loanCarryForward,
    }),
    { totalDeliveries: 0, totalOtpCount: 0, grossSalary: 0, totalDeductions: 0, netPayable: 0, openingLoan: 0, additionalLoan: 0, loanCarryForward: 0 }
  ), [filteredSalaryRows]);

  const { registerRows, registerTypes } = useMemo(() => {
    const typeAgg = new Map<string, RegisterType & { total: number }>();
    const empMap = new Map<string, RegisterRow & { daySet: Set<string> }>();
    const otpBonus = salary?.otpBonus ?? 2;
    for (const d of deliveries) {
      if (d.count <= 0) continue;
      const t = typeAgg.get(d.cylinderType.id) || { ...d.cylinderType, total: 0 };
      t.total += d.count;
      typeAgg.set(d.cylinderType.id, t);

      const e = empMap.get(d.employeeId) || {
        name: d.employee.name, perType: {}, total: 0, otp: 0, earnings: 0, days: 0, daySet: new Set<string>(),
      };
      const pt = e.perType[d.cylinderType.id] || { count: 0, otp: 0 };
      pt.count += d.count;
      pt.otp += d.otpCount;
      e.perType[d.cylinderType.id] = pt;
      e.total += d.count;
      e.otp += d.otpCount;
      e.earnings += d.count * d.cylinderType.price + d.otpCount * otpBonus;
      e.daySet.add(d.date.slice(0, 10));
      empMap.set(d.employeeId, e);
    }
    const types = [...typeAgg.values()].sort((a, b) => b.total - a.total).map(({ id, name, price }) => ({ id, name, price }));
    const rows = [...empMap.values()]
      .map((e) => ({ ...e, days: e.daySet.size }))
      .sort((a, b) => b.total - a.total);
    return { registerRows: rows as RegisterRow[], registerTypes: types };
  }, [deliveries, salary]);

  const loanRows = useMemo(
    () => (salary?.employees || []).filter(
      (r) => r.openingLoan > 0 || r.additionalLoan > 0 || r.loanCarryForward > 0 || (r.deductions.loan_instalment || 0) > 0
    ),
    [salary]
  );

  const loanTotals = useMemo(() => loanRows.reduce(
    (a, r) => ({
      open: a.open + r.openingLoan, add: a.add + r.additionalLoan,
      inst: a.inst + (r.deductions.loan_instalment || 0), cf: a.cf + r.loanCarryForward,
    }),
    { open: 0, add: 0, inst: 0, cf: 0 }
  ), [loanRows]);

  // analytics chart props
  const dayBars = useMemo(() => (analytics?.dailyTrend || []).map((d) => {
    const dt = new Date(d.date);
    return { label: String(dt.getDate()), value: d.count, highlight: dt.getDay() === 0, tip: `${formatCurrency(d.revenue)} · ${d.otp} OTP` };
  }), [analytics]);

  const mixSlices = useMemo(() => (analytics?.cylinderMix || []).map((c, i) => ({
    label: c.name, value: c.count, color: CHART_COLORS[i % CHART_COLORS.length],
  })), [analytics]);

  const dedSlices = useMemo(() => (analytics?.deductionBreakdown || []).map((d) => ({
    label: DED_LABELS[d.type] || d.type, value: d.amount, color: DED_COLORS[d.type] || "#94a3b8",
  })), [analytics]);

  const perfItems = useMemo(() => (analytics?.topPerformers || []).map((p) => ({ label: p.name, value: p.total })), [analytics]);

  const earningItems = useMemo(() =>
    (salary?.employees || [])
      .filter((r) => r.employee.type === "delivery" && r.grossSalary > 0)
      .sort((a, b) => b.grossSalary - a.grossSalary)
      .slice(0, 8)
      .map((r) => ({ label: r.employee.name, value: r.grossSalary })),
    [salary]
  );

  // ── exports ─────────────────────────────────────────────────────────────────
  async function handleExportPdf() {
    if (!salary || exporting) return;
    setExporting("pdf");
    try {
      const ex = await import("@/lib/exports");
      if (tab === "salary") {
        await ex.exportSalaryPdf({ month, year, filter, rows: filteredSalaryRows, otpBonus: salary.otpBonus });
      } else if (tab === "register") {
        await ex.exportDeliveryRegisterPdf({ month, year, types: registerTypes, rows: registerRows, otpBonus: salary.otpBonus });
      } else if (tab === "loans") {
        await ex.exportLoanStatementPdf({ month, year, rows: loanRows, txns: loanTxns });
      } else if (analytics) {
        await ex.exportAnalyticsPdf({ month, year, analytics, salaryTotals: salary.totals });
      }
      showToast("success", "PDF downloaded");
    } catch {
      showToast("error", "PDF export failed — please try again");
    } finally {
      setExporting(null);
    }
  }

  async function handleExportExcel() {
    if (!salary || exporting) return;
    setExporting("excel");
    try {
      const ex = await import("@/lib/exports");
      await ex.exportWorkbook({
        month, year,
        salaryRows: salary.employees,
        salaryTotals: salary.totals,
        otpBonus: salary.otpBonus,
        registerTypes, registerRows,
        dailyRows: deliveries
          .filter((d) => d.count > 0)
          .sort((a, b) => a.date.localeCompare(b.date) || a.employee.name.localeCompare(b.employee.name))
          .map((d) => ({
            date: d.date.slice(0, 10), employee: d.employee.name, type: d.cylinderType.name,
            count: d.count, otp: d.otpCount, price: d.cylinderType.price,
          })),
        loanRows, loanTxns, analytics,
      });
      showToast("success", "Excel workbook downloaded (5 sheets)");
    } catch {
      showToast("error", "Excel export failed — please try again");
    } finally {
      setExporting(null);
    }
  }

  // ── kpis ────────────────────────────────────────────────────────────────────
  const t = salary?.totals;
  const kpis = t ? [
    { label: "Gross Salary", value: formatCurrency(t.grossSalary), cur: t.grossSalary, prev: prevTotals?.grossSalary, invert: false, color: "text-blue-700", bg: "bg-blue-50 border-blue-100" },
    { label: "Deductions", value: formatCurrency(t.totalDeductions), cur: t.totalDeductions, prev: prevTotals?.totalDeductions, invert: true, color: "text-rose-700", bg: "bg-rose-50 border-rose-100" },
    { label: "Net Payable", value: formatCurrency(t.netPayable), cur: t.netPayable, prev: prevTotals?.netPayable, invert: false, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100" },
    { label: "Cylinders", value: t.totalDeliveries.toLocaleString("en-IN"), cur: t.totalDeliveries, prev: prevTotals?.totalDeliveries, invert: false, color: "text-slate-800", bg: "bg-slate-50 border-slate-200" },
    { label: "OTP Verified", value: t.totalOtpCount.toLocaleString("en-IN"), cur: t.totalOtpCount, prev: prevTotals?.totalOtpCount, invert: false, color: "text-violet-700", bg: "bg-violet-50 border-violet-100" },
    { label: "Loan C/F", value: formatCurrency(t.loanCarryForward), cur: t.loanCarryForward, prev: prevTotals?.loanCarryForward, invert: true, color: "text-amber-700", bg: "bg-amber-50 border-amber-100" },
  ] : [];

  const monthLabel = `${getMonthName(month)} ${year}`;

  return (
    <div className="animate-fade-in">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* print-only letterhead */}
      <div className="hidden print:block mb-4 pb-3 border-b-2 border-slate-800">
        <h1 className="text-xl font-bold text-slate-900">ASTHA GAS AGENCY — Desainagar</h1>
        <p className="text-sm text-slate-600">
          {TABS.find((x) => x.key === tab)?.label} — {monthLabel} · FY {getFinancialYear(month, year)}
        </p>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 no-print">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Reports</h1>
          <p className="text-[13px] text-slate-500">
            FY {getFinancialYear(month, year)} — {monthLabel}
            <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
              {getMonthName(month).slice(0, 3)} {year}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarPicker month={month} year={year} onMonthChange={(m, y) => { setMonth(m); setYear(y); }} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-5 no-print">
        <CustomSelect
          options={[
            { value: "all", label: "All Staff" },
            { value: "delivery", label: "Delivery Staff" },
            { value: "office", label: "Office Staff" },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          className="w-40"
        />

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={handleExportExcel}
            disabled={loading || !!exporting || !salary}
            className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-medium rounded-lg hover:bg-emerald-100 transition flex items-center gap-2 disabled:opacity-50"
            title="Download full monthly workbook — Summary, Salary, Delivery Register, Daily Log, Loans"
          >
            {exporting === "excel" ? (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
            {exporting === "excel" ? "Building..." : "Excel"}
            <span className="hidden md:inline text-[10px] font-normal text-emerald-500">5 sheets</span>
          </button>

          <button
            onClick={handleExportPdf}
            disabled={loading || !!exporting || !salary}
            className="px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 text-sm font-medium rounded-lg hover:bg-rose-100 transition flex items-center gap-2 disabled:opacity-50"
            title={`Download ${TABS.find((x) => x.key === tab)?.label} as PDF`}
          >
            {exporting === "pdf" ? (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            )}
            {exporting === "pdf" ? "Building..." : "PDF"}
            <span className="hidden md:inline text-[10px] font-normal text-rose-400">{TABS.find((x) => x.key === tab)?.label}</span>
          </button>

          <button
            onClick={() => window.print()}
            disabled={loading}
            className="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition flex items-center gap-2 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </button>
        </div>
      </div>

      {loading ? (
        /* skeleton */
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-20 bg-white border border-slate-200 rounded-lg" />)}
          </div>
          <div className="h-10 w-96 max-w-full bg-white border border-slate-200 rounded-lg" />
          <div className="h-80 bg-white border border-slate-200 rounded-lg" />
        </div>
      ) : loadError ? (
        <div className="bg-white border border-slate-200 rounded-lg py-20 text-center">
          <svg className="w-10 h-10 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.834-1.964-.834-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-sm font-medium text-slate-600">Could not load report data</p>
          <p className="text-xs text-slate-400 mt-1">Check your connection and try again</p>
          <button onClick={load} className="mt-4 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition">
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* KPI strip with month-over-month deltas */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
            {kpis.map((k) => (
              <div key={k.label} className={cn("rounded-lg border p-3.5", k.bg)}>
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{k.label}</p>
                <p className={cn("text-lg font-semibold mt-1 tabular-nums truncate", k.color)}>{k.value}</p>
                <div className="mt-1">
                  <DeltaChip cur={k.cur} prev={k.prev ?? 0} invert={k.invert} />
                </div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5 w-fit mb-4 overflow-x-auto max-w-full no-print">
            {TABS.map((x) => (
              <button
                key={x.key}
                onClick={() => setTab(x.key)}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition whitespace-nowrap",
                  tab === x.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                {x.label}
              </button>
            ))}
          </div>

          {/* ═════════ SALARY SHEET ═════════ */}
          {tab === "salary" && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto print:border-0">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between no-print">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Salary Report — {monthLabel}</h2>
                  <p className="text-[11px] text-slate-400">
                    {filter === "all" ? "All staff" : filter === "delivery" ? "Delivery staff" : "Office staff"} · {filteredSalaryRows.length} employees · OTP bonus {formatCurrency(salary?.otpBonus || 2)}/cyl
                  </p>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">#</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Employee</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Type</th>
                    <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Cyl</th>
                    <th className="text-right px-3 py-2.5 text-xs font-medium text-emerald-600 uppercase tracking-wide">OTP</th>
                    <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Gross</th>
                    {DED_KEYS.map((k) => (
                      <th key={k} className="text-right px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">{DED_LABELS[k]}</th>
                    ))}
                    <th className="text-right px-3 py-2.5 text-xs font-medium text-rose-600 uppercase tracking-wide">Total Ded</th>
                    <th className="text-right px-3 py-2.5 text-xs font-medium text-emerald-700 uppercase tracking-wide">Net Payable</th>
                    <th className="text-right px-3 py-2.5 text-xs font-medium text-amber-600 uppercase tracking-wide">Loan C/F</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSalaryRows.map((s, i) => (
                    <tr key={s.employee.id} className="border-b border-slate-100 text-sm text-slate-600 hover:bg-slate-50 transition">
                      <td className="px-4 py-2.5 text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">{s.employee.name}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn(
                          "text-[11px] font-medium px-2 py-0.5 rounded-md",
                          s.employee.type === "delivery" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
                        )}>
                          {s.employee.type === "delivery" ? "Delivery" : "Office"}
                        </span>
                      </td>
                      <td className="text-right px-3 py-2.5 tabular-nums">
                        {s.employee.type === "delivery" ? s.totalDeliveries.toLocaleString("en-IN") : "—"}
                      </td>
                      <td className="text-right px-3 py-2.5 tabular-nums text-emerald-600">
                        {s.employee.type === "delivery" && s.totalOtpCount > 0 ? s.totalOtpCount.toLocaleString("en-IN") : "—"}
                      </td>
                      <td className="text-right px-3 py-2.5 font-medium tabular-nums">{formatCurrency(s.grossSalary)}</td>
                      {DED_KEYS.map((k) => (
                        <td key={k} className="text-right px-3 py-2.5 text-xs tabular-nums">
                          {s.deductions[k] ? (
                            <span className={k === "loan_instalment" ? "text-emerald-600 font-medium" : "text-slate-600"}>
                              {formatCurrency(s.deductions[k])}
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                      ))}
                      <td className="text-right px-3 py-2.5 text-rose-600 tabular-nums">{formatCurrency(s.totalDeductions)}</td>
                      <td className="text-right px-3 py-2.5 font-semibold text-emerald-700 tabular-nums">{formatCurrency(s.netPayable)}</td>
                      <td className="text-right px-3 py-2.5 text-amber-600 tabular-nums">
                        {s.loanCarryForward > 0 ? formatCurrency(s.loanCarryForward) : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-300 font-semibold text-sm text-slate-800">
                    <td className="px-4 py-3" colSpan={3}>TOTAL ({filteredSalaryRows.length})</td>
                    <td className="text-right px-3 py-3 tabular-nums">{filteredTotals.totalDeliveries.toLocaleString("en-IN")}</td>
                    <td className="text-right px-3 py-3 tabular-nums text-emerald-600">{filteredTotals.totalOtpCount.toLocaleString("en-IN")}</td>
                    <td className="text-right px-3 py-3 tabular-nums">{formatCurrency(filteredTotals.grossSalary)}</td>
                    {DED_KEYS.map((k) => (
                      <td key={k} className="text-right px-3 py-3 text-xs tabular-nums">
                        {formatCurrency(filteredSalaryRows.reduce((a, r) => a + (r.deductions[k] || 0), 0))}
                      </td>
                    ))}
                    <td className="text-right px-3 py-3 text-rose-700 tabular-nums">{formatCurrency(filteredTotals.totalDeductions)}</td>
                    <td className="text-right px-3 py-3 text-emerald-700 tabular-nums">{formatCurrency(filteredTotals.netPayable)}</td>
                    <td className="text-right px-3 py-3 text-amber-600 tabular-nums">{formatCurrency(filteredTotals.loanCarryForward)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* ═════════ DELIVERY REGISTER ═════════ */}
          {tab === "register" && (
            registerRows.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg py-16 text-center text-sm text-slate-400">
                No deliveries recorded in {monthLabel}
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto print:border-0">
                <div className="p-4 border-b border-slate-100 no-print">
                  <h2 className="text-sm font-semibold text-slate-800">Delivery Register — {monthLabel}</h2>
                  <p className="text-[11px] text-slate-400">Per delivery man, split by cylinder type · OTP-verified count in brackets</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">#</th>
                      <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Delivery Man</th>
                      {registerTypes.map((tp) => (
                        <th key={tp.id} className="text-right px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">
                          {tp.name}
                          <span className="block text-[9px] font-normal text-slate-400 normal-case">@ {formatCurrency(tp.price)}</span>
                        </th>
                      ))}
                      <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-700 uppercase tracking-wide">Total</th>
                      <th className="text-right px-3 py-2.5 text-xs font-medium text-emerald-600 uppercase tracking-wide">OTP</th>
                      <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Days</th>
                      <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Avg/Day</th>
                      <th className="text-right px-3 py-2.5 text-xs font-medium text-blue-700 uppercase tracking-wide">Earnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registerRows.map((r, i) => (
                      <tr key={r.name} className="border-b border-slate-100 text-sm text-slate-600 hover:bg-slate-50 transition">
                        <td className="px-4 py-2.5">
                          <span className={cn(
                            "inline-flex w-5 h-5 rounded-full items-center justify-center text-[10px] font-semibold",
                            i === 0 ? "bg-amber-500 text-white" : i === 1 ? "bg-slate-400 text-white" : i === 2 ? "bg-amber-700 text-white" : "bg-slate-100 text-slate-500"
                          )}>
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">{r.name}</td>
                        {registerTypes.map((tp) => {
                          const c = r.perType[tp.id];
                          return (
                            <td key={tp.id} className="text-right px-3 py-2.5 tabular-nums">
                              {c && c.count > 0 ? (
                                <span>
                                  {c.count.toLocaleString("en-IN")}
                                  {c.otp > 0 && <span className="text-emerald-600 text-xs"> ({c.otp.toLocaleString("en-IN")})</span>}
                                </span>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                          );
                        })}
                        <td className="text-right px-3 py-2.5 font-semibold text-slate-800 tabular-nums">{r.total.toLocaleString("en-IN")}</td>
                        <td className="text-right px-3 py-2.5 text-emerald-600 tabular-nums">{r.otp.toLocaleString("en-IN")}</td>
                        <td className="text-right px-3 py-2.5 tabular-nums">{r.days}</td>
                        <td className="text-right px-3 py-2.5 tabular-nums text-slate-500">{r.days > 0 ? (r.total / r.days).toFixed(1) : "—"}</td>
                        <td className="text-right px-3 py-2.5 font-medium text-blue-700 tabular-nums">{formatCurrency(r.earnings)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-slate-300 font-semibold text-sm text-slate-800">
                      <td className="px-4 py-3" colSpan={2}>TOTAL ({registerRows.length})</td>
                      {registerTypes.map((tp) => (
                        <td key={tp.id} className="text-right px-3 py-3 tabular-nums">
                          {registerRows.reduce((a, r) => a + (r.perType[tp.id]?.count || 0), 0).toLocaleString("en-IN")}
                        </td>
                      ))}
                      <td className="text-right px-3 py-3 tabular-nums">{registerRows.reduce((a, r) => a + r.total, 0).toLocaleString("en-IN")}</td>
                      <td className="text-right px-3 py-3 text-emerald-600 tabular-nums">{registerRows.reduce((a, r) => a + r.otp, 0).toLocaleString("en-IN")}</td>
                      <td colSpan={2}></td>
                      <td className="text-right px-3 py-3 text-blue-700 tabular-nums">{formatCurrency(registerRows.reduce((a, r) => a + r.earnings, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          )}

          {/* ═════════ LOAN STATEMENT ═════════ */}
          {tab === "loans" && (
            <div className="space-y-4">
              {loanRows.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-lg py-16 text-center text-sm text-slate-400">
                  No loan activity in {monthLabel}
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto print:border-0">
                  <div className="p-4 border-b border-slate-100 no-print">
                    <h2 className="text-sm font-semibold text-slate-800">Loan &amp; Advance Statement — {monthLabel}</h2>
                    <p className="text-[11px] text-slate-400">Opening + new loans − instalments = carry forward</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">#</th>
                        <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Employee</th>
                        <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Opening</th>
                        <th className="text-right px-3 py-2.5 text-xs font-medium text-amber-600 uppercase tracking-wide">New Loan</th>
                        <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Net Loan</th>
                        <th className="text-right px-3 py-2.5 text-xs font-medium text-emerald-600 uppercase tracking-wide">Instalment</th>
                        <th className="text-right px-3 py-2.5 text-xs font-medium text-rose-600 uppercase tracking-wide">Carry Fwd</th>
                        <th className="text-center px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loanRows.map((r, i) => (
                        <tr key={r.employee.id} className="border-b border-slate-100 text-sm text-slate-600 hover:bg-slate-50 transition">
                          <td className="px-4 py-2.5 text-slate-400 tabular-nums">{i + 1}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{r.employee.name}</td>
                          <td className="text-right px-3 py-2.5 tabular-nums">{r.openingLoan > 0 ? formatCurrency(r.openingLoan) : <span className="text-slate-300">—</span>}</td>
                          <td className="text-right px-3 py-2.5 text-amber-600 tabular-nums">{r.additionalLoan > 0 ? formatCurrency(r.additionalLoan) : <span className="text-slate-300">—</span>}</td>
                          <td className="text-right px-3 py-2.5 font-medium tabular-nums">{formatCurrency(r.netLoan)}</td>
                          <td className="text-right px-3 py-2.5 text-emerald-600 tabular-nums">{r.deductions.loan_instalment ? formatCurrency(r.deductions.loan_instalment) : <span className="text-slate-300">—</span>}</td>
                          <td className="text-right px-3 py-2.5 text-rose-600 font-medium tabular-nums">{r.loanCarryForward > 0 ? formatCurrency(r.loanCarryForward) : <span className="text-slate-300">—</span>}</td>
                          <td className="text-center px-3 py-2.5">
                            <span className={cn(
                              "text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase",
                              r.loanCarryForward <= 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                            )}>
                              {r.loanCarryForward <= 0 ? "Cleared" : "Active"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 border-t border-slate-300 font-semibold text-sm text-slate-800">
                        <td className="px-4 py-3" colSpan={2}>TOTAL ({loanRows.length})</td>
                        <td className="text-right px-3 py-3 tabular-nums">{formatCurrency(loanTotals.open)}</td>
                        <td className="text-right px-3 py-3 text-amber-600 tabular-nums">{formatCurrency(loanTotals.add)}</td>
                        <td className="text-right px-3 py-3 tabular-nums">{formatCurrency(loanTotals.open + loanTotals.add)}</td>
                        <td className="text-right px-3 py-3 text-emerald-600 tabular-nums">{formatCurrency(loanTotals.inst)}</td>
                        <td className="text-right px-3 py-3 text-rose-600 tabular-nums">{formatCurrency(loanTotals.cf)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* disbursements */}
              <div className="bg-white border border-slate-200 rounded-lg print:border-0">
                <div className="p-4 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-800">Disbursements — {monthLabel}</h2>
                  <p className="text-[11px] text-slate-400">{loanTxns.length} loan{loanTxns.length !== 1 ? "s" : ""} given this month</p>
                </div>
                {loanTxns.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-400">No new loans disbursed this month</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Date</th>
                        <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Employee</th>
                        <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Amount</th>
                        <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loanTxns.map((x) => (
                        <tr key={x.id} className="border-b border-slate-100 text-sm text-slate-600 hover:bg-slate-50 transition">
                          <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                            {new Date(x.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{x.employee.name}</td>
                          <td className="text-right px-3 py-2.5 font-medium text-amber-600 tabular-nums">{formatCurrency(x.amount)}</td>
                          <td className="px-3 py-2.5 text-slate-500">{x.note || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ═════════ ANALYTICS ═════════ */}
          {tab === "analytics" && analytics && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-5">
                  <div className="mb-4">
                    <h2 className="text-[13px] font-semibold text-slate-800">Daily Deliveries — {monthLabel}</h2>
                    <p className="text-[11px] text-slate-400">Hover for payout &amp; OTP · Sundays in amber</p>
                  </div>
                  <Histogram data={dayBars} />
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <div className="mb-4">
                    <h2 className="text-[13px] font-semibold text-slate-800">Cylinder Mix</h2>
                    <p className="text-[11px] text-slate-400">Share of deliveries by type</p>
                  </div>
                  <Donut data={mixSlices} centerLabel="cylinders" />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <div className="mb-4">
                    <h2 className="text-[13px] font-semibold text-slate-800">Deductions Breakdown</h2>
                    <p className="text-[11px] text-slate-400">Total {formatCurrency(t?.totalDeductions || 0)}</p>
                  </div>
                  <Donut data={dedSlices} size={160} centerLabel="deducted" valueFmt={(n) => formatCurrency(n)} />
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <div className="mb-4">
                    <h2 className="text-[13px] font-semibold text-slate-800">Top Performers</h2>
                    <p className="text-[11px] text-slate-400">Cylinders delivered</p>
                  </div>
                  <HBars data={perfItems} rank />
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <div className="mb-4">
                    <h2 className="text-[13px] font-semibold text-slate-800">Top Earnings</h2>
                    <p className="text-[11px] text-slate-400">Gross salary — delivery staff</p>
                  </div>
                  <HBars data={earningItems} valueFmt={(n) => formatCurrency(n)} barColor="#3b82f6" />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
