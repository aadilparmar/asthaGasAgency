"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import CalendarPicker from "@/components/CalendarPicker";
import Modal from "@/components/Modal";
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
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [flashEmp, setFlashEmp] = useState<string | null>(null);
  const [pendingMonth, setPendingMonth] = useState<{ m: number; y: number } | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flashTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const todayRowRef = useRef<HTMLTableRowElement>(null);
  const changedRef = useRef(0);

  const daysInMonth = useMemo(() => getDaysInMonth(month, year), [month, year]);
  const activeTypes = useMemo(() => cylinderTypes.filter((t) => t.active), [cylinderTypes]);
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  const countKey = (day: number, empId: string, ctId: string) => `${day}_${empId}_${ctId}_count`;
  const otpKey = (day: number, empId: string, ctId: string) => `${day}_${empId}_${ctId}_otp`;

  const showToast = useCallback((type: "success" | "error", message: string) => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast({ type, message });
    toastTimeout.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [empRes, ctRes, delRes, settingsRes] = await Promise.all([
        fetch("/api/employees?type=delivery&active=true"),
        fetch("/api/cylinder-types"),
        fetch(`/api/daily-deliveries?month=${month}&year=${year}`),
        fetch("/api/app-settings"),
      ]);
      if (!empRes.ok || !ctRes.ok) throw new Error("Failed to load");

      setEmployees(await empRes.json());

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
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (selectedDay > daysInMonth) setSelectedDay(daysInMonth);
  }, [daysInMonth, selectedDay]);

  // ── change detection ──────────────────────────────────────────────────────
  const getChangedEntries = useCallback(() => {
    const changes: DeliveryEntry[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      for (const emp of employees) {
        for (const ct of activeTypes) {
          const ck = countKey(day, emp.id, ct.id);
          const ok = otpKey(day, emp.id, ct.id);
          const currentCount = grid[ck] || 0;
          const currentOtp = grid[ok] || 0;
          if (currentCount !== (original[ck] || 0) || currentOtp !== (original[ok] || 0)) {
            changes.push({
              employeeId: emp.id,
              date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
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
  useEffect(() => { changedRef.current = changedCount; }, [changedCount]);

  // warn on tab close with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (changedRef.current > 0) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const handleSave = useCallback(async () => {
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
  }, [getChangedEntries, grid, showToast]);

  // Ctrl+S saves
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (changedRef.current > 0 && !saving) handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, saving]);

  // Enter jumps to the next entry input (spreadsheet flow)
  const enterNav = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-entry-nav]"));
    const i = inputs.indexOf(e.currentTarget);
    const next = inputs[i + 1];
    if (next) { next.focus(); next.select(); }
    else (e.currentTarget as HTMLInputElement).blur();
  }, []);

  // guarded month change (unsaved edits)
  const requestMonthChange = useCallback((m: number, y: number) => {
    if (m === month && y === year) return;
    if (changedRef.current > 0) setPendingMonth({ m, y });
    else { setMonth(m); setYear(y); setSelectedDay(1); }
  }, [month, year]);

  function confirmMonthChange() {
    if (!pendingMonth) return;
    setMonth(pendingMonth.m);
    setYear(pendingMonth.y);
    setSelectedDay(1);
    setPendingMonth(null);
  }

  // ── grid helpers ──────────────────────────────────────────────────────────
  function setVal(key: string, value: number) {
    setGrid(prev => ({ ...prev, [key]: Math.max(0, value) }));
  }

  const empDayTotal = useCallback((empId: string, day: number) => {
    let total = 0;
    for (const ct of activeTypes) total += grid[countKey(day, empId, ct.id)] || 0;
    return total;
  }, [grid, activeTypes]);

  const empDayEarnings = useCallback((empId: string, day: number) => {
    let earnings = 0;
    for (const ct of activeTypes) {
      const count = grid[countKey(day, empId, ct.id)] || 0;
      const otp = grid[otpKey(day, empId, ct.id)] || 0;
      earnings += count * ct.price + otp * otpBonus;
    }
    return earnings;
  }, [grid, activeTypes, otpBonus]);

  // ── day view derived data ─────────────────────────────────────────────────
  const dayStats = useMemo(() => {
    let cyl = 0, otp = 0, earn = 0, entered = 0;
    const perType = activeTypes.map((ct) => {
      let c = 0, o = 0;
      for (const emp of employees) {
        c += grid[countKey(selectedDay, emp.id, ct.id)] || 0;
        o += grid[otpKey(selectedDay, emp.id, ct.id)] || 0;
      }
      cyl += c; otp += o; earn += c * ct.price + o * otpBonus;
      return { name: ct.name, count: c, otp: o };
    });
    for (const emp of employees) if (empDayTotal(emp.id, selectedDay) > 0) entered++;
    return { cyl, otp, earn, entered, perType };
  }, [grid, selectedDay, employees, activeTypes, otpBonus, empDayTotal]);

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

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => e.name.toLowerCase().includes(q));
  }, [employees, search]);

  // copy yesterday's entries into today's EMPTY cells (never overwrites)
  function copyPreviousDay() {
    if (selectedDay <= 1) return;
    const prev = selectedDay - 1;
    let filled = 0;
    const next = { ...grid };
    for (const emp of employees) {
      for (const ct of activeTypes) {
        const prevCount = grid[countKey(prev, emp.id, ct.id)] || 0;
        if (prevCount === 0) continue;
        const ck = countKey(selectedDay, emp.id, ct.id);
        if ((grid[ck] || 0) > 0) continue;
        next[ck] = prevCount;
        next[otpKey(selectedDay, emp.id, ct.id)] = grid[otpKey(prev, emp.id, ct.id)] || 0;
        filled++;
      }
    }
    if (filled === 0) {
      showToast("error", `Nothing to copy — day ${prev} is empty or today is already filled`);
      return;
    }
    setGrid(next);
    showToast("success", `Copied ${filled} ${filled === 1 ? "entry" : "entries"} from ${prev} ${getMonthName(month).slice(0, 3)} — review & save`);
  }

  // revert unsaved edits of the selected day only
  function resetDay() {
    const next = { ...grid };
    for (const emp of employees) {
      for (const ct of activeTypes) {
        const ck = countKey(selectedDay, emp.id, ct.id);
        const ok = otpKey(selectedDay, emp.id, ct.id);
        next[ck] = original[ck] || 0;
        next[ok] = original[ok] || 0;
      }
    }
    setGrid(next);
    showToast("success", `Day ${selectedDay} reverted to last saved state`);
  }

  function jumpToEmployee(empId: string) {
    document.getElementById(`emp-card-${empId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setFlashEmp(empId);
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    flashTimeout.current = setTimeout(() => setFlashEmp(null), 1400);
  }

  // ── grid view derived data ────────────────────────────────────────────────
  const monthStats = useMemo(() => {
    let cyl = 0, otp = 0, earn = 0;
    const perType = activeTypes.map((ct) => {
      let c = 0, o = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        for (const emp of employees) {
          c += grid[countKey(d, emp.id, ct.id)] || 0;
          o += grid[otpKey(d, emp.id, ct.id)] || 0;
        }
      }
      cyl += c; otp += o; earn += c * ct.price + o * otpBonus;
      return { name: ct.name, count: c };
    });
    return { cyl, otp, earn, perType };
  }, [grid, daysInMonth, employees, activeTypes, otpBonus]);

  const rowTotal = (day: number) => employees.reduce((sum, emp) => sum + empDayTotal(emp.id, day), 0);
  const colTotal = (empId: string) => {
    let sum = 0;
    for (let d = 1; d <= daysInMonth; d++) sum += empDayTotal(empId, d);
    return sum;
  };

  const cellTitle = useCallback((day: number, empId: string) => {
    const parts: string[] = [];
    for (const ct of activeTypes) {
      const c = grid[countKey(day, empId, ct.id)] || 0;
      const o = grid[otpKey(day, empId, ct.id)] || 0;
      if (c > 0) parts.push(`${ct.name}: ${c}${o > 0 ? ` (${o} OTP)` : ""}`);
    }
    return parts.length ? parts.join("  ·  ") : "No entries — click to add";
  }, [grid, activeTypes]);

  // auto-scroll to today's row when opening the grid for the current month
  useEffect(() => {
    if (view === "grid" && isCurrentMonth && !loading) {
      const t = setTimeout(() => todayRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
      return () => clearTimeout(t);
    }
  }, [view, isCurrentMonth, loading]);

  const getDayOfWeek = useCallback(
    (day: number) => new Date(year, month - 1, day).getDay(),
    [month, year]
  );

  const isToday = isCurrentMonth && selectedDay === now.getDate();
  const selectedDow = new Date(year, month - 1, selectedDay).getDay();

  // ── CSV export ────────────────────────────────────────────────────────────
  function exportCSV(scope: "day" | "month") {
    const headers = ["Date", "Employee"];
    for (const ct of activeTypes) headers.push(`${ct.name} Total`, `${ct.name} OTP`, `${ct.name} Non-OTP`);
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
          totalEarn += c * ct.price + o * otpBonus;
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

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
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
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium hover:bg-emerald-100 transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              CSV
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="absolute right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-44 hidden group-hover:block group-focus-within:block z-50">
              <button onClick={() => exportCSV("day")} className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition">
                Export Day ({selectedDay} {getMonthName(month).slice(0, 3)})
              </button>
              <button onClick={() => exportCSV("month")} className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition">
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

          <CalendarPicker month={month} year={year} onMonthChange={requestMonthChange} />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        /* skeleton */
        <div className="flex-1 overflow-hidden space-y-3 animate-pulse">
          <div className="h-14 bg-white border border-slate-200 rounded-lg" />
          <div className="h-20 bg-white border border-slate-200 rounded-lg" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-slate-100" />
                <div className="h-3 w-28 bg-slate-100 rounded" />
              </div>
              <div className="h-8 bg-slate-50 rounded" />
              <div className="h-8 bg-slate-50 rounded" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <svg className="w-10 h-10 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.834-1.964-.834-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p className="text-sm font-medium text-slate-600">Could not load delivery data</p>
            <p className="text-xs text-slate-400 mt-1">Check your connection and try again</p>
            <button onClick={loadData} className="mt-4 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition">
              Retry
            </button>
          </div>
        </div>
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
        /* ═════════════ DAY VIEW ═════════════ */
        <div className="flex-1 flex flex-col min-h-0 animate-fade-in">
          <div className="flex-1 overflow-y-auto min-h-0 pb-3">
            {/* Date Navigation */}
            <div className="flex items-center justify-between mb-3 bg-white border border-slate-200 rounded-lg p-3">
              <button
                onClick={() => setSelectedDay(d => Math.max(1, d - 1))}
                disabled={selectedDay <= 1}
                className="p-2 rounded-lg hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Previous day"
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
                  {isToday ? (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700">Today</span>
                  ) : isCurrentMonth ? (
                    <button
                      onClick={() => setSelectedDay(now.getDate())}
                      className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition"
                    >
                      Jump to today
                    </button>
                  ) : null}
                  <span className="text-xs text-slate-400">{year}</span>
                </div>
              </div>

              <button
                onClick={() => setSelectedDay(d => Math.min(daysInMonth, d + 1))}
                disabled={selectedDay >= daysInMonth}
                className="p-2 rounded-lg hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Next day"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              <div className="hidden sm:flex items-center ml-3 pl-3 border-l border-slate-200 gap-1">
                <CalendarPicker
                  month={month}
                  year={year}
                  selectedDay={selectedDay}
                  onMonthChange={requestMonthChange}
                  onDaySelect={(d) => setSelectedDay(d)}
                  showDayPicker
                />
              </div>
            </div>

            {/* Day summary + tools */}
            <div className="bg-white border border-slate-200 rounded-lg p-3 mb-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-semibold text-slate-800 tabular-nums">{dayStats.cyl.toLocaleString("en-IN")}</span>
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">cylinders</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-semibold text-emerald-600 tabular-nums">{dayStats.otp.toLocaleString("en-IN")}</span>
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">OTP</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-semibold text-slate-800 tabular-nums">{formatCurrency(dayStats.earn)}</span>
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">earnings</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-semibold text-slate-800 tabular-nums">{dayStats.entered}<span className="text-slate-300 text-sm">/{employees.length}</span></span>
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">entered</span>
                </div>
                <div className="hidden md:flex items-center gap-1.5 flex-wrap ml-auto">
                  {dayStats.perType.map((t) => (
                    <span key={t.name} className={cn(
                      "text-[11px] px-2 py-0.5 rounded-md border tabular-nums",
                      t.count > 0 ? "bg-slate-50 border-slate-200 text-slate-600" : "bg-white border-slate-100 text-slate-300"
                    )}>
                      {t.name}: <b>{t.count}</b>
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                {/* search */}
                <div className="relative flex-1 max-w-xs">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search delivery man..."
                    className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-slate-200 text-xs focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none bg-slate-50 focus:bg-white transition"
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500" aria-label="Clear search">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                <button
                  onClick={copyPreviousDay}
                  disabled={selectedDay <= 1}
                  title={selectedDay <= 1 ? "No previous day in this month" : `Copy entries from ${selectedDay - 1} ${getMonthName(month).slice(0, 3)} into empty cells`}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy Yesterday
                </button>
              </div>
            </div>

            {/* Employee status chips */}
            <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
              {employees.map((emp) => {
                const total = empDayTotal(emp.id, selectedDay);
                const has = total > 0;
                return (
                  <button
                    key={emp.id}
                    onClick={() => jumpToEmployee(emp.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium whitespace-nowrap transition flex-shrink-0",
                      has
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                        : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                    )}
                    title={has ? `${emp.name}: ${total} cylinders` : `${emp.name}: no entry yet`}
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full", has ? "bg-emerald-500" : "bg-slate-300")} />
                    {emp.name}
                    {has && <span className="tabular-nums font-semibold">{total}</span>}
                  </button>
                );
              })}
            </div>

            {/* Employee entry cards */}
            <div className="space-y-3">
              {filteredEmployees.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-lg py-10 text-center text-sm text-slate-400">
                  No delivery man matches &quot;{search}&quot;
                </div>
              ) : filteredEmployees.map((emp) => {
                const totalCyl = empDayTotal(emp.id, selectedDay);
                const earnings = empDayEarnings(emp.id, selectedDay);
                const hasChanges = activeTypes.some(ct => {
                  const ck = countKey(selectedDay, emp.id, ct.id);
                  const ok = otpKey(selectedDay, emp.id, ct.id);
                  return (grid[ck] || 0) !== (original[ck] || 0) || (grid[ok] || 0) !== (original[ok] || 0);
                });

                return (
                  <div
                    key={emp.id}
                    id={`emp-card-${emp.id}`}
                    className={cn(
                      "bg-white border rounded-lg p-4 scroll-mt-2 transition-shadow duration-300",
                      flashEmp === emp.id ? "border-blue-300 ring-2 ring-blue-200" : "border-slate-200"
                    )}
                  >
                    {/* card header */}
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0",
                          totalCyl > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                        )}>
                          {emp.name[0]}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-800">{emp.name}</span>
                          {hasChanges && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">modified</span>
                          )}
                        </div>
                      </div>
                      {totalCyl > 0 && (
                        <div className="text-right">
                          <span className="text-sm font-semibold text-slate-800 tabular-nums">{formatCurrency(earnings)}</span>
                          <span className="text-xs text-slate-400 ml-2 tabular-nums">{totalCyl} cyl</span>
                        </div>
                      )}
                    </div>

                    {/* compact per-type rows */}
                    <div className="rounded-lg border border-slate-100 overflow-hidden">
                      <div className="grid grid-cols-[minmax(80px,1.4fr)_1fr_1fr_2.6rem_4rem] gap-2 items-center px-3 py-1.5 bg-slate-50 border-b border-slate-100">
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Type</span>
                        <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-wide text-center">OTP +{formatCurrency(otpBonus)}</span>
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide text-center">W/O OTP</span>
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide text-center">Tot</span>
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide text-right">Earn</span>
                      </div>
                      {activeTypes.map((ct, ti) => {
                        const ck = countKey(selectedDay, emp.id, ct.id);
                        const ok = otpKey(selectedDay, emp.id, ct.id);
                        const count = grid[ck] || 0;
                        const otp = grid[ok] || 0;
                        const nonOtp = count - otp;
                        const earn = count * ct.price + otp * otpBonus;

                        return (
                          <div
                            key={ct.id}
                            className={cn(
                              "grid grid-cols-[minmax(80px,1.4fr)_1fr_1fr_2.6rem_4rem] gap-2 items-center px-3 py-1.5",
                              ti > 0 && "border-t border-slate-50",
                              count > 0 && "bg-emerald-50/30"
                            )}
                          >
                            <div className="min-w-0">
                              <span className="text-xs font-medium text-slate-700 block truncate">{ct.name}</span>
                              <span className="text-[10px] text-slate-400 tabular-nums">@ {formatCurrency(ct.price)}</span>
                            </div>
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              data-entry-nav
                              value={otp || ""}
                              onChange={(e) => {
                                const val = e.target.value === "" ? 0 : parseInt(e.target.value, 10);
                                if (!isNaN(val) && val >= 0) {
                                  setVal(ok, val);
                                  if (val > (grid[ck] || 0)) setVal(ck, val);
                                }
                              }}
                              onKeyDown={enterNav}
                              onFocus={(e) => e.target.select()}
                              className="h-8 w-full text-center text-sm font-semibold tabular-nums rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 placeholder:text-emerald-300"
                              placeholder="0"
                              aria-label={`${emp.name} ${ct.name} OTP count`}
                            />
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              data-entry-nav
                              value={nonOtp > 0 ? nonOtp : ""}
                              onChange={(e) => {
                                const val = e.target.value === "" ? 0 : parseInt(e.target.value, 10);
                                if (!isNaN(val) && val >= 0) setVal(ck, (grid[ok] || 0) + val);
                              }}
                              onKeyDown={enterNav}
                              onFocus={(e) => e.target.select()}
                              className="h-8 w-full text-center text-sm font-semibold tabular-nums rounded-md border border-slate-200 bg-white text-slate-800 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 placeholder:text-slate-300"
                              placeholder="0"
                              aria-label={`${emp.name} ${ct.name} without OTP count`}
                            />
                            <span className={cn("text-center text-sm font-bold tabular-nums", count > 0 ? "text-slate-800" : "text-slate-200")}>
                              {count || "—"}
                            </span>
                            <span className={cn("text-right text-[11px] tabular-nums", earn > 0 ? "text-slate-500" : "text-slate-200")}>
                              {earn > 0 ? formatCurrency(earn) : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Always-visible save bar */}
          <div className="flex-shrink-0 bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              {dayChanges > 0 ? (
                <>
                  <span className="flex items-center gap-1.5 text-xs font-medium text-blue-600 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    {dayChanges} unsaved
                  </span>
                  <button
                    onClick={resetDay}
                    className="text-xs font-medium text-slate-400 hover:text-rose-600 transition whitespace-nowrap"
                  >
                    Reset day
                  </button>
                </>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-slate-400 whitespace-nowrap">
                  <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  All saved
                </span>
              )}
              <span className="hidden sm:block text-xs text-slate-400 truncate">
                {dayStats.cyl.toLocaleString("en-IN")} cyl · {formatCurrency(dayStats.earn)}
              </span>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || changedCount === 0}
              title="Ctrl+S"
              className={cn(
                "px-5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                changedCount > 0
                  ? "bg-slate-800 hover:bg-slate-700 text-white"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              )}
            >
              {saving ? "Saving..." : changedCount > 0 ? `Save Changes (${changedCount})` : "No Changes"}
            </button>
          </div>
        </div>
      ) : (
        /* ═════════════ GRID VIEW ═════════════ */
        <div className="flex-1 flex flex-col min-h-0 animate-fade-in">
          {/* month summary + save */}
          <div className="flex items-center justify-between gap-3 mb-3 flex-shrink-0 flex-wrap">
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-semibold text-slate-800 tabular-nums">{monthStats.cyl.toLocaleString("en-IN")}</span>
                <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">cylinders</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-semibold text-emerald-600 tabular-nums">{monthStats.otp.toLocaleString("en-IN")}</span>
                <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">OTP</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-semibold text-slate-800 tabular-nums">{formatCurrency(monthStats.earn)}</span>
                <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">earnings</span>
              </div>
              <div className="hidden lg:flex items-center gap-1.5">
                {monthStats.perType.map((t) => (
                  <span key={t.name} className={cn(
                    "text-[11px] px-2 py-0.5 rounded-md border tabular-nums",
                    t.count > 0 ? "bg-slate-50 border-slate-200 text-slate-600" : "bg-white border-slate-100 text-slate-300"
                  )}>
                    {t.name}: <b>{t.count.toLocaleString("en-IN")}</b>
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || changedCount === 0}
              title="Ctrl+S"
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
                  const isTodayRow = isCurrentMonth && day === now.getDate();
                  const total = rowTotal(day);

                  return (
                    <tr
                      key={day}
                      ref={isTodayRow ? todayRowRef : undefined}
                      className={cn(
                        isTodayRow ? "bg-blue-50/40" : isSunday ? "bg-amber-50/40" : "hover:bg-slate-50"
                      )}
                    >
                      <td
                        className={cn(
                          "sticky left-0 z-10 border-b border-r border-slate-200 px-3 py-1 text-sm whitespace-nowrap cursor-pointer hover:bg-slate-50 transition-colors",
                          isTodayRow ? "bg-blue-50 text-blue-800" : isSunday ? "bg-amber-50 text-amber-800" : "bg-white text-slate-600"
                        )}
                        onClick={() => { setSelectedDay(day); setView("day"); }}
                        title="Click to edit in Day View"
                      >
                        <span className={cn("font-medium tabular-nums", isTodayRow && "font-bold")}>{day}</span>
                        <span className={cn("ml-1.5 text-xs", isTodayRow ? "text-blue-500" : isSunday ? "text-amber-600" : "text-slate-400")}>
                          {DAY_NAMES[dow]}
                        </span>
                        {isTodayRow && (
                          <span className="ml-1.5 text-[9px] font-semibold px-1 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">today</span>
                        )}
                      </td>
                      {employees.map((emp) => {
                        const empTotal = empDayTotal(emp.id, day);
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
                              hasChanges && "bg-blue-100/60",
                              isSunday && !hasChanges && "bg-amber-50/30",
                              empTotal === 0 && "text-slate-300"
                            )}
                            onClick={() => { setSelectedDay(day); setView("day"); }}
                            title={`${emp.name} — ${day} ${getMonthName(month).slice(0, 3)}\n${cellTitle(day, emp.id)}`}
                          >
                            {empTotal > 0 ? (
                              <span>
                                {empTotal}
                                {hasOtp && <span className="text-[9px] text-emerald-600 ml-0.5">*</span>}
                              </span>
                            ) : ""}
                          </td>
                        );
                      })}
                      <td className={cn(
                        "border-b border-slate-200 px-3 py-1 text-right text-sm font-medium tabular-nums whitespace-nowrap",
                        isTodayRow ? "bg-blue-50/60 text-blue-800" : isSunday ? "bg-amber-50/50 text-amber-800" : "bg-slate-50/50 text-slate-700"
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
                    <td key={emp.id} className="border-r border-slate-200 px-2 py-2 text-center text-sm font-semibold text-slate-800 tabular-nums">
                      {colTotal(emp.id).toLocaleString("en-IN")}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right text-sm font-semibold text-slate-800 tabular-nums bg-slate-50">
                    {monthStats.cyl.toLocaleString("en-IN")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-400 flex-shrink-0">
            <span><span className="text-emerald-600">*</span> = has OTP entries</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-blue-100 border border-blue-200 rounded" /> modified</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-amber-50 border border-amber-200 rounded" /> Sunday</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-blue-50 border border-blue-200 rounded" /> today</span>
            <span className="hidden sm:inline text-slate-300">hover a cell for the per-type breakdown · click to edit</span>
          </div>
        </div>
      )}

      {/* Unsaved-changes guard when switching month */}
      <Modal open={pendingMonth !== null} onClose={() => setPendingMonth(null)} title="Unsaved Changes" size="sm">
        <div className="text-sm text-slate-600 mb-5">
          You have <b>{changedCount}</b> unsaved {changedCount === 1 ? "entry" : "entries"} in{" "}
          <b>{getMonthName(month)} {year}</b>. Switching to{" "}
          <b>{pendingMonth ? `${getMonthName(pendingMonth.m)} ${pendingMonth.y}` : ""}</b> will discard them.
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setPendingMonth(null)}
            className="flex-1 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition"
          >
            Keep Editing
          </button>
          <button
            onClick={confirmMonthChange}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition"
          >
            Discard &amp; Switch
          </button>
        </div>
      </Modal>
    </div>
  );
}
