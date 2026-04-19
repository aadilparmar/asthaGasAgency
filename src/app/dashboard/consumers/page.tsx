"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Modal from "@/components/Modal";
import Toast from "@/components/Toast";
import { formatCurrency, cn } from "@/lib/utils";

interface CylinderTypeLite { id: string; name: string; sellingPrice: number; }
interface EmployeeLite { id: string; name: string; }

interface Consumer {
  id: string;
  consumerNumber: string | null;
  bpclId: string | null;
  name: string;
  phone: string;
  address: string;
  area: string;
  cylinderTypeId: string | null;
  cylinderType: CylinderTypeLite | null;
  connectionDate: string | null;
  depositPaid: number;
  active: boolean;
  note: string;
  lastRefillDate: string | null;
  daysSinceLastRefill: number | null;
  refillCount: number;
}

interface Refill {
  id: string;
  date: string;
  cylinderTypeId: string;
  paymentMode: string;
  amount: number;
  employeeId: string | null;
  note: string;
  cylinderType: { name: string };
  employee: { name: string } | null;
}

interface ConsumerDetail extends Consumer {
  refills: Refill[];
  avgRefillIntervalDays: number | null;
  totalRefills: number;
  totalSpent: number;
}

type FilterKey = "all" | "due" | "active" | "inactive";

