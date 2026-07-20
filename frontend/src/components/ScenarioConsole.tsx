"use client";

import { useEffect, useRef, useState } from "react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Order {
  supplier: string; grade: string; route: string; voyage_days: number;
  landed_usd_bbl: number; volume_mbd: number; first_arrival_days: number;
  premium_vs_baseline_usd_bbl: number;
}
interface Band { p10: number[]; p50: number[]; p90: number[]; }
interface Response {
  chokepoint_name: string;
  supply_gap_mbd: number;
  scenario_managed: { headline: Record<string, number>; trajectories: { stock_days: Band; brent: Band } };
  scenario_unmanaged: { headline: Record<string, number>; trajectories: { stock_days: Band } };
  procurement: { feasible: boolean; coverage_pct: number; first_relief_days: number | null; daily_premium_musd: number; orders: Order[] };
  spr: { total_released_mbbl: number; days_active: number };
  briefing: string;
  briefing_author: string;
  response_clock: { stage: string; elapsed_s: number }[];
  total_response_seconds: number;
}

function BandChart({ managed, unmanaged, floor }: { managed: Band; unmanaged: Band; floor: number }) {
  const W = 340, H = 110, n = managed.p50.length;
  const all = [...managed.p10, ...managed.p90, ...unmanaged.p10, ...unmanaged.p90, 0];
  const yMax = Math.max(...all) * 1.08;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - (v / yMax) * H;
  const path = (arr: number[]) => arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = (lo: number[], hi: number[]) =>
    path(hi) + " " + lo.slice().reverse().map((v, j) => `L${x(n - 1 - j).toFixed(1)},${y(v).toFixed(1)}`).join(" ") + " Z";
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full">
      <path d={area(unmanaged.p10, unmanaged.p90)} fill="rgba(248,113,113,0.15)" />
      <path d={area(managed.p10, managed.p90)} fill="rgba(52,211,153,0.15)" />
      <path d={path(unmanaged.p50)} stroke="#f87171" strokeWidth="1.5" fill="none" />
      <path d={path(managed.p50)} stroke="#34d399" strokeWidth="1.5" fill="none" />
      <line x1="0" x2={W} y1={y(floor)} y2={y(floor)} stroke="#facc15" strokeWidth="0.75" strokeDasharray="4 3" />
      <text x="2" y={y(floor) - 3} fill="#facc15" fontSize="7" fontFamily="monospace">operational floor {floor}d</text>
      <text x="2" y={H + 11} fill="#64748b" fontSize="7" fontFamily="monospace">day 0</text>
      <text x={W - 40} y={H + 11} fill="#64748b" fontSize="7" fontFamily="monospace">day {n}</text>
    </svg>
  );
}

