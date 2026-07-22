"use client";

import { useState } from "react";
import { useNetworkData } from "@/lib/useNetworkData";
import InfoTip from "@/components/InfoTip";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Order {
  supplier: string; grade: string; route: string; voyage_days: number;
  landed_usd_bbl: number; volume_mbd: number; first_arrival_days: number;
}
interface Band { p10: number[]; p50: number[]; p90: number[]; }
interface ScenarioResponse {
  chokepoint_name: string;
  supply_gap_mbd: number;
  scenario_managed: { headline: Record<string, number>; trajectories: { stock_days: Band } };
  scenario_unmanaged: { headline: Record<string, number>; trajectories: { stock_days: Band } };
  procurement: { feasible: boolean; coverage_pct: number; first_relief_days: number | null; daily_premium_musd: number; orders: Order[] };
  spr: { total_released_mbbl: number; days_active: number };
  briefing: string;
  briefing_author: string;
  response_clock: { stage: string; elapsed_s: number }[];
  total_response_seconds: number;
}

function BandChart({ managed, unmanaged, floor }: { managed: Band; unmanaged: Band; floor: number }) {
  const W = 560, H = 200, n = managed.p50.length;
  const all = [...managed.p10, ...managed.p90, ...unmanaged.p10, ...unmanaged.p90, 0];
  const yMax = Math.max(...all) * 1.08;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - (v / yMax) * H;
  const path = (arr: number[]) => arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = (lo: number[], hi: number[]) =>
    path(hi) + " " + lo.slice().reverse().map((v, j) => `L${x(n - 1 - j).toFixed(1)},${y(v).toFixed(1)}`).join(" ") + " Z";
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full">
      <path d={area(unmanaged.p10, unmanaged.p90)} fill="var(--risk-high)" opacity="0.12" />
      <path d={area(managed.p10, managed.p90)} fill="var(--risk-low)" opacity="0.14" />
      <path d={path(unmanaged.p50)} stroke="var(--risk-high)" strokeWidth="2" fill="none" />
      <path d={path(managed.p50)} stroke="var(--risk-low)" strokeWidth="2" fill="none" />
      <line x1="0" x2={W} y1={y(floor)} y2={y(floor)} stroke="var(--accent)" strokeWidth="1" strokeDasharray="5 4" opacity="0.7" />
      <text x="4" y={y(floor) - 6} fill="var(--accent)" fontSize="12" fontFamily="var(--font-inter)">operational floor, {floor}d</text>
      <text x="0" y={H + 18} fill="var(--ink-3)" fontSize="12" fontFamily="var(--font-mono-data)">day 0</text>
      <text x={W - 48} y={H + 18} fill="var(--ink-3)" fontSize="12" fontFamily="var(--font-mono-data)">day {n}</text>
    </svg>
  );
}

