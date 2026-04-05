import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type");
  const active = request.nextUrl.searchParams.get("active");

  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (active !== null) where.active = active !== "false";

  const employees = await prisma.employee.findMany({
    where,
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(employees);
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const employee = await prisma.employee.create({
      data: {
        name: data.name.toUpperCase(),
        type: data.type,
        rate: data.type === "delivery" ? Number(data.rate) || 0 : 0,
        fixedSalary: data.type === "office" ? Number(data.fixedSalary) || 0 : 0,
      },
    });
    return NextResponse.json(employee, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create employee" },
      { status: 500 }
    );
  }
}
