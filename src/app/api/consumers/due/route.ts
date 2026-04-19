import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Returns active consumers whose most recent refill is older than `threshold` days
// (or who have never refilled).
export async function GET(request: NextRequest) {
  const threshold = Number(request.nextUrl.searchParams.get("days")) || 25;

  const consumers = await prisma.consumer.findMany({
    where: { active: true },
    include: {
      cylinderType: { select: { id: true, name: true } },
      refills: {
        orderBy: { date: "desc" },
        take: 1,
        select: { date: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const cutoff = Date.now() - threshold * 24 * 60 * 60 * 1000;

  const due = consumers
    .map((c) => {
      const lastRefill = c.refills[0]?.date ? new Date(c.refills[0].date) : null;
      const daysSince = lastRefill
        ? Math.floor((Date.now() - lastRefill.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      return { ...c, lastRefillDate: lastRefill, daysSinceLastRefill: daysSince };
    })
    .filter((c) => c.lastRefillDate === null || c.lastRefillDate.getTime() < cutoff)
    // Sort longest-overdue first; null refill date = infinite days = first
    .sort((a, b) => {
      if (a.daysSinceLastRefill === null && b.daysSinceLastRefill === null) return 0;
      if (a.daysSinceLastRefill === null) return -1;
      if (b.daysSinceLastRefill === null) return 1;
      return b.daysSinceLastRefill - a.daysSinceLastRefill;
    });

  return NextResponse.json({ threshold, count: due.length, consumers: due });
}
