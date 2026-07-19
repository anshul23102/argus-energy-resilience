"""Data layer: loads the curated infrastructure datasets and assumptions.

All model inputs come from files in `data/` — nothing is hardcoded in engine code.
This is a deliberate design commitment (see data/assumptions.yaml header).
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

DATA_DIR = Path(__file__).resolve().parents[3] / "data"


def _load_json(name: str) -> dict[str, Any]:
    with open(DATA_DIR / name) as f:
        return json.load(f)


@lru_cache(maxsize=1)
def refineries() -> list[dict]:
    return _load_json("refineries.json")["refineries"]


@lru_cache(maxsize=1)
def ports() -> list[dict]:
    return _load_json("ports_spr.json")["import_ports"]


@lru_cache(maxsize=1)
def spr_sites() -> list[dict]:
    return _load_json("ports_spr.json")["spr_sites"]


@lru_cache(maxsize=1)
def suppliers() -> list[dict]:
    return _load_json("suppliers_grades.json")["suppliers"]


@lru_cache(maxsize=1)
def grades() -> dict[str, dict]:
    return _load_json("suppliers_grades.json")["grades"]


@lru_cache(maxsize=1)
def chokepoints() -> list[dict]:
    return _load_json("routes_chokepoints.json")["chokepoints"]


@lru_cache(maxsize=1)
def routes() -> list[dict]:
    return _load_json("routes_chokepoints.json")["routes"]


@lru_cache(maxsize=1)
def assumptions() -> dict[str, Any]:
    with open(DATA_DIR / "assumptions.yaml") as f:
        return yaml.safe_load(f)


def assumption(path: str) -> Any:
    """Fetch a single assumption value by dotted path, e.g. 'logistics.vlcc_capacity_mbbl'."""
    node: Any = assumptions()
    for key in path.split("."):
        node = node[key]
    if isinstance(node, dict) and "value" in node:
        return node["value"]
    return node
