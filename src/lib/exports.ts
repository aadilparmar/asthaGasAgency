/**
 * Report export engine — PDF (jsPDF + autotable) and Excel (SheetJS).
 * Heavy libs are dynamically imported so they never load until an export
 * is clicked. make*() builders return the document (testable in Node);
 * export*() wrappers trigger the browser download.
 * PDFs use "Rs." because the built-in PDF fonts have no ₹ glyph.
 */
import type { jsPDF } from "jspdf";
import type * as XLSXType from "xlsx";
import { getMonthName, getFinancialYear } from "@/lib/utils";

// ── shared input shapes (mirror the API responses) ──────────────────────────
export interface SalaryRow {
  employee: { id: string; name: string; type: string; rate: number; fixedSalary: number };
  totalDeliveries: number;
  totalOtpCount: number;
  grossSalary: number;
  openingLoan: number;
  additionalLoan: number;
  netLoan: number;
  deductions: Record<string, number>;
  totalDeductions: number;
  netPayable: number;
  loanCarryForward: number;
}

export interface SalaryTotals {
  totalDeliveries: number;
  totalOtpCount: number;
  grossSalary: number;
  totalDeductions: number;
  netPayable: number;
  openingLoan: number;
  additionalLoan: number;
  loanCarryForward: number;
}

export interface RegisterRow {
  name: string;
  perType: Record<string, { count: number; otp: number }>; // keyed by cylinderType id
  total: number;
  otp: number;
  earnings: number;
  days: number;
}

export interface RegisterType { id: string; name: string; price: number }

export interface LoanTxn {
  id: string;
  amount: number;
  note: string;
  createdAt: string;
  employee: { name: string };
}

export interface AnalyticsData {
  monthlyDeliveries: number;
  monthlyOtp: number;
  monthlyRevenue: number;
  totalOutstanding: number;
  dailyTrend: { date: string; count: number; otp: number; revenue: number }[];
  cylinderMix: { name: string; count: number; revenue: number }[];
  otpSplit: { otp: number; nonOtp: number };
  deductionBreakdown: { type: string; amount: number }[];
  topPerformers: { name: string; total: number }[];
  loanOutstanding: { name: string; amount: number }[];
}

export const DED_LABELS: Record<string, string> = {
  pf: "PF",
  loan_instalment: "Loan Instalment",
  upad_1: "UPAD 1st",
  upad_15: "UPAD 15th",
  upad_other: "UPAD Other",
};
const DED_KEYS = Object.keys(DED_LABELS);

// ── helpers ──────────────────────────────────────────────────────────────────
const RS = (n: number) => "Rs. " + Math.round(n).toLocaleString("en-IN");
const NUM = (n: number) => n.toLocaleString("en-IN");

const SLATE_900: [number, number, number] = [15, 23, 42];
const SLATE_600: [number, number, number] = [71, 85, 105];
const SLATE_400: [number, number, number] = [148, 163, 184];
const SLATE_100: [number, number, number] = [241, 245, 249];
const EMERALD: [number, number, number] = [16, 185, 129];
const AMBER: [number, number, number] = [245, 158, 11];
const BLUE: [number, number, number] = [59, 130, 246];
const ROSE: [number, number, number] = [244, 63, 94];
const VIOLET: [number, number, number] = [139, 92, 246];

const MARGIN = 32;

async function pdfLibs() {
  const [{ jsPDF }, at] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  return { jsPDF, autoTable: at.default };
}

async function xlsxLib(): Promise<typeof XLSXType> {
  const m = await import("xlsx");
  return ((m as { default?: typeof XLSXType }).default ?? m) as typeof XLSXType;
}

function pageW(doc: jsPDF) { return doc.internal.pageSize.getWidth(); }
function pageH(doc: jsPDF) { return doc.internal.pageSize.getHeight(); }

/** Letterhead: agency identity left, report title right. Returns content start Y. */
function drawHeader(doc: jsPDF, title: string, monthLabel: string, fy: string): number {
  const w = pageW(doc);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...SLATE_900);
  doc.text("ASTHA GAS AGENCY", MARGIN, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_600);
  doc.text("Desainagar  ·  LPG Distribution  ·  Payroll Management System", MARGIN, 53);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...SLATE_900);
  doc.text(title, w - MARGIN, 38, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_600);
  doc.text(`${monthLabel}  ·  FY ${fy}`, w - MARGIN, 51, { align: "right" });

  doc.setDrawColor(...SLATE_900);
  doc.setLineWidth(1.2);
  doc.line(MARGIN, 62, w - MARGIN, 62);
  return 78;
}

