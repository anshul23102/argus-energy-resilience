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

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <p className="caption mb-6 max-w-2xl">
        A batched language model reads roughly 500 headlines per polling cycle from GDELT and
        Google News, extracts corridor and severity, and clusters same-incident coverage so
        volume does not inflate the risk score. This is perception only, the scoring math lives
        in the risk engine.
      </p>

      <div className="mb-5 flex flex-wrap gap-2">
        <button
          onClick={() => setCorridorFilter("all")}
          className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors duration-150 ${corridorFilter === "all" ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2 hover:bg-surface-3"}`}
        >
          All corridors
        </button>
        {corridors.map((c) => (
          <button
            key={c}
            onClick={() => setCorridorFilter(c)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium capitalize transition-colors duration-150 ${corridorFilter === c ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2 hover:bg-surface-3"}`}
          >
            {c.replace(/-/g, " ")}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-[13px] text-ink-2">No corroborated signals in this window.</p>
        </div>
      )}

      <div className="space-y-2.5">
        {filtered.map((e, i) => (
          <div key={i} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium capitalize text-ink-2">{e.corridor.replace(/-/g, " ")}</span>
              <div className="flex items-center gap-2">
                {e.corroborations > 1 && (
                  <span className="figure rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-3">
                    {e.corroborations} sources
                  </span>
                )}
                <span className={`text-[11px] font-medium uppercase tracking-wide ${SEVERITY_TONE[e.severity] ?? "text-ink-2"}`}>
                  {e.severity.replace("_", " ")}
                </span>
              </div>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink">{e.summary}</p>
            <p className="caption mt-1.5 truncate">{e.source}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
