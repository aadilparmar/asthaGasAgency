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

    const payload: {
      name: string;
      price: number;
      sellingPrice: number;
      otpRate: number;
      onlineRate: number;
      active: boolean;
      sortOrder: number;
    } = {
      name: data.name,
      price: Number(data.price) || 0,
      sellingPrice: Number(data.sellingPrice) || 0,
      otpRate: Number(data.otpRate) || 0,
      onlineRate: Number(data.onlineRate) || 0,
      active: data.active ?? true,
      sortOrder: data.sortOrder ?? 0,
    };

    if (data.id) {
      const updated = await prisma.cylinderType.update({
        where: { id: data.id },
        data: payload,
      });
      return NextResponse.json(updated);
    }

    const maxOrder = await prisma.cylinderType.aggregate({ _max: { sortOrder: true } });
    const ct = await prisma.cylinderType.create({
      data: { ...payload, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
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
    // Soft-delete (deactivate) if this cylinder type is used anywhere
    const [saleCount, refillCount, stockCount, consumerCount] = await Promise.all([
      prisma.cylinderSale.count({ where: { cylinderTypeId: id } }),
      prisma.consumerRefill.count({ where: { cylinderTypeId: id } }),
      prisma.cylinderStockTransaction.count({ where: { cylinderTypeId: id } }),
      prisma.consumer.count({ where: { cylinderTypeId: id } }),
    ]);
    if (saleCount > 0 || refillCount > 0 || stockCount > 0 || consumerCount > 0) {
      await prisma.cylinderType.update({ where: { id }, data: { active: false } });
      return NextResponse.json({ deactivated: true });
    }
    await prisma.cylinderType.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