/** Row of KPI boxes. Returns Y below the boxes. */
function drawKpis(doc: jsPDF, y: number, items: { label: string; value: string; color?: [number, number, number] }[]): number {
  const w = pageW(doc);
  const gap = 8;
  const boxW = (w - MARGIN * 2 - gap * (items.length - 1)) / items.length;
  const boxH = 40;
  items.forEach((it, i) => {
    const x = MARGIN + i * (boxW + gap);
    doc.setFillColor(...SLATE_100);
    doc.roundedRect(x, y, boxW, boxH, 3, 3, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(...SLATE_600);
    doc.text(it.label.toUpperCase(), x + 8, y + 13);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...(it.color ?? SLATE_900));
    doc.text(it.value, x + 8, y + 29);
  });
  return y + boxH + 14;
}

/** Horizontal bar block with title. Returns Y below the block. */
function drawHBars(
  doc: jsPDF, x: number, y: number, w: number,
  title: string,
  items: { label: string; value: number; text?: string }[],
  color: [number, number, number]
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_900);
  doc.text(title, x, y);
  y += 8;
  const max = Math.max(1, ...items.map((i) => i.value));
  const labelW = 92;
  const valueW = 62;
  const barW = w - labelW - valueW;
  const rowH = 15;
  items.forEach((it) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(...SLATE_600);
    doc.text(it.label.length > 20 ? it.label.slice(0, 19) + "…" : it.label, x, y + 8);
    doc.setFillColor(...SLATE_100);
    doc.rect(x + labelW, y + 2, barW, 7, "F");
    doc.setFillColor(...color);
    doc.rect(x + labelW, y + 2, Math.max(1.5, (it.value / max) * barW), 7, "F");
    doc.setTextColor(...SLATE_900);
    doc.text(it.text ?? NUM(it.value), x + labelW + barW + valueW, y + 8, { align: "right" });
    y += rowH;
  });
  return y + 8;
}

/** Column (vertical bar) chart for the daily trend. Returns Y below. */
function drawColumns(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  title: string,
  points: { label: string; value: number; highlight?: boolean }[]
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_900);
  doc.text(title, x, y);
  y += 8;
  const max = Math.max(1, ...points.map((p) => p.value));
  const gap = 2;
  const bw = points.length > 0 ? (w - gap * (points.length - 1)) / points.length : w;
  // baseline
  doc.setDrawColor(...SLATE_400);
  doc.setLineWidth(0.4);
  doc.line(x, y + h, x + w, y + h);
  points.forEach((p, i) => {
    const bh = Math.max(p.value > 0 ? 1.5 : 0, (p.value / max) * (h - 4));
    const bx = x + i * (bw + gap);
    doc.setFillColor(...(p.highlight ? AMBER : SLATE_600));
    if (bh > 0) doc.rect(bx, y + h - bh, bw, bh, "F");
    if (points.length <= 31 && (i === 0 || (i + 1) % 5 === 0)) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.8);
      doc.setTextColor(...SLATE_400);
      doc.text(p.label, bx + bw / 2, y + h + 8, { align: "center" });
    }
  });
  return y + h + 18;
}

/** Signature strip for register-style reports. */
function drawSignatures(doc: jsPDF): void {
  const w = pageW(doc);
  const h = pageH(doc);
  const y = h - 58;
  const labels = ["Prepared By", "Checked By", "Authorised Signatory"];
  const segW = (w - MARGIN * 2) / 3;
  labels.forEach((label, i) => {
    const cx = MARGIN + segW * i + segW / 2;
    doc.setDrawColor(...SLATE_400);
    doc.setLineWidth(0.6);
    doc.line(cx - 58, y, cx + 58, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(...SLATE_600);
    doc.text(label, cx, y + 11, { align: "center" });
  });
}

/** Page footer on every page: brand left, page numbers right. */
function drawFooters(doc: jsPDF): void {
  const n = doc.getNumberOfPages();
  const generated = new Date().toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const w = pageW(doc);
    const h = pageH(doc);
    doc.setDrawColor(...SLATE_400);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, h - 30, w - MARGIN, h - 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(...SLATE_400);
    doc.text(`Astha Gas Agency — generated ${generated}`, MARGIN, h - 20);
    doc.text(`Page ${i} of ${n}`, w - MARGIN, h - 20, { align: "right" });
  }
}

