// Shared types for the dashboard module.

export type Period = "today" | "week" | "month" | "fy";

export interface KpiValue {
  current: number;
  previous: number;
  delta: number | null;
}

export interface Alert {
  level: "danger" | "warning" | "info";
  icon: "fire" | "clock" | "cash" | "trend-down" | "inbox";
  title: string;
  message: string;
  href?: string;
  count?: number;
}

export interface TrendPoint {
  key: string;
  label: string;
  revenue: number;
  expenses: number;
  net: number;
  nsDom: number;
}

export interface ExpenseBucket {
  id: string;
  name: string;
  amount: number;
  color: string;
}

export interface CylinderBucket {
  id: string;
  name: string;
  revenue: number;
  nsDom: number;
  color: string;
}

export interface EmployeeBucket {
  id: string;
  name: string;
  nsDom: number;
  otp: number;
  online: number;
  revenue: number;
}

export interface StockRow {
  id: string;
  name: string;
  full: number;
  empty: number;
  sellingPrice: number;
}

export interface RefillDay {
  date: string;
  count: number;
  intensity: number;
}

export interface DashboardData {
  period: Period;
  label: string;
  range: { start: string; end: string };
  kpis: {
    revenue: KpiValue;
    expenses: KpiValue;
    netIncome: KpiValue;
    deliveries: KpiValue;
  };
  paymentModes: { otp: number; online: number; nsDom: number };
  revenueTrend: TrendPoint[];
  expenseBreakdown: ExpenseBucket[];
  cylinderMix: CylinderBucket[];
  employeePerformance: EmployeeBucket[];
  stockSnapshot: StockRow[];
  totalFull: number;
  totalEmpty: number;
  refillHeatmap: RefillDay[];
  refillHeatmapMax: number;
  alerts: Alert[];
  counts: {
    employees: number;
    deliveryStaff: number;
    officeStaff: number;
    consumers: number;
    refillsDueCount: number;
    activeCylinderTypes: number;
  };
}
