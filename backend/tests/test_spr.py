"""Regression tests for the SPR drawdown scheduler (app/engines/spr.py)."""
from app.engines import spr


def test_reserve_never_goes_negative():
    result = spr.schedule(gap_mbd=5.0, first_relief_days=None, relief_coverage_pct=0.0, horizon_days=90)
    assert result["reserve_end_mbbl"] >= 0


def test_full_coverage_after_relief_stops_further_drawdown():
    result = spr.schedule(gap_mbd=1.0, first_relief_days=2, relief_coverage_pct=100.0, horizon_days=30)
    # once relief covers 100% of the gap, no further release should be scheduled
    post_relief_days = [d for d in result["schedule_head"] if d["day"] >= 2]
    assert post_relief_days == []


def test_partial_relief_still_draws_down_the_residual_gap():
    result = spr.schedule(gap_mbd=2.0, first_relief_days=1, relief_coverage_pct=50.0, horizon_days=10)
    post_relief_days = [d for d in result["schedule_head"] if d["day"] >= 1]
    assert len(post_relief_days) > 0


def test_total_released_matches_reserve_delta():
    result = spr.schedule(gap_mbd=3.0, first_relief_days=5, relief_coverage_pct=20.0, horizon_days=60)
    assert result["total_released_mbbl"] == round(
        result["reserve_start_mbbl"] - result["reserve_end_mbbl"], 1
    )
