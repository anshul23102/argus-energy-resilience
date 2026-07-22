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
