import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const types = await prisma.cylinderType.findMany({
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(types);
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    if (data.id) {
      // Update existing
      const updated = await prisma.cylinderType.update({
        where: { id: data.id },
        data: {
          name: data.name,
          price: Number(data.price) || 0,
          active: data.active ?? true,
          sortOrder: data.sortOrder ?? 0,
        },
      });
      return NextResponse.json(updated);
    }

    // Create new
    const maxOrder = await prisma.cylinderType.aggregate({ _max: { sortOrder: true } });
    const ct = await prisma.cylinderType.create({
      data: {
        name: data.name,
        price: Number(data.price) || 0,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });
    return NextResponse.json(ct, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to save cylinder type" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    // Check if any deliveries use this type
    const count = await prisma.dailyDelivery.count({ where: { cylinderTypeId: id } });
    if (count > 0) {
      // Soft delete - deactivate instead
      await prisma.cylinderType.update({ where: { id }, data: { active: false } });
      return NextResponse.json({ deactivated: true });
    }
    await prisma.cylinderType.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
