import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Returns current stock (full + empty) per cylinder type + low-stock threshold alerts.
export async function GET() {
  const [cylinderTypes, agg] = await Promise.all([
    prisma.cylinderType.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.cylinderStockTransaction.groupBy({
      by: ["cylinderTypeId"],
      _sum: { fullDelta: true, emptyDelta: true },
      _count: { id: true },
    }),
  ]);

  const byType = new Map<string, { full: number; empty: number; txnCount: number }>();
  for (const a of agg) {
    byType.set(a.cylinderTypeId, {
      full: a._sum.fullDelta || 0,
      empty: a._sum.emptyDelta || 0,
      txnCount: a._count.id,
    });
  }

  const snapshot = cylinderTypes.map((ct) => {
    const row = byType.get(ct.id) || { full: 0, empty: 0, txnCount: 0 };
    return {
      cylinderType: ct,
      full: row.full,
      empty: row.empty,
      total: row.full + row.empty,
      txnCount: row.txnCount,
    };
  });

  const totals = snapshot.reduce(
    (acc, s) => ({
      full: acc.full + s.full,
      empty: acc.empty + s.empty,
      total: acc.total + s.total,
    }),
    { full: 0, empty: 0, total: 0 }
  );

  return NextResponse.json({ snapshot, totals });
}
