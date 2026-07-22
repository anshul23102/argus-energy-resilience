# Phase 2: OPEC+ emergency cut scenario type — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "OPEC+ emergency cut" scenario type — a production-side supply
cut with no shipping route involved — alongside the existing chokepoint-closure
scenarios, closing a gap the problem statement names explicitly as an example
scenario.

**Architecture:** Thread a `shock_type: "chokepoint_closure" | "opec_cut"`
parameter through the existing scenario engine, procurement LP, and orchestrator,
branching only the handful of calculations that genuinely differ (exposure
share, global price-impact volume, relief-capacity pool, which suppliers the LP
may draw from) while reusing the shared day-by-day Monte Carlo loop and LP solve
unchanged. Same design principle as Phase 1: extend, don't fork.

**Tech Stack:** FastAPI/Python backend (pytest), Next.js/TypeScript frontend. No
new dependencies.

## Global Constraints

- `OPEC_PLUS_SUPPLIER_IDS` = every supplier in `data/suppliers_grades.json`
  except `usa`: `{russia, iraq, saudi-arabia, uae, kuwait, nigeria, angola}`.
- Existing chokepoint-closure behavior must be byte-for-byte unchanged — every
  pre-existing test in `test_procurement.py` and any live chokepoint-closure
  curl check must still pass/match after this phase.

---

### Task 1: OPEC+ supplier set and assumption

**Files:**
- Modify: `backend/app/core/data.py`
- Modify: `data/assumptions.yaml`

**Interfaces:**
- Produces: `data.OPEC_PLUS_SUPPLIER_IDS: set[str]`; `data.opec_plus_exposure_pct()
  -> float`; new assumption key `scenario_engine.opec_plus_global_production_mbd`.

- [ ] **Step 1: Add the OPEC+ supplier set and exposure helper**

In `backend/app/core/data.py`, insert between the existing `suppliers()` and
`grades()` functions:

```python
OPEC_PLUS_SUPPLIER_IDS = {"russia", "iraq", "saudi-arabia", "uae", "kuwait", "nigeria", "angola"}
# Simplification: real OPEC+ membership has shifted (e.g. Angola formally left
# OPEC in Jan 2024); treated as OPEC+-associated here for scenario purposes. This
# is every supplier in suppliers_grades.json except the USA.


def opec_plus_exposure_pct() -> float:
    return sum(s["share_pct"] for s in suppliers() if s["id"] in OPEC_PLUS_SUPPLIER_IDS)
```

- [ ] **Step 2: Add the global production assumption**

In `data/assumptions.yaml`, inside the `scenario_engine:` block, after
`spr_max_drawdown_mbd`, add:

```yaml
  opec_plus_global_production_mbd: {value: 40.0, note: "Approximate combined OPEC+ crude production baseline", source: "order-of-magnitude, OPEC MOMR/EIA STEO", confidence: low}
```

- [ ] **Step 3: Verify**

