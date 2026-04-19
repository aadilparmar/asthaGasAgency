import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CONNECTION_TYPES = [
  "NDBC (2 Bottal)",
  "NSBC (1 Bottal)",
  "ODBC (1 + Add)",
  "BPCL TV (Astha)",
  "OMC TV (Other)",
  "Name Change",
  "19 KG (ND)",
  "19 KG (BMCG)",
  "35 KG",
  "5 KG (FTPL)",
  "5 KG (COM)",
];

const EXPENSE_HEADS = [
  "OFFICE",
  "REFRESHMENT",
  "VEHICLE REPAIRING",
  "PETROL / DIESEL",
  "WATER",
  "UPAD-SELF",
  "UPAD-OTHER",
  "SALE PROMOTION",
  "STATIONARY / PRINTING",
  "BPCL TV DEPOSIT",
  "OTHER ONLINE",
  "NEW CONNECTION ONLINE",
];

// Standard Indian currency denominations (500 first = largest → coins last)
const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 1];

export async function POST() {
  const results: Record<string, number> = { connectionTypes: 0, expenseHeads: 0 };

  // Seed ConnectionType
  for (let i = 0; i < CONNECTION_TYPES.length; i++) {
    const name = CONNECTION_TYPES[i];
    const existing = await prisma.connectionType.findUnique({ where: { name } });
    if (!existing) {
      await prisma.connectionType.create({ data: { name, sortOrder: i } });
      results.connectionTypes++;
    }
  }

  // Seed ExpenseHead
  for (let i = 0; i < EXPENSE_HEADS.length; i++) {
    const name = EXPENSE_HEADS[i];
    const existing = await prisma.expenseHead.findUnique({ where: { name } });
    if (!existing) {
      await prisma.expenseHead.create({ data: { name, sortOrder: i } });
      results.expenseHeads++;
    }
  }

  return NextResponse.json({ ok: true, inserted: results, denominations: DENOMINATIONS });
}

export async function GET() {
  // Status check — how many of each master already exist
  const [connectionTypes, expenseHeads, commercialCustomers, cylinderTypes] = await Promise.all([
    prisma.connectionType.count(),
    prisma.expenseHead.count(),
    prisma.commercialCustomer.count(),
    prisma.cylinderType.count(),
  ]);
  return NextResponse.json({
    connectionTypes,
    expenseHeads,
    commercialCustomers,
    cylinderTypes,
  });
}
