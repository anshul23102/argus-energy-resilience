"""Static-infrastructure endpoints: everything the war-room map renders."""
from fastapi import APIRouter

from ..core import data, graph

router = APIRouter()


@router.get("/refineries")
def get_refineries():
    return data.refineries()


@router.get("/ports")
def get_ports():
    return data.ports()


@router.get("/spr")
def get_spr():
    return data.spr_sites()


@router.get("/suppliers")
def get_suppliers():
    return data.suppliers()


@router.get("/grades")
def get_grades():
    return data.grades()


@router.get("/chokepoints")
def get_chokepoints():
    cps = []
    for cp in data.chokepoints():
        cps.append({**cp, "supply_at_risk_pct": graph.supply_at_risk(cp["id"])})
    return cps


@router.get("/routes")
def get_routes():
    return data.routes()


@router.get("/graph/stats")
def graph_stats():
    g = graph.build()
    kinds: dict[str, int] = {}
    for _, attrs in g.nodes(data=True):
        kinds[attrs.get("kind", "?")] = kinds.get(attrs.get("kind", "?"), 0) + 1
    return {"nodes": g.number_of_nodes(), "edges": g.number_of_edges(), "by_kind": kinds}