Run: `cd backend && .venv/bin/python3 -c "from app.core import data; print(data.OPEC_PLUS_SUPPLIER_IDS); print(data.opec_plus_exposure_pct()); print(data.assumptions()['scenario_engine']['opec_plus_global_production_mbd'])"`
Expected: the 7-member set, a number around 85 (36+19+13+8+4+3+2 from the supplier
shares, minus USA's 5), and the new assumption dict.

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/data.py data/assumptions.yaml
git commit -m "feat: add OPEC+ supplier set and global production assumption"
```

---

### Task 2: Scenario engine `shock_type`

**Files:**
- Modify: `backend/app/engines/scenario.py`
- Test: `backend/tests/test_scenario.py` (new)

**Interfaces:**
- Consumes: `data.OPEC_PLUS_SUPPLIER_IDS`, `data.opec_plus_exposure_pct()` (Task
  1).
- Produces: `run(chokepoint_id: str | None, ..., shock_type: str =
  "chokepoint_closure")` — same return shape as today, plus `inputs["shock_type"]`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_scenario.py`:

```python
"""Tests for the Monte Carlo scenario engine (app/engines/scenario.py), focused
on the opec_cut shock type added in phase 2 — chokepoint_closure behavior is
already covered indirectly via engines/orchestrator.py's live usage and isn't
re-tested here.
"""
from app.engines import scenario


def test_opec_cut_runs_and_has_shock_type_in_inputs():
    result = scenario.run(None, closure_pct=50.0, duration_days=14, n_runs=50,
                          shock_type="opec_cut")
    assert result["inputs"]["shock_type"] == "opec_cut"
    assert result["inputs"]["exposure_pct"] > 0


def test_opec_cut_exposure_matches_opec_plus_share():
    from app.core import data
    result = scenario.run(None, closure_pct=50.0, duration_days=14, n_runs=50,
                          shock_type="opec_cut")
    assert result["inputs"]["exposure_pct"] == round(data.opec_plus_exposure_pct(), 1)


def test_chokepoint_closure_is_unaffected_by_shock_type_default():
    """Default shock_type must reproduce the exact pre-phase-2 exposure
    calculation for a chokepoint scenario — no regression."""
    from app.core import data, graph
    result = scenario.run("hormuz", closure_pct=50.0, duration_days=14, n_runs=50)
    expected_exposure_pct = round(graph.supply_at_risk("hormuz"), 1)
    assert result["inputs"]["exposure_pct"] == expected_exposure_pct
    assert result["inputs"]["shock_type"] == "chokepoint_closure"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python3 -m pytest tests/test_scenario.py -v`
Expected: FAIL — `run()` doesn't accept `shock_type` yet (`TypeError: run() got an
unexpected keyword argument 'shock_type'`), and `chokepoint_id=None` would crash
the existing `next(c for c in data.chokepoints() if c["id"] == chokepoint_id)`
lookup.

- [ ] **Step 3: Implement `shock_type` branching in `run()`**

In `backend/app/engines/scenario.py`, replace the function signature and the
first part of the body up through the stochastic-inputs section:

```python
def run(
    chokepoint_id: str | None,
    closure_pct: float = 60.0,
    duration_days: int = 21,
    horizon_days: int = 90,
    n_runs: int = 1000,
    managed: bool = True,
    brent_now: float | None = None,
    seed: int = 7,
    shock_type: str = "chokepoint_closure",
) -> dict:
    a = data.assumptions()
    rng = np.random.default_rng(seed)

    imports_mbd = a["demand"]["india_crude_processing_mbd"]["value"] * \
        a["demand"]["import_dependency_pct"]["value"] / 100.0
    commercial_days = a["inventory"]["commercial_stock_days"]["value"]
    spr_days = 9.5                                                   # ISPRL Phase I cover
    floor_days = a["inventory"]["min_stock_days_floor"]["value"]
    min_run = a["scenario_engine"]["refinery_min_run_rate_pct"]["value"] / 100.0
    spr_max_mbd = a["scenario_engine"]["spr_max_drawdown_mbd"]["value"]
    price_sens = a["economics"]["global_price_sensitivity_usd_per_mbd"]["value"]
    pass_through = a["economics"]["retail_pass_through_inr_per_litre_per_usd"]["value"]
    brent0 = brent_now or a["economics"]["brent_default_usd"]["value"]

    if shock_type == "opec_cut":
        exposure = data.opec_plus_exposure_pct() / 100.0          # share of imports
        global_flow = a["scenario_engine"]["opec_plus_global_production_mbd"]["value"]
        allow_bypass = False    # a production cut has nothing to physically bypass
    else:
        cp = next(c for c in data.chokepoints() if c["id"] == chokepoint_id)
        exposure = graph.supply_at_risk(chokepoint_id) / 100.0      # share of imports
        global_flow = cp.get("daily_oil_flow_mbd") or 0.0
        allow_bypass = chokepoint_id == "hormuz"

    # stochastic inputs per run
    durations = np.minimum(
        rng.geometric(1.0 / max(duration_days, 1), n_runs), horizon_days
    )  # mean = requested duration; closures end unpredictably
    bypass = _tri(rng, a["response"]["bypass_availability_pct"], n_runs) / 100.0
    ramp_days = _tri(rng, a["response"]["reroute_ramp_days"], n_runs).astype(int)

    spare = a["response"]["supplier_spare_capacity_mbd"]
    excluded_from_relief = data.OPEC_PLUS_SUPPLIER_IDS if shock_type == "opec_cut" else set()
    relief_ceiling_mbd = sum(
        v["value"] for k, v in spare.items()
        if isinstance(v, dict) and "value" in v and k not in excluded_from_relief
    )
```

- [ ] **Step 4: Use the new `allow_bypass` flag in the day-by-day loop**

Still in `backend/app/engines/scenario.py`, find:

```python
        bypass_recovery = gross_loss * bypass[i] * 0.5 if chokepoint_id == "hormuz" else 0.0
```

Replace with:

```python
        bypass_recovery = gross_loss * bypass[i] * 0.5 if allow_bypass else 0.0
```

- [ ] **Step 5: Add `shock_type` to the returned inputs**

Find the `return` statement's `"inputs"` dict:

```python
        "inputs": {"chokepoint": chokepoint_id, "closure_pct": closure_pct,
                   "mean_duration_days": duration_days, "horizon_days": horizon_days,
                   "n_runs": n_runs, "managed": managed, "brent_start": brent0,
                   "exposure_pct": round(exposure * 100, 1),
                   "india_imports_mbd": round(imports_mbd, 2)},
```

Replace with:

```python
        "inputs": {"chokepoint": chokepoint_id, "closure_pct": closure_pct,
                   "mean_duration_days": duration_days, "horizon_days": horizon_days,
                   "n_runs": n_runs, "managed": managed, "brent_start": brent0,
                   "exposure_pct": round(exposure * 100, 1),
                   "india_imports_mbd": round(imports_mbd, 2), "shock_type": shock_type},
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python3 -m pytest tests/test_scenario.py -v`
Expected: PASS, all 3 tests.

- [ ] **Step 7: Run the full backend suite to confirm no regression**

Run: `cd backend && .venv/bin/python3 -m pytest -v`
Expected: PASS, all tests (Phase 1's 25 plus these 3 new ones = 28).

- [ ] **Step 8: Commit**

```bash
git add backend/app/engines/scenario.py backend/tests/test_scenario.py
git commit -m "feat: add opec_cut shock type to the scenario engine"
```

---

### Task 3: Procurement LP `excluded_suppliers`

**Files:**
- Modify: `backend/app/engines/procurement.py`
- Test: `backend/tests/test_procurement.py`

**Interfaces:**
- Produces: `optimize(gap_mbd, closed_chokepoints, brent_now=None,
  excluded_suppliers: list[str] | None = None)` — same return shape as today,
  plus `constraints["excluded_suppliers"]`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_procurement.py`:

```python
def test_excluded_suppliers_are_never_used_in_the_order_sheet():
    result = procurement.optimize(gap_mbd=0.3, closed_chokepoints=[],
                                  excluded_suppliers=["saudi-arabia", "russia"])
    assert result["feasible"] is True
    for order in result["orders"]:
        assert order["supplier"] not in {"saudi-arabia", "russia"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python3 -m pytest tests/test_procurement.py -v -k excluded`
Expected: FAIL — `TypeError: optimize() got an unexpected keyword argument
'excluded_suppliers'`.

- [ ] **Step 3: Implement `excluded_suppliers`**

In `backend/app/engines/procurement.py`, replace the function signature and the
start of the candidate loop:

```python
def optimize(gap_mbd: float, closed_chokepoints: list[str],
             brent_now: float | None = None,
             excluded_suppliers: list[str] | None = None) -> dict:
    a = data.assumptions()
    brent0 = brent_now or a["economics"]["brent_default_usd"]["value"]
    war_premium = a["response"]["war_risk_premium_usd_bbl"]["value"]
    spare_cfg = a["response"]["supplier_spare_capacity_mbd"]
    grades = data.grades()
    routes = data.routes()
    suppliers = {s["id"]: s for s in data.suppliers()}
    closed = set(closed_chokepoints)
    excluded = set(excluded_suppliers or [])

    # candidate (supplier, grade, route) triples over OPEN routes
    candidates = []
    for sid, s in suppliers.items():
        if sid in excluded:
            continue
        spare = spare_cfg.get(sid, {})
        spare_mbd = spare.get("value", 0.0) if isinstance(spare, dict) else 0.0
        if spare_mbd <= 0:
            continue
```

- [ ] **Step 4: Surface `excluded_suppliers` in the response**

Find the `constraints` entry in the return dict:

```python
        "constraints": {"min_sour_share": MIN_SOUR_SHARE,
                        "closed_chokepoints": sorted(closed)},
```

Replace with:

```python
        "constraints": {"min_sour_share": MIN_SOUR_SHARE,
                        "closed_chokepoints": sorted(closed),
                        "excluded_suppliers": sorted(excluded)},
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python3 -m pytest tests/test_procurement.py -v`
Expected: PASS, all 5 tests (4 existing + 1 new).

- [ ] **Step 6: Commit**

```bash
git add backend/app/engines/procurement.py backend/tests/test_procurement.py
git commit -m "feat: add excluded_suppliers constraint to the procurement LP"
```

---

### Task 4: Orchestrator `opec_cut` branch

**Files:**
- Modify: `backend/app/engines/orchestrator.py`

**Interfaces:**
- Consumes: `ENGINE.supplier_risk` (Phase 1), `data.OPEC_PLUS_SUPPLIER_IDS`,
  `data.opec_plus_exposure_pct()` (Task 1), `scenario.run(...,
  shock_type=...)` (Task 2), `procurement.optimize(...,
  excluded_suppliers=...)` (Task 3).
- Produces: `respond(chokepoint_id: str | None, ..., shock_type: str =
  "chokepoint_closure")` — same return shape as today.

No dedicated unit tests exist for `orchestrator.py` today (it's covered by live
usage, not pytest) — this task follows that same existing convention and
verifies via live curl checks instead of new test files.

- [ ] **Step 1: Branch the briefing template's severity wording**

In `backend/app/engines/orchestrator.py`, replace `_briefing_template`'s first
few lines:

```python
def _briefing_template(ctx: dict) -> str:
    h = ctx["scenario"]["headline"]
    p = ctx["procurement"]
    cp = ctx["chokepoint_name"]
    lines = [
        f"SITREP — {cp} disruption ({ctx['inputs']['closure_pct']:.0f}% closure scenario)",
```

with:

```python
def _briefing_template(ctx: dict) -> str:
    h = ctx["scenario"]["headline"]
    p = ctx["procurement"]
    cp = ctx["chokepoint_name"]
    severity_word = "cut" if ctx["inputs"].get("shock_type") == "opec_cut" else "closure"
    lines = [
        f"SITREP — {cp} disruption ({ctx['inputs']['closure_pct']:.0f}% {severity_word} scenario)",
```

- [ ] **Step 2: Branch `respond()`**

Replace the whole `respond` function:

```python
def respond(chokepoint_id: str | None, closure_pct: float = 60.0, duration_days: int = 21,
            brent_now: float | None = None, shock_type: str = "chokepoint_closure") -> dict:
    clock: list[dict] = []
    t0 = time.time()

    def tick(stage: str):
        clock.append({"stage": stage, "elapsed_s": round(time.time() - t0, 2)})

    if shock_type == "opec_cut":
        risk = max(
            (ENGINE.supplier_risk(sid) for sid in data.OPEC_PLUS_SUPPLIER_IDS),
            key=lambda r: r["posterior_horizon_prob"],
        )
    else:
        risk = ENGINE.corridor_risk(chokepoint_id)
    tick("watchtower: threat assessed")

    unmanaged = scenario.run(chokepoint_id, closure_pct, duration_days,
                             managed=False, brent_now=brent_now, shock_type=shock_type)
    managed = scenario.run(chokepoint_id, closure_pct, duration_days,
                           managed=True, brent_now=brent_now, shock_type=shock_type)
    tick("simulator: cascade modelled (2x1000 Monte Carlo runs)")

    a = data.assumptions()
    imports_mbd = a["demand"]["india_crude_processing_mbd"]["value"] * \
        a["demand"]["import_dependency_pct"]["value"] / 100.0
    if shock_type == "opec_cut":
        exposure = data.opec_plus_exposure_pct() / 100.0
        gap = round(imports_mbd * exposure * closure_pct / 100.0, 3)
        proc = procurement.optimize(gap, closed_chokepoints=[], brent_now=brent_now,
                                    excluded_suppliers=list(data.OPEC_PLUS_SUPPLIER_IDS))
    else:
        exposure = graph.supply_at_risk(chokepoint_id) / 100.0
        gap = round(imports_mbd * exposure * closure_pct / 100.0, 3)
        proc = procurement.optimize(gap, closed_chokepoints=[chokepoint_id], brent_now=brent_now)
    tick("trader: replacement mix optimized (LP)")

    reserve = spr.schedule(gap, proc.get("first_relief_days"), proc.get("coverage_pct", 0.0))
    tick("reservist: SPR bridge scheduled")

    cp_name = "OPEC+ coalition" if shock_type == "opec_cut" else next(
        c["name"] for c in data.chokepoints() if c["id"] == chokepoint_id
    )
    ctx = {
        "chokepoint_name": cp_name, "inputs": managed["inputs"], "risk": risk,
        "scenario": managed, "unmanaged": unmanaged["headline"],
        "procurement": proc, "spr": reserve,
    }
    llm_out = _briefing_llm(ctx)
    briefing = llm_out[0] if llm_out else _briefing_template(ctx)
    briefing_author = llm_out[1] if llm_out else "template"
    tick("briefer: situation briefing drafted")

    return {
        "chokepoint": chokepoint_id, "chokepoint_name": cp_name,
        "risk": risk,
        "scenario_managed": managed, "scenario_unmanaged": unmanaged,
        "supply_gap_mbd": gap,
        "procurement": proc, "spr": reserve,
        "briefing": briefing,
        "briefing_author": briefing_author,
        "response_clock": clock,
        "total_response_seconds": round(time.time() - t0, 2),
    }
```

- [ ] **Step 3: Restart the backend and verify a chokepoint-closure response is unchanged**

Restart the dev backend (`pkill -f "uvicorn app.main:app"`, then relaunch as
usual), then:

```bash
curl -s -X POST localhost:8000/api/scenario/respond -H 'Content-Type: application/json' \
  -d '{"chokepoint": "hormuz", "closure_pct": 60, "duration_days": 21}' | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print(d['chokepoint_name'], d['procurement']['feasible'], d['supply_gap_mbd'])"
```

Expected: `Strait of Hormuz True <some positive number>` — same shape/behavior as
before this phase.

- [ ] **Step 4: Verify an OPEC+ cut response end to end**

```bash
curl -s -X POST localhost:8000/api/scenario/respond -H 'Content-Type: application/json' \
  -d '{"closure_pct": 50, "duration_days": 21, "shock_type": "opec_cut"}' | python3 -m json.tool
```

Expected: `chokepoint_name` = `"OPEC+ coalition"`; `chokepoint` = `null`;
`procurement.constraints.excluded_suppliers` contains all 7 OPEC+ ids;
`procurement.orders` (if any) only ever has `"supplier": "usa"`; `briefing`
contains the word "cut" (not "closure"); `scenario_managed.inputs.shock_type` =
`"opec_cut"`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/engines/orchestrator.py
git commit -m "feat: add opec_cut branch to the response orchestrator"
```

---

### Task 5: API layer

**Files:**
- Modify: `backend/app/routers/scenario.py`

**Interfaces:**
- Produces: `ScenarioIn.shock_type: str = "chokepoint_closure"`, threaded into
  both `/api/scenario/simulate` and `/api/scenario/respond`.

- [ ] **Step 1: Add `shock_type` to the request model and thread it through**

Replace `backend/app/routers/scenario.py` in full:

```python
"""Scenario console endpoints: what-if simulation and the full orchestrated response."""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..engines import orchestrator, scenario
from ..engines.prices import quotes

router = APIRouter()


class ScenarioIn(BaseModel):
    chokepoint: str = "hormuz"
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
```

- [ ] **Step 2: Verify**

Run: `cd backend && .venv/bin/python3 -m pytest -v` (confirms nothing broke)
Expected: PASS, all 28 tests.

```bash
curl -s -X POST localhost:8000/api/scenario/simulate -H 'Content-Type: application/json' \
  -d '{"closure_pct": 50, "duration_days": 21, "shock_type": "opec_cut"}' | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print(d['managed']['inputs']['shock_type'])"
```
Expected: `opec_cut`

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/scenario.py
git commit -m "feat: thread shock_type through the scenario API"
```

---

### Task 6: Frontend — Scenario Console toggle

**Files:**
- Modify: `frontend/src/app/(app)/scenario/page.tsx`

**Interfaces:**
- Consumes: `POST /api/scenario/respond` (Task 5), now accepting `shock_type`.
- Produces: no new exports — page-local state and JSX changes only.

- [ ] **Step 1: Add shock-type state and include it in the request body**

In `frontend/src/app/(app)/scenario/page.tsx`, replace:

```tsx
export default function ScenarioPage() {
  const d = useNetworkData();
  const [cp, setCp] = useState("hormuz");
  const [closure, setClosure] = useState(60);
  const [duration, setDuration] = useState(21);
  const [running, setRunning] = useState(false);
  const [res, setRes] = useState<ScenarioResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const chokepointOptions = d.chokepoints.filter((c) => c.daily_oil_flow_mbd);

  const run = async () => {
    setRunning(true); setErr(null);
    try {
      const r = await fetch(`${BASE}/api/scenario/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chokepoint: cp, closure_pct: closure, duration_days: duration }),
      });
