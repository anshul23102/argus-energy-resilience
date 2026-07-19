"""Risk endpoints: corridor risk scores + manual event injection (until live feeds land)."""
from fastapi import APIRouter
from pydantic import BaseModel

from ..engines.risk import ENGINE, Event

router = APIRouter()


@router.get("/corridors")
def corridors(horizon_days: int = 30):
    return ENGINE.all_corridors(horizon_days)


@router.get("/corridors/{chokepoint_id}")
def corridor(chokepoint_id: str, horizon_days: int = 30):
    return ENGINE.corridor_risk(chokepoint_id, horizon_days)


class EventIn(BaseModel):
    corridor: str
    severity: str
    summary: str
    source: str = "manual"
    corroborations: int = 1


@router.post("/events")
def add_event(e: EventIn):
    ENGINE.ingest(Event(**e.model_dump()))
    return {"ok": True, "events_total": len(ENGINE.events())}
