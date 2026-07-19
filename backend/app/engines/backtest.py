"""Backtest harness: replays real historical crisis timelines through the SAME
Bayesian risk engine used live, and overlays actual Brent prices.

This is the evidence for 'signal detection lead time' — the evaluation focus —
measured, not asserted. No look-ahead: the engine only sees events up to each day.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from functools import lru_cache
from pathlib import Path

from ..core.data import DATA_DIR, assumptions
from .risk import RiskEngine, Event
from . import prices

ALERT_THRESHOLD = assumptions()["risk_engine"]["alert_threshold"]["value"]


@lru_cache(maxsize=1)
def episodes() -> list[dict]:
    with open(DATA_DIR / "backtest_episodes.json") as f:
        return json.load(f)["episodes"]


def _daterange(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def run(episode_id: str, include_prices: bool = True) -> dict:
    ep = next(e for e in episodes() if e["id"] == episode_id)
    start = date.fromisoformat(ep["window_start"])
    end = date.fromisoformat(ep["window_end"])
    peak = date.fromisoformat(ep["peak_impact_date"])

    engine = RiskEngine()  # fresh engine, no live-state contamination
    ev_by_date: dict[str, list[dict]] = {}
    for e in ep["events"]:
        ev_by_date.setdefault(e["date"], []).append(e)

    trajectory = []
    alert_date: date | None = None
    for day in _daterange(start, end):
        for e in ev_by_date.get(day.isoformat(), []):
            engine.ingest(Event(
                corridor=ep["corridor"], severity=e["severity"], summary=e["summary"],
                source="backtest", timestamp=datetime(day.year, day.month, day.day).timestamp(),
                corroborations=3,  # historical events are confirmed facts, fully corroborated
            ))
        score = engine.corridor_risk(
            ep["corridor"], horizon_days=30,
            now_ts=datetime(day.year, day.month, day.day, 23, 59).timestamp(),
        )
        p = score["posterior_horizon_prob"]
        if alert_date is None and p >= ALERT_THRESHOLD:
            alert_date = day
        trajectory.append({"date": day.isoformat(), "risk": p,
                           "events": [e["summary"] for e in ev_by_date.get(day.isoformat(), [])]})

    brent = []
    if include_prices:
        try:
            brent = prices.brent_history(ep["window_start"], ep["window_end"])
        except Exception:
            pass

    lead_days = (peak - alert_date).days if alert_date else None
    return {
        "episode": {k: v for k, v in ep.items() if k != "events"},
        "alert_threshold": ALERT_THRESHOLD,
        "alert_date": alert_date.isoformat() if alert_date else None,
        "peak_impact_date": peak.isoformat(),
        "lead_time_days": lead_days,
        "trajectory": trajectory,
        "brent": brent,
        "assumption_refs": ["risk_engine.severity_likelihood_ratios",
                            "risk_engine.evidence_halflife_days"],
    }


def summary() -> list[dict]:
    out = []
    for ep in episodes():
        r = run(ep["id"], include_prices=False)
        out.append({
            "id": ep["id"], "name": ep["name"], "corridor": ep["corridor"],
            "alert_date": r["alert_date"], "peak_impact_date": r["peak_impact_date"],
            "lead_time_days": r["lead_time_days"],
        })
    return out