export default function ConsumersPage() {
  const [consumers, setConsumers] = useState<Consumer[]>([]);
  const [cylTypes, setCylTypes] = useState<CylinderTypeLite[]>([]);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [dueThreshold, setDueThreshold] = useState(25);

  // Detail drawer
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConsumerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    id: "", consumerNumber: "", bpclId: "", name: "", phone: "",
    address: "", area: "", cylinderTypeId: "", connectionDate: "",
    depositPaid: "", note: "",
  });
  const [saving, setSaving] = useState(false);

  const [refillOpen, setRefillOpen] = useState(false);
  const [refillForm, setRefillForm] = useState({
    date: "", cylinderTypeId: "", paymentMode: "cash",
    amount: "", employeeId: "", note: "", recordStock: true, emptyReturned: true,
  });
  const [refillSaving, setRefillSaving] = useState(false);

  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast({ type, message });
    toastTimeout.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (filter === "active") params.set("active", "true");
      if (filter === "inactive") params.set("active", "false");

      const [cRes, ctRes, eRes] = await Promise.all([
        fetch(`/api/consumers?${params}`),
        fetch("/api/cylinder-types"),
        fetch("/api/employees?type=delivery&active=true"),
      ]);

      const data: Consumer[] = await cRes.json();
      setConsumers(data);
      setCylTypes(await ctRes.json());
      setEmployees(await eRes.json());
    } catch {
      showToast("error", "Failed to load consumers");
    }
    setLoading(false);
  }, [q, filter, showToast]);

  useEffect(() => { load(); }, [load]);

  const visibleConsumers = useMemo(() => {
    if (filter === "due") {
      return consumers.filter(
        (c) => c.active && (c.lastRefillDate === null || (c.daysSinceLastRefill ?? 0) >= dueThreshold)
      ).sort((a, b) => {
        const av = a.daysSinceLastRefill ?? 999;
        const bv = b.daysSinceLastRefill ?? 999;
        return bv - av;
      });
    }
    return consumers;
  }, [consumers, filter, dueThreshold]);

  const dueCount = useMemo(() =>
    consumers.filter(
      (c) => c.active && (c.lastRefillDate === null || (c.daysSinceLastRefill ?? 0) >= dueThreshold)
    ).length,
  [consumers, dueThreshold]);

  const activeCylTypes = useMemo(() => cylTypes.filter(t => t.sellingPrice >= 0), [cylTypes]);

  // Detail loader
  useEffect(() => {
    if (!detailId) { setDetail(null); return; }
    setDetailLoading(true);
    fetch(`/api/consumers/${detailId}`)
      .then((r) => r.json())
      .then((d) => setDetail(d))
      .catch(() => showToast("error", "Failed to load detail"))
      .finally(() => setDetailLoading(false));
  }, [detailId, showToast]);

  // Actions
  function openAdd() {
    setForm({
      id: "", consumerNumber: "", bpclId: "", name: "", phone: "",
      address: "", area: "", cylinderTypeId: "", connectionDate: "",
      depositPaid: "", note: "",
    });
    setAddOpen(true);
  }
  function openEdit(c: Consumer) {
    setForm({
      id: c.id,
      consumerNumber: c.consumerNumber || "",
      bpclId: c.bpclId || "",
      name: c.name,
      phone: c.phone || "",
      address: c.address || "",
      area: c.area || "",
      cylinderTypeId: c.cylinderTypeId || "",
      connectionDate: c.connectionDate ? new Date(c.connectionDate).toISOString().slice(0, 10) : "",
      depositPaid: c.depositPaid.toString(),
      note: c.note || "",
    });
    setAddOpen(true);
  }
  async function saveConsumer(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        consumerNumber: form.consumerNumber.trim() || null,
        bpclId: form.bpclId.trim() || null,
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        area: form.area.trim(),
        cylinderTypeId: form.cylinderTypeId || null,
        connectionDate: form.connectionDate || null,
        depositPaid: Number(form.depositPaid) || 0,
        note: form.note.trim(),
      };
      if (form.id) body.id = form.id;
      const res = await fetch("/api/consumers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setAddOpen(false);
      showToast("success", form.id ? "Consumer updated" : "Consumer added");
      await load();
      if (form.id && detailId === form.id) setDetailId(form.id);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to save");
    }
    setSaving(false);
  }
  async function toggleActive(c: Consumer) {
    try {
      const res = await fetch("/api/consumers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, name: c.name, phone: c.phone, address: c.address, area: c.area,
          cylinderTypeId: c.cylinderTypeId, connectionDate: c.connectionDate, depositPaid: c.depositPaid,
          note: c.note, consumerNumber: c.consumerNumber, bpclId: c.bpclId, active: !c.active }),
      });
      if (!res.ok) throw new Error();
      showToast("success", `${c.name} ${c.active ? "deactivated" : "activated"}`);
      await load();
    } catch { showToast("error", "Failed to update"); }
  }
  async function deleteConsumer(c: Consumer) {
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/consumers?id=${c.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      const result = await res.json();
      showToast("success", result.deactivated ? `${c.name} deactivated (has refill history)` : `${c.name} deleted`);
      if (detailId === c.id) setDetailId(null);
      await load();
    } catch { showToast("error", "Failed to delete"); }
  }

  function openRefill(c: Consumer) {
    const ct = c.cylinderTypeId
      ? cylTypes.find((t) => t.id === c.cylinderTypeId)
      : cylTypes[0];
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setRefillForm({
      date: todayStr,
      cylinderTypeId: ct?.id || "",
      paymentMode: "cash",
      amount: (ct?.sellingPrice || 0).toString(),
      employeeId: "",
      note: "",
      recordStock: true,
      emptyReturned: true,
    });
    setDetailId(c.id);
    setRefillOpen(true);
  }
  async function saveRefill(e: React.FormEvent) {
    e.preventDefault();
    if (!detailId) return;
    setRefillSaving(true);
    try {
      const res = await fetch(`/api/consumers/${detailId}/refills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: refillForm.date,
          cylinderTypeId: refillForm.cylinderTypeId,
          paymentMode: refillForm.paymentMode,
          amount: Number(refillForm.amount) || 0,
          employeeId: refillForm.employeeId || null,
          note: refillForm.note.trim(),
          recordStock: refillForm.recordStock,
          emptyReturned: refillForm.emptyReturned,
        }),
      });
      if (!res.ok) throw new Error();
      setRefillOpen(false);
      showToast("success", "Refill recorded");
      // Refresh list + detail
      await load();
      if (detailId) {
        const r = await fetch(`/api/consumers/${detailId}`);
        setDetail(await r.json());
      }
    } catch {
      showToast("error", "Failed to record refill");
    }
    setRefillSaving(false);
  }

  const filterTabs: { key: FilterKey; label: string; count: number }[] = [
    { key: "all",      label: "All",       count: consumers.length },
    { key: "due",      label: "Due Refill",count: dueCount },
    { key: "active",   label: "Active",    count: consumers.filter(c => c.active).length },
    { key: "inactive", label: "Inactive",  count: consumers.filter(c => !c.active).length },
  ];

  return (
    <div className="animate-fade-in">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Consumers</h1>
          <p className="text-[13px] text-slate-500">Domestic households — master database &amp; refill history</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
            <span className="text-[11px] text-slate-500">Due after</span>
            <input
              type="number" value={dueThreshold} onChange={(e) => setDueThreshold(Math.max(1, Number(e.target.value) || 25))}
              className="w-12 text-sm font-semibold text-slate-800 tabular-nums text-right outline-none bg-transparent"
              min={1} max={365}
            />
            <span className="text-[11px] text-slate-500">days</span>
          </div>
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Consumer
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Total Consumers" value={consumers.length.toString()} tone="slate" />
        <KpiCard label="Active" value={consumers.filter(c => c.active).length.toString()} tone="emerald" />
        <KpiCard label="Due Refill" value={dueCount.toString()} sub={`${dueThreshold}+ days`} tone={dueCount > 0 ? "amber" : "slate"} />
        <KpiCard label="Total Deposits" value={formatCurrency(consumers.reduce((s, c) => s + c.depositPaid, 0))} tone="blue" />
      </div>

      {/* Filter tabs + search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="bg-slate-100 rounded-lg p-0.5 flex gap-0.5 overflow-x-auto w-fit">
          {filterTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition whitespace-nowrap",
                filter === t.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {t.label}
              <span className="ml-1.5 text-[10px] text-slate-400">({t.count})</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, phone, consumer ID, address…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none"
          />
        </div>
      </div>

      {/* Content split: list (left) + detail (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,420px] gap-4">
        {/* LIST */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading consumers…</div>
          ) : visibleConsumers.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
              {consumers.length === 0 ? "No consumers yet — add your first one." : "No consumers match."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide min-w-[200px]">Consumer</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide">Contact</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide">Product</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide">Last Refill</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide w-28">Refills</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleConsumers.map((c) => {
                    const isSelected = detailId === c.id;
                    const isDue = c.active && (c.lastRefillDate === null || (c.daysSinceLastRefill ?? 0) >= dueThreshold);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setDetailId(c.id)}
                        className={cn(
                          "border-b border-slate-100 last:border-0 cursor-pointer transition",
                          isSelected ? "bg-blue-50" : "hover:bg-slate-50",
                          !c.active && "opacity-60"
                        )}
                      >
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2.5">
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0",
                              isDue ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                            )}>
                              {c.name[0]}
                            </div>
                            <div>
                              <div className="font-medium text-slate-800 text-[13px]">{c.name}</div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                                {c.consumerNumber && <span>#{c.consumerNumber}</span>}
                                {c.area && <span>· {c.area}</span>}
                                {!c.active && <span className="text-slate-500">· inactive</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="text-[13px] text-slate-700">{c.phone || <span className="text-slate-300">—</span>}</div>
                          {c.address && <div className="text-[11px] text-slate-400 truncate max-w-[200px]">{c.address}</div>}
                        </td>
                        <td className="px-4 py-2 text-[13px] text-slate-600">{c.cylinderType?.name || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-2 text-right">
                          {c.lastRefillDate ? (
                            <>
                              <div className="text-[13px] text-slate-700 tabular-nums">
                                {new Date(c.lastRefillDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                              </div>
                              <div className={cn(
                                "text-[11px] tabular-nums",
                                isDue ? "text-amber-600 font-medium" : "text-slate-400"
                              )}>
                                {c.daysSinceLastRefill}d ago
                              </div>
                            </>
                          ) : (
                            <span className={cn("text-[11px] font-medium", isDue ? "text-amber-600" : "text-slate-400")}>
                              Never
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-[13px] font-semibold text-slate-700 tabular-nums">
                          {c.refillCount}
                        </td>
                        <td className="pr-3 py-2 text-right">
                          <svg className="w-4 h-4 text-slate-300 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* DETAIL PANEL */}
        <div className={cn(
          "bg-white border border-slate-200 rounded-lg overflow-hidden lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto",
          !detailId && "hidden lg:flex lg:items-center lg:justify-center lg:min-h-[400px]"
        )}>
          {!detailId ? (
            <div className="text-center text-slate-400 text-sm p-8">
              <svg className="w-10 h-10 mx-auto mb-2 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Select a consumer to see refill history
            </div>
          ) : detailLoading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Loading detail…</div>
          ) : detail ? (
            <div>
              {/* Header */}
              <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-slate-800 truncate">{detail.name}</h3>
                    <div className="text-[12px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      {detail.consumerNumber && <span>#{detail.consumerNumber}</span>}
                      {detail.bpclId && <span>BPCL {detail.bpclId}</span>}
                      <span className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded",
                        detail.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      )}>
                        {detail.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => setDetailId(null)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Contact & metadata */}
              <div className="p-4 space-y-2 text-[12px] text-slate-600 border-b border-slate-100">
                {detail.phone && <Row label="Phone" value={detail.phone} />}
                {detail.address && <Row label="Address" value={detail.address} />}
                {detail.area && <Row label="Area" value={detail.area} />}
                {detail.cylinderType && <Row label="Product" value={detail.cylinderType.name} />}
                {detail.connectionDate && <Row label="Connection" value={new Date(detail.connectionDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} />}
                {detail.depositPaid > 0 && <Row label="Deposit" value={formatCurrency(detail.depositPaid)} />}
                {detail.note && <Row label="Note" value={detail.note} />}
              </div>

              {/* Refill stats */}
              <div className="p-4 grid grid-cols-3 gap-2 border-b border-slate-100">
                <MiniStat label="Refills" value={detail.totalRefills.toString()} />
                <MiniStat label="Avg cycle" value={detail.avgRefillIntervalDays ? `${detail.avgRefillIntervalDays}d` : "—"} />
                <MiniStat label="Total spent" value={formatCurrency(detail.totalSpent)} />
              </div>

              {/* Actions */}
              <div className="p-4 flex items-center gap-2 border-b border-slate-100">
                <button onClick={() => openRefill(detail)} className="flex-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-md transition flex items-center justify-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Record Refill
                </button>
                <button onClick={() => openEdit(detail)} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium rounded-md transition">
                  Edit
                </button>
                <button onClick={() => toggleActive(detail)} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium rounded-md transition">
                  {detail.active ? "Disable" : "Enable"}
                </button>
              </div>

              {/* Refill history */}
              <div className="p-4">
                <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Refill History</h4>
                {detail.refills.length === 0 ? (
                  <div className="text-center text-slate-400 text-sm py-6">No refills yet.</div>
                ) : (
                  <div className="space-y-1.5">
                    {detail.refills.map((r) => (
                      <div key={r.id} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-md text-[12px]">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-700 flex items-center gap-1.5 flex-wrap">
                              <span className="tabular-nums">{new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}</span>
                              <span className="text-slate-400">·</span>
                              <span>{r.cylinderType.name}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1.5 flex-wrap">
                              <span className="bg-slate-200 text-slate-600 px-1 rounded text-[9px] uppercase">{r.paymentMode}</span>
                              {r.employee && <span>· {r.employee.name}</span>}
                              {r.note && <span className="truncate">· {r.note}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="text-[12px] font-semibold text-slate-800 tabular-nums flex-shrink-0 ml-2">
                          {formatCurrency(r.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Danger zone */}
              <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                <button onClick={() => deleteConsumer(detail)} className="text-[11px] font-medium text-rose-500 hover:text-rose-600 transition">
                  Delete consumer
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Add / Edit Consumer Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={form.id ? "Edit Consumer" : "Add Consumer"} size="lg">
        <form onSubmit={saveConsumer} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Consumer Number" value={form.consumerNumber} onChange={(v) => setForm({ ...form, consumerNumber: v })} placeholder="Internal ID (optional)" />
            <Field label="BPCL / Supplier ID" value={form.bpclId} onChange={(v) => setForm({ ...form, bpclId: v })} placeholder="e.g. 0123456789" />
          </div>
          <Field label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Full name" required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+91 XXXXXXXXXX" />
            <Field label="Area" value={form.area} onChange={(v) => setForm({ ...form, area: v })} placeholder="e.g. Desainagar Main" />
          </div>
          <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} placeholder="Full address" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Primary Cylinder</label>
              <select
                value={form.cylinderTypeId}
                onChange={(e) => setForm({ ...form, cylinderTypeId: e.target.value })}
                className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none bg-white"
              >
                <option value="">— None —</option>
                {cylTypes.map((ct) => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
              </select>
            </div>
            <Field label="Connection Date" type="date" value={form.connectionDate} onChange={(v) => setForm({ ...form, connectionDate: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Deposit Paid (₹)" type="number" value={form.depositPaid} onChange={(v) => setForm({ ...form, depositPaid: v })} placeholder="0" />
          </div>
          <Field label="Note" value={form.note} onChange={(v) => setForm({ ...form, note: v })} placeholder="Any remark" />
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setAddOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="submit" disabled={saving || !form.name.trim()} className="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50">
              {saving ? "Saving…" : form.id ? "Update" : "Add Consumer"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Record Refill Modal */}
      <Modal open={refillOpen} onClose={() => setRefillOpen(false)} title="Record Refill" size="md">
        <form onSubmit={saveRefill} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date *" type="date" value={refillForm.date} onChange={(v) => setRefillForm({ ...refillForm, date: v })} required />
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Cylinder Type *</label>
              <select
                value={refillForm.cylinderTypeId}
                onChange={(e) => {
                  const ct = activeCylTypes.find((x) => x.id === e.target.value);
                  setRefillForm({
                    ...refillForm,
                    cylinderTypeId: e.target.value,
                    amount: ct ? ct.sellingPrice.toString() : refillForm.amount,
                  });
                }}
                className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none bg-white"
                required
              >
                <option value="">Select…</option>
                {activeCylTypes.map((ct) => <option key={ct.id} value={ct.id}>{ct.name} — {formatCurrency(ct.sellingPrice)}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Payment Mode</label>
              <select
                value={refillForm.paymentMode}
                onChange={(e) => setRefillForm({ ...refillForm, paymentMode: e.target.value })}
                className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none bg-white"
              >
                <option value="cash">Cash (OTP)</option>
                <option value="online">Online</option>
                <option value="credit">Credit</option>
                <option value="other">Other</option>
              </select>
            </div>
            <Field label="Amount (₹)" type="number" value={refillForm.amount} onChange={(v) => setRefillForm({ ...refillForm, amount: v })} placeholder="0" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Delivered by</label>
            <select
              value={refillForm.employeeId}
              onChange={(e) => setRefillForm({ ...refillForm, employeeId: e.target.value })}
              className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none bg-white"
            >
              <option value="">— Not specified —</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <Field label="Note" value={refillForm.note} onChange={(v) => setRefillForm({ ...refillForm, note: v })} placeholder="Any remark" />

          <div className="bg-slate-50 rounded-lg p-3 space-y-2">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input type="checkbox" checked={refillForm.recordStock}
                onChange={(e) => setRefillForm({ ...refillForm, recordStock: e.target.checked })}
                className="rounded border-slate-300 text-slate-800 focus:ring-slate-400" />
              Also record stock transaction (−1 full)
            </label>
            {refillForm.recordStock && (
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer ml-6">
                <input type="checkbox" checked={refillForm.emptyReturned}
                  onChange={(e) => setRefillForm({ ...refillForm, emptyReturned: e.target.checked })}
                  className="rounded border-slate-300 text-slate-800 focus:ring-slate-400" />
                Consumer returned empty (+1 empty)
              </label>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setRefillOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="submit" disabled={refillSaving || !refillForm.cylinderTypeId || !refillForm.date} className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {refillSaving ? "Saving…" : "Record"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// --- Small components ---
function KpiCard({ label, value, sub, tone }: {
  label: string; value: string; sub?: string;
  tone: "emerald" | "blue" | "amber" | "rose" | "slate";
}) {
  const toneMap: Record<string, { bg: string; border: string; text: string }> = {
    emerald: { bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-700" },
    blue:    { bg: "bg-blue-50",    border: "border-blue-100",    text: "text-blue-700" },
    amber:   { bg: "bg-amber-50",   border: "border-amber-100",   text: "text-amber-700" },
    rose:    { bg: "bg-rose-50",    border: "border-rose-100",    text: "text-rose-700" },
    slate:   { bg: "bg-white",      border: "border-slate-200",   text: "text-slate-800" },
  };
  const c = toneMap[tone];
  return (
    <div className={cn(c.bg, "border", c.border, "rounded-lg p-3")}>
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className={cn("text-lg font-semibold mt-0.5 tabular-nums", c.text)}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", required = false }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-600 mb-1">{label}</label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        required={required} placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none"
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide flex-shrink-0">{label}</span>
      <span className="text-slate-700 text-right min-w-0">{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-md p-2 text-center">
      <div className="text-[9px] font-medium text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-[13px] font-semibold text-slate-800 tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
