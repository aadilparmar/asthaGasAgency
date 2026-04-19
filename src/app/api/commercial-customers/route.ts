import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const active = request.nextUrl.searchParams.get("active");
  const where: Record<string, unknown> = {};
  if (active !== null) where.active = active !== "false";
  const customers = await prisma.commercialCustomer.findMany({ where, orderBy: { name: "asc" } });
  return NextResponse.json(customers);
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    if (data.id) {
      const updated = await prisma.commercialCustomer.update({
        where: { id: data.id },
        data: {
          name: data.name,
          productType: data.productType ?? "",
          active: data.active ?? true,
        },
      });
      return NextResponse.json(updated);
    }
    const c = await prisma.commercialCustomer.create({
      data: {
        name: data.name,
        productType: data.productType ?? "",
      },
    });
    return NextResponse.json(c, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to save customer" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const count = await prisma.commercialTransaction.count({ where: { customerId: id } });
    if (count > 0) {
      await prisma.commercialCustomer.update({ where: { id }, data: { active: false } });
      return NextResponse.json({ deactivated: true });
    }
    await prisma.commercialCustomer.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
