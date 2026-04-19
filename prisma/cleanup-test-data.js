/**
 * Pre-client cleanup: remove all test transaction data, keep master setup.
 *
 *   KEEP  : User, Employee, CylinderType, ConnectionType, ExpenseHead, AppSetting
 *   REMOVE: Consumer, CommercialCustomer (and all their children),
 *           LoanTransaction, MonthlyDeduction,
 *           DailyOperation + children (CylinderSale, ConnectionSale,
 *             DailyExpense, CashDenomination, OtherIncome, OtherExpense,
 *             CommercialTransaction),
 *           ConsumerRefill, CylinderStockTransaction
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function counts(label) {
  const [
    users, employees, cylTypes, connTypes, expHeads, appSettings,
    consumers, commCustomers,
    loans, deductions,
    dailyOps, cylSales, connSales, dailyExp, cashDenoms, otherInc, otherExp, commTxns,
    refills, stockTxns,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.employee.count(),
    prisma.cylinderType.count(),
    prisma.connectionType.count(),
    prisma.expenseHead.count(),
    prisma.appSetting.count(),
    prisma.consumer.count(),
    prisma.commercialCustomer.count(),
    prisma.loanTransaction.count(),
    prisma.monthlyDeduction.count(),
    prisma.dailyOperation.count(),
    prisma.cylinderSale.count(),
    prisma.connectionSale.count(),
    prisma.dailyExpense.count(),
    prisma.cashDenomination.count(),
    prisma.otherIncome.count(),
    prisma.otherExpense.count(),
    prisma.commercialTransaction.count(),
    prisma.consumerRefill.count(),
    prisma.cylinderStockTransaction.count(),
  ]);
  console.log(`\n=== ${label} ===`);
  console.log(`  MASTER (keep):`);
  console.log(`    User               : ${users}`);
  console.log(`    Employee           : ${employees}`);
  console.log(`    CylinderType       : ${cylTypes}`);
  console.log(`    ConnectionType     : ${connTypes}`);
  console.log(`    ExpenseHead        : ${expHeads}`);
  console.log(`    AppSetting         : ${appSettings}`);
  console.log(`  TRANSACTION (remove):`);
  console.log(`    Consumer           : ${consumers}`);
  console.log(`    CommercialCustomer : ${commCustomers}`);
  console.log(`    LoanTransaction    : ${loans}`);
  console.log(`    MonthlyDeduction   : ${deductions}`);
  console.log(`    DailyOperation     : ${dailyOps}`);
  console.log(`      CylinderSale     : ${cylSales}`);
  console.log(`      ConnectionSale   : ${connSales}`);
  console.log(`      DailyExpense     : ${dailyExp}`);
  console.log(`      CashDenomination : ${cashDenoms}`);
  console.log(`      OtherIncome      : ${otherInc}`);
  console.log(`      OtherExpense     : ${otherExp}`);
  console.log(`      CommTransaction  : ${commTxns}`);
  console.log(`    ConsumerRefill     : ${refills}`);
  console.log(`    CylinderStockTxn   : ${stockTxns}`);
}

async function cleanup() {
  await counts("BEFORE");

  console.log(`\nDeleting transaction data…`);

  // Delete in dependency order (children first, but cascades make most of this trivial)
  // DailyOperation has onDelete: Cascade for all its children, so deleting DailyOperation
  // takes out CylinderSale, ConnectionSale, DailyExpense, CashDenomination, OtherIncome,
  // OtherExpense, CommercialTransaction.
  const txnDailyOps = await prisma.dailyOperation.deleteMany({});
  console.log(`  DailyOperation (+ all children) removed: ${txnDailyOps.count}`);

  const txnLoans = await prisma.loanTransaction.deleteMany({});
  console.log(`  LoanTransaction removed: ${txnLoans.count}`);

  const txnDeductions = await prisma.monthlyDeduction.deleteMany({});
  console.log(`  MonthlyDeduction removed: ${txnDeductions.count}`);

  // ConsumerRefill has Consumer cascade; delete refills first to be explicit
  const txnRefills = await prisma.consumerRefill.deleteMany({});
  console.log(`  ConsumerRefill removed: ${txnRefills.count}`);

  // CylinderStockTransaction can reference Consumer (optional) — delete first
  const txnStock = await prisma.cylinderStockTransaction.deleteMany({});
  console.log(`  CylinderStockTransaction removed: ${txnStock.count}`);

  // Now consumers and commercial customers (test data — client will add their own)
  const txnConsumers = await prisma.consumer.deleteMany({});
  console.log(`  Consumer removed: ${txnConsumers.count}`);

  const txnCommCustomers = await prisma.commercialCustomer.deleteMany({});
  console.log(`  CommercialCustomer removed: ${txnCommCustomers.count}`);

  await counts("AFTER");
  console.log(`\n✓ Cleanup complete. Master data (staff, products, categories, login) intact.`);
}

cleanup()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
