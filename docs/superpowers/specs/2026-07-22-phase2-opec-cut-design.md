# Phase 2: OPEC+ emergency cut scenario type — design

Part of the [requirements gap-closing roadmap](2026-07-22-requirements-gap-roadmap.md).
The problem statement names "OPEC+ emergency cut" explicitly as an example
scenario. Structurally different from the existing chokepoint-closure scenarios:
no shipping route is blocked — it's a production-side cut at the source, so ships
sail fine, but there's simply less crude produced.

## OPEC+ supplier set

`backend/app/core/data.py` gains:

```python
OPEC_PLUS_SUPPLIER_IDS = {"russia", "iraq", "saudi-arabia", "uae", "kuwait", "nigeria", "angola"}
# Simplification: real OPEC+ membership has shifted (e.g. Angola formally left
# OPEC in Jan 2024); treated as OPEC+-associated here for scenario purposes. This
# is every supplier in suppliers_grades.json except the USA — documented, not
# hidden, per the project's honesty-ledger convention.


def opec_plus_exposure_pct() -> float:
    return sum(s["share_pct"] for s in suppliers() if s["id"] in OPEC_PLUS_SUPPLIER_IDS)
```

## Assumptions

`data/assumptions.yaml`, new key under `scenario_engine`:

```yaml
opec_plus_global_production_mbd: {value: 40.0, note: "Approximate combined OPEC+ crude production baseline", source: "order-of-magnitude, OPEC MOMR/EIA STEO", confidence: low}
```

This is the OPEC+-cut analog of a chokepoint's `daily_oil_flow_mbd` — the global
volume the price-impact calculation scales against.

## Scenario engine

`engines/scenario.py`: `run()` gains `shock_type: str = "chokepoint_closure"`
(also accepts `"opec_cut"`; `chokepoint_id` becomes `str | None`, unused when
`shock_type == "opec_cut"`). At the top of `run()`, branch to compute `exposure`,
`global_flow`, and a new `allow_bypass` flag:

- `chokepoint_closure` (existing behavior, unchanged): `exposure =
  graph.supply_at_risk(chokepoint_id) / 100`, `global_flow =
  cp["daily_oil_flow_mbd"]`, `allow_bypass = chokepoint_id == "hormuz"`.
- `opec_cut`: `exposure = data.opec_plus_exposure_pct() / 100`, `global_flow =
  assumptions["scenario_engine"]["opec_plus_global_production_mbd"]["value"]`,
  `allow_bypass = False` (a production cut has nothing to physically bypass).

The relief-ceiling calculation (`relief_ceiling_mbd`, currently summing every
supplier's spare capacity) excludes OPEC+ suppliers' own spare capacity when
`shock_type == "opec_cut"` — they're the ones cutting, so during the cut they have
no genuine spare to offer. In our 8-supplier dataset that leaves only the USA's
spare capacity as real relief. The rest of the day-by-day Monte Carlo loop (SPR
release, refinery utilization, stock burn, price accumulation) is unchanged,
shared code — this is the same design principle as Phase 1: extend the existing
engine rather than fork a parallel one.

## Procurement LP

`engines/procurement.py`: `optimize()` gains `excluded_suppliers: list[str] |
None = None`. Candidates from an excluded supplier are skipped entirely (same
early-`continue` pattern already used for zero-spare suppliers). For an OPEC+ cut,
the orchestrator passes `OPEC_PLUS_SUPPLIER_IDS` here, consistent with the
relief-ceiling exclusion above — the LP can only source replacement barrels from
non-cutting suppliers.

## Orchestrator

`engines/orchestrator.py`: `respond()` gains `shock_type` (default
`"chokepoint_closure"`), threaded into both `scenario.run()` calls and
`procurement.optimize()`. For `opec_cut`:

- The "Watchtower" risk read-out becomes the highest-risk OPEC+ supplier's own
  `supplier_risk()` (Phase 1's engine) standing in for the group — same response
  shape (`posterior_horizon_prob`, `drivers`, etc.) the briefing template already
  consumes, so no downstream reshaping needed.
- `chokepoint_name` becomes the fixed label `"OPEC+ coalition"`, reusing the
  existing response field so the frontend needs no restructuring.
- `graph.supply_at_risk`-based exposure/gap calculation is replaced with
  `data.opec_plus_exposure_pct()`.
- `procurement.optimize(..., excluded_suppliers=data.OPEC_PLUS_SUPPLIER_IDS)`.

## API

`routers/scenario.py`: `ScenarioIn` gains `shock_type: str = "chokepoint_closure"`;
`chokepoint` stays as today (still defaults to `"hormuz"`, simply ignored by the
engine when `shock_type == "opec_cut"`). Threaded through to both `/simulate` and
`/respond`.

## Frontend

`(app)/scenario/page.tsx`: a two-way toggle ("Chokepoint closure" / "OPEC+
production cut") above the existing controls. The chokepoint dropdown hides when
OPEC+ cut is selected; the severity slider label switches from "Closure severity"
to "Cut severity". `shock_type` added to the POST body. Everything else (stat
tiles, order sheet, briefing text) already renders generically off the response
shape and needs no changes.

## Out of scope

Any UI distinction on the War Room globe for an OPEC+ cut (no chokepoint to
highlight, by definition) — the Scenario Console is the only surface this phase
touches, consistent with how the existing chokepoint scenarios work today (the
globe doesn't visualize an in-progress simulation either).
