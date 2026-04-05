"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import MonthSelector from "@/components/MonthSelector";
import Toast from "@/components/Toast";
import { getDaysInMonth, getMonthName, formatCurrency, cn } from "@/lib/utils";

interface Employee {
  id: string;
  name: string;
  rate: number;
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
  const [grid, setGrid] = useState<Record<string, number>>({});
  const [original, setOriginal] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const daysInMonth = useMemo(() => getDaysInMonth(month, year), [month, year]);

  const cellKey = (day: number, employeeId: string) => `${day}_${employeeId}`;

  const showToast = useCallback((type: "success" | "error", message: string) => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast({ type, message });
    toastTimeout.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, delRes] = await Promise.all([
        fetch("/api/employees?type=delivery&active=true"),
        fetch(`/api/daily-deliveries?month=${month}&year=${year}`),
      ]);
      if (!empRes.ok) throw new Error("Failed to load employees");

      const empData = await empRes.json();
      setEmployees(empData);

      const newGrid: Record<string, number> = {};
      if (delRes.ok) {
        const delData: { employeeId: string; date: string; count: number }[] = await delRes.json();
        for (const entry of delData) {
          const d = new Date(entry.date).getDate();
          newGrid[cellKey(d, entry.employeeId)] = entry.count;
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

  // Cap selectedDay when month changes
  useEffect(() => {
    if (selectedDay > daysInMonth) setSelectedDay(daysInMonth);
  }, [daysInMonth, selectedDay]);

  // Changed entries detection
  const getChangedEntries = useCallback(() => {
    const changes: { employeeId: string; date: string; count: number }[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      for (const emp of employees) {
        const key = cellKey(day, emp.id);
        const current = grid[key] || 0;
        const orig = original[key] || 0;
        if (current !== orig) {
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          changes.push({ employeeId: emp.id, date: dateStr, count: current });
        }
      }
    }
    return changes;
  }, [grid, original, daysInMonth, employees, month, year]);

  const changedCount = useMemo(() => getChangedEntries().length, [getChangedEntries]);

  const handleSave = async () => {
    const changes = getChangedEntries();
    if (changes.length === 0) {
      showToast("success", "No changes to save.");
      return;
    }
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
  function setCount(empId: string, value: number) {
    setGrid(prev => ({ ...prev, [cellKey(selectedDay, empId)]: Math.max(0, value) }));
  }
  function increment(empId: string) {
    setGrid(prev => {
      const key = cellKey(selectedDay, empId);
      return { ...prev, [key]: (prev[key] || 0) + 1 };
    });
  }
  function decrement(empId: string) {
    setGrid(prev => {
      const key = cellKey(selectedDay, empId);
      return { ...prev, [key]: Math.max(0, (prev[key] || 0) - 1) };
    });
  }

  function prevDay() {
    setSelectedDay(d => Math.max(1, d - 1));
  }
  function nextDay() {
    setSelectedDay(d => Math.min(daysInMonth, d + 1));
  }

  // Computed totals
  const dayTotal = useMemo(() => {
    return employees.reduce((sum, emp) => sum + (grid[cellKey(selectedDay, emp.id)] || 0), 0);
  }, [grid, selectedDay, employees]);

  const dayEarnings = useMemo(() => {
    return employees.reduce((sum, emp) => {
      const count = grid[cellKey(selectedDay, emp.id)] || 0;
      return sum + count * (emp.rate || 0);
    }, 0);
  }, [grid, selectedDay, employees]);

  const grandTotal = useMemo(() => {
    let sum = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      for (const emp of employees) {
        sum += grid[cellKey(d, emp.id)] || 0;
      }
    }
    return sum;
  }, [grid, daysInMonth, employees]);

  const rowTotal = (day: number) =>
    employees.reduce((sum, emp) => sum + (grid[cellKey(day, emp.id)] || 0), 0);

  const colTotal = (employeeId: string) => {
    let sum = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      sum += grid[cellKey(d, employeeId)] || 0;
    }
    return sum;
  };

  const getDayOfWeek = useCallback(
    (day: number) => new Date(year, month - 1, day).getDay(),
    [month, year]
  );

  const isToday = month === now.getMonth() + 1 && year === now.getFullYear() && selectedDay === now.getDate();
  const selectedDow = new Date(year, month - 1, selectedDay).getDay();

  // Day changes count (for day view save button)
  const dayChanges = useMemo(() => {
    let count = 0;
    for (const emp of employees) {
      const key = cellKey(selectedDay, emp.id);
      if ((grid[key] || 0) !== (original[key] || 0)) count++;
    }
    return count;
  }, [grid, original, selectedDay, employees]);

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] md:h-[calc(100vh-48px)] font-[Poppins]">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Daily Cylinder Delivery</h1>
          <p className="text-[13px] text-slate-500">Enter daily counts for each delivery man</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
            <MonthSelector month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          Loading...
        </div>
      ) : employees.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <p className="text-[13px] font-medium">No delivery employees found</p>
            <p className="text-xs mt-1">Add delivery staff in the Employees section first.</p>
          </div>
        </div>
      ) : view === "day" ? (
        /* ===== DAY VIEW ===== */
        <div className="flex-1 overflow-y-auto animate-fade-in">
          {/* Date Navigation */}
          <div className="flex items-center justify-between mb-4 bg-white border border-slate-200 rounded-lg p-3">
            <button
              onClick={prevDay}
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
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700">
                    Today
                  </span>
                )}
                <span className="text-xs text-slate-400">{year}</span>
              </div>
            </div>

            <button
              onClick={nextDay}
              disabled={selectedDay >= daysInMonth}
              className="p-2 rounded-lg hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Month nav */}
            <div className="hidden sm:flex items-center ml-3 pl-3 border-l border-slate-200 gap-1">
              <MonthSelector month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); setSelectedDay(1); }} />
            </div>
          </div>

          {/* Employee Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {employees.map((emp) => {
              const key = cellKey(selectedDay, emp.id);
              const count = grid[key] || 0;
              const origCount = original[key] || 0;
              const isModified = count !== origCount;
              const earnings = count * (emp.rate || 0);

              return (
                <div
                  key={emp.id}
                  className="bg-white border border-slate-200 rounded-lg p-4"
                >
                  {/* Employee header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                        {emp.name[0]}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-slate-800 block">{emp.name}</span>
                        {isModified && (
                          <span className="text-[11px] text-blue-600 font-medium">modified</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-slate-400">
                      {formatCurrency(emp.rate)}/cyl
                    </span>
                  </div>

                  {/* Counter */}
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => decrement(emp.id)}
                      disabled={count <= 0}
                      className="w-10 h-10 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-lg font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      -
                    </button>

                    <input
                      type="number"
                      min={0}
                      value={count || ""}
                      onChange={(e) => {
                        const val = e.target.value === "" ? 0 : parseInt(e.target.value, 10);
                        if (!isNaN(val)) setCount(emp.id, val);
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-20 h-12 text-center text-xl font-semibold tabular-nums rounded-lg border border-slate-200 text-slate-800 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 bg-white"
                      placeholder="0"
                    />

                    <button
                      onClick={() => increment(emp.id)}
                      className="w-10 h-10 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-lg font-medium transition-colors"
                    >
                      +
                    </button>
                  </div>

                  {/* Earnings */}
                  {count > 0 && (
                    <div className="mt-3 text-center text-xs text-slate-400">
                      Earnings: <span className="font-medium text-slate-600 tabular-nums">{formatCurrency(earnings)}</span>
                    </div>
                  )}
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
            {saving
              ? "Saving..."
              : dayChanges > 0
                ? `Save Changes (${dayChanges} modified)`
                : "No Changes"}
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
                    <tr
                      key={day}
                      className={cn(
                        isSunday ? "bg-amber-50/40" : "hover:bg-slate-50"
                      )}
                    >
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
                        const key = cellKey(day, emp.id);
                        const val = grid[key] || 0;
                        const origVal = original[key] || 0;
                        const isModified = val !== origVal;

                        return (
                          <td key={emp.id} className={cn("border-b border-r border-slate-200 p-0", isSunday && "bg-amber-50/30")}>
                            <input
                              type="number"
                              min={0}
                              value={val || ""}
                              onChange={(e) => {
                                const parsed = e.target.value === "" ? 0 : parseInt(e.target.value, 10);
                                if (!isNaN(parsed) && parsed >= 0) {
                                  setGrid(prev => ({ ...prev, [key]: parsed }));
                                }
                              }}
                              onFocus={(e) => e.target.select()}
                              className={cn(
                                "w-full h-full px-2 py-1 text-right text-sm tabular-nums border-0 outline-none focus:ring-1 focus:ring-inset focus:ring-slate-400 focus:bg-slate-50 transition-colors bg-transparent",
                                isModified && "bg-blue-50 text-slate-800",
                                val === 0 && "text-slate-300"
                              )}
                              placeholder="0"
                            />
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
        </div>
      )}
    </div>
  );
}
