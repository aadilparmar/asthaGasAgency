import type { DashboardData } from "./types";
import { fmtCompact } from "./utils";
import Card from "./Card";
import Donut from "./Donut";

interface CardCylinderMixProps {
  data: DashboardData | null;
}

export default function CardCylinderMix({ data }: CardCylinderMixProps) {
  const items = data?.cylinderMix || [];
  const total = items.reduce((s, i) => s + i.revenue, 0);
  const top = items[0];

  return (
    <Card
      title="Revenue by Cylinder"
      subtitle="Sale price × count"
      icon="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
    >
      {items.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-slate-400 text-xs">No sales</div>
      ) : (
        <div className="flex flex-col items-center gap-3 w-full min-w-0">
          <div className="relative w-full max-w-[180px] aspect-square">
            <Donut segments={items.map((i) => ({ value: i.revenue, color: i.color }))} />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-2">
              {top && (
                <>
                  <div className="text-[9px] text-slate-400 uppercase tracking-wider font-mono">Top</div>
                  <div className="font-display text-sm font-semibold text-slate-900 leading-tight truncate max-w-full">
                    {top.name}
                  </div>
                  <div className="font-mono text-[10px] text-slate-500 mt-0.5">
                    {((top.revenue / total) * 100).toFixed(0)}%
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="w-full min-w-0 space-y-1">
            {items.map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-[11px] min-w-0">
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: m.color }} />
                <span className="text-slate-700 truncate flex-1 min-w-0">{m.name}</span>
                <span className="font-mono tabular-nums text-slate-500 flex-shrink-0">
                  ₹{fmtCompact(m.revenue)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
