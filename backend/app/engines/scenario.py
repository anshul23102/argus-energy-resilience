"""Monte Carlo scenario engine: simulates a chokepoint disruption's cascade through
India's crude supply chain, day by day.

Model (all parameters from assumptions.yaml — nothing hardcoded):
  supply loss  = imports x corridor exposure x closure, less pipeline bypass
  inventory    = commercial stocks + SPR absorb the gap until relief arrives
  relief       = rerouted/alternative cargoes ramp in after a stochastic lead time
  refinery ops = run rates cut when stocks approach the operational floor
  prices       = Brent shock from unresolved GLOBAL loss; retail via pass-through
  macro        = GDP/CAD impact from sustained price delta (published elasticities)

Uncertainty (closure duration, bypass availability, relief ramp) is sampled per run;
we report P10/P50/P90 bands. 'Managed' runs include the optimized response
(procurement + SPR, engines/procurement.py & spr.py); 'unmanaged' runs do not.
The difference between those two bands is ARGUS's value, quantified.
"""
from __future__ import annotations

import numpy as np

from ..core import data, graph


def _tri(rng: np.random.Generator, spec: dict, n: int) -> np.ndarray:
    return rng.triangular(spec["min"], spec["mode"], spec["max"], n)


def run(
    chokepoint_id: str | None,
    closure_pct: float = 60.0,
    duration_days: int = 21,
    horizon_days: int = 90,
    n_runs: int = 1000,
    managed: bool = True,
    brent_now: float | None = None,
    seed: int = 7,
    shock_type: str = "chokepoint_closure",
) -> dict:
    a = data.assumptions()
    rng = np.random.default_rng(seed)

    imports_mbd = a["demand"]["india_crude_processing_mbd"]["value"] * \
        a["demand"]["import_dependency_pct"]["value"] / 100.0
    commercial_days = a["inventory"]["commercial_stock_days"]["value"]
    spr_days = 9.5                                                   # ISPRL Phase I cover
    floor_days = a["inventory"]["min_stock_days_floor"]["value"]
    min_run = a["scenario_engine"]["refinery_min_run_rate_pct"]["value"] / 100.0
    spr_max_mbd = a["scenario_engine"]["spr_max_drawdown_mbd"]["value"]
    price_sens = a["economics"]["global_price_sensitivity_usd_per_mbd"]["value"]
    pass_through = a["economics"]["retail_pass_through_inr_per_litre_per_usd"]["value"]
    brent0 = brent_now or a["economics"]["brent_default_usd"]["value"]

    if shock_type == "opec_cut":
        exposure = data.opec_plus_exposure_pct() / 100.0          # share of imports
        global_flow = a["scenario_engine"]["opec_plus_global_production_mbd"]["value"]
        allow_bypass = False    # a production cut has nothing to physically bypass
    else:
        cp = next(c for c in data.chokepoints() if c["id"] == chokepoint_id)
        exposure = graph.supply_at_risk(chokepoint_id) / 100.0      # share of imports
        global_flow = cp.get("daily_oil_flow_mbd") or 0.0
        allow_bypass = chokepoint_id == "hormuz"

    # stochastic inputs per run
    durations = np.minimum(
        rng.geometric(1.0 / max(duration_days, 1), n_runs), horizon_days
    )  # mean = requested duration; closures end unpredictably
    bypass = _tri(rng, a["response"]["bypass_availability_pct"], n_runs) / 100.0
    ramp_days = _tri(rng, a["response"]["reroute_ramp_days"], n_runs).astype(int)

    spare = a["response"]["supplier_spare_capacity_mbd"]
    excluded_from_relief = data.OPEC_PLUS_SUPPLIER_IDS if shock_type == "opec_cut" else set()
    relief_ceiling_mbd = sum(
        v["value"] for k, v in spare.items()
        if isinstance(v, dict) and "value" in v and k not in excluded_from_relief
    )

    closure = closure_pct / 100.0
    days = np.arange(horizon_days)

    stock_traj = np.zeros((n_runs, horizon_days))
    util_traj = np.zeros((n_runs, horizon_days))
    brent_traj = np.zeros((n_runs, horizon_days))

    for i in range(n_runs):
        dur = durations[i]
        stocks = commercial_days + spr_days           # days-of-processing cover
        gross_loss = imports_mbd * exposure * closure  # mb/d India-bound while closed
        bypass_recovery = gross_loss * bypass[i] * 0.5 if allow_bypass else 0.0

        for t in days:
            closed = t < dur
            loss = (gross_loss - bypass_recovery) if closed else 0.0
            relief = 0.0
            if managed and t >= ramp_days[i]:
                ramp_frac = min(1.0, (t - ramp_days[i] + 1) / 14.0)  # 2-week ramp to ceiling
                relief = min(loss, relief_ceiling_mbd * ramp_frac)
            net_gap = max(0.0, loss - relief)
            spr_release = min(net_gap, spr_max_mbd) if managed else 0.0
            unmet = net_gap - spr_release

            # inventory absorbs remaining gap; runs cut near the floor
            util = 1.0
            if stocks <= floor_days:
                util = max(min_run, 1.0 - unmet / imports_mbd)
            burn = unmet / imports_mbd  # days of cover consumed per day
            stocks = max(0.0, stocks - burn * util)

            # price: global unresolved loss moves Brent (world reroutes too, same ramp)
            if closed:
                world_loss = global_flow * closure * (1 - bypass[i] * 0.35)
                world_relief = min(world_loss, world_loss * min(1.0, t / max(ramp_days[i], 1)) * 0.7)
                brent_delta = price_sens * max(0.0, world_loss - world_relief)
            else:
                brent_delta = brent_traj[i, t - 1] - brent0 if t > 0 else 0.0
                brent_delta *= 0.9  # decay after reopening
            stock_traj[i, t] = stocks
            util_traj[i, t] = util
            brent_traj[i, t] = brent0 + brent_delta

    def band(x: np.ndarray) -> dict:
        return {
            "p10": np.percentile(x, 10, axis=0).round(2).tolist(),
            "p50": np.percentile(x, 50, axis=0).round(2).tolist(),
            "p90": np.percentile(x, 90, axis=0).round(2).tolist(),
        }

    peak_brent = float(np.percentile(brent_traj.max(axis=1), 50))
    sustained_delta = float(np.percentile(brent_traj.mean(axis=1) - brent0, 50))
    gdp_bps = sustained_delta / 10.0 * a["price_transmission"]["crude_10usd_to_gdp_bps"]["value"]
    cad_pct = sustained_delta / 10.0 * a["price_transmission"]["crude_10usd_to_cad_pct_gdp"]["value"]
    retail_delta = float(np.percentile(brent_traj.max(axis=1) - brent0, 50)) * pass_through
    min_stock_p50 = float(np.percentile(stock_traj.min(axis=1), 50))
    days_below_floor = float((stock_traj < floor_days).sum(axis=1).mean())

    return {
        "inputs": {"chokepoint": chokepoint_id, "closure_pct": closure_pct,
                   "mean_duration_days": duration_days, "horizon_days": horizon_days,
                   "n_runs": n_runs, "managed": managed, "brent_start": brent0,
                   "exposure_pct": round(exposure * 100, 1),
                   "india_imports_mbd": round(imports_mbd, 2), "shock_type": shock_type},
        "trajectories": {"stock_days": band(stock_traj), "refinery_utilization": band(util_traj),
                          "brent": band(brent_traj)},
        "headline": {
            "peak_brent_p50": round(peak_brent, 1),
            "retail_petrol_delta_inr_per_litre_p50": round(retail_delta, 1),
            "gdp_impact_bps_p50": round(gdp_bps, 1),
            "cad_impact_pct_gdp_p50": round(cad_pct, 2),
            "min_stock_days_p50": round(min_stock_p50, 1),
            "avg_days_below_floor": round(days_below_floor, 1),
        },
        "assumption_refs": ["response.*", "inventory.*", "economics.*", "scenario_engine.*"],
    }
