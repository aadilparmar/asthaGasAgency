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
  sellingPrice: number;
  otpRate: number;
  onlineRate: number;
  active: boolean;
  sortOrder: number;
}

interface ConnectionType {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

interface ExpenseHead {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

interface CommercialCustomer {
  id: string;
  name: string;
  productType: string;
  active: boolean;
}

type TabKey = "cylinder-types" | "connection-types" | "expense-heads" | "customers" | "otp" | "office";

export default function SettingsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [cylinderTypes, setCylinderTypes] = useState<CylinderType[]>([]);
  const [connectionTypes, setConnectionTypes] = useState<ConnectionType[]>([]);
  const [expenseHeads, setExpenseHeads] = useState<ExpenseHead[]>([]);
  const [customers, setCustomers] = useState<CommercialCustomer[]>([]);

  const [otpBonus, setOtpBonus] = useState("2");
  const [originalOtpBonus, setOriginalOtpBonus] = useState("2");
  const [loading, setLoading] = useState(true);
  const [salaries, setSalaries] = useState<Record<string, string>>({});
  const [originalSalaries, setOriginalSalaries] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabKey>("cylinder-types");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Modals
  const [ctModal, setCtModal] = useState(false);
  const [ctForm, setCtForm] = useState({ id: "", name: "", price: "", sellingPrice: "", otpRate: "", onlineRate: "" });
  const [ctSaving, setCtSaving] = useState(false);

  const [connModal, setConnModal] = useState(false);
  const [connForm, setConnForm] = useState({ id: "", name: "" });
  const [connSaving, setConnSaving] = useState(false);

  const [ehModal, setEhModal] = useState(false);
  const [ehForm, setEhForm] = useState({ id: "", name: "" });
  const [ehSaving, setEhSaving] = useState(false);

  const [custModal, setCustModal] = useState(false);
  const [custForm, setCustForm] = useState({ id: "", name: "", productType: "" });
  const [custSaving, setCustSaving] = useState(false);

