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


def test_replenishment_window_scales_with_amount_released():
    small = spr.schedule(gap_mbd=0.5, first_relief_days=5, relief_coverage_pct=100.0, horizon_days=30)
    large = spr.schedule(gap_mbd=5.0, first_relief_days=5, relief_coverage_pct=0.0, horizon_days=90)
    assert large["replenishment"]["replenishment_window_days"] >= small["replenishment"]["replenishment_window_days"]


def test_no_release_means_no_replenishment_needed():
    result = spr.schedule(gap_mbd=0.0, first_relief_days=1, relief_coverage_pct=100.0, horizon_days=10)
    assert result["replenishment"]["refill_needed_mbbl"] == 0
    assert result["replenishment"]["replenishment_window_days"] == 0
    assert result["replenishment"]["replenishment_complete_day"] == result["replenishment"]["replenishment_start_day"]


def test_replenishment_start_day_respects_cooldown():
    from app.core import data
    cooldown = data.assumptions()["spr"]["replenishment_cooldown_days"]["value"]
    result = spr.schedule(gap_mbd=1.0, first_relief_days=7, relief_coverage_pct=50.0, horizon_days=30)
    assert result["replenishment"]["replenishment_start_day"] == 7 + cooldown
