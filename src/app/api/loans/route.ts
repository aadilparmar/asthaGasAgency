import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const employeeId = request.nextUrl.searchParams.get("employeeId");
  const month = Number(request.nextUrl.searchParams.get("month"));
  const year = Number(request.nextUrl.searchParams.get("year"));

  const where: Record<string, unknown> = {};
  if (employeeId) where.employeeId = employeeId;
  if (month && year) {
    where.month = month;
    where.year = year;
  }

  const loans = await prisma.loanTransaction.findMany({
    where,
    include: { employee: { select: { id: true, name: true, type: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(loans);
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const loan = await prisma.loanTransaction.create({
      data: {
        employeeId: data.employeeId,
        amount: Number(data.amount),
        month: Number(data.month),
        year: Number(data.year),
        note: data.note || "",
      },
    });
    return NextResponse.json(loan, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create loan" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    await prisma.loanTransaction.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete loan" },
      { status: 500 }
    );
  }
}
