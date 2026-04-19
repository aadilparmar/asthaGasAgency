import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const consumer = await prisma.consumer.findUnique({
    where: { id },
    include: {
      cylinderType: true,
      refills: {
        include: { cylinderType: { select: { name: true } }, employee: { select: { name: true } } },
        orderBy: { date: "desc" },
      },
    },
  });
  if (!consumer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Avg refill interval (days) — from consecutive refill diffs
  const refillDates = consumer.refills.map((r) => new Date(r.date).getTime()).sort((a, b) => a - b);
  let avgInterval: number | null = null;
  if (refillDates.length >= 2) {
    let total = 0;
    for (let i = 1; i < refillDates.length; i++) {
      total += (refillDates[i] - refillDates[i - 1]) / (1000 * 60 * 60 * 24);
    }
    avgInterval = Math.round(total / (refillDates.length - 1));
  }
  const lastRefill = consumer.refills[0];
  const lastRefillDate = lastRefill ? new Date(lastRefill.date) : null;
  const daysSinceLastRefill = lastRefillDate
    ? Math.floor((Date.now() - lastRefillDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const totalSpent = consumer.refills.reduce((s, r) => s + r.amount, 0);

  return NextResponse.json({
    ...consumer,
    avgRefillIntervalDays: avgInterval,
    lastRefillDate,
    daysSinceLastRefill,
    totalRefills: consumer.refills.length,
    totalSpent,
  });
}
