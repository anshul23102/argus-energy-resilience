# Phase 4: Procurement LP realism (tanker availability + port congestion) — design

Part of the [requirements gap-closing roadmap](2026-07-22-requirements-gap-roadmap.md).
The problem statement names tanker availability and port congestion explicitly
as factors the "Adaptive Procurement Orchestrator" should account for. Neither
is in the LP today.

## A pre-existing find

`data/assumptions.yaml`'s `logistics` block already has `vlcc_capacity_mbbl`
(2.0, confidence high) and `port_max_vlcc_per_day` (2, confidence medium,
"Per SPM discharge realistic cap") — sourced and confidence-tagged, but never
actually read by any engine. This phase wires them in rather than inventing new
duplicate parameters.

## Tanker availability (per route)

A shipping route needs enough tankers cycling through its round-trip voyage
time to sustain a given daily flow. New assumption:

```yaml
logistics:
  available_tankers_per_route: {value: 8, note: "Tankers realistically available/willing to service a given route during a crisis (round-trip constrained); order-of-magnitude default applied uniformly across routes", confidence: low}
```

Per-route capacity: `available_tankers_per_route * vlcc_capacity_mbbl / (2 *
voyage_days)` (round trip ≈ 2× one-way voyage days). For a short Hormuz route
(~8.5 voyage days) that's ~0.6 mb/d; for the long Baltic-Cape route (~39 days)
it's ~0.13 mb/d — smaller than several suppliers' modeled spare capacity, so
this constraint will actually bind in the LP, pushing the solution toward
multi-route diversification rather than dumping all replacement volume onto
the single cheapest route (which the LP does today, unrealistically).

## Port congestion (aggregate)

Routes list multiple candidate discharge ports (`to_ports`) without picking
one specific port per shipment, so a per-specific-port constraint would
require guessing which port a given order actually uses. Instead: one
aggregate ceiling using the two pre-existing assumptions plus one new one:

```yaml
logistics:
  crisis_active_discharge_points: {value: 3, note: "Number of India import points (SPMs/ports) that can realistically absorb surge cargo simultaneously during a crisis", confidence: low}
```

Total capacity: `port_max_vlcc_per_day * vlcc_capacity_mbbl *
crisis_active_discharge_points`. This is intentionally looser than the
per-route tanker constraint — a backstop for extreme scenarios, not the
primary binding constraint in ordinary cases. Documented as such, not hidden.

## `engines/procurement.py`

Two new LP constraints in `optimize()`:
- Per route: `sum(x[i] for candidates on route r) <= tanker_capacity_mbd(r)`.
- Aggregate: `sum(all x[i]) <= port_congestion_cap_mbd`.

The aggregate constraint can make an otherwise-feasible gap genuinely
infeasible — a new, meaningful failure mode: suppliers may have spare capacity,
but India's ports can't physically absorb unlimited surge volume. `constraints`
in the returned dict gains `port_congestion_cap_mbd` for transparency.

## Frontend

The two new assumptions (`available_tankers_per_route`,
`crisis_active_discharge_points`) surface in the existing "Response capability"
group on the Assumptions page — same data-driven pattern, no new component
logic. No other UI changes: this phase is primarily a correctness upgrade to
an already-shipped feature (the procurement LP), not a new user-facing
capability, so the Scenario Console's order sheet needs no restructuring — a
tighter, more realistic order sheet is exactly what "more realistic LP" should
produce without any UI change.

## Out of scope

Per-specific-port assignment (ambiguous given the `to_ports` data shape, as
explained above). Real-time or route-specific tanker fleet data — this remains
a single uniform default, same treatment as other order-of-magnitude
assumptions elsewhere in the project.
