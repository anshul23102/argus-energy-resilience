"""Regression tests for the Bayesian corridor-risk engine (app/engines/risk.py)."""
from app.engines.risk import RiskEngine, Event


def test_no_evidence_returns_prior_as_posterior():
    engine = RiskEngine()
    score = engine.corridor_risk("hormuz", horizon_days=30)
    assert score["prior_horizon_prob"] == score["posterior_horizon_prob"]
    assert score["drivers"] == []


def test_unlisted_chokepoint_gets_nominal_fallback_prior():
    engine = RiskEngine()
    score = engine.corridor_risk("some-untracked-routing-point", horizon_days=30)
    assert score["prior_annual_pct"] == 0.5
    assert 0 < score["prior_horizon_prob"] < 0.01


def test_attack_evidence_raises_posterior_above_prior():
    engine = RiskEngine()
    baseline = engine.corridor_risk("hormuz", horizon_days=30)["posterior_horizon_prob"]
    engine.ingest(Event(
        corridor="hormuz", severity="attack", summary="test attack event",
        source="test", corroborations=3,
    ))
    updated = engine.corridor_risk("hormuz", horizon_days=30)["posterior_horizon_prob"]
    assert updated > baseline


def test_future_evidence_is_invisible_no_lookahead():
    """An event timestamped after the evaluation instant must not move the score —
    this is the no-look-ahead guarantee the backtest harness depends on."""
    engine = RiskEngine()
    now = 1_700_000_000.0
    engine.ingest(Event(
        corridor="hormuz", severity="attack", summary="future event",
        source="test", timestamp=now + 86400, corroborations=3,
    ))
    score = engine.corridor_risk("hormuz", horizon_days=30, now_ts=now)
    assert score["drivers"] == []
    assert score["prior_horizon_prob"] == score["posterior_horizon_prob"]


def test_old_evidence_decays_towards_prior():
    engine = RiskEngine()
    now = 1_700_000_000.0
    halflife_days = 14  # matches assumptions.yaml risk_engine.evidence_halflife_days at time of writing
    engine.ingest(Event(
        corridor="hormuz", severity="attack", summary="old event",
        source="test", timestamp=now - halflife_days * 10 * 86400, corroborations=3,
    ))
    score = engine.corridor_risk("hormuz", horizon_days=30, now_ts=now)
    # after 10 half-lives the multiplicative effect should be negligible
    assert abs(score["posterior_horizon_prob"] - score["prior_horizon_prob"]) < 1e-4


def test_supplier_no_evidence_returns_prior_as_posterior():
    engine = RiskEngine()
    score = engine.supplier_risk("russia", horizon_days=30)
    assert score["prior_horizon_prob"] == score["posterior_horizon_prob"]
    assert score["drivers"] == []


def test_unlisted_supplier_gets_nominal_fallback_prior():
    engine = RiskEngine()
    score = engine.supplier_risk("some-untracked-supplier", horizon_days=30)
    assert score["prior_annual_pct"] == 0.5
    assert 0 < score["prior_horizon_prob"] < 0.01


def test_supplier_attack_evidence_raises_posterior_above_prior():
    engine = RiskEngine()
    baseline = engine.supplier_risk("russia", horizon_days=30)["posterior_horizon_prob"]
    engine.ingest(Event(
        corridor=None, supplier="russia", severity="attack", summary="test supplier event",
        source="test", corroborations=3,
    ))
    updated = engine.supplier_risk("russia", horizon_days=30)["posterior_horizon_prob"]
    assert updated > baseline


def test_supplier_and_corridor_events_are_independent():
    """A corridor-tagged event must not move a supplier's score, and vice versa —
    the two axes are independent evidence streams even though they share one
    Event list and one Bayesian update mechanism."""
    engine = RiskEngine()
    corridor_baseline = engine.corridor_risk("hormuz", horizon_days=30)["posterior_horizon_prob"]
    supplier_baseline = engine.supplier_risk("russia", horizon_days=30)["posterior_horizon_prob"]
    engine.ingest(Event(
        corridor=None, supplier="russia", severity="attack", summary="supplier-only event",
        source="test", corroborations=3,
    ))
    assert engine.corridor_risk("hormuz", horizon_days=30)["posterior_horizon_prob"] == corridor_baseline
    assert engine.supplier_risk("russia", horizon_days=30)["posterior_horizon_prob"] > supplier_baseline
