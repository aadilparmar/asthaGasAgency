import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const types = await prisma.connectionType.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json(types);
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    if (data.id) {
      const updated = await prisma.connectionType.update({
        where: { id: data.id },
        data: {
          name: data.name,
          active: data.active ?? true,
          sortOrder: data.sortOrder ?? 0,
        },
      });
      return NextResponse.json(updated);
    }
    const maxOrder = await prisma.connectionType.aggregate({ _max: { sortOrder: true } });
    const ct = await prisma.connectionType.create({
      data: { name: data.name, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
    });
    return NextResponse.json(ct, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to save connection type" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const count = await prisma.connectionSale.count({ where: { connectionTypeId: id } });
    if (count > 0) {
      await prisma.connectionType.update({ where: { id }, data: { active: false } });
      return NextResponse.json({ deactivated: true });
    }
    await prisma.connectionType.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
