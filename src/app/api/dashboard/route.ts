import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Period = "today" | "week" | "month" | "fy";

function utcMidnight(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
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
  // fy — April to March (Indian FY)
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth(); // 0-indexed
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

async function aggregatePeriod(start: Date, end: Date) {
  const [ops, connections, expensesDirect, otherExpenses, otherIncomes] = await Promise.all([
    prisma.dailyOperation.findMany({
      where: { date: { gte: start, lte: end } },
      select: {
        date: true,
        sales: {
          select: {
            otpCount: true, onlineCount: true, nsDomCount: true,
            employeeId: true, cylinderTypeId: true,
            cylinderType: { select: { id: true, name: true, sellingPrice: true, otpRate: true, onlineRate: true } },
            employee: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { date: "asc" },
    }),
    prisma.connectionSale.findMany({
      where: { dailyOp: { date: { gte: start, lte: end } } },
      include: { connectionType: { select: { id: true, name: true } }, dailyOp: { select: { date: true } } },
    }),
    prisma.dailyExpense.findMany({
      where: { dailyOp: { date: { gte: start, lte: end } } },
      include: { expenseHead: { select: { id: true, name: true } }, dailyOp: { select: { date: true } } },
    }),
    prisma.otherExpense.findMany({
      where: { dailyOp: { date: { gte: start, lte: end } } },
      include: { dailyOp: { select: { date: true } } },
    }),
    prisma.otherIncome.findMany({
      where: { dailyOp: { date: { gte: start, lte: end } } },
      include: { dailyOp: { select: { date: true } } },
    }),
  ]);
  return { ops, connections, expensesDirect, otherExpenses, otherIncomes };
}

export async function GET(request: NextRequest) {
  const period = (request.nextUrl.searchParams.get("period") as Period) || "month";
  const refDateStr = request.nextUrl.searchParams.get("ref");
  const refDate = refDateStr ? new Date(refDateStr) : new Date();

  const { start, end, prevStart, prevEnd, label } = computePeriod(period, refDate);

  // Parallel data fetch: period, previous, masters, stock
  const [
    { ops, connections, expensesDirect, otherExpenses, otherIncomes },
    prev,
    employees,
    cylinderTypes,
    consumers,
    refillsLast91Days,
    stockAgg,
    refillsCutoff,
  ] = await Promise.all([
    aggregatePeriod(start, end),
    aggregatePeriod(prevStart, prevEnd),
    prisma.employee.findMany({ where: { active: true } }),
    prisma.cylinderType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.consumer.findMany({ where: { active: true }, select: { id: true } }),
    prisma.consumerRefill.findMany({
      where: { date: { gte: new Date(utcMidnight(refDate).getTime() - 90 * 86400000) } },
      select: { date: true },
    }),
    prisma.cylinderStockTransaction.groupBy({
      by: ["cylinderTypeId"],
      _sum: { fullDelta: true, emptyDelta: true },
    }),
    prisma.consumerRefill.findMany({
      where: { date: { gte: new Date(utcMidnight(refDate).getTime() - 25 * 86400000) } },
      select: { consumerId: true },
      distinct: ["consumerId"],
    }),
  ]);

  // ---------- Compute current-period aggregates ----------
  let revenueTotal = 0;
  let expenseTotal = 0;
  let nsDomTotal = 0;
  let otpTotal = 0;
  let onlineTotal = 0;
  const revenueByCyl = new Map<string, { id: string; name: string; revenue: number; nsDom: number; color: string }>();
  const expenseByHead = new Map<string, { id: string; name: string; amount: number; color: string }>();
  const salesByEmployee = new Map<string, { id: string; name: string; nsDom: number; otp: number; online: number; revenue: number }>();
  // Diverse palette — no yellow/amber/orange
  const paletteCyl = ["#10b981", "#8b5cf6", "#0ea5e9", "#ec4899", "#14b8a6", "#6366f1", "#f43f5e", "#06b6d4"];
  const paletteExp = ["#ef4444", "#8b5cf6", "#0ea5e9", "#ec4899", "#14b8a6", "#6366f1", "#06b6d4", "#64748b", "#a855f7", "#f43f5e", "#10b981", "#22d3ee"];
  let cylIdx = 0;
  let expIdx = 0;

  // Line-chart buckets — daily for today/week/month, monthly for FY
  const bucketByDate = new Map<string, { label: string; revenue: number; expenses: number; net: number; nsDom: number }>();
  const bucketMode: "day" | "month" = period === "fy" ? "month" : "day";

  function bucketKey(d: Date): string {
    const dd = new Date(d);
    if (bucketMode === "month") {
      return `${dd.getUTCFullYear()}-${String(dd.getUTCMonth() + 1).padStart(2, "0")}`;
    }
    return `${dd.getUTCFullYear()}-${String(dd.getUTCMonth() + 1).padStart(2, "0")}-${String(dd.getUTCDate()).padStart(2, "0")}`;
  }
  function bucketLabel(d: Date): string {
    const dd = new Date(d);
    if (bucketMode === "month") {
      return dd.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
    }
    return dd.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  }
  function ensureBucket(d: Date) {
    const k = bucketKey(d);
    if (!bucketByDate.has(k)) {
      bucketByDate.set(k, { label: bucketLabel(d), revenue: 0, expenses: 0, net: 0, nsDom: 0 });
    }
    return bucketByDate.get(k)!;
  }

  // Pre-populate all buckets in the range so the line is continuous
  if (bucketMode === "day") {
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
      ensureBucket(new Date(t));
    }
  } else {
    // Monthly buckets for FY
    const sy = start.getUTCFullYear();
    const sm = start.getUTCMonth();
    for (let i = 0; i < 12; i++) {
      ensureBucket(new Date(Date.UTC(sy, sm + i, 15)));
    }
  }

  // Aggregate sales
  for (const op of ops) {
    const b = ensureBucket(op.date);
    for (const s of op.sales) {
      const revenue = s.nsDomCount * s.cylinderType.sellingPrice;
      revenueTotal += revenue;
      nsDomTotal += s.nsDomCount;
      otpTotal += s.otpCount;
      onlineTotal += s.onlineCount;
      b.revenue += revenue;
      b.nsDom += s.nsDomCount;

      // per-cylinder aggregation
      if (!revenueByCyl.has(s.cylinderType.id)) {
        revenueByCyl.set(s.cylinderType.id, {
          id: s.cylinderType.id, name: s.cylinderType.name,
          revenue: 0, nsDom: 0, color: paletteCyl[cylIdx++ % paletteCyl.length],
        });
      }
      const cylAgg = revenueByCyl.get(s.cylinderType.id)!;
      cylAgg.revenue += revenue;
      cylAgg.nsDom += s.nsDomCount;

      // per-employee aggregation
      if (!salesByEmployee.has(s.employeeId)) {
        salesByEmployee.set(s.employeeId, {
          id: s.employeeId, name: s.employee.name,
          nsDom: 0, otp: 0, online: 0, revenue: 0,
        });
      }
      const empAgg = salesByEmployee.get(s.employeeId)!;
      empAgg.nsDom += s.nsDomCount;
      empAgg.otp += s.otpCount;
      empAgg.online += s.onlineCount;
      empAgg.revenue += revenue;
    }
  }

  // Connections (revenue)
  for (const c of connections) {
    const connRev = c.cylDpr + c.deposit + c.refill + c.sd + c.inspection + c.blueBook;
    revenueTotal += connRev;
    const b = ensureBucket(c.dailyOp.date);
    b.revenue += connRev;
  }

  // Other incomes
  for (const o of otherIncomes) {
    revenueTotal += o.amount;
    const b = ensureBucket(o.dailyOp.date);
    b.revenue += o.amount;
  }

  // Direct expenses
  for (const e of expensesDirect) {
    expenseTotal += e.amount;
    const b = ensureBucket(e.dailyOp.date);
    b.expenses += e.amount;
    if (!expenseByHead.has(e.expenseHead.id)) {
      expenseByHead.set(e.expenseHead.id, {
        id: e.expenseHead.id, name: e.expenseHead.name, amount: 0,
        color: paletteExp[expIdx++ % paletteExp.length],
      });
    }
    expenseByHead.get(e.expenseHead.id)!.amount += e.amount;
  }

  // Other expenses
  for (const o of otherExpenses) {
    expenseTotal += o.amount;
    const b = ensureBucket(o.dailyOp.date);
    b.expenses += o.amount;
    const key = "__other__";
    if (!expenseByHead.has(key)) {
      expenseByHead.set(key, {
        id: key, name: "Other / Ad-hoc", amount: 0,
        color: paletteExp[expIdx++ % paletteExp.length],
      });
    }
    expenseByHead.get(key)!.amount += o.amount;
  }

  // Compute net per bucket
  for (const b of bucketByDate.values()) {
    b.net = b.revenue - b.expenses;
  }

  const netIncome = revenueTotal - expenseTotal;

  // ---------- Previous period totals for deltas ----------
  let prevRev = 0;
  let prevExp = 0;
  let prevNsDom = 0;
  for (const op of prev.ops) {
    for (const s of op.sales) {
      prevRev += s.nsDomCount * s.cylinderType.sellingPrice;
      prevNsDom += s.nsDomCount;
    }
  }
  for (const c of prev.connections) prevRev += c.cylDpr + c.deposit + c.refill + c.sd + c.inspection + c.blueBook;
  for (const o of prev.otherIncomes) prevRev += o.amount;
  for (const e of prev.expensesDirect) prevExp += e.amount;
  for (const o of prev.otherExpenses) prevExp += o.amount;
  const prevNet = prevRev - prevExp;

  // ---------- Stock snapshot ----------
  const stockById = new Map<string, { full: number; empty: number }>();
  for (const s of stockAgg) {
    stockById.set(s.cylinderTypeId, {
      full: s._sum.fullDelta || 0,
      empty: s._sum.emptyDelta || 0,
    });
  }
  const stockSnapshot = cylinderTypes.map((ct) => {
    const s = stockById.get(ct.id) || { full: 0, empty: 0 };
    return { id: ct.id, name: ct.name, full: s.full, empty: s.empty, sellingPrice: ct.sellingPrice };
  });
  const totalFull = stockSnapshot.reduce((a, b) => a + b.full, 0);
  const totalEmpty = stockSnapshot.reduce((a, b) => a + b.empty, 0);
  const lowStockTypes = stockSnapshot.filter((s) => s.full < 10);

  // ---------- Consumer refill activity heatmap (last 91 days = 13 weeks) ----------
  const heatStart = utcMidnight(new Date(refDate.getTime() - 91 * 86400000));
  const heatDays: { date: string; count: number; intensity: number }[] = [];
  const refillsByDay = new Map<string, number>();
  for (const r of refillsLast91Days) {
    const k = utcMidnight(new Date(r.date)).toISOString().slice(0, 10);
    refillsByDay.set(k, (refillsByDay.get(k) || 0) + 1);
  }
  const maxRefills = Math.max(1, ...refillsByDay.values());
  for (let t = heatStart.getTime(); t <= utcMidnight(refDate).getTime(); t += 86400000) {
    const d = new Date(t);
    const k = d.toISOString().slice(0, 10);
    const count = refillsByDay.get(k) || 0;
    heatDays.push({
      date: k,
      count,
      intensity: count === 0 ? 0 : Math.ceil((count / maxRefills) * 4), // 0-4 levels
    });
  }

  // ---------- Refills due ----------
  const recentIds = new Set(refillsCutoff.map((r) => r.consumerId));
  const refillsDueCount = consumers.filter((c) => !recentIds.has(c.id)).length;

  // ---------- Alerts ----------
  const alerts: Array<{
    level: "danger" | "warning" | "info";
    icon: "fire" | "clock" | "cash" | "trend-down" | "inbox";
    title: string;
    message: string;
    href?: string;
    count?: number;
  }> = [];

  // Low stock
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

  // Refills due
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

  // Negative-net days in period
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

  // Cash reconciliation mismatch (today)
  const todayOp = await prisma.dailyOperation.findUnique({
    where: { date: utcMidnight(refDate) },
    include: {
      sales: { include: { cylinderType: true } },
      connections: true,
      expenses: true,
      otherIncomes: true,
      otherExpenses: true,
      denominations: true,
    },
  });
  if (todayOp) {
    let todayRev = 0;
    let todayExp = 0;
    for (const s of todayOp.sales) todayRev += s.nsDomCount * s.cylinderType.sellingPrice;
    for (const c of todayOp.connections) todayRev += c.cylDpr + c.deposit + c.refill + c.sd + c.inspection + c.blueBook;
    for (const o of todayOp.otherIncomes) todayRev += o.amount;
    for (const e of todayOp.expenses) todayExp += e.amount;
    for (const o of todayOp.otherExpenses) todayExp += o.amount;
    const todayNet = todayRev - todayExp;
    const cashCounted = todayOp.denominations.reduce((a, d) => a + d.value * d.count, 0);
    const diff = cashCounted - todayNet;
    if (cashCounted > 0 && Math.abs(diff) > 100) {
      alerts.push({
        level: diff < -500 ? "danger" : "warning",
        icon: "cash",
        title: diff > 0 ? "Cash excess today" : "Cash short today",
        message: `Physical cash ${diff > 0 ? "exceeds" : "below"} net income by ₹${Math.abs(diff).toLocaleString("en-IN")}`,
        href: "/dashboard/daily-ops",
      });
    }
  } else if (period === "today" || period === "week") {
    // No daily-op entered yet for today
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

  // ---------- Response ----------
  return NextResponse.json({
    period,
    label,
    range: { start, end },
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
    totalFull,
    totalEmpty,
    refillHeatmap: heatDays,
    refillHeatmapMax: maxRefills,
    alerts,
    counts: {
      employees: employees.length,
      deliveryStaff: employees.filter((e) => e.type === "delivery").length,
      officeStaff: employees.filter((e) => e.type === "office").length,
      consumers: consumers.length,
      refillsDueCount,
      activeCylinderTypes: cylinderTypes.length,
    },
  });
}
