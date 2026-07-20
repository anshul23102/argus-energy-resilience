"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { PathLayer, ScatterplotLayer, TextLayer } from "deck.gl";
import { api, BacktestRow, Chokepoint, CorridorRisk, IntelEvent, Port, Prices, Refinery, Route, SprSite } from "@/lib/api";
import ScenarioConsole from "@/components/ScenarioConsole";
import AssumptionsPanel from "@/components/AssumptionsPanel";

const SEVERITY_STYLE: Record<string, string> = {
  rhetoric: "text-ink-3", incident: "text-risk-elevated",
  attack: "text-risk-high", partial_closure: "text-risk-high", full_closure: "text-risk-high",
};

// deck.gl needs rgb arrays; CSS gets the OKLCH tokens via var()
const RISK_RGB: Record<string, [number, number, number]> = {
  low: [82, 216, 166], elevated: [235, 185, 70], high: [232, 92, 78],
};
const RISK_VAR: Record<string, string> = {
  low: "var(--risk-low)", elevated: "var(--risk-elevated)", high: "var(--risk-high)",
};

function riskBand(p: number): "low" | "elevated" | "high" {
  if (p >= 0.15) return "high";
  if (p >= 0.05) return "elevated";
  return "low";
}

export default function WarRoom() {
  const mapDiv = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
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
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

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
      // Self-hosted basemap (Natural Earth land polygons, bundled in /public):
      // zero external requests — the war room renders on venue wifi or none at all.
      style: {
        version: 8,
        sources: { land: { type: "geojson", data: "/land.geojson" } },
        layers: [
          { id: "ocean", type: "background", paint: { "background-color": "#0d1523" } },
          { id: "land", type: "fill", source: "land", paint: { "fill-color": "#16202f" } },
          { id: "coast", type: "line", source: "land", paint: { "line-color": "#2c3d55", "line-width": 0.6 } },
        ],
      },
      center: [62, 18],
      zoom: 3.1,
      attributionControl: false,
    });
    mapRef.current = map;

    const riskByCp = Object.fromEntries(risk.map((r) => [r.chokepoint, r.posterior_horizon_prob]));

    const layers = [
      new PathLayer<Route>({
        id: "routes",
        data: routes,
        getPath: (d) => d.waypoints,
        getColor: (d) => {
          const worst = Math.max(0, ...d.chokepoints.map((c) => riskByCp[c] ?? 0));
          const [r, g, b] = RISK_RGB[riskBand(worst)];
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
          const [r, g, b] = RISK_RGB[riskBand(riskByCp[d.id] ?? 0)];
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
    // map may initialize before the flex layout settles — keep canvas synced to container
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(mapDiv.current);
    map.once("load", () => map.resize());
    map.on("error", (e) => console.error("maplibre:", e.error?.message ?? e));
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
  }, [refineries, ports, spr, chokepoints, routes, risk]);

  const flyToCorridor = (id: string) => {
    const cp = chokepoints.find((c) => c.id === id);
    if (cp && mapRef.current) {
      mapRef.current.flyTo({ center: [cp.lon, cp.lat], zoom: 5.2, duration: 1200 });
    }
  };

  const totalCapacity = refineries.reduce((s, r) => s + r.capacity_mmtpa, 0);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-bg text-ink">
      {/* Top bar */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between border-b border-hairline bg-surface/90 px-5 py-2 backdrop-blur">
        <div className="flex items-baseline gap-3">
          <span className="text-[15px] font-semibold tracking-[0.22em] text-accent">ARGUS</span>
          <span className="hidden text-[11px] text-ink-3 lg:inline">Energy supply chain intelligence — India crude network</span>
        </div>
        <div className="flex items-center gap-5 text-[11px]">
          {prices && (
            <span className="figure flex gap-4">
              {(["brent", "wti", "usd_inr"] as const).map((k) => {
                const q = prices[k];
                const up = q.change_pct >= 0;
                return (
                  <span key={k} className="text-ink-2">
                    <span className="text-ink-3">{k === "usd_inr" ? "USD/INR" : k.toUpperCase()}</span>{" "}
                    {q.price.toFixed(2)}{" "}
                    <span className={up ? "text-risk-high" : "text-risk-low"}>
                      {up ? "▲" : "▼"}{Math.abs(q.change_pct).toFixed(1)}%
                    </span>
                    {q.stale && <span className="text-accent"> stale</span>}
                  </span>
                );
              })}
            </span>
          )}
          <span className="hidden text-ink-3 xl:inline">graph {graphStats}</span>
          <span className="figure text-ink-2">{clock}</span>
          <button
            onClick={() => setAssumptionsOpen((v) => !v)}
            className={`rounded border px-2 py-0.5 text-[11px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent ${
              assumptionsOpen
                ? "border-accent/60 bg-accent/10 text-accent"
                : "border-hairline text-ink-2 hover:bg-surface-2"
            }`}
          >
            Assumptions
          </button>
          <span className="flex items-center gap-1.5">
            <span className={`live-dot h-1.5 w-1.5 rounded-full ${apiDown ? "bg-risk-high" : "bg-risk-low"}`} />
            <span className={apiDown ? "text-risk-high" : "text-risk-low"}>{apiDown ? "OFFLINE" : "LIVE"}</span>
          </span>
        </div>
      </header>

      {/* Corridor risk sidebar */}
      <aside className="absolute left-0 top-11 bottom-0 z-10 w-80 overflow-y-auto border-r border-hairline bg-surface/85 p-4 backdrop-blur">
        <h2 className="panel-title mb-3">Corridor disruption risk · 30d</h2>
        {risk
          .filter((r) => chokepoints.find((c) => c.id === r.chokepoint && c.daily_oil_flow_mbd))
          .sort((a, b) => b.posterior_horizon_prob - a.posterior_horizon_prob)
          .map((r) => {
            const cp = chokepoints.find((c) => c.id === r.chokepoint)!;
            const band = riskBand(r.posterior_horizon_prob);
            const pct = (r.posterior_horizon_prob * 100).toFixed(1);
            return (
              <button
                key={r.chokepoint}
                onClick={() => flyToCorridor(r.chokepoint)}
                title={`Fly to ${cp.name}`}
                className="mb-2.5 block w-full rounded-md border border-hairline/60 bg-surface-2/40 p-3 text-left transition-colors duration-150 hover:border-hairline hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-ink">{cp.name}</span>
                  <span className="figure text-[13px] font-semibold" style={{ color: RISK_VAR[band] }}>
                    {pct}%
                  </span>
                </div>
                <div className="mt-1.5 h-1 w-full rounded bg-bg">
                  <div
                    className="h-1 rounded transition-[width] duration-300 ease-out"
                    style={{ width: `${Math.min(100, r.posterior_horizon_prob * 400)}%`, background: RISK_VAR[band] }}
                  />
                </div>
                <div className="figure mt-1.5 flex justify-between text-[10px] text-ink-3">
                  <span>{cp.supply_at_risk_pct}% imports exposed</span>
                  <span>prior {(r.prior_horizon_prob * 100).toFixed(1)}%</span>
                </div>
                {r.drivers.length > 0 && (
                  <div className="mt-2 border-t border-hairline/60 pt-1.5 text-[10px] leading-relaxed text-ink-2">
                    {r.drivers.slice(0, 2).map((d, i) => (
                      <div key={i} className="truncate">▸ {d.summary}</div>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        <div className="mt-4 border-t border-hairline pt-3 text-[10px] leading-relaxed text-ink-3">
          Network: {refineries.length} refineries · {totalCapacity.toFixed(0)} MMTPA ·{" "}
          {ports.length} import terminals · {spr.length} SPR sites (5.33 MMT).
          Risk = Bayesian posterior; priors and likelihood ratios in assumptions.yaml.
        </div>
      </aside>

      {/* Map */}
      <div className="absolute inset-0">
        <div ref={mapDiv} className="h-full w-full" />
      </div>

      {/* Right rail: live intel + validation */}
      <aside className="absolute right-0 top-11 bottom-0 z-10 flex w-96 flex-col gap-3 overflow-y-auto border-l border-hairline bg-surface/85 p-4 backdrop-blur">
        <div>
          <h2 className="panel-title mb-2">Live intel feed · GDELT 15-min</h2>
          {intel.length === 0 && (
            <div className="rounded-md border border-hairline/60 bg-surface-2/40 p-3 text-[11px] text-ink-3">
              No corroborated signals in window. Watching.
            </div>
          )}
          {intel.slice(0, 8).map((e, i) => (
            <div key={i} className="mb-2 rounded-md border border-hairline/60 bg-surface-2/40 p-2.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="figure uppercase text-ink-3">{e.corridor}</span>
                <span className="flex items-center gap-2">
                  {e.corroborations > 1 && (
                    <span className="figure rounded bg-surface-2 px-1 text-ink-2">×{e.corroborations} sources</span>
                  )}
                  <span className={`figure uppercase ${SEVERITY_STYLE[e.severity] ?? "text-ink-2"}`}>{e.severity}</span>
                </span>
              </div>
              <div className="mt-1 text-[11px] leading-snug text-ink-2">{e.summary}</div>
              <div className="mt-1 truncate text-[10px] text-ink-3">{e.source}</div>
            </div>
          ))}
        </div>

        <div className="mt-auto">
          <h2 className="panel-title mb-2">Engine validation · historical replay</h2>
          {backtests.map((b) => (
            <div key={b.id} className="mb-2 rounded-md border border-hairline/60 bg-surface-2/40 p-2.5">
              <div className="text-[11px] text-ink-2">{b.name}</div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-ink-3">
                <span className="figure">alert {b.alert_date ?? "—"} → impact {b.peak_impact_date}</span>
                <span className={`figure font-semibold ${(b.lead_time_days ?? 0) > 0 ? "text-risk-low" : "text-risk-elevated"}`}>
                  {b.lead_time_days != null ? `+${b.lead_time_days}d lead` : "no alert"}
                </span>
              </div>
            </div>
          ))}
          {backtests.length > 0 && (
            <div className="text-[10px] leading-relaxed text-ink-3">
              Same Bayesian engine as live scoring, replayed over real 2019–24 crises.
              Calibrated on 2019, validated out-of-sample on 2023–24. No look-ahead.
            </div>
          )}
        </div>
      </aside>

      <ScenarioConsole
        chokepoints={chokepoints.filter((c) => c.daily_oil_flow_mbd).map((c) => ({ id: c.id, name: c.name }))}
      />

      <AssumptionsPanel open={assumptionsOpen} onClose={() => setAssumptionsOpen(false)} />

      {/* Tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute z-30 rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-[11px] text-ink"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          {hover.text}
        </div>
      )}
    </main>
  );
}
