# Phase 3: Power sector stress modeling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a power sector stress headline (load-shedding hours from diesel
backup capacity squeeze + gas-fired generation cost curtailment) to the scenario
engine, closing a gap the problem statement names explicitly as a required
cascading impact.

**Architecture:** A read-only headline computation appended to the end of
`scenario.run()`, reading trajectory outputs (`util_traj`, `sustained_delta`)
the engine already computes — same pattern as the existing GDP/CAD headline
calculations. Applies uniformly to both shock types for free, no branching
needed. No changes to `procurement.py` or `spr.py`.

**Tech Stack:** FastAPI/Python backend (pytest), Next.js/TypeScript frontend. No
new dependencies.

## Global Constraints

- This models *indirect* transmission (diesel backup capacity, gas generation
  cost) — India's grid is ~0.2% oil-fired directly, so no direct oil-to-power
  substitution is modeled or implied anywhere (code, comments, or UI copy).
- Existing headline fields (`peak_brent_p50`, `gdp_impact_bps_p50`, etc.) and
  their values must be byte-for-byte unchanged by this phase.

---

### Task 1: Power sector assumptions

**Files:**
- Modify: `data/assumptions.yaml`

**Interfaces:**
- Produces: a new `power_sector` top-level block with 5 keys, loaded
  automatically by the existing `data.assumptions()` — no code change needed for
  visibility via `GET /api/assumptions`.

- [ ] **Step 1: Add the power_sector block**

In `data/assumptions.yaml`, add a new top-level block after the `response:`
block and before the confidence-legend comment at the end of the file:

```yaml
power_sector:
  diesel_share_of_refinery_output_pct: {value: 40, note: "Diesel/HSD share of Indian refinery product slate", source: "PPAC product-wise refinery output approx", confidence: medium}
  diesel_dependent_backup_capacity_gw: {value: 90, note: "National diesel genset backup capacity (telecom, industry, DISCOM emergency), order-of-magnitude", confidence: low}
  gas_power_capacity_gw: {value: 25, note: "India's gas-based power generation capacity, largely used as peaking/marginal supply", source: "CEA installed capacity report approx", confidence: medium}
  gas_price_oil_linkage_pct: {value: 60, note: "Approximate share of India's gas/LNG procurement cost that moves with oil price benchmarks", confidence: low}
  load_shedding_hours_per_gw_deficit: {value: 0.15, note: "Expert-judgment mapping from effective generation deficit (GW) to daily load-shedding hours during a stress event", confidence: low}
```

- [ ] **Step 2: Verify**

Run: `cd backend && .venv/bin/python3 -c "from app.core import data; print(data.assumptions()['power_sector'])"`
Expected: dict with all 5 keys.

- [ ] **Step 3: Commit**

```bash
git add data/assumptions.yaml
git commit -m "feat: add power sector stress assumptions"
```

---

### Task 2: Scenario engine power stress headline

**Files:**
- Modify: `backend/app/engines/scenario.py`
- Test: `backend/tests/test_scenario.py`

**Interfaces:**
- Consumes: `data.assumptions()["power_sector"]` (Task 1); existing `util_traj`,
  `sustained_delta`, `brent0` locals already computed in `run()`.
- Produces: `run()`'s returned `headline` dict gains `power_deficit_gw_p50: float`
  and `power_load_shedding_hours_p50: float`. `assumption_refs` gains
  `"power_sector.*"`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_scenario.py`:

```python
def test_headline_includes_power_stress_fields():
    result = scenario.run("hormuz", closure_pct=60.0, duration_days=21, n_runs=50)
    h = result["headline"]
    assert "power_deficit_gw_p50" in h
    assert "power_load_shedding_hours_p50" in h
    assert h["power_deficit_gw_p50"] >= 0
    assert h["power_load_shedding_hours_p50"] >= 0


