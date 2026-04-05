import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const month = Number(request.nextUrl.searchParams.get("month"));
  const year = Number(request.nextUrl.searchParams.get("year"));
  const type = request.nextUrl.searchParams.get("type");

  if (!month || !year) {
    return NextResponse.json(
      { error: "month and year required" },
      { status: 400 }
    );
  }

  const where: Record<string, unknown> = { active: true };
  if (type) where.type = type;

  const employees = await prisma.employee.findMany({ where, orderBy: { name: "asc" } });

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const salaryData = await Promise.all(
    employees.map(async (emp) => {
      // Total deliveries this month
      const deliveries = await prisma.dailyDelivery.aggregate({
        where: {
          employeeId: emp.id,
          date: { gte: startDate, lte: endDate },
        },
        _sum: { count: true },
      });
      const totalDeliveries = deliveries._sum.count || 0;

      // Gross salary
      const grossSalary =
        emp.type === "delivery"
          ? totalDeliveries * emp.rate
          : emp.fixedSalary;

      // All loans ever given to this employee
      const totalLoansEver = await prisma.loanTransaction.aggregate({
        where: { employeeId: emp.id },
        _sum: { amount: true },
      });

      // Total loan repayments before this month
      const priorRepayments = await prisma.monthlyDeduction.aggregate({
        where: {
          employeeId: emp.id,
          type: "loan_instalment",
          OR: [
            { year: { lt: year } },
            { year, month: { lt: month } },
          ],
        },
        _sum: { amount: true },
      });

      // Loans given before this month
      const priorLoans = await prisma.loanTransaction.aggregate({
        where: {
          employeeId: emp.id,
          OR: [
            { year: { lt: year } },
            { year, month: { lt: month } },
          ],
        },
        _sum: { amount: true },
      });

      // Loans given this month
      const currentMonthLoans = await prisma.loanTransaction.aggregate({
        where: { employeeId: emp.id, month, year },
        _sum: { amount: true },
      });

      const openingLoan =
        (priorLoans._sum.amount || 0) - (priorRepayments._sum.amount || 0);
      const additionalLoan = currentMonthLoans._sum.amount || 0;
      const netLoan = openingLoan + additionalLoan;

      // Deductions this month
      const deductions = await prisma.monthlyDeduction.findMany({
        where: { employeeId: emp.id, month, year },
      });

      const deductionMap: Record<string, number> = {};
      let totalDeductions = 0;
      for (const d of deductions) {
        deductionMap[d.type] = d.amount;
        totalDeductions += d.amount;
      }

      const loanInstalment = deductionMap["loan_instalment"] || 0;
      const loanCarryForward = netLoan - loanInstalment;
      const netPayable = grossSalary - totalDeductions;

      return {
        employee: emp,
        totalDeliveries,
        rate: emp.type === "delivery" ? emp.rate : 0,
        grossSalary,
        openingLoan,
        additionalLoan,
        netLoan,
        deductions: deductionMap,
        totalDeductions,
        netPayable,
        loanCarryForward,
        totalLoansEver: totalLoansEver._sum.amount || 0,
      };
    })
  );

  const totals = salaryData.reduce(
    (acc, s) => ({
      totalDeliveries: acc.totalDeliveries + s.totalDeliveries,
      grossSalary: acc.grossSalary + s.grossSalary,
      totalDeductions: acc.totalDeductions + s.totalDeductions,
      netPayable: acc.netPayable + s.netPayable,
      openingLoan: acc.openingLoan + s.openingLoan,
      additionalLoan: acc.additionalLoan + s.additionalLoan,
      loanCarryForward: acc.loanCarryForward + s.loanCarryForward,
    }),
    {
      totalDeliveries: 0,
      grossSalary: 0,
      totalDeductions: 0,
      netPayable: 0,
      openingLoan: 0,
      additionalLoan: 0,
      loanCarryForward: 0,
    }
  );

  return NextResponse.json({ employees: salaryData, totals });
}
