"""Regression tests for the procurement LP (app/engines/procurement.py)."""
from app.core import data
from app.engines import procurement


def test_small_gap_is_feasible_with_open_routes():
    result = procurement.optimize(gap_mbd=0.5, closed_chokepoints=[])
    assert result["feasible"] is True
    assert result["coverage_pct"] >= 99.0
    assert len(result["orders"]) > 0


def test_orders_respect_sour_share_constraint():
    result = procurement.optimize(gap_mbd=1.0, closed_chokepoints=[])
    assert result["feasible"] is True
    grades = data.grades()
    sour_volume = sum(
        o["volume_mbd"] for o in result["orders"]
        if grades[o["grade"]]["family"] in procurement.SOUR_FAMILIES
    )
    total_volume = sum(o["volume_mbd"] for o in result["orders"])
    assert sour_volume / total_volume >= procurement.MIN_SOUR_SHARE - 1e-6


def test_closed_chokepoints_are_never_used_in_the_order_sheet():
    closed = {"hormuz", "bab-el-mandeb", "suez", "malacca"}
    result = procurement.optimize(gap_mbd=0.3, closed_chokepoints=list(closed))
    routes_by_id = {r["id"]: r for r in data.routes()}
    for order in result["orders"]:
        route_chokepoints = set(routes_by_id[order["route"]]["chokepoints"])
        assert not (route_chokepoints & closed)


def test_impossible_gap_is_infeasible_or_partially_covered():
    result = procurement.optimize(gap_mbd=1_000_000, closed_chokepoints=[])
    assert result["feasible"] is False or result["coverage_pct"] < 100.0