function finalY(doc: jsPDF, fallback: number): number {
  return (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? fallback;
}

// ═════════════════════════════ SALARY SHEET PDF ══════════════════════════════
export interface SalaryPdfInput {
  month: number; year: number;
  filter: "all" | "delivery" | "office";
  rows: SalaryRow[];
  otpBonus: number;
}

export async function makeSalaryPdf(input: SalaryPdfInput): Promise<{ doc: jsPDF; filename: string }> {
  const { jsPDF, autoTable } = await pdfLibs();
  const { month, year, filter, rows } = input;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const monthLabel = `${getMonthName(month)} ${year}`;
  const filterLabel = filter === "all" ? "All Staff" : filter === "delivery" ? "Delivery Staff" : "Office Staff";

  let y = drawHeader(doc, `Salary Report — ${filterLabel}`, monthLabel, getFinancialYear(month, year));

  const t = rows.reduce((a, r) => ({
    gross: a.gross + r.grossSalary, ded: a.ded + r.totalDeductions,
    net: a.net + r.netPayable, cf: a.cf + r.loanCarryForward,
    cyl: a.cyl + r.totalDeliveries, otp: a.otp + r.totalOtpCount,
  }), { gross: 0, ded: 0, net: 0, cf: 0, cyl: 0, otp: 0 });

  y = drawKpis(doc, y, [
    { label: "Gross Salary", value: RS(t.gross), color: BLUE },
    { label: "Total Deductions", value: RS(t.ded), color: ROSE },
    { label: "Net Payable", value: RS(t.net), color: EMERALD },
    { label: "Loan Carry Fwd", value: RS(t.cf), color: AMBER },
    { label: "Cylinders / OTP", value: `${NUM(t.cyl)} / ${NUM(t.otp)}` },
  ]);

  const showDelivery = filter !== "office";
  const head = [
    "#", "Employee", "Type",
    ...(showDelivery ? ["Cyl", "OTP"] : []),
    "Gross", "Loan Bal",
    ...DED_KEYS.map((k) => DED_LABELS[k]),
    "Total Ded", "Net Payable", "Loan C/F",
  ];
  const body = rows.map((r, i) => [
    i + 1, r.employee.name, r.employee.type === "delivery" ? "Delivery" : "Office",
    ...(showDelivery ? [r.employee.type === "delivery" ? NUM(r.totalDeliveries) : "—", r.employee.type === "delivery" ? NUM(r.totalOtpCount) : "—"] : []),
    RS(r.grossSalary), r.netLoan > 0 ? RS(r.netLoan) : "—",
    ...DED_KEYS.map((k) => (r.deductions[k] ? RS(r.deductions[k]) : "—")),
    RS(r.totalDeductions), RS(r.netPayable), r.loanCarryForward > 0 ? RS(r.loanCarryForward) : "—",
  ]);
  const foot = [[
    "", `TOTAL (${rows.length})`, "",
    ...(showDelivery ? [NUM(t.cyl), NUM(t.otp)] : []),
    RS(t.gross), "",
    ...DED_KEYS.map((k) => RS(rows.reduce((a, r) => a + (r.deductions[k] || 0), 0))),
    RS(t.ded), RS(t.net), RS(t.cf),
  ]];

  const numericFrom = 3;
  autoTable(doc, {
    head: [head], body, foot,
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: 40, bottom: 70 },
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 3, lineColor: SLATE_400, lineWidth: 0.3, textColor: SLATE_900 },
    headStyles: { fillColor: SLATE_900, textColor: 255, fontSize: 6.6, fontStyle: "bold" },
    footStyles: { fillColor: SLATE_100, textColor: SLATE_900, fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: [250, 250, 252] },
    columnStyles: Object.fromEntries(
      head.map((_, i) => [i, i >= numericFrom ? { halign: "right" as const } : {}])
    ),
  });

  // Top performers mini chart (space permitting)
  const afterTable = finalY(doc, y) + 22;
  const deliveryRows = rows.filter((r) => r.employee.type === "delivery" && r.totalDeliveries > 0);
  if (deliveryRows.length > 0 && afterTable < pageH(doc) - 200) {
    const top = [...deliveryRows].sort((a, b) => b.totalDeliveries - a.totalDeliveries).slice(0, 6);
    drawHBars(doc, MARGIN, afterTable, (pageW(doc) - MARGIN * 2) / 2 - 10,
      "Top Performers — Cylinders", top.map((r) => ({ label: r.employee.name, value: r.totalDeliveries })), EMERALD);
    drawHBars(doc, MARGIN + (pageW(doc) - MARGIN * 2) / 2 + 10, afterTable, (pageW(doc) - MARGIN * 2) / 2 - 10,
      "Top Earnings — Gross", [...deliveryRows].sort((a, b) => b.grossSalary - a.grossSalary).slice(0, 6)
        .map((r) => ({ label: r.employee.name, value: r.grossSalary, text: RS(r.grossSalary) })), BLUE);
  }

  drawSignatures(doc);
  drawFooters(doc);
  return { doc, filename: `Astha_Salary_${getMonthName(month)}_${year}.pdf` };
}

