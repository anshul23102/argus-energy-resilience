"""Scenario console endpoints: what-if simulation and the full orchestrated response."""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..engines import orchestrator, scenario
from ..engines.prices import quotes

router = APIRouter()


class ScenarioIn(BaseModel):
    chokepoint: str | None = "hormuz"
    closure_pct: float = Field(60.0, ge=5, le=100)
    duration_days: int = Field(21, ge=3, le=90)
    use_live_brent: bool = True
    shock_type: str = "chokepoint_closure"


@router.post("/simulate")
def simulate(s: ScenarioIn):
    brent = quotes()["brent"]["price"] if s.use_live_brent else None
    return {
        "managed": scenario.run(s.chokepoint, s.closure_pct, s.duration_days,
                                managed=True, brent_now=brent, shock_type=s.shock_type),
        "unmanaged": scenario.run(s.chokepoint, s.closure_pct, s.duration_days,
                                  managed=False, brent_now=brent, shock_type=s.shock_type),
    }


@router.post("/respond")
def respond(s: ScenarioIn):
    brent = quotes()["brent"]["price"] if s.use_live_brent else None
    return orchestrator.respond(s.chokepoint, s.closure_pct, s.duration_days,
                                brent_now=brent, shock_type=s.shock_type)
