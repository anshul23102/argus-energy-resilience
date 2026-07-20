"use client";

import { GradeInfo, Refinery, Route, Supplier } from "@/lib/api";

export type Selection =
  | { kind: "supplier"; supplier: Supplier }
  | { kind: "refinery"; refinery: Refinery };

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

  const body =
    selection.kind === "supplier" ? (
      <SupplierBody s={selection.supplier} grades={grades} routes={routes} />
    ) : (
      <RefineryBody r={selection.refinery} />
    );

  const title =
    selection.kind === "supplier" ? selection.supplier.name : selection.refinery.name;

  return (
    <div className="absolute bottom-4 left-[336px] z-20 w-[360px] max-h-[60vh] overflow-y-auto rounded-md border border-hairline bg-surface/97 p-4 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
        <button
          onClick={onClose}
          className="rounded px-1.5 text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          ✕
        </button>
      </div>
      {body}
    </div>
  );
}

function SupplierBody({ s, grades, routes }: { s: Supplier; grades: Record<string, GradeInfo>; routes: Route[] }) {
  const terminalIds = new Set(s.export_terminals.map((t) => t.id));
  const supplierRoutes = routes.filter((r) => r.from_terminals?.some((t: string) => terminalIds.has(t)));
  return (
    <>
      <div className="figure mb-3 flex gap-4 text-[11px]">
        <span className="text-ink-2"><span className="text-ink-3">share</span> {s.share_pct}%</span>
        <span className={RISK_TONE[s.payment_risk.split(" ")[0]] ?? "text-ink-2"}>
          <span className="text-ink-3">payment risk</span> {s.payment_risk.split(" ")[0]}
        </span>
      </div>

      <h3 className="panel-title mb-1.5">Grades</h3>
      {s.grades.map((g) => {
        const gr = grades[g];
        if (!gr) return null;
        return (
          <div key={g} className="mb-1.5 flex items-baseline justify-between rounded-md border border-hairline/60 bg-surface-2/40 px-2.5 py-1.5">
            <span className="text-[11px] text-ink-2">{gr.name}</span>
            <span className="figure text-[10px] text-ink-3">
              API {gr.api} · S {gr.sulfur_pct}% ·{" "}
              <span className={gr.benchmark_diff_usd < 0 ? "text-risk-low" : "text-ink-2"}>
                {gr.benchmark_diff_usd > 0 ? "+" : ""}{gr.benchmark_diff_usd} vs Brent
              </span>
            </span>
          </div>
        );
      })}

      <h3 className="panel-title mb-1.5 mt-3">Routes to India</h3>
      {supplierRoutes.map((r) => (
        <div key={r.id} className="mb-1.5 rounded-md border border-hairline/60 bg-surface-2/40 px-2.5 py-1.5">
          <div className="text-[11px] text-ink-2">{r.name}</div>
          <div className="figure mt-0.5 text-[10px] text-ink-3">
            {r.distance_nm.toLocaleString()} nm · {r.voyage_days}d
            {r.chokepoints.length > 0 && <> · via {r.chokepoints.join(", ")}</>}
            {r.chokepoints.length === 0 && <> · no chokepoint</>}
          </div>
        </div>
      ))}

      {s.notes && <p className="mt-3 text-[10px] leading-relaxed text-ink-3">{s.notes}</p>}
    </>
  );
}

function RefineryBody({ r }: { r: Refinery }) {
  return (
    <>
      <div className="figure mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-2">
        <span><span className="text-ink-3">capacity</span> {r.capacity_mmtpa} MMTPA</span>
        <span><span className="text-ink-3">complexity</span> NCI {r.nelson_complexity}</span>
        <span><span className="text-ink-3">operator</span> {r.operator}</span>
        <span><span className="text-ink-3">state</span> {r.state}</span>
      </div>
      <h3 className="panel-title mb-1.5">Crude diet</h3>
      <div className="flex flex-wrap gap-1.5">
        {r.crude_diet.map((d) => (
          <span key={d} className="rounded border border-hairline/60 bg-surface-2/40 px-2 py-0.5 text-[10px] text-ink-2">
            {d.replace("_", " ")}
          </span>
        ))}
        <span className="rounded border border-hairline/60 bg-surface-2/40 px-2 py-0.5 text-[10px] text-ink-2">
          {r.sulfur_tolerance} tolerant
        </span>
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-ink-3">
        {r.coastal ? "Coastal — direct import berth" : `Inland — fed via ${r.import_port ?? "domestic"} ${r.pipeline ? `(${r.pipeline})` : ""}`}.
        A {r.sulfur_tolerance}-configured refinery: disruption scenarios must replace its barrels
        with grade families it can actually run — the procurement LP enforces this.
      </p>
    </>
  );
}
