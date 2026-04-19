import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const heads = await prisma.expenseHead.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json(heads);
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    if (data.id) {
      const updated = await prisma.expenseHead.update({
        where: { id: data.id },
        data: {
          name: data.name,
          active: data.active ?? true,
          sortOrder: data.sortOrder ?? 0,
        },
      });
      return NextResponse.json(updated);
    }
    const maxOrder = await prisma.expenseHead.aggregate({ _max: { sortOrder: true } });
    const eh = await prisma.expenseHead.create({
      data: { name: data.name, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
    });
    return NextResponse.json(eh, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to save expense head" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const count = await prisma.dailyExpense.count({ where: { expenseHeadId: id } });
    if (count > 0) {
      await prisma.expenseHead.update({ where: { id }, data: { active: false } });
      return NextResponse.json({ deactivated: true });
    }
    await prisma.expenseHead.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
