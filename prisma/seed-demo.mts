/**
 * Astha Gas Agency — 45-day realistic demo data generator.
 *
 * Window: 2026-05-27 → 2026-07-10 (inclusive) = 45 days
 *   • tail of May (27–31)
 *   • FULL June  (1–30)  ← salary showcase month
 *   • live July  (1–10)  ← current month "in progress" up to today (2026-07-10)
 *
 * Populates the three tables the current (reverted) app reads:
 *   DailyDelivery, LoanTransaction, MonthlyDeduction
 * using the REAL employee / cylinder-type ids already in the DB.
 *
 * Deterministic (seeded PRNG) → re-running produces identical numbers.
 * Idempotent → clears the window / loan / deduction rows first, then re-inserts.
 * Also writes an importable prisma/demo-data.sql from the very same rows.
 *
 * Run:  npx tsx prisma/seed-demo.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// ── DB url from .env (no extra deps) ──────────────────────────────────────────
const envtxt = readFileSync(new URL("../.env", import.meta.url), "utf8");
const url = envtxt_match(envtxt);
function envtxt_match(t: string) {
  const m = t.match(/^DATABASE_URL="?([^"\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL not found in .env");
  return m[1];
}
const prisma = new PrismaClient({ datasources: { db: { url } } });

// ── deterministic PRNG (mulberry32) ───────────────────────────────────────────
let _s = 0x9e3779b9 ^ 0x1a2b3c4d;
function rnd() {
  _s |= 0; _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min; // int inclusive
const rf = (min: number, max: number) => rnd() * (max - min) + min;                  // float
const chance = (p: number) => rnd() < p;

// ── window ────────────────────────────────────────────────────────────────────
const START = Date.UTC(2026, 4, 27); // 2026-05-27
const END = Date.UTC(2026, 6, 10);   // 2026-07-10
const DAY = 86400000;
type DayInfo = { ds: string; date: Date; dow: number };
const DAYS: DayInfo[] = [];
for (let t = START; t <= END; t += DAY) {
  const d = new Date(t);
  const ds = d.toISOString().slice(0, 10);
  DAYS.push({ ds, date: d, dow: d.getUTCDay() });
}

const EID = "2026-05-27";                       // Eid al-Adha → Muslim staff off
const MONSOON = new Set(["2026-06-24", "2026-07-02"]); // heavy-rain washouts

// ── delivery profiles (keyed by the real employee names in the DB) ────────────
// dom = 14.2KG domestic, com = 19KG commercial, small = 5KG, bulk = 47.5KG.
// otp = fraction of the 14.2KG count that is OTP/DAC-authenticated.
type Prof = {
  role: "senior" | "domestic" | "helper" | "showroom" | "godown";
  faith?: "muslim" | "hindu";
  dom?: [number, number];
  com?: [number, number];
  small?: [number, number];
  bulk?: [number, number];
  otp?: [number, number];
  absence: number;           // per-working-day off probability
  leave?: Set<string>;       // hard days off (on a village trip etc.)
};
const PROFILES: Record<string, Prof> = {
  HANIF:          { role: "senior",   faith: "muslim", dom: [30, 45], com: [2, 6], otp: [0.60, 0.82], absence: 0.06 },
  SULTAN:         { role: "senior",   faith: "muslim", dom: [28, 42], com: [1, 5], bulk: [0, 1], otp: [0.58, 0.80], absence: 0.06 },
  JAKIR:          { role: "senior",   faith: "muslim", dom: [26, 40], com: [1, 4], otp: [0.55, 0.78], absence: 0.07 },
  "HIMAT MAKWAN": { role: "domestic", faith: "hindu",  dom: [24, 38], com: [0, 2], otp: [0.60, 0.80], absence: 0.07 },
  "JAKIR DODIYA": { role: "domestic", faith: "muslim", dom: [22, 36], com: [0, 2], otp: [0.55, 0.76], absence: 0.08 },
  MOIN:           { role: "domestic", faith: "muslim", dom: [22, 34], otp: [0.60, 0.80], absence: 0.07 },
  RAJU:           { role: "domestic", faith: "hindu",  dom: [20, 34], com: [0, 2], otp: [0.55, 0.75], absence: 0.08 },
  SALIM:          { role: "domestic", faith: "muslim", dom: [20, 32], otp: [0.60, 0.78], absence: 0.08 },
  HITESH:         { role: "helper",   faith: "hindu",  dom: [16, 28], otp: [0.50, 0.72], absence: 0.10 },
  BHAVESH:        { role: "helper",   faith: "hindu",  dom: [14, 26], otp: [0.50, 0.70], absence: 0.10,
                    leave: new Set(["2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13"]) },
  // sales channels, not people:
  SHOWROOM:       { role: "showroom", dom: [3, 8], small: [3, 10], com: [0, 2], otp: [0.20, 0.40], absence: 0.02 },
  GODOOUN:        { role: "godown",   com: [0, 4], bulk: [0, 2], small: [0, 2], absence: 0.30 },
};

// ── loan ledger (opening advances carried into the window + a fresh June loan) ─
// Modeled as single "opening balance" grants so NO month ever renders a negative
// net; the active repayment is a June loan_instalment deduction.
type Grant = { emp: string; amount: number; month: number; year: number; day: number; note: string };
const LOAN_GRANTS: Grant[] = [
  { emp: "HANIF",        amount: 17500, month: 2,  year: 2026, day: 12, note: "Advance - medical (family)" },
  { emp: "SULTAN",       amount: 11000, month: 3,  year: 2026, day: 5,  note: "Advance - house repair" },
  { emp: "MOIN",         amount: 8500,  month: 4,  year: 2026, day: 8,  note: "Advance - festival" },
  { emp: "RAJU",         amount: 6000,  month: 2,  year: 2026, day: 20, note: "Advance - two-wheeler down payment" },
  { emp: "SALIM",        amount: 12000, month: 5,  year: 2026, day: 6,  note: "Advance - family function" },
  { emp: "BHADRESH",     amount: 12000, month: 1,  year: 2026, day: 15, note: "Advance - children school fees" },
  { emp: "YUNUS",        amount: 15000, month: 12, year: 2025, day: 10, note: "Advance - medical" },
  // fresh advance taken WITHIN the window → shows as "additional loan" in June:
  { emp: "JAKIR DODIYA", amount: 6000,  month: 6,  year: 2026, day: 12, note: "Advance - festival (new)" },
];

// June repayment instalments (type loan_instalment)
const JUNE_INSTALMENTS: Record<string, number> = {
  HANIF: 2500, SULTAN: 2000, MOIN: 1500, RAJU: 1000, SALIM: 1500, BHADRESH: 2000, YUNUS: 3000,
};

// June other deductions
const JUNE_PF: Record<string, number> = { ATULBHAI: 1440, BHADRESH: 1098, YUNUS: 1560, PUJA: 900, VIDHI: 900 };
const JUNE_UPAD1: Record<string, number> = {
  HANIF: 2000, SULTAN: 2000, JAKIR: 1500, "HIMAT MAKWAN": 1500, MOIN: 1000, SALIM: 1500,
  ATULBHAI: 3000, YUNUS: 2000, BHADRESH: 1500, RAJU: 1000,
};
const JUNE_UPAD15: Record<string, number> = {
  HANIF: 1500, SULTAN: 1000, JAKIR: 1000, HITESH: 1000, BHAVESH: 1000, MOIN: 1000, PUJA: 1000,
};
const JUNE_UPAD_OTHER: Record<string, number> = { "JAKIR DODIYA": 1000, RAJU: 500 };

// July (current month, in progress) — 1st-of-month advances already taken
const JULY_UPAD1: Record<string, number> = { HANIF: 2000, SULTAN: 1500, ATULBHAI: 3000, YUNUS: 2000, MOIN: 1000 };

// ── id generators (stable → DB rows match the .sql file exactly) ──────────────
let _dd = 0, _ln = 0, _de = 0;
const ddId = () => `seed_dd_${String(++_dd).padStart(5, "0")}`;
const lnId = () => `seed_loan_${String(++_ln).padStart(4, "0")}`;
const deId = () => `seed_ded_${String(++_de).padStart(4, "0")}`;

type DDRow = { id: string; employeeId: string; date: Date; cylinderTypeId: string; count: number; otpCount: number };
type LNRow = { id: string; employeeId: string; amount: number; month: number; year: number; note: string; createdAt: Date };
type DERow = { id: string; employeeId: string; month: number; year: number; type: string; amount: number };

async function main() {
  // resolve real ids by name
  const emps = await prisma.employee.findMany({ select: { id: true, name: true, type: true } });
  const empId = new Map(emps.map((e) => [e.name, e.id]));
  const cyls = await prisma.cylinderType.findMany({ select: { id: true, name: true } });
  const cylId = new Map(cyls.map((c) => [c.name, c.id]));
  const DOM = cylId.get("14.2 KG")!, COM = cylId.get("19 KG")!, SMALL = cylId.get("5 KG")!, BULK = cylId.get("47.5 KG")!;

  const need = (name: string) => {
    const id = empId.get(name);
    if (!id) console.warn(`  ⚠ employee "${name}" not found in DB — skipping`);
    return id;
  };

  // ── build DailyDelivery rows ────────────────────────────────────────────────
  const dd: DDRow[] = [];
  const scale = (r: [number, number] | undefined, f: number) => (r ? Math.max(0, Math.round(ri(r[0], r[1]) * f)) : 0);

  for (const day of DAYS) {
    const isSunday = day.dow === 0;
    const isEid = day.ds === EID;
    const isMonsoon = MONSOON.has(day.ds);

    for (const [name, p] of Object.entries(PROFILES)) {
      const id = empId.get(name);
      if (!id) continue;
      if (p.leave?.has(day.ds)) continue; // on leave

      // day factor
      let f = 1;
      if (isSunday) f = 0.45;
      if (isMonsoon) f = 0.6;
      if (isEid) {
        if (p.faith === "muslim") continue;        // Muslim staff off for Eid
        if (p.role === "godown") continue;
        f = p.role === "showroom" ? 0.4 : 0.55;
      }
      // random absence (higher on Sundays)
      const absP = p.absence + (isSunday ? 0.15 : 0);
      if (!isEid && chance(absP)) continue;

      const dom = scale(p.dom, f);
      const com = scale(p.com, f);
      const small = scale(p.small, f);
      const bulk = scale(p.bulk, f);
      if (dom + com + small + bulk === 0) continue;

      const otp = dom > 0 && p.otp ? Math.min(dom, Math.round(dom * rf(p.otp[0], p.otp[1]))) : 0;

      if (dom > 0) dd.push({ id: ddId(), employeeId: id, date: day.date, cylinderTypeId: DOM, count: dom, otpCount: otp });
      if (com > 0) dd.push({ id: ddId(), employeeId: id, date: day.date, cylinderTypeId: COM, count: com, otpCount: 0 });
      if (small > 0) dd.push({ id: ddId(), employeeId: id, date: day.date, cylinderTypeId: SMALL, count: small, otpCount: 0 });
      if (bulk > 0) dd.push({ id: ddId(), employeeId: id, date: day.date, cylinderTypeId: BULK, count: bulk, otpCount: 0 });
    }
  }

  // ── build LoanTransaction rows ──────────────────────────────────────────────
  const ln: LNRow[] = [];
  for (const g of LOAN_GRANTS) {
    const id = need(g.emp); if (!id) continue;
    ln.push({ id: lnId(), employeeId: id, amount: g.amount, month: g.month, year: g.year, note: g.note,
              createdAt: new Date(Date.UTC(g.year, g.month - 1, g.day, 5, 30)) });
  }

  // ── build MonthlyDeduction rows ─────────────────────────────────────────────
  const de: DERow[] = [];
  const addDed = (map: Record<string, number>, month: number, year: number, type: string) => {
    for (const [name, amount] of Object.entries(map)) {
      const id = need(name); if (!id || amount <= 0) continue;
      de.push({ id: deId(), employeeId: id, month, year, type, amount });
    }
  };
  addDed(JUNE_INSTALMENTS, 6, 2026, "loan_instalment");
  addDed(JUNE_PF, 6, 2026, "pf");
  addDed(JUNE_UPAD1, 6, 2026, "upad_1");
  addDed(JUNE_UPAD15, 6, 2026, "upad_15");
  addDed(JUNE_UPAD_OTHER, 6, 2026, "upad_other");
  addDed(JULY_UPAD1, 7, 2026, "upad_1");

  // ── write to DB (idempotent) ────────────────────────────────────────────────
  console.log("Clearing window / loan / deduction rows …");
  const delDD = await prisma.dailyDelivery.deleteMany({ where: { date: { gte: new Date(START), lte: new Date(END) } } });
  const delLN = await prisma.loanTransaction.deleteMany({});
  const delDE = await prisma.monthlyDeduction.deleteMany({});
  console.log(`  deleted ${delDD.count} deliveries, ${delLN.count} loans, ${delDE.count} deductions`);

  // ensure otp_bonus exists
  await prisma.appSetting.upsert({ where: { key: "otp_bonus" }, update: {}, create: { key: "otp_bonus", value: "2" } });

  console.log(`Inserting ${dd.length} deliveries, ${ln.length} loans, ${de.length} deductions …`);
  for (let i = 0; i < dd.length; i += 500) await prisma.dailyDelivery.createMany({ data: dd.slice(i, i + 500) });
  await prisma.loanTransaction.createMany({ data: ln });
  await prisma.monthlyDeduction.createMany({ data: de });

  // ── emit portable SQL backup from the SAME rows ─────────────────────────────
  writeFileSync(new URL("./demo-data.sql", import.meta.url), buildSql(dd, ln, de), "utf8");
  console.log("Wrote prisma/demo-data.sql");

  // ── report ──────────────────────────────────────────────────────────────────
  const inMonth = (d: Date, m: number) => d.getUTCMonth() === m - 1;
  const sum = (rows: DDRow[]) => rows.reduce((a, r) => a + r.count, 0);
  const juneCyl = sum(dd.filter((r) => inMonth(r.date, 6)));
  const julyCyl = sum(dd.filter((r) => inMonth(r.date, 7)));
  const todayCyl = sum(dd.filter((r) => r.date.toISOString().slice(0, 10) === "2026-07-10"));
  console.log("\n──────── summary ────────");
  console.log(`45 days: ${DAYS[0].ds} → ${DAYS[DAYS.length - 1].ds}`);
  console.log(`June cylinders : ${juneCyl.toLocaleString("en-IN")}  (showcase month)`);
  console.log(`July cylinders : ${julyCyl.toLocaleString("en-IN")}  (1–10, in progress)`);
  console.log(`Today (Jul 10) : ${todayCyl.toLocaleString("en-IN")} cylinders`);
  console.log(`Loans          : ${ln.length}  (₹${ln.reduce((a, r) => a + r.amount, 0).toLocaleString("en-IN")} total)`);
  console.log(`Deductions     : ${de.length}`);
}

// ── SQL serializer ────────────────────────────────────────────────────────────
function sqlDate(d: Date) { return d.toISOString().slice(0, 19).replace("T", " ") + ".000"; }
function sqlStr(s: string) { return "'" + s.replace(/'/g, "''") + "'"; }
function buildSql(dd: DDRow[], ln: LNRow[], de: DERow[]) {
  const L: string[] = [];
  L.push("-- Astha Gas Agency — 45-day demo data (2026-05-27 → 2026-07-10)");
  L.push("-- Generated by prisma/seed-demo.mts. Uses the real employee / cylinder ids already in the DB.");
  L.push("-- Safe to re-import: clears the same window / loans / deductions first.");
  L.push("SET NAMES utf8mb4;");
  L.push("START TRANSACTION;");
  L.push("DELETE FROM `DailyDelivery` WHERE `date` >= '2026-05-27 00:00:00' AND `date` <= '2026-07-10 00:00:00';");
  L.push("DELETE FROM `LoanTransaction`;");
  L.push("DELETE FROM `MonthlyDeduction`;");
  const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  for (const c of chunk(dd, 200)) {
    L.push("INSERT INTO `DailyDelivery` (`id`,`employeeId`,`date`,`cylinderTypeId`,`count`,`otpCount`) VALUES");
    L.push(c.map((r) => `(${sqlStr(r.id)},${sqlStr(r.employeeId)},'${sqlDate(r.date)}',${sqlStr(r.cylinderTypeId)},${r.count},${r.otpCount})`).join(",\n") + ";");
  }
  if (ln.length) {
    L.push("INSERT INTO `LoanTransaction` (`id`,`employeeId`,`amount`,`month`,`year`,`note`,`createdAt`) VALUES");
    L.push(ln.map((r) => `(${sqlStr(r.id)},${sqlStr(r.employeeId)},${r.amount},${r.month},${r.year},${sqlStr(r.note)},'${sqlDate(r.createdAt)}')`).join(",\n") + ";");
  }
  if (de.length) {
    L.push("INSERT INTO `MonthlyDeduction` (`id`,`employeeId`,`month`,`year`,`type`,`amount`) VALUES");
    L.push(de.map((r) => `(${sqlStr(r.id)},${sqlStr(r.employeeId)},${r.month},${r.year},${sqlStr(r.type)},${r.amount})`).join(",\n") + ";");
  }
  L.push("COMMIT;");
  return L.join("\n") + "\n";
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