// ═══════════════════════════ DELIVERY REGISTER PDF ═══════════════════════════
export interface RegisterPdfInput {
  month: number; year: number;
  types: RegisterType[];
  rows: RegisterRow[];
  otpBonus: number;
}

export async function makeDeliveryRegisterPdf(input: RegisterPdfInput): Promise<{ doc: jsPDF; filename: string }> {
  const { jsPDF, autoTable } = await pdfLibs();
  const { month, year, types, rows } = input;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const monthLabel = `${getMonthName(month)} ${year}`;

  let y = drawHeader(doc, "Delivery Register", monthLabel, getFinancialYear(month, year));

  const t = rows.reduce((a, r) => ({ cyl: a.cyl + r.total, otp: a.otp + r.otp, earn: a.earn + r.earnings }), { cyl: 0, otp: 0, earn: 0 });
  y = drawKpis(doc, y, [
    { label: "Total Cylinders", value: NUM(t.cyl) },
    { label: "OTP Verified", value: `${NUM(t.otp)} (${t.cyl > 0 ? Math.round((t.otp / t.cyl) * 100) : 0}%)`, color: EMERALD },
    { label: "Delivery Payout", value: RS(t.earn), color: BLUE },
    { label: "Active Delivery Men", value: NUM(rows.length) },
  ]);

  const head = ["#", "Delivery Man", ...types.map((tp) => `${tp.name}\n@ ${RS(tp.price)}`), "Total Cyl", "OTP", "Days", "Earnings", "Avg/Day"];
  const body = rows.map((r, i) => [
    i + 1, r.name,
    ...types.map((tp) => {
      const c = r.perType[tp.id];
      return c && c.count > 0 ? `${NUM(c.count)}${c.otp > 0 ? ` (${NUM(c.otp)})` : ""}` : "—";
    }),
    NUM(r.total), NUM(r.otp), NUM(r.days), RS(r.earnings), r.days > 0 ? (r.total / r.days).toFixed(1) : "—",
  ]);
  const foot = [[
    "", `TOTAL (${rows.length})`,
    ...types.map((tp) => NUM(rows.reduce((a, r) => a + (r.perType[tp.id]?.count || 0), 0))),
    NUM(t.cyl), NUM(t.otp), "", RS(t.earn), "",
  ]];

  autoTable(doc, {
    head: [head], body, foot,
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: 40, bottom: 70 },
    theme: "grid",
    styles: { fontSize: 7.4, cellPadding: 3.5, lineColor: SLATE_400, lineWidth: 0.3, textColor: SLATE_900 },
    headStyles: { fillColor: SLATE_900, textColor: 255, fontSize: 6.8, fontStyle: "bold", halign: "center" },
    footStyles: { fillColor: SLATE_100, textColor: SLATE_900, fontStyle: "bold", fontSize: 7.4 },
    alternateRowStyles: { fillColor: [250, 250, 252] },
    columnStyles: Object.fromEntries(head.map((_, i) => [i, i >= 2 ? { halign: "right" as const } : {}])),
  });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.8);
  doc.setTextColor(...SLATE_600);
  doc.text("Cylinder columns show: total delivered (OTP-verified in brackets).", MARGIN, finalY(doc, y) + 14);

  drawSignatures(doc);
  drawFooters(doc);
  return { doc, filename: `Astha_DeliveryRegister_${getMonthName(month)}_${year}.pdf` };
}

