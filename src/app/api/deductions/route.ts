import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const month = Number(request.nextUrl.searchParams.get("month"));
  const year = Number(request.nextUrl.searchParams.get("year"));
  const employeeId = request.nextUrl.searchParams.get("employeeId");

  const type = request.nextUrl.searchParams.get("type");

  const where: Record<string, unknown> = {};
  if (month) where.month = month;
  if (year) where.year = year;
  if (employeeId) where.employeeId = employeeId;
  if (type) where.type = type;

  const deductions = await prisma.monthlyDeduction.findMany({
    where,
    include: { employee: { select: { id: true, name: true } } },
  });

  return NextResponse.json(deductions);
}

export async function POST(request: NextRequest) {
  try {
    const entries: {
      employeeId: string;
      month: number;
      year: number;
      type: string;
      amount: number;
    }[] = await request.json();

    const results = [];
    for (const entry of entries) {
      const result = await prisma.monthlyDeduction.upsert({
        where: {
          employeeId_month_year_type: {
            employeeId: entry.employeeId,
            month: entry.month,
            year: entry.year,
            type: entry.type,
          },
        },
        update: { amount: entry.amount },
        create: {
          employeeId: entry.employeeId,
          month: entry.month,
          year: entry.year,
          type: entry.type,
          amount: entry.amount,
        },
      });
      results.push(result);
    }

    return NextResponse.json({ saved: results.length });
  } catch {
    return NextResponse.json(
      { error: "Failed to save deductions" },
      { status: 500 }
    );
  }
}
