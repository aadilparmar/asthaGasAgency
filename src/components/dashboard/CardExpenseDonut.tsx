import type { DashboardData } from "./types";
import { fmtCompact } from "./utils";
import Card from "./Card";
import Donut from "./Donut";

interface CardExpenseDonutProps {
  data: DashboardData | null;
}

export default function CardExpenseDonut({ data }: CardExpenseDonutProps) {
  const items = data?.expenseBreakdown || [];
  const total = items.reduce((s, i) => s + i.amount, 0);

  return (
    <Card
      title="Expense Breakdown"
      subtitle="By category"
      icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
    >
      {items.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-slate-400 text-xs">No expenses</div>
      ) : (
        <div className="flex flex-col items-center gap-3 w-full min-w-0">
          <div className="relative w-full max-w-[180px] aspect-square">
            <Donut segments={items.map((i) => ({ value: i.amount, color: i.color }))} />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="font-display text-xl font-semibold text-slate-900 tabular-nums">
                ₹{fmtCompact(total)}
              </div>
              <div className="text-[9px] text-slate-400 uppercase tracking-wider font-mono mt-0.5">total</div>
            </div>
          </div>
          <div className="w-full min-w-0 space-y-1">
            {items.slice(0, 5).map((b) => (
              <div key={b.id} className="flex items-center gap-2 text-[11px] min-w-0">
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: b.color }} />
                <span className="text-slate-700 truncate flex-1 min-w-0">{b.name}</span>
                <span className="font-mono tabular-nums text-slate-500 flex-shrink-0">
                  {((b.amount / total) * 100).toFixed(0)}%
                </span>
              </div>
            ))}
            {items.length > 5 && (
              <div className="text-[9px] text-slate-400 pt-0.5">+{items.length - 5} more</div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
