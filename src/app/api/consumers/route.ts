import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseDateOrNull(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const active = request.nextUrl.searchParams.get("active");
  const area = request.nextUrl.searchParams.get("area")?.trim();

  const where: Record<string, unknown> = {};
  if (active !== null && active !== undefined) where.active = active !== "false";
  if (area) where.area = { equals: area, mode: "insensitive" };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { consumerNumber: { contains: q, mode: "insensitive" } },
      { bpclId: { contains: q, mode: "insensitive" } },
      { address: { contains: q, mode: "insensitive" } },
    ];
  }

  const consumers = await prisma.consumer.findMany({
    where,
    include: {
      cylinderType: { select: { id: true, name: true, sellingPrice: true } },
      refills: {
        orderBy: { date: "desc" },
        take: 1,
        select: { date: true, amount: true, paymentMode: true },
      },
      _count: { select: { refills: true } },
    },
    orderBy: { name: "asc" },
  });

  // Enrich with daysSinceLastRefill
  const enriched = consumers.map((c) => {
    const lastRefill = c.refills[0]?.date ? new Date(c.refills[0].date) : null;
    const daysSince = lastRefill
      ? Math.floor((Date.now() - lastRefill.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    return {
      ...c,
      lastRefillDate: lastRefill,
      daysSinceLastRefill: daysSince,
      refillCount: c._count.refills,
    };
  });

  return NextResponse.json(enriched);
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    const payload = {
      consumerNumber: data.consumerNumber?.trim() || null,
      bpclId: data.bpclId?.trim() || null,
      name: data.name?.trim(),
      phone: data.phone?.trim() || "",
      address: data.address?.trim() || "",
      area: data.area?.trim() || "",
      cylinderTypeId: data.cylinderTypeId || null,
      connectionDate: parseDateOrNull(data.connectionDate),
      depositPaid: Number(data.depositPaid) || 0,
      active: data.active ?? true,
      note: data.note?.trim() || "",
    };

    if (!payload.name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (data.id) {
      const updated = await prisma.consumer.update({
        where: { id: data.id },
        data: payload,
      });
      return NextResponse.json(updated);
    }

    const c = await prisma.consumer.create({ data: payload });
    return NextResponse.json(c, { status: 201 });
  } catch (e: unknown) {
    console.error("consumer save error:", e);
    const message = e instanceof Error && "code" in e && (e as { code: string }).code === "P2002"
      ? "Consumer number already exists"
      : "Failed to save consumer";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const count = await prisma.consumerRefill.count({ where: { consumerId: id } });
    if (count > 0) {
      await prisma.consumer.update({ where: { id }, data: { active: false } });
      return NextResponse.json({ deactivated: true });
    }
    await prisma.consumer.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
