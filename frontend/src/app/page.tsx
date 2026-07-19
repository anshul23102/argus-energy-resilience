"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { PathLayer, ScatterplotLayer, TextLayer } from "deck.gl";
import { api, BacktestRow, Chokepoint, CorridorRisk, IntelEvent, Port, Prices, Refinery, Route, SprSite } from "@/lib/api";
import ScenarioConsole from "@/components/ScenarioConsole";

const SEVERITY_STYLE: Record<string, string> = {
  rhetoric: "text-slate-400", incident: "text-amber-300",
  attack: "text-red-400", partial_closure: "text-red-300", full_closure: "text-red-200",
};

const RISK_COLORS: Record<string, [number, number, number]> = {
  low: [52, 211, 153],      // emerald
  elevated: [251, 191, 36], // amber
  high: [248, 113, 113],    // red
};

function riskBand(p: number): keyof typeof RISK_COLORS {
  if (p >= 0.15) return "high";
  if (p >= 0.05) return "elevated";
  return "low";
}

export default function WarRoom() {
  const mapDiv = useRef<HTMLDivElement>(null);
  const [refineries, setRefineries] = useState<Refinery[]>([]);
  const [ports, setPorts] = useState<Port[]>([]);
  const [spr, setSpr] = useState<SprSite[]>([]);
  const [chokepoints, setChokepoints] = useState<Chokepoint[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [risk, setRisk] = useState<CorridorRisk[]>([]);
  const [graphStats, setGraphStats] = useState<string>("");
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const [clock, setClock] = useState<string>("");
  const [apiDown, setApiDown] = useState(false);
  const [prices, setPrices] = useState<Prices | null>(null);
  const [intel, setIntel] = useState<IntelEvent[]>([]);
  const [backtests, setBacktests] = useState<BacktestRow[]>([]);

  useEffect(() => {
    const load = () => {
      api.prices().then(setPrices).catch(() => {});
      api.events().then(setIntel).catch(() => {});
      api.corridorRisk().then(setRisk).catch(() => {});
    };
    load();
    const t = setInterval(load, 60_000);
    api.backtests().then(setBacktests).catch(() => {});
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toISOString().slice(0, 19).replace("T", " ") + "Z"), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    Promise.all([api.refineries(), api.ports(), api.spr(), api.chokepoints(), api.routes(), api.corridorRisk(), api.graphStats()])
      .then(([rf, po, sp, cp, rt, rk, gs]) => {
        setRefineries(rf); setPorts(po); setSpr(sp); setChokepoints(cp); setRoutes(rt); setRisk(rk);
        setGraphStats(`${gs.nodes} nodes · ${gs.edges} edges`);
      })
      .catch(() => setApiDown(true));
  }, []);

  useEffect(() => {
    if (!mapDiv.current || refineries.length === 0) return;

    const map = new maplibregl.Map({
      container: mapDiv.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
      center: [62, 18],
      zoom: 3.1,
      attributionControl: false,
    });

    const riskByCp = Object.fromEntries(risk.map((r) => [r.chokepoint, r.posterior_horizon_prob]));

    const layers = [
      new PathLayer<Route>({
        id: "routes",
        data: routes,
        getPath: (d) => d.waypoints,
        getColor: (d) => {
          const worst = Math.max(0, ...d.chokepoints.map((c) => riskByCp[c] ?? 0));
          const [r, g, b] = RISK_COLORS[riskBand(worst)];
          return [r, g, b, 90];
        },
        getWidth: 2,
        widthUnits: "pixels",
        pickable: true,
        onHover: (i) =>
          setHover(i.object ? { x: i.x, y: i.y, text: `${i.object.name} — ${i.object.distance_nm} nm · ${i.object.voyage_days}d` } : null),
      }),
      new ScatterplotLayer<Chokepoint>({
        id: "chokepoints",
        data: chokepoints.filter((c) => c.daily_oil_flow_mbd),
        getPosition: (d) => [d.lon, d.lat],
        getRadius: (d) => 40000 + d.supply_at_risk_pct * 6000,
        getFillColor: (d) => {
          const [r, g, b] = RISK_COLORS[riskBand(riskByCp[d.id] ?? 0)];
          return [r, g, b, 170];
        },
        stroked: true,
        getLineColor: [255, 255, 255, 200],
        getLineWidth: 2,
        lineWidthUnits: "pixels",
        pickable: true,
        onHover: (i) =>
          setHover(i.object ? { x: i.x, y: i.y, text: `${i.object.name} — ${i.object.supply_at_risk_pct}% of India's imports exposed` } : null),
      }),
      new ScatterplotLayer<Refinery>({
        id: "refineries",
        data: refineries,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: (d) => 12000 + d.capacity_mmtpa * 1800,
        getFillColor: [96, 165, 250, 200],
        stroked: true,
        getLineColor: [30, 58, 138, 255],
        getLineWidth: 1,
        lineWidthUnits: "pixels",
        pickable: true,
        onHover: (i) =>
          setHover(i.object ? { x: i.x, y: i.y, text: `${i.object.name} — ${i.object.capacity_mmtpa} MMTPA · NCI ${i.object.nelson_complexity}` } : null),
      }),
      new ScatterplotLayer<Port>({
        id: "ports",
        data: ports,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: 9000,
        getFillColor: [232, 121, 249, 190],
        pickable: true,
        onHover: (i) => setHover(i.object ? { x: i.x, y: i.y, text: `⚓ ${i.object.name}${i.object.handles_vlcc ? " · VLCC" : ""}` } : null),
      }),
      new ScatterplotLayer<SprSite>({
        id: "spr",
        data: spr,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: 14000,
        getFillColor: [250, 204, 21, 210],
        stroked: true,
        getLineColor: [120, 90, 0, 255],
        pickable: true,
        onHover: (i) => setHover(i.object ? { x: i.x, y: i.y, text: `🛢 ${i.object.name} — ${i.object.capacity_mmt} MMT` } : null),
      }),
      new TextLayer<Chokepoint>({
        id: "cp-labels",
        data: chokepoints.filter((c) => c.daily_oil_flow_mbd),
        getPosition: (d) => [d.lon, d.lat],
        getText: (d) => d.name.replace("Strait of ", "").replace(" Canal / SUMED", ""),
        getSize: 11,
        getColor: [226, 232, 240, 220],
        getPixelOffset: [0, -18],
        fontFamily: "ui-monospace, monospace",
      }),
    ];

    const overlay = new MapboxOverlay({ layers });
    map.addControl(overlay);
    return () => { map.remove(); };
  }, [refineries, ports, spr, chokepoints, routes, risk]);

  const totalCapacity = refineries.reduce((s, r) => s + r.capacity_mmtpa, 0);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0a0f1a] text-slate-200 font-mono">
      {/* Top bar */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between border-b border-slate-800 bg-[#0a0f1a]/90 px-5 py-2.5 backdrop-blur">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-bold tracking-[0.3em] text-amber-400">ARGUS</span>
          <span className="text-[11px] text-slate-500">ENERGY SUPPLY CHAIN INTELLIGENCE · INDIA CRUDE NETWORK</span>
        </div>
        <div className="flex items-center gap-6 text-[11px]">
          {prices && (
            <span className="flex gap-4">
              {(["brent", "wti", "usd_inr"] as const).map((k) => {
                const q = prices[k];
                const up = q.change_pct >= 0;
                return (
                  <span key={k} className="text-slate-300">
                    <span className="text-slate-500">{k === "usd_inr" ? "USD/INR" : k.toUpperCase()}</span>{" "}
                    {q.price.toFixed(2)}{" "}
                    <span className={up ? "text-red-400" : "text-emerald-400"}>
                      {up ? "▲" : "▼"}{Math.abs(q.change_pct).toFixed(1)}%
                    </span>
                    {q.stale && <span className="text-amber-500"> ⚠stale</span>}
                  </span>
                );
              })}
            </span>
          )}
          <span className="text-slate-500">KG {graphStats}</span>
          <span className="text-slate-400">{clock}</span>
          <span className={`rounded px-2 py-0.5 ${apiDown ? "bg-red-900 text-red-200" : "bg-emerald-900/60 text-emerald-300"}`}>
            {apiDown ? "BACKEND OFFLINE" : "LIVE"}
          </span>
        </div>
      </header>

      {/* Corridor risk sidebar */}
      <aside className="absolute left-0 top-12 bottom-0 z-10 w-80 overflow-y-auto border-r border-slate-800 bg-[#0a0f1a]/85 p-4 backdrop-blur">
        <h2 className="mb-3 text-[11px] tracking-[0.25em] text-slate-500">CORRIDOR DISRUPTION RISK · 30D</h2>
        {risk
          .filter((r) => chokepoints.find((c) => c.id === r.chokepoint && c.daily_oil_flow_mbd))
          .sort((a, b) => b.posterior_horizon_prob - a.posterior_horizon_prob)
          .map((r) => {
            const cp = chokepoints.find((c) => c.id === r.chokepoint)!;
            const band = riskBand(r.posterior_horizon_prob);
            const pct = (r.posterior_horizon_prob * 100).toFixed(1);
            return (
              <div key={r.chokepoint} className="mb-3 rounded border border-slate-800 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-slate-200">{cp.name}</span>
                  <span
                    className="text-[13px] font-bold"
                    style={{ color: `rgb(${RISK_COLORS[band].join(",")})` }}
                  >
                    {pct}%
                  </span>
                </div>
                <div className="mt-1.5 h-1 w-full rounded bg-slate-800">
                  <div
                    className="h-1 rounded"
                    style={{
                      width: `${Math.min(100, r.posterior_horizon_prob * 400)}%`,
                      background: `rgb(${RISK_COLORS[band].join(",")})`,
                    }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] text-slate-500">
                  <span>{cp.supply_at_risk_pct}% imports exposed</span>
                  <span>prior {(r.prior_horizon_prob * 100).toFixed(1)}%</span>
                </div>
                {r.drivers.length > 0 && (
                  <div className="mt-2 border-t border-slate-800 pt-1.5 text-[10px] text-slate-400">
                    {r.drivers.slice(0, 2).map((d, i) => (
                      <div key={i} className="truncate">▸ {d.summary}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        <div className="mt-4 border-t border-slate-800 pt-3 text-[10px] leading-relaxed text-slate-500">
          NETWORK: {refineries.length} refineries · {totalCapacity.toFixed(0)} MMTPA capacity ·{" "}
          {ports.length} import terminals · {spr.length} SPR sites (5.33 MMT)
          <br />
          Risk = Bayesian posterior, priors + live event likelihood ratios (assumptions.yaml).
        </div>
      </aside>

      {/* Map */}
      <div className="absolute inset-0">
        <div ref={mapDiv} className="h-full w-full" />
      </div>

      {/* Right rail: live intel + validation */}
      <aside className="absolute right-0 top-12 bottom-0 z-10 flex w-96 flex-col gap-3 overflow-y-auto border-l border-slate-800 bg-[#0a0f1a]/85 p-4 backdrop-blur">
        <div>
          <h2 className="mb-2 text-[11px] tracking-[0.25em] text-slate-500">
            LIVE INTEL FEED <span className="text-slate-600">· GDELT 15-MIN</span>
          </h2>
          {intel.length === 0 && (
            <div className="rounded border border-slate-800 bg-slate-900/50 p-3 text-[11px] text-slate-500">
              No corroborated signals in window. Watching.
            </div>
          )}
          {intel.slice(0, 8).map((e, i) => (
            <div key={i} className="mb-2 rounded border border-slate-800 bg-slate-900/50 p-2.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="uppercase tracking-wider text-slate-500">{e.corridor}</span>
                <span>
                  {e.corroborations > 1 && (
                    <span className="mr-2 rounded bg-slate-800 px-1 text-slate-400">×{e.corroborations} sources</span>
                  )}
                  <span className={`uppercase ${SEVERITY_STYLE[e.severity] ?? "text-slate-400"}`}>{e.severity}</span>
                </span>
              </div>
              <div className="mt-1 text-[11px] leading-snug text-slate-300">{e.summary}</div>
              <div className="mt-1 text-[10px] text-slate-600">{e.source}</div>
            </div>
          ))}
        </div>

        <div className="mt-auto">
          <h2 className="mb-2 text-[11px] tracking-[0.25em] text-slate-500">
            ENGINE VALIDATION <span className="text-slate-600">· HISTORICAL REPLAY</span>
          </h2>
          {backtests.map((b) => (
            <div key={b.id} className="mb-2 rounded border border-slate-800 bg-slate-900/50 p-2.5">
              <div className="text-[11px] text-slate-300">{b.name}</div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                <span>alert {b.alert_date ?? "—"} → impact {b.peak_impact_date}</span>
                <span className={`font-bold ${(b.lead_time_days ?? 0) > 0 ? "text-emerald-400" : "text-amber-400"}`}>
                  {b.lead_time_days != null ? `+${b.lead_time_days}d lead` : "no alert"}
                </span>
              </div>
            </div>
          ))}
          {backtests.length > 0 && (
            <div className="text-[10px] leading-relaxed text-slate-600">
              Same Bayesian engine as live scoring, replayed over real 2019–24 crises.
              Calibrated on 2019, validated out-of-sample on 2023–24. No look-ahead.
            </div>
          )}
        </div>
      </aside>

      <ScenarioConsole
        chokepoints={chokepoints.filter((c) => c.daily_oil_flow_mbd).map((c) => ({ id: c.id, name: c.name }))}
      />

      {/* Tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute z-30 rounded border border-slate-700 bg-slate-900/95 px-2.5 py-1.5 text-[11px] text-slate-200"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          {hover.text}
        </div>
      )}
    </main>
  );
}
