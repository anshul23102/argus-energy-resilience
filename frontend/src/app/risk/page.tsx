"use client";

import Link from "next/link";
import { useNetworkData } from "@/lib/useNetworkData";
import { riskBand } from "@/components/WarRoomMap";

const BAND_COLOR: Record<string, string> = {
  low: "var(--risk-low)", elevated: "var(--risk-elevated)", high: "var(--risk-high)",
};
const SEVERITY_TONE: Record<string, string> = {
  rhetoric: "text-ink-3", incident: "text-risk-elevated",
  attack: "text-risk-high", partial_closure: "text-risk-high", full_closure: "text-risk-high",
};

export default function RiskPage() {
  const d = useNetworkData();

  const corridors = [...d.risk]
    .filter((r) => d.chokepoints.find((c) => c.id === r.chokepoint && c.daily_oil_flow_mbd))
    .sort((a, b) => b.posterior_horizon_prob - a.posterior_horizon_prob);

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <p className="caption mb-8 max-w-2xl">
        Each corridor carries a Bayesian posterior probability of disruption within 30 days: an
        expert prior updated by live, corroborated news evidence with a 14 day half life. The math
        lives in <span className="figure">engines/risk.py</span>, not inside a language model.
        Full parameters on the <Link href="/assumptions" className="text-accent hover:underline">Assumptions page</Link>.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {corridors.map((r) => {
          const cp = d.chokepoints.find((c) => c.id === r.chokepoint)!;
          const band = riskBand(r.posterior_horizon_prob);
          const drivers = r.drivers.slice(0, 4);
          return (
            <div key={r.chokepoint} className="card p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-[16px] font-semibold text-ink">{cp.name}</h2>
                  <p className="caption mt-0.5">{cp.supply_at_risk_pct}% of India's imports transit here</p>
                </div>
                <span className="figure text-[26px] font-bold" style={{ color: BAND_COLOR[band] }}>
                  {(r.posterior_horizon_prob * 100).toFixed(1)}%
                </span>
              </div>

              <div className="mt-4 h-1.5 w-full rounded-full bg-surface-2">
                <div
                  className="h-1.5 rounded-full transition-[width] duration-500 ease-out"
                  style={{ width: `${Math.min(100, r.posterior_horizon_prob * 400)}%`, background: BAND_COLOR[band] }}
                />
              </div>
              <div className="figure mt-1.5 flex justify-between text-[11px] text-ink-3">
                <span>Prior {(r.prior_horizon_prob * 100).toFixed(1)}%</span>
                <span>Posterior {(r.posterior_horizon_prob * 100).toFixed(1)}%</span>
              </div>

              <h3 className="section-label mb-2 mt-5">Evidence driving this score</h3>
              {drivers.length === 0 ? (
                <p className="caption">No corroborated signals in window. Prior only.</p>
              ) : (
                <div className="space-y-2">
                  {drivers.map((dr, i) => (
                    <div key={i} className="rounded-md border border-hairline bg-surface-2 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-medium uppercase tracking-wide ${SEVERITY_TONE[dr.severity] ?? "text-ink-3"}`}>
                          {dr.severity.replace("_", " ")}
                        </span>
                        <span className="figure text-[10px] text-ink-3">{dr.age_days.toFixed(1)}d ago, x{dr.likelihood_ratio_applied.toFixed(2)}</span>
                      </div>
                      <p className="mt-1 text-[12px] leading-snug text-ink-2">{dr.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <section className="card mt-6 p-6">
        <h2 className="text-[15px] font-semibold text-ink">Engine validation, historical replay</h2>
        <p className="caption mt-1 max-w-2xl">
          The same Bayesian engine, replayed against real events with a strict no look ahead
          rule: evidence dated after the evaluation instant is invisible to the score. Calibrated
          on the 2019 episode, validated out of sample on 2023 to 2024.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {d.backtests.map((b) => (
            <div key={b.id} className="rounded-md border border-hairline bg-surface-2 p-4">
              <p className="text-[13px] font-medium text-ink">{b.name}</p>
              <p className="figure caption mt-1">alert {b.alert_date ?? "none"}</p>
              <p className="figure caption">impact {b.peak_impact_date}</p>
              <p className={`figure mt-2 text-[16px] font-semibold ${(b.lead_time_days ?? 0) > 0 ? "text-risk-low" : "text-risk-elevated"}`}>
                {b.lead_time_days != null ? `+${b.lead_time_days} days lead` : "no alert raised"}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
