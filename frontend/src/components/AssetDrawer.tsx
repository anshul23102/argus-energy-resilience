"use client";

import { GradeInfo, Route } from "@/lib/api";
import { Selection } from "./WarRoomMap";

const RISK_TONE: Record<string, string> = {
  low: "text-risk-low", medium: "text-risk-elevated", high: "text-risk-high",
};

export default function AssetDrawer({
  selection, grades, routes, onClose,
}: {
  selection: Selection | null;
  grades: Record<string, GradeInfo>;
  routes: Route[];
  onClose: () => void;
}) {
  if (!selection) return null;

  const title =
    selection.kind === "supplier" ? selection.supplier.name
    : selection.kind === "refinery" ? selection.refinery.name
    : selection.chokepoint.name;

  return (
    <div className="card absolute bottom-4 left-4 z-20 max-h-[70vh] w-[380px] overflow-y-auto p-5 shadow-2xl">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        <button
          onClick={onClose}
          className="rounded px-1.5 text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {selection.kind === "supplier" && (
        <>
          <div className="mb-4 flex gap-5 text-[12px]">
            <span className="text-ink-2"><span className="text-ink-3">Share of imports</span> <span className="figure">{selection.supplier.share_pct}%</span></span>
            <span className={RISK_TONE[selection.supplier.payment_risk.split(" ")[0]] ?? "text-ink-2"}>
              <span className="text-ink-3">Payment risk</span> {selection.supplier.payment_risk.split(" ")[0]}
            </span>
          </div>

          <h3 className="section-label mb-2">Grades supplied</h3>
          <div className="mb-4 space-y-1.5">
            {selection.supplier.grades.map((g) => {
              const gr = grades[g];
              if (!gr) return null;
              return (
                <div key={g} className="flex items-baseline justify-between rounded-md border border-hairline bg-surface-2 px-3 py-2">
                  <span className="text-[12px] text-ink-2">{gr.name}</span>
                  <span className="figure text-[11px] text-ink-3">
                    API {gr.api}, S {gr.sulfur_pct}%,{" "}
                    <span className={gr.benchmark_diff_usd < 0 ? "text-risk-low" : "text-ink-2"}>
                      {gr.benchmark_diff_usd > 0 ? "+" : ""}{gr.benchmark_diff_usd} vs Brent
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          <h3 className="section-label mb-2">Routes to India</h3>
          <div className="space-y-1.5">
            {routes
              .filter((r) => selection.supplier.export_terminals.some((t) => r.from_terminals.includes(t.id)))
              .map((r) => (
                <div key={r.id} className="rounded-md border border-hairline bg-surface-2 px-3 py-2">
                  <div className="text-[12px] text-ink-2">{r.name}</div>
                  <div className="figure mt-0.5 text-[11px] text-ink-3">
                    {r.distance_nm.toLocaleString()} nm, {r.voyage_days}d
                    {r.chokepoints.length > 0 ? `, via ${r.chokepoints.join(", ")}` : ", no chokepoint transit"}
                  </div>
                </div>
              ))}
          </div>

          {selection.supplier.notes && (
            <p className="caption mt-4">{selection.supplier.notes}</p>
          )}
        </>
      )}

      {selection.kind === "refinery" && (
        <>
          <div className="figure mb-4 grid grid-cols-2 gap-y-1.5 text-[12px] text-ink-2">
            <span><span className="text-ink-3">Capacity</span> {selection.refinery.capacity_mmtpa} MMTPA</span>
            <span><span className="text-ink-3">Complexity</span> NCI {selection.refinery.nelson_complexity}</span>
            <span><span className="text-ink-3">Operator</span> {selection.refinery.operator}</span>
            <span><span className="text-ink-3">State</span> {selection.refinery.state}</span>
          </div>
          <h3 className="section-label mb-2">Crude diet</h3>
          <div className="flex flex-wrap gap-1.5">
            {selection.refinery.crude_diet.map((d) => (
              <span key={d} className="rounded-md border border-hairline bg-surface-2 px-2.5 py-1 text-[11px] text-ink-2">
                {d.replace("_", " ")}
              </span>
            ))}
            <span className="rounded-md border border-hairline bg-surface-2 px-2.5 py-1 text-[11px] text-ink-2">
              {selection.refinery.sulfur_tolerance} tolerant
            </span>
          </div>
          <p className="caption mt-4">
            {selection.refinery.coastal
              ? "Coastal refinery with a direct import berth."
              : `Inland refinery, fed via ${selection.refinery.import_port ?? "domestic supply"}${selection.refinery.pipeline ? ` on the ${selection.refinery.pipeline}` : ""}.`}{" "}
            Configured for {selection.refinery.sulfur_tolerance} crude. The procurement model only assigns
            replacement barrels this refinery can actually process.
          </p>
        </>
      )}

      {selection.kind === "chokepoint" && (
        <>
          <div className="figure mb-4 grid grid-cols-2 gap-y-1.5 text-[12px] text-ink-2">
            <span><span className="text-ink-3">Global flow</span> {selection.chokepoint.daily_oil_flow_mbd} mb/d</span>
            <span><span className="text-ink-3">India exposure</span> {selection.chokepoint.supply_at_risk_pct}%</span>
          </div>
          <h3 className="section-label mb-2">Alternatives if closed</h3>
          <p className="text-[12px] leading-relaxed text-ink-2">{selection.chokepoint.alternatives}</p>
        </>
      )}
    </div>
  );
}
