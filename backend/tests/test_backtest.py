"""Regression tests for the historical backtest harness (app/engines/backtest.py).

These lock in the no-look-ahead guarantee and the lead-time computation that
the Corridor Risk page's "Engine validation" section depends on.
"""
from datetime import date

from app.engines import backtest


def test_all_episodes_load_and_run():
    for ep in backtest.episodes():
        result = backtest.run(ep["id"], include_prices=False)
        assert result["episode"]["id"] == ep["id"]
        assert result["peak_impact_date"] == ep["peak_impact_date"]


def test_alert_date_never_precedes_the_first_event():
    for ep in backtest.episodes():
        result = backtest.run(ep["id"], include_prices=False)
        if result["alert_date"] is None:
            continue
        first_event_date = min(date.fromisoformat(e["date"]) for e in ep["events"])
        assert date.fromisoformat(result["alert_date"]) >= first_event_date


def test_lead_time_is_days_between_alert_and_peak():
    for ep in backtest.episodes():
        result = backtest.run(ep["id"], include_prices=False)
        if result["alert_date"] is None:
            assert result["lead_time_days"] is None
            continue
        expected = (date.fromisoformat(result["peak_impact_date"])
                    - date.fromisoformat(result["alert_date"])).days
        assert result["lead_time_days"] == expected


def test_summary_covers_every_episode():
    ids = {ep["id"] for ep in backtest.episodes()}
    summarized_ids = {row["id"] for row in backtest.summary()}
    assert ids == summarized_ids
