# Phase 4: Procurement LP realism — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tanker availability (per route) and port congestion (aggregate)
constraints to the procurement LP, closing a gap the problem statement names
explicitly as factors the procurement optimizer should account for — and wire
in two `logistics.*` assumptions (`vlcc_capacity_mbbl`, `port_max_vlcc_per_day`)
that already existed in `assumptions.yaml` but were never read by any engine.

**Architecture:** Two new PuLP constraints in `procurement.optimize()`: a
per-route upper bound derived from voyage time and a tanker-count assumption,
and an aggregate upper bound derived from port discharge rate. Both reuse the
existing candidate-generation loop and constraint-adding pattern already used
for supplier spare capacity.

**Tech Stack:** FastAPI/Python backend (pytest). No new dependencies, no
frontend code changes beyond exposing two new assumptions on an existing page.

## Global Constraints

- `available_tankers_per_route` and `crisis_active_discharge_points` are new;
  `vlcc_capacity_mbbl` and `port_max_vlcc_per_day` already exist in
  `data/assumptions.yaml` under `logistics` — do not duplicate them.
- Every pre-existing `test_procurement.py` test must still pass. If the new
  constraints make any of them infeasible, the fix is to loosen
  `available_tankers_per_route` (raise the default), not to weaken the new
  constraint's logic or skip the test.

---

### Task 1: Tanker and port congestion assumptions

**Files:**
- Modify: `data/assumptions.yaml`

**Interfaces:**
- Produces: `logistics.available_tankers_per_route`,
  `logistics.crisis_active_discharge_points` — both loaded automatically by the
  existing `data.assumptions()`.

- [ ] **Step 1: Add the two new logistics assumptions**

In `data/assumptions.yaml`, inside the `logistics:` block, after
`port_max_vlcc_per_day`, add:

```yaml
  available_tankers_per_route: {value: 10, note: "Tankers realistically available/willing to service a given route during a crisis (round-trip constrained); order-of-magnitude default applied uniformly across routes", confidence: low}
  crisis_active_discharge_points: {value: 1, note: "Number of India import points (SPMs/ports) that can realistically absorb surge cargo simultaneously during a crisis", confidence: low}
```

- [ ] **Step 2: Verify**

Run: `cd backend && .venv/bin/python3 -c "from app.core import data; l = data.assumptions()['logistics']; print(l['available_tankers_per_route'], l['crisis_active_discharge_points'], l['vlcc_capacity_mbbl'], l['port_max_vlcc_per_day'])"`
Expected: all 4 dicts print with their values.

- [ ] **Step 3: Commit**

```bash
git add data/assumptions.yaml
git commit -m "feat: add tanker availability and port congestion assumptions"
```

---

### Task 2: Procurement LP constraints

**Files:**
- Modify: `backend/app/engines/procurement.py`
- Test: `backend/tests/test_procurement.py`

**Interfaces:**
- Consumes: `data.assumptions()["logistics"]` (Task 1).
- Produces: `optimize()`'s return dict gains
  `constraints["port_congestion_cap_mbd"]`. Same function signature as today —
  no new parameters, the new constraints are always active (not optional),
  since they represent physical reality, not a scenario-specific toggle.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_procurement.py`:

```python
def test_route_tanker_capacity_is_never_exceeded():
    l = data.assumptions()["logistics"]
    tankers = l["available_tankers_per_route"]["value"]
    vlcc = l["vlcc_capacity_mbbl"]["value"]
    routes_by_id = {r["id"]: r for r in data.routes()}
    result = procurement.optimize(gap_mbd=2.0, closed_chokepoints=[])
    assert result["feasible"] is True
    for order in result["orders"]:
        voyage_days = routes_by_id[order["route"]]["voyage_days"]
        cap = tankers * vlcc / (2 * voyage_days)
        assert order["volume_mbd"] <= cap + 1e-6


def test_port_congestion_cap_is_surfaced_and_correct():
    l = data.assumptions()["logistics"]
    expected = round(
        l["port_max_vlcc_per_day"]["value"] * l["vlcc_capacity_mbbl"]["value"]
        * l["crisis_active_discharge_points"]["value"], 2,
    )
    result = procurement.optimize(gap_mbd=0.5, closed_chokepoints=[])
    assert result["constraints"]["port_congestion_cap_mbd"] == expected


