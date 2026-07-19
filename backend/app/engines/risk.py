"""Bayesian corridor risk engine (Day-0 core; live evidence feeds arrive Day 1).

Model: each chokepoint has a prior annual hazard (assumptions.yaml, expert prior).
Live events act as likelihood ratios on the odds of a disruption within the
horizon window. Evidence decays exponentially (half-life in assumptions) so stale
alarm doesn't linger. Output: P(disruption within 30d) per corridor + drivers.

This is deliberately NOT an LLM scoring vibes — the LLM (Day 1) only extracts
structured events (corridor, severity rung, corroboration); the math lives here.
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass, field

from ..core import data


@dataclass
class Event:
    corridor: str          # chokepoint id
    severity: str          # rung on the escalation ladder
    summary: str
    source: str
    timestamp: float = field(default_factory=time.time)
    corroborations: int = 1


class RiskEngine:
    def __init__(self) -> None:
        self._events: list[Event] = []

    # -- evidence ---------------------------------------------------------
    def ingest(self, event: Event) -> None:
        self._events.append(event)

    def events(self, corridor: str | None = None) -> list[Event]:
        return [e for e in self._events if corridor is None or e.corridor == corridor]

    # -- scoring ----------------------------------------------------------
    def corridor_risk(self, chokepoint_id: str, horizon_days: int = 30) -> dict:
        a = data.assumptions()["risk_engine"]
        prior_key = f"base_hazard_{chokepoint_id.replace('-', '')}_annual_pct"
        # fall back: unlisted routing points get a nominal 0.5%/yr
        prior_annual = None
        for k, v in a.items():
            if k.startswith("base_hazard") and chokepoint_id.replace("-", "") in k.replace("_", ""):
                prior_annual = v["value"]
        if prior_annual is None:
            prior_annual = 0.5

        # annual hazard -> P(event in horizon) under constant hazard rate
        lam = -math.log(1 - prior_annual / 100.0)
        p0 = 1 - math.exp(-lam * horizon_days / 365.0)

        # Bayes-factor update from decayed live evidence
        halflife = a["evidence_halflife_days"]["value"]
        ratios = a["severity_likelihood_ratios"]
        odds = p0 / (1 - p0)
        drivers = []
        now = time.time()
        for e in self.events(chokepoint_id):
            age_days = (now - e.timestamp) / 86400.0
            decay = 0.5 ** (age_days / halflife)
            lr = ratios.get(e.severity, 1.0)
            effective_lr = 1.0 + (lr - 1.0) * decay * min(e.corroborations, 3) / 3.0
            odds *= effective_lr
            drivers.append({
                "summary": e.summary, "severity": e.severity, "source": e.source,
                "age_days": round(age_days, 1), "likelihood_ratio_applied": round(effective_lr, 2),
            })

        p = odds / (1 + odds)
        return {
            "chokepoint": chokepoint_id,
            "horizon_days": horizon_days,
            "prior_annual_pct": prior_annual,
            "prior_horizon_prob": round(p0, 4),
            "posterior_horizon_prob": round(p, 4),
            "drivers": sorted(drivers, key=lambda d: -d["likelihood_ratio_applied"]),
        }

    def all_corridors(self, horizon_days: int = 30) -> list[dict]:
        return [self.corridor_risk(cp["id"], horizon_days) for cp in data.chokepoints()]


ENGINE = RiskEngine()
