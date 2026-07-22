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


def test_excluded_suppliers_are_never_used_in_the_order_sheet():
    result = procurement.optimize(gap_mbd=0.3, closed_chokepoints=[],
                                  excluded_suppliers=["saudi-arabia", "russia"])
    assert result["feasible"] is True
    for order in result["orders"]:
        assert order["supplier"] not in {"saudi-arabia", "russia"}


def test_route_tanker_capacity_is_never_exceeded():
    l = data.assumptions()["logistics"]
    tankers = l["available_tankers_per_route"]["value"]
    vlcc = l["vlcc_capacity_mbbl"]["value"]
    routes_by_id = {r["id"]: r for r in data.routes()}
    result = procurement.optimize(gap_mbd=2.0, closed_chokepoints=[])
    assert result["feasible"] is True
    for order in result["orders"]:
        voyage_days = routes_by_id[order["route"]]["voyage_days"]
        cap = tankers * vlcc / (2 * voyage_days)
        assert order["volume_mbd"] <= cap + 1e-6


def test_port_congestion_cap_is_surfaced_and_correct():
    l = data.assumptions()["logistics"]
    expected = round(
        l["port_max_vlcc_per_day"]["value"] * l["vlcc_capacity_mbbl"]["value"]
        * l["crisis_active_discharge_points"]["value"], 2,
    )
    result = procurement.optimize(gap_mbd=0.5, closed_chokepoints=[])
    assert result["constraints"]["port_congestion_cap_mbd"] == expected


def test_covered_volume_never_exceeds_port_congestion_cap():
    result = procurement.optimize(gap_mbd=1_000_000, closed_chokepoints=[])
    assert result["covered_mbd"] <= result["constraints"]["port_congestion_cap_mbd"] + 1e-6
