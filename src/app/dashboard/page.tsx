"use client";

import { useState, useEffect, useCallback } from "react";
import Hero from "@/components/dashboard/Hero";
import AlertCard from "@/components/dashboard/AlertCard";
import CardExpenseDonut from "@/components/dashboard/CardExpenseDonut";
import CardCylinderMix from "@/components/dashboard/CardCylinderMix";
import CardPaymentMix from "@/components/dashboard/CardPaymentMix";
import CardEmployees from "@/components/dashboard/CardEmployees";
import CardStock from "@/components/dashboard/CardStock";
import CardRefillHeatmap from "@/components/dashboard/CardRefillHeatmap";
import type { DashboardData, Period } from "@/components/dashboard/types";

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard?period=${period}`);
      setData(await res.json());
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden space-y-4 animate-fade-in">
      {/* Hero */}
      <Hero data={data} period={period} setPeriod={setPeriod} loading={loading} />

      {/* Alerts */}
      {data?.alerts && data.alerts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 w-full min-w-0">
          {data.alerts.map((a, i) => <AlertCard key={i} alert={a} />)}
        </div>
      )}

      {/* Top row: Expense / Cylinder / Payment */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 w-full min-w-0">
        <CardExpenseDonut data={data} />
        <CardCylinderMix data={data} />
        <CardPaymentMix data={data} />
      </div>

      {/* Employee histogram */}
      <CardEmployees data={data} />

      {/* Stock + GitHub-style Refill heatmap */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full min-w-0">
        <CardStock data={data} />
        <CardRefillHeatmap data={data} />
      </div>
    </div>
  );
}