def test_more_severe_closure_does_not_reduce_power_stress():
    """A harsher closure should never show LESS power stress than a milder one —
    monotonicity sanity check on the diesel/gas transmission chain."""
    mild = scenario.run("hormuz", closure_pct=20.0, duration_days=21, n_runs=200, seed=7)
    severe = scenario.run("hormuz", closure_pct=90.0, duration_days=21, n_runs=200, seed=7)
    assert severe["headline"]["power_load_shedding_hours_p50"] >= mild["headline"]["power_load_shedding_hours_p50"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python3 -m pytest tests/test_scenario.py -v -k power`
Expected: FAIL — `KeyError: 'power_deficit_gw_p50'` (the headline dict doesn't have
these keys yet).

- [ ] **Step 3: Compute the power stress headline**

In `backend/app/engines/scenario.py`, find:

```python
    peak_brent = float(np.percentile(brent_traj.max(axis=1), 50))
    sustained_delta = float(np.percentile(brent_traj.mean(axis=1) - brent0, 50))
    gdp_bps = sustained_delta / 10.0 * a["price_transmission"]["crude_10usd_to_gdp_bps"]["value"]
    cad_pct = sustained_delta / 10.0 * a["price_transmission"]["crude_10usd_to_cad_pct_gdp"]["value"]
    retail_delta = float(np.percentile(brent_traj.max(axis=1) - brent0, 50)) * pass_through
    min_stock_p50 = float(np.percentile(stock_traj.min(axis=1), 50))
    days_below_floor = float((stock_traj < floor_days).sum(axis=1).mean())
```

Add right after this block (still before the `return` statement):

```python
    ps = a["power_sector"]
    avg_util_deficit = float(np.percentile((1.0 - util_traj).mean(axis=1), 50))
    diesel_shortfall_pct = avg_util_deficit * ps["diesel_share_of_refinery_output_pct"]["value"] / 100.0
    backup_capacity_lost_gw = ps["diesel_dependent_backup_capacity_gw"]["value"] * diesel_shortfall_pct

    gas_cost_increase_pct = (sustained_delta / brent0) * ps["gas_price_oil_linkage_pct"]["value"] / 100.0 if brent0 else 0.0
    gas_capacity_curtailed_gw = ps["gas_power_capacity_gw"]["value"] * min(1.0, max(0.0, gas_cost_increase_pct))

    power_deficit_gw = backup_capacity_lost_gw + gas_capacity_curtailed_gw
    power_load_shedding_hours = power_deficit_gw * ps["load_shedding_hours_per_gw_deficit"]["value"]
```

- [ ] **Step 4: Add the new fields to the headline dict and assumption_refs**

Find:

```python
        "headline": {
            "peak_brent_p50": round(peak_brent, 1),
            "retail_petrol_delta_inr_per_litre_p50": round(retail_delta, 1),
            "gdp_impact_bps_p50": round(gdp_bps, 1),
            "cad_impact_pct_gdp_p50": round(cad_pct, 2),
            "min_stock_days_p50": round(min_stock_p50, 1),
            "avg_days_below_floor": round(days_below_floor, 1),
        },
        "assumption_refs": ["response.*", "inventory.*", "economics.*", "scenario_engine.*"],
```

Replace with:

```python
        "headline": {
            "peak_brent_p50": round(peak_brent, 1),
            "retail_petrol_delta_inr_per_litre_p50": round(retail_delta, 1),
            "gdp_impact_bps_p50": round(gdp_bps, 1),
            "cad_impact_pct_gdp_p50": round(cad_pct, 2),
            "min_stock_days_p50": round(min_stock_p50, 1),
            "avg_days_below_floor": round(days_below_floor, 1),
            "power_deficit_gw_p50": round(power_deficit_gw, 2),
            "power_load_shedding_hours_p50": round(power_load_shedding_hours, 2),
        },
        "assumption_refs": ["response.*", "inventory.*", "economics.*", "scenario_engine.*", "power_sector.*"],
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python3 -m pytest tests/test_scenario.py -v`
Expected: PASS, all 5 tests (3 from phase 2 + 2 new).

- [ ] **Step 6: Run the full backend suite to confirm no regression**

Run: `cd backend && .venv/bin/python3 -m pytest -v`
Expected: PASS, all tests (29 from phase 2 plus these 2 new = 31).

- [ ] **Step 7: Commit**

```bash
git add backend/app/engines/scenario.py backend/tests/test_scenario.py
git commit -m "feat: add power sector stress headline to the scenario engine"
```

---

### Task 3: Frontend — Scenario Console stat tile

**Files:**
- Modify: `frontend/src/app/(app)/scenario/page.tsx`

**Interfaces:**
- Consumes: `res.scenario_managed.headline.power_load_shedding_hours_p50` — no
  type change needed, `headline` is already typed `Record<string, number>` in
  this file's local `ScenarioResponse` interface.

- [ ] **Step 1: Add the stat tile**

In `frontend/src/app/(app)/scenario/page.tsx`, find the stat tiles array:

```tsx
              {[
                ["Peak Brent", `$${h.peak_brent_p50}`, "Median simulated Brent price at the worst point of the closure, across 1000 Monte Carlo runs."],
                ["Retail petrol", `+₹${h.retail_petrol_delta_inr_per_litre_p50}/L`, "Estimated pump-price rise passed through to Indian consumers from that Brent move."],
                ["GDP impact", `${h.gdp_impact_bps_p50} bps`, "Estimated hit to India's GDP growth, in basis points, from the crude price shock."],
                ["Min cover, managed", `${h.min_stock_days_p50}d`, "Lowest crude stock, in days of cover, India reaches if the response engine acts."],
                ["Min cover, unmanaged", `${hu.min_stock_days_p50}d`, "Same measure with no coordinated response, replacement barrels, or SPR release."],
                ["Response time", `${res.total_response_seconds}s`, "Wall-clock time this simulation actually took to run, end to end, on this machine."],
              ].map(([k, v, tip]) => (
```

Replace with:

```tsx
              {[
                ["Peak Brent", `$${h.peak_brent_p50}`, "Median simulated Brent price at the worst point of the closure, across 1000 Monte Carlo runs."],
                ["Retail petrol", `+₹${h.retail_petrol_delta_inr_per_litre_p50}/L`, "Estimated pump-price rise passed through to Indian consumers from that Brent move."],
                ["GDP impact", `${h.gdp_impact_bps_p50} bps`, "Estimated hit to India's GDP growth, in basis points, from the crude price shock."],
                ["Min cover, managed", `${h.min_stock_days_p50}d`, "Lowest crude stock, in days of cover, India reaches if the response engine acts."],
                ["Min cover, unmanaged", `${hu.min_stock_days_p50}d`, "Same measure with no coordinated response, replacement barrels, or SPR release."],
                ["Power stress", `${h.power_load_shedding_hours_p50}h/day`, "Estimated daily load-shedding from indirect power-sector strain: diesel backup capacity squeezed by refinery run cuts, plus gas-fired generation curtailed by generation cost stress. Not a direct oil-to-electricity effect — India's grid is barely oil-fired."],
                ["Response time", `${res.total_response_seconds}s`, "Wall-clock time this simulation actually took to run, end to end, on this machine."],
              ].map(([k, v, tip]) => (
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Live-check**

With backend and frontend dev servers running, open `http://localhost:3000/scenario`,
run a scenario (either shock type), and confirm a "Power stress" tile appears in
the stat grid reading e.g. "0.42h/day", with its tooltip explaining the indirect
mechanism.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(app\)/scenario/page.tsx
git commit -m "feat: show power sector stress tile on the Scenario Console"
```

---

### Task 4: Frontend — Assumptions page power sector group

**Files:**
- Modify: `frontend/src/app/(app)/assumptions/page.tsx`

**Interfaces:**
- Consumes: `power_sector.diesel_dependent_backup_capacity_gw`,
  `power_sector.gas_power_capacity_gw`, `power_sector.gas_price_oil_linkage_pct`
  (Task 1) via the existing generic `dig()` path-lookup helper — no code change
  needed there.

- [ ] **Step 1: Add the group**

In `frontend/src/app/(app)/assumptions/page.tsx`, find the end of the `GROUPS`
array:

```tsx
  {
    title: "Response capability",
    description: "How fast and how expensive the system's own reaction is.",
    params: [
      { path: "response.war_risk_premium_usd_bbl", label: "War risk premium", unit: "$/bbl" },
      { path: "scenario_engine.refinery_min_run_rate_pct", label: "Refinery minimum run rate", unit: "%" },
      { path: "risk_engine.evidence_halflife_days", label: "Evidence half life", unit: "days" },
    ],
  },
];
```

Replace with:

```tsx
  {
    title: "Response capability",
    description: "How fast and how expensive the system's own reaction is.",
    params: [
      { path: "response.war_risk_premium_usd_bbl", label: "War risk premium", unit: "$/bbl" },
      { path: "scenario_engine.refinery_min_run_rate_pct", label: "Refinery minimum run rate", unit: "%" },
      { path: "risk_engine.evidence_halflife_days", label: "Evidence half life", unit: "days" },
    ],
  },
  {
    title: "Power sector",
    description: "Indirect strain on India's grid from a crude shock: diesel backup capacity and gas-fired generation cost, not direct oil-to-power substitution.",
    params: [
      { path: "power_sector.diesel_dependent_backup_capacity_gw", label: "Diesel backup capacity", unit: "GW" },
      { path: "power_sector.gas_power_capacity_gw", label: "Gas-fired power capacity", unit: "GW" },
      { path: "power_sector.gas_price_oil_linkage_pct", label: "Gas price oil-linkage", unit: "%" },
    ],
  },
];
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Live-check**

Open `http://localhost:3000/assumptions`. Confirm a fourth "Power sector" card
appears with its 3 parameters, each showing a current value and confidence tag,
and that editing one (e.g. changing gas-fired power capacity) and re-running a
scenario on the Scenario Console moves the "Power stress" tile — same
edit-and-recompute behavior every other assumption already has.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(app\)/assumptions/page.tsx
git commit -m "feat: surface power sector assumptions on the Assumptions page"
```

---

## Self-Review Notes

- **Spec coverage:** Assumptions (Task 1) → scenario engine headline (Task 2) →
  Scenario Console tile (Task 3) → Assumptions page group (Task 4). Every
  section of the phase 3 design doc has a task.
- **Placeholder scan:** no TBD/TODO; every step has literal code, YAML, or an
  exact command.
- **Honesty constraint enforced in copy, not just code:** the stat tile's
  tooltip (Task 3) and the Assumptions page group description (Task 4) both
  explicitly state this is an indirect mechanism, matching the design doc's
  "Honesty constraint" section — this isn't just a backend implementation
  detail, it's stated to the user in the UI.
- **Regression risk called out explicitly:** Task 2 Step 6 re-runs the full test
  suite specifically because this task appends to the same `headline` dict and
  `assumption_refs` list every existing scenario consumer (orchestrator,
  frontend) already reads — nothing removes or renames existing keys, only adds.
