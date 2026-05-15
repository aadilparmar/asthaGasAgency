import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseJson } from "@/lib/validate";

const EmployeeCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(["delivery", "office"]),
  rate: z.coerce.number().min(0).max(10000).optional(),
  fixedSalary: z.coerce.number().min(0).max(1_000_000).optional(),
});

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type");
  const active = request.nextUrl.searchParams.get("active");

  const where: Record<string, unknown> = {};
  if (type === "delivery" || type === "office") where.type = type;
  if (active !== null) where.active = active !== "false";

  const employees = await prisma.employee.findMany({
    where,
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(employees);
}

export async function POST(request: NextRequest) {
  const parsed = await parseJson(request, EmployeeCreateSchema);
  if (!parsed.ok) return parsed.response;
  const data = parsed.data;
  try {
    const employee = await prisma.employee.create({
      data: {
        name: data.name.toUpperCase(),
        type: data.type,
        rate: data.type === "delivery" ? data.rate ?? 0 : 0,
        fixedSalary: data.type === "office" ? data.fixedSalary ?? 0 : 0,
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
