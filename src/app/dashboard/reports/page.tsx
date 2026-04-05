"use client";

import { useState, useEffect, useCallback } from "react";
import MonthSelector from "@/components/MonthSelector";
import { formatCurrency, getMonthName, getFinancialYear, cn } from "@/lib/utils";

interface EmployeeSalary {
  employee: { id: string; name: string; type: string; rate: number; fixedSalary: number };
  totalDeliveries: number;
  grossSalary: number;
  openingLoan: number;
  additionalLoan: number;
  netLoan: number;
  deductions: Record<string, number>;
  totalDeductions: number;
  netPayable: number;
  loanCarryForward: number;
}

export default function ReportsPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<{ employees: EmployeeSalary[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportType, setExportType] = useState<"delivery" | "office" | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/salary?month=${month}&year=${year}`);
      setData(await res.json());
    } catch { /* empty state */ }
    setLoading(false);
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const filtered = data?.employees.filter(
    (e) => exportType === "all" || e.employee.type === exportType
  ) || [];

  const totals = filtered.reduce(
    (acc, s) => ({
      grossSalary: acc.grossSalary + s.grossSalary,
      totalDeductions: acc.totalDeductions + s.totalDeductions,
      netPayable: acc.netPayable + s.netPayable,
      totalDeliveries: acc.totalDeliveries + s.totalDeliveries,
      openingLoan: acc.openingLoan + s.openingLoan,
      loanCarryForward: acc.loanCarryForward + s.loanCarryForward,
    }),
    { grossSalary: 0, totalDeductions: 0, netPayable: 0, totalDeliveries: 0, openingLoan: 0, loanCarryForward: 0 }
  );

  function downloadCSV() {
    const headers = [
      "Employee", "Type", "Deliveries", "Gross Salary",
      "Opening Loan", "PF", "Loan Instalment", "UPAD 1", "UPAD 15", "UPAD Other",
      "Total Deductions", "Net Payable", "Loan C/F"
    ];

    const rows = filtered.map((s) => [
      s.employee.name, s.employee.type, s.totalDeliveries, s.grossSalary,
      s.openingLoan, s.deductions.pf || 0, s.deductions.loan_instalment || 0,
      s.deductions.upad_1 || 0, s.deductions.upad_15 || 0, s.deductions.upad_other || 0,
      s.totalDeductions, s.netPayable, s.loanCarryForward,
    ]);

    rows.push([
      "TOTAL", "", totals.totalDeliveries, totals.grossSalary,
      totals.openingLoan, "", "", "", "", "",
      totals.totalDeductions, totals.netPayable, totals.loanCarryForward,
    ]);

    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Astha_Salary_${getMonthName(month)}_${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-fade-in font-[Poppins,sans-serif]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Reports</h1>
          <p className="text-[13px] text-slate-500">FY {getFinancialYear(month, year)} — {getMonthName(month)} {year}</p>
        </div>
        <MonthSelector month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 mb-5 no-print">
        <select
          value={exportType}
          onChange={(e) => setExportType(e.target.value as "delivery" | "office" | "all")}
          className="rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none bg-white transition"
        >
          <option value="all">All Staff</option>
          <option value="delivery">Delivery Staff</option>
          <option value="office">Office Staff</option>
        </select>
        <button
          onClick={downloadCSV}
          className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-medium rounded-lg hover:bg-emerald-100 transition flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </button>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-blue-50 rounded-lg border border-blue-100 p-4">
          <p className="text-xs font-medium text-slate-500">Gross Salary</p>
          <p className="text-lg font-semibold text-slate-800 mt-1 tabular-nums">{formatCurrency(totals.grossSalary)}</p>
        </div>
        <div className="bg-rose-50 rounded-lg border border-rose-100 p-4">
          <p className="text-xs font-medium text-slate-500">Total Deductions</p>
          <p className="text-lg font-semibold text-rose-700 mt-1 tabular-nums">{formatCurrency(totals.totalDeductions)}</p>
        </div>
        <div className="bg-emerald-50 rounded-lg border border-emerald-100 p-4">
          <p className="text-xs font-medium text-slate-500">Net Payable</p>
          <p className="text-lg font-semibold text-emerald-700 mt-1 tabular-nums">{formatCurrency(totals.netPayable)}</p>
        </div>
        <div className="bg-amber-50 rounded-lg border border-amber-100 p-4">
          <p className="text-xs font-medium text-slate-500">Outstanding Loans</p>
          <p className="text-lg font-semibold text-amber-700 mt-1 tabular-nums">{formatCurrency(totals.loanCarryForward)}</p>
        </div>
      </div>

      {/* Report Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
          Loading report...
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto print:border-0">
          {/* Print Header */}
          <div className="p-4 border-b border-slate-100 print:text-center">
            <h2 className="text-lg font-semibold text-slate-800">Astha Gas Agency — Desainagar</h2>
            <p className="text-[13px] text-slate-500">Salary Report — {getMonthName(month)} {year}</p>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">#</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Employee</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Type</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Deliveries</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Gross</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Deductions</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Net Payable</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Loan C/F</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={s.employee.id} className="border-b border-slate-100 text-sm text-slate-600 hover:bg-slate-50 transition">
                  <td className="px-4 py-2.5 text-slate-400 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">{s.employee.name}</td>
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
                  <td className="text-right px-3 py-2.5 font-medium tabular-nums">{formatCurrency(s.grossSalary)}</td>
                  <td className="text-right px-3 py-2.5 text-rose-600 tabular-nums">{formatCurrency(s.totalDeductions)}</td>
                  <td className="text-right px-3 py-2.5 font-semibold text-emerald-700 tabular-nums">{formatCurrency(s.netPayable)}</td>
                  <td className="text-right px-3 py-2.5 text-amber-600 tabular-nums">{formatCurrency(s.loanCarryForward)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-300 font-semibold text-sm text-slate-800">
                <td className="px-4 py-3" colSpan={3}>TOTAL ({filtered.length} employees)</td>
                <td className="text-right px-3 py-3 tabular-nums">{totals.totalDeliveries.toLocaleString("en-IN")}</td>
                <td className="text-right px-3 py-3 tabular-nums">{formatCurrency(totals.grossSalary)}</td>
                <td className="text-right px-3 py-3 text-rose-700 tabular-nums">{formatCurrency(totals.totalDeductions)}</td>
                <td className="text-right px-3 py-3 text-emerald-700 tabular-nums">{formatCurrency(totals.netPayable)}</td>
                <td className="text-right px-3 py-3 text-amber-600 tabular-nums">{formatCurrency(totals.loanCarryForward)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
