import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const month = Number(request.nextUrl.searchParams.get("month"));
  const year = Number(request.nextUrl.searchParams.get("year"));

  if (!month || !year) {
    return NextResponse.json(
      { error: "month and year required" },
      { status: 400 }
    );
  }

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const deliveries = await prisma.dailyDelivery.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      employee: { type: "delivery", active: true },
    },
    include: {
      employee: { select: { id: true, name: true } },
      cylinderType: { select: { id: true, name: true, price: true } },
    },
    orderBy: { date: "asc" },
  });

  return NextResponse.json(deliveries);
}

export async function POST(request: NextRequest) {
  try {
    const entries: {
      employeeId: string;
      date: string;
      cylinderTypeId: string;
      count: number;
      otpCount: number;
    }[] = await request.json();

    const results = [];
    for (const entry of entries) {
      const dateObj = new Date(entry.date + "T00:00:00Z");
      const result = await prisma.dailyDelivery.upsert({
        where: {
          employeeId_date_cylinderTypeId: {
            employeeId: entry.employeeId,
            date: dateObj,
            cylinderTypeId: entry.cylinderTypeId,
          },
        },
        update: {
          count: entry.count,
          otpCount: entry.otpCount,
        },
        create: {
          employeeId: entry.employeeId,
          date: dateObj,
          cylinderTypeId: entry.cylinderTypeId,
          count: entry.count,
          otpCount: entry.otpCount,
        },
      });
      results.push(result);
    }

    return NextResponse.json({ saved: results.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to save deliveries" },
      { status: 500 }
    );
  }
}