```

with:

```tsx
export default function ScenarioPage() {
  const d = useNetworkData();
  const [shockType, setShockType] = useState<"chokepoint_closure" | "opec_cut">("chokepoint_closure");
  const [cp, setCp] = useState("hormuz");
  const [closure, setClosure] = useState(60);
  const [duration, setDuration] = useState(21);
  const [running, setRunning] = useState(false);
  const [res, setRes] = useState<ScenarioResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const chokepointOptions = d.chokepoints.filter((c) => c.daily_oil_flow_mbd);

  const run = async () => {
    setRunning(true); setErr(null);
    try {
      const r = await fetch(`${BASE}/api/scenario/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chokepoint: cp, closure_pct: closure, duration_days: duration, shock_type: shockType,
        }),
      });
```

- [ ] **Step 2: Add the toggle and hide the chokepoint dropdown for opec_cut**

Find the controls card:

```tsx
      <div className="card mb-8 mt-8 flex flex-wrap items-end gap-6 p-5">
        <label className="flex flex-col gap-1.5">
          <span className="section-label">Chokepoint</span>
          <select
            value={cp} onChange={(e) => setCp(e.target.value)}
            className="rounded-md border border-hairline bg-surface-2 px-3 py-2 text-[14px] text-ink focus:border-accent focus:outline-none"
          >
            {chokepointOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="section-label">Closure severity, {closure}%</span>
          <input type="range" min={10} max={100} step={5} value={closure}
            onChange={(e) => setClosure(+e.target.value)} className="w-48 accent-[color:var(--accent)]" />
        </label>
```

Replace with:

```tsx
      <div className="card mb-8 mt-8 flex flex-wrap items-end gap-6 p-5">
        <label className="flex flex-col gap-1.5">
          <span className="section-label">Shock type</span>
          <div className="flex gap-1 rounded-md bg-surface-2 p-1">
            {([
              ["chokepoint_closure", "Chokepoint closure"],
              ["opec_cut", "OPEC+ production cut"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setShockType(value)}
                className={`rounded px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 ${shockType === value ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </label>
        {shockType === "chokepoint_closure" && (
          <label className="flex flex-col gap-1.5">
            <span className="section-label">Chokepoint</span>
            <select
              value={cp} onChange={(e) => setCp(e.target.value)}
              className="rounded-md border border-hairline bg-surface-2 px-3 py-2 text-[14px] text-ink focus:border-accent focus:outline-none"
            >
              {chokepointOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="section-label">{shockType === "opec_cut" ? "Cut" : "Closure"} severity, {closure}%</span>
          <input type="range" min={10} max={100} step={5} value={closure}
            onChange={(e) => setClosure(+e.target.value)} className="w-48 accent-[color:var(--accent)]" />
        </label>
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Live-check**

With backend and frontend dev servers running:
1. Open `http://localhost:3000/scenario`. Confirm the "Shock type" toggle appears,
   defaulting to "Chokepoint closure" with the chokepoint dropdown visible.
2. Click "OPEC+ production cut". Confirm the chokepoint dropdown disappears and
   the severity label changes to "Cut severity, X%".
3. Click "Run response". Confirm it completes and the briefing text mentions
   "OPEC+ coalition" and a "cut" scenario (not "closure"), and the order sheet (if
   any orders appear) only shows "United States" as a supplier.
4. Toggle back to "Chokepoint closure", run again with the default Hormuz
   settings, and confirm the response looks exactly as it did before this phase
   (same kind of order sheet, same briefing phrasing).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/\(app\)/scenario/page.tsx
git commit -m "feat: add OPEC+ production cut toggle to the Scenario Console"
```

---

## Self-Review Notes

- **Spec coverage:** OPEC+ supplier set/assumption (Task 1) → scenario engine
  (Task 2) → procurement LP (Task 3) → orchestrator (Task 4) → API (Task 5) →
  frontend (Task 6). Every section of the phase 2 design doc has a task.
- **Placeholder scan:** no TBD/TODO; every step has literal code, YAML, or an
  exact command.
- **Type consistency:** `shock_type: str` used identically across
  `scenario.run`, `procurement.optimize`'s sibling `excluded_suppliers` param,
  `orchestrator.respond`, `ScenarioIn.shock_type`, and the frontend's
  `"chokepoint_closure" | "opec_cut"` union — same two literal string values
  everywhere, no third spelling introduced anywhere.
- **Regression risk called out explicitly:** Task 2 Step 6 and Task 5 Step 2 both
  re-run the full test suite (not just the new tests) specifically because this
  phase edits the shared day-by-day Monte Carlo loop and the procurement
  candidate-generation loop that existing chokepoint-closure behavior depends on;
  Task 4 Step 3 adds a live curl check confirming chokepoint-closure responses
  are byte-for-byte the same shape as before this phase.
