"""Tests for the Monte Carlo scenario engine (app/engines/scenario.py), focused
on the opec_cut shock type added in phase 2 — chokepoint_closure behavior is
already covered indirectly via engines/orchestrator.py's live usage and isn't
re-tested here.
"""
from app.engines import scenario


def test_opec_cut_runs_and_has_shock_type_in_inputs():
    result = scenario.run(None, closure_pct=50.0, duration_days=14, n_runs=50,
                          shock_type="opec_cut")
    assert result["inputs"]["shock_type"] == "opec_cut"
    assert result["inputs"]["exposure_pct"] > 0


def test_opec_cut_exposure_matches_opec_plus_share():
    from app.core import data
    result = scenario.run(None, closure_pct=50.0, duration_days=14, n_runs=50,
                          shock_type="opec_cut")
    assert result["inputs"]["exposure_pct"] == round(data.opec_plus_exposure_pct(), 1)


def test_chokepoint_closure_is_unaffected_by_shock_type_default():
    """Default shock_type must reproduce the exact pre-phase-2 exposure
    calculation for a chokepoint scenario — no regression."""
    from app.core import data, graph
    result = scenario.run("hormuz", closure_pct=50.0, duration_days=14, n_runs=50)
    expected_exposure_pct = round(graph.supply_at_risk("hormuz"), 1)
    assert result["inputs"]["exposure_pct"] == expected_exposure_pct
    assert result["inputs"]["shock_type"] == "chokepoint_closure"


def test_headline_includes_power_stress_fields():
    result = scenario.run("hormuz", closure_pct=60.0, duration_days=21, n_runs=50)
    h = result["headline"]
    assert "power_deficit_gw_p50" in h
    assert "power_load_shedding_hours_p50" in h
    assert h["power_deficit_gw_p50"] >= 0
    assert h["power_load_shedding_hours_p50"] >= 0


def test_more_severe_closure_does_not_reduce_power_stress():
    """A harsher closure should never show LESS power stress than a milder one —
    monotonicity sanity check on the diesel/gas transmission chain."""
    mild = scenario.run("hormuz", closure_pct=20.0, duration_days=21, n_runs=200, seed=7)
    severe = scenario.run("hormuz", closure_pct=90.0, duration_days=21, n_runs=200, seed=7)
    assert severe["headline"]["power_load_shedding_hours_p50"] >= mild["headline"]["power_load_shedding_hours_p50"]
