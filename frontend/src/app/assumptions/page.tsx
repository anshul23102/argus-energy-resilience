"use client";

import { useCallback, useEffect, useState } from "react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Param { path: string; label: string; unit: string; }

const GROUPS: { title: string; description: string; params: Param[] }[] = [
  {
    title: "Economics",
    description: "How a supply shock translates into price and macro impact.",
    params: [
      { path: "economics.global_price_sensitivity_usd_per_mbd", label: "Brent rise per mb/d lost", unit: "$/bbl" },
      { path: "price_transmission.crude_10usd_to_gdp_bps", label: "GDP impact per +$10/bbl", unit: "bps" },
      { path: "demand.india_crude_processing_mbd", label: "India processing rate", unit: "mb/d" },
    ],
  },
  {
    title: "Inventory and reserves",
    description: "How much buffer exists before refiners feel a shortage.",
    params: [
      { path: "inventory.commercial_stock_days", label: "Commercial stocks", unit: "days" },
      { path: "inventory.min_stock_days_floor", label: "Operational floor", unit: "days" },
      { path: "scenario_engine.spr_max_drawdown_mbd", label: "SPR max drawdown", unit: "mb/d" },
    ],
  },
  {
    title: "Response capability",
    description: "How fast and how expensive the system's own reaction is.",
    params: [
      { path: "response.war_risk_premium_usd_bbl", label: "War risk premium", unit: "$/bbl" },
      { path: "scenario_engine.refinery_min_run_rate_pct", label: "Refinery minimum run rate", unit: "%" },
      { path: "risk_engine.evidence_halflife_days", label: "Evidence half life", unit: "days" },
    ],
  },
];

type Values = Record<string, { value: number; confidence: string; overridden: boolean }>;

function dig(obj: unknown, path: string) {
  let node: any = obj; // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const k of path.split(".")) {
    if (node == null) return null;
    node = node[k];
  }
  if (node && typeof node === "object" && "value" in node) {
    return { value: node.value, confidence: String(node.confidence ?? "unknown"), overridden: Boolean(node.overridden) };
  }
  return null;
}

export default function AssumptionsPage() {
  const [values, setValues] = useState<Values>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/assumptions`);
      const data = (await r.json()).assumptions;
      const next: Values = {};
      for (const g of GROUPS) for (const p of g.params) {
        const v = dig(data, p.path);
        if (v) next[p.path] = v;
      }
      setValues(next);
      setDrafts({});
    } catch { /* backend unreachable, panel keeps last known values */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const apply = async (path: string) => {
    const draft = drafts[path];
    if (draft === undefined || draft === "" || Number.isNaN(Number(draft))) return;
    setBusy(true);
    try {
      await fetch(`${BASE}/api/assumptions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, value: Number(draft) }),
      });
      await load();
    } finally { setBusy(false); }
  };

  const resetAll = async () => {
    setBusy(true);
    try {
      await fetch(`${BASE}/api/assumptions`, { method: "DELETE" });
      await load();
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <p className="caption mb-8 max-w-2xl">
        Every parameter the engines use, sourced and confidence rated in{" "}
        <span className="figure">data/assumptions.yaml</span>. Change one here and re-run the{" "}
        <a href="/scenario" className="text-accent hover:underline">Scenario Console</a> to see the
        cascade move. Edits are session only, the file on disk stays authoritative.
      </p>

      {GROUPS.map((g) => (
        <section key={g.title} className="mb-6">
          <h2 className="text-[15px] font-semibold text-ink">{g.title}</h2>
          <p className="caption mb-3 mt-0.5">{g.description}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {g.params.map((p) => {
              const v = values[p.path];
              return (
                <div key={p.path} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <label htmlFor={p.path} className="text-[12px] leading-snug text-ink-2">{p.label}</label>
                    {v?.overridden && (
                      <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-accent">edited</span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      id={p.path} type="number" step="any"
                      placeholder={v ? String(v.value) : "."}
                      value={drafts[p.path] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [p.path]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && apply(p.path)}
                      className="figure w-full rounded border border-hairline bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
                    />
                    <span className="caption shrink-0">{p.unit}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    {v && <span className="caption">Confidence: {v.confidence}</span>}
                    <button
                      onClick={() => apply(p.path)}
                      disabled={busy || !drafts[p.path]}
                      className="ml-auto rounded border border-hairline px-2.5 py-1 text-[11px] text-ink-2 transition-colors duration-150 hover:border-accent hover:text-accent disabled:opacity-30"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <button
        onClick={resetAll} disabled={busy}
        className="rounded-md border border-hairline px-4 py-2 text-[13px] text-ink-2 transition-colors duration-150 hover:bg-surface-2 disabled:opacity-40"
      >
        Reset all to file defaults
      </button>
    </div>
  );
}
