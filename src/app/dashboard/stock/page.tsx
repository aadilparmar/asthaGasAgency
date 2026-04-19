"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Modal from "@/components/Modal";
import Toast from "@/components/Toast";
import { formatCurrency, cn } from "@/lib/utils";

interface CylinderType { id: string; name: string; sellingPrice: number; active: boolean; sortOrder: number; }
interface StockRow {
  cylinderType: CylinderType;
  full: number;
  empty: number;
  total: number;
  txnCount: number;
}
interface StockTransaction {
  id: string;
  date: string;
  cylinderTypeId: string;
  cylinderType: { id: string; name: string };
  type: "purchase" | "delivery" | "empty_return" | "empty_dispatch" | "adjustment";
  fullDelta: number;
  emptyDelta: number;
  consumerId: string | null;
  consumer: { id: string; name: string; consumerNumber: string | null } | null;
  note: string;
  createdAt: string;
}

const TXN_TYPES: {
  key: StockTransaction["type"];
  label: string;
  desc: string;
  defaultFull: (n: number) => number;
  defaultEmpty: (n: number) => number;
  tone: "emerald" | "blue" | "amber" | "rose" | "slate";
}[] = [
  { key: "purchase",       label: "Purchase from BPCL", desc: "Full cylinders received from supplier", defaultFull: (n) => +n, defaultEmpty: () => 0, tone: "emerald" },
  { key: "empty_dispatch", label: "Empty Dispatch",     desc: "Empty cylinders sent back to supplier", defaultFull: () => 0, defaultEmpty: (n) => -n, tone: "blue" },
  { key: "delivery",       label: "Delivery",           desc: "Full to customer, empty received back", defaultFull: (n) => -n, defaultEmpty: (n) => +n, tone: "amber" },
  { key: "empty_return",   label: "Empty Return",       desc: "Customer returned an empty later",       defaultFull: () => 0, defaultEmpty: (n) => +n, tone: "slate" },
  { key: "adjustment",     label: "Adjustment",         desc: "Manual correction (loss, damage, count)", defaultFull: () => 0, defaultEmpty: () => 0, tone: "rose" },
];

const TYPE_LABEL: Record<StockTransaction["type"], string> = {
  purchase: "Purchase",
  delivery: "Delivery",
  empty_return: "Empty Return",
  empty_dispatch: "Empty Dispatch",
  adjustment: "Adjustment",
};

