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

type Tab = "delivery" | "office";

const emptyForm = { name: "", type: "delivery" as "delivery" | "office", rate: "", fixedSalary: "" };

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("delivery");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
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
      if (res.ok) setEmployees(await res.json());
    } catch {
      showToast("error", "Failed to load employees");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = employees.filter((e) => e.type === tab);

  function openAdd() {
    setEditingId(null);
    setForm({ ...emptyForm, type: tab });
    setModalOpen(true);
  }

  function openEdit(emp: Employee) {
    setEditingId(emp.id);
    setForm({
      name: emp.name,
      type: emp.type,
      rate: emp.rate?.toString() || "",
      fixedSalary: emp.fixedSalary?.toString() || "",
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      type: form.type,
    };
    if (form.type === "delivery") {
      body.rate = Number(form.rate);
    } else {
      body.fixedSalary = Number(form.fixedSalary);
    }

    try {
      const url = editingId ? `/api/employees/${editingId}` : "/api/employees";
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      closeModal();
      showToast("success", editingId ? "Employee updated" : "Employee added");
      await load();
    } catch {
      showToast("error", "Failed to save employee");
    }
    setSaving(false);
  }

  async function toggleActive(emp: Employee) {
    try {
      const res = await fetch(`/api/employees/${emp.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !emp.active }),
      });
      if (!res.ok) throw new Error();
      showToast("success", `${emp.name} ${emp.active ? "deactivated" : "activated"}`);
      await load();
    } catch {
      showToast("error", "Failed to update status");
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/employees/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setDeleteConfirm(null);
      showToast("success", "Employee deleted");
      await load();
    } catch {
      showToast("error", "Failed to delete employee");
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "delivery", label: "Delivery Staff" },
    { key: "office", label: "Office Staff" },
  ];

  return (
    <div className="animate-fade-in font-[Poppins,sans-serif]">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Employees</h1>
          <p className="text-[13px] text-slate-500">Manage delivery and office staff</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition flex items-center gap-2 w-fit"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Employee
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5 w-fit mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition",
              tab === t.key
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            {t.label}
            <span className="ml-2 text-xs text-slate-400">
              ({employees.filter((e) => e.type === t.key).length})
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
            Loading employees...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <p className="text-sm">No {tab} staff found</p>
            <button onClick={openAdd} className="mt-2 text-sm text-slate-600 hover:text-slate-800 font-medium">
              Add one now
            </button>
          </div>
        ) : (
          <>
            {/* Mobile: Card view */}
            <div className="sm:hidden divide-y divide-slate-100">
              {filtered.map((emp) => (
                <div key={emp.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-medium flex-shrink-0">
                        {emp.name[0]}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-800">{emp.name}</div>
                        <div className="text-xs text-slate-500 tabular-nums">
                          {tab === "delivery" ? `${formatCurrency(emp.rate)}/cyl` : formatCurrency(emp.fixedSalary)}
                        </div>
                      </div>
                    </div>
                    <span className={cn(
                      "text-[11px] font-medium px-2 py-0.5 rounded-md",
                      emp.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                    )}>
                      {emp.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-3 pt-2 border-t border-slate-100">
                    <button onClick={() => openEdit(emp)} className="text-xs font-medium text-slate-500 hover:text-slate-700 transition">
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(emp)}
                      className={cn(
                        "text-xs font-medium transition",
                        emp.active ? "text-amber-600 hover:text-amber-700" : "text-emerald-600 hover:text-emerald-700"
                      )}
                    >
                      {emp.active ? "Deactivate" : "Activate"}
                    </button>
                    <button onClick={() => setDeleteConfirm(emp.id)} className="text-xs font-medium text-rose-500 hover:text-rose-600 transition">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: Table view */}
            <table className="w-full text-sm hidden sm:table">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    {tab === "delivery" ? "Rate (per cylinder)" : "Fixed Salary"}
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => (
                  <tr key={emp.id} className="border-b border-slate-100 last:border-0 text-sm text-slate-600 hover:bg-slate-50 transition">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-medium flex-shrink-0">
                          {emp.name[0]}
                        </div>
                        <span className="font-medium text-slate-800">{emp.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 tabular-nums">
                      {tab === "delivery" ? formatCurrency(emp.rate || 0) : formatCurrency(emp.fixedSalary || 0)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={cn(
                        "text-[11px] font-medium px-2 py-0.5 rounded-md",
                        emp.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      )}>
                        {emp.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-4">
                        <button onClick={() => openEdit(emp)} className="text-xs font-medium text-slate-500 hover:text-slate-700 transition">
                          Edit
                        </button>
                        <button
                          onClick={() => toggleActive(emp)}
                          className={cn(
                            "text-xs font-medium transition",
                            emp.active ? "text-amber-600 hover:text-amber-700" : "text-emerald-600 hover:text-emerald-700"
                          )}
                        >
                          {emp.active ? "Deactivate" : "Activate"}
                        </button>
                        <button onClick={() => setDeleteConfirm(emp.id)} className="text-xs font-medium text-rose-500 hover:text-rose-600 transition">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={closeModal} title={editingId ? "Edit Employee" : "Add Employee"}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none transition"
              placeholder="Employee name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as "delivery" | "office" })}
              className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none bg-white transition"
            >
              <option value="delivery">Delivery</option>
              <option value="office">Office</option>
            </select>
          </div>

          {form.type === "delivery" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Rate per Cylinder</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
                className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none transition"
                placeholder="e.g. 25"
              />
            </div>
          )}

          {form.type === "office" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Fixed Salary</label>
              <input
                type="number"
                required
                min="0"
                step="1"
                value={form.fixedSalary}
                onChange={(e) => setForm({ ...form, fixedSalary: e.target.value })}
                className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none transition"
                placeholder="e.g. 15000"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg transition"
            >
              {saving ? "Saving..." : editingId ? "Update" : "Add Employee"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)} title="Delete Employee" size="sm">
        <p className="text-sm text-slate-600 mb-6">
          Are you sure? This will permanently delete this employee and all their associated records.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setDeleteConfirm(null)}
            className="px-4 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
