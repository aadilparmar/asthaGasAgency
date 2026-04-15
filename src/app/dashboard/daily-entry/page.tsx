"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import CalendarPicker from "@/components/CalendarPicker";
import Toast from "@/components/Toast";
import { getDaysInMonth, getMonthName, formatCurrency, cn } from "@/lib/utils";

interface Employee {
  id: string;
  name: string;
}

interface CylinderType {
  id: string;
  name: string;
  price: number;
  active: boolean;
}

interface DeliveryEntry {
  employeeId: string;
  date: string;
  cylinderTypeId: string;
  count: number;
  otpCount: number;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function DailyEntryPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [selectedDay, setSelectedDay] = useState(now.getDate());
  const [view, setView] = useState<"day" | "grid">("day");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [cylinderTypes, setCylinderTypes] = useState<CylinderType[]>([]);
  const [otpBonus, setOtpBonus] = useState(2);
  // grid keys: `${day}_${employeeId}_${cylinderTypeId}_count` and `..._otp`
  const [grid, setGrid] = useState<Record<string, number>>({});
  const [original, setOriginal] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const daysInMonth = useMemo(() => getDaysInMonth(month, year), [month, year]);
  const activeTypes = useMemo(() => cylinderTypes.filter((t) => t.active), [cylinderTypes]);

  const countKey = (day: number, empId: string, ctId: string) => `${day}_${empId}_${ctId}_count`;
  const otpKey = (day: number, empId: string, ctId: string) => `${day}_${empId}_${ctId}_otp`;

  const showToast = useCallback((type: "success" | "error", message: string) => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast({ type, message });
    toastTimeout.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, ctRes, delRes, settingsRes] = await Promise.all([
        fetch("/api/employees?type=delivery&active=true"),
        fetch("/api/cylinder-types"),
        fetch(`/api/daily-deliveries?month=${month}&year=${year}`),
        fetch("/api/app-settings"),
      ]);
      if (!empRes.ok) throw new Error("Failed to load employees");

      const empData = await empRes.json();
      setEmployees(empData);

      const ctData: CylinderType[] = await ctRes.json();
      setCylinderTypes(ctData);

      const settingsData = await settingsRes.json();
      setOtpBonus(Number(settingsData.otp_bonus) || 2);

