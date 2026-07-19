"""SPR drawdown scheduler: bridge the gap between shock and first relief cargo.

Greedy-optimal for this structure: release only what the day's unmet gap needs
(capped by infrastructure max), preserving reserve for the post-relief tail.
Reports the schedule, days of bridge provided, and end-state reserve.
"""
from __future__ import annotations

from ..core import data


def schedule(gap_mbd: float, first_relief_days: int | None,
             relief_coverage_pct: float, horizon_days: int = 60) -> dict:
    a = data.assumptions()
    spr_max = a["scenario_engine"]["spr_max_drawdown_mbd"]["value"]
    total_mmt = sum(s["capacity_mmt"] for s in data.spr_sites())
    # 1 MMT crude ≈ 7.33 million barrels
    reserve_mbbl = total_mmt * 7.33

    relief_day = first_relief_days if first_relief_days is not None else horizon_days
    days = []
    remaining = reserve_mbbl
    for t in range(horizon_days):
        if t < relief_day:
            need = gap_mbd
        else:
            need = gap_mbd * max(0.0, 1.0 - relief_coverage_pct / 100.0)
        release = min(need, spr_max, remaining)
        remaining -= release
        if release > 1e-6:
            days.append({"day": t, "release_mbd": round(release, 3)})
        if remaining <= 0:
            break

    total_released = reserve_mbbl - remaining
    return {
        "reserve_start_mbbl": round(reserve_mbbl, 1),
        "reserve_end_mbbl": round(remaining, 1),
        "total_released_mbbl": round(total_released, 1),
        "max_drawdown_mbd": spr_max,
        "bridge_days_at_full_rate": round(reserve_mbbl / spr_max / 1.0, 0) if spr_max else 0,
        "schedule_head": days[:10],
        "days_active": len(days),
        "note": "ISPRL Phase I only (5.33 MMT); Phase II modelled unavailable.",
    }
