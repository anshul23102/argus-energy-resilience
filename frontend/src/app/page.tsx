"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import WarRoomMap, { Selection, riskBand } from "@/components/WarRoomMap";
import AssetDrawer from "@/components/AssetDrawer";
import { useNetworkData } from "@/lib/useNetworkData";
import { NAV_ITEMS } from "@/lib/nav";

export default function Home() {
  const d = useNetworkData();
  const [selection, setSelection] = useState<Selection | null>(null);

  const topRisks = [...d.risk]
    .filter((r) => d.chokepoints.find((c) => c.id === r.chokepoint && c.daily_oil_flow_mbd))
    .sort((a, b) => b.posterior_horizon_prob - a.posterior_horizon_prob)
    .slice(0, 3);

  return (
    <div className="relative h-full w-full">
      <WarRoomMap
        refineries={d.refineries} ports={d.ports} spr={d.spr} chokepoints={d.chokepoints}
        routes={d.routes} suppliers={d.suppliers} risk={d.risk}
        selection={selection} onSelect={setSelection}
      />

      {/* Intro card, top-left. Sets the scene without crowding the map. */}
      <div className="card absolute left-4 top-4 z-10 max-w-sm p-5">
        <p className="section-label mb-1.5">India crude supply chain</p>
        <h2 className="text-[20px] font-semibold leading-snug text-ink">
          88% of crude is imported. 40% sails through one strait.
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          This map is live: {d.refineries.length} refineries, {d.suppliers.length} supplier nations and
          {" "}{d.routes.length} shipping corridors, scored against real news signal every 15 minutes.
        </p>
        <p className="caption mt-2">
          Drag to rotate, scroll to zoom, click any node for detail.
        </p>
      </div>

      {/* Top corridor risk, top-right. Three cards, not the full list. */}
      {topRisks.length > 0 && (
        <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
          <p className="section-label px-1">Highest disruption risk, 30 day</p>
          {topRisks.map((r) => {
            const cp = d.chokepoints.find((c) => c.id === r.chokepoint)!;
            const band = riskBand(r.posterior_horizon_prob);
            return (
              <Link
                key={r.chokepoint}
                href="/risk"
                className="card flex w-64 items-center justify-between px-4 py-2.5 transition-colors duration-150 hover:border-hairline-strong"
              >
                <span className="text-[13px] text-ink-2">{cp.name}</span>
                <span
                  className="figure text-[14px] font-semibold"
                  style={{ color: band === "high" ? "var(--risk-high)" : band === "elevated" ? "var(--risk-elevated)" : "var(--risk-low)" }}
                >
                  {(r.posterior_horizon_prob * 100).toFixed(1)}%
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Section nav, bottom. Where the dense material actually lives. */}
      <div className="absolute bottom-4 left-4 right-4 z-10 flex justify-center gap-3">
        {NAV_ITEMS.filter((n) => n.href !== "/").map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="card group flex items-center gap-2 px-4 py-2.5 transition-colors duration-150 hover:border-hairline-strong hover:bg-surface-2"
          >
            <span className="text-[12px] font-medium text-ink-2 group-hover:text-ink">{item.label}</span>
            <ArrowUpRight size={13} className="text-ink-3 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
          </Link>
        ))}
      </div>

      <AssetDrawer selection={selection} grades={d.grades} routes={d.routes} onClose={() => setSelection(null)} />
    </div>
  );
}
