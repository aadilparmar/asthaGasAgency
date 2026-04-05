import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { updates } = await request.json();

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "updates array required" },
        { status: 400 }
      );
    }

    const results = await Promise.all(
      updates.map(
        (u: { id: string; rate?: number; fixedSalary?: number }) =>
          prisma.employee.update({
            where: { id: u.id },
            data: {
              ...(u.rate !== undefined && { rate: Number(u.rate) }),
              ...(u.fixedSalary !== undefined && {
                fixedSalary: Number(u.fixedSalary),
              }),
            },
          })
      )
    );

    return NextResponse.json({ updated: results.length });
  } catch {
    return NextResponse.json(
      { error: "Failed to update rates" },
      { status: 500 }
    );
  }
}
