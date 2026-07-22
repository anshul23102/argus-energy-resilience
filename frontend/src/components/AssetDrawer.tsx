"use client";

import { GradeInfo, Route, SupplierRisk } from "@/lib/api";
import { Selection } from "./globe/GlobeMap";

const RISK_TONE: Record<string, string> = {
  low: "text-risk-low", medium: "text-risk-elevated", high: "text-risk-high",
};

export default function AssetDrawer({
  selection, grades, routes, supplierRisk, onClose,
}: {
  selection: Selection | null;
  grades: Record<string, GradeInfo>;
  routes: Route[];
  supplierRisk?: SupplierRisk[];
  onClose: () => void;
}) {
  if (!selection) return null;

  const title =
    selection.kind === "supplier" ? selection.supplier.name
    : selection.kind === "refinery" ? selection.refinery.name
    : selection.chokepoint.name;

  return (
    <div className="panel-glass absolute bottom-4 left-4 z-20 max-h-[70vh] w-[400px] overflow-y-auto p-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="section-title">{title}</h2>
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
          {(() => {
            const r = supplierRisk?.find((x) => x.supplier === selection.supplier.id);
            if (!r) return null;
            return (
              <div className="hairline-section pb-4">
                <div className="flex items-baseline justify-between">
                  <span className="section-label">30-day disruption risk</span>
                  <span className="stat-value text-[22px] text-ink">{(r.posterior_horizon_prob * 100).toFixed(1)}%</span>
                </div>
                {r.drivers.length > 0 && (
                  <p className="caption mt-1">{r.drivers[0].summary}</p>
                )}
              </div>
            );
          })()}
          <div className="hairline-section flex gap-6 pb-4 text-[13px]">
            <span className="text-ink-2"><span className="text-ink-3">Share of imports</span> <span className="figure">{selection.supplier.share_pct}%</span></span>
            <span className={RISK_TONE[selection.supplier.payment_risk.split(" ")[0]] ?? "text-ink-2"}>
              <span className="text-ink-3">Payment risk</span> {selection.supplier.payment_risk.split(" ")[0]}
            </span>
          </div>

          <h3 className="section-label mb-1 mt-4">Grades supplied</h3>
          <div className="hairline-section pb-4">
            {selection.supplier.grades.map((g, i) => {
              const gr = grades[g];
              if (!gr) return null;
              return (
                <div key={g} className={`flex items-baseline justify-between py-2 ${i > 0 ? "hairline-section" : ""}`}>
                  <span className="text-[13px] text-ink-2">{gr.name}</span>
                  <span className="figure text-[12px] text-ink-3">
                    API {gr.api}, S {gr.sulfur_pct}%,{" "}
                    <span className={gr.benchmark_diff_usd < 0 ? "text-risk-low" : "text-ink-2"}>
                      {gr.benchmark_diff_usd > 0 ? "+" : ""}{gr.benchmark_diff_usd} vs Brent
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          <h3 className="section-label mb-1 mt-4">Routes to India</h3>
          <div>
            {routes
              .filter((r) => selection.supplier.export_terminals.some((t) => r.from_terminals.includes(t.id)))
              .map((r, i) => (
                <div key={r.id} className={`py-2 ${i > 0 ? "hairline-section" : ""}`}>
                  <div className="text-[13px] text-ink-2">{r.name}</div>
                  <div className="figure mt-0.5 text-[12px] text-ink-3">
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
          <div className="figure hairline-section grid grid-cols-2 gap-y-2 pb-4 text-[13px] text-ink-2">
            <span><span className="text-ink-3">Capacity</span> {selection.refinery.capacity_mmtpa} MMTPA</span>
            <span><span className="text-ink-3">Complexity</span> NCI {selection.refinery.nelson_complexity}</span>
            <span><span className="text-ink-3">Operator</span> {selection.refinery.operator}</span>
            <span><span className="text-ink-3">State</span> {selection.refinery.state}</span>
          </div>
          <h3 className="section-label mb-2 mt-4">Crude diet</h3>
          <div className="flex flex-wrap gap-2">
            {selection.refinery.crude_diet.map((d) => (
              <span key={d} className="rounded-full bg-surface-2 px-3 py-1 text-[12px] text-ink-2">
                {d.replace("_", " ")}
              </span>
            ))}
            <span className="rounded-full bg-surface-2 px-3 py-1 text-[12px] text-ink-2">
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
          <div className="figure hairline-section grid grid-cols-2 gap-y-2 pb-4 text-[13px] text-ink-2">
            <span><span className="text-ink-3">Global flow</span> {selection.chokepoint.daily_oil_flow_mbd} mb/d</span>
            <span><span className="text-ink-3">India exposure</span> {selection.chokepoint.supply_at_risk_pct}%</span>
          </div>
          <h3 className="section-label mb-1 mt-4">Alternatives if closed</h3>
          <p className="text-[13px] leading-relaxed text-ink-2">{selection.chokepoint.alternatives}</p>
        </>
      )}
    </div>
  );
}