def test_covered_volume_never_exceeds_port_congestion_cap():
    result = procurement.optimize(gap_mbd=1_000_000, closed_chokepoints=[])
    assert result["covered_mbd"] <= result["constraints"]["port_congestion_cap_mbd"] + 1e-6
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python3 -m pytest tests/test_procurement.py -v -k "tanker or port_congestion or covered_volume"`
Expected: FAIL — `KeyError: 'port_congestion_cap_mbd'` (constraint not
implemented yet); the tanker test may pass vacuously or fail depending on
current behavior, re-check after Step 2.

- [ ] **Step 3: Compute per-candidate route capacity and the aggregate port cap**

In `backend/app/engines/procurement.py`, replace the function's setup section:

```python
def optimize(gap_mbd: float, closed_chokepoints: list[str],
             brent_now: float | None = None,
             excluded_suppliers: list[str] | None = None) -> dict:
    a = data.assumptions()
    brent0 = brent_now or a["economics"]["brent_default_usd"]["value"]
    war_premium = a["response"]["war_risk_premium_usd_bbl"]["value"]
    spare_cfg = a["response"]["supplier_spare_capacity_mbd"]
    logistics = a["logistics"]
    vlcc_mbbl = logistics["vlcc_capacity_mbbl"]["value"]
    tankers_per_route = logistics["available_tankers_per_route"]["value"]
    port_congestion_cap_mbd = (
        logistics["port_max_vlcc_per_day"]["value"] * vlcc_mbbl
        * logistics["crisis_active_discharge_points"]["value"]
    )
    grades = data.grades()
    routes = data.routes()
    suppliers = {s["id"]: s for s in data.suppliers()}
    closed = set(closed_chokepoints)
    excluded = set(excluded_suppliers or [])
```

- [ ] **Step 4: Add `route_capacity_mbd` to each candidate**

Still in `optimize()`, find:

```python
                    landed = brent0 + gr["benchmark_diff_usd"] \
                        + 0.9 * r["voyage_days"] / 10.0 \
                        + (war_premium if crisis_adjacent else 0.0)
                    candidates.append({
                        "supplier": sid, "grade": g, "route": r["id"],
                        "voyage_days": r["voyage_days"], "landed_usd_bbl": round(landed, 2),
                        "family": gr["family"], "spare_mbd": spare_mbd,
                    })
```

Replace with:

```python
                    landed = brent0 + gr["benchmark_diff_usd"] \
                        + 0.9 * r["voyage_days"] / 10.0 \
                        + (war_premium if crisis_adjacent else 0.0)
                    route_capacity_mbd = tankers_per_route * vlcc_mbbl / (2 * r["voyage_days"])
                    candidates.append({
                        "supplier": sid, "grade": g, "route": r["id"],
                        "voyage_days": r["voyage_days"], "landed_usd_bbl": round(landed, 2),
                        "family": gr["family"], "spare_mbd": spare_mbd,
                        "route_capacity_mbd": route_capacity_mbd,
                    })
```

- [ ] **Step 5: Add the two LP constraints**

Find:

```python
    prob += pulp.lpSum(x[i] * candidates[i]["landed_usd_bbl"] for i in x)
    prob += pulp.lpSum(x.values()) >= gap_mbd, "fill_gap"
    for sid in {c["supplier"] for c in candidates}:
        cap = next(c["spare_mbd"] for c in candidates if c["supplier"] == sid)
        prob += pulp.lpSum(x[i] for i in x if candidates[i]["supplier"] == sid) <= cap, f"spare_{sid}"
    prob += pulp.lpSum(
        x[i] for i in x if candidates[i]["family"] in SOUR_FAMILIES
    ) >= MIN_SOUR_SHARE * gap_mbd, "sour_share"
```

Replace with:

```python
    prob += pulp.lpSum(x[i] * candidates[i]["landed_usd_bbl"] for i in x)
    prob += pulp.lpSum(x.values()) >= gap_mbd, "fill_gap"
    prob += pulp.lpSum(x.values()) <= port_congestion_cap_mbd, "port_congestion"
    for sid in {c["supplier"] for c in candidates}:
        cap = next(c["spare_mbd"] for c in candidates if c["supplier"] == sid)
        prob += pulp.lpSum(x[i] for i in x if candidates[i]["supplier"] == sid) <= cap, f"spare_{sid}"
    for rid in {c["route"] for c in candidates}:
        cap = next(c["route_capacity_mbd"] for c in candidates if c["route"] == rid)
        prob += pulp.lpSum(x[i] for i in x if candidates[i]["route"] == rid) <= cap, f"tanker_{rid}"
    prob += pulp.lpSum(
        x[i] for i in x if candidates[i]["family"] in SOUR_FAMILIES
    ) >= MIN_SOUR_SHARE * gap_mbd, "sour_share"
