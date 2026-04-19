import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseDate(s: string): Date {
  return new Date(s.includes("T") ? s : s + "T00:00:00.000Z");
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const refills = await prisma.consumerRefill.findMany({
    where: { consumerId: id },
    include: {
      cylinderType: { select: { id: true, name: true } },
      employee: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(refills);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await request.json();
    if (!data.cylinderTypeId) return NextResponse.json({ error: "cylinderTypeId required" }, { status: 400 });
    if (!data.date) return NextResponse.json({ error: "date required" }, { status: 400 });

    const payload = {
      consumerId: id,
      date: parseDate(data.date),
      cylinderTypeId: data.cylinderTypeId,
      paymentMode: data.paymentMode || "cash",
      amount: Number(data.amount) || 0,
      employeeId: data.employeeId || null,
      note: data.note?.trim() || "",
    };

    if (data.refillId) {
      const updated = await prisma.consumerRefill.update({
        where: { id: data.refillId },
        data: payload,
      });
      return NextResponse.json(updated);
    }

    // Optional: also record a stock transaction if asked
    const refill = await prisma.consumerRefill.create({ data: payload });

    if (data.recordStock) {
      await prisma.cylinderStockTransaction.create({
        data: {
          date: payload.date,
          cylinderTypeId: payload.cylinderTypeId,
          type: "delivery",
          fullDelta: -1,
          emptyDelta: data.emptyReturned === false ? 0 : 1,
          consumerId: id,
          note: `Refill delivery to consumer (refill ${refill.id})`,
        },
      });
    }

    return NextResponse.json(refill, { status: 201 });
  } catch (e) {
    console.error("refill save error:", e);
    return NextResponse.json({ error: "Failed to save refill" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const refillId = request.nextUrl.searchParams.get("refillId");
  if (!refillId) return NextResponse.json({ error: "refillId required" }, { status: 400 });
  try {
    await prisma.consumerRefill.delete({ where: { id: refillId } });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete refill" }, { status: 500 });
  }
}
