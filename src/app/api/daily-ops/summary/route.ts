import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00.000Z");
}

// Month range [start, end] inclusive end.
function monthRange(monthStr: string): { start: Date; end: Date } {
  // monthStr: YYYY-MM
  const [y, m] = monthStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59));
  return { start, end };
}

export async function GET(request: NextRequest) {
  const dateStr = request.nextUrl.searchParams.get("date");
  const monthStr = request.nextUrl.searchParams.get("month"); // YYYY-MM

  if (!dateStr && !monthStr) {
    return NextResponse.json({ error: "date or month required" }, { status: 400 });
  }

  if (dateStr) {
    const date = parseDate(dateStr);
    const op = await prisma.dailyOperation.findUnique({
      where: { date },
      include: {
        sales: { include: { cylinderType: true, employee: true } },
        connections: { include: { connectionType: true } },
        expenses: { include: { expenseHead: true } },
        denominations: { orderBy: { value: "desc" } },
        commercials: { include: { customer: true } },
        otherIncomes: true,
        otherExpenses: true,
      },
    });

    if (!op) {
      return NextResponse.json({
        date: dateStr,
        totals: {
          cylinderRevenue: 0,
          connectionRevenue: 0,
          totalIncome: 0,
          totalExpense: 0,
          cashCounted: 0,
          netIncome: 0,
          cashDiff: 0,
        },
        op: null,
      });
    }

    // Compute cylinder revenue = sum(nsDomCount * sellingPrice) over sales
    let cylinderRevenue = 0;
    let otpBonus = 0;
    let onlineBonus = 0;
    const byType: Record<string, { name: string; nsDom: number; otp: number; online: number; revenue: number }> = {};
    for (const s of op.sales) {
      const revenue = s.nsDomCount * s.cylinderType.sellingPrice;
      cylinderRevenue += revenue;
      otpBonus += s.otpCount * s.cylinderType.otpRate;
      onlineBonus += s.onlineCount * s.cylinderType.onlineRate;
      const key = s.cylinderType.id;
      if (!byType[key]) {
        byType[key] = { name: s.cylinderType.name, nsDom: 0, otp: 0, online: 0, revenue: 0 };
      }
      byType[key].nsDom += s.nsDomCount;
      byType[key].otp += s.otpCount;
      byType[key].online += s.onlineCount;
      byType[key].revenue += revenue;
    }

    // Connection revenue = sum of all breakdowns
    let connectionRevenue = 0;
    let connectionNos = 0;
    for (const c of op.connections) {
      connectionRevenue += c.cylDpr + c.deposit + c.refill + c.sd + c.inspection + c.blueBook;
      connectionNos += c.nos;
    }

    // Expenses
    let totalExpense = 0;
    for (const e of op.expenses) totalExpense += e.amount;
    for (const o of op.otherExpenses) totalExpense += o.amount;

    // Other income
    let otherIncomeTotal = 0;
    for (const o of op.otherIncomes) otherIncomeTotal += o.amount;

    // Cash counted
    let cashCounted = 0;
    for (const d of op.denominations) cashCounted += d.value * d.count;

    const totalIncome = cylinderRevenue + connectionRevenue + otherIncomeTotal;
    const netIncome = totalIncome - totalExpense;
    const cashDiff = cashCounted - netIncome;

    // Commercial stock totals
    let commStockOut = 0;
    let commStockIn = 0;
    let commAmount = 0;
    let commReceived = 0;
    for (const c of op.commercials) {
      commStockOut += c.stockOut;
      commStockIn += c.stockIn;
      commAmount += c.amount;
      commReceived += c.received;
    }

    return NextResponse.json({
      date: dateStr,
      totals: {
        cylinderRevenue,
        connectionRevenue,
        otherIncomeTotal,
        otpBonus,
        onlineBonus,
        totalIncome,
        totalExpense,
        cashCounted,
        netIncome,
        cashDiff,
        connectionNos,
        commStockOut,
        commStockIn,
        commAmount,
        commReceived,
        commPending: commAmount - commReceived,
      },
      byCylinderType: Object.values(byType),
      op,
    });
  }

  // Month summary
  const { start, end } = monthRange(monthStr!);
  const ops = await prisma.dailyOperation.findMany({
    where: { date: { gte: start, lte: end } },
    include: {
      sales: { include: { cylinderType: true } },
      connections: true,
      expenses: true,
      denominations: true,
      otherIncomes: true,
      otherExpenses: true,
    },
    orderBy: { date: "asc" },
  });

  const daily = ops.map((op) => {
    let cylinderRevenue = 0;
    for (const s of op.sales) cylinderRevenue += s.nsDomCount * s.cylinderType.sellingPrice;
    let connectionRevenue = 0;
    for (const c of op.connections) {
      connectionRevenue += c.cylDpr + c.deposit + c.refill + c.sd + c.inspection + c.blueBook;
    }
    let totalExpense = 0;
    for (const e of op.expenses) totalExpense += e.amount;
    for (const o of op.otherExpenses) totalExpense += o.amount;
    let otherIncomeTotal = 0;
    for (const o of op.otherIncomes) otherIncomeTotal += o.amount;
    const totalIncome = cylinderRevenue + connectionRevenue + otherIncomeTotal;
    return {
      date: op.date,
      totalIncome,
      totalExpense,
      netIncome: totalIncome - totalExpense,
      cylinderRevenue,
      connectionRevenue,
    };
  });

  const totals = daily.reduce(
    (acc, d) => ({
      totalIncome: acc.totalIncome + d.totalIncome,
      totalExpense: acc.totalExpense + d.totalExpense,
      netIncome: acc.netIncome + d.netIncome,
      cylinderRevenue: acc.cylinderRevenue + d.cylinderRevenue,
      connectionRevenue: acc.connectionRevenue + d.connectionRevenue,
    }),
    { totalIncome: 0, totalExpense: 0, netIncome: 0, cylinderRevenue: 0, connectionRevenue: 0 }
  );

  return NextResponse.json({ month: monthStr, totals, daily });
}