export default function StockPage() {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const [snapshot, setSnapshot] = useState<StockRow[]>([]);
  const [totals, setTotals] = useState({ full: 0, empty: 0, total: 0 });
  const [txns, setTxns] = useState<StockTransaction[]>([]);
  const [cylTypes, setCylTypes] = useState<CylinderType[]>([]);

  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<"all" | StockTransaction["type"]>("all");
  const [filterCyl, setFilterCyl] = useState<string>("all");

  // Add txn modal
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    id: "",
    date: todayStr,
    cylinderTypeId: "",
    type: "purchase" as StockTransaction["type"],
    quantity: "",
    fullDelta: "",
    emptyDelta: "",
    note: "",
    customMode: false,
  });
  const [saving, setSaving] = useState(false);

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
      if (filterType !== "all") params.set("type", filterType);
      if (filterCyl !== "all") params.set("cylinderTypeId", filterCyl);
      params.set("limit", "200");

      const [snapRes, txnRes, ctRes] = await Promise.all([
        fetch("/api/cylinder-stock/snapshot"),
        fetch(`/api/cylinder-stock/transactions?${params}`),
        fetch("/api/cylinder-types"),
      ]);
      const { snapshot: s, totals: t } = await snapRes.json();
      setSnapshot(s);
      setTotals(t);
      setTxns(await txnRes.json());
      setCylTypes(await ctRes.json());
    } catch {
      showToast("error", "Failed to load stock");
    }
    setLoading(false);
  }, [filterType, filterCyl, showToast]);

  useEffect(() => { load(); }, [load]);

  const activeCylTypes = useMemo(() => cylTypes.filter((t) => t.active), [cylTypes]);

  function openAdd(defaultType: StockTransaction["type"] = "purchase") {
    const firstCt = activeCylTypes[0]?.id || "";
    setForm({
      id: "", date: todayStr, cylinderTypeId: firstCt, type: defaultType,
      quantity: "", fullDelta: "", emptyDelta: "", note: "", customMode: false,
    });
    setAddOpen(true);
  }

  // When type or quantity changes, auto-fill deltas (unless user switched to custom mode)
  useEffect(() => {
    if (form.customMode) return;
    const tdef = TXN_TYPES.find((t) => t.key === form.type);
    if (!tdef) return;
    const qty = Number(form.quantity) || 0;
    setForm((prev) => ({
      ...prev,
      fullDelta: tdef.defaultFull(qty).toString(),
      emptyDelta: tdef.defaultEmpty(qty).toString(),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.type, form.quantity, form.customMode]);

  async function saveTxn(e: React.FormEvent) {
    e.preventDefault();
    if (!form.cylinderTypeId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/cylinder-stock/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          cylinderTypeId: form.cylinderTypeId,
          type: form.type,
          fullDelta: Number(form.fullDelta) || 0,
          emptyDelta: Number(form.emptyDelta) || 0,
          note: form.note.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      setAddOpen(false);
      showToast("success", "Transaction recorded");
      await load();
    } catch {
      showToast("error", "Failed to save transaction");
    }
    setSaving(false);
  }

  async function deleteTxn(t: StockTransaction) {
    if (!confirm(`Delete this ${TYPE_LABEL[t.type].toLowerCase()} (${t.cylinderType.name})?`)) return;
    try {
      const res = await fetch(`/api/cylinder-stock/transactions?id=${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      showToast("success", "Transaction deleted");
      await load();
    } catch { showToast("error", "Failed to delete"); }
  }

  return (
    <div className="animate-fade-in">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Cylinder Stock</h1>
          <p className="text-[13px] text-slate-500">Physical inventory — full, empty &amp; transactions</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openAdd()}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Record Transaction
          </button>
        </div>
      </div>

      {/* Overall totals */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <SummaryCard label="Total Full" value={totals.full.toLocaleString("en-IN")} tone="emerald" />
        <SummaryCard label="Total Empty" value={totals.empty.toLocaleString("en-IN")} tone="blue" />
        <SummaryCard label="Grand Total" value={totals.total.toLocaleString("en-IN")} tone="slate" />
      </div>

      {/* Per-cylinder snapshot */}
      <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Current Stock</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {loading ? (
          <div className="col-span-full text-slate-400 text-sm text-center py-6">Loading…</div>
        ) : snapshot.length === 0 ? (
          <div className="col-span-full text-slate-400 text-sm text-center py-6">No cylinder types configured.</div>
        ) : (
          snapshot.map((s) => {
            const isLow = s.full < 10 && s.cylinderType.active;
            return (
              <div key={s.cylinderType.id} className={cn(
                "bg-white border rounded-lg p-4 transition",
                isLow ? "border-rose-200" : "border-slate-200",
                !s.cylinderType.active && "opacity-60"
              )}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      {s.cylinderType.name}
                      {!s.cylinderType.active && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">inactive</span>}
                      {isLow && <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-medium">LOW</span>}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{s.txnCount} transactions</div>
                  </div>
                  <button
                    onClick={() => {
                      setForm({
                        id: "", date: todayStr, cylinderTypeId: s.cylinderType.id,
                        type: "purchase", quantity: "", fullDelta: "", emptyDelta: "", note: "", customMode: false,
                      });
                      setAddOpen(true);
                    }}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800 transition"
                  >
                    + Txn
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <MiniStat label="Full" value={s.full.toLocaleString("en-IN")} tone={isLow ? "rose" : "emerald"} />
                  <MiniStat label="Empty" value={s.empty.toLocaleString("en-IN")} tone="blue" />
                  <MiniStat label="Total" value={s.total.toLocaleString("en-IN")} tone="slate" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Transaction Ledger */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Transaction Ledger</h2>
        <div className="flex items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            className="text-xs rounded-lg border border-slate-200 py-1 px-2 bg-white focus:border-slate-400 outline-none"
          >
            <option value="all">All types</option>
            {TXN_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <select
            value={filterCyl}
            onChange={(e) => setFilterCyl(e.target.value)}
            className="text-xs rounded-lg border border-slate-200 py-1 px-2 bg-white focus:border-slate-400 outline-none"
          >
            <option value="all">All cylinders</option>
            {cylTypes.map((ct) => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide">Cylinder</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-medium text-emerald-700 uppercase tracking-wide w-24">Full Δ</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-medium text-blue-700 uppercase tracking-wide w-24">Empty Δ</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide">Note</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {txns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-sm text-slate-400 py-10">
                    No transactions yet. Click &quot;Record Transaction&quot; to start tracking your cylinder inventory.
                  </td>
                </tr>
              ) : (
                txns.map((t) => {
                  const tone = TXN_TYPES.find((x) => x.key === t.type)?.tone || "slate";
                  const toneMap: Record<string, string> = {
                    emerald: "bg-emerald-50 text-emerald-700",
                    blue:    "bg-blue-50 text-blue-700",
                    amber:   "bg-amber-50 text-amber-700",
                    rose:    "bg-rose-50 text-rose-700",
                    slate:   "bg-slate-100 text-slate-700",
                  };
                  return (
                    <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
                      <td className="px-4 py-2 text-[13px] text-slate-700 tabular-nums whitespace-nowrap">
                        {new Date(t.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                      </td>
                      <td className="px-4 py-2">
                        <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap", toneMap[tone])}>
                          {TYPE_LABEL[t.type]}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-[13px] text-slate-700">{t.cylinderType.name}</td>
                      <td className={cn("px-4 py-2 text-right text-sm font-semibold tabular-nums",
                        t.fullDelta > 0 ? "text-emerald-700" : t.fullDelta < 0 ? "text-rose-700" : "text-slate-400")}>
                        {t.fullDelta > 0 ? `+${t.fullDelta}` : t.fullDelta || "—"}
                      </td>
                      <td className={cn("px-4 py-2 text-right text-sm font-semibold tabular-nums",
                        t.emptyDelta > 0 ? "text-blue-700" : t.emptyDelta < 0 ? "text-rose-700" : "text-slate-400")}>
                        {t.emptyDelta > 0 ? `+${t.emptyDelta}` : t.emptyDelta || "—"}
                      </td>
                      <td className="px-4 py-2 text-[12px] text-slate-500">
                        <div className="flex items-center gap-1">
                          {t.consumer && <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{t.consumer.name}</span>}
                          {t.note}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button onClick={() => deleteTxn(t)} className="text-xs text-rose-500 hover:text-rose-700 transition">
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Transaction Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Record Stock Transaction" size="lg">
        <form onSubmit={saveTxn} className="space-y-4">
          {/* Transaction Type cards */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-2">Transaction Type</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {TXN_TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setForm({ ...form, type: t.key })}
                  className={cn(
                    "text-left px-3 py-2.5 rounded-lg border transition",
                    form.type === t.key
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                  )}
                >
                  <div className="text-[12px] font-semibold">{t.label}</div>
                  <div className={cn("text-[10px] mt-0.5", form.type === t.key ? "text-slate-300" : "text-slate-500")}>
                    {t.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date *" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} required />
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Cylinder Type *</label>
              <select
                value={form.cylinderTypeId}
                onChange={(e) => setForm({ ...form, cylinderTypeId: e.target.value })}
                required
                className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none bg-white"
              >
                <option value="">Select…</option>
                {activeCylTypes.map((ct) => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
              </select>
            </div>
          </div>

          {/* Quantity or custom */}
          {!form.customMode ? (
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Quantity (cylinders)
              </label>
              <input
                type="number" min={1}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none"
                placeholder="e.g. 50"
              />
              <button
                type="button"
                onClick={() => setForm({ ...form, customMode: true })}
                className="mt-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-700"
              >
                Need custom +/− split? Switch to manual mode
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Full Δ (+/−)"
                type="number"
                value={form.fullDelta}
                onChange={(v) => setForm({ ...form, fullDelta: v })}
                placeholder="e.g. +50 or -3"
              />
              <Field
                label="Empty Δ (+/−)"
                type="number"
                value={form.emptyDelta}
                onChange={(v) => setForm({ ...form, emptyDelta: v })}
                placeholder="e.g. -10"
              />
              <button
                type="button"
                onClick={() => setForm({ ...form, customMode: false, fullDelta: "", emptyDelta: "" })}
                className="col-span-2 text-[11px] font-medium text-slate-500 hover:text-slate-700 text-left"
              >
                ← Back to quantity mode
              </button>
            </div>
          )}

          {/* Preview deltas */}
          {(Number(form.fullDelta) !== 0 || Number(form.emptyDelta) !== 0) && (
            <div className="bg-slate-50 rounded-lg p-3 flex items-center justify-around text-xs">
              <div className="text-center">
                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Full Δ</div>
                <div className={cn("text-base font-semibold tabular-nums mt-0.5",
                  Number(form.fullDelta) > 0 ? "text-emerald-700" : Number(form.fullDelta) < 0 ? "text-rose-700" : "text-slate-500")}>
                  {Number(form.fullDelta) > 0 ? `+${form.fullDelta}` : form.fullDelta || "0"}
                </div>
              </div>
              <div className="text-slate-300">+</div>
              <div className="text-center">
                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Empty Δ</div>
                <div className={cn("text-base font-semibold tabular-nums mt-0.5",
                  Number(form.emptyDelta) > 0 ? "text-blue-700" : Number(form.emptyDelta) < 0 ? "text-rose-700" : "text-slate-500")}>
                  {Number(form.emptyDelta) > 0 ? `+${form.emptyDelta}` : form.emptyDelta || "0"}
                </div>
              </div>
            </div>
          )}

          <Field label="Note" value={form.note} onChange={(v) => setForm({ ...form, note: v })} placeholder="e.g. BPCL invoice #1234" />

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setAddOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="submit" disabled={saving || !form.cylinderTypeId} className="px-5 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50">
              {saving ? "Saving…" : "Record"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// --- Small components ---
function SummaryCard({ label, value, tone }: { label: string; value: string; tone: "emerald" | "blue" | "slate" }) {
  const tm: Record<string, { bg: string; border: string; text: string }> = {
    emerald: { bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-700" },
    blue:    { bg: "bg-blue-50",    border: "border-blue-100",    text: "text-blue-700" },
    slate:   { bg: "bg-slate-800",  border: "border-slate-800",   text: "text-white" },
  };
  const c = tm[tone];
  return (
    <div className={cn(c.bg, "border", c.border, "rounded-lg p-4")}>
      <p className={cn("text-[11px] font-medium", tone === "slate" ? "text-slate-300" : "text-slate-500")}>{label}</p>
      <p className={cn("text-2xl font-semibold mt-1 tabular-nums", c.text)}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "emerald" | "blue" | "slate" | "rose" }) {
  const tm: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    blue:    "bg-blue-50 text-blue-700 border-blue-100",
    slate:   "bg-slate-50 text-slate-700 border-slate-200",
    rose:    "bg-rose-50 text-rose-700 border-rose-100",
  };
  return (
    <div className={cn("rounded-md border p-2 text-center", tm[tone])}>
      <div className="text-[9px] font-medium uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-base font-bold tabular-nums mt-0.5">{value}</div>
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
