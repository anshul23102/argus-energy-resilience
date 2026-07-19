"""Procurement optimizer: given a supply gap and a set of closed chokepoints,
find the cheapest feasible replacement barrel mix — as a linear program, the same
class of model real refinery planners use, not LLM guesswork.

  min   Σ landed_cost(s,g,r) · x(s,g,r)
  s.t.  Σ x ≥ gap                      (fill the gap)
        Σ_g,r x(s,·) ≤ spare(s)        (supplier spare capacity)
        route r open                    (closed chokepoints exclude routes)
        sour-capable share respected    (grade family compatibility with refinery diets)

Outputs an order sheet a procurement desk could actually act on: supplier, grade,
volume, route, voyage days, first-arrival ETA, landed cost, premium vs baseline.
"""
from __future__ import annotations

import pulp

from ..core import data

# grade family -> min share of India's replacement mix that must be sour-compatible
# (India's refining slate is predominantly sour-configured; see refineries.json crude diets)
SOUR_FAMILIES = {"medium_sour", "heavy_sour"}
MIN_SOUR_SHARE = 0.5


def optimize(gap_mbd: float, closed_chokepoints: list[str],
             brent_now: float | None = None) -> dict:
    a = data.assumptions()
    brent0 = brent_now or a["economics"]["brent_default_usd"]["value"]
    war_premium = a["response"]["war_risk_premium_usd_bbl"]["value"]
    spare_cfg = a["response"]["supplier_spare_capacity_mbd"]
    grades = data.grades()
    routes = data.routes()
    suppliers = {s["id"]: s for s in data.suppliers()}
    closed = set(closed_chokepoints)

    # candidate (supplier, grade, route) triples over OPEN routes
    candidates = []
    for sid, s in suppliers.items():
        spare = spare_cfg.get(sid, {})
        spare_mbd = spare.get("value", 0.0) if isinstance(spare, dict) else 0.0
        if spare_mbd <= 0:
            continue
        for term in s["export_terminals"]:
            open_routes = [
                r for r in routes
                if term["id"] in r["from_terminals"] and not (set(r["chokepoints"]) & closed)
            ]
            for r in open_routes:
                # grades ship only from terminals that actually load them
                for g in term.get("grades", s["grades"]):
                    gr = grades[g]
                    # crisis-adjacent open routes still pay a war-risk premium
                    crisis_adjacent = bool(set(r["chokepoints"]) & {"bab-el-mandeb", "suez"}) or \
                        r["id"] == "fujairah-west-india"
                    landed = brent0 + gr["benchmark_diff_usd"] \
                        + 0.9 * r["voyage_days"] / 10.0 \
                        + (war_premium if crisis_adjacent else 0.0)
                    candidates.append({
                        "supplier": sid, "grade": g, "route": r["id"],
                        "voyage_days": r["voyage_days"], "landed_usd_bbl": round(landed, 2),
                        "family": gr["family"], "spare_mbd": spare_mbd,
                    })

    if not candidates:
        return {"feasible": False, "reason": "no open routes with spare capacity", "orders": []}

    prob = pulp.LpProblem("replacement_mix", pulp.LpMinimize)
    x = {i: pulp.LpVariable(f"x_{i}", lowBound=0) for i in range(len(candidates))}

    prob += pulp.lpSum(x[i] * candidates[i]["landed_usd_bbl"] for i in x)
    prob += pulp.lpSum(x.values()) >= gap_mbd, "fill_gap"
    for sid in {c["supplier"] for c in candidates}:
        cap = next(c["spare_mbd"] for c in candidates if c["supplier"] == sid)
        prob += pulp.lpSum(x[i] for i in x if candidates[i]["supplier"] == sid) <= cap, f"spare_{sid}"
    prob += pulp.lpSum(
        x[i] for i in x if candidates[i]["family"] in SOUR_FAMILIES
    ) >= MIN_SOUR_SHARE * gap_mbd, "sour_share"

    prob.solve(pulp.PULP_CBC_CMD(msg=False))
    feasible = pulp.LpStatus[prob.status] == "Optimal"

    orders = []
    if feasible:
        for i, c in enumerate(candidates):
            v = x[i].value() or 0.0
            if v > 1e-4:
                orders.append({
                    **{k: c[k] for k in ("supplier", "grade", "route", "voyage_days", "landed_usd_bbl")},
                    "volume_mbd": round(v, 3),
                    "first_arrival_days": c["voyage_days"] + 5,  # +5d fixture/laycan lead
                    "premium_vs_baseline_usd_bbl": round(c["landed_usd_bbl"] - brent0, 2),
                })
        orders.sort(key=lambda o: o["first_arrival_days"])

    total = sum(o["volume_mbd"] for o in orders)
    daily_premium_musd = sum(
        o["volume_mbd"] * 1e6 * o["premium_vs_baseline_usd_bbl"] for o in orders
    ) / 1e6

    return {
        "feasible": feasible,
        "gap_mbd": gap_mbd,
        "covered_mbd": round(total, 3),
        "coverage_pct": round(100 * total / gap_mbd, 1) if gap_mbd else 100.0,
        "daily_premium_musd": round(daily_premium_musd, 1),
        "first_relief_days": orders[0]["first_arrival_days"] if orders else None,
        "orders": orders,
        "constraints": {"min_sour_share": MIN_SOUR_SHARE,
                        "closed_chokepoints": sorted(closed)},
    }
