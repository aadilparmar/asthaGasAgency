const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

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

// Starter selling-price / OTP-rate / online-rate map (from WORK BOOK Sheet 1 row 2)
// Applied only if an existing CylinderType has name matching — and only fills fields that are currently 0.
const CYL_DEFAULTS = {
  "14.2 KG":      { sellingPrice: 921,  otpRate: 2,  onlineRate: 15 },
  "19 KG ND":     { sellingPrice: 1700, otpRate: 2,  onlineRate: 15 },
  "19 KG BMCG":   { sellingPrice: 1750, otpRate: 2,  onlineRate: 15 },
  "35 KG":        { sellingPrice: 2200, otpRate: 2,  onlineRate: 15 },
  "5 KG FTPL":    { sellingPrice: 490,  otpRate: 2,  onlineRate: 15 },
  "5 KG COM":     { sellingPrice: 1250, otpRate: 2,  onlineRate: 15 },
  "10 KG":        { sellingPrice: 650,  otpRate: 2,  onlineRate: 15 },
};

async function main() {
  let ctCount = 0, ehCount = 0, cylUpdates = 0;

  for (let i = 0; i < CONNECTION_TYPES.length; i++) {
    const name = CONNECTION_TYPES[i];
    const existing = await prisma.connectionType.findUnique({ where: { name } });
    if (!existing) {
      await prisma.connectionType.create({ data: { name, sortOrder: i } });
      ctCount++;
    }
  }

  for (let i = 0; i < EXPENSE_HEADS.length; i++) {
    const name = EXPENSE_HEADS[i];
    const existing = await prisma.expenseHead.findUnique({ where: { name } });
    if (!existing) {
      await prisma.expenseHead.create({ data: { name, sortOrder: i } });
      ehCount++;
    }
  }

  // Patch cylinder types with default selling prices / OTP rates when missing
  const cylTypes = await prisma.cylinderType.findMany();
  for (const ct of cylTypes) {
    const key = Object.keys(CYL_DEFAULTS).find(
      (k) => k.toLowerCase() === ct.name.toLowerCase()
    );
    if (!key) continue;
    const def = CYL_DEFAULTS[key];
    const updates = {};
    if ((ct.sellingPrice ?? 0) === 0 && def.sellingPrice) updates.sellingPrice = def.sellingPrice;
    if ((ct.otpRate ?? 0) === 0 && def.otpRate) updates.otpRate = def.otpRate;
    if ((ct.onlineRate ?? 0) === 0 && def.onlineRate) updates.onlineRate = def.onlineRate;
    if (Object.keys(updates).length > 0) {
      await prisma.cylinderType.update({ where: { id: ct.id }, data: updates });
      cylUpdates++;
    }
  }

  console.log(`Inserted: ${ctCount} connection types, ${ehCount} expense heads. Patched ${cylUpdates} cylinder types with default selling prices.`);

  const allCT = await prisma.cylinderType.findMany({ orderBy: { sortOrder: "asc" } });
  console.log("\nCurrent cylinder types:");
  for (const c of allCT) {
    console.log(`  - ${c.name}: price=₹${c.price}, sellingPrice=₹${c.sellingPrice}, otpRate=₹${c.otpRate}, onlineRate=₹${c.onlineRate}, active=${c.active}`);
  }

  const allConn = await prisma.connectionType.findMany({ orderBy: { sortOrder: "asc" } });
  console.log(`\nConnection types (${allConn.length}):`);
  for (const c of allConn) console.log(`  - ${c.name}`);

  const allEH = await prisma.expenseHead.findMany({ orderBy: { sortOrder: "asc" } });
  console.log(`\nExpense heads (${allEH.length}):`);
  for (const e of allEH) console.log(`  - ${e.name}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
