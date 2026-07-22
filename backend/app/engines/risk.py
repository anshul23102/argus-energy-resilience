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
    corridor: str | None   # chokepoint id, or None if this is a supplier-only event
    severity: str          # rung on the escalation ladder
    summary: str
    source: str
    timestamp: float = field(default_factory=time.time)
    corroborations: int = 1
    supplier: str | None = None   # supplier id, or None if this is a corridor-only event


class RiskEngine:
    def __init__(self) -> None:
        self._events: list[Event] = []

    # -- evidence ---------------------------------------------------------
    def ingest(self, event: Event) -> None:
        self._events.append(event)

    def events(self, corridor: str | None = None) -> list[Event]:
        return [e for e in self._events if corridor is None or e.corridor == corridor]

    def events_for_supplier(self, supplier_id: str) -> list[Event]:
        return [e for e in self._events if e.supplier == supplier_id]

    # -- scoring ----------------------------------------------------------
    def corridor_risk(self, chokepoint_id: str, horizon_days: int = 30,
                      now_ts: float | None = None) -> dict:
        """Score a corridor. `now_ts` lets the backtest evaluate 'as of' a past
        day — evidence after that instant is ignored (no look-ahead)."""
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
        now = now_ts if now_ts is not None else time.time()
        for e in self.events(chokepoint_id):
            age_days = (now - e.timestamp) / 86400.0
            if age_days < 0:
                continue  # event is in this evaluation instant's future — invisible
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

    def supplier_risk(self, supplier_id: str, horizon_days: int = 30,
                      now_ts: float | None = None) -> dict:
        """Score a supplier's own disruption risk (sanctions, export-terminal
        incidents, political instability) — same Bayesian shape as corridor_risk.
        Looked up by exact key (supplier ids are exact, one-to-one identifiers),
        unlike corridor_risk's fuzzy substring match for chokepoints."""
        a = data.assumptions()["risk_engine"]
        prior_key = f"base_hazard_supplier_{supplier_id}_annual_pct"
        prior_annual = a.get(prior_key, {}).get("value", 0.5)

        lam = -math.log(1 - prior_annual / 100.0)
        p0 = 1 - math.exp(-lam * horizon_days / 365.0)

        halflife = a["evidence_halflife_days"]["value"]
        ratios = a["severity_likelihood_ratios"]
        odds = p0 / (1 - p0)
        drivers = []
        now = now_ts if now_ts is not None else time.time()
        for e in self.events_for_supplier(supplier_id):
            age_days = (now - e.timestamp) / 86400.0
            if age_days < 0:
                continue
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
            "supplier": supplier_id,
            "horizon_days": horizon_days,
            "prior_annual_pct": prior_annual,
            "prior_horizon_prob": round(p0, 4),
            "posterior_horizon_prob": round(p, 4),
            "drivers": sorted(drivers, key=lambda d: -d["likelihood_ratio_applied"]),
        }

    def all_suppliers(self, horizon_days: int = 30) -> list[dict]:
        return [self.supplier_risk(s["id"], horizon_days) for s in data.suppliers()]


ENGINE = RiskEngine()
