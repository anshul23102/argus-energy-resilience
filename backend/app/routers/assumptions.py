"""Assumptions API: the model's parameters, inspectable and stress-testable live.

This is the anti-black-box interface: a judge (or analyst) changes a number and
re-runs the scenario — the whole cascade recomputes. Overrides are session-only;
data/assumptions.yaml remains the audited source of truth.
"""
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core import data

router = APIRouter()


@router.get("")
def get_assumptions():
    return {"assumptions": data.assumptions(), "overrides": data.overrides()}


class OverrideIn(BaseModel):
    path: str          # dotted, e.g. "economics.global_price_sensitivity_usd_per_mbd"
    value: Any


@router.patch("")
def set_assumption(o: OverrideIn):
    if not isinstance(o.value, (int, float)):
        raise HTTPException(422, "only numeric overrides are supported")
    if not data.set_override(o.path, float(o.value)):
        raise HTTPException(404, f"unknown assumption path: {o.path}")
    return {"ok": True, "overrides": data.overrides()}


@router.delete("")
def reset_assumptions():
    return {"ok": True, "cleared": data.clear_overrides()}
