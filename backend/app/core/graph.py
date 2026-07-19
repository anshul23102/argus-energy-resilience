"""Supply-network knowledge graph.

Builds a directed multigraph of India's crude supply chain:
  supplier terminal --route(chokepoints, days, nm)--> import port --link--> refinery
  refinery --diet--> grade families;  SPR sites attach to coastal ports.

Implemented on NetworkX for zero-ops portability. `to_cypher()` exports the same
graph as Neo4j CREATE statements (docs/graph.cypher) so the graph is loadable into
Neo4j Desktop/Aura for visual inspection — same model, two backends.
"""
from __future__ import annotations

from functools import lru_cache

import networkx as nx

from . import data


@lru_cache(maxsize=1)
def build() -> nx.MultiDiGraph:
    g = nx.MultiDiGraph()

    for cp in data.chokepoints():
        g.add_node(f"chokepoint:{cp['id']}", kind="chokepoint", **cp)

    for s in data.suppliers():
        g.add_node(f"supplier:{s['id']}", kind="supplier", name=s["name"],
                   share_pct=s["share_pct"], payment_risk=s["payment_risk"])
        for t in s["export_terminals"]:
            g.add_node(f"terminal:{t['id']}", kind="terminal", **t)
            g.add_edge(f"supplier:{s['id']}", f"terminal:{t['id']}", rel="exports_via")
        for gr in s["grades"]:
            g.add_node(f"grade:{gr}", kind="grade", **data.grades()[gr])
            g.add_edge(f"supplier:{s['id']}", f"grade:{gr}", rel="produces")

    for p in data.ports():
        g.add_node(f"port:{p['id']}", kind="port", **{k: v for k, v in p.items() if k != "linked_refineries"})

    for r in data.refineries():
        g.add_node(f"refinery:{r['id']}", kind="refinery", **r)
        if r.get("import_port"):
            g.add_edge(f"port:{r['import_port']}", f"refinery:{r['id']}", rel="feeds",
                       mode="pipeline" if not r["coastal"] else "direct")

    for sp in data.spr_sites():
        g.add_node(f"spr:{sp['id']}", kind="spr", **sp)

    for route in data.routes():
        for src in route["from_terminals"]:
            for dst in route["to_ports"]:
                g.add_edge(
                    f"terminal:{src}", f"port:{dst}", rel="ships_via",
                    route_id=route["id"], distance_nm=route["distance_nm"],
                    voyage_days=route["voyage_days"], chokepoints=route["chokepoints"],
                )
    return g


def routes_through(chokepoint_id: str) -> list[str]:
    """Route ids that transit the given chokepoint."""
    return [r["id"] for r in data.routes() if chokepoint_id in r["chokepoints"]]


def supply_at_risk(chokepoint_id: str) -> float:
    """Share of India's imports (pct points) exposed to a chokepoint,
    derived from supplier shares x route mapping — not a hardcoded number."""
    exposed = 0.0
    affected_routes = set(routes_through(chokepoint_id))
    for s in data.suppliers():
        terminal_ids = {t["id"] for t in s["export_terminals"]}
        supplier_routes = [r for r in data.routes() if terminal_ids & set(r["from_terminals"])]
        if not supplier_routes:
            continue
        hit = [r for r in supplier_routes if r["id"] in affected_routes]
        if hit:
            # Assume flow splits evenly across a supplier's available routes (assumption,
            # refined later by AIS-observed splits).
            exposed += s["share_pct"] * len(hit) / len(supplier_routes)
    return round(exposed, 1)


def to_cypher() -> str:
    g = build()
    lines: list[str] = []
    for node, attrs in g.nodes(data=True):
        kind = attrs.get("kind", "node")
        props = {k: v for k, v in attrs.items() if isinstance(v, (str, int, float, bool)) and k != "kind"}
        prop_str = ", ".join(f"{k}: {v!r}" for k, v in props.items())
        lines.append(f"CREATE (:{kind.capitalize()} {{id: {node!r}, {prop_str}}});")
    for u, v, attrs in g.edges(data=True):
        rel = attrs.get("rel", "REL").upper()
        lines.append(
            f"MATCH (a {{id: {u!r}}}), (b {{id: {v!r}}}) CREATE (a)-[:{rel}]->(b);"
        )
    return "\n".join(lines)
