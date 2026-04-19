"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import CalendarPicker from "@/components/CalendarPicker";
import Toast from "@/components/Toast";
import { formatCurrency, cn } from "@/lib/utils";

// ====== Types ======
interface Employee { id: string; name: string; type: string; active: boolean; }
interface CylinderType {
  id: string; name: string;
  price: number; sellingPrice: number; otpRate: number; onlineRate: number;
  active: boolean; sortOrder: number;
}
interface ConnectionType { id: string; name: string; sortOrder: number; active: boolean; }
interface ExpenseHead { id: string; name: string; sortOrder: number; active: boolean; }
interface CommercialCustomer { id: string; name: string; productType: string; active: boolean; }

type TabKey = "sales" | "connections" | "expenses" | "cash" | "commercial";

// denomination list (500 descending to 1-rupee coin)
const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 1];

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "sales",      label: "Sales & Delivery",    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { key: "connections",label: "New Connections",     icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { key: "expenses",   label: "Daily Expenses",      icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
  { key: "cash",       label: "Cash Reconciliation", icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" },
  { key: "commercial", label: "Commercial Stock",    icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
];

// ====== Component ======
export default function DailyOpsPage() {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const [date, setDate] = useState(todayStr);
  const [tab, setTab] = useState<TabKey>("sales");

  // Master data
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [cylTypes, setCylTypes] = useState<CylinderType[]>([]);
  const [connTypes, setConnTypes] = useState<ConnectionType[]>([]);
  const [expHeads, setExpHeads] = useState<ExpenseHead[]>([]);
  const [customers, setCustomers] = useState<CommercialCustomer[]>([]);

  // Form state — single object that holds everything for the day
  const [note, setNote] = useState("");
  // sales[`${empId}_${ctId}`] = { otp, online, nsDom }
  const [sales, setSales] = useState<Record<string, { otp: number; online: number; nsDom: number }>>({});
  // connections[connTypeId] = { nos, cylDpr, deposit, refill, sd, inspection, blueBook }
  const [connections, setConnections] = useState<Record<string, {
    nos: number; cylDpr: number; deposit: number; refill: number; sd: number; inspection: number; blueBook: number;
  }>>({});
  // expenses[expHeadId] = { particulars, amount }
  const [expenses, setExpenses] = useState<Record<string, { particulars: string; amount: number }>>({});
  // denominations[value] = count
  const [denoms, setDenoms] = useState<Record<number, number>>({});
  // commercials[customerId] = { productType, stockOut, stockIn, amount, received }
  const [commercials, setCommercials] = useState<Record<string, {
    productType: string; stockOut: number; stockIn: number; amount: number; received: number;
  }>>({});
  const [otherIncomes, setOtherIncomes] = useState<{ tempId: string; label: string; amount: number }[]>([]);
  const [otherExpenses, setOtherExpenses] = useState<{ tempId: string; label: string; amount: number }[]>([]);

  // Snapshot for dirty-detection
  const [snapshot, setSnapshot] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast({ type, message });
    toastTimeout.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // Composite serialization for dirty detection
  const currentSnapshot = useMemo(() =>
    JSON.stringify({ note, sales, connections, expenses, denoms, commercials, otherIncomes, otherExpenses }),
  [note, sales, connections, expenses, denoms, commercials, otherIncomes, otherExpenses]);

  const isDirty = currentSnapshot !== snapshot;

  // Parse date parts from date string
  const parts = date.split("-");
  const [yearNum, monthNum] = [Number(parts[0]), Number(parts[1])];

  // ====== Load ======
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, ctRes, connRes, ehRes, custRes, opRes] = await Promise.all([
        fetch("/api/employees?type=delivery&active=true"),
        fetch("/api/cylinder-types"),
        fetch("/api/connection-types"),
        fetch("/api/expense-heads"),
        fetch("/api/commercial-customers"),
        fetch(`/api/daily-ops?date=${date}`),
      ]);

      const emp = await empRes.json();
      const cts = await ctRes.json();
      const conns = await connRes.json();
      const ehs = await ehRes.json();
      const custs = await custRes.json();
      const { op } = await opRes.json();

      setEmployees(emp);
      setCylTypes(cts);
      setConnTypes(conns);
      setExpHeads(ehs);
      setCustomers(custs);

      const newSales: typeof sales = {};
      const newConns: typeof connections = {};
      const newExps: typeof expenses = {};
      const newDenoms: typeof denoms = {};
      const newCommercials: typeof commercials = {};
      const newOI: typeof otherIncomes = [];
      const newOE: typeof otherExpenses = [];
      let newNote = "";

      if (op) {
        newNote = op.note || "";
        for (const s of op.sales || []) {
          newSales[`${s.employeeId}_${s.cylinderTypeId}`] = {
            otp: s.otpCount, online: s.onlineCount, nsDom: s.nsDomCount,
          };
        }
        for (const c of op.connections || []) {
          newConns[c.connectionTypeId] = {
            nos: c.nos, cylDpr: c.cylDpr, deposit: c.deposit, refill: c.refill,
            sd: c.sd, inspection: c.inspection, blueBook: c.blueBook,
          };
        }
        for (const e of op.expenses || []) {
          newExps[e.expenseHeadId] = { particulars: e.particulars || "", amount: e.amount };
        }
        for (const d of op.denominations || []) {
          newDenoms[d.value] = d.count;
        }
        for (const c of op.commercials || []) {
          newCommercials[c.customerId] = {
            productType: c.productType || "",
            stockOut: c.stockOut, stockIn: c.stockIn,
            amount: c.amount, received: c.received,
          };
        }
        for (const o of op.otherIncomes || []) {
          newOI.push({ tempId: o.id, label: o.label, amount: o.amount });
        }
        for (const o of op.otherExpenses || []) {
          newOE.push({ tempId: o.id, label: o.label, amount: o.amount });
        }
      }

      setNote(newNote);
      setSales(newSales);
      setConnections(newConns);
      setExpenses(newExps);
      setDenoms(newDenoms);
      setCommercials(newCommercials);
      setOtherIncomes(newOI);
      setOtherExpenses(newOE);

      // Set baseline
      setSnapshot(JSON.stringify({
        note: newNote, sales: newSales, connections: newConns, expenses: newExps,
        denoms: newDenoms, commercials: newCommercials, otherIncomes: newOI, otherExpenses: newOE,
      }));
    } catch (e) {
      console.error(e);
      showToast("error", "Failed to load day data");
    }
    setLoading(false);
  }, [date, showToast]);

  useEffect(() => { load(); }, [load]);

  // ====== Save ======
  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        date,
        note,
        sales: Object.entries(sales).map(([k, v]) => {
          const [employeeId, cylinderTypeId] = k.split("_");
          return { employeeId, cylinderTypeId, otpCount: v.otp, onlineCount: v.online, nsDomCount: v.nsDom };
        }),
        connections: Object.entries(connections).map(([connectionTypeId, v]) => ({
          connectionTypeId, ...v,
        })),
        expenses: Object.entries(expenses).map(([expenseHeadId, v]) => ({
          expenseHeadId, particulars: v.particulars, amount: v.amount,
        })),
        denominations: Object.entries(denoms).map(([value, count]) => ({
          value: Number(value), count,
        })),
        commercials: Object.entries(commercials).map(([customerId, v]) => ({
          customerId, ...v,
        })),
        otherIncomes: otherIncomes.map((o) => ({ label: o.label, amount: o.amount })),
        otherExpenses: otherExpenses.map((o) => ({ label: o.label, amount: o.amount })),
      };

      const res = await fetch("/api/daily-ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();

      setSnapshot(currentSnapshot);
      showToast("success", "Saved successfully");
    } catch {
      showToast("error", "Failed to save. Please try again.");
    }
    setSaving(false);
  }

  // ====== Helpers to get/set nested form values ======
  function getSale(empId: string, ctId: string) {
    return sales[`${empId}_${ctId}`] || { otp: 0, online: 0, nsDom: 0 };
  }
  function setSale(empId: string, ctId: string, field: "otp" | "online" | "nsDom", value: number) {
    const key = `${empId}_${ctId}`;
    setSales((prev) => ({
      ...prev,
      [key]: { ...getSale(empId, ctId), [field]: Math.max(0, value) },
    }));
  }
  function getConn(ctId: string) {
    return connections[ctId] || { nos: 0, cylDpr: 0, deposit: 0, refill: 0, sd: 0, inspection: 0, blueBook: 0 };
  }
  function setConn(ctId: string, field: keyof ReturnType<typeof getConn>, value: number) {
    setConnections((prev) => ({
      ...prev,
      [ctId]: { ...getConn(ctId), [field]: Math.max(0, value) },
    }));
  }
  function getExp(ehId: string) {
    return expenses[ehId] || { particulars: "", amount: 0 };
  }
  function setExpAmount(ehId: string, amount: number) {
    setExpenses((prev) => ({
      ...prev,
      [ehId]: { ...getExp(ehId), amount: Math.max(0, amount) },
    }));
  }
  function setExpParticulars(ehId: string, particulars: string) {
    setExpenses((prev) => ({
      ...prev,
      [ehId]: { ...getExp(ehId), particulars },
    }));
  }
  function getComm(custId: string) {
    return commercials[custId] || { productType: "", stockOut: 0, stockIn: 0, amount: 0, received: 0 };
  }
  function setComm(custId: string, field: keyof ReturnType<typeof getComm>, value: number | string) {
    setCommercials((prev) => ({
      ...prev,
      [custId]: { ...getComm(custId), [field]: typeof value === "number" ? Math.max(0, value) : value },
    }));
  }

  // ====== Totals (memoized) ======
  const activeCylTypes = useMemo(() => cylTypes.filter(t => t.active), [cylTypes]);
  const activeConnTypes = useMemo(() => connTypes.filter(c => c.active), [connTypes]);
  const activeExpHeads = useMemo(() => expHeads.filter(h => h.active), [expHeads]);
  const activeCustomers = useMemo(() => customers.filter(c => c.active), [customers]);

  const revenueByCyl = useMemo(() => {
    const m: Record<string, { nsDom: number; otp: number; online: number; revenue: number; otpBonus: number; onlineBonus: number }> = {};
    for (const ct of activeCylTypes) {
      m[ct.id] = { nsDom: 0, otp: 0, online: 0, revenue: 0, otpBonus: 0, onlineBonus: 0 };
    }
    for (const [k, v] of Object.entries(sales)) {
      const ctId = k.split("_")[1];
      const ct = activeCylTypes.find(t => t.id === ctId);
      if (!ct) continue;
      m[ctId].nsDom   += v.nsDom;
      m[ctId].otp     += v.otp;
      m[ctId].online  += v.online;
      m[ctId].revenue += v.nsDom * ct.sellingPrice;
      m[ctId].otpBonus    += v.otp * ct.otpRate;
      m[ctId].onlineBonus += v.online * ct.onlineRate;
    }
    return m;
  }, [sales, activeCylTypes]);

  const totalCylRevenue = useMemo(() =>
    Object.values(revenueByCyl).reduce((s, r) => s + r.revenue, 0),
  [revenueByCyl]);

  const connectionTotals = useMemo(() => {
    const t = { nos: 0, cylDpr: 0, deposit: 0, refill: 0, sd: 0, inspection: 0, blueBook: 0, total: 0 };
    for (const c of Object.values(connections)) {
      t.nos += c.nos;
      t.cylDpr += c.cylDpr;
      t.deposit += c.deposit;
      t.refill += c.refill;
      t.sd += c.sd;
      t.inspection += c.inspection;
      t.blueBook += c.blueBook;
      t.total += c.cylDpr + c.deposit + c.refill + c.sd + c.inspection + c.blueBook;
    }
    return t;
  }, [connections]);

  const totalExpenses = useMemo(() => {
    let t = 0;
    for (const e of Object.values(expenses)) t += e.amount;
    for (const o of otherExpenses) t += o.amount;
    return t;
  }, [expenses, otherExpenses]);

  const otherIncomeTotal = useMemo(() =>
    otherIncomes.reduce((s, o) => s + o.amount, 0),
  [otherIncomes]);

  const totalIncome = totalCylRevenue + connectionTotals.total + otherIncomeTotal;
  const netIncome = totalIncome - totalExpenses;
  const cashCounted = useMemo(() =>
    DENOMINATIONS.reduce((s, v) => s + v * (denoms[v] || 0), 0),
  [denoms]);
  const cashDiff = cashCounted - netIncome;

  const commTotals = useMemo(() => {
    const t = { stockOut: 0, stockIn: 0, amount: 0, received: 0 };
    for (const c of Object.values(commercials)) {
      t.stockOut += c.stockOut;
      t.stockIn += c.stockIn;
      t.amount += c.amount;
      t.received += c.received;
    }
    return t;
  }, [commercials]);

  // ====== Render ======
  return (
    <div className="animate-fade-in pb-24">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Daily Operations</h1>
          <p className="text-[13px] text-slate-500">Complete daily business workbook — sales, connections, expenses &amp; cash</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarPicker
            month={monthNum}
            year={yearNum}
            selectedDay={Number(parts[2])}
            onMonthChange={(m, y) => {
              const day = Math.min(Number(parts[2]), new Date(y, m, 0).getDate());
              setDate(`${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
            }}
            onDaySelect={(d) => {
              setDate(`${yearNum}-${String(monthNum).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
            }}
            showDayPicker
          />
          <button
            onClick={() => setDate(todayStr)}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition"
          >
            Today
          </button>
        </div>
      </div>

      {/* Day KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Cylinder Revenue" value={formatCurrency(totalCylRevenue)} tone="emerald" />
        <KpiCard label="Connections" value={formatCurrency(connectionTotals.total)} sub={`${connectionTotals.nos} new`} tone="blue" />
        <KpiCard label="Expenses" value={formatCurrency(totalExpenses)} tone="amber" />
        <KpiCard label="Net Income" value={formatCurrency(netIncome)} sub={cashCounted > 0 ? `Cash diff ${formatCurrency(cashDiff)}` : undefined} tone={netIncome >= 0 ? "slate" : "rose"} />
      </div>

      {/* Tabs */}
      <div className="bg-slate-100 rounded-lg p-0.5 mb-4 overflow-x-auto">
        <div className="flex gap-0.5 min-w-max">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md transition whitespace-nowrap",
                tab === t.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d={t.icon} />
              </svg>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading daily operations…</div>
      ) : (
        <>
          {tab === "sales" && (
            <SalesTab
              employees={employees}
              cylTypes={activeCylTypes}
              sales={sales}
              getSale={getSale}
              setSale={setSale}
              revenueByCyl={revenueByCyl}
            />
          )}
          {tab === "connections" && (
            <ConnectionsTab
              connTypes={activeConnTypes}
              connections={connections}
              getConn={getConn}
              setConn={setConn}
              totals={connectionTotals}
            />
          )}
          {tab === "expenses" && (
            <ExpensesTab
              expHeads={activeExpHeads}
              expenses={expenses}
              setExpAmount={setExpAmount}
              setExpParticulars={setExpParticulars}
              otherExpenses={otherExpenses}
              setOtherExpenses={setOtherExpenses}
              total={totalExpenses}
            />
          )}
          {tab === "cash" && (
            <CashTab
              cylTypes={activeCylTypes}
              connTypes={activeConnTypes}
              expHeads={activeExpHeads}
              revenueByCyl={revenueByCyl}
              connections={connections}
              connectionTotals={connectionTotals}
              expenses={expenses}
              otherExpenses={otherExpenses}
              otherIncomes={otherIncomes}
              setOtherIncomes={setOtherIncomes}
              setOtherExpenses={setOtherExpenses}
              denoms={denoms}
              setDenoms={setDenoms}
              totalCylRevenue={totalCylRevenue}
              totalExpenses={totalExpenses}
              totalIncome={totalIncome}
              netIncome={netIncome}
              cashCounted={cashCounted}
              cashDiff={cashDiff}
            />
          )}
          {tab === "commercial" && (
            <CommercialTab
              customers={activeCustomers}
              commercials={commercials}
              getComm={getComm}
              setComm={setComm}
              totals={commTotals}
              onRefresh={load}
              showToast={showToast}
            />
          )}

          {/* Notes */}
          <div className="mt-6 bg-white border border-slate-200 rounded-lg p-4">
            <label className="block text-xs font-medium text-slate-600 mb-2">Day Notes</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Any remarks or highlights for the day…"
              className="w-full rounded-lg border border-slate-200 text-sm py-2 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none resize-none"
            />
          </div>
        </>
      )}

      {/* Sticky Save Bar */}
      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 md:left-60 z-30 bg-white border-t border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between max-w-6xl mx-auto">
            <div className="text-sm text-slate-600">
              <span className="inline-flex items-center justify-center w-5 h-5 bg-blue-500 text-white text-[10px] font-bold rounded-full mr-2">
                !
              </span>
              Unsaved changes
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => load()}
                className="px-4 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Day"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ====== KPI Card ======
