import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const month = Number(request.nextUrl.searchParams.get("month")) || new Date().getMonth() + 1;
  const year = Number(request.nextUrl.searchParams.get("year")) || new Date().getFullYear();

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const [
    totalEmployees,
    deliveryStaff,
    officeStaff,
    deliveriesAgg,
    todayDeliveries,
    totalLoans,
    totalDeductions,
  ] = await Promise.all([
    prisma.employee.count({ where: { active: true } }),
    prisma.employee.count({ where: { active: true, type: "delivery" } }),
    prisma.employee.count({ where: { active: true, type: "office" } }),
    prisma.dailyDelivery.aggregate({
      where: { date: { gte: startDate, lte: endDate } },
      _sum: { count: true },
    }),
    prisma.dailyDelivery.aggregate({
      where: {
        date: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lte: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      },
      _sum: { count: true },
    }),
    prisma.loanTransaction.aggregate({
      where: { month, year },
      _sum: { amount: true },
    }),
    prisma.monthlyDeduction.aggregate({
      where: { month, year },
      _sum: { amount: true },
    }),
  ]);

  // Daily delivery trend for the month
  const dailyTrend = await prisma.dailyDelivery.groupBy({
    by: ["date"],
    where: { date: { gte: startDate, lte: endDate } },
    _sum: { count: true },
    orderBy: { date: "asc" },
  });

  // Top performers
  const topPerformers = await prisma.dailyDelivery.groupBy({
    by: ["employeeId"],
    where: {
      date: { gte: startDate, lte: endDate },
      employee: { type: "delivery" },
    },
    _sum: { count: true },
    orderBy: { _sum: { count: "desc" } },
    take: 5,
  });

  const topPerformerDetails = await Promise.all(
    topPerformers.map(async (p) => {
      const emp = await prisma.employee.findUnique({
        where: { id: p.employeeId },
      });
      return { name: emp?.name || "Unknown", total: p._sum.count || 0 };
    })
  );

  return NextResponse.json({
    totalEmployees,
    deliveryStaff,
    officeStaff,
    monthlyDeliveries: deliveriesAgg._sum.count || 0,
    todayDeliveries: todayDeliveries._sum.count || 0,
    monthlyLoans: totalLoans._sum.amount || 0,
    monthlyDeductions: totalDeductions._sum.amount || 0,
    dailyTrend: dailyTrend.map((d) => ({
      date: d.date,
      count: d._sum.count || 0,
    })),
    topPerformers: topPerformerDetails,
  });
}
