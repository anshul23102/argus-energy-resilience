"use client";

import { useMemo, useState } from "react";
import { useNetworkData } from "@/lib/useNetworkData";

const SEVERITY_TONE: Record<string, string> = {
  rhetoric: "text-ink-3", incident: "text-risk-elevated",
  attack: "text-risk-high", partial_closure: "text-risk-high", full_closure: "text-risk-high",
};

export default function IntelligencePage() {
  const d = useNetworkData();
  const [corridorFilter, setCorridorFilter] = useState<string>("all");

  const corridors = useMemo(
    () => Array.from(new Set(d.intel.map((e) => e.corridor))).sort(),
    [d.intel],
  );
  const filtered = corridorFilter === "all" ? d.intel : d.intel.filter((e) => e.corridor === corridorFilter);

  const byCorridor = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of filtered) counts.set(e.corridor, (counts.get(e.corridor) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const bySeverity = useMemo(() => {
    const order = ["full_closure", "partial_closure", "attack", "incident", "rhetoric"];
    const counts = new Map<string, number>();
    for (const e of filtered) counts.set(e.severity, (counts.get(e.severity) ?? 0) + 1);
    return order.filter((s) => counts.has(s)).map((s) => [s, counts.get(s)!] as const);
  }, [filtered]);

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-x-14 px-8 py-10 lg:grid-cols-[1fr_320px] lg:px-16">
      <div className="max-w-[720px]">
        <p className="text-[15px] leading-relaxed text-ink-2">
          This is the raw evidence feeding the risk scores elsewhere in ARGUS, the events a corridor
          percentage actually moved on. A batched language model reads roughly 500 headlines per
          polling cycle from GDELT and Google News, extracts corridor and severity, and clusters
          same-incident coverage so volume does not inflate the score. This page is perception only,
          the scoring math lives in the risk engine.
        </p>

        <div className="mb-6 mt-8 flex flex-wrap gap-2">
          <button
            onClick={() => setCorridorFilter("all")}
            className={`rounded-full px-4 py-2 text-[13px] font-medium transition-colors duration-150 ${corridorFilter === "all" ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2 hover:bg-surface-3"}`}
          >
            All corridors
          </button>
          {corridors.map((c) => (
            <button
              key={c}
              onClick={() => setCorridorFilter(c)}
              className={`rounded-full px-4 py-2 text-[13px] font-medium capitalize transition-colors duration-150 ${corridorFilter === c ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2 hover:bg-surface-3"}`}
            >
              {c.replace(/-/g, " ")}
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="caption py-10 text-center">No corroborated signals in this window.</p>
        )}

        <div>
          {filtered.map((e, i) => (
            <div key={i} className={`py-4 ${i > 0 ? "hairline-section" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold capitalize text-ink-2">{e.corridor.replace(/-/g, " ")}</span>
                <div className="flex items-center gap-2">
                  {e.corroborations > 1 && (
                    <span className="figure rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-3">
                      {e.corroborations} sources
                    </span>
                  )}
                  <span className={`text-[12px] font-semibold uppercase tracking-wide ${SEVERITY_TONE[e.severity] ?? "text-ink-2"}`}>
                    {e.severity.replace("_", " ")}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-[15px] leading-relaxed text-ink">{e.summary}</p>
              <p className="caption mt-1.5 truncate">{e.source}</p>
            </div>
          ))}
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-10">
          <h2 className="section-title">Signal summary</h2>
          <p className="caption mt-1">{filtered.length} events in the current filter.</p>

          <h3 className="section-label mb-1 mt-6">By corridor</h3>
          <div>
            {byCorridor.map(([corridor, count], i) => (
              <div key={corridor} className={`flex items-center justify-between py-2 ${i > 0 ? "hairline-section" : ""}`}>
                <span className="text-[13px] capitalize text-ink-2">{corridor.replace(/-/g, " ")}</span>
                <span className="stat-value text-[16px] text-ink">{count}</span>
              </div>
            ))}
          </div>

          <h3 className="section-label mb-1 mt-6">By severity</h3>
          <div>
            {bySeverity.map(([severity, count], i) => (
              <div key={severity} className={`flex items-center justify-between py-2 ${i > 0 ? "hairline-section" : ""}`}>
                <span className={`text-[12px] font-semibold uppercase tracking-wide ${SEVERITY_TONE[severity] ?? "text-ink-2"}`}>
                  {severity.replace("_", " ")}
                </span>
                <span className="stat-value text-[16px] text-ink">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
