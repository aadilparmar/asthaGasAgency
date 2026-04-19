import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseDate(dateStr: string): Date {
  // Expect YYYY-MM-DD — anchor to UTC midnight so the unique constraint works reliably
  return new Date(dateStr + "T00:00:00.000Z");
}

export async function GET(request: NextRequest) {
  const dateStr = request.nextUrl.searchParams.get("date");
  if (!dateStr) return NextResponse.json({ error: "date required (YYYY-MM-DD)" }, { status: 400 });

  const date = parseDate(dateStr);

  const op = await prisma.dailyOperation.findUnique({
    where: { date },
    include: {
      sales: true,
      connections: true,
      expenses: true,
      denominations: { orderBy: { value: "desc" } },
      commercials: true,
      otherIncomes: true,
      otherExpenses: true,
    },
  });

  return NextResponse.json({ date: dateStr, op });
}

interface SaveBody {
  date: string;
  note?: string;
  sales?: {
    employeeId: string;
    cylinderTypeId: string;
    otpCount: number;
    onlineCount: number;
    nsDomCount: number;
  }[];
  connections?: {
    connectionTypeId: string;
    nos: number;
    cylDpr: number;
    deposit: number;
    refill: number;
    sd: number;
    inspection: number;
    blueBook: number;
  }[];
  expenses?: {
    expenseHeadId: string;
    particulars: string;
    amount: number;
  }[];
  denominations?: { value: number; count: number }[];
  commercials?: {
    customerId: string;
    productType: string;
    stockOut: number;
    stockIn: number;
    amount: number;
    received: number;
  }[];
  otherIncomes?: { label: string; amount: number }[];
  otherExpenses?: { label: string; amount: number }[];
}

export async function POST(request: NextRequest) {
  try {
    const body: SaveBody = await request.json();
    if (!body.date) {
      return NextResponse.json({ error: "date required" }, { status: 400 });
    }
    const date = parseDate(body.date);

    const op = await prisma.dailyOperation.upsert({
      where: { date },
      update: { note: body.note ?? "" },
      create: { date, note: body.note ?? "" },
    });

    // Nuke & re-insert collections — simplest way to keep server in sync with UI.
    // All grouped inside a single transaction for consistency.
    await prisma.$transaction([
      prisma.cylinderSale.deleteMany({ where: { dailyOpId: op.id } }),
      prisma.connectionSale.deleteMany({ where: { dailyOpId: op.id } }),
      prisma.dailyExpense.deleteMany({ where: { dailyOpId: op.id } }),
      prisma.cashDenomination.deleteMany({ where: { dailyOpId: op.id } }),
      prisma.commercialTransaction.deleteMany({ where: { dailyOpId: op.id } }),
      prisma.otherIncome.deleteMany({ where: { dailyOpId: op.id } }),
      prisma.otherExpense.deleteMany({ where: { dailyOpId: op.id } }),
    ]);

    // Insert sales (filter out fully-empty rows)
    const sales = (body.sales || []).filter(
      (s) => s.otpCount > 0 || s.onlineCount > 0 || s.nsDomCount > 0
    );
    if (sales.length > 0) {
      await prisma.cylinderSale.createMany({
        data: sales.map((s) => ({
          dailyOpId: op.id,
          employeeId: s.employeeId,
          cylinderTypeId: s.cylinderTypeId,
          otpCount: s.otpCount || 0,
          onlineCount: s.onlineCount || 0,
          nsDomCount: s.nsDomCount || 0,
        })),
      });
    }

    const connections = (body.connections || []).filter(
      (c) =>
        c.nos > 0 ||
        c.cylDpr > 0 ||
        c.deposit > 0 ||
        c.refill > 0 ||
        c.sd > 0 ||
        c.inspection > 0 ||
        c.blueBook > 0
    );
    if (connections.length > 0) {
      await prisma.connectionSale.createMany({
        data: connections.map((c) => ({ dailyOpId: op.id, ...c })),
      });
    }

    const expenses = (body.expenses || []).filter(
      (e) => e.amount > 0 || (e.particulars && e.particulars.trim())
    );
    if (expenses.length > 0) {
      await prisma.dailyExpense.createMany({
        data: expenses.map((e) => ({
          dailyOpId: op.id,
          expenseHeadId: e.expenseHeadId,
          particulars: e.particulars || "",
          amount: e.amount || 0,
        })),
      });
    }

    const denominations = (body.denominations || []).filter((d) => d.count > 0);
    if (denominations.length > 0) {
      await prisma.cashDenomination.createMany({
        data: denominations.map((d) => ({
          dailyOpId: op.id,
          value: d.value,
          count: d.count,
        })),
      });
    }

    const commercials = (body.commercials || []).filter(
      (c) => c.stockOut > 0 || c.stockIn > 0 || c.amount > 0 || c.received > 0
    );
    if (commercials.length > 0) {
      await prisma.commercialTransaction.createMany({
        data: commercials.map((c) => ({
          dailyOpId: op.id,
          customerId: c.customerId,
          productType: c.productType || "",
          stockOut: c.stockOut || 0,
          stockIn: c.stockIn || 0,
          amount: c.amount || 0,
          received: c.received || 0,
        })),
      });
    }

    const otherIncomes = (body.otherIncomes || []).filter(
      (o) => o.amount > 0 || (o.label && o.label.trim())
    );
    if (otherIncomes.length > 0) {
      await prisma.otherIncome.createMany({
        data: otherIncomes.map((o) => ({
          dailyOpId: op.id,
          label: o.label || "",
          amount: o.amount || 0,
        })),
      });
    }

    const otherExpenses = (body.otherExpenses || []).filter(
      (o) => o.amount > 0 || (o.label && o.label.trim())
    );
    if (otherExpenses.length > 0) {
      await prisma.otherExpense.createMany({
        data: otherExpenses.map((o) => ({
          dailyOpId: op.id,
          label: o.label || "",
          amount: o.amount || 0,
        })),
      });
    }

    return NextResponse.json({ ok: true, dailyOpId: op.id });
  } catch (e) {
    console.error("daily-ops POST error:", e);
    return NextResponse.json({ error: "Failed to save daily operation" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const dateStr = request.nextUrl.searchParams.get("date");
  if (!dateStr) return NextResponse.json({ error: "date required" }, { status: 400 });
  const date = parseDate(dateStr);
  try {
    await prisma.dailyOperation.delete({ where: { date } });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Not found or failed to delete" }, { status: 404 });
  }
}