export default function ScenarioConsole({ chokepoints }: { chokepoints: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [cp, setCp] = useState("hormuz");
  const [closure, setClosure] = useState(60);
  const [duration, setDuration] = useState(21);
  const [running, setRunning] = useState(false);
  const [res, setRes] = useState<Response | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // assumptions edited in the side panel → transparently re-run the shown scenario
  const hasResult = useRef(false);
  useEffect(() => {
    const rerun = () => { if (hasResult.current) run(); };
    window.addEventListener("argus:assumptions-changed", rerun);
    return () => window.removeEventListener("argus:assumptions-changed", rerun);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cp, closure, duration]);

  const run = async () => {
    setRunning(true); setErr(null);
    try {
      const r = await fetch(`${BASE}/api/scenario/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chokepoint: cp, closure_pct: closure, duration_days: duration }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      setRes(await r.json());
      hasResult.current = true;
    } catch (e) {
      setErr(String(e));
    } finally {
      setRunning(false);
    }
  };

  const h = res?.scenario_managed.headline;
  const hu = res?.scenario_unmanaged.headline;

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded border border-accent/40 bg-surface/95 px-5 py-2 text-[12px] tracking-[0.14em] text-accent backdrop-blur transition-colors duration-150 hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent"
      >
        {open ? "▼ CLOSE SCENARIO CONSOLE" : "▲ SCENARIO CONSOLE — WHAT IF?"}
      </button>

      {open && (
        <div className="absolute bottom-16 left-1/2 z-20 max-h-[72vh] w-[880px] max-w-[92vw] -translate-x-1/2 overflow-y-auto rounded border border-hairline bg-surface/97 p-4 shadow-2xl backdrop-blur">
          {/* controls */}
          <div className="flex flex-wrap items-end gap-4 border-b border-hairline pb-3">
            <label className="panel-title">
              CHOKEPOINT
              <select value={cp} onChange={(e) => setCp(e.target.value)}
                className="mt-1 block rounded border border-hairline bg-bg px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none">
                {chokepoints.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="panel-title">
              CLOSURE {closure}%
              <input type="range" min={10} max={100} step={5} value={closure}
                onChange={(e) => setClosure(+e.target.value)} className="mt-2 block w-40 accent-[color:var(--accent)]" />
            </label>
            <label className="panel-title">
              MEAN DURATION {duration}d
              <input type="range" min={7} max={60} step={1} value={duration}
                onChange={(e) => setDuration(+e.target.value)} className="mt-2 block w-40 accent-[color:var(--accent)]" />
            </label>
            <button onClick={run} disabled={running}
              className="ml-auto rounded bg-accent px-5 py-1.5 text-[12px] font-semibold tracking-wide text-[oklch(0.2_0.02_250)] transition-colors duration-150 hover:brightness-110 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              {running ? "SIMULATING…" : "RUN RESPONSE"}
            </button>
          </div>

          {err && <div className="mt-3 text-[11px] text-risk-high">backend error: {err}</div>}

          {res && h && hu && (
            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* left: impact */}
              <div>
                <div className="mb-1 flex justify-between panel-title">
                  <span>CRUDE COVER · DAYS (P10–P90)</span>
                  <span><span className="text-risk-low">— managed</span> · <span className="text-risk-high">— unmanaged</span></span>
                </div>
                <BandChart managed={res.scenario_managed.trajectories.stock_days}
                           unmanaged={res.scenario_unmanaged.trajectories.stock_days} floor={7} />
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  {[
                    ["PEAK BRENT", `$${h.peak_brent_p50}`],
                    ["PETROL Δ*", `+₹${h.retail_petrol_delta_inr_per_litre_p50}/L`],
                    ["GDP", `${h.gdp_impact_bps_p50} bps`],
                    ["MIN COVER", `${h.min_stock_days_p50}d vs ${hu.min_stock_days_p50}d`],
                    ["GAP", `${res.supply_gap_mbd} mb/d`],
                    ["RESPONSE", `${res.total_response_seconds}s`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded border border-hairline/60 bg-surface-2/40 p-2">
                      <div className="text-[9px] text-ink-3">{k}</div>
                      <div className="figure text-[13px] font-semibold text-ink">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-1 text-[9px] text-ink-3">*full pass-through, no excise buffer — see assumptions.yaml</div>
                <div className="mt-2 rounded border border-hairline/60 bg-surface-2/40 p-2 text-[10px] leading-relaxed text-ink-2 whitespace-pre-wrap">
                  {res.briefing}
                  <div className="figure mt-1 text-ink-3">briefing: {res.briefing_author} · clock: {res.response_clock.map((c) => `${c.stage.split(":")[0]} ${c.elapsed_s}s`).join(" → ")}</div>
                </div>
              </div>

              {/* right: order sheet */}
              <div>
                <div className="mb-1 flex justify-between panel-title">
                  <span>EXECUTABLE ORDER SHEET (LP-OPTIMIZED)</span>
                  <span>{res.procurement.coverage_pct}% of gap · Δ${res.procurement.daily_premium_musd}M/day</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] border-separate border-spacing-0 text-[10px]">
                    <thead>
                      <tr className="text-left text-ink-3">
                        <th className="border-b border-hairline py-1 pr-3">SUPPLIER</th>
                        <th className="border-b border-hairline pr-3">GRADE</th>
                        <th className="border-b border-hairline pr-3">ROUTE</th>
                        <th className="border-b border-hairline pr-3 text-right">MB/D</th>
                        <th className="border-b border-hairline pr-3 text-right">ETA</th>
                        <th className="border-b border-hairline text-right">$/BBL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {res.procurement.orders.map((o, i) => (
                        <tr key={i} className="text-ink-2">
                          <td className="whitespace-nowrap border-b border-hairline/50 py-1.5 pr-3">{o.supplier}</td>
                          <td className="whitespace-nowrap border-b border-hairline/50 pr-3 text-accent/90">{o.grade}</td>
                          <td className="whitespace-nowrap border-b border-hairline/50 pr-3 text-ink-3">{o.route}</td>
                          <td className="border-b border-hairline/50 pr-3 text-right tabular-nums">{o.volume_mbd.toFixed(2)}</td>
                          <td className="border-b border-hairline/50 pr-3 text-right tabular-nums">{o.first_arrival_days}d</td>
                          <td className="border-b border-hairline/50 text-right tabular-nums">{o.landed_usd_bbl.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 rounded border border-hairline/60 bg-surface-2/40 p-2 text-[10px] text-ink-2">
                  SPR BRIDGE: {res.spr.total_released_mbbl} million bbl over {res.spr.days_active} days
                  (ISPRL Phase I) · first seaborne relief {res.procurement.first_relief_days ?? "—"}d
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
