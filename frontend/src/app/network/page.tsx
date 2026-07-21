"use client";

import { useMemo, useState } from "react";
import { useNetworkData } from "@/lib/useNetworkData";
import WarRoomMap, { Selection } from "@/components/WarRoomMap";
import AssetDrawer from "@/components/AssetDrawer";

type Tab = "suppliers" | "refineries";

export default function NetworkPage() {
  const d = useNetworkData();
  const [tab, setTab] = useState<Tab>("suppliers");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);

  const filteredSuppliers = useMemo(
    () => d.suppliers.filter((s) => s.name.toLowerCase().includes(query.toLowerCase())),
    [d.suppliers, query],
  );
  const filteredRefineries = useMemo(
    () => d.refineries.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()) || r.operator.toLowerCase().includes(query.toLowerCase())),
    [d.refineries, query],
  );

  return (
    <div className="flex h-full">
      <div className="flex w-[380px] shrink-0 flex-col border-r border-hairline">
        <div className="border-b border-hairline p-4">
          <div className="mb-3 flex gap-1 rounded-md bg-surface-2 p-1">
            {(["suppliers", "refineries"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded px-2 py-1.5 text-[12px] font-medium capitalize transition-colors duration-150 ${tab === t ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${tab}`}
            className="w-full rounded-md border border-hairline bg-surface-2 px-3 py-2 text-[13px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3">
          {tab === "suppliers" && filteredSuppliers.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setSelection({ kind: "supplier", supplier: s })}
              className={`block w-full px-3 py-3 text-left transition-colors duration-150 ${i > 0 ? "hairline-section" : ""} ${
                selection?.kind === "supplier" && selection.supplier.id === s.id
                  ? "bg-accent/10" : "hover:bg-surface-2"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-ink">{s.name}</span>
                <span className="figure text-[12px] text-ink-3">{s.share_pct}%</span>
              </div>
              <p className="caption mt-0.5">{s.export_terminals.length} terminal{s.export_terminals.length !== 1 ? "s" : ""}, {s.grades.length} grades</p>
            </button>
          ))}
          {tab === "refineries" && filteredRefineries.map((r, i) => (
            <button
              key={r.id}
              onClick={() => setSelection({ kind: "refinery", refinery: r })}
              className={`block w-full px-3 py-3 text-left transition-colors duration-150 ${i > 0 ? "hairline-section" : ""} ${
                selection?.kind === "refinery" && selection.refinery.id === r.id
                  ? "bg-accent/10" : "hover:bg-surface-2"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-ink">{r.name}</span>
                <span className="figure text-[12px] text-ink-3">{r.capacity_mmtpa} MMTPA</span>
              </div>
              <p className="caption mt-0.5">{r.operator}, {r.state}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="relative flex-1">
        <WarRoomMap
          refineries={d.refineries} ports={d.ports} spr={d.spr} chokepoints={d.chokepoints}
          routes={d.routes} suppliers={d.suppliers} risk={d.risk}
          selection={selection} onSelect={setSelection}
          initialPitch={40} initialZoom={2.4}
        />
        <AssetDrawer selection={selection} grades={d.grades} routes={d.routes} onClose={() => setSelection(null)} />
      </div>
    </div>
  );
}
