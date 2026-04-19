import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const month = Number(request.nextUrl.searchParams.get("month"));
  const year = Number(request.nextUrl.searchParams.get("year"));
  const type = request.nextUrl.searchParams.get("type");

  if (!month || !year) {
    return NextResponse.json({ error: "month and year required" }, { status: 400 });
  }

  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));

  const empWhere: Record<string, unknown> = { active: true };
  if (type) empWhere.type = type;

  // ─────────────────────────────────────────────────────────────
  // ALL DATA IN 5 PARALLEL QUERIES — no N+1 loop
  // ─────────────────────────────────────────────────────────────
  const [
    employees,
    salesThisMonth,
    allLoans,
    allDeductions,
    otpSetting,
  ] = await Promise.all([
    prisma.employee.findMany({ where: empWhere, orderBy: { name: "asc" } }),
    prisma.cylinderSale.findMany({
      where: { dailyOp: { date: { gte: startDate, lte: endDate } } },
      select: {
        employeeId: true,
        nsDomCount: true,
        otpCount: true,
        cylinderType: { select: { price: true } },
      },
    }),
    prisma.loanTransaction.findMany({
      select: { employeeId: true, amount: true, month: true, year: true },
    }),
    prisma.monthlyDeduction.findMany({
      select: { employeeId: true, amount: true, month: true, year: true, type: true },
    }),
    prisma.appSetting.findUnique({ where: { key: "otp_bonus" } }),
  ]);

  const otpBonus = Number(otpSetting?.value) || 2;

  // ─────────────────────────────────────────────────────────────
  // BUCKET IN MEMORY
  // ─────────────────────────────────────────────────────────────

  // Sales by employee
  const salesBy = new Map<string, { deliveries: number; otp: number; gross: number }>();
  for (const s of salesThisMonth) {
    if (!salesBy.has(s.employeeId)) salesBy.set(s.employeeId, { deliveries: 0, otp: 0, gross: 0 });
    const b = salesBy.get(s.employeeId)!;
    b.deliveries += s.nsDomCount;
    b.otp += s.otpCount;
    b.gross += s.nsDomCount * s.cylinderType.price + s.otpCount * otpBonus;
  }

  // Loans bucketed per employee as {total, prior, current}
  const loansBy = new Map<string, { total: number; prior: number; current: number }>();
  for (const l of allLoans) {
    if (!loansBy.has(l.employeeId)) loansBy.set(l.employeeId, { total: 0, prior: 0, current: 0 });
    const b = loansBy.get(l.employeeId)!;
    b.total += l.amount;
    const isPrior = l.year < year || (l.year === year && l.month < month);
    const isCurrent = l.year === year && l.month === month;
    if (isPrior) b.prior += l.amount;
    if (isCurrent) b.current += l.amount;
  }

  // Deductions: bucketed per employee as {thisMonth: Record<type, amount>, priorInstalments}
  const deductBy = new Map<string, { thisMonth: Record<string, number>; priorInstalments: number }>();
  for (const d of allDeductions) {
    if (!deductBy.has(d.employeeId)) deductBy.set(d.employeeId, { thisMonth: {}, priorInstalments: 0 });
    const b = deductBy.get(d.employeeId)!;
    const isCurrent = d.year === year && d.month === month;
    const isPrior = d.year < year || (d.year === year && d.month < month);
    if (isCurrent) {
      b.thisMonth[d.type] = (b.thisMonth[d.type] || 0) + d.amount;
    } else if (isPrior && d.type === "loan_instalment") {
      b.priorInstalments += d.amount;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // BUILD PER-EMPLOYEE RESULT
  // ─────────────────────────────────────────────────────────────
  const salaryData = employees.map((emp) => {
    let totalDeliveries = 0;
    let totalOtpCount = 0;
    let grossSalary = 0;

    if (emp.type === "delivery") {
      const s = salesBy.get(emp.id);
      if (s) {
        totalDeliveries = s.deliveries;
        totalOtpCount = s.otp;
        grossSalary = s.gross;
      }
    } else {
      grossSalary = emp.fixedSalary;
    }

    const loans = loansBy.get(emp.id) || { total: 0, prior: 0, current: 0 };
    const deducts = deductBy.get(emp.id) || { thisMonth: {}, priorInstalments: 0 };

    const openingLoan = loans.prior - deducts.priorInstalments;
    const additionalLoan = loans.current;
    const netLoan = openingLoan + additionalLoan;

    const deductionMap = deducts.thisMonth;
    const totalDeductions = Object.values(deductionMap).reduce((s, v) => s + v, 0);
    const loanInstalment = deductionMap["loan_instalment"] || 0;
    const loanCarryForward = netLoan - loanInstalment;
    const netPayable = grossSalary - totalDeductions;

    return {
      employee: emp,
      totalDeliveries,
      totalOtpCount,
      grossSalary,
      openingLoan,
      additionalLoan,
      netLoan,
      deductions: deductionMap,
      totalDeductions,
      netPayable,
      loanCarryForward,
      totalLoansEver: loans.total,
    };
  });

  const totals = salaryData.reduce(
    (acc, s) => ({
      totalDeliveries: acc.totalDeliveries + s.totalDeliveries,
      totalOtpCount: acc.totalOtpCount + s.totalOtpCount,
      grossSalary: acc.grossSalary + s.grossSalary,
      totalDeductions: acc.totalDeductions + s.totalDeductions,
      netPayable: acc.netPayable + s.netPayable,
      openingLoan: acc.openingLoan + s.openingLoan,
      additionalLoan: acc.additionalLoan + s.additionalLoan,
      loanCarryForward: acc.loanCarryForward + s.loanCarryForward,
    }),
    {
      totalDeliveries: 0, totalOtpCount: 0, grossSalary: 0,
      totalDeductions: 0, netPayable: 0, openingLoan: 0,
      additionalLoan: 0, loanCarryForward: 0,
    },
  );

  return NextResponse.json({ employees: salaryData, totals, otpBonus });
}
