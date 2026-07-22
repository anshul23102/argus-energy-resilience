# Phase 3: Power sector stress modeling — design

Part of the [requirements gap-closing roadmap](2026-07-22-requirements-gap-roadmap.md).
The problem statement names "power sector stress" explicitly as a required
cascading impact, alongside refinery run rates, retail fuel prices, and GDP
trajectory (all already modeled). Not modeled at all today.

## Honesty constraint

India's electricity generation is only ~0.2% oil-fired (coal is 74%, per the
Global Context page's own sourced figures) — a direct oil-to-electricity
substitution model would misrepresent the grid. The two real, indirect
transmission channels modeled here instead:

1. **Diesel backup capacity squeeze.** When refinery runs get cut (already
   modeled via `util_traj`), diesel/HSD output falls proportionally. Diesel
   gensets are India's standing backup power for telecom towers, industry, and
   grid emergencies — a refinery run-cut tightens that backup capacity.
2. **Gas-fired generation cost stress.** India's gas-based power capacity is
   largely peaking/marginal supply; gas/LNG procurement costs move partly with
   oil price benchmarks. A sustained Brent spike (already modeled) raises gas
   generation costs, pressuring utilities to curtail gas-fired output.

Both channels are simple scaled transmissions from trajectory outputs the
engine already computes (refinery utilization, sustained Brent delta) to a
headline macro number — the same pattern already used for the existing GDP and
CAD impact headlines, not a new Monte Carlo dimension. Flagged low/medium
confidence per parameter, same honesty-ledger convention as everything else in
`assumptions.yaml`.

## Assumptions

New `power_sector` block in `data/assumptions.yaml`:

```yaml
power_sector:
  diesel_share_of_refinery_output_pct: {value: 40, note: "Diesel/HSD share of Indian refinery product slate", source: "PPAC product-wise refinery output approx", confidence: medium}
  diesel_dependent_backup_capacity_gw: {value: 90, note: "National diesel genset backup capacity (telecom, industry, DISCOM emergency), order-of-magnitude", confidence: low}
  gas_power_capacity_gw: {value: 25, note: "India's gas-based power generation capacity, largely used as peaking/marginal supply", source: "CEA installed capacity report approx", confidence: medium}
  gas_price_oil_linkage_pct: {value: 60, note: "Approximate share of India's gas/LNG procurement cost that moves with oil price benchmarks", confidence: low}
  load_shedding_hours_per_gw_deficit: {value: 0.15, note: "Expert-judgment mapping from effective generation deficit (GW) to daily load-shedding hours during a stress event", confidence: low}
```

## Scenario engine

`engines/scenario.py`, at the end of `run()` alongside the existing GDP/CAD
headline calculations (same P50-over-horizon pattern):

```
avg_util_deficit    = P50 of mean(1 - util_traj) over the horizon, per run
diesel_shortfall_pct = avg_util_deficit * diesel_share_of_refinery_output_pct
backup_capacity_lost_gw = diesel_dependent_backup_capacity_gw * diesel_shortfall_pct

gas_cost_increase_pct = (sustained_delta / brent0) * gas_price_oil_linkage_pct
gas_capacity_curtailed_gw = gas_power_capacity_gw * clamp(gas_cost_increase_pct, 0, 1)

effective_deficit_gw = backup_capacity_lost_gw + gas_capacity_curtailed_gw
load_shedding_hours_p50 = effective_deficit_gw * load_shedding_hours_per_gw_deficit
```

`sustained_delta` is an already-computed variable in `run()` (mean Brent delta
over the horizon, P50) — reused as-is, not recomputed.

Added to the `headline` dict: `power_deficit_gw_p50`, `power_load_shedding_hours_p50`.
`assumption_refs` gains `"power_sector.*"`.

This applies uniformly to both `chokepoint_closure` and `opec_cut` shock types
for free — it only reads trajectory outputs both paths already produce, no
shock-type branching needed.

## Frontend

- `(app)/scenario/page.tsx`: one new stat tile ("Power stress", showing
  `power_load_shedding_hours_p50` with an `InfoTip` explaining the indirect
  mechanism), alongside the existing 6 tiles.
- `(app)/assumptions/page.tsx`: a new "Power sector" entry in the `GROUPS` array
  (same data-driven pattern as the existing 3 groups — no new component logic),
  surfacing 2-3 of the new parameters as editable/inspectable.

## Out of scope

Any change to `spr.py` or `procurement.py` — power stress is a read-only
headline output of the existing scenario trajectory, not a new decision lever
those engines act on. A full per-state or per-DISCOM breakdown is also out of
scope — this is a single national headline number, consistent with how GDP/CAD
impact are already single national numbers, not state-level breakdowns.