function KpiCard({ label, value, sub, tone }: {
  label: string; value: string; sub?: string;
  tone: "emerald" | "blue" | "amber" | "rose" | "slate";
}) {
  const toneMap: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
    emerald: { bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-700", iconBg: "bg-emerald-100" },
    blue:    { bg: "bg-blue-50",    border: "border-blue-100",    text: "text-blue-700",    iconBg: "bg-blue-100" },
    amber:   { bg: "bg-amber-50",   border: "border-amber-100",   text: "text-amber-700",   iconBg: "bg-amber-100" },
    rose:    { bg: "bg-rose-50",    border: "border-rose-100",    text: "text-rose-700",    iconBg: "bg-rose-100" },
    slate:   { bg: "bg-slate-50",   border: "border-slate-200",   text: "text-slate-800",   iconBg: "bg-slate-100" },
  };
  const c = toneMap[tone];
  return (
    <div className={cn(c.bg, "border", c.border, "rounded-lg p-4")}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={cn("text-lg font-semibold mt-1 tabular-nums", c.text)}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

// ====== SALES TAB ======
function SalesTab({
  employees, cylTypes, getSale, setSale, revenueByCyl,
}: {
  employees: Employee[]; cylTypes: CylinderType[];
  sales: Record<string, { otp: number; online: number; nsDom: number }>;
  getSale: (empId: string, ctId: string) => { otp: number; online: number; nsDom: number };
  setSale: (empId: string, ctId: string, field: "otp" | "online" | "nsDom", value: number) => void;
  revenueByCyl: Record<string, { nsDom: number; otp: number; online: number; revenue: number; otpBonus: number; onlineBonus: number }>;
}) {
  if (employees.length === 0) return <EmptyState msg="No delivery employees. Add some in Employees." />;
  if (cylTypes.length === 0) return <EmptyState msg="No cylinder types configured. Add some in Settings." />;

  return (
    <div className="space-y-3">
      {/* Compact legend */}
      <div className="text-[11px] text-slate-500 flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400"></span>OTP</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400"></span>ONLINE</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400"></span>NS DOM (selling count)</span>
        <span className="text-slate-400 ml-auto">Revenue = NS DOM × selling price</span>
      </div>

      {/* One card per cylinder type */}
      {cylTypes.map((ct) => {
        const agg = revenueByCyl[ct.id] || { nsDom: 0, otp: 0, online: 0, revenue: 0, otpBonus: 0, onlineBonus: 0 };
        return (
          <div key={ct.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            {/* Header with rates */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-800">{ct.name}</span>
                <span className="text-[11px] text-slate-500 flex items-center gap-2">
                  <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">OTP {formatCurrency(ct.otpRate)}</span>
                  <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Online {formatCurrency(ct.onlineRate)}</span>
                  <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">Sell {formatCurrency(ct.sellingPrice)}</span>
                </span>
              </div>
              <div className="text-right text-xs">
                <div className="text-slate-500">
                  OTP: <span className="font-semibold text-slate-800 tabular-nums">{agg.otp}</span>
                  <span className="mx-1 text-slate-300">|</span>
                  Online: <span className="font-semibold text-slate-800 tabular-nums">{agg.online}</span>
                  <span className="mx-1 text-slate-300">|</span>
                  NS DOM: <span className="font-semibold text-slate-800 tabular-nums">{agg.nsDom}</span>
                </div>
                <div className="text-sm font-semibold text-slate-800 tabular-nums mt-0.5">
                  {formatCurrency(agg.revenue)}
                </div>
              </div>
            </div>

            {/* Employee rows */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-4 py-2 text-[11px] font-medium text-slate-500 uppercase tracking-wide min-w-[140px]">
                      Employee
                    </th>
                    <th className="text-right px-3 py-2 text-[11px] font-medium text-emerald-700 uppercase tracking-wide w-24">OTP</th>
                    <th className="text-right px-3 py-2 text-[11px] font-medium text-blue-700 uppercase tracking-wide w-24">Online</th>
                    <th className="text-right px-3 py-2 text-[11px] font-medium text-slate-600 uppercase tracking-wide w-24">NS DOM</th>
                    <th className="text-right px-4 py-2 text-[11px] font-medium text-slate-500 uppercase tracking-wide w-28">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => {
                    const v = getSale(emp.id, ct.id);
                    const rev = v.nsDom * ct.sellingPrice;
                    const hasAny = v.otp > 0 || v.online > 0 || v.nsDom > 0;
                    return (
                      <tr key={emp.id} className={cn("border-b border-slate-100 last:border-0 transition", hasAny ? "bg-white" : "bg-slate-50/40")}>
                        <td className="px-4 py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[11px] font-semibold">
                              {emp.name[0]}
                            </div>
                            <span className="text-slate-700 text-[13px]">{emp.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-1.5">
                          <NumInput
                            value={v.otp}
                            onChange={(n) => setSale(emp.id, ct.id, "otp", n)}
                            tone="emerald"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <NumInput
                            value={v.online}
                            onChange={(n) => setSale(emp.id, ct.id, "online", n)}
                            tone="blue"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <NumInput
                            value={v.nsDom}
                            onChange={(n) => setSale(emp.id, ct.id, "nsDom", n)}
                            tone="slate"
                          />
                        </td>
                        <td className="px-4 py-1.5 text-right text-sm font-semibold text-slate-800 tabular-nums">
                          {rev > 0 ? formatCurrency(rev) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ====== CONNECTIONS TAB ======
function ConnectionsTab({
  connTypes, getConn, setConn, totals,
}: {
  connTypes: ConnectionType[];
  connections: Record<string, { nos: number; cylDpr: number; deposit: number; refill: number; sd: number; inspection: number; blueBook: number }>;
  getConn: (ctId: string) => { nos: number; cylDpr: number; deposit: number; refill: number; sd: number; inspection: number; blueBook: number };
  setConn: (ctId: string, field: "nos" | "cylDpr" | "deposit" | "refill" | "sd" | "inspection" | "blueBook", value: number) => void;
  totals: { nos: number; cylDpr: number; deposit: number; refill: number; sd: number; inspection: number; blueBook: number; total: number };
}) {
  if (connTypes.length === 0) return <EmptyState msg="No connection types. Add some in Settings." />;

  const cols: { key: keyof ReturnType<typeof getConn>; label: string; isCurrency: boolean }[] = [
    { key: "nos",        label: "Nos",         isCurrency: false },
    { key: "cylDpr",     label: "Cyl + DPR",   isCurrency: true },
    { key: "deposit",    label: "Deposit",     isCurrency: true },
    { key: "refill",     label: "Refill",      isCurrency: true },
    { key: "sd",         label: "S.D.",        isCurrency: true },
    { key: "inspection", label: "Inspection",  isCurrency: true },
    { key: "blueBook",   label: "Blue Book",   isCurrency: true },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="sticky left-0 z-10 bg-slate-50 text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide min-w-[180px]">
                Connection Type
              </th>
              {cols.map((c) => (
                <th key={c.key} className="text-right px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide min-w-[110px]">
                  {c.label}
                </th>
              ))}
              <th className="text-right px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide min-w-[120px] bg-slate-100">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {connTypes.map((ct, i) => {
              const v = getConn(ct.id);
              const rowTotal = v.cylDpr + v.deposit + v.refill + v.sd + v.inspection + v.blueBook;
              const hasAny = v.nos > 0 || rowTotal > 0;
              return (
                <tr key={ct.id} className={cn("border-b border-slate-100 last:border-0", hasAny ? "bg-white" : "bg-slate-50/30")}>
                  <td className="sticky left-0 z-10 bg-inherit px-4 py-1.5">
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 h-5 text-[10px] font-semibold rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className="text-slate-800 text-[13px] font-medium">{ct.name}</span>
                    </div>
                  </td>
                  {cols.map((c) => (
                    <td key={c.key} className="px-3 py-1.5">
                      <NumInput
                        value={v[c.key]}
                        onChange={(n) => setConn(ct.id, c.key, n)}
                        tone={c.isCurrency ? "slate" : "emerald"}
                        allowDecimal={c.isCurrency}
                        prefix={c.isCurrency ? "₹" : undefined}
                      />
                    </td>
                  ))}
                  <td className="px-4 py-1.5 text-right font-semibold text-slate-800 tabular-nums bg-slate-50/50">
                    {rowTotal > 0 ? formatCurrency(rowTotal) : "—"}
                  </td>
                </tr>
              );
            })}

            {/* Totals row */}
            <tr className="bg-slate-100 border-t-2 border-slate-300">
              <td className="sticky left-0 z-10 bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Total
              </td>
              <td className="px-3 py-2.5 text-right text-sm font-semibold text-slate-800 tabular-nums">{totals.nos || "—"}</td>
              <td className="px-3 py-2.5 text-right text-sm font-semibold text-slate-800 tabular-nums">{totals.cylDpr > 0 ? formatCurrency(totals.cylDpr) : "—"}</td>
              <td className="px-3 py-2.5 text-right text-sm font-semibold text-slate-800 tabular-nums">{totals.deposit > 0 ? formatCurrency(totals.deposit) : "—"}</td>
              <td className="px-3 py-2.5 text-right text-sm font-semibold text-slate-800 tabular-nums">{totals.refill > 0 ? formatCurrency(totals.refill) : "—"}</td>
              <td className="px-3 py-2.5 text-right text-sm font-semibold text-slate-800 tabular-nums">{totals.sd > 0 ? formatCurrency(totals.sd) : "—"}</td>
              <td className="px-3 py-2.5 text-right text-sm font-semibold text-slate-800 tabular-nums">{totals.inspection > 0 ? formatCurrency(totals.inspection) : "—"}</td>
              <td className="px-3 py-2.5 text-right text-sm font-semibold text-slate-800 tabular-nums">{totals.blueBook > 0 ? formatCurrency(totals.blueBook) : "—"}</td>
              <td className="px-4 py-2.5 text-right text-sm font-bold text-slate-900 tabular-nums bg-slate-200">
                {totals.total > 0 ? formatCurrency(totals.total) : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ====== EXPENSES TAB ======
function ExpensesTab({
  expHeads, expenses, setExpAmount, setExpParticulars,
  otherExpenses, setOtherExpenses, total,
}: {
  expHeads: ExpenseHead[];
  expenses: Record<string, { particulars: string; amount: number }>;
  setExpAmount: (ehId: string, amount: number) => void;
  setExpParticulars: (ehId: string, particulars: string) => void;
  otherExpenses: { tempId: string; label: string; amount: number }[];
  setOtherExpenses: React.Dispatch<React.SetStateAction<{ tempId: string; label: string; amount: number }[]>>;
  total: number;
}) {
  if (expHeads.length === 0) return <EmptyState msg="No expense heads. Add some in Settings." />;

  function addOther() {
    setOtherExpenses((prev) => [...prev, { tempId: `new-${Date.now()}`, label: "", amount: 0 }]);
  }
  function updateOther(i: number, patch: Partial<{ label: string; amount: number }>) {
    setOtherExpenses((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }
  function removeOther(i: number) {
    setOtherExpenses((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide w-16">#</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide min-w-[200px]">Expense Head</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide">Particulars</th>
              <th className="text-right px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide w-40">Amount</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {expHeads.map((eh, i) => {
              const v = expenses[eh.id] || { particulars: "", amount: 0 };
              const has = v.amount > 0 || v.particulars;
              return (
                <tr key={eh.id} className={cn("border-b border-slate-100 last:border-0", has ? "bg-white" : "bg-slate-50/30")}>
                  <td className="px-4 py-2 text-[12px] text-slate-400 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-2 text-[13px] font-medium text-slate-800">{eh.name}</td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={v.particulars}
                      onChange={(e) => setExpParticulars(eh.id, e.target.value)}
                      placeholder="Details…"
                      className="w-full rounded-md border border-slate-200 text-sm py-1.5 px-2 bg-slate-50 focus:bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none transition"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <NumInput value={v.amount} onChange={(n) => setExpAmount(eh.id, n)} tone="amber" prefix="₹" allowDecimal />
                  </td>
                  <td></td>
                </tr>
              );
            })}

            {/* Other expenses (ad-hoc) */}
            {otherExpenses.map((o, i) => (
              <tr key={o.tempId} className="border-b border-slate-100 bg-amber-50/30">
                <td className="px-4 py-2 text-[12px] text-amber-600">
                  <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">extra</span>
                </td>
                <td className="px-4 py-2" colSpan={1}>
                  <input
                    type="text"
                    value={o.label}
                    onChange={(e) => updateOther(i, { label: e.target.value })}
                    placeholder="Expense name…"
                    className="w-full rounded-md border border-amber-200 text-sm py-1.5 px-2 bg-white focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value=""
                    disabled
                    className="w-full rounded-md border border-slate-100 text-sm py-1.5 px-2 bg-slate-50 text-slate-400"
                    placeholder="—"
                  />
                </td>
                <td className="px-4 py-2">
                  <NumInput value={o.amount} onChange={(n) => updateOther(i, { amount: n })} tone="amber" prefix="₹" allowDecimal />
                </td>
                <td className="px-2 py-2 text-right">
                  <button onClick={() => removeOther(i)} className="text-rose-500 hover:text-rose-700 text-xs font-medium">
                    ✕
                  </button>
                </td>
              </tr>
            ))}

            {/* Add other row */}
            <tr>
              <td colSpan={5} className="px-4 py-2.5 border-b border-slate-100">
                <button
                  onClick={addOther}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700 transition flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add extra expense
                </button>
              </td>
            </tr>

            <tr className="bg-slate-100 border-t-2 border-slate-300">
              <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-slate-700 uppercase tracking-wide text-right">
                Total
              </td>
              <td className="px-4 py-2.5 text-right text-base font-bold text-slate-900 tabular-nums">
                {total > 0 ? formatCurrency(total) : "—"}
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ====== CASH RECONCILIATION TAB ======
function CashTab({
  cylTypes, connTypes, expHeads,
  revenueByCyl, connections, connectionTotals,
  expenses, otherExpenses, otherIncomes,
  setOtherIncomes, setOtherExpenses,
  denoms, setDenoms,
  totalCylRevenue, totalExpenses, totalIncome, netIncome, cashCounted, cashDiff,
}: {
  cylTypes: CylinderType[];
  connTypes: ConnectionType[];
  expHeads: ExpenseHead[];
  revenueByCyl: Record<string, { nsDom: number; otp: number; online: number; revenue: number; otpBonus: number; onlineBonus: number }>;
  connections: Record<string, { nos: number; cylDpr: number; deposit: number; refill: number; sd: number; inspection: number; blueBook: number }>;
  connectionTotals: { nos: number; cylDpr: number; deposit: number; refill: number; sd: number; inspection: number; blueBook: number; total: number };
  expenses: Record<string, { particulars: string; amount: number }>;
  otherExpenses: { tempId: string; label: string; amount: number }[];
  otherIncomes: { tempId: string; label: string; amount: number }[];
  setOtherIncomes: React.Dispatch<React.SetStateAction<{ tempId: string; label: string; amount: number }[]>>;
  setOtherExpenses: React.Dispatch<React.SetStateAction<{ tempId: string; label: string; amount: number }[]>>;
  denoms: Record<number, number>;
  setDenoms: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  totalCylRevenue: number; totalExpenses: number; totalIncome: number;
  netIncome: number; cashCounted: number; cashDiff: number;
}) {
  function updateDenom(value: number, count: number) {
    setDenoms((prev) => ({ ...prev, [value]: Math.max(0, count) }));
  }
  function addOtherIncome() {
    setOtherIncomes((prev) => [...prev, { tempId: `oi-${Date.now()}`, label: "", amount: 0 }]);
  }
  function updateOtherIncome(i: number, patch: Partial<{ label: string; amount: number }>) {
    setOtherIncomes((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }
  function removeOtherIncome(i: number) {
    setOtherIncomes((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addOtherExpense() {
    setOtherExpenses((prev) => [...prev, { tempId: `oe-${Date.now()}`, label: "", amount: 0 }]);
  }
  function updateOtherExpense(i: number, patch: Partial<{ label: string; amount: number }>) {
    setOtherExpenses((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }
  function removeOtherExpense(i: number) {
    setOtherExpenses((prev) => prev.filter((_, idx) => idx !== i));
  }

  const otherIncomeTotal = otherIncomes.reduce((s, o) => s + o.amount, 0);
  const expenseHeadTotal = Object.values(expenses).reduce((s, e) => s + e.amount, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* ===== INCOME ===== */}
      <div className="bg-white border border-emerald-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-200">
          <h3 className="text-sm font-semibold text-emerald-800">Income</h3>
          <p className="text-[11px] text-emerald-700">Auto-computed from Sales + Connections</p>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {/* Cylinder sales rows per active type */}
            {cylTypes.map((ct) => {
              const rev = revenueByCyl[ct.id]?.revenue || 0;
              if (rev === 0) return null;
              return (
                <tr key={ct.id} className="border-b border-slate-100">
                  <td className="px-4 py-2 text-[13px] text-slate-700">{ct.name} Sales</td>
                  <td className="px-4 py-2 text-right text-sm font-medium text-slate-800 tabular-nums">{formatCurrency(rev)}</td>
                </tr>
              );
            })}
            {totalCylRevenue === 0 && (
              <tr>
                <td className="px-4 py-2 text-xs text-slate-400 italic" colSpan={2}>No cylinder sales yet</td>
              </tr>
            )}

            {/* Connection breakdown */}
            {connectionTotals.total > 0 && (
              <tr className="border-b border-slate-100 bg-blue-50/30">
                <td className="px-4 py-2 text-[13px] text-slate-700">New Connection (deposits, refills, …)</td>
                <td className="px-4 py-2 text-right text-sm font-medium text-slate-800 tabular-nums">{formatCurrency(connectionTotals.total)}</td>
              </tr>
            )}

            {/* Other incomes (ad-hoc) */}
            {otherIncomes.map((o, i) => (
              <tr key={o.tempId} className="border-b border-slate-100 bg-emerald-50/20">
                <td className="px-4 py-1.5">
                  <input
                    type="text"
                    value={o.label}
                    onChange={(e) => updateOtherIncome(i, { label: e.target.value })}
                    placeholder="e.g. Cash Memo Bill Book"
                    className="w-full rounded-md border border-emerald-200 text-sm py-1.5 px-2 bg-white focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 outline-none"
                  />
                </td>
                <td className="px-4 py-1.5">
                  <div className="flex items-center gap-1">
                    <NumInput value={o.amount} onChange={(n) => updateOtherIncome(i, { amount: n })} tone="emerald" prefix="₹" allowDecimal />
                    <button onClick={() => removeOtherIncome(i)} className="text-rose-500 hover:text-rose-700 text-xs px-1">✕</button>
                  </div>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={2} className="px-4 py-2">
                <button
                  onClick={addOtherIncome}
                  className="text-xs font-medium text-emerald-700 hover:text-emerald-800 transition flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add other income
                </button>
              </td>
            </tr>

            <tr className="bg-emerald-100 border-t-2 border-emerald-300">
              <td className="px-4 py-2.5 text-xs font-semibold text-emerald-900 uppercase tracking-wide">Total Income</td>
              <td className="px-4 py-2.5 text-right text-base font-bold text-emerald-900 tabular-nums">{formatCurrency(totalIncome)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ===== EXPENSES ===== */}
      <div className="bg-white border border-amber-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
          <h3 className="text-sm font-semibold text-amber-800">Expenses</h3>
          <p className="text-[11px] text-amber-700">Auto from Expenses tab + ad-hoc</p>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {/* Daily expense rows that have an amount > 0 */}
            {expHeads.map((eh) => {
              const v = expenses[eh.id];
              if (!v || v.amount === 0) return null;
              return (
                <tr key={eh.id} className="border-b border-slate-100">
                  <td className="px-4 py-2 text-[13px] text-slate-700">{eh.name}</td>
                  <td className="px-4 py-2 text-right text-sm font-medium text-slate-800 tabular-nums">{formatCurrency(v.amount)}</td>
                </tr>
              );
            })}
            {expenseHeadTotal === 0 && (
              <tr>
                <td className="px-4 py-2 text-xs text-slate-400 italic" colSpan={2}>No expenses entered yet</td>
              </tr>
            )}

            {/* Ad-hoc other expenses */}
            {otherExpenses.map((o, i) => (
              <tr key={o.tempId} className="border-b border-slate-100 bg-amber-50/20">
                <td className="px-4 py-1.5">
                  <input
                    type="text"
                    value={o.label}
                    onChange={(e) => updateOtherExpense(i, { label: e.target.value })}
                    placeholder="e.g. Online Refill"
                    className="w-full rounded-md border border-amber-200 text-sm py-1.5 px-2 bg-white focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none"
                  />
                </td>
                <td className="px-4 py-1.5">
                  <div className="flex items-center gap-1">
                    <NumInput value={o.amount} onChange={(n) => updateOtherExpense(i, { amount: n })} tone="amber" prefix="₹" allowDecimal />
                    <button onClick={() => removeOtherExpense(i)} className="text-rose-500 hover:text-rose-700 text-xs px-1">✕</button>
                  </div>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={2} className="px-4 py-2">
                <button
                  onClick={addOtherExpense}
                  className="text-xs font-medium text-amber-700 hover:text-amber-800 transition flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add other expense
                </button>
              </td>
            </tr>

            <tr className="bg-amber-100 border-t-2 border-amber-300">
              <td className="px-4 py-2.5 text-xs font-semibold text-amber-900 uppercase tracking-wide">Total Expenses</td>
              <td className="px-4 py-2.5 text-right text-base font-bold text-amber-900 tabular-nums">{formatCurrency(totalExpenses)}</td>
            </tr>

            <tr className="bg-white border-t border-amber-200">
              <td className="px-4 py-2.5 text-xs font-semibold text-slate-700 uppercase tracking-wide">Net Income</td>
              <td className={cn("px-4 py-2.5 text-right text-base font-bold tabular-nums",
                netIncome >= 0 ? "text-emerald-700" : "text-rose-700")}>
                {formatCurrency(netIncome)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ===== CASH COUNTING ===== */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-slate-100 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800">Cash Counting</h3>
          <p className="text-[11px] text-slate-500">Physical cash vs. expected</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50">
              <th className="text-left px-4 py-2 text-[10px] font-medium text-slate-500 uppercase tracking-wide">Denom.</th>
              <th className="text-center px-3 py-2 text-[10px] font-medium text-slate-500 uppercase tracking-wide w-24">Count</th>
              <th className="text-right px-4 py-2 text-[10px] font-medium text-slate-500 uppercase tracking-wide">Total</th>
            </tr>
          </thead>
          <tbody>
            {DENOMINATIONS.map((v) => {
              const count = denoms[v] || 0;
              const total = v * count;
              return (
                <tr key={v} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-1.5">
                    <span className={cn(
                      "text-xs font-semibold px-2 py-1 rounded",
                      v >= 100 ? "bg-slate-800 text-white" :
                      v >= 10  ? "bg-slate-200 text-slate-700" :
                                 "bg-amber-100 text-amber-700"
                    )}>
                      ₹ {v}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <NumInput value={count} onChange={(n) => updateDenom(v, n)} tone="slate" />
                  </td>
                  <td className="px-4 py-1.5 text-right text-sm font-medium text-slate-800 tabular-nums">
                    {total > 0 ? formatCurrency(total) : "—"}
                  </td>
                </tr>
              );
            })}

            <tr className="bg-slate-100 border-t-2 border-slate-300">
              <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Cash in Hand
              </td>
              <td className="px-4 py-2.5 text-right text-base font-bold text-slate-900 tabular-nums">
                {formatCurrency(cashCounted)}
              </td>
            </tr>

            <tr className={cn(cashDiff === 0 ? "bg-emerald-50" : cashDiff > 0 ? "bg-blue-50" : "bg-rose-50")}>
              <td colSpan={2} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide">
                <span className={cn(cashDiff === 0 ? "text-emerald-700" : cashDiff > 0 ? "text-blue-700" : "text-rose-700")}>
                  Cash vs Net Income
                </span>
              </td>
              <td className={cn("px-4 py-2 text-right text-sm font-bold tabular-nums",
                cashDiff === 0 ? "text-emerald-700" : cashDiff > 0 ? "text-blue-700" : "text-rose-700")}>
                {cashCounted > 0 ? (
                  cashDiff === 0 ? "Balanced ✓" :
                  cashDiff > 0  ? `+${formatCurrency(cashDiff)} excess` :
                                  `${formatCurrency(cashDiff)} short`
                ) : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ====== COMMERCIAL STOCK TAB ======
function CommercialTab({
  customers, getComm, setComm, totals, onRefresh, showToast,
}: {
  customers: CommercialCustomer[];
  commercials: Record<string, { productType: string; stockOut: number; stockIn: number; amount: number; received: number }>;
  getComm: (custId: string) => { productType: string; stockOut: number; stockIn: number; amount: number; received: number };
  setComm: (custId: string, field: "productType" | "stockOut" | "stockIn" | "amount" | "received", value: number | string) => void;
  totals: { stockOut: number; stockIn: number; amount: number; received: number };
  onRefresh: () => Promise<void>;
  showToast: (type: "success" | "error", message: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newProduct, setNewProduct] = useState("");
  const [adding, setAdding] = useState(false);

  async function addCustomer() {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/commercial-customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), productType: newProduct.trim() }),
      });
      if (!res.ok) throw new Error();
      setNewName(""); setNewProduct(""); setAddOpen(false);
      showToast("success", "Customer added");
      await onRefresh();
    } catch {
      showToast("error", "Failed to add customer");
    }
    setAdding(false);
  }

  if (customers.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
        <p className="text-sm text-slate-500">No commercial customers yet.</p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <input
            type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="Customer name"
            className="rounded-lg border border-slate-200 text-sm py-1.5 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none"
          />
          <input
            type="text" value={newProduct} onChange={(e) => setNewProduct(e.target.value)}
            placeholder="Product type (e.g. 19 KG)"
            className="rounded-lg border border-slate-200 text-sm py-1.5 px-3 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none"
          />
          <button onClick={addCustomer} disabled={adding || !newName.trim()}
            className="px-4 py-1.5 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50">
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    );
  }

  const pending = totals.amount - totals.received;

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide w-12">#</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide min-w-[180px]">Customer</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide min-w-[120px]">Product</th>
                <th className="text-center px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide bg-emerald-50/50" colSpan={3}>Stock</th>
                <th className="text-center px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide bg-blue-50/50" colSpan={3}>Payment</th>
              </tr>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th colSpan={3}></th>
                <th className="text-right px-3 py-1.5 text-[10px] font-medium text-emerald-700 uppercase tracking-wide w-24 bg-emerald-50/30">Out</th>
                <th className="text-right px-3 py-1.5 text-[10px] font-medium text-emerald-700 uppercase tracking-wide w-24 bg-emerald-50/30">In</th>
                <th className="text-right px-3 py-1.5 text-[10px] font-medium text-emerald-800 uppercase tracking-wide w-24 bg-emerald-100/50">Pending</th>
                <th className="text-right px-3 py-1.5 text-[10px] font-medium text-blue-700 uppercase tracking-wide w-28 bg-blue-50/30">Amount</th>
                <th className="text-right px-3 py-1.5 text-[10px] font-medium text-blue-700 uppercase tracking-wide w-28 bg-blue-50/30">Received</th>
                <th className="text-right px-3 py-1.5 text-[10px] font-medium text-blue-800 uppercase tracking-wide w-28 bg-blue-100/50">Pending</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((cust, i) => {
                const v = getComm(cust.id);
                const stockPending = v.stockOut - v.stockIn;
                const payPending = v.amount - v.received;
                return (
                  <tr key={cust.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-1.5 text-[12px] text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="px-4 py-1.5 text-[13px] font-medium text-slate-800">{cust.name}</td>
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        value={v.productType || cust.productType || ""}
                        onChange={(e) => setComm(cust.id, "productType", e.target.value)}
                        placeholder="e.g. 19 KG"
                        className="w-full rounded-md border border-slate-200 text-sm py-1 px-2 bg-slate-50 focus:bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none transition"
                      />
                    </td>
                    <td className="px-3 py-1.5 bg-emerald-50/20">
                      <NumInput value={v.stockOut} onChange={(n) => setComm(cust.id, "stockOut", n)} tone="emerald" />
                    </td>
                    <td className="px-3 py-1.5 bg-emerald-50/20">
                      <NumInput value={v.stockIn} onChange={(n) => setComm(cust.id, "stockIn", n)} tone="emerald" />
                    </td>
                    <td className="px-3 py-1.5 bg-emerald-100/30 text-right text-sm font-semibold tabular-nums">
                      <span className={cn(stockPending > 0 ? "text-emerald-800" : "text-slate-400")}>
                        {stockPending !== 0 ? stockPending : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 bg-blue-50/20">
                      <NumInput value={v.amount} onChange={(n) => setComm(cust.id, "amount", n)} tone="blue" prefix="₹" allowDecimal />
                    </td>
                    <td className="px-3 py-1.5 bg-blue-50/20">
                      <NumInput value={v.received} onChange={(n) => setComm(cust.id, "received", n)} tone="blue" prefix="₹" allowDecimal />
                    </td>
                    <td className="px-3 py-1.5 bg-blue-100/30 text-right text-sm font-semibold tabular-nums">
                      <span className={cn(payPending > 0 ? "text-blue-800" : "text-slate-400")}>
                        {payPending !== 0 ? formatCurrency(payPending) : "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {/* Totals */}
              <tr className="bg-slate-100 border-t-2 border-slate-300">
                <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-slate-700 uppercase tracking-wide">Total</td>
                <td className="px-3 py-2.5 text-right text-sm font-bold text-emerald-800 tabular-nums bg-emerald-100/40">{totals.stockOut || "—"}</td>
                <td className="px-3 py-2.5 text-right text-sm font-bold text-emerald-800 tabular-nums bg-emerald-100/40">{totals.stockIn || "—"}</td>
                <td className="px-3 py-2.5 text-right text-sm font-bold text-emerald-900 tabular-nums bg-emerald-200/60">
                  {(totals.stockOut - totals.stockIn) || "—"}
                </td>
                <td className="px-3 py-2.5 text-right text-sm font-bold text-blue-800 tabular-nums bg-blue-100/40">{totals.amount > 0 ? formatCurrency(totals.amount) : "—"}</td>
                <td className="px-3 py-2.5 text-right text-sm font-bold text-blue-800 tabular-nums bg-blue-100/40">{totals.received > 0 ? formatCurrency(totals.received) : "—"}</td>
                <td className="px-3 py-2.5 text-right text-sm font-bold text-blue-900 tabular-nums bg-blue-200/60">{pending !== 0 ? formatCurrency(pending) : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Add customer inline */}
      {!addOpen ? (
        <button
          onClick={() => setAddOpen(true)}
          className="text-xs font-medium text-slate-500 hover:text-slate-700 transition flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add commercial customer
        </button>
      ) : (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2">
          <input
            type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="Customer name"
            className="flex-1 rounded-md border border-slate-200 text-sm py-1.5 px-2 bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none"
          />
          <input
            type="text" value={newProduct} onChange={(e) => setNewProduct(e.target.value)}
            placeholder="Product"
            className="w-36 rounded-md border border-slate-200 text-sm py-1.5 px-2 bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400 outline-none"
          />
          <button onClick={addCustomer} disabled={adding || !newName.trim()}
            className="px-3 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-md hover:bg-slate-700 disabled:opacity-50">
            {adding ? "…" : "Add"}
          </button>
          <button onClick={() => { setAddOpen(false); setNewName(""); setNewProduct(""); }}
            className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ====== Common helper components ======
function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
      <p className="text-sm text-slate-400">{msg}</p>
    </div>
  );
}

function NumInput({
  value, onChange, tone = "slate", prefix, allowDecimal = false,
}: {
  value: number; onChange: (n: number) => void;
  tone?: "slate" | "emerald" | "blue" | "amber";
  prefix?: string; allowDecimal?: boolean;
}) {
  const toneMap: Record<string, string> = {
    slate:   "border-slate-200 bg-slate-50 text-slate-800 focus:border-slate-400 focus:ring-slate-400",
    emerald: "border-emerald-200 bg-emerald-50/50 text-emerald-800 focus:border-emerald-400 focus:ring-emerald-400",
    blue:    "border-blue-200 bg-blue-50/50 text-blue-800 focus:border-blue-400 focus:ring-blue-400",
    amber:   "border-amber-200 bg-amber-50/50 text-amber-800 focus:border-amber-400 focus:ring-amber-400",
  };
  return (
    <div className="relative">
      {prefix && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">{prefix}</span>
      )}
      <input
        type="number"
        min={0}
        step={allowDecimal ? 0.5 : 1}
        value={value === 0 ? "" : value}
        onChange={(e) => {
          const s = e.target.value;
          if (s === "") return onChange(0);
          const n = allowDecimal ? parseFloat(s) : parseInt(s, 10);
          if (!isNaN(n) && n >= 0) onChange(n);
        }}
        onFocus={(e) => e.target.select()}
        placeholder="0"
        className={cn(
          "w-full rounded-md border text-sm font-semibold tabular-nums text-right outline-none focus:ring-1 transition",
          prefix ? "pl-6 pr-2 py-1.5" : "px-2 py-1.5",
          toneMap[tone]
        )}
      />
    </div>
  );
}
