"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Toast from "@/components/Toast";
import { formatCurrency, cn } from "@/lib/utils";

interface Employee {
  id: string;
  name: string;
  type: "delivery" | "office";
  rate: number;
  fixedSalary: number;
  active: boolean;
}

export default function SettingsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [salaries, setSalaries] = useState<Record<string, string>>({});
  const [originalRates, setOriginalRates] = useState<Record<string, number>>({});
  const [originalSalaries, setOriginalSalaries] = useState<Record<string, number>>({});
  const [bulkRate, setBulkRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"delivery" | "office">("delivery");
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
      const res = await fetch("/api/employees");
      const data: Employee[] = await res.json();
      setEmployees(data);

      const rateMap: Record<string, string> = {};
      const salaryMap: Record<string, string> = {};
      const origRateMap: Record<string, number> = {};
      const origSalaryMap: Record<string, number> = {};

      for (const emp of data) {
        if (emp.type === "delivery") {
          rateMap[emp.id] = emp.rate.toString();
          origRateMap[emp.id] = emp.rate;
        } else {
          salaryMap[emp.id] = emp.fixedSalary.toString();
          origSalaryMap[emp.id] = emp.fixedSalary;
        }
      }

      setRates(rateMap);
      setSalaries(salaryMap);
      setOriginalRates(origRateMap);
      setOriginalSalaries(origSalaryMap);
    } catch {
      showToast("error", "Failed to load employees");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const deliveryStaff = employees.filter((e) => e.type === "delivery");
  const officeStaff = employees.filter((e) => e.type === "office");

  const rateGroups = deliveryStaff.reduce(
    (acc, emp) => {
      const rate = emp.rate;
      if (!acc[rate]) acc[rate] = [];
      acc[rate].push(emp.name);
      return acc;
    },
    {} as Record<number, string[]>
  );

  const deliveryChanges = deliveryStaff.filter(
    (emp) => Number(rates[emp.id]) !== originalRates[emp.id]
  ).length;

  const officeChanges = officeStaff.filter(
    (emp) => Number(salaries[emp.id]) !== originalSalaries[emp.id]
  ).length;

  const changedCount = tab === "delivery" ? deliveryChanges : officeChanges;

  function applyBulkRate() {
    if (!bulkRate) return;
    const newRates: Record<string, string> = {};
    for (const emp of deliveryStaff) {
      if (emp.active) newRates[emp.id] = bulkRate;
    }
    setRates((prev) => ({ ...prev, ...newRates }));
    showToast("success", `Rate set to ₹${bulkRate} for all active delivery staff`);
  }

  async function saveChanges() {
    const updates: { id: string; rate?: number; fixedSalary?: number }[] = [];

    if (tab === "delivery") {
      for (const emp of deliveryStaff) {
        const newRate = Number(rates[emp.id]);
        if (newRate !== originalRates[emp.id]) {
          updates.push({ id: emp.id, rate: newRate });
        }
      }
    } else {
      for (const emp of officeStaff) {
        const newSalary = Number(salaries[emp.id]);
        if (newSalary !== originalSalaries[emp.id]) {
          updates.push({ id: emp.id, fixedSalary: newSalary });
        }
      }
    }

    if (updates.length === 0) {
      showToast("success", "No changes to save");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/employees/bulk-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) throw new Error();
      showToast("success", `Updated ${updates.length} employee${updates.length > 1 ? "s" : ""}`);
      await load();
    } catch {
      showToast("error", "Failed to save changes");
    }
    setSaving(false);
  }

  function resetChanges() {
    if (tab === "delivery") {
      const reset: Record<string, string> = {};
      for (const emp of deliveryStaff) {
        reset[emp.id] = originalRates[emp.id].toString();
      }
      setRates((prev) => ({ ...prev, ...reset }));
    } else {
      const reset: Record<string, string> = {};
      for (const emp of officeStaff) {
        reset[emp.id] = originalSalaries[emp.id].toString();
      }
      setSalaries((prev) => ({ ...prev, ...reset }));
    }
  }

  return (
    <div className="animate-fade-in">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-800">Settings</h1>
        <p className="text-[13px] text-slate-500">Manage cylinder rates, salaries, and configurations</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 w-fit mb-6">
        <button
          onClick={() => setTab("delivery")}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-lg transition",
            tab === "delivery" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          Cylinder Rates
          <span className="ml-2 text-xs text-slate-400">({deliveryStaff.length})</span>
        </button>
        <button
          onClick={() => setTab("office")}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-lg transition",
            tab === "office" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          Office Salaries
          <span className="ml-2 text-xs text-slate-400">({officeStaff.length})</span>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400">
          <svg className="animate-spin h-6 w-6 mr-2" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </div>
      ) : tab === "delivery" ? (
        <>
          {/* Rate Groups Summary */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Current Rate Groups</h3>
            <div className="flex flex-wrap gap-3">
              {Object.entries(rateGroups)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([rate, names]) => (
                  <div key={rate} className="bg-white border border-slate-200 rounded-lg px-4 py-3 min-w-[120px]">
                    <div className="text-xl font-semibold text-slate-800 tabular-nums">{formatCurrency(Number(rate))}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {names.length} employee{names.length > 1 ? "s" : ""}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 leading-tight">{names.join(", ")}</div>
                  </div>
                ))}
            </div>
          </div>

          {/* Quick Set All */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Quick Action — Set Rate for All Active Staff
            </h3>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">₹</span>
                <input
                  type="number"
                  value={bulkRate}
                  onChange={(e) => setBulkRate(e.target.value)}
                  placeholder="Enter rate..."
                  min="0"
                  step="0.5"
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none bg-white"
                />
              </div>
              <button
                onClick={applyBulkRate}
                disabled={!bulkRate}
                className="px-5 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Apply to All
              </button>
            </div>
          </div>

          {/* Rates Table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Employee</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Current Rate</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">New Rate</th>
                    <th className="px-5 py-3 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {deliveryStaff.map((emp) => {
                    const isChanged = Number(rates[emp.id]) !== originalRates[emp.id];
                    return (
                      <tr
                        key={emp.id}
                        className={cn(
                          "border-b border-slate-100 transition text-sm text-slate-600",
                          isChanged ? "bg-blue-50/50" : "hover:bg-slate-50",
                          !emp.active && "opacity-50"
                        )}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-medium flex-shrink-0">
                              {emp.name[0]}
                            </div>
                            <span className="font-medium text-slate-800">{emp.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={cn(
                              "text-[11px] font-medium px-2 py-0.5 rounded-md",
                              emp.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                            )}
                          >
                            {emp.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right text-slate-600 tabular-nums">
                          {formatCurrency(originalRates[emp.id])}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="relative inline-block">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">₹</span>
                            <input
                              type="number"
                              value={rates[emp.id] || ""}
                              onChange={(e) => setRates((prev) => ({ ...prev, [emp.id]: e.target.value }))}
                              min="0"
                              step="0.5"
                              className={cn(
                                "w-24 pl-6 pr-2 py-1.5 rounded-lg border text-right text-sm tabular-nums focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none transition",
                                isChanged ? "border-blue-300 bg-blue-50 text-blue-800 font-medium" : "border-slate-200 bg-slate-50"
                              )}
                            />
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {isChanged && (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 animate-fade-in">
                              Changed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Office Salaries Tab */
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Employee</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Current Salary</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">New Salary</th>
                  <th className="px-5 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {officeStaff.map((emp) => {
                  const isChanged = Number(salaries[emp.id]) !== originalSalaries[emp.id];
                  return (
                    <tr
                      key={emp.id}
                      className={cn(
                        "border-b border-slate-100 transition text-sm text-slate-600",
                        isChanged ? "bg-blue-50/50" : "hover:bg-slate-50",
                        !emp.active && "opacity-50"
                      )}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-medium flex-shrink-0">
                            {emp.name[0]}
                          </div>
                          <span className="font-medium text-slate-800">{emp.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={cn(
                            "text-[11px] font-medium px-2 py-0.5 rounded-md",
                            emp.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                          )}
                        >
                          {emp.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right text-slate-600 tabular-nums">
                        {formatCurrency(originalSalaries[emp.id])}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="relative inline-block">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">₹</span>
                          <input
                            type="number"
                            value={salaries[emp.id] || ""}
                            onChange={(e) => setSalaries((prev) => ({ ...prev, [emp.id]: e.target.value }))}
                            min="0"
                            step="100"
                            className={cn(
                              "w-28 pl-6 pr-2 py-1.5 rounded-lg border text-right text-sm tabular-nums focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none transition",
                              isChanged ? "border-blue-300 bg-blue-50 text-blue-800 font-medium" : "border-slate-200 bg-slate-50"
                            )}
                          />
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {isChanged && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 animate-fade-in">
                            Changed
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sticky Save Bar */}
      {changedCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:left-64 z-30 bg-white border-t border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="text-sm text-slate-600">
              <span className="inline-flex items-center justify-center w-5 h-5 bg-slate-800 text-white text-[10px] font-bold rounded-full mr-2">
                {changedCount}
              </span>
              unsaved change{changedCount > 1 ? "s" : ""}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={resetChanges}
                className="px-4 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition"
              >
                Reset
              </button>
              <button
                onClick={saveChanges}
                disabled={saving}
                className="px-6 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