// ═════════════════════════════ LOAN STATEMENT PDF ════════════════════════════
export interface LoanPdfInput {
  month: number; year: number;
  rows: SalaryRow[];       // only employees with loan activity
  txns: LoanTxn[];
}

export async function makeLoanStatementPdf(input: LoanPdfInput): Promise<{ doc: jsPDF; filename: string }> {
  const { jsPDF, autoTable } = await pdfLibs();
  const { month, year, rows, txns } = input;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const monthLabel = `${getMonthName(month)} ${year}`;

  let y = drawHeader(doc, "Loan & Advance Statement", monthLabel, getFinancialYear(month, year));

  const t = rows.reduce((a, r) => ({
    open: a.open + r.openingLoan, add: a.add + r.additionalLoan,
    inst: a.inst + (r.deductions.loan_instalment || 0), cf: a.cf + r.loanCarryForward,
  }), { open: 0, add: 0, inst: 0, cf: 0 });

  y = drawKpis(doc, y, [
    { label: "Opening Balance", value: RS(t.open) },
    { label: "New Loans", value: RS(t.add), color: AMBER },
    { label: "Instalments Recovered", value: RS(t.inst), color: EMERALD },
    { label: "Carry Forward", value: RS(t.cf), color: ROSE },
  ]);

  autoTable(doc, {
    head: [["#", "Employee", "Opening", "New Loan", "Net Loan", "Instalment", "Carry Fwd", "Status"]],
    body: rows.map((r, i) => [
      i + 1, r.employee.name,
      r.openingLoan > 0 ? RS(r.openingLoan) : "—",
      r.additionalLoan > 0 ? RS(r.additionalLoan) : "—",
      RS(r.netLoan),
      r.deductions.loan_instalment ? RS(r.deductions.loan_instalment) : "—",
      r.loanCarryForward > 0 ? RS(r.loanCarryForward) : "—",
      r.loanCarryForward <= 0 ? "CLEARED" : "ACTIVE",
    ]),
    foot: [["", `TOTAL (${rows.length})`, RS(t.open), RS(t.add), RS(t.open + t.add), RS(t.inst), RS(t.cf), ""]],
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: 40, bottom: 70 },
    theme: "grid",
    styles: { fontSize: 7.8, cellPadding: 4, lineColor: SLATE_400, lineWidth: 0.3, textColor: SLATE_900 },
    headStyles: { fillColor: SLATE_900, textColor: 255, fontSize: 7.2, fontStyle: "bold" },
    footStyles: { fillColor: SLATE_100, textColor: SLATE_900, fontStyle: "bold", fontSize: 7.8 },
    alternateRowStyles: { fillColor: [250, 250, 252] },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "center" } },
  });

  // transactions section
  let ty = finalY(doc, y) + 26;
  if (ty > pageH(doc) - 160) { doc.addPage(); ty = 50; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...SLATE_900);
  doc.text(`Loan Disbursements — ${monthLabel}`, MARGIN, ty);

  if (txns.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...SLATE_600);
    doc.text("No new loans disbursed this month.", MARGIN, ty + 16);
  } else {
    autoTable(doc, {
      head: [["Date", "Employee", "Amount", "Note"]],
      body: txns.map((x) => [
        new Date(x.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
        x.employee.name, RS(x.amount), x.note || "—",
      ]),
      startY: ty + 8,
      margin: { left: MARGIN, right: MARGIN, top: 40, bottom: 70 },
      theme: "grid",
      styles: { fontSize: 7.8, cellPadding: 4, lineColor: SLATE_400, lineWidth: 0.3, textColor: SLATE_900 },
      headStyles: { fillColor: SLATE_600, textColor: 255, fontSize: 7.2, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 250, 252] },
      columnStyles: { 2: { halign: "right" } },
    });
  }

  drawSignatures(doc);
  drawFooters(doc);
  return { doc, filename: `Astha_LoanStatement_${getMonthName(month)}_${year}.pdf` };
}

// ══════════════════════════ ANALYTICS SUMMARY PDF ════════════════════════════
export interface AnalyticsPdfInput {
  month: number; year: number;
  analytics: AnalyticsData;
  salaryTotals: SalaryTotals;
}