  function showToast(type: "success" | "error", message: string) {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast({ type, message });
    toastTimeout.current = setTimeout(() => setToast(null), 3500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, ctRes, connRes, ehRes, custRes, settingsRes] = await Promise.all([
        fetch("/api/employees"),
        fetch("/api/cylinder-types"),
        fetch("/api/connection-types"),
        fetch("/api/expense-heads"),
        fetch("/api/commercial-customers"),
        fetch("/api/app-settings"),
      ]);
      const empData: Employee[] = await empRes.json();
      setEmployees(empData);
      setCylinderTypes(await ctRes.json());
      setConnectionTypes(await connRes.json());
      setExpenseHeads(await ehRes.json());
      setCustomers(await custRes.json());

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
    setCtForm({ id: "", name: "", price: "", sellingPrice: "", otpRate: "", onlineRate: "" });
    setCtModal(true);
  }
  function openCtEdit(ct: CylinderType) {
    setCtForm({
      id: ct.id, name: ct.name,
      price: ct.price.toString(),
      sellingPrice: ct.sellingPrice.toString(),
      otpRate: ct.otpRate.toString(),
      onlineRate: ct.onlineRate.toString(),
    });
    setCtModal(true);
  }
  async function saveCtForm(e: React.FormEvent) {
    e.preventDefault();
    setCtSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: ctForm.name.trim(),
        price: Number(ctForm.price) || 0,
        sellingPrice: Number(ctForm.sellingPrice) || 0,
        otpRate: Number(ctForm.otpRate) || 0,
        onlineRate: Number(ctForm.onlineRate) || 0,
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
        body: JSON.stringify({
          id: ct.id, name: ct.name, price: ct.price,
          sellingPrice: ct.sellingPrice, otpRate: ct.otpRate, onlineRate: ct.onlineRate,
          active: !ct.active,
        }),
      });
      if (!res.ok) throw new Error();
      showToast("success", `${ct.name} ${ct.active ? "deactivated" : "activated"}`);
      await load();
    } catch { showToast("error", "Failed to update"); }
  }
  async function deleteCt(ct: CylinderType) {
    try {
      const res = await fetch(`/api/cylinder-types?id=${ct.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      const result = await res.json();
      showToast("success", result.deactivated ? `${ct.name} deactivated (has data)` : `${ct.name} deleted`);
      await load();
    } catch { showToast("error", "Failed to delete"); }
  }

  // --- Connection Type CRUD ---
  function openConnAdd() { setConnForm({ id: "", name: "" }); setConnModal(true); }
  function openConnEdit(c: ConnectionType) { setConnForm({ id: c.id, name: c.name }); setConnModal(true); }
  async function saveConnForm(e: React.FormEvent) {
    e.preventDefault();
    setConnSaving(true);
    try {
      const body: Record<string, unknown> = { name: connForm.name.trim() };
      if (connForm.id) body.id = connForm.id;
      const res = await fetch("/api/connection-types", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setConnModal(false);
      showToast("success", connForm.id ? "Connection type updated" : "Connection type added");
      await load();
    } catch { showToast("error", "Failed to save"); }
    setConnSaving(false);
  }
  async function toggleConn(c: ConnectionType) {
    try {
      const res = await fetch("/api/connection-types", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, name: c.name, active: !c.active }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch { showToast("error", "Failed to update"); }
  }
  async function deleteConn(c: ConnectionType) {
    try {
      const res = await fetch(`/api/connection-types?id=${c.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      const result = await res.json();
      showToast("success", result.deactivated ? `${c.name} deactivated (has data)` : `${c.name} deleted`);
      await load();
    } catch { showToast("error", "Failed to delete"); }
  }

  // --- Expense Head CRUD ---
  function openEhAdd() { setEhForm({ id: "", name: "" }); setEhModal(true); }
  function openEhEdit(h: ExpenseHead) { setEhForm({ id: h.id, name: h.name }); setEhModal(true); }
  async function saveEhForm(e: React.FormEvent) {
    e.preventDefault();
    setEhSaving(true);
    try {
      const body: Record<string, unknown> = { name: ehForm.name.trim() };
      if (ehForm.id) body.id = ehForm.id;
      const res = await fetch("/api/expense-heads", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setEhModal(false);
      showToast("success", ehForm.id ? "Expense head updated" : "Expense head added");
      await load();
    } catch { showToast("error", "Failed to save"); }
    setEhSaving(false);
  }
  async function toggleEh(h: ExpenseHead) {
    try {
      const res = await fetch("/api/expense-heads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: h.id, name: h.name, active: !h.active }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch { showToast("error", "Failed to update"); }
  }
  async function deleteEh(h: ExpenseHead) {
    try {
      const res = await fetch(`/api/expense-heads?id=${h.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      const result = await res.json();
      showToast("success", result.deactivated ? `${h.name} deactivated (has data)` : `${h.name} deleted`);
      await load();
    } catch { showToast("error", "Failed to delete"); }
  }

  // --- Commercial Customer CRUD ---
  function openCustAdd() { setCustForm({ id: "", name: "", productType: "" }); setCustModal(true); }
  function openCustEdit(c: CommercialCustomer) {
    setCustForm({ id: c.id, name: c.name, productType: c.productType || "" });
    setCustModal(true);
  }
  async function saveCustForm(e: React.FormEvent) {
    e.preventDefault();
    setCustSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: custForm.name.trim(),
        productType: custForm.productType.trim(),
      };
      if (custForm.id) body.id = custForm.id;
      const res = await fetch("/api/commercial-customers", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setCustModal(false);
      showToast("success", custForm.id ? "Customer updated" : "Customer added");
      await load();
    } catch { showToast("error", "Failed to save"); }
    setCustSaving(false);
  }
  async function toggleCust(c: CommercialCustomer) {
    try {
      const res = await fetch("/api/commercial-customers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, name: c.name, productType: c.productType, active: !c.active }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch { showToast("error", "Failed to update"); }
  }
  async function deleteCust(c: CommercialCustomer) {
    try {
      const res = await fetch(`/api/commercial-customers?id=${c.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      const result = await res.json();
      showToast("success", result.deactivated ? `${c.name} deactivated (has data)` : `${c.name} deleted`);
      await load();
    } catch { showToast("error", "Failed to delete"); }
  }

  // --- OTP Bonus ---
  async function saveOtpBonus() {
    setSaving(true);
    try {
      const res = await fetch("/api/app-settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp_bonus: otpBonus }),
      });
      if (!res.ok) throw new Error();
      setOriginalOtpBonus(otpBonus);
      showToast("success", `OTP bonus updated to ₹${otpBonus}`);
    } catch { showToast("error", "Failed to save OTP bonus"); }
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) throw new Error();
      showToast("success", `Updated ${updates.length} employee${updates.length > 1 ? "s" : ""}`);
      await load();
    } catch { showToast("error", "Failed to save changes"); }
    setSaving(false);
  }

  const otpChanged = otpBonus !== originalOtpBonus;

  const tabList: { key: TabKey; label: string; count: number | null }[] = [
    { key: "cylinder-types",  label: "Cylinder Types",   count: cylinderTypes.length },
    { key: "connection-types",label: "Connection Types", count: connectionTypes.length },
    { key: "expense-heads",   label: "Expense Heads",    count: expenseHeads.length },
    { key: "customers",       label: "Commercial Customers", count: customers.length },
    { key: "otp",             label: "OTP Bonus",        count: null },
    { key: "office",          label: "Office Salaries",  count: officeStaff.length },
  ];

  return (
    <div className="animate-fade-in pb-20">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-800">Settings</h1>
        <p className="text-[13px] text-slate-500">Manage master data, rates, and configurations</p>
      </div>

      {/* Tabs */}
      <div className="bg-slate-100 rounded-lg p-0.5 w-fit mb-6 overflow-x-auto max-w-full">
        <div className="flex gap-0.5 min-w-max">
          {tabList.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition whitespace-nowrap",
                tab === t.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {t.label}
              {t.count !== null && <span className="ml-2 text-[10px] text-slate-400">({t.count})</span>}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading…</div>
      ) : tab === "cylinder-types" ? (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={openCtAdd} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Cylinder Type
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cylinderTypes.map((ct) => (
              <div key={ct.id} className={cn("bg-white border rounded-lg p-4 transition", ct.active ? "border-slate-200" : "border-slate-100 opacity-60")}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{ct.name}</div>
                    <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-md", ct.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                      {ct.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 text-right">
                    <div>Comm rate: <span className="font-semibold text-slate-800">{formatCurrency(ct.price)}</span></div>
                    <div>Sell: <span className="font-semibold text-slate-800 tabular-nums">{formatCurrency(ct.sellingPrice)}</span></div>
                    <div className="text-[11px] text-slate-400">
                      OTP {formatCurrency(ct.otpRate)} | Online {formatCurrency(ct.onlineRate)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                  <button onClick={() => openCtEdit(ct)} className="text-xs font-medium text-slate-500 hover:text-slate-700 transition">Edit</button>
                  <button onClick={() => toggleCt(ct)} className={cn("text-xs font-medium transition", ct.active ? "text-amber-600 hover:text-amber-700" : "text-emerald-600 hover:text-emerald-700")}>
                    {ct.active ? "Deactivate" : "Activate"}
                  </button>
                  <button onClick={() => deleteCt(ct)} className="text-xs font-medium text-rose-500 hover:text-rose-600 transition">Delete</button>
                </div>
              </div>
            ))}
          </div>
          {cylinderTypes.length === 0 && <EmptyMsg onAdd={openCtAdd} addLabel="Add your first cylinder type" />}
        </>
      ) : tab === "connection-types" ? (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={openConnAdd} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Connection Type
            </button>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-16">#</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-24">Status</th>
                  <th className="px-5 py-3 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {connectionTypes.map((c, i) => (
                  <tr key={c.id} className={cn("border-b border-slate-100 last:border-0", !c.active && "opacity-60")}>
                    <td className="px-5 py-2.5 text-[12px] text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="px-5 py-2.5 font-medium text-slate-800">{c.name}</td>
                    <td className="px-5 py-2.5">
                      <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-md", c.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                        {c.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-3">
                        <button onClick={() => openConnEdit(c)} className="text-xs font-medium text-slate-500 hover:text-slate-700">Edit</button>
                        <button onClick={() => toggleConn(c)} className={cn("text-xs font-medium", c.active ? "text-amber-600" : "text-emerald-600")}>{c.active ? "Off" : "On"}</button>
                        <button onClick={() => deleteConn(c)} className="text-xs font-medium text-rose-500 hover:text-rose-600">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : tab === "expense-heads" ? (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={openEhAdd} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Expense Head
            </button>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-16">#</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-24">Status</th>
                  <th className="px-5 py-3 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {expenseHeads.map((h, i) => (
                  <tr key={h.id} className={cn("border-b border-slate-100 last:border-0", !h.active && "opacity-60")}>
                    <td className="px-5 py-2.5 text-[12px] text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="px-5 py-2.5 font-medium text-slate-800">{h.name}</td>
                    <td className="px-5 py-2.5">
                      <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-md", h.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                        {h.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-3">
                        <button onClick={() => openEhEdit(h)} className="text-xs font-medium text-slate-500 hover:text-slate-700">Edit</button>
                        <button onClick={() => toggleEh(h)} className={cn("text-xs font-medium", h.active ? "text-amber-600" : "text-emerald-600")}>{h.active ? "Off" : "On"}</button>
                        <button onClick={() => deleteEh(h)} className="text-xs font-medium text-rose-500 hover:text-rose-600">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : tab === "customers" ? (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={openCustAdd} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Customer
            </button>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-16">#</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Customer</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Product</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-24">Status</th>
                  <th className="px-5 py-3 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c, i) => (
                  <tr key={c.id} className={cn("border-b border-slate-100 last:border-0", !c.active && "opacity-60")}>
                    <td className="px-5 py-2.5 text-[12px] text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="px-5 py-2.5 font-medium text-slate-800">{c.name}</td>
                    <td className="px-5 py-2.5 text-slate-600">{c.productType || "—"}</td>
                    <td className="px-5 py-2.5">
                      <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-md", c.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                        {c.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-3">
                        <button onClick={() => openCustEdit(c)} className="text-xs font-medium text-slate-500 hover:text-slate-700">Edit</button>
                        <button onClick={() => toggleCust(c)} className={cn("text-xs font-medium", c.active ? "text-amber-600" : "text-emerald-600")}>{c.active ? "Off" : "On"}</button>
                        <button onClick={() => deleteCust(c)} className="text-xs font-medium text-rose-500 hover:text-rose-600">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-sm text-slate-400 py-10">No commercial customers yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : tab === "otp" ? (
        <div className="max-w-lg">
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">OTP Bonus Amount (Monthly Salary)</h3>
            <p className="text-xs text-slate-500 mb-4">
              Legacy per-delivery bonus used for monthly salary calculation on the Daily Entry / Salary sheets.
              <br />(Daily Ops uses its own per-cylinder OTP / Online rates.)
            </p>
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">₹</span>
                <input
                  type="number" value={otpBonus} onChange={(e) => setOtpBonus(e.target.value)}
                  min="0" step="0.5"
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none bg-white tabular-nums"
                />
              </div>
              <button
                onClick={saveOtpBonus} disabled={saving || !otpChanged}
                className={cn("px-5 py-2 text-sm font-medium rounded-lg transition",
                  otpChanged ? "bg-slate-800 hover:bg-slate-700 text-white" : "bg-slate-100 text-slate-400 cursor-not-allowed")}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Office Salaries */
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
                    <tr key={emp.id} className={cn("border-b border-slate-100 transition text-sm text-slate-600", isChanged ? "bg-blue-50/50" : "hover:bg-slate-50", !emp.active && "opacity-50")}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-medium flex-shrink-0">
                            {emp.name[0]}
                          </div>
                          <span className="font-medium text-slate-800">{emp.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-md", emp.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                          {emp.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right text-slate-600 tabular-nums">{formatCurrency(originalSalaries[emp.id])}</td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="relative inline-block">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">₹</span>
                          <input
                            type="number"
                            value={salaries[emp.id] || ""}
                            onChange={(e) => setSalaries((prev) => ({ ...prev, [emp.id]: e.target.value }))}
                            min="0" step="100"
                            className={cn("w-28 pl-6 pr-2 py-1.5 rounded-lg border text-right text-sm tabular-nums focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none transition",
                              isChanged ? "border-blue-300 bg-blue-50 text-blue-800 font-medium" : "border-slate-200 bg-slate-50")}
                          />
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {isChanged && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 animate-fade-in">Changed</span>
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
              <button onClick={saveOfficeSalaries} disabled={saving} className="px-6 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition disabled:opacity-50">
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cylinder Type Modal */}
      <Modal open={ctModal} onClose={() => setCtModal(false)} title={ctForm.id ? "Edit Cylinder Type" : "Add Cylinder Type"}>
        <form onSubmit={saveCtForm} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
            <input
              type="text" required value={ctForm.name} onChange={(e) => setCtForm({ ...ctForm, name: e.target.value })}
              className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none"
              placeholder="e.g. 14.2 KG"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Commission Rate (₹)</label>
              <input
                type="number" required min="0" step="0.5" value={ctForm.price}
                onChange={(e) => setCtForm({ ...ctForm, price: e.target.value })}
                className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none"
                placeholder="e.g. 15.5"
              />
              <p className="text-[10px] text-slate-400 mt-1">Per-cylinder pay for delivery man (Daily Entry)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Selling Price (₹)</label>
              <input
                type="number" min="0" step="0.5" value={ctForm.sellingPrice}
                onChange={(e) => setCtForm({ ...ctForm, sellingPrice: e.target.value })}
                className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none"
                placeholder="e.g. 921"
              />
              <p className="text-[10px] text-slate-400 mt-1">Per-cylinder sale revenue (Daily Ops)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">OTP Rate (₹)</label>
              <input
                type="number" min="0" step="0.5" value={ctForm.otpRate}
                onChange={(e) => setCtForm({ ...ctForm, otpRate: e.target.value })}
                className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none"
                placeholder="e.g. 2"
              />
              <p className="text-[10px] text-slate-400 mt-1">Daily Ops OTP bonus per cylinder</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Online Rate (₹)</label>
              <input
                type="number" min="0" step="0.5" value={ctForm.onlineRate}
                onChange={(e) => setCtForm({ ...ctForm, onlineRate: e.target.value })}
                className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none"
                placeholder="e.g. 15"
              />
              <p className="text-[10px] text-slate-400 mt-1">Daily Ops Online bonus per cylinder</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setCtModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition">Cancel</button>
            <button type="submit" disabled={ctSaving} className="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition">
              {ctSaving ? "Saving…" : ctForm.id ? "Update" : "Add"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Connection Type Modal */}
      <Modal open={connModal} onClose={() => setConnModal(false)} title={connForm.id ? "Edit Connection Type" : "Add Connection Type"} size="sm">
        <form onSubmit={saveConnForm} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
            <input
              type="text" required value={connForm.name}
              onChange={(e) => setConnForm({ ...connForm, name: e.target.value })}
              className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none"
              placeholder="e.g. NDBC (2 Bottal)"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setConnModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="submit" disabled={connSaving} className="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50">
              {connSaving ? "Saving…" : connForm.id ? "Update" : "Add"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Expense Head Modal */}
      <Modal open={ehModal} onClose={() => setEhModal(false)} title={ehForm.id ? "Edit Expense Head" : "Add Expense Head"} size="sm">
        <form onSubmit={saveEhForm} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
            <input
              type="text" required value={ehForm.name}
              onChange={(e) => setEhForm({ ...ehForm, name: e.target.value })}
              className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none"
              placeholder="e.g. REFRESHMENT"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setEhModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="submit" disabled={ehSaving} className="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50">
              {ehSaving ? "Saving…" : ehForm.id ? "Update" : "Add"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Customer Modal */}
      <Modal open={custModal} onClose={() => setCustModal(false)} title={custForm.id ? "Edit Customer" : "Add Commercial Customer"} size="sm">
        <form onSubmit={saveCustForm} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Customer Name</label>
            <input
              type="text" required value={custForm.name}
              onChange={(e) => setCustForm({ ...custForm, name: e.target.value })}
              className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none"
              placeholder="e.g. ABC Hotel"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Default Product Type</label>
            <input
              type="text" value={custForm.productType}
              onChange={(e) => setCustForm({ ...custForm, productType: e.target.value })}
              className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none"
              placeholder="e.g. 19 KG (optional)"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setCustModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="submit" disabled={custSaving} className="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50">
              {custSaving ? "Saving…" : custForm.id ? "Update" : "Add"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function EmptyMsg({ onAdd, addLabel }: { onAdd: () => void; addLabel: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
      <p className="text-sm text-slate-400">No items configured</p>
      <button onClick={onAdd} className="mt-2 text-sm text-slate-600 hover:text-slate-800 font-medium">
        {addLabel}
      </button>
    </div>
  );
}
