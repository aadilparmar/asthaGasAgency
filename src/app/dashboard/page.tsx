"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Hero from "@/components/dashboard/Hero";
import AlertCard from "@/components/dashboard/AlertCard";
import CardExpenseDonut from "@/components/dashboard/CardExpenseDonut";
import CardCylinderMix from "@/components/dashboard/CardCylinderMix";
import CardPaymentMix from "@/components/dashboard/CardPaymentMix";
import CardEmployees from "@/components/dashboard/CardEmployees";
import CardStock from "@/components/dashboard/CardStock";
import CardRefillHeatmap from "@/components/dashboard/CardRefillHeatmap";
import type { DashboardData, Period } from "@/components/dashboard/types";

// In-memory cache keyed by period — shared across mounts (module-level).
// Lets period switches render stale data instantly while we refetch in background.
const cache = new Map<Period, { data: DashboardData; fetchedAt: number }>();
const STALE_MS = 30_000; // refetch when data is older than 30 seconds

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<DashboardData | null>(() => cache.get("month")?.data ?? null);
  const [loading, setLoading] = useState(!cache.get("month"));
  const inflight = useRef<Map<Period, Promise<void>>>(new Map());

  const load = useCallback(async (p: Period) => {
    // If we already have a fresh entry, skip.
    const cached = cache.get(p);
    const isFresh = cached && Date.now() - cached.fetchedAt < STALE_MS;
    if (isFresh) {
      setData(cached.data);
      setLoading(false);
      return;
    }

    // Show stale data immediately while we refetch
    if (cached) {
      setData(cached.data);
      setLoading(false);
    } else {
      setLoading(true);
    }

    // Dedupe in-flight requests per period
    const existing = inflight.current.get(p);
    if (existing) {
      await existing;
      return;
    }

    const promise = (async () => {
      try {
        const res = await fetch(`/api/dashboard?period=${p}`);
        const fresh = await res.json();
        cache.set(p, { data: fresh, fetchedAt: Date.now() });
        // Only update UI if user is still on this period
        setData((prev) => (p === period ? fresh : prev));
      } catch (e) {
        console.error(e);
      } finally {
        inflight.current.delete(p);
        setLoading(false);
      }
    })();
    inflight.current.set(p, promise);
    await promise;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load whenever the period changes
  useEffect(() => {
    load(period);
  }, [period, load]);

  // Pre-warm the other periods after initial render for instant switches
  useEffect(() => {
    const others: Period[] = ["today", "week", "month", "fy"];
    const t = setTimeout(() => {
      for (const p of others) {
        if (p !== period && !cache.get(p)) {
          fetch(`/api/dashboard?period=${p}`)
            .then((r) => r.json())
            .then((d) => cache.set(p, { data: d, fetchedAt: Date.now() }))
            .catch(() => {});
        }
      }
    }, 400); // small delay so current period finishes first
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When user switches period, surface stale cached data immediately
  const switchPeriod = useCallback((p: Period) => {
    setPeriod(p);
    const cached = cache.get(p);
    if (cached) {
      setData(cached.data);
      setLoading(false);
    }
  }, []);

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden space-y-4 animate-fade-in">
      <Hero data={data} period={period} setPeriod={switchPeriod} loading={loading} />

      {data?.alerts && data.alerts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 w-full min-w-0">
          {data.alerts.map((a, i) => <AlertCard key={i} alert={a} />)}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 w-full min-w-0">
        <CardExpenseDonut data={data} />
        <CardCylinderMix data={data} />
        <CardPaymentMix data={data} />
      </div>

      <CardEmployees data={data} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full min-w-0">
        <CardStock data={data} />
        <CardRefillHeatmap data={data} />
      </div>
    </div>
  );
}
