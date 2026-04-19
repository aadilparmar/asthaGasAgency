import type { DashboardData } from "./types";
import Card from "./Card";

interface CardPaymentMixProps {
  data: DashboardData | null;
}

const ITEMS = [
  { key: "otp",    label: "OTP",    color: "#10b981" },
  { key: "online", label: "Online", color: "#0ea5e9" },
  { key: "nsDom",  label: "NS DOM", color: "#8b5cf6" },
] as const;

export default function CardPaymentMix({ data }: CardPaymentMixProps) {
  const m = data?.paymentModes || { otp: 0, online: 0, nsDom: 0 };
  const total = m.otp + m.online + m.nsDom;
  const rows = ITEMS.map((it) => ({ ...it, value: m[it.key as keyof typeof m] }));

  return (
    <Card
      title="Payment Mix"
      subtitle="OTP / Online / NS DOM"
      icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    >
      {total === 0 ? (
        <div className="h-48 flex items-center justify-center text-slate-400 text-xs">No payments</div>
      ) : (
        <div className="space-y-4 w-full min-w-0">
          {/* Stacked bar */}
          <div className="w-full min-w-0">
            <div className="flex h-10 rounded-lg overflow-hidden border border-slate-200 w-full">
              {rows.map((it) => {
                const pct = total === 0 ? 0 : (it.value / total) * 100;
                if (pct === 0) return null;
                return (
                  <div
                    key={it.key}
                    className="flex items-center justify-center text-white text-[10px] font-mono font-semibold flex-shrink-0"
                    style={{ width: `${pct}%`, background: it.color, minWidth: 0 }}
                  >
                    {pct > 15 && `${pct.toFixed(0)}%`}
                  </div>
                );
              })}
            </div>
            <div className="flex items-baseline justify-center gap-2 mt-2">
              <div className="font-display text-2xl font-semibold text-slate-900 tabular-nums">
                {total.toLocaleString("en-IN")}
              </div>
              <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400">total</div>
            </div>
          </div>

          {/* Per-mode mini cards */}
          <div className="grid grid-cols-3 gap-2 w-full min-w-0">
            {rows.map((it) => (
              <div key={it.key} className="text-center min-w-0 overflow-hidden">
                <div className="w-full h-0.5 rounded-full mb-1.5" style={{ background: it.color }} />
                <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500 truncate">
                  {it.label}
                </div>
                <div className="font-display text-base font-semibold text-slate-800 tabular-nums truncate">
                  {it.value.toLocaleString("en-IN")}
                </div>
                <div className="text-[9px] text-slate-400 font-mono">
                  {total > 0 ? `${((it.value / total) * 100).toFixed(0)}%` : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
