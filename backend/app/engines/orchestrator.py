"""Response orchestrator: the end-to-end pipeline the evaluation focus asks to time.

  WATCHTOWER (risk engine, live feeds)  ->  what is the threat?
  SIMULATOR  (Monte Carlo scenario)     ->  what does it do to India?
  TRADER     (procurement LP)           ->  which barrels replace it, exactly?
  RESERVIST  (SPR scheduler)            ->  how do we bridge until they arrive?
  BRIEFER    (LLM if key, template else)->  one page a minister/CEO can act on.

Every stage is timed; the response clock is part of the output.
"""
from __future__ import annotations

import os
import time

from ..core import data, graph
from . import procurement, scenario, spr
from .extractor import provider
from .risk import ENGINE


def _briefing_template(ctx: dict) -> str:
    h = ctx["scenario"]["headline"]
    p = ctx["procurement"]
    cp = ctx["chokepoint_name"]
    severity_word = "cut" if ctx["inputs"].get("shock_type") == "opec_cut" else "closure"
    lines = [
        f"SITREP — {cp} disruption ({ctx['inputs']['closure_pct']:.0f}% {severity_word} scenario)",
        f"Threat level: {ctx['risk']['posterior_horizon_prob']*100:.1f}% (30d posterior, "
        f"{len(ctx['risk']['drivers'])} evidence drivers).",
        f"Exposure: {ctx['inputs']['exposure_pct']}% of India's {ctx['inputs']['india_imports_mbd']} mb/d imports.",
        f"Impact (P50, unmanaged→managed): min stock cover {ctx['unmanaged']['min_stock_days_p50']}d → "
        f"{h['min_stock_days_p50']}d; Brent peak ${h['peak_brent_p50']}/bbl; "
        f"retail petrol +₹{h['retail_petrol_delta_inr_per_litre_p50']}/L; GDP {h['gdp_impact_bps_p50']} bps.",
        f"Response: {p['covered_mbd']} mb/d replacement secured ({p['coverage_pct']}% of gap) "
        f"across {len(p['orders'])} orders; first relief in {p['first_relief_days']} days; "
        f"premium ${p['daily_premium_musd']}M/day.",
        f"SPR bridge: {ctx['spr']['total_released_mbbl']} mbbl released over {ctx['spr']['days_active']} days.",
        "Recommended: execute order sheet top-3 immediately; notify OMCs on pricing; "
        "activate SPR release protocol; review in 24h as evidence updates.",
    ]
    return "\n".join(lines)


def _briefing_llm(ctx: dict) -> tuple[str, str] | None:
    import json as _json

    from .extractor import llm_complete

    prompt = (
        "You are the briefing officer of India's energy security war-room. Write a crisp "
        "10-line situation briefing for the Petroleum Ministry from this JSON. Use concrete "
        "numbers. No preamble, no markdown headers.\n" + _json.dumps(ctx, default=str)[:6000]
    )
    # prose mode: forcing JSON here is how you get a briefing that reads like a payload
    return llm_complete(prompt, json_mode=False)


def respond(chokepoint_id: str | None, closure_pct: float = 60.0, duration_days: int = 21,
            brent_now: float | None = None, shock_type: str = "chokepoint_closure") -> dict:
    clock: list[dict] = []
    t0 = time.time()

    def tick(stage: str):
        clock.append({"stage": stage, "elapsed_s": round(time.time() - t0, 2)})

    if shock_type == "opec_cut":
        risk = max(
            (ENGINE.supplier_risk(sid) for sid in data.OPEC_PLUS_SUPPLIER_IDS),
            key=lambda r: r["posterior_horizon_prob"],
        )
    else:
        risk = ENGINE.corridor_risk(chokepoint_id)
    tick("watchtower: threat assessed")

    unmanaged = scenario.run(chokepoint_id, closure_pct, duration_days,
                             managed=False, brent_now=brent_now, shock_type=shock_type)
    managed = scenario.run(chokepoint_id, closure_pct, duration_days,
                           managed=True, brent_now=brent_now, shock_type=shock_type)
    tick("simulator: cascade modelled (2x1000 Monte Carlo runs)")

    a = data.assumptions()
    imports_mbd = a["demand"]["india_crude_processing_mbd"]["value"] * \
        a["demand"]["import_dependency_pct"]["value"] / 100.0
    if shock_type == "opec_cut":
        exposure = data.opec_plus_exposure_pct() / 100.0
        gap = round(imports_mbd * exposure * closure_pct / 100.0, 3)
        proc = procurement.optimize(gap, closed_chokepoints=[], brent_now=brent_now,
                                    excluded_suppliers=list(data.OPEC_PLUS_SUPPLIER_IDS))
    else:
        exposure = graph.supply_at_risk(chokepoint_id) / 100.0
        gap = round(imports_mbd * exposure * closure_pct / 100.0, 3)
        proc = procurement.optimize(gap, closed_chokepoints=[chokepoint_id], brent_now=brent_now)
    tick("trader: replacement mix optimized (LP)")

    reserve = spr.schedule(gap, proc.get("first_relief_days"), proc.get("coverage_pct", 0.0))
    tick("reservist: SPR bridge scheduled")

    cp_name = "OPEC+ coalition" if shock_type == "opec_cut" else next(
        c["name"] for c in data.chokepoints() if c["id"] == chokepoint_id
    )
    ctx = {
        "chokepoint_name": cp_name, "inputs": managed["inputs"], "risk": risk,
        "scenario": managed, "unmanaged": unmanaged["headline"],
        "procurement": proc, "spr": reserve,
    }
    llm_out = _briefing_llm(ctx)
    briefing = llm_out[0] if llm_out else _briefing_template(ctx)
    briefing_author = llm_out[1] if llm_out else "template"
    tick("briefer: situation briefing drafted")

    return {
        "chokepoint": chokepoint_id, "chokepoint_name": cp_name,
        "risk": risk,
        "scenario_managed": managed, "scenario_unmanaged": unmanaged,
        "supply_gap_mbd": gap,
        "procurement": proc, "spr": reserve,
        "briefing": briefing,
        "briefing_author": briefing_author,
        "response_clock": clock,
        "total_response_seconds": round(time.time() - t0, 2),
    }