export async function makeAnalyticsPdf(input: AnalyticsPdfInput): Promise<{ doc: jsPDF; filename: string }> {
  const { jsPDF } = await pdfLibs();
  const { month, year, analytics: a, salaryTotals: st } = input;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const monthLabel = `${getMonthName(month)} ${year}`;
  const w = pageW(doc) - MARGIN * 2;

  let y = drawHeader(doc, "Monthly Analytics Summary", monthLabel, getFinancialYear(month, year));

  y = drawKpis(doc, y, [
    { label: "Cylinders", value: NUM(a.monthlyDeliveries) },
    { label: "OTP Rate", value: `${a.monthlyDeliveries > 0 ? Math.round((a.monthlyOtp / a.monthlyDeliveries) * 100) : 0}%`, color: EMERALD },
    { label: "Gross Salary", value: RS(st.grossSalary), color: BLUE },
    { label: "Net Payable", value: RS(st.netPayable), color: EMERALD },
    { label: "Loans O/S", value: RS(a.totalOutstanding), color: AMBER },
  ]);

  // daily trend columns
  y = drawColumns(doc, MARGIN, y + 4, w, 92, `Daily Deliveries — ${monthLabel} (Sundays in amber)`,
    a.dailyTrend.map((d) => {
      const dt = new Date(d.date);
      return { label: String(dt.getDate()), value: d.count, highlight: dt.getDay() === 0 };
    }));

  // two-column bar blocks
  const colW = (w - 20) / 2;
  const leftY = drawHBars(doc, MARGIN, y, colW, "Top Performers — Cylinders",
    a.topPerformers.slice(0, 6).map((p) => ({ label: p.name, value: p.total })), EMERALD);
  const rightY = drawHBars(doc, MARGIN + colW + 20, y, colW, "Cylinder Mix — Share of Deliveries",
    a.cylinderMix.map((c) => ({
      label: c.name, value: c.count,
      text: `${NUM(c.count)} (${a.monthlyDeliveries > 0 ? Math.round((c.count / a.monthlyDeliveries) * 100) : 0}%)`,
    })), BLUE);
  y = Math.max(leftY, rightY) + 4;

  if (y > pageH(doc) - 220) { doc.addPage(); y = 50; }
  const leftY2 = drawHBars(doc, MARGIN, y, colW, "Deductions Breakdown",
    a.deductionBreakdown.map((d) => ({ label: DED_LABELS[d.type] || d.type, value: d.amount, text: RS(d.amount) })), ROSE);
  const rightY2 = drawHBars(doc, MARGIN + colW + 20, y, colW, "Outstanding Loans — Top Borrowers",
    a.loanOutstanding.slice(0, 6).map((l) => ({ label: l.name, value: l.amount, text: RS(l.amount) })), AMBER);
  y = Math.max(leftY2, rightY2) + 4;

  // OTP split single stacked bar
  if (y > pageH(doc) - 120) { doc.addPage(); y = 50; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_900);
  doc.text("OTP Adoption", MARGIN, y);
  const total = a.otpSplit.otp + a.otpSplit.nonOtp;
  const otpW = total > 0 ? (a.otpSplit.otp / total) * w : 0;
  doc.setFillColor(...EMERALD);
  doc.rect(MARGIN, y + 8, otpW, 12, "F");
  doc.setFillColor(...SLATE_400);
  doc.rect(MARGIN + otpW, y + 8, w - otpW, 12, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(...SLATE_600);
  doc.text(`With OTP: ${NUM(a.otpSplit.otp)} (${total > 0 ? Math.round((a.otpSplit.otp / total) * 100) : 0}%)`, MARGIN, y + 32);
  doc.text(`Without OTP: ${NUM(a.otpSplit.nonOtp)}`, MARGIN + w, y + 32, { align: "right" });

  drawFooters(doc);
  return { doc, filename: `Astha_Analytics_${getMonthName(month)}_${year}.pdf` };
}

// ═══════════════════════════ EXCEL WORKBOOK (5 sheets) ═══════════════════════
export interface WorkbookInput {
  month: number; year: number;
  salaryRows: SalaryRow[];
  salaryTotals: SalaryTotals;
  otpBonus: number;
  registerTypes: RegisterType[];
  registerRows: RegisterRow[];
  dailyRows: { date: string; employee: string; type: string; count: number; otp: number; price: number }[];
  loanRows: SalaryRow[];
  loanTxns: LoanTxn[];
  analytics: AnalyticsData | null;
}

type AOA = (string | number)[][];

function applyNumFmt(XLSX: typeof XLSXType, ws: XLSXType.WorkSheet, cols: number[], startRow: number, endRow: number, fmt: string) {
  for (let r = startRow; r <= endRow; r++) {
    for (const c of cols) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === "number") cell.z = fmt;
    }
  }
}

