"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import CalendarPicker from "@/components/CalendarPicker";
import Modal from "@/components/Modal";
import Toast from "@/components/Toast";
import { formatCurrency, getMonthName, cn } from "@/lib/utils";

interface EmployeeSalary {
  employee: {
    id: string;
    name: string;
    type: string;
    rate: number;
    fixedSalary: number;
  };
  totalDeliveries: number;
  totalOtpCount: number;
  grossSalary: number;
  openingLoan: number;
  additionalLoan: number;
  netLoan: number;
  deductions: Record<string, number>;
  totalDeductions: number;
  netPayable: number;
  loanCarryForward: number;
}

const DEDUCTION_TYPES = [
  { key: "pf", label: "PF" },
  { key: "loan_instalment", label: "Loan Instalment" },
  { key: "upad_1", label: "UPAD 1st" },
  { key: "upad_15", label: "UPAD 15th" },
  { key: "upad_other", label: "UPAD Other" },
];

export default function SalaryPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<{ employees: EmployeeSalary[]; otpBonus: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"delivery" | "office">("delivery");

  // Deduction modal
  const [deductionModal, setDeductionModal] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<EmployeeSalary | null>(null);
  const [deductionValues, setDeductionValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Settle Loan modal
  const [settleModal, setSettleModal] = useState(false);
  const [settleEmp, setSettleEmp] = useState<EmployeeSalary | null>(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [settling, setSettling] = useState(false);

  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  function showToast(type: "success" | "error", message: string) {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast({ type, message });
    toastTimeout.current = setTimeout(() => setToast(null), 3500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/salary?month=${month}&year=${year}`);
      setData(await res.json());
    } catch {
      showToast("error", "Failed to load salary data");
    }
    setLoading(false);
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  function openDeductions(emp: EmployeeSalary) {
    setSelectedEmp(emp);
    const vals: Record<string, string> = {};
    DEDUCTION_TYPES.forEach((d) => { vals[d.key] = (emp.deductions[d.key] || 0).toString(); });
    setDeductionValues(vals);
    setDeductionModal(true);
  }

  async function saveDeductions() {
    if (!selectedEmp) return;
    setSaving(true);
    const entries = DEDUCTION_TYPES.map((d) => ({
      employeeId: selectedEmp.employee.id,
      month, year,
      type: d.key,
      amount: Number(deductionValues[d.key]) || 0,
    }));

    try {
      const res = await fetch("/api/deductions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entries),
      });
      if (!res.ok) throw new Error();
      setDeductionModal(false);
      showToast("success", `Deductions saved for ${selectedEmp.employee.name}`);
      load();
    } catch {
      showToast("error", "Failed to save deductions");
    }
    setSaving(false);
  }

  function openSettle(emp: EmployeeSalary) {
    setSettleEmp(emp);
    const currentInstalment = emp.deductions?.loan_instalment || 0;
    const nonLoanDeductions = emp.totalDeductions - currentInstalment;
    const availableFromSalary = Math.max(0, emp.grossSalary - nonLoanDeductions);
    const suggested = Math.min(availableFromSalary, emp.netLoan);
    setSettleAmount(suggested > 0 ? suggested.toString() : "");
    setSettleModal(true);
  }

  const settlePreview = useMemo(() => {
    if (!settleEmp || !settleAmount) return null;
    const amt = Number(settleAmount);
    if (isNaN(amt) || amt <= 0) return null;

    const currentInstalment = settleEmp.deductions?.loan_instalment || 0;
    const nonLoanDeductions = settleEmp.totalDeductions - currentInstalment;
    const newTotalDeductions = nonLoanDeductions + amt;
    const newNetPayable = settleEmp.grossSalary - newTotalDeductions;
    const newLoanCarryForward = settleEmp.netLoan - amt;

    return {
      newInstalment: amt,
      newTotalDeductions,
      newNetPayable,
      newLoanCarryForward: Math.max(0, newLoanCarryForward),
      isFullSettle: newLoanCarryForward <= 0,
    };
  }, [settleEmp, settleAmount]);

  async function handleSettle() {
    if (!settleEmp || !settleAmount) return;
    setSettling(true);
    try {
      const res = await fetch("/api/deductions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{
          employeeId: settleEmp.employee.id, month, year,
          type: "loan_instalment",
          amount: Number(settleAmount),
        }]),
      });
      if (!res.ok) throw new Error();
      setSettleModal(false);
      const preview = settlePreview;
      showToast(
        "success",
        preview?.isFullSettle
          ? `Loan fully settled for ${settleEmp.employee.name}!`
          : `${formatCurrency(Number(settleAmount))} settled from salary for ${settleEmp.employee.name}`
      );
      load();
    } catch {
      showToast("error", "Failed to settle loan");
    }
    setSettling(false);
  }

  const filtered = data?.employees.filter((e) => e.employee.type === tab) || [];
  const otpBonus = data?.otpBonus || 2;

  const filteredTotals = filtered.reduce(
    (acc, s) => ({
      totalDeliveries: acc.totalDeliveries + s.totalDeliveries,
      totalOtpCount: acc.totalOtpCount + s.totalOtpCount,
      grossSalary: acc.grossSalary + s.grossSalary,
      totalDeductions: acc.totalDeductions + s.totalDeductions,
      netPayable: acc.netPayable + s.netPayable,
      openingLoan: acc.openingLoan + s.openingLoan,
      loanCarryForward: acc.loanCarryForward + s.loanCarryForward,
    }),
    { totalDeliveries: 0, totalOtpCount: 0, grossSalary: 0, totalDeductions: 0, netPayable: 0, openingLoan: 0, loanCarryForward: 0 }
  );

  return (
    <div className="animate-fade-in">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Monthly Salary</h1>
          <p className="text-[13px] text-slate-500">{getMonthName(month)} {year} — Salary Sheet</p>
        </div>
        <CalendarPicker month={month} year={year} onMonthChange={(m, y) => { setMonth(m); setYear(y); }} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
          <p className="text-[11px] font-medium text-blue-600 uppercase tracking-wide">Gross Salary</p>
          <p className="text-xl font-semibold text-slate-800 mt-1 tabular-nums">{formatCurrency(filteredTotals.grossSalary)}</p>
        </div>
        <div className="bg-rose-50 rounded-lg border border-rose-200 p-4">
          <p className="text-[11px] font-medium text-rose-600 uppercase tracking-wide">Deductions</p>
          <p className="text-xl font-semibold text-slate-800 mt-1 tabular-nums">{formatCurrency(filteredTotals.totalDeductions)}</p>
        </div>
        <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-4">
          <p className="text-[11px] font-medium text-emerald-600 uppercase tracking-wide">Net Payable</p>
          <p className="text-xl font-semibold text-slate-800 mt-1 tabular-nums">{formatCurrency(filteredTotals.netPayable)}</p>
        </div>
        <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
          <p className="text-[11px] font-medium text-amber-600 uppercase tracking-wide">Loan Balance</p>
          <p className="text-xl font-semibold text-slate-800 mt-1 tabular-nums">{formatCurrency(filteredTotals.loanCarryForward)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-slate-100 rounded-lg p-0.5 inline-flex mb-4">
        <button
          onClick={() => setTab("delivery")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-colors",
            tab === "delivery" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          Delivery Staff
        </button>
        <button
          onClick={() => setTab("office")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-colors",
            tab === "office" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          Office Staff
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400">
          <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Loading...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 flex items-center justify-center h-48 text-slate-400 text-sm">
          No {tab} staff salary data for this month
        </div>
      ) : (
        <>
          {/* Mobile: Card View */}
          <div className="sm:hidden space-y-3">
            {filtered.map((s) => {
              const hasLoan = s.netLoan > 0 || s.loanCarryForward > 0;
              return (
                <div key={s.employee.id} className="bg-white rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-semibold">
                        {s.employee.name[0]}
                      </div>
                      <span className="text-sm font-semibold text-slate-800">{s.employee.name}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {tab === "delivery" && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Cylinders</span>
                          <span className="font-medium text-slate-700 tabular-nums">{s.totalDeliveries}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">OTP</span>
                          <span className="font-medium text-emerald-600 tabular-nums">{s.totalOtpCount}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-500">Gross</span>
                      <span className="font-medium text-slate-700 tabular-nums">{formatCurrency(s.grossSalary)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Deductions</span>
                      <span className="font-medium text-rose-600 tabular-nums">{formatCurrency(s.totalDeductions)}</span>
                    </div>
                  </div>

                  {hasLoan && (
                    <div className="mt-3 bg-amber-50 rounded-md px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-amber-700">
                        Loan: {formatCurrency(s.netLoan)} → C/F: {formatCurrency(s.loanCarryForward)}
                      </span>
                      {(s.deductions?.loan_instalment || 0) > 0 && (
                        <span className="text-emerald-600 font-medium tabular-nums">
                          Paid: {formatCurrency(s.deductions.loan_instalment)}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-sm text-slate-500">Net Payable</span>
                    <span className="text-base font-semibold text-emerald-700 tabular-nums">{formatCurrency(s.netPayable)}</span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    {hasLoan && (
                      <button onClick={() => openSettle(s)} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors">
                        Settle
                      </button>
                    )}
                    <button onClick={() => openDeductions(s)} className="text-xs font-medium px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors">
                      Edit Ded.
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: Table View */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto hidden sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Employee</th>
                  {tab === "delivery" && (
                    <>
                      <th className="text-right px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Cylinders</th>
                      <th className="text-right px-3 py-3 text-xs font-medium text-emerald-600 uppercase tracking-wide">OTP</th>
                    </>
                  )}
                  <th className="text-right px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Gross</th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Loan Bal.</th>
                  {DEDUCTION_TYPES.map((d) => (
                    <th key={d.key} className="text-right px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">{d.label}</th>
                  ))}
                  <th className="text-right px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Total Ded.</th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Net Payable</th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Loan C/F</th>
                  <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const hasLoan = s.netLoan > 0 || s.loanCarryForward > 0;
                  return (
                    <tr key={s.employee.id} className="border-b border-slate-100 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">{s.employee.name}</td>
                      {tab === "delivery" && (
                        <>
                          <td className="text-right px-3 py-3 tabular-nums">{s.totalDeliveries.toLocaleString("en-IN")}</td>
                          <td className="text-right px-3 py-3 tabular-nums text-emerald-600 font-medium">
                            {s.totalOtpCount > 0 ? s.totalOtpCount.toLocaleString("en-IN") : <span className="text-slate-300">—</span>}
                          </td>
                        </>
                      )}
                      <td className="text-right px-3 py-3 font-medium text-slate-800 tabular-nums">{formatCurrency(s.grossSalary)}</td>
                      <td className="text-right px-3 py-3 text-amber-700 tabular-nums">{formatCurrency(s.netLoan)}</td>
                      {DEDUCTION_TYPES.map((d) => (
                        <td key={d.key} className="text-right px-3 py-3 text-xs tabular-nums">
                          {s.deductions[d.key] ? (
                            <span className={d.key === "loan_instalment" ? "text-emerald-600 font-medium" : "text-slate-600"}>
                              {formatCurrency(s.deductions[d.key])}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      ))}
                      <td className="text-right px-3 py-3 font-medium text-rose-600 tabular-nums">{formatCurrency(s.totalDeductions)}</td>
                      <td className="text-right px-3 py-3 font-bold text-emerald-700 tabular-nums">{formatCurrency(s.netPayable)}</td>
                      <td className="text-right px-3 py-3 text-amber-600 tabular-nums">{formatCurrency(s.loanCarryForward)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-2">
                          {hasLoan && (
                            <button onClick={() => openSettle(s)} className="text-xs text-emerald-700 hover:text-emerald-800 font-medium whitespace-nowrap bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-lg transition-colors">
                              Settle
                            </button>
                          )}
                          <button onClick={() => openDeductions(s)} className="text-xs text-slate-500 hover:text-slate-700 font-medium whitespace-nowrap transition-colors">
                            Edit Ded.
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-300 font-semibold">
                  <td className="px-4 py-3 text-slate-800">TOTAL</td>
                  {tab === "delivery" && (
                    <>
                      <td className="text-right px-3 py-3 text-slate-800 tabular-nums">{filteredTotals.totalDeliveries.toLocaleString("en-IN")}</td>
                      <td className="text-right px-3 py-3 text-emerald-600 tabular-nums">{filteredTotals.totalOtpCount.toLocaleString("en-IN")}</td>
                    </>
                  )}
                  <td className="text-right px-3 py-3 text-slate-800 tabular-nums">{formatCurrency(filteredTotals.grossSalary)}</td>
                  <td className="text-right px-3 py-3 text-amber-700 tabular-nums">{formatCurrency(filteredTotals.openingLoan)}</td>
                  {DEDUCTION_TYPES.map((d) => {
                    const sum = filtered.reduce((a, s) => a + (s.deductions[d.key] || 0), 0);
                    return (
                      <td key={d.key} className="text-right px-3 py-3 text-slate-600 text-xs tabular-nums">
                        {sum > 0 ? formatCurrency(sum) : <span className="text-slate-300">—</span>}
                      </td>
                    );
                  })}
                  <td className="text-right px-3 py-3 text-rose-600 tabular-nums">{formatCurrency(filteredTotals.totalDeductions)}</td>
                  <td className="text-right px-3 py-3 text-emerald-700 tabular-nums">{formatCurrency(filteredTotals.netPayable)}</td>
                  <td className="text-right px-3 py-3 text-amber-600 tabular-nums">{formatCurrency(filteredTotals.loanCarryForward)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {/* Deduction Modal */}
      <Modal open={deductionModal} onClose={() => setDeductionModal(false)} title={`Deductions — ${selectedEmp?.employee.name}`}>
        <div className="space-y-4">
          {DEDUCTION_TYPES.map((d) => (
            <div key={d.key} className="flex items-center justify-between gap-4">
              <label className="text-sm font-medium text-slate-700 whitespace-nowrap">{d.label}</label>
              <input
                type="number"
                value={deductionValues[d.key] || ""}
                onChange={(e) => setDeductionValues({ ...deductionValues, [d.key]: e.target.value })}
                className="w-40 rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none text-right tabular-nums"
                placeholder="0"
              />
            </div>
          ))}
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button onClick={() => setDeductionModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
            <button onClick={saveDeductions} disabled={saving} className="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors">
              {saving ? "Saving..." : "Save Deductions"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Settle Loan Modal */}
      <Modal open={settleModal} onClose={() => setSettleModal(false)} title={`Settle Loan — ${settleEmp?.employee.name}`}>
        {settleEmp && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-4 space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Gross Salary</span>
                <span className="font-semibold text-slate-800 tabular-nums">{formatCurrency(settleEmp.grossSalary)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Loan Balance</span>
                <span className="font-semibold text-rose-600 tabular-nums">{formatCurrency(settleEmp.netLoan)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Other Deductions</span>
                <span className="font-medium text-slate-600 tabular-nums">
                  {formatCurrency(settleEmp.totalDeductions - (settleEmp.deductions?.loan_instalment || 0))}
                </span>
              </div>
            </div>

            {settleEmp.grossSalary >= settleEmp.netLoan ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-2 text-sm text-emerald-700">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Salary covers the full loan — can fully settle</span>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-sm text-amber-700">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.834-1.964-.834-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span>Salary less than loan — partial settle</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Settlement Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                <input
                  type="number"
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  min="0"
                  max={settleEmp.netLoan}
                  className="w-full pl-7 pr-3 rounded-lg border border-slate-200 text-sm py-2 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none text-right tabular-nums font-semibold"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setSettleAmount(Math.min(settleEmp.grossSalary, settleEmp.netLoan).toString())}
                  className="text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors"
                >Max from salary</button>
                <button
                  onClick={() => setSettleAmount(settleEmp.netLoan.toString())}
                  className="text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors"
                >Full loan</button>
              </div>
            </div>

            {settlePreview && (
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-4 space-y-2 animate-fade-in">
                <p className="text-xs font-medium text-emerald-700 uppercase tracking-wide mb-1">After Settlement</p>
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-600">Net Payable</span>
                  <span className={cn("font-semibold tabular-nums", settlePreview.newNetPayable >= 0 ? "text-emerald-700" : "text-rose-600")}>
                    {formatCurrency(settlePreview.newNetPayable)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-600">Loan Carry Forward</span>
                  <span className={cn("font-semibold tabular-nums", settlePreview.newLoanCarryForward > 0 ? "text-amber-600" : "text-emerald-700")}>
                    {settlePreview.isFullSettle ? formatCurrency(0) : formatCurrency(settlePreview.newLoanCarryForward)}
                  </span>
                </div>
                {settlePreview.newNetPayable < 0 && (
                  <p className="text-xs text-rose-600 mt-1">Net payable is negative.</p>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setSettleModal(false)} className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSettle}
                disabled={settling || !settleAmount || Number(settleAmount) <= 0}
                className="flex-1 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-medium rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
              >
                {settling ? "Settling..." : "Apply Settlement"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
