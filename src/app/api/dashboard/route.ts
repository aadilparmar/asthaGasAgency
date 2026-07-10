import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const month = Number(request.nextUrl.searchParams.get("month")) || new Date().getMonth() + 1;
  const year = Number(request.nextUrl.searchParams.get("year")) || new Date().getFullYear();

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const otpSetting = await prisma.appSetting.findUnique({ where: { key: "otp_bonus" } });
  const otpBonus = Number(otpSetting?.value) || 2;

  const [
    totalEmployees,
    deliveryStaff,
    officeStaff,
    todayDeliveries,
    totalLoans,
    totalDeductions,
    cylinderTypes,
    employees,
  ] = await Promise.all([
    prisma.employee.count({ where: { active: true } }),
    prisma.employee.count({ where: { active: true, type: "delivery" } }),
    prisma.employee.count({ where: { active: true, type: "office" } }),
    prisma.dailyDelivery.aggregate({
      where: {
        date: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lte: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      },
      _sum: { count: true, otpCount: true },
    }),
    prisma.loanTransaction.aggregate({ where: { month, year }, _sum: { amount: true } }),
    prisma.monthlyDeduction.aggregate({ where: { month, year }, _sum: { amount: true } }),
    prisma.cylinderType.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.employee.findMany({ select: { id: true, name: true } }),
  ]);

  const priceOf = new Map(cylinderTypes.map((c) => [c.id, c.price]));
  const nameOf = new Map(employees.map((e) => [e.id, e.name]));

  // One grouped scan of the month powers the trend, cylinder mix, OTP split & revenue.
  const grouped = await prisma.dailyDelivery.groupBy({
    by: ["date", "cylinderTypeId"],
    where: { date: { gte: startDate, lte: endDate } },
    _sum: { count: true, otpCount: true },
  });

  const dayMap = new Map<string, { date: string; count: number; otp: number; revenue: number }>();
  const typeAgg = new Map<string, { count: number; otp: number; revenue: number }>();
  let monthlyDeliveries = 0;
  let monthlyOtp = 0;
  let monthlyRevenue = 0;

  for (const g of grouped) {
    const count = g._sum.count || 0;
    const otp = g._sum.otpCount || 0;
    const price = priceOf.get(g.cylinderTypeId) || 0;
    const revenue = count * price + otp * otpBonus;

    const key = g.date.toISOString();
    const day = dayMap.get(key) || { date: key, count: 0, otp: 0, revenue: 0 };
    day.count += count; day.otp += otp; day.revenue += revenue;
    dayMap.set(key, day);

    const t = typeAgg.get(g.cylinderTypeId) || { count: 0, otp: 0, revenue: 0 };
    t.count += count; t.otp += otp; t.revenue += revenue;
    typeAgg.set(g.cylinderTypeId, t);

    monthlyDeliveries += count;
    monthlyOtp += otp;
    monthlyRevenue += revenue;
  }

  const dailyTrend = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  const cylinderMix = cylinderTypes
    .map((c) => ({
      name: c.name,
      count: typeAgg.get(c.id)?.count || 0,
      revenue: typeAgg.get(c.id)?.revenue || 0,
    }))
    .filter((c) => c.count > 0);

  const otpSplit = { otp: monthlyOtp, nonOtp: Math.max(0, monthlyDeliveries - monthlyOtp) };

  // Top performers (delivery staff) — by cylinders + earnings
  const perfGroups = await prisma.dailyDelivery.groupBy({
    by: ["employeeId"],
    where: { date: { gte: startDate, lte: endDate }, employee: { type: "delivery" } },
    _sum: { count: true },
    orderBy: { _sum: { count: "desc" } },
    take: 6,
  });
  const topPerformers = perfGroups.map((p) => ({
    name: nameOf.get(p.employeeId) || "Unknown",
    total: p._sum.count || 0,
  }));

  // Deduction breakdown for the month
  const dedGroups = await prisma.monthlyDeduction.groupBy({
    by: ["type"],
    where: { month, year },
    _sum: { amount: true },
  });
  const deductionBreakdown = dedGroups
    .map((d) => ({ type: d.type, amount: d._sum.amount || 0 }))
    .filter((d) => d.amount > 0);

  // Current outstanding loans per employee = lifetime loans − lifetime instalments
  const [loanByEmp, instByEmp] = await Promise.all([
    prisma.loanTransaction.groupBy({ by: ["employeeId"], _sum: { amount: true } }),
    prisma.monthlyDeduction.groupBy({
      by: ["employeeId"],
      where: { type: "loan_instalment" },
      _sum: { amount: true },
    }),
  ]);
  const instMap = new Map(instByEmp.map((i) => [i.employeeId, i._sum.amount || 0]));
  const allOutstanding = loanByEmp
    .map((l) => ({
      name: nameOf.get(l.employeeId) || "Unknown",
      amount: (l._sum.amount || 0) - (instMap.get(l.employeeId) || 0),
    }))
    .filter((l) => l.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const totalOutstanding = allOutstanding.reduce((a, l) => a + l.amount, 0);
  const borrowerCount = allOutstanding.length;
  const loanOutstanding = allOutstanding.slice(0, 6);

  return NextResponse.json({
    totalEmployees,
    deliveryStaff,
    officeStaff,
    monthlyDeliveries,
    todayDeliveries: todayDeliveries._sum.count || 0,
    todayOtp: todayDeliveries._sum.otpCount || 0,
    monthlyOtp,
    monthlyRevenue,
    monthlyLoans: totalLoans._sum.amount || 0,
    monthlyDeductions: totalDeductions._sum.amount || 0,
    otpBonus,
    dailyTrend: dailyTrend.map((d) => ({ date: d.date, count: d.count, otp: d.otp, revenue: d.revenue })),
    cylinderMix,
    otpSplit,
    deductionBreakdown,
    topPerformers,
    loanOutstanding,
    totalOutstanding,
    borrowerCount,
  });
}