export async function makeWorkbook(input: WorkbookInput): Promise<{ wb: XLSXType.WorkBook; filename: string; XLSX: typeof XLSXType }> {
  const XLSX = await xlsxLib();
  const { month, year, salaryRows, salaryTotals: t, registerTypes, registerRows, dailyRows, loanRows, loanTxns, analytics } = input;
  const monthLabel = `${getMonthName(month)} ${year}`;
  const wb = XLSX.utils.book_new();
  const CUR = "#,##0.00";
  const INT = "#,##0";

  // ── Sheet 1: Summary ────────────────────────────────────────────────────────
  const summary: AOA = [
    ["ASTHA GAS AGENCY — DESAINAGAR"],
    [`Monthly Report — ${monthLabel} (FY ${getFinancialYear(month, year)})`],
    [],
    ["PAYROLL"],
    ["Gross Salary", t.grossSalary],
    ["Total Deductions", t.totalDeductions],
    ["Net Payable", t.netPayable],
    ["Loan Carry Forward", t.loanCarryForward],
    [],
    ["DELIVERIES"],
    ["Total Cylinders", t.totalDeliveries],
    ["OTP Verified", t.totalOtpCount],
    ["OTP Rate %", t.totalDeliveries > 0 ? Math.round((t.totalOtpCount / t.totalDeliveries) * 100) : 0],
  ];
  if (analytics) {
    summary.push([], ["CYLINDER MIX"]);
    for (const c of analytics.cylinderMix) summary.push([c.name, c.count]);
    summary.push([], ["DEDUCTION BREAKDOWN"]);
    for (const d of analytics.deductionBreakdown) summary.push([DED_LABELS[d.type] || d.type, d.amount]);
    summary.push([], ["TOP PERFORMERS"]);
    for (const p of analytics.topPerformers) summary.push([p.name, p.total]);
  }
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary["!cols"] = [{ wch: 30 }, { wch: 16 }];
  applyNumFmt(XLSX, wsSummary, [1], 3, 8, CUR);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // ── Sheet 2: Salary Sheet ───────────────────────────────────────────────────
  const salaryAoa: AOA = [
    ["#", "Employee", "Type", "Cylinders", "OTP", "Gross Salary", "Opening Loan", "New Loan", "Net Loan",
      ...DED_KEYS.map((k) => DED_LABELS[k]), "Total Deductions", "Net Payable", "Loan C/F"],
    ...salaryRows.map((r, i) => [
      i + 1, r.employee.name, r.employee.type, r.totalDeliveries, r.totalOtpCount, r.grossSalary,
      r.openingLoan, r.additionalLoan, r.netLoan,
      ...DED_KEYS.map((k) => r.deductions[k] || 0),
      r.totalDeductions, r.netPayable, r.loanCarryForward,
    ] as (string | number)[]),
    ["", `TOTAL (${salaryRows.length})`, "", t.totalDeliveries, t.totalOtpCount, t.grossSalary, t.openingLoan, t.additionalLoan,
      t.openingLoan + t.additionalLoan,
      ...DED_KEYS.map((k) => salaryRows.reduce((a, r) => a + (r.deductions[k] || 0), 0)),
      t.totalDeductions, t.netPayable, t.loanCarryForward],
  ];
  const wsSalary = XLSX.utils.aoa_to_sheet(salaryAoa);
  wsSalary["!cols"] = [{ wch: 4 }, { wch: 18 }, { wch: 9 }, { wch: 10 }, { wch: 8 }, ...Array<{ wch: number }>(12).fill({ wch: 13 })];
  applyNumFmt(XLSX, wsSalary, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 1, salaryAoa.length - 1, CUR);
  applyNumFmt(XLSX, wsSalary, [3, 4], 1, salaryAoa.length - 1, INT);
  XLSX.utils.book_append_sheet(wb, wsSalary, "Salary Sheet");

  // ── Sheet 3: Delivery Register ──────────────────────────────────────────────
  const regAoa: AOA = [
    ["#", "Delivery Man",
      ...registerTypes.flatMap((tp) => [`${tp.name} Count`, `${tp.name} OTP`]),
      "Total Cylinders", "Total OTP", "Days Worked", "Earnings"],
    ...registerRows.map((r, i) => [
      i + 1, r.name,
      ...registerTypes.flatMap((tp) => [r.perType[tp.id]?.count || 0, r.perType[tp.id]?.otp || 0]),
      r.total, r.otp, r.days, r.earnings,
    ] as (string | number)[]),
  ];
  const wsReg = XLSX.utils.aoa_to_sheet(regAoa);
  wsReg["!cols"] = [{ wch: 4 }, { wch: 18 }, ...Array<{ wch: number }>(registerTypes.length * 2 + 4).fill({ wch: 12 })];
  applyNumFmt(XLSX, wsReg, [regAoa[0].length - 1], 1, regAoa.length - 1, CUR);
  XLSX.utils.book_append_sheet(wb, wsReg, "Delivery Register");

  // ── Sheet 4: Daily Log (raw entries) ────────────────────────────────────────
  const logAoa: AOA = [
    ["Date", "Employee", "Cylinder Type", "Total Count", "OTP Count", "Non-OTP", "Rate", "OTP Bonus", "Earnings"],
    ...dailyRows.map((r) => [
      r.date, r.employee, r.type, r.count, r.otp, r.count - r.otp, r.price, input.otpBonus,
      r.count * r.price + r.otp * input.otpBonus,
    ] as (string | number)[]),
  ];
  const wsLog = XLSX.utils.aoa_to_sheet(logAoa);
  wsLog["!cols"] = [{ wch: 11 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 9 }, { wch: 9 }, { wch: 8 }, { wch: 9 }, { wch: 11 }];
  applyNumFmt(XLSX, wsLog, [6, 7, 8], 1, logAoa.length - 1, CUR);
  XLSX.utils.book_append_sheet(wb, wsLog, "Daily Log");

  // ── Sheet 5: Loans ──────────────────────────────────────────────────────────
  const loanAoa: AOA = [
    ["LOAN STATEMENT — " + monthLabel],
    ["#", "Employee", "Opening", "New Loan", "Net Loan", "Instalment Paid", "Carry Forward", "Status"],
    ...loanRows.map((r, i) => [
      i + 1, r.employee.name, r.openingLoan, r.additionalLoan, r.netLoan,
      r.deductions.loan_instalment || 0, r.loanCarryForward,
      r.loanCarryForward <= 0 ? "CLEARED" : "ACTIVE",
    ] as (string | number)[]),
    [],
    ["DISBURSEMENTS THIS MONTH"],
    ["Date", "Employee", "Amount", "Note"],
    ...loanTxns.map((x) => [
      new Date(x.createdAt).toLocaleDateString("en-IN"), x.employee.name, x.amount, x.note || "",
    ] as (string | number)[]),
  ];
  const wsLoan = XLSX.utils.aoa_to_sheet(loanAoa);
  wsLoan["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 13 }, { wch: 22 }];
  applyNumFmt(XLSX, wsLoan, [2, 3, 4, 5, 6], 2, 1 + loanRows.length, CUR);
  applyNumFmt(XLSX, wsLoan, [2], 5 + loanRows.length, loanAoa.length - 1, CUR);
  XLSX.utils.book_append_sheet(wb, wsLoan, "Loans");

  return { wb, filename: `Astha_Report_${getMonthName(month)}_${year}.xlsx`, XLSX };
}

// ── browser download wrappers ────────────────────────────────────────────────
export async function exportSalaryPdf(i: SalaryPdfInput) { const { doc, filename } = await makeSalaryPdf(i); doc.save(filename); }
export async function exportDeliveryRegisterPdf(i: RegisterPdfInput) { const { doc, filename } = await makeDeliveryRegisterPdf(i); doc.save(filename); }
export async function exportLoanStatementPdf(i: LoanPdfInput) { const { doc, filename } = await makeLoanStatementPdf(i); doc.save(filename); }
export async function exportAnalyticsPdf(i: AnalyticsPdfInput) { const { doc, filename } = await makeAnalyticsPdf(i); doc.save(filename); }
export async function exportWorkbook(i: WorkbookInput) { const { wb, filename, XLSX } = await makeWorkbook(i); XLSX.writeFile(wb, filename); }
