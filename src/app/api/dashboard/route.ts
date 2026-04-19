import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Period = "today" | "week" | "month" | "fy";

function utcMidnight(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function computePeriod(period: Period, ref: Date): {
  start: Date; end: Date; prevStart: Date; prevEnd: Date; label: string;
} {
  const now = utcMidnight(ref);
  if (period === "today") {
    const start = now;
    const end = new Date(now.getTime() + 86400000 - 1000);
    const prevStart = new Date(now.getTime() - 86400000);
    const prevEnd = new Date(now.getTime() - 1000);
    return { start, end, prevStart, prevEnd, label: "Today" };
  }
  if (period === "week") {
    const start = new Date(now.getTime() - 6 * 86400000);
    const end = new Date(now.getTime() + 86400000 - 1000);
    const prevStart = new Date(start.getTime() - 7 * 86400000);
    const prevEnd = new Date(start.getTime() - 1000);
    return { start, end, prevStart, prevEnd, label: "Last 7 days" };
  }
  if (period === "month") {
    const y = ref.getUTCFullYear();
    const m = ref.getUTCMonth();
    const start = new Date(Date.UTC(y, m, 1));
    const end = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59));
    const prevStart = new Date(Date.UTC(y, m - 1, 1));
    const prevEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59));
    return { start, end, prevStart, prevEnd, label: new Date(Date.UTC(y, m, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
  }
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const fyStartYear = m >= 3 ? y : y - 1;
  const start = new Date(Date.UTC(fyStartYear, 3, 1));
  const end = new Date(Date.UTC(fyStartYear + 1, 2, 31, 23, 59, 59));
  const prevStart = new Date(Date.UTC(fyStartYear - 1, 3, 1));
  const prevEnd = new Date(Date.UTC(fyStartYear, 2, 31, 23, 59, 59));
  return {
    start, end, prevStart, prevEnd,
    label: `FY ${fyStartYear}-${(fyStartYear + 1).toString().slice(2)}`,
  };
}

// Diverse palette — no yellow/amber/orange
const paletteCyl = ["#10b981", "#8b5cf6", "#0ea5e9", "#ec4899", "#14b8a6", "#6366f1", "#f43f5e", "#06b6d4"];
const paletteExp = ["#ef4444", "#8b5cf6", "#0ea5e9", "#ec4899", "#14b8a6", "#6366f1", "#06b6d4", "#64748b", "#a855f7", "#f43f5e", "#10b981", "#22d3ee"];

export async function GET(request: NextRequest) {
  const period = (request.nextUrl.searchParams.get("period") as Period) || "month";
  const refDateStr = request.nextUrl.searchParams.get("ref");
  const refDate = refDateStr ? new Date(refDateStr) : new Date();

  const { start, end, prevStart, prevEnd, label } = computePeriod(period, refDate);
  const todayUTC = utcMidnight(refDate);
  const heatStart = new Date(todayUTC.getTime() - 91 * 86400000);
  const cutoff25 = new Date(Date.now() - 25 * 86400000);

  // ─────────────────────────────────────────────────────────────
  // PARALLEL FETCH — single round-trip for all data
  // 6 queries instead of 20+
  // ─────────────────────────────────────────────────────────────
  const [
    currentOps,
    prevOps,
    employees,
    cylinderTypes,
    refillActivity,
    stockAgg,
    consumerRows,
  ] = await Promise.all([
    // 1. Current period — full detail (includes today's op if within period)
    prisma.dailyOperation.findMany({
      where: { date: { gte: start, lte: end } },
      include: {
        sales: {
          include: {
            cylinderType: { select: { id: true, name: true, sellingPrice: true, otpRate: true, onlineRate: true } },
            employee: { select: { id: true, name: true } },
          },
        },
        connections: { select: { cylDpr: true, deposit: true, refill: true, sd: true, inspection: true, blueBook: true, nos: true } },
        expenses: { include: { expenseHead: { select: { id: true, name: true } } } },
        otherExpenses: { select: { amount: true } },
        otherIncomes: { select: { amount: true } },
        denominations: { select: { value: true, count: true } },
      },
      orderBy: { date: "asc" },
    }),

    // 2. Previous period — slim (only what we need for deltas)
    prisma.dailyOperation.findMany({
      where: { date: { gte: prevStart, lte: prevEnd } },
      select: {
        sales: { select: { nsDomCount: true, cylinderType: { select: { sellingPrice: true } } } },
        connections: { select: { cylDpr: true, deposit: true, refill: true, sd: true, inspection: true, blueBook: true } },
        otherIncomes: { select: { amount: true } },
        expenses: { select: { amount: true } },
        otherExpenses: { select: { amount: true } },
      },
    }),

    // 3. Employees master (for counts)
    prisma.employee.findMany({
      where: { active: true },
      select: { id: true, type: true },
    }),

    // 4. Cylinder types master (active only, for stock + alerts)
    prisma.cylinderType.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),

    // 5. Refill activity — 91-day heatmap + due-refill counts in a SINGLE fetch
    prisma.consumerRefill.findMany({
      where: { date: { gte: heatStart } },
      select: { date: true, consumerId: true },
    }),

    // 6. Stock snapshot (group by cylinder type)
    prisma.cylinderStockTransaction.groupBy({
      by: ["cylinderTypeId"],
      _sum: { fullDelta: true, emptyDelta: true },
    }),

    // 7. Consumers (total + active IDs in one fetch)
    prisma.consumer.findMany({
      select: { id: true, active: true },
    }),
  ]);

  // ─────────────────────────────────────────────────────────────
  // AGGREGATE IN MEMORY
  // ─────────────────────────────────────────────────────────────

  // Current-period buckets
  let revenueTotal = 0;
  let expenseTotal = 0;
  let nsDomTotal = 0;
  let otpTotal = 0;
  let onlineTotal = 0;

  const revenueByCyl = new Map<string, { id: string; name: string; revenue: number; nsDom: number; color: string }>();
  const expenseByHead = new Map<string, { id: string; name: string; amount: number; color: string }>();
  const salesByEmployee = new Map<string, { id: string; name: string; nsDom: number; otp: number; online: number; revenue: number }>();

  let cylIdx = 0;
  let expIdx = 0;

  const bucketByDate = new Map<string, { label: string; revenue: number; expenses: number; net: number; nsDom: number }>();
  const bucketMode: "day" | "month" = period === "fy" ? "month" : "day";

  function bucketKey(d: Date): string {
    const dd = new Date(d);
    if (bucketMode === "month") return `${dd.getUTCFullYear()}-${String(dd.getUTCMonth() + 1).padStart(2, "0")}`;
    return `${dd.getUTCFullYear()}-${String(dd.getUTCMonth() + 1).padStart(2, "0")}-${String(dd.getUTCDate()).padStart(2, "0")}`;
  }
  function bucketLabel(d: Date): string {
    const dd = new Date(d);
    if (bucketMode === "month") return dd.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
    return dd.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  }
  function ensureBucket(d: Date) {
    const k = bucketKey(d);
    if (!bucketByDate.has(k)) bucketByDate.set(k, { label: bucketLabel(d), revenue: 0, expenses: 0, net: 0, nsDom: 0 });
    return bucketByDate.get(k)!;
  }

  // Pre-populate buckets for continuous chart line
  if (bucketMode === "day") {
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) ensureBucket(new Date(t));
  } else {
    const sy = start.getUTCFullYear();
    const sm = start.getUTCMonth();
    for (let i = 0; i < 12; i++) ensureBucket(new Date(Date.UTC(sy, sm + i, 15)));
  }

  // Find today's op in-memory (avoid a separate query)
  let todayRev = 0;
  let todayExp = 0;
  let todayCash = 0;
  const todayISO = todayUTC.toISOString();

  for (const op of currentOps) {
    const b = ensureBucket(op.date);
    const isToday = new Date(op.date).toISOString() === todayISO;

    // Sales (NS-DOM × sellingPrice = revenue)
    for (const s of op.sales) {
      const rev = s.nsDomCount * s.cylinderType.sellingPrice;
      revenueTotal += rev;
      nsDomTotal += s.nsDomCount;
      otpTotal += s.otpCount;
      onlineTotal += s.onlineCount;
      b.revenue += rev;
      b.nsDom += s.nsDomCount;

      const cylKey = s.cylinderType.id;
      if (!revenueByCyl.has(cylKey)) {
        revenueByCyl.set(cylKey, {
          id: cylKey, name: s.cylinderType.name,
          revenue: 0, nsDom: 0, color: paletteCyl[cylIdx++ % paletteCyl.length],
        });
      }
      const cylAgg = revenueByCyl.get(cylKey)!;
      cylAgg.revenue += rev;
      cylAgg.nsDom += s.nsDomCount;

      if (!salesByEmployee.has(s.employeeId)) {
        salesByEmployee.set(s.employeeId, { id: s.employeeId, name: s.employee.name, nsDom: 0, otp: 0, online: 0, revenue: 0 });
      }
      const empAgg = salesByEmployee.get(s.employeeId)!;
      empAgg.nsDom += s.nsDomCount;
      empAgg.otp += s.otpCount;
      empAgg.online += s.onlineCount;
      empAgg.revenue += rev;

      if (isToday) todayRev += rev;
    }

    // Connections
    for (const c of op.connections) {
      const connRev = c.cylDpr + c.deposit + c.refill + c.sd + c.inspection + c.blueBook;
      revenueTotal += connRev;
      b.revenue += connRev;
      if (isToday) todayRev += connRev;
    }

    // Other incomes
    for (const o of op.otherIncomes) {
      revenueTotal += o.amount;
      b.revenue += o.amount;
      if (isToday) todayRev += o.amount;
    }

    // Expenses (by head)
    for (const e of op.expenses) {
      expenseTotal += e.amount;
      b.expenses += e.amount;
      const key = e.expenseHead.id;
      if (!expenseByHead.has(key)) {
        expenseByHead.set(key, { id: key, name: e.expenseHead.name, amount: 0, color: paletteExp[expIdx++ % paletteExp.length] });
      }
      expenseByHead.get(key)!.amount += e.amount;
      if (isToday) todayExp += e.amount;
    }

    // Other expenses
    for (const o of op.otherExpenses) {
      expenseTotal += o.amount;
      b.expenses += o.amount;
      const key = "__other__";
      if (!expenseByHead.has(key)) {
        expenseByHead.set(key, { id: key, name: "Other / Ad-hoc", amount: 0, color: paletteExp[expIdx++ % paletteExp.length] });
      }
      expenseByHead.get(key)!.amount += o.amount;
      if (isToday) todayExp += o.amount;
    }

    // Cash denominations (only for today)
    if (isToday) {
      for (const d of op.denominations) todayCash += d.value * d.count;
    }
  }

  for (const b of bucketByDate.values()) b.net = b.revenue - b.expenses;
  const netIncome = revenueTotal - expenseTotal;

  // Previous period totals (for deltas)
  let prevRev = 0, prevExp = 0, prevNsDom = 0;
  for (const op of prevOps) {
    for (const s of op.sales) {
      prevRev += s.nsDomCount * s.cylinderType.sellingPrice;
      prevNsDom += s.nsDomCount;
    }
    for (const c of op.connections) prevRev += c.cylDpr + c.deposit + c.refill + c.sd + c.inspection + c.blueBook;
    for (const o of op.otherIncomes) prevRev += o.amount;
    for (const e of op.expenses) prevExp += e.amount;
    for (const o of op.otherExpenses) prevExp += o.amount;
  }
  const prevNet = prevRev - prevExp;

  // Stock snapshot
  const stockById = new Map<string, { full: number; empty: number }>();
  for (const s of stockAgg) {
    stockById.set(s.cylinderTypeId, {
      full: s._sum.fullDelta || 0,
      empty: s._sum.emptyDelta || 0,
    });
  }
  const stockSnapshot = cylinderTypes.map((ct) => {
    const s = stockById.get(ct.id) || { full: 0, empty: 0 };
    return { id: ct.id, name: ct.name, full: s.full, empty: s.empty, sellingPrice: 0 };
  });
  const totalFull = stockSnapshot.reduce((a, b) => a + b.full, 0);
  const totalEmpty = stockSnapshot.reduce((a, b) => a + b.empty, 0);
  const lowStockTypes = stockSnapshot.filter((s) => s.full < 10);

  // Heatmap (91 days) — compute intensity on-the-fly
  const refillsByDay = new Map<string, number>();
  const recentRefillers = new Set<string>();
  for (const r of refillActivity) {
    const k = utcMidnight(new Date(r.date)).toISOString().slice(0, 10);
    refillsByDay.set(k, (refillsByDay.get(k) || 0) + 1);
    if (new Date(r.date) >= cutoff25) recentRefillers.add(r.consumerId);
  }
  const maxRefills = Math.max(1, ...refillsByDay.values());
  const heatDays: { date: string; count: number; intensity: number }[] = [];
  for (let t = heatStart.getTime(); t <= todayUTC.getTime(); t += 86400000) {
    const k = new Date(t).toISOString().slice(0, 10);
    const count = refillsByDay.get(k) || 0;
    heatDays.push({
      date: k, count,
      intensity: count === 0 ? 0 : Math.ceil((count / maxRefills) * 4),
    });
  }

  // Refills due count (from in-memory consumers list — no extra query)
  const totalConsumers = consumerRows.length;
  const refillsDueCount = consumerRows.filter((c) => c.active && !recentRefillers.has(c.id)).length;

  // Alerts
  const alerts: Array<{
    level: "danger" | "warning" | "info";
    icon: "fire" | "clock" | "cash" | "trend-down" | "inbox";
    title: string; message: string; href?: string; count?: number;
  }> = [];

  if (lowStockTypes.length > 0) {
    const critical = lowStockTypes.filter((s) => s.full < 5);
    alerts.push({
      level: critical.length > 0 ? "danger" : "warning",
      icon: "fire",
      title: critical.length > 0 ? "Critical low stock" : "Low stock warning",
      message: lowStockTypes.map((s) => `${s.name} (${s.full})`).join(" · "),
      href: "/dashboard/stock",
      count: lowStockTypes.length,
    });
  }
  if (refillsDueCount > 0) {
    alerts.push({
      level: refillsDueCount > 20 ? "warning" : "info",
      icon: "clock",
      title: `${refillsDueCount} consumer${refillsDueCount > 1 ? "s" : ""} due for refill`,
      message: "No refill recorded in 25+ days",
      href: "/dashboard/consumers",
      count: refillsDueCount,
    });
  }
  const negativeDays = Array.from(bucketByDate.values()).filter((b) => b.net < 0 && (b.revenue > 0 || b.expenses > 0));
  if (negativeDays.length > 0) {
    alerts.push({
      level: "warning",
      icon: "trend-down",
      title: `${negativeDays.length} negative-net ${bucketMode === "month" ? "month" : "day"}${negativeDays.length > 1 ? "s" : ""}`,
      message: "Expenses exceeded revenue",
      href: "/dashboard/daily-ops",
      count: negativeDays.length,
    });
  }
  const todayNet = todayRev - todayExp;
  if (todayCash > 0) {
    const diff = todayCash - todayNet;
    if (Math.abs(diff) > 100) {
      alerts.push({
        level: diff < -500 ? "danger" : "warning",
        icon: "cash",
        title: diff > 0 ? "Cash excess today" : "Cash short today",
        message: `Physical cash ${diff > 0 ? "exceeds" : "below"} net income by ₹${Math.abs(diff).toLocaleString("en-IN")}`,
        href: "/dashboard/daily-ops",
      });
    }
  } else if (period === "today" || period === "week") {
    const hour = new Date().getHours();
    if (hour >= 17) {
      alerts.push({
        level: "info",
        icon: "inbox",
        title: "Today's operations not recorded",
        message: "Close the day in Daily Ops",
        href: "/dashboard/daily-ops",
      });
    }
  }

  return NextResponse.json({
    period, label, range: { start, end },
    kpis: {
      revenue: { current: revenueTotal, previous: prevRev, delta: prevRev > 0 ? ((revenueTotal - prevRev) / prevRev) * 100 : null },
      expenses: { current: expenseTotal, previous: prevExp, delta: prevExp > 0 ? ((expenseTotal - prevExp) / prevExp) * 100 : null },
      netIncome: { current: netIncome, previous: prevNet, delta: prevNet !== 0 ? ((netIncome - prevNet) / Math.abs(prevNet)) * 100 : null },
      deliveries: { current: nsDomTotal, previous: prevNsDom, delta: prevNsDom > 0 ? ((nsDomTotal - prevNsDom) / prevNsDom) * 100 : null },
    },
    paymentModes: { otp: otpTotal, online: onlineTotal, nsDom: nsDomTotal },
    revenueTrend: Array.from(bucketByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({ key, ...v })),
    expenseBreakdown: Array.from(expenseByHead.values()).sort((a, b) => b.amount - a.amount),
    cylinderMix: Array.from(revenueByCyl.values()).sort((a, b) => b.revenue - a.revenue),
    employeePerformance: Array.from(salesByEmployee.values()).sort((a, b) => b.nsDom - a.nsDom),
    stockSnapshot: stockSnapshot.sort((a, b) => b.full - a.full),
    totalFull, totalEmpty,
    refillHeatmap: heatDays,
    refillHeatmapMax: maxRefills,
    alerts,
    counts: {
      employees: employees.length,
      deliveryStaff: employees.filter((e) => e.type === "delivery").length,
      officeStaff: employees.filter((e) => e.type === "office").length,
      consumers: totalConsumers,
      refillsDueCount,
      activeCylinderTypes: cylinderTypes.length,
    },
  });
}