```

- [ ] **Step 6: Surface the port congestion cap in the response**

Find:

```python
        "constraints": {"min_sour_share": MIN_SOUR_SHARE,
                        "closed_chokepoints": sorted(closed),
                        "excluded_suppliers": sorted(excluded)},
```

Replace with:

```python
        "constraints": {"min_sour_share": MIN_SOUR_SHARE,
                        "closed_chokepoints": sorted(closed),
                        "excluded_suppliers": sorted(excluded),
                        "port_congestion_cap_mbd": round(port_congestion_cap_mbd, 2)},
```

- [ ] **Step 7: Run the new tests**

Run: `cd backend && .venv/bin/python3 -m pytest tests/test_procurement.py -v`
Expected: PASS, all 8 tests (5 existing + 3 new). If any pre-existing test now
fails infeasible, raise `available_tankers_per_route`'s default value in Task 1
(e.g. to 12 or 15) and re-run this step until everything passes — do not weaken
the new constraints themselves.

- [ ] **Step 8: Run the full backend suite**

Run: `cd backend && .venv/bin/python3 -m pytest -v`
Expected: PASS, all tests (31 from phase 3 plus 3 new = 34).

- [ ] **Step 9: Live-check via the running API**

Restart the dev backend, then:

```bash
curl -s -X POST localhost:8000/api/scenario/respond -H 'Content-Type: application/json' \
  -d '{"chokepoint": "hormuz", "closure_pct": 60, "duration_days": 21}' | python3 -c \
  "import json,sys; d=json.load(sys.stdin); p=d['procurement']; print('feasible:', p['feasible'], '| orders:', len(p['orders']), '| port_cap:', p['constraints']['port_congestion_cap_mbd']); [print(o['supplier'], o['route'], o['volume_mbd']) for o in p['orders']]"
```

Expected: feasible, `port_congestion_cap_mbd` present and equal to
`port_max_vlcc_per_day * vlcc_capacity_mbbl * crisis_active_discharge_points`,
and order volumes look sane relative to route tanker caps (multiple
smaller orders rather than one large one dumped on a single route, compared to
before this phase).

- [ ] **Step 10: Commit**

```bash
git add backend/app/engines/procurement.py backend/tests/test_procurement.py
git commit -m "feat: add tanker availability and port congestion constraints to the procurement LP"
```

---

### Task 3: Frontend — surface the new assumptions

**Files:**
- Modify: `frontend/src/app/(app)/assumptions/page.tsx`

**Interfaces:**
- Consumes: `logistics.available_tankers_per_route`,
  `logistics.crisis_active_discharge_points` (Task 1), via the existing generic
  `dig()` path-lookup helper — no code change needed there.

- [ ] **Step 1: Add the two params to the "Response capability" group**

In `frontend/src/app/(app)/assumptions/page.tsx`, find:

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
      { path: "logistics.available_tankers_per_route", label: "Tankers available per route", unit: "ships" },
      { path: "logistics.crisis_active_discharge_points", label: "Active discharge points", unit: "ports" },
    ],
  },
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Live-check**

Open `http://localhost:3000/assumptions`. Confirm the "Response capability" card
now shows 5 parameters including "Tankers available per route" and "Active
discharge points", each with a value and confidence tag.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(app\)/assumptions/page.tsx
git commit -m "feat: surface tanker and port congestion assumptions on the Assumptions page"
```

---

## Self-Review Notes

- **Spec coverage:** Assumptions (Task 1) → LP constraints (Task 2) →
  Assumptions page (Task 3). Every section of the phase 4 design doc has a
  task.
- **Placeholder scan:** no TBD/TODO; every step has literal code, YAML, or an
  exact command.
- **Regression risk called out explicitly, with a concrete remediation path:**
  Task 2 Step 7 explicitly instructs raising `available_tankers_per_route`
  (not weakening the new constraint) if any pre-existing test becomes
  infeasible — this is the expected first empirical check, since the exact
  route-capacity numbers were hand-estimated in the design phase, not verified
  against the live solver until this step actually runs.
- **Honesty about the port-congestion constraint's real-world bindingness:**
  Task 2 Step 9's live-check only asserts the cap is present and correct, not
  that it's the active/binding constraint — consistent with the design doc's
  statement that it's a backstop, not the primary constraint, given today's
  supplier spare-capacity data.
