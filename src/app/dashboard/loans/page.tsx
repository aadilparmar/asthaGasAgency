"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import CalendarPicker from "@/components/CalendarPicker";
import CustomSelect from "@/components/CustomSelect";
import Modal from "@/components/Modal";
import Toast from "@/components/Toast";
import { formatCurrency, getMonthName, cn } from "@/lib/utils";

interface Employee {
  id: string;
  name: string;
  type: "delivery" | "office";
}

interface SalaryEmployee {
  employee: Employee & { rate: number; fixedSalary: number };
  totalDeliveries: number;
  grossSalary: number;
  openingLoan: number;
  additionalLoan: number;
  netLoan: number;
  loanCarryForward: number;
  totalLoansEver: number;
  deductions: Record<string, number>;
  totalDeductions: number;
  netPayable: number;
}

interface LoanTransaction {
  id: string;
  employeeId: string;
  amount: number;
  month: number;
  year: number;
  note: string;
  createdAt: string;
  employee: { id: string; name: string; type: string };
}

interface PaymentRecord {
  id: string;
  employeeId: string;
  month: number;
  year: number;
  amount: number;
  type: string;
}

export default function LoansPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [salaryData, setSalaryData] = useState<SalaryEmployee[]>([]);
  const [transactions, setTransactions] = useState<LoanTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // View state
  const [view, setView] = useState<"overview" | "transactions">("overview");
  const [loanFilter, setLoanFilter] = useState<"active" | "all">("active");
  const [txnSearch, setTxnSearch] = useState("");
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<Record<string, PaymentRecord[]>>({});

  // Add Loan modal state
  const [loanModalOpen, setLoanModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formEmployeeId, setFormEmployeeId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formNote, setFormNote] = useState("");

  // Record Payment modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [payEmpId, setPayEmpId] = useState("");
  const [payAmount, setPayAmount] = useState("");

  // Quick Settle state
  const [settlingEmpId, setSettlingEmpId] = useState<string | null>(null);

  // Delete state
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  function showToast(type: "success" | "error", message: string) {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast({ type, message });
    toastTimeout.current = setTimeout(() => setToast(null), 3500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, salRes, loanRes] = await Promise.all([
        fetch("/api/employees?active=true"),
        fetch(`/api/salary?month=${month}&year=${year}`),
        fetch(`/api/loans?month=${month}&year=${year}`),
      ]);
      setEmployees(await empRes.json());
      const salData = await salRes.json();
      setSalaryData(salData.employees || []);
      setTransactions(await loanRes.json());
    } catch {
      showToast("error", "Failed to load loan data");
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    load();
  }, [load]);

  // Fetch payment history for an employee when expanded
  async function loadPaymentHistory(empId: string) {
    if (paymentHistory[empId]) return;
    try {
      const res = await fetch(`/api/deductions?employeeId=${empId}&type=loan_instalment`);
      const data: PaymentRecord[] = await res.json();
      setPaymentHistory((prev) => ({ ...prev, [empId]: data }));
    } catch {
      // silently fail
    }
  }

  function handleExpand(empId: string) {
    if (expandedEmp === empId) {
      setExpandedEmp(null);
    } else {
      setExpandedEmp(empId);
      loadPaymentHistory(empId);
    }
  }

  // Computed totals
  const totals = useMemo(
    () =>
      salaryData.reduce(
        (acc, s) => ({
          openingLoan: acc.openingLoan + s.openingLoan,
          additionalLoan: acc.additionalLoan + s.additionalLoan,
          netLoan: acc.netLoan + s.netLoan,
          instalment: acc.instalment + (s.deductions?.loan_instalment || 0),
          carryForward: acc.carryForward + s.loanCarryForward,
        }),
        { openingLoan: 0, additionalLoan: 0, netLoan: 0, instalment: 0, carryForward: 0 }
      ),
    [salaryData]
  );

  const filteredEmployees = useMemo(() => {
    if (loanFilter === "all") return salaryData;
    return salaryData.filter(
      (s) =>
        s.openingLoan > 0 ||
        s.additionalLoan > 0 ||
        s.loanCarryForward > 0 ||
        (s.deductions?.loan_instalment || 0) > 0
    );
  }, [salaryData, loanFilter]);

  const filteredTransactions = useMemo(() => {
    if (!txnSearch.trim()) return transactions;
    const q = txnSearch.toLowerCase();
    return transactions.filter(
      (t) => t.employee.name.toLowerCase().includes(q) || (t.note && t.note.toLowerCase().includes(q))
    );
  }, [transactions, txnSearch]);

  function getEmpTransactions(empId: string) {
    return transactions.filter((t) => t.employeeId === empId);
  }

  const selectedLoanEmpData = useMemo(() => {
    if (!formEmployeeId) return null;
    return salaryData.find((s) => s.employee.id === formEmployeeId) || null;
  }, [formEmployeeId, salaryData]);

  const selectedPayEmpData = useMemo(() => {
    if (!payEmpId) return null;
    return salaryData.find((s) => s.employee.id === payEmpId) || null;
  }, [payEmpId, salaryData]);

  // ---- ADD LOAN ----
  async function handleAddLoan(e: React.FormEvent) {
    e.preventDefault();
    if (!formEmployeeId || !formAmount) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: formEmployeeId,
          amount: Number(formAmount),
          month,
          year,
          note: formNote,
        }),
      });
      if (!res.ok) throw new Error();
      setLoanModalOpen(false);
      setFormEmployeeId("");
      setFormAmount("");
      setFormNote("");
      showToast("success", "Loan added successfully");
      load();
    } catch {
      showToast("error", "Failed to add loan");
    } finally {
      setSubmitting(false);
    }
  }

  // ---- RECORD PAYMENT ----
  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payEmpId || !payAmount) return;
    setPaymentSubmitting(true);
    try {
      const currentInstalment = selectedPayEmpData?.deductions?.loan_instalment || 0;
      const newTotal = currentInstalment + Number(payAmount);

      const res = await fetch("/api/deductions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          {
            employeeId: payEmpId,
            month,
            year,
            type: "loan_instalment",
            amount: newTotal,
          },
        ]),
      });
      if (!res.ok) throw new Error();
      setPaymentModalOpen(false);
      setPayEmpId("");
      setPayAmount("");
      showToast("success", "Payment recorded successfully");
      setPaymentHistory({});
      load();
    } catch {
      showToast("error", "Failed to record payment");
    } finally {
      setPaymentSubmitting(false);
    }
  }

  // ---- QUICK SETTLE ----
  async function handleQuickSettle(emp: SalaryEmployee) {
    const settleAmount = Math.min(emp.grossSalary, emp.netLoan);
    if (settleAmount <= 0) {
      showToast("error", "Nothing to settle");
      return;
    }
    setSettlingEmpId(emp.employee.id);
    try {
      const res = await fetch("/api/deductions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          {
            employeeId: emp.employee.id,
            month,
            year,
            type: "loan_instalment",
            amount: settleAmount,
          },
        ]),
      });
      if (!res.ok) throw new Error();
      const remaining = emp.netLoan - settleAmount;
      showToast(
        "success",
        remaining <= 0
          ? `Loan fully settled for ${emp.employee.name}`
          : `₹${settleAmount.toLocaleString("en-IN")} settled for ${emp.employee.name} — ₹${remaining.toLocaleString("en-IN")} remaining`
      );
      setPaymentHistory({});
      load();
    } catch {
      showToast("error", "Failed to settle loan");
    } finally {
      setSettlingEmpId(null);
    }
  }

  // ---- DELETE TRANSACTION ----
  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/loans?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      showToast("success", "Loan transaction deleted");
      setDeleteConfirmId(null);
      load();
    } catch {
      showToast("error", "Failed to delete loan");
    } finally {
      setDeleting(null);
    }
  }

  const activeLoansCount = salaryData.filter(
    (s) => s.loanCarryForward > 0 || s.netLoan > 0
  ).length;

  return (
    <div className="animate-fade-in">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Loan Management</h1>
          <p className="text-[13px] text-slate-500">
            Track and manage employee loans — {getMonthName(month)} {year}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarPicker month={month} year={year} onMonthChange={(m, y) => { setMonth(m); setYear(y); }} />
          <button
            onClick={() => setPaymentModalOpen(true)}
            className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-medium rounded-lg hover:bg-emerald-100 transition flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
            </svg>
            Record Payment
          </button>
          <button
            onClick={() => setLoanModalOpen(true)}
            className="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Loan
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400">
          <svg className="animate-spin h-6 w-6 mr-2" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {/* Opening Loans */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-500">Opening Loans</p>
                  <p className="text-xl font-semibold text-slate-800 mt-1 truncate tabular-nums">{formatCurrency(totals.openingLoan)}</p>
                  <p className="text-[11px] text-slate-400 mt-1">Carried from previous months</p>
                </div>
                <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center flex-shrink-0 ml-2">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* New Loans */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-amber-600">New Loans</p>
                  <p className="text-xl font-semibold text-slate-800 mt-1 truncate tabular-nums">{formatCurrency(totals.additionalLoan)}</p>
                  <p className="text-[11px] text-amber-500 mt-1">{transactions.length} transaction{transactions.length !== 1 ? "s" : ""} this month</p>
                </div>
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0 ml-2">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Instalments Paid */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-emerald-600">Instalments Paid</p>
                  <p className="text-xl font-semibold text-slate-800 mt-1 truncate tabular-nums">{formatCurrency(totals.instalment)}</p>
                  <p className="text-[11px] text-emerald-500 mt-1">Recovered from salaries</p>
                </div>
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0 ml-2">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Carry Forward */}
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-rose-600">Carry Forward</p>
                  <p className="text-xl font-semibold text-slate-800 mt-1 truncate tabular-nums">{formatCurrency(totals.carryForward)}</p>
                  <p className="text-[11px] text-rose-500 mt-1">Outstanding balance</p>
                </div>
                <div className="w-8 h-8 bg-rose-100 rounded-lg flex items-center justify-center flex-shrink-0 ml-2">
                  <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* View Tabs */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setView("overview")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition",
                  view === "overview" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Loan Overview
                {activeLoansCount > 0 && (
                  <span className="ml-2 text-[11px] font-medium px-2 py-0.5 rounded-md bg-rose-50 text-rose-600">
                    {activeLoansCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setView("transactions")}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition",
                  view === "transactions" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Transactions
                {transactions.length > 0 && <span className="ml-2 text-xs text-slate-400">({transactions.length})</span>}
              </button>
            </div>

            {view === "overview" && (
              <div className="flex gap-2">
                <button
                  onClick={() => setLoanFilter("active")}
                  className={cn("px-3 py-1.5 text-xs font-medium rounded-lg transition", loanFilter === "active" ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-500 hover:text-slate-700")}
                >
                  Active Loans
                </button>
                <button
                  onClick={() => setLoanFilter("all")}
                  className={cn("px-3 py-1.5 text-xs font-medium rounded-lg transition", loanFilter === "all" ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-500 hover:text-slate-700")}
                >
                  All Employees
                </button>
              </div>
            )}

            {view === "transactions" && (
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={txnSearch}
                  onChange={(e) => setTxnSearch(e.target.value)}
                  placeholder="Search by name or note..."
                  className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none bg-white w-64"
                />
              </div>
            )}
          </div>

          {/* ===== OVERVIEW VIEW ===== */}
          {view === "overview" && (
            <>
              {filteredEmployees.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-lg py-16 text-center">
                  <svg className="w-12 h-12 mx-auto mb-3 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-slate-500 font-medium">
                    {loanFilter === "active" ? "No active loans this month" : "No employee data for this month"}
                  </p>
                  {loanFilter === "active" && (
                    <p className="text-slate-400 text-sm mt-1">Switch to &apos;All Employees&apos; to see everyone</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredEmployees.map((s) => {
                    const instalment = s.deductions?.loan_instalment || 0;
                    const hasActiveLoan = s.netLoan > 0 || s.loanCarryForward > 0;
                    const repaidPercent = s.netLoan > 0 ? Math.min(100, Math.round((instalment / s.netLoan) * 100)) : 0;
                    const empTxns = getEmpTransactions(s.employee.id);
                    const isExpanded = expandedEmp === s.employee.id;
                    const isSettling = settlingEmpId === s.employee.id;
                    const canSettle = hasActiveLoan && s.grossSalary > 0 && s.netLoan > 0;
                    const settleAmount = Math.min(s.grossSalary, s.netLoan);
                    const empPayments = paymentHistory[s.employee.id] || [];

                    return (
                      <div
                        key={s.employee.id}
                        className={cn(
                          "bg-white rounded-lg border transition",
                          hasActiveLoan ? "border-slate-200" : "border-slate-100"
                        )}
                      >
                        {/* Card Header */}
                        <div className="p-4 pb-0">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 bg-slate-200 text-slate-600 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                                {s.employee.name[0]}
                              </div>
                              <div>
                                <div className="font-medium text-slate-800 text-sm">{s.employee.name}</div>
                                <span
                                  className={cn(
                                    "text-[11px] font-medium px-2 py-0.5 rounded-md",
                                    s.employee.type === "delivery" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600"
                                  )}
                                >
                                  {s.employee.type === "delivery" ? "Delivery" : "Office"}
                                </span>
                              </div>
                            </div>
                            {hasActiveLoan && (
                              <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-200 rounded-md">
                                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                                <span className="text-[11px] font-medium text-amber-700">Active</span>
                              </div>
                            )}
                          </div>

                          {/* Balance & Progress */}
                          <div className="mb-3">
                            <div className="flex items-baseline justify-between mb-1">
                              <div>
                                <span className="text-xs text-slate-400 font-medium">Carry Forward</span>
                                <div className={cn("text-2xl font-semibold tabular-nums", s.loanCarryForward > 0 ? "text-rose-600" : "text-slate-300")}>
                                  {formatCurrency(s.loanCarryForward)}
                                </div>
                              </div>
                              {s.netLoan > 0 && (
                                <span className="text-xs text-slate-400 tabular-nums">{repaidPercent}% repaid</span>
                              )}
                            </div>
                            {s.netLoan > 0 && (
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    repaidPercent >= 70 ? "bg-emerald-500" : repaidPercent >= 40 ? "bg-amber-500" : "bg-rose-500"
                                  )}
                                  style={{ width: `${repaidPercent}%` }}
                                />
                              </div>
                            )}
                          </div>

                          {/* Salary vs Loan context */}
                          {hasActiveLoan && s.grossSalary > 0 && (
                            <div className="bg-slate-50 rounded-md px-3 py-2 mb-3 flex items-center justify-between text-xs">
                              <span className="text-slate-500">
                                Salary <span className="font-medium text-slate-700">{formatCurrency(s.grossSalary)}</span>
                                {" "}vs Loan <span className="font-medium text-slate-700">{formatCurrency(s.netLoan)}</span>
                              </span>
                              {s.grossSalary >= s.netLoan && (
                                <span className="text-emerald-600 font-medium">Can fully settle</span>
                              )}
                            </div>
                          )}

                          {/* Stats Grid */}
                          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                            <div className="bg-slate-50 rounded-md px-2.5 py-2">
                              <div className="text-slate-400 font-medium">Opening</div>
                              <div className="font-medium text-slate-700 tabular-nums mt-0.5">{formatCurrency(s.openingLoan)}</div>
                            </div>
                            <div className="bg-slate-50 rounded-md px-2.5 py-2">
                              <div className="text-amber-600 font-medium">+ New Loan</div>
                              <div className="font-medium text-amber-700 tabular-nums mt-0.5">{formatCurrency(s.additionalLoan)}</div>
                            </div>
                            <div className="bg-slate-50 rounded-md px-2.5 py-2">
                              <div className="text-emerald-600 font-medium">- Instalment</div>
                              <div className="font-medium text-emerald-700 tabular-nums mt-0.5">{formatCurrency(instalment)}</div>
                            </div>
                            <div className="bg-slate-50 rounded-md px-2.5 py-2">
                              <div className="text-slate-400 font-medium">Net Loan</div>
                              <div className="font-medium text-slate-700 tabular-nums mt-0.5">{formatCurrency(s.netLoan)}</div>
                            </div>
                          </div>

                          {/* Quick Settle Button */}
                          {canSettle && (
                            <button
                              onClick={() => handleQuickSettle(s)}
                              disabled={isSettling}
                              className="w-full py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium hover:bg-emerald-100 transition mb-3 flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                              {isSettling ? (
                                <>
                                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                  Settling...
                                </>
                              ) : s.grossSalary >= s.netLoan ? (
                                <>
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Settle Full Loan — {formatCurrency(settleAmount)} from salary
                                </>
                              ) : (
                                <>
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 1v8m0 0v1" />
                                  </svg>
                                  Partial Settle — {formatCurrency(settleAmount)} from salary
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Expand/Collapse for History */}
                        <button
                          onClick={() => handleExpand(s.employee.id)}
                          className="w-full px-4 py-2.5 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition flex items-center justify-center gap-1.5 border-t border-slate-100"
                        >
                          <svg
                            className={cn("w-3.5 h-3.5 transition-transform", isExpanded && "rotate-180")}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                          {isExpanded ? "Hide History" : "Loan & Payment History"}
                        </button>

                        {isExpanded && (
                          <div className="border-t border-slate-100 animate-fade-in">
                            {/* Loan Disbursements */}
                            {empTxns.length > 0 && (
                              <div className="px-4 pt-3 pb-1">
                                <div className="text-[10px] font-medium text-amber-600 uppercase tracking-wide mb-1.5">
                                  Loans Given — {getMonthName(month)} {year}
                                </div>
                                {empTxns.map((txn) => (
                                  <div key={txn.id} className="flex items-center justify-between py-1.5">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <div className="w-1.5 h-1.5 bg-amber-400 rounded-full flex-shrink-0" />
                                      <span className="font-medium text-amber-600 text-sm tabular-nums">{formatCurrency(txn.amount)}</span>
                                      {txn.note && <span className="text-xs text-slate-400 truncate">{txn.note}</span>}
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <span className="text-[10px] text-slate-400">
                                        {new Date(txn.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                      </span>
                                      <button
                                        onClick={() => setDeleteConfirmId(txn.id)}
                                        className="p-1 rounded hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition"
                                      >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Payment / Instalment History */}
                            <div className="px-4 pt-2 pb-3">
                              <div className="text-[10px] font-medium text-emerald-600 uppercase tracking-wide mb-1.5">
                                Payments / Instalments
                              </div>
                              {empPayments.length > 0 ? (
                                empPayments
                                  .filter((p) => p.amount > 0)
                                  .map((p) => (
                                    <div key={p.id} className="flex items-center justify-between py-1.5">
                                      <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full flex-shrink-0" />
                                        <span className="font-medium text-emerald-600 text-sm tabular-nums">{formatCurrency(p.amount)}</span>
                                      </div>
                                      <span className="text-[10px] text-slate-400">
                                        {getMonthName(p.month)} {p.year}
                                      </span>
                                    </div>
                                  ))
                              ) : instalment > 0 ? (
                                <div className="flex items-center gap-2 py-1.5">
                                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full flex-shrink-0" />
                                  <span className="font-medium text-emerald-600 text-sm tabular-nums">{formatCurrency(instalment)}</span>
                                  <span className="text-[10px] text-slate-400">{getMonthName(month)} {year}</span>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-400 py-1">No payments recorded yet</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Overview Totals */}
              {filteredEmployees.length > 0 && (
                <div className="mt-4 bg-slate-800 rounded-lg p-4 text-white">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    <div>
                      <div className="text-xs text-slate-400 font-medium">Opening</div>
                      <div className="text-lg font-semibold mt-0.5 tabular-nums">{formatCurrency(totals.openingLoan)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-amber-400 font-medium">+ New Loans</div>
                      <div className="text-lg font-semibold mt-0.5 tabular-nums text-amber-300">{formatCurrency(totals.additionalLoan)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 font-medium">= Net Loan</div>
                      <div className="text-lg font-semibold mt-0.5 tabular-nums">{formatCurrency(totals.netLoan)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-emerald-400 font-medium">- Instalments</div>
                      <div className="text-lg font-semibold mt-0.5 tabular-nums text-emerald-300">{formatCurrency(totals.instalment)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-rose-400 font-medium">= Carry Fwd</div>
                      <div className="text-lg font-semibold mt-0.5 tabular-nums text-rose-300">{formatCurrency(totals.carryForward)}</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ===== TRANSACTIONS VIEW ===== */}
          {view === "transactions" && (
            <div className="bg-white border border-slate-200 rounded-lg">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-semibold text-slate-800 text-sm">Loan Transactions — {getMonthName(month)} {year}</h2>
                {txnSearch && (
                  <span className="text-xs text-slate-400">{filteredTransactions.length} of {transactions.length} shown</span>
                )}
              </div>

              {filteredTransactions.length === 0 ? (
                <div className="py-16 text-center">
                  <svg className="w-12 h-12 mx-auto mb-3 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                  </svg>
                  <p className="text-slate-500 font-medium">{txnSearch ? "No matching transactions" : "No loan transactions this month"}</p>
                  {!txnSearch && (
                    <button onClick={() => setLoanModalOpen(true)} className="mt-3 text-sm text-slate-600 hover:text-slate-800 font-medium">
                      Add the first loan
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="sm:hidden divide-y divide-slate-100">
                    {filteredTransactions.map((txn) => (
                      <div key={txn.id} className="p-4">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-medium">
                              {txn.employee.name[0]}
                            </div>
                            <span className="font-medium text-slate-800 text-sm">{txn.employee.name}</span>
                          </div>
                          <span className="font-semibold text-amber-600 tabular-nums">{formatCurrency(txn.amount)}</span>
                        </div>
                        <div className="flex items-center justify-between ml-9">
                          <div className="text-xs text-slate-400">
                            {new Date(txn.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            {txn.note && <span className="ml-2 text-slate-500">· {txn.note}</span>}
                          </div>
                          <button onClick={() => setDeleteConfirmId(txn.id)} className="p-1 rounded hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="overflow-x-auto hidden sm:block">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">Employee</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">Amount</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">Note</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">Date</th>
                          <th className="text-center py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide w-16"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTransactions.map((txn) => (
                          <tr key={txn.id} className="border-b border-slate-100 text-sm text-slate-600 hover:bg-slate-50 transition">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-medium flex-shrink-0">
                                  {txn.employee.name[0]}
                                </div>
                                <span className="font-medium text-slate-800">{txn.employee.name}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums font-medium text-amber-600">{formatCurrency(txn.amount)}</td>
                            <td className="py-3 px-4 text-slate-500 max-w-[200px] truncate">{txn.note || "—"}</td>
                            <td className="py-3 px-4 text-slate-400 text-xs">
                              {new Date(txn.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => setDeleteConfirmId(txn.id)}
                                disabled={deleting === txn.id}
                                className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-600 transition disabled:opacity-50"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* ===== ADD LOAN MODAL ===== */}
      <Modal open={loanModalOpen} onClose={() => setLoanModalOpen(false)} title="Add Loan">
        <form onSubmit={handleAddLoan} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Employee</label>
            <CustomSelect
              options={[
                { value: "", label: "Select employee..." },
                ...employees.map((emp) => ({
                  value: emp.id,
                  label: `${emp.name} (${emp.type === "delivery" ? "Delivery" : "Office"})`,
                })),
              ]}
              value={formEmployeeId}
              onChange={setFormEmployeeId}
              placeholder="Select employee..."
            />
          </div>

          {selectedLoanEmpData && (
            <div className="bg-slate-50 rounded-lg p-3 animate-fade-in">
              <div className="text-xs text-slate-500 font-medium mb-1">Current Loan Balance</div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-700">
                  Net: <span className="font-semibold tabular-nums">{formatCurrency(selectedLoanEmpData.netLoan)}</span>
                </span>
                <span className={cn("font-semibold tabular-nums", selectedLoanEmpData.loanCarryForward > 0 ? "text-rose-600" : "text-slate-400")}>
                  C/F: {formatCurrency(selectedLoanEmpData.loanCarryForward)}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">₹</span>
              <input
                type="number"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                required
                min="1"
                placeholder="Enter loan amount"
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Note (optional)</label>
            <input
              type="text"
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              placeholder="Reason for loan"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none transition"
            />
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-700 text-center font-medium">
            {getMonthName(month)} {year}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setLoanModalOpen(false)} className="flex-1 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition disabled:opacity-50">
              {submitting ? "Adding..." : "Add Loan"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ===== RECORD PAYMENT MODAL ===== */}
      <Modal open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} title="Record Loan Payment">
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700 flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Records a loan instalment deduction for {getMonthName(month)} {year}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Employee</label>
            <CustomSelect
              options={[
                { value: "", label: "Select employee..." },
                ...employees.map((emp) => {
                  const empData = salaryData.find((s) => s.employee.id === emp.id);
                  const balance = empData?.netLoan || 0;
                  return {
                    value: emp.id,
                    label: `${emp.name}${balance > 0 ? ` — Loan: ${formatCurrency(balance)}` : ""}`,
                  };
                }),
              ]}
              value={payEmpId}
              onChange={setPayEmpId}
              placeholder="Select employee..."
            />
          </div>

          {selectedPayEmpData && (
            <div className="bg-slate-50 rounded-lg p-3 animate-fade-in space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Gross Salary</span>
                <span className="font-medium text-slate-700 tabular-nums">{formatCurrency(selectedPayEmpData.grossSalary)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Loan Balance</span>
                <span className="font-medium text-rose-600 tabular-nums">{formatCurrency(selectedPayEmpData.netLoan)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Already Paid (this month)</span>
                <span className="font-medium text-emerald-600 tabular-nums">{formatCurrency(selectedPayEmpData.deductions?.loan_instalment || 0)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-slate-200 pt-2">
                <span className="text-slate-500">Remaining to settle</span>
                <span className="font-semibold text-slate-800 tabular-nums">{formatCurrency(selectedPayEmpData.loanCarryForward)}</span>
              </div>
              {selectedPayEmpData.loanCarryForward > 0 && (
                <button
                  type="button"
                  onClick={() => setPayAmount(selectedPayEmpData.loanCarryForward.toString())}
                  className="w-full text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg py-1.5 font-medium transition"
                >
                  Auto-fill remaining: {formatCurrency(selectedPayEmpData.loanCarryForward)}
                </button>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Payment Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">₹</span>
              <input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
                min="1"
                placeholder="Enter payment amount"
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none transition"
              />
            </div>
            {selectedPayEmpData && payAmount && (
              <div className="mt-2 text-xs text-slate-500">
                New instalment total:{" "}
                <span className="font-medium text-emerald-600 tabular-nums">
                  {formatCurrency((selectedPayEmpData.deductions?.loan_instalment || 0) + Number(payAmount))}
                </span>
                {" "}→ Loan after:{" "}
                <span className={cn("font-medium tabular-nums", selectedPayEmpData.loanCarryForward - Number(payAmount) > 0 ? "text-rose-600" : "text-emerald-600")}>
                  {formatCurrency(Math.max(0, selectedPayEmpData.loanCarryForward - Number(payAmount)))}
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setPaymentModalOpen(false)} className="flex-1 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition">
              Cancel
            </button>
            <button type="submit" disabled={paymentSubmitting} className="flex-1 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition disabled:opacity-50">
              {paymentSubmitting ? "Recording..." : "Record Payment"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ===== DELETE CONFIRMATION ===== */}
      <Modal open={deleteConfirmId !== null} onClose={() => setDeleteConfirmId(null)} title="Delete Loan Transaction" size="sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <p className="text-sm text-slate-600">Are you sure? This cannot be undone.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setDeleteConfirmId(null)} className="flex-1 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition">
            Cancel
          </button>
          <button
            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            disabled={deleting !== null}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
