"use client";

import Link from "next/link";
import { useNetworkData } from "@/lib/useNetworkData";
import { riskBand } from "@/components/WarRoomMap";
import InfoTip from "@/components/InfoTip";

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
    <div className="mx-auto max-w-[1400px] px-8 py-10 lg:px-16">
      <p className="max-w-2xl text-[15px] leading-relaxed text-ink-2">
        This page answers one question per shipping corridor: how likely is a disruption in the
        next 30 days, given what the news actually says right now. Each percentage is a Bayesian
        posterior: an expert prior, updated by live, corroborated news evidence with a 14 day half
        life, so old evidence fades and new evidence moves the score. The math lives in{" "}
        <span className="figure">engines/risk.py</span>, not inside a language model. Full
        parameters on the <Link href="/assumptions" className="text-accent hover:underline">Assumptions page</Link>.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-x-12 lg:grid-cols-2">
        {corridors.map((r) => {
          const cp = d.chokepoints.find((c) => c.id === r.chokepoint)!;
          const band = riskBand(r.posterior_horizon_prob);
          return (
            <div key={r.chokepoint} className="hairline-section pb-8 pt-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="section-title">{cp.name}</h2>
                  <p className="caption mt-1">{cp.supply_at_risk_pct}% of India&apos;s imports transit here</p>
                </div>
                <span className="flex shrink-0 items-start gap-1.5">
                  <span className="stat-value text-[40px]" style={{ color: BAND_COLOR[band] }}>
                    {(r.posterior_horizon_prob * 100).toFixed(1)}%
                  </span>
                  <InfoTip text="Probability this corridor sees a disruption in the next 30 days, computed from an expert prior updated by live news evidence. Not a war prediction, a traceable calculation." />
                </span>
              </div>

              <div className="mt-5 h-1 w-full rounded-full bg-surface-2">
                <div
                  className="h-1 rounded-full transition-[width] duration-500 ease-out"
                  style={{ width: `${Math.min(100, r.posterior_horizon_prob * 400)}%`, background: BAND_COLOR[band] }}
                />
              </div>
              <div className="figure mt-2 flex justify-between text-[13px] text-ink-3">
                <span>Prior {(r.prior_horizon_prob * 100).toFixed(1)}%</span>
                <span>Posterior {(r.posterior_horizon_prob * 100).toFixed(1)}%</span>
              </div>

              <h3 className="section-label mb-1 mt-6">Evidence driving this score</h3>
              {r.drivers.length === 0 ? (
                <p className="caption py-2">No corroborated signals in window. Prior only.</p>
              ) : (
                <div>
                  {r.drivers.map((dr, i) => (
                    <div key={i} className={`py-3 ${i > 0 ? "hairline-section" : ""}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-[12px] font-semibold uppercase tracking-wide ${SEVERITY_TONE[dr.severity] ?? "text-ink-3"}`}>
                          {dr.severity.replace("_", " ")}
                        </span>
                        <span className="figure text-[12px] text-ink-3">{dr.age_days.toFixed(1)}d ago, x{dr.likelihood_ratio_applied.toFixed(2)}</span>
                      </div>
                      <p className="mt-1.5 text-[14px] leading-snug text-ink-2">{dr.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <section className="mt-4">
        <h2 className="section-title">Engine validation, historical replay</h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">
          The same Bayesian engine, replayed against five real crises with a strict no look ahead
          rule: evidence dated after the evaluation instant is invisible to the score. This
          includes cases the model is <em>not</em> expected to catch early, such as a sudden
          accident with no rhetoric buildup and a rhetoric-only standoff that never crossed the
          alert threshold, alongside the escalation-driven crises it does catch early.
        </p>
        <div className="mt-6">
          {d.backtests.map((b, i) => (
            <div key={b.id} className={`flex flex-wrap items-center justify-between gap-3 py-4 ${i > 0 ? "hairline-section" : ""}`}>
              <div>
                <p className="text-[15px] font-medium text-ink">{b.name}</p>
                <p className="figure caption mt-1">alert {b.alert_date ?? "none raised"} &rarr; impact {b.peak_impact_date}</p>
              </div>
              <span className={`stat-value text-[22px] ${(b.lead_time_days ?? 0) > 0 ? "text-risk-low" : "text-risk-elevated"}`}>
                {b.lead_time_days != null ? `+${b.lead_time_days}d lead` : "no alert"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
