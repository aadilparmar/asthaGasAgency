import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_TYPES = ["purchase", "delivery", "empty_return", "empty_dispatch", "adjustment"];

function parseDate(s: string): Date {
  return new Date(s.includes("T") ? s : s + "T00:00:00.000Z");
}

export async function GET(request: NextRequest) {
  const cylinderTypeId = request.nextUrl.searchParams.get("cylinderTypeId");
  const type = request.nextUrl.searchParams.get("type");
  const fromStr = request.nextUrl.searchParams.get("from");
  const toStr = request.nextUrl.searchParams.get("to");
  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit")) || 100, 500);

  const where: Record<string, unknown> = {};
  if (cylinderTypeId) where.cylinderTypeId = cylinderTypeId;
  if (type) where.type = type;
  if (fromStr || toStr) {
    const dateFilter: Record<string, Date> = {};
    if (fromStr) dateFilter.gte = parseDate(fromStr);
    if (toStr) {
      const to = parseDate(toStr);
      to.setUTCHours(23, 59, 59, 999);
      dateFilter.lte = to;
    }
    where.date = dateFilter;
  }

  const txns = await prisma.cylinderStockTransaction.findMany({
    where,
    include: {
      cylinderType: { select: { id: true, name: true } },
      consumer: { select: { id: true, name: true, consumerNumber: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  return NextResponse.json(txns);
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    if (!data.cylinderTypeId) {
      return NextResponse.json({ error: "cylinderTypeId required" }, { status: 400 });
    }
    if (!data.type || !VALID_TYPES.includes(data.type)) {
      return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(", ")}` }, { status: 400 });
    }
    if (!data.date) {
      return NextResponse.json({ error: "date required" }, { status: 400 });
    }

    const payload = {
      date: parseDate(data.date),
      cylinderTypeId: data.cylinderTypeId,
      type: data.type,
      fullDelta: Number(data.fullDelta) || 0,
      emptyDelta: Number(data.emptyDelta) || 0,
      consumerId: data.consumerId || null,
      note: data.note?.trim() || "",
    };

    if (data.id) {
      const updated = await prisma.cylinderStockTransaction.update({
        where: { id: data.id },
        data: payload,
      });
      return NextResponse.json(updated);
    }

    const txn = await prisma.cylinderStockTransaction.create({ data: payload });
    return NextResponse.json(txn, { status: 201 });
  } catch (e) {
    console.error("stock txn save error:", e);
    return NextResponse.json({ error: "Failed to save transaction" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await prisma.cylinderStockTransaction.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
