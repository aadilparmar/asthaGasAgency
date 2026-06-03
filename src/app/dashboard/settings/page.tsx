"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Modal from "@/components/Modal";
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

interface CylinderType {
  id: string;
  name: string;
  price: number;
  active: boolean;
  sortOrder: number;
}

export default function SettingsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [cylinderTypes, setCylinderTypes] = useState<CylinderType[]>([]);
  const [otpBonus, setOtpBonus] = useState("2");
  const [originalOtpBonus, setOriginalOtpBonus] = useState("2");
  const [loading, setLoading] = useState(true);
  const [salaries, setSalaries] = useState<Record<string, string>>({});
  const [originalSalaries, setOriginalSalaries] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"cylinder-types" | "otp" | "office">("cylinder-types");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cylinder type modal
  const [ctModal, setCtModal] = useState(false);
  const [ctForm, setCtForm] = useState({ id: "", name: "", price: "" });
  const [ctSaving, setCtSaving] = useState(false);

  function showToast(type: "success" | "error", message: string) {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast({ type, message });
    toastTimeout.current = setTimeout(() => setToast(null), 3500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, ctRes, settingsRes] = await Promise.all([
        fetch("/api/employees"),
        fetch("/api/cylinder-types"),
        fetch("/api/app-settings"),
      ]);
      const empData: Employee[] = await empRes.json();
      setEmployees(empData);

      const ctData: CylinderType[] = await ctRes.json();
      setCylinderTypes(ctData);

      const settings = await settingsRes.json();
      setOtpBonus(settings.otp_bonus || "2");
      setOriginalOtpBonus(settings.otp_bonus || "2");

      const salaryMap: Record<string, string> = {};
      const origSalaryMap: Record<string, number> = {};
      for (const emp of empData) {
        if (emp.type === "office") {
          salaryMap[emp.id] = emp.fixedSalary.toString();
          origSalaryMap[emp.id] = emp.fixedSalary;
        }
      }
      setSalaries(salaryMap);
      setOriginalSalaries(origSalaryMap);
    } catch {
      showToast("error", "Failed to load settings");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const officeStaff = employees.filter((e) => e.type === "office");

  // --- Cylinder Type CRUD ---
  function openCtAdd() {
    setCtForm({ id: "", name: "", price: "" });
    setCtModal(true);
  }

  function openCtEdit(ct: CylinderType) {
    setCtForm({ id: ct.id, name: ct.name, price: ct.price.toString() });
    setCtModal(true);
  }

  async function saveCtForm(e: React.FormEvent) {
    e.preventDefault();
    setCtSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: ctForm.name.trim(),
        price: Number(ctForm.price) || 0,
      };
      if (ctForm.id) body.id = ctForm.id;

      const res = await fetch("/api/cylinder-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setCtModal(false);
      showToast("success", ctForm.id ? "Cylinder type updated" : "Cylinder type added");
      await load();
    } catch {
      showToast("error", "Failed to save cylinder type");
    }
    setCtSaving(false);
  }

  async function toggleCt(ct: CylinderType) {
    try {
      const res = await fetch("/api/cylinder-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ct.id, name: ct.name, price: ct.price, active: !ct.active }),
      });
      if (!res.ok) throw new Error();
      showToast("success", `${ct.name} ${ct.active ? "deactivated" : "activated"}`);
      await load();
    } catch {
      showToast("error", "Failed to update");
    }
  }

  async function deleteCt(ct: CylinderType) {
    try {
      const res = await fetch(`/api/cylinder-types?id=${ct.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      const result = await res.json();
      showToast("success", result.deactivated ? `${ct.name} deactivated (has delivery data)` : `${ct.name} deleted`);
      await load();
    } catch {
      showToast("error", "Failed to delete");
    }
  }

  // --- OTP Bonus ---
  async function saveOtpBonus() {
    setSaving(true);
    try {
      const res = await fetch("/api/app-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp_bonus: otpBonus }),
      });
      if (!res.ok) throw new Error();
      setOriginalOtpBonus(otpBonus);
      showToast("success", `OTP bonus updated to ₹${otpBonus}`);
    } catch {
      showToast("error", "Failed to save OTP bonus");
    }
    setSaving(false);
  }

  // --- Office Salaries ---
  const officeChanges = officeStaff.filter(
    (emp) => Number(salaries[emp.id]) !== originalSalaries[emp.id]
  ).length;

  async function saveOfficeSalaries() {
    const updates: { id: string; fixedSalary: number }[] = [];
    for (const emp of officeStaff) {
      const newSalary = Number(salaries[emp.id]);
      if (newSalary !== originalSalaries[emp.id]) {
        updates.push({ id: emp.id, fixedSalary: newSalary });
      }
    }
    if (updates.length === 0) { showToast("success", "No changes to save"); return; }
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

  const otpChanged = otpBonus !== originalOtpBonus;
  const hasUnsaved = (tab === "cylinder-types" ? false : tab === "otp" ? otpChanged : officeChanges > 0);

  return (
    <div className="animate-fade-in">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-800">Settings</h1>
        <p className="text-[13px] text-slate-500">Manage cylinder types, rates, and configurations</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 w-fit mb-6 overflow-x-auto">
        {[
          { key: "cylinder-types" as const, label: "Cylinder Types", count: cylinderTypes.length },
          { key: "otp" as const, label: "OTP Bonus", count: null },
          { key: "office" as const, label: "Office Salaries", count: officeStaff.length },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition whitespace-nowrap",
              tab === t.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            {t.label}
            {t.count !== null && <span className="ml-2 text-xs text-slate-400">({t.count})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400">
          <svg className="animate-spin h-6 w-6 mr-2" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </div>
      ) : tab === "cylinder-types" ? (
        /* ===== CYLINDER TYPES ===== */
        <>
          {/* Add button */}
          <div className="flex justify-end mb-4">
            <button
              onClick={openCtAdd}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Cylinder Type
            </button>
          </div>

          {/* Types Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cylinderTypes.map((ct) => (
              <div
                key={ct.id}
                className={cn(
                  "bg-white border rounded-lg p-4 transition",
                  ct.active ? "border-slate-200" : "border-slate-100 opacity-60"
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{ct.name}</div>
                    <span className={cn(
                      "text-[11px] font-medium px-2 py-0.5 rounded-md",
                      ct.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                    )}>
                      {ct.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="text-xl font-semibold text-slate-800 tabular-nums">
                    {formatCurrency(ct.price)}
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                  <button onClick={() => openCtEdit(ct)} className="text-xs font-medium text-slate-500 hover:text-slate-700 transition">
                    Edit
                  </button>
                  <button
                    onClick={() => toggleCt(ct)}
                    className={cn(
                      "text-xs font-medium transition",
                      ct.active ? "text-amber-600 hover:text-amber-700" : "text-emerald-600 hover:text-emerald-700"
                    )}
                  >
                    {ct.active ? "Deactivate" : "Activate"}
                  </button>
                  <button onClick={() => deleteCt(ct)} className="text-xs font-medium text-rose-500 hover:text-rose-600 transition">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {cylinderTypes.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
              <p className="text-sm text-slate-400">No cylinder types configured</p>
              <button onClick={openCtAdd} className="mt-2 text-sm text-slate-600 hover:text-slate-800 font-medium">
                Add your first type
              </button>
            </div>
          )}
        </>
      ) : tab === "otp" ? (
        /* ===== OTP BONUS ===== */
        <div className="max-w-lg">
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">OTP Bonus Amount</h3>
            <p className="text-xs text-slate-500 mb-4">
              Extra amount per cylinder when the delivery man collects OTP from the customer.
            </p>

            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">₹</span>
                <input
                  type="number"
                  value={otpBonus}
                  onChange={(e) => setOtpBonus(e.target.value)}
                  min="0"
                  step="0.5"
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none bg-white tabular-nums"
                />
              </div>
              <button
                onClick={saveOtpBonus}
                disabled={saving || !otpChanged}
                className={cn(
                  "px-5 py-2 text-sm font-medium rounded-lg transition",
                  otpChanged
                    ? "bg-slate-800 hover:bg-slate-700 text-white"
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                )}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>

            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500">
                <strong>How it works:</strong> If a delivery man delivers a cylinder with OTP,
                they earn the cylinder rate + ₹{otpBonus} bonus. Without OTP, they earn just the cylinder rate.
              </p>
              <div className="mt-2 text-xs text-slate-400">
                Example: 14.2 KG cylinder ({formatCurrency(cylinderTypes.find(ct => ct.name === "14.2 KG")?.price || 15.5)}) with OTP
                = {formatCurrency((cylinderTypes.find(ct => ct.name === "14.2 KG")?.price || 15.5) + Number(otpBonus))} per cylinder
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ===== OFFICE SALARIES ===== */
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
                        <span className={cn(
                          "text-[11px] font-medium px-2 py-0.5 rounded-md",
                          emp.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                        )}>
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

      {/* Sticky Save Bar for office */}
      {tab === "office" && officeChanges > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:left-60 z-30 bg-white border-t border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="text-sm text-slate-600">
              <span className="inline-flex items-center justify-center w-5 h-5 bg-slate-800 text-white text-[10px] font-bold rounded-full mr-2">
                {officeChanges}
              </span>
              unsaved change{officeChanges > 1 ? "s" : ""}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const reset: Record<string, string> = {};
                  for (const emp of officeStaff) reset[emp.id] = originalSalaries[emp.id].toString();
                  setSalaries((prev) => ({ ...prev, ...reset }));
                }}
                className="px-4 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition"
              >
                Reset
              </button>
              <button
                onClick={saveOfficeSalaries}
                disabled={saving}
                className="px-6 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cylinder Type Modal */}
      <Modal open={ctModal} onClose={() => setCtModal(false)} title={ctForm.id ? "Edit Cylinder Type" : "Add Cylinder Type"} size="sm">
        <form onSubmit={saveCtForm} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
            <input
              type="text"
              required
              value={ctForm.name}
              onChange={(e) => setCtForm({ ...ctForm, name: e.target.value })}
              className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none"
              placeholder="e.g. 14.2 KG"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Price per Cylinder (₹)</label>
            <input
              type="number"
              required
              min="0"
              step="0.5"
              value={ctForm.price}
              onChange={(e) => setCtForm({ ...ctForm, price: e.target.value })}
              className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none"
              placeholder="e.g. 15.5"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setCtModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={ctSaving}
              className="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition"
            >
              {ctSaving ? "Saving..." : ctForm.id ? "Update" : "Add"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
