import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await request.json();

    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) {
      updateData.name = String(data.name).toUpperCase();
    }
    if (data.type !== undefined) {
      updateData.type = data.type;
    }
    if (data.rate !== undefined) {
      updateData.rate = Number(data.rate) || 0;
    }
    if (data.fixedSalary !== undefined) {
      updateData.fixedSalary = Number(data.fixedSalary) || 0;
    }
    if (data.active !== undefined) {
      updateData.active = data.active;
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: updateData,
    });
    return NextResponse.json(employee);
  } catch {
    return NextResponse.json(
      { error: "Failed to update employee" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.employee.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete employee" },
      { status: 500 }
    );
  }
}
