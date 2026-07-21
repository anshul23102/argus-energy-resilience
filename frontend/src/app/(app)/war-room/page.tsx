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

      {/* Intro panel, top-left. Floats over the map rather than boxing it in. */}
      <div className="panel-glass absolute left-5 top-5 z-10 max-w-md p-6">
        <p className="section-label mb-2">India crude supply chain</p>
        <h2 className="text-[26px] font-semibold leading-[1.15] text-ink">
          88% of crude is imported. 40% sails through one strait.
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          This map is live: {d.refineries.length} refineries, {d.suppliers.length} supplier nations and
          {" "}{d.routes.length} shipping corridors, scored against real news signal every 15 minutes.
        </p>
        <p className="caption mt-3">
          Drag to rotate, scroll to zoom, click any node for detail.
        </p>
      </div>

      {/* Top corridor risk, top-right. Three entries, not the full list. */}
      {topRisks.length > 0 && (
        <div className="panel-glass absolute right-5 top-5 z-10 w-72 p-2">
          <p className="section-label px-3 pb-2 pt-1">Highest disruption risk, 30 day</p>
          {topRisks.map((r, i) => {
            const cp = d.chokepoints.find((c) => c.id === r.chokepoint)!;
            const band = riskBand(r.posterior_horizon_prob);
            return (
              <Link
                key={r.chokepoint}
                href="/risk"
                className={`flex items-center justify-between rounded-md px-3 py-3 transition-colors duration-150 hover:bg-surface-2 ${i > 0 ? "hairline-section" : ""}`}
              >
                <span className="text-[14px] text-ink-2">{cp.name}</span>
                <span
                  className="stat-value text-[20px]"
                  style={{ color: band === "high" ? "var(--risk-high)" : band === "elevated" ? "var(--risk-elevated)" : "var(--risk-low)" }}
                >
                  {(r.posterior_horizon_prob * 100).toFixed(1)}%
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Section nav, bottom. One glass strip, hairline-divided, not a button grid. */}
      <div className="panel-glass absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center">
        {NAV_ITEMS.filter((n) => n.href !== "/").map((item, i) => (
          <Link
            key={item.href}
            href={item.href}
            className={`group flex items-center gap-2 whitespace-nowrap px-4 py-3.5 transition-colors duration-150 hover:bg-surface-2 ${i > 0 ? "border-l border-hairline" : ""}`}
          >
            <span className="text-[14px] font-medium text-ink-2 group-hover:text-ink">{item.label}</span>
            <ArrowUpRight size={14} className="text-ink-3 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
          </Link>
        ))}
      </div>

      <AssetDrawer selection={selection} grades={d.grades} routes={d.routes} onClose={() => setSelection(null)} />
    </div>
  );
}