      const newGrid: Record<string, number> = {};
      if (delRes.ok) {
        const delData: {
          employeeId: string;
          date: string;
          cylinderTypeId: string;
          count: number;
          otpCount: number;
        }[] = await delRes.json();
        for (const entry of delData) {
          const d = new Date(entry.date).getDate();
          newGrid[countKey(d, entry.employeeId, entry.cylinderTypeId)] = entry.count;
          newGrid[otpKey(d, entry.employeeId, entry.cylinderTypeId)] = entry.otpCount;
        }
      }
      setGrid(newGrid);
      setOriginal({ ...newGrid });
    } catch {
      showToast("error", "Failed to load data. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, [month, year, showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (selectedDay > daysInMonth) setSelectedDay(daysInMonth);
  }, [daysInMonth, selectedDay]);

  // Changed entries detection
  const getChangedEntries = useCallback(() => {
    const changes: DeliveryEntry[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      for (const emp of employees) {
        for (const ct of activeTypes) {
          const ck = countKey(day, emp.id, ct.id);
          const ok = otpKey(day, emp.id, ct.id);
          const currentCount = grid[ck] || 0;
          const currentOtp = grid[ok] || 0;
          const origCount = original[ck] || 0;
          const origOtp = original[ok] || 0;
          if (currentCount !== origCount || currentOtp !== origOtp) {
            const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            changes.push({
              employeeId: emp.id,
              date: dateStr,
              cylinderTypeId: ct.id,
              count: currentCount,
              otpCount: currentOtp,
            });
          }
        }
      }
    }
    return changes;
  }, [grid, original, daysInMonth, employees, activeTypes, month, year]);

  const changedCount = useMemo(() => getChangedEntries().length, [getChangedEntries]);

  const handleSave = async () => {
    const changes = getChangedEntries();
    if (changes.length === 0) { showToast("success", "No changes to save."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/daily-deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      if (!res.ok) throw new Error("Save failed");
      setOriginal({ ...grid });
      showToast("success", `Saved ${changes.length} ${changes.length === 1 ? "entry" : "entries"}`);
    } catch {
      showToast("error", "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Day view helpers
  function setVal(key: string, value: number) {
    setGrid(prev => ({ ...prev, [key]: Math.max(0, value) }));
  }

  // Employee day totals
  function empDayTotal(empId: string, day: number) {
    let total = 0;
    for (const ct of activeTypes) {
      total += grid[countKey(day, empId, ct.id)] || 0;
    }
    return total;
  }

  function empDayEarnings(empId: string, day: number) {
    let earnings = 0;
    for (const ct of activeTypes) {
      const count = grid[countKey(day, empId, ct.id)] || 0;
      const otp = grid[otpKey(day, empId, ct.id)] || 0;
      earnings += (count * ct.price) + (otp * otpBonus);
    }
    return earnings;
  }

  // Day totals
  const dayTotal = useMemo(() => {
    return employees.reduce((sum, emp) => sum + empDayTotal(emp.id, selectedDay), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, selectedDay, employees, activeTypes]);

  const dayEarnings = useMemo(() => {
    return employees.reduce((sum, emp) => sum + empDayEarnings(emp.id, selectedDay), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, selectedDay, employees, activeTypes, otpBonus]);

  // Grid view totals
  const grandTotal = useMemo(() => {
    let sum = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      for (const emp of employees) {
        sum += empDayTotal(emp.id, d);
      }
    }
    return sum;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, daysInMonth, employees, activeTypes]);

  const rowTotal = (day: number) =>
    employees.reduce((sum, emp) => sum + empDayTotal(emp.id, day), 0);

  const colTotal = (empId: string) => {
    let sum = 0;
    for (let d = 1; d <= daysInMonth; d++) sum += empDayTotal(empId, d);
    return sum;
  };

  const getDayOfWeek = useCallback(
    (day: number) => new Date(year, month - 1, day).getDay(),
    [month, year]
  );

  const isToday = month === now.getMonth() + 1 && year === now.getFullYear() && selectedDay === now.getDate();
  const selectedDow = new Date(year, month - 1, selectedDay).getDay();

  // Day changes count
  const dayChanges = useMemo(() => {
    let count = 0;
    for (const emp of employees) {
      for (const ct of activeTypes) {
        const ck = countKey(selectedDay, emp.id, ct.id);
        const ok = otpKey(selectedDay, emp.id, ct.id);
        if ((grid[ck] || 0) !== (original[ck] || 0) || (grid[ok] || 0) !== (original[ok] || 0)) count++;
      }
    }
    return count;
  }, [grid, original, selectedDay, employees, activeTypes]);

  // CSV export
  function exportCSV(scope: "day" | "month") {
    const headers = ["Date", "Employee"];
    for (const ct of activeTypes) {
      headers.push(`${ct.name} Total`, `${ct.name} OTP`, `${ct.name} Non-OTP`);
    }
    headers.push("Total Cylinders", "Earnings");

    const rows: (string | number)[][] = [];
    const days = scope === "day" ? [selectedDay] : Array.from({ length: daysInMonth }, (_, i) => i + 1);

    for (const day of days) {
      for (const emp of employees) {
        const row: (string | number)[] = [
          `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
          emp.name,
        ];
        let totalCyl = 0;
        let totalEarn = 0;
        for (const ct of activeTypes) {
          const c = grid[countKey(day, emp.id, ct.id)] || 0;
          const o = grid[otpKey(day, emp.id, ct.id)] || 0;
          row.push(c, o, c - o);
          totalCyl += c;
          totalEarn += (c * ct.price) + (o * otpBonus);
        }
        row.push(totalCyl, totalEarn);
        if (totalCyl > 0) rows.push(row);
      }
    }

    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = scope === "day"
      ? `Deliveries_${year}-${String(month).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}.csv`
      : `Deliveries_${getMonthName(month)}_${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] md:h-[calc(100vh-48px)]">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Daily Cylinder Delivery</h1>
          <p className="text-[13px] text-slate-500">Enter daily counts for each delivery man</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* CSV Export */}
          <div className="relative group">
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium hover:bg-emerald-100 transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              CSV
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="absolute right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-40 hidden group-hover:block z-50">
              <button
                onClick={() => exportCSV("day")}
                className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition"
              >
                Export Day ({selectedDay} {getMonthName(month).slice(0, 3)})
              </button>
              <button
                onClick={() => exportCSV("month")}
                className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition"
              >
                Export Month ({getMonthName(month).slice(0, 3)} {year})
              </button>
            </div>
          </div>

          {/* View Toggle */}
          <div className="bg-slate-100 rounded-lg p-0.5 flex gap-0.5">
            <button
              onClick={() => setView("day")}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                view === "day" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Day View
            </button>
            <button
              onClick={() => setView("grid")}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                view === "grid" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Monthly Grid
            </button>
          </div>

          {view === "grid" && (
            <CalendarPicker month={month} year={year} onMonthChange={(m, y) => { setMonth(m); setYear(y); }} />
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Loading...</div>
      ) : employees.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <p className="text-[13px] font-medium">No delivery employees found</p>
            <p className="text-xs mt-1">Add delivery staff in the Employees section first.</p>
          </div>
        </div>
      ) : activeTypes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <p className="text-[13px] font-medium">No cylinder types configured</p>
            <p className="text-xs mt-1">Add cylinder types in Settings first.</p>
          </div>
        </div>
      ) : view === "day" ? (
        /* ===== DAY VIEW ===== */
        <div className="flex-1 overflow-y-auto animate-fade-in">
          {/* Date Navigation with Calendar */}
          <div className="flex items-center justify-between mb-4 bg-white border border-slate-200 rounded-lg p-3">
            <button
              onClick={() => setSelectedDay(d => Math.max(1, d - 1))}
              disabled={selectedDay <= 1}
              className="p-2 rounded-lg hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="text-center flex-1">
              <div className="text-[13px] font-semibold text-slate-800">
                {FULL_DAY_NAMES[selectedDow]}, {selectedDay} {getMonthName(month)}
              </div>
              <div className="flex items-center justify-center gap-2 mt-0.5">
                {isToday && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700">Today</span>
                )}
                <span className="text-xs text-slate-400">{year}</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedDay(d => Math.min(daysInMonth, d + 1))}
              disabled={selectedDay >= daysInMonth}
              className="p-2 rounded-lg hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Calendar Picker */}
            <div className="hidden sm:flex items-center ml-3 pl-3 border-l border-slate-200 gap-1">
              <CalendarPicker
                month={month}
                year={year}
                selectedDay={selectedDay}
                onMonthChange={(m, y) => { setMonth(m); setYear(y); setSelectedDay(1); }}
                onDaySelect={(d) => setSelectedDay(d)}
                showDayPicker
              />
            </div>
          </div>

          {/* Employee Cards */}
          <div className="space-y-3 mb-4">
            {employees.map((emp) => {
              const totalCyl = empDayTotal(emp.id, selectedDay);
              const earnings = empDayEarnings(emp.id, selectedDay);
              const hasChanges = activeTypes.some(ct => {
                const ck = countKey(selectedDay, emp.id, ct.id);
                const ok = otpKey(selectedDay, emp.id, ct.id);
                return (grid[ck] || 0) !== (original[ck] || 0) || (grid[ok] || 0) !== (original[ok] || 0);
              });

              return (
                <div key={emp.id} className="bg-white border border-slate-200 rounded-lg p-4">
                  {/* Employee header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                        {emp.name[0]}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-slate-800 block">{emp.name}</span>
                        {hasChanges && (
                          <span className="text-[11px] text-blue-600 font-medium">modified</span>
                        )}
                      </div>
                    </div>
                    {totalCyl > 0 && (
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Total: {totalCyl} cyl</div>
                        <div className="text-sm font-semibold text-slate-800 tabular-nums">{formatCurrency(earnings)}</div>
                      </div>
                    )}
                  </div>

                  {/* Cylinder type entries */}
                  <div className="space-y-2.5">
                    {activeTypes.map((ct) => {
                      const ck = countKey(selectedDay, emp.id, ct.id);
                      const ok = otpKey(selectedDay, emp.id, ct.id);
                      const count = grid[ck] || 0;
                      const otp = grid[ok] || 0;
                      const nonOtp = count - otp;
                      const earn = (count * ct.price) + (otp * otpBonus);

                      return (
                        <div key={ct.id} className="bg-slate-50 rounded-lg px-3 py-2.5">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-slate-600">
                              {ct.name} <span className="text-slate-400">@ {formatCurrency(ct.price)}</span>
                            </span>
                            {count > 0 && (
                              <span className="text-[11px] text-slate-500 tabular-nums">{formatCurrency(earn)}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {/* OTP count */}
                            <div className="flex-1">
                              <label className="text-[10px] font-medium text-emerald-600 uppercase tracking-wide mb-1 block">
                                With OTP (+{formatCurrency(otpBonus)})
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={otp || ""}
                                onChange={(e) => {
                                  const val = e.target.value === "" ? 0 : parseInt(e.target.value, 10);
                                  if (!isNaN(val) && val >= 0) {
                                    setVal(ok, val);
                                    // Ensure count >= otp
                                    const currentCount = grid[ck] || 0;
                                    if (val > currentCount) setVal(ck, val);
                                  }
                                }}
                                onFocus={(e) => e.target.select()}
                                className="w-full h-9 text-center text-sm font-semibold tabular-nums rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                                placeholder="0"
                              />
                            </div>
                            {/* Non-OTP count */}
                            <div className="flex-1">
                              <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-1 block">
                                Without OTP
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={nonOtp > 0 ? nonOtp : ""}
                                onChange={(e) => {
                                  const val = e.target.value === "" ? 0 : parseInt(e.target.value, 10);
                                  if (!isNaN(val) && val >= 0) {
                                    const currentOtp = grid[ok] || 0;
                                    setVal(ck, currentOtp + val);
                                  }
                                }}
                                onFocus={(e) => e.target.select()}
                                className="w-full h-9 text-center text-sm font-semibold tabular-nums rounded-md border border-slate-200 bg-white text-slate-800 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                                placeholder="0"
                              />
                            </div>
                            {/* Total */}
                            <div className="w-14 text-center">
                              <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1 block">Total</label>
                              <div className="h-9 flex items-center justify-center text-sm font-bold text-slate-800 tabular-nums">
                                {count || "—"}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Day Summary */}
          <div className="bg-slate-800 text-white rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-400 font-medium">Total Cylinders</div>
                <div className="text-lg font-semibold mt-0.5 tabular-nums">{dayTotal.toLocaleString("en-IN")}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400 font-medium">Total Earnings</div>
                <div className="text-lg font-semibold mt-0.5 tabular-nums">{formatCurrency(dayEarnings)}</div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving || dayChanges === 0}
            className={cn(
              "w-full py-3 rounded-lg text-sm font-medium transition-colors mb-4",
              dayChanges > 0
                ? "bg-slate-800 hover:bg-slate-700 text-white"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            )}
          >
            {saving ? "Saving..." : dayChanges > 0 ? `Save Changes (${dayChanges} modified)` : "No Changes"}
          </button>
        </div>
      ) : (
        /* ===== GRID VIEW ===== */
        <div className="flex-1 flex flex-col min-h-0 animate-fade-in">
          {/* Grid save button */}
          <div className="flex justify-end mb-3 flex-shrink-0">
            <button
              onClick={handleSave}
              disabled={saving || changedCount === 0}
              className={cn(
                "px-5 py-2 rounded-lg text-sm font-medium transition-colors",
                changedCount > 0
                  ? "bg-slate-800 hover:bg-slate-700 text-white"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              )}
            >
              {saving ? "Saving..." : changedCount > 0 ? `Save All (${changedCount})` : "No Changes"}
            </button>
          </div>

          <div className="flex-1 overflow-auto border border-slate-200 rounded-lg bg-white">
            <table className="border-collapse w-full">
              <thead>
                <tr className="sticky top-0 z-20 bg-slate-50">
                  <th className="sticky left-0 z-30 bg-slate-50 border-b border-r border-slate-200 px-3 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide min-w-[100px]">
                    Date
                  </th>
                  {employees.map((emp) => (
                    <th
                      key={emp.id}
                      className="border-b border-r border-slate-200 px-2 py-2.5 text-center text-xs font-medium text-slate-500 uppercase tracking-wide min-w-[85px] bg-slate-50"
                    >
                      {emp.name}
                    </th>
                  ))}
                  <th className="border-b border-slate-200 px-3 py-2.5 text-center text-xs font-medium text-slate-500 uppercase tracking-wide min-w-[70px] bg-slate-50">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                  const dow = getDayOfWeek(day);
                  const isSunday = dow === 0;
                  const total = rowTotal(day);

                  return (
                    <tr key={day} className={cn(isSunday ? "bg-amber-50/40" : "hover:bg-slate-50")}>
                      <td
                        className={cn(
                          "sticky left-0 z-10 border-b border-r border-slate-200 px-3 py-1 text-sm whitespace-nowrap cursor-pointer hover:bg-slate-50 transition-colors",
                          isSunday ? "bg-amber-50 text-amber-800" : "bg-white text-slate-600"
                        )}
                        onClick={() => { setSelectedDay(day); setView("day"); }}
                        title="Click to edit in Day View"
                      >
                        <span className="font-medium tabular-nums">{day}</span>
                        <span className={cn("ml-1.5 text-xs", isSunday ? "text-amber-600" : "text-slate-400")}>
                          {DAY_NAMES[dow]}
                        </span>
                      </td>
                      {employees.map((emp) => {
                        const total = empDayTotal(emp.id, day);
                        const hasOtp = activeTypes.some(ct => (grid[otpKey(day, emp.id, ct.id)] || 0) > 0);
                        const hasChanges = activeTypes.some(ct => {
                          const ck = countKey(day, emp.id, ct.id);
                          const ok = otpKey(day, emp.id, ct.id);
                          return (grid[ck] || 0) !== (original[ck] || 0) || (grid[ok] || 0) !== (original[ok] || 0);
                        });

                        return (
                          <td
                            key={emp.id}
                            className={cn(
                              "border-b border-r border-slate-200 px-2 py-1 text-center text-sm tabular-nums cursor-pointer hover:bg-slate-100 transition-colors",
                              hasChanges && "bg-blue-50",
                              isSunday && !hasChanges && "bg-amber-50/30",
                              total === 0 && "text-slate-300"
                            )}
                            onClick={() => { setSelectedDay(day); setView("day"); }}
                            title="Click to edit details"
                          >
                            {total > 0 ? (
                              <span>
                                {total}
                                {hasOtp && <span className="text-[9px] text-emerald-600 ml-0.5">*</span>}
                              </span>
                            ) : ""}
                          </td>
                        );
                      })}
                      <td className={cn(
                        "border-b border-slate-200 px-3 py-1 text-right text-sm font-medium tabular-nums whitespace-nowrap",
                        isSunday ? "bg-amber-50/50 text-amber-800" : "bg-slate-50/50 text-slate-700"
                      )}>
                        {total > 0 ? total.toLocaleString("en-IN") : ""}
                      </td>
                    </tr>
                  );
                })}

                {/* Totals row */}
                <tr className="sticky bottom-0 z-20 bg-slate-50 border-t-2 border-slate-300">
                  <td className="sticky left-0 z-30 bg-slate-50 border-r border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Total
                  </td>
                  {employees.map((emp) => (
                    <td key={emp.id} className="border-r border-slate-200 px-2 py-2 text-right text-sm font-semibold text-slate-800 tabular-nums">
                      {colTotal(emp.id).toLocaleString("en-IN")}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right text-sm font-semibold text-slate-800 tabular-nums bg-slate-50">
                    {grandTotal.toLocaleString("en-IN")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-400 flex-shrink-0">
            <span><span className="text-emerald-600">*</span> = has OTP entries</span>
            <span className="inline-block w-3 h-3 bg-blue-50 border border-blue-200 rounded"></span>
            <span>= modified</span>
          </div>
        </div>
      )}
    </div>
  );
}
