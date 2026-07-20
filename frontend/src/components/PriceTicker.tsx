"use client";

import { useEffect, useState } from "react";
import { api, PricePoint, Prices } from "@/lib/api";

function Sparkline({ points }: { points: PricePoint[] }) {
  if (points.length < 2) return null;
  const W = 72, H = 22;
  const vals = points.map((p) => p.close);
  const min = Math.min(...vals), max = Math.max(...vals);
  const x = (i: number) => (i / (vals.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / (max - min || 1)) * (H - 4) - 2;
  const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = vals[vals.length - 1] >= vals[0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[22px] w-[72px]" role="img" aria-hidden="true">
      <path d={d} fill="none" strokeWidth="1.3" stroke={up ? "var(--risk-high)" : "var(--risk-low)"} opacity="0.9" />
    </svg>
  );
}

export default function PriceTicker({ compact = false }: { compact?: boolean }) {
  const [prices, setPrices] = useState<Prices | null>(null);
  const [history, setHistory] = useState<PricePoint[]>([]);

  useEffect(() => {
    const load = () => api.prices().then(setPrices).catch(() => {});
    load();
    api.priceHistory(30).then(setHistory).catch(() => {});
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  if (!prices) return <div className="h-6 w-40 animate-pulse rounded bg-surface-2" />;

  const rows: Array<["brent" | "wti" | "usd_inr", string]> = compact
    ? [["brent", "Brent"]]
    : [["brent", "Brent"], ["wti", "WTI"], ["usd_inr", "USD/INR"]];

  return (
    <div className="figure flex items-center gap-5 text-[13px]">
      {rows.map(([k, label]) => {
        const q = prices[k];
        const up = q.change_pct >= 0;
        return (
          <div key={k} className="flex items-center gap-2">
            <span className="text-ink-3">{label}</span>
            <span className="text-ink">{q.price.toFixed(2)}</span>
            <span className={up ? "text-risk-high" : "text-risk-low"}>
              {up ? "+" : ""}{q.change_pct.toFixed(1)}%
            </span>
            {k === "brent" && !compact && <Sparkline points={history} />}
            {q.stale && <span className="text-accent" title="Live feed unavailable, showing fallback">stale</span>}
          </div>
        );
      })}
    </div>
  );
}