export default function ScenarioPage() {
  const d = useNetworkData();
  const [cp, setCp] = useState("hormuz");
  const [closure, setClosure] = useState(60);
  const [duration, setDuration] = useState(21);
  const [running, setRunning] = useState(false);
  const [res, setRes] = useState<ScenarioResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const chokepointOptions = d.chokepoints.filter((c) => c.daily_oil_flow_mbd);

  const run = async () => {
    setRunning(true); setErr(null);
    try {
      const r = await fetch(`${BASE}/api/scenario/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chokepoint: cp, closure_pct: closure, duration_days: duration }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setRes(await r.json());
    } catch (e) {
      setErr(String(e));
    } finally {
      setRunning(false);
    }
  };

  const h = res?.scenario_managed.headline;
  const hu = res?.scenario_unmanaged.headline;

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <p className="max-w-2xl text-[15px] leading-relaxed text-ink-2">
        This page answers: if this chokepoint closed today, what would actually happen, and how
        fast could India respond. Pick a severity and duration below and run it. A 1000 run Monte
        Carlo model projects the impact with and without a coordinated response, a linear program
        prices the cheapest feasible replacement barrels, and a scheduler bridges the gap with
        strategic reserves. Every parameter is listed on the{" "}
        <a href="/assumptions" className="text-accent hover:underline">Assumptions page</a>.
      </p>

      <div className="card mb-8 mt-8 flex flex-wrap items-end gap-6 p-5">
        <label className="flex flex-col gap-1.5">
          <span className="section-label">Chokepoint</span>
          <select
            value={cp} onChange={(e) => setCp(e.target.value)}
            className="rounded-md border border-hairline bg-surface-2 px-3 py-2 text-[14px] text-ink focus:border-accent focus:outline-none"
          >
            {chokepointOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="section-label">Closure severity, {closure}%</span>
          <input type="range" min={10} max={100} step={5} value={closure}
            onChange={(e) => setClosure(+e.target.value)} className="w-48 accent-[color:var(--accent)]" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="section-label">Mean duration, {duration} days</span>
          <input type="range" min={7} max={60} step={1} value={duration}
            onChange={(e) => setDuration(+e.target.value)} className="w-48 accent-[color:var(--accent)]" />
        </label>
        <button
          onClick={run} disabled={running}
          className="ml-auto rounded-md bg-accent px-6 py-2.5 text-[14px] font-semibold text-accent-ink transition-[filter] duration-150 hover:brightness-110 disabled:opacity-40"
        >
          {running ? "Simulating." : "Run response"}
        </button>
      </div>

      {err && <p className="mb-6 text-[14px] text-risk-high">Backend error: {err}</p>}

      {res && h && hu && (
        <div className="grid grid-cols-1 gap-x-12 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="hairline-section pb-8">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="section-title">Crude cover, days</h2>
                <p className="text-[13px]"><span className="text-risk-low">Managed</span> vs <span className="text-risk-high">unmanaged</span></p>
              </div>
              <BandChart managed={res.scenario_managed.trajectories.stock_days} unmanaged={res.scenario_unmanaged.trajectories.stock_days} floor={7} />
            </div>

            <div className="hairline-section grid grid-cols-3 gap-x-4 gap-y-6 py-8">
              {[
                ["Peak Brent", `$${h.peak_brent_p50}`, "Median simulated Brent price at the worst point of the closure, across 1000 Monte Carlo runs."],
                ["Retail petrol", `+₹${h.retail_petrol_delta_inr_per_litre_p50}/L`, "Estimated pump-price rise passed through to Indian consumers from that Brent move."],
                ["GDP impact", `${h.gdp_impact_bps_p50} bps`, "Estimated hit to India's GDP growth, in basis points, from the crude price shock."],
                ["Min cover, managed", `${h.min_stock_days_p50}d`, "Lowest crude stock, in days of cover, India reaches if the response engine acts."],
                ["Min cover, unmanaged", `${hu.min_stock_days_p50}d`, "Same measure with no coordinated response, replacement barrels, or SPR release."],
                ["Response time", `${res.total_response_seconds}s`, "Wall-clock time this simulation actually took to run, end to end, on this machine."],
              ].map(([k, v, tip]) => (
                <div key={k}>
                  <p className="caption flex items-center gap-1.5">{k} <InfoTip text={tip} /></p>
                  <p className="stat-value mt-1 text-[28px] text-ink">{v}</p>
                </div>
              ))}
            </div>

            <div className="py-8">
              <h2 className="section-title mb-3">Situation briefing</h2>
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">{res.briefing}</p>
              <p className="caption mt-4">
                Author: {res.briefing_author}. Clock: {res.response_clock.map((c) => `${c.stage.split(":")[0]} ${c.elapsed_s}s`).join(", ")}.
              </p>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="hairline-section pb-8 lg:border-b-0">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="section-title">Order sheet</h2>
                <p className="figure text-[13px] text-ink-3">{res.procurement.coverage_pct}% covered</p>
              </div>
              <table className="w-full border-collapse text-[14px]">
                <thead>
                  <tr className="hairline-section text-left">
                    <th className="pb-2 font-medium text-ink-3">Supplier</th>
                    <th className="pb-2 font-medium text-ink-3">Grade</th>
                    <th className="pb-2 text-right font-medium text-ink-3">mb/d</th>
                    <th className="pb-2 text-right font-medium text-ink-3">ETA</th>
                    <th className="pb-2 text-right font-medium text-ink-3">$/bbl</th>
                  </tr>
                </thead>
                <tbody>
                  {res.procurement.orders.map((o, i) => (
                    <tr key={i} className="hairline-section">
                      <td className="py-2.5 capitalize text-ink">{o.supplier.replace(/-/g, " ")}</td>
                      <td className="py-2.5 text-accent">{o.grade}</td>
                      <td className="figure py-2.5 text-right text-ink-2">{o.volume_mbd.toFixed(2)}</td>
                      <td className="figure py-2.5 text-right text-ink-2">{o.first_arrival_days}d</td>
                      <td className="figure py-2.5 text-right text-ink-2">${o.landed_usd_bbl.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="caption mt-4">
                First seaborne relief in {res.procurement.first_relief_days ?? "unknown"} days,{" "}
                {res.procurement.daily_premium_musd >= 0
                  ? `premium $${res.procurement.daily_premium_musd}M per day above baseline.`
                  : `$${Math.abs(res.procurement.daily_premium_musd)}M per day cheaper than baseline.`}
              </p>
            </div>

            <div className="py-8">
              <h2 className="section-title mb-2">Strategic reserve bridge</h2>
              <p className="text-[15px] text-ink-2">
                {res.spr.total_released_mbbl} million barrels released over {res.spr.days_active} days from ISPRL Phase I.
              </p>
            </div>
          </div>
        </div>
      )}

      {!res && !err && (
        <p className="py-16 text-center text-[15px] text-ink-2">Set a scenario above and run it to see the full response.</p>
      )}
    </div>
  );
}
