# Phase 5: SPR replenishment window modeling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a replenishment window estimate to the SPR scheduler — when
refill purchasing starts, how long it takes, and when the reserve is back to
full — closing a gap the problem statement names explicitly for the Strategic
Reserve Optimisation Agent.

**Architecture:** A purely additive computation appended to the end of
`spr.schedule()`, reusing the existing drawdown loop's output (`remaining`,
`relief_day`) with no changes to that loop itself. Computed analytically (refill
rate is constant, so no second day-by-day loop is needed).

**Tech Stack:** FastAPI/Python backend (pytest), Next.js/TypeScript frontend. No
new dependencies.

## Global Constraints

- Every existing field in `schedule()`'s return dict must stay byte-for-byte
  unchanged — this phase only adds a new `replenishment` sub-dict, nothing is
  removed or renamed.
- All 4 pre-existing `test_spr.py` tests must still pass unmodified.

---

### Task 1: SPR replenishment assumptions

**Files:**
- Modify: `data/assumptions.yaml`

**Interfaces:**
- Produces: a new top-level `spr` block with 2 keys, loaded automatically by
  the existing `data.assumptions()`.

- [ ] **Step 1: Add the spr block**

In `data/assumptions.yaml`, add a new top-level block after the `power_sector:`
block and before the confidence-legend comment at the end of the file:

```yaml
spr:
  max_replenishment_mbd: {value: 0.15, note: "Max sustainable SPR refill/injection rate via supplemental purchases post-crisis; typically slower than emergency drawdown since it's discretionary, budget-paced procurement, not an emergency release", confidence: low}
  replenishment_cooldown_days: {value: 14, note: "Days after first relief cargo arrives before dedicated refill purchasing begins (market/budget lag)", confidence: low}
```

- [ ] **Step 2: Verify**

Run: `cd backend && .venv/bin/python3 -c "from app.core import data; print(data.assumptions()['spr'])"`
Expected: dict with both keys.

- [ ] **Step 3: Commit**

```bash
git add data/assumptions.yaml
git commit -m "feat: add SPR replenishment assumptions"
```

---

### Task 2: Replenishment window computation

**Files:**
- Modify: `backend/app/engines/spr.py`
- Test: `backend/tests/test_spr.py`

**Interfaces:**
- Consumes: `data.assumptions()["spr"]` (Task 1); existing `remaining`,
  `reserve_mbbl`, `relief_day` locals already computed in `schedule()`.
- Produces: `schedule()`'s returned dict gains a `replenishment` sub-dict:
  `{refill_needed_mbbl, max_replenishment_mbd, cooldown_days,
  replenishment_start_day, replenishment_window_days,
  replenishment_complete_day}`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_spr.py`:

```python
def test_replenishment_window_scales_with_amount_released():
    small = spr.schedule(gap_mbd=0.5, first_relief_days=5, relief_coverage_pct=100.0, horizon_days=30)
    large = spr.schedule(gap_mbd=5.0, first_relief_days=5, relief_coverage_pct=0.0, horizon_days=90)
    assert large["replenishment"]["replenishment_window_days"] >= small["replenishment"]["replenishment_window_days"]


def test_no_release_means_no_replenishment_needed():
    result = spr.schedule(gap_mbd=0.0, first_relief_days=1, relief_coverage_pct=100.0, horizon_days=10)
    assert result["replenishment"]["refill_needed_mbbl"] == 0
    assert result["replenishment"]["replenishment_window_days"] == 0
    assert result["replenishment"]["replenishment_complete_day"] == result["replenishment"]["replenishment_start_day"]


def test_replenishment_start_day_respects_cooldown():
    from app.core import data
    cooldown = data.assumptions()["spr"]["replenishment_cooldown_days"]["value"]
    result = spr.schedule(gap_mbd=1.0, first_relief_days=7, relief_coverage_pct=50.0, horizon_days=30)
    assert result["replenishment"]["replenishment_start_day"] == 7 + cooldown
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python3 -m pytest tests/test_spr.py -v -k replenish`
Expected: FAIL — `KeyError: 'replenishment'` (the field doesn't exist yet).

- [ ] **Step 3: Add the `math` import**

In `backend/app/engines/spr.py`, replace the top imports:

```python
from __future__ import annotations

from ..core import data
```

with:

```python
from __future__ import annotations

import math

from ..core import data
```

- [ ] **Step 4: Compute the replenishment window**

In `backend/app/engines/spr.py`, find the `total_released` line and the
`return` statement:

```python
    total_released = reserve_mbbl - remaining
    return {
        "reserve_start_mbbl": round(reserve_mbbl, 1),
        "reserve_end_mbbl": round(remaining, 1),
        "total_released_mbbl": round(total_released, 1),
        "max_drawdown_mbd": spr_max,
        "bridge_days_at_full_rate": round(reserve_mbbl / spr_max / 1.0, 0) if spr_max else 0,
        "schedule_head": days[:10],
        "days_active": len(days),
        "note": "ISPRL Phase I only (5.33 MMT); Phase II modelled unavailable.",
    }
```

Replace with:

```python
    total_released = reserve_mbbl - remaining

    ra = data.assumptions()["spr"]
    max_replenishment_mbd = ra["max_replenishment_mbd"]["value"]
    cooldown_days = ra["replenishment_cooldown_days"]["value"]
    refill_needed_mbbl = max(0.0, reserve_mbbl - remaining)
    replenishment_start_day = relief_day + cooldown_days
    replenishment_window_days = (
        math.ceil(refill_needed_mbbl / max_replenishment_mbd) if refill_needed_mbbl > 0 else 0
    )
    replenishment_complete_day = replenishment_start_day + replenishment_window_days

    return {
        "reserve_start_mbbl": round(reserve_mbbl, 1),
        "reserve_end_mbbl": round(remaining, 1),
        "total_released_mbbl": round(total_released, 1),
        "max_drawdown_mbd": spr_max,
        "bridge_days_at_full_rate": round(reserve_mbbl / spr_max / 1.0, 0) if spr_max else 0,
        "schedule_head": days[:10],
        "days_active": len(days),
        "replenishment": {
            "refill_needed_mbbl": round(refill_needed_mbbl, 1),
            "max_replenishment_mbd": max_replenishment_mbd,
            "cooldown_days": cooldown_days,
            "replenishment_start_day": replenishment_start_day,
            "replenishment_window_days": replenishment_window_days,
            "replenishment_complete_day": replenishment_complete_day,
        },
        "note": "ISPRL Phase I only (5.33 MMT); Phase II modelled unavailable.",
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python3 -m pytest tests/test_spr.py -v`
Expected: PASS, all 7 tests (4 existing + 3 new).

- [ ] **Step 6: Run the full backend suite to confirm no regression**

Run: `cd backend && .venv/bin/python3 -m pytest -v`
Expected: PASS, all tests (34 from phase 4 plus 3 new = 37).

- [ ] **Step 7: Commit**

```bash
git add backend/app/engines/spr.py backend/tests/test_spr.py
git commit -m "feat: add SPR replenishment window estimate to the reserve scheduler"
```

---

### Task 3: Frontend — Scenario Console replenishment line

**Files:**
- Modify: `frontend/src/app/(app)/scenario/page.tsx`

**Interfaces:**
- Consumes: `res.spr.replenishment.{replenishment_start_day,
  replenishment_window_days, replenishment_complete_day}` — the local
  `ScenarioResponse` interface's `spr` field type needs updating to include
  this shape (it's currently typed narrowly, only listing the two fields the
  page already reads).

- [ ] **Step 1: Widen the `spr` field type**

In `frontend/src/app/(app)/scenario/page.tsx`, find the `ScenarioResponse`
interface's `spr` field:

```tsx
  spr: { total_released_mbbl: number; days_active: number };
```

Replace with:

```tsx
  spr: {
    total_released_mbbl: number; days_active: number;
    replenishment: {
      refill_needed_mbbl: number; replenishment_start_day: number;
      replenishment_window_days: number; replenishment_complete_day: number;
    };
  };
```

- [ ] **Step 2: Add the replenishment line**

Find the "Strategic reserve bridge" section:

```tsx
            <div className="py-8">
              <h2 className="section-title mb-2">Strategic reserve bridge</h2>
              <p className="text-[15px] text-ink-2">
                {res.spr.total_released_mbbl} million barrels released over {res.spr.days_active} days from ISPRL Phase I.
              </p>
            </div>
```

Replace with:

```tsx
            <div className="py-8">
              <h2 className="section-title mb-2">Strategic reserve bridge</h2>
              <p className="text-[15px] text-ink-2">
                {res.spr.total_released_mbbl} million barrels released over {res.spr.days_active} days from ISPRL Phase I.
              </p>
              {res.spr.replenishment.refill_needed_mbbl > 0 ? (
                <p className="caption mt-2">
                  Refill: {res.spr.replenishment.refill_needed_mbbl} mbbl needed. Purchasing begins day{" "}
                  {res.spr.replenishment.replenishment_start_day}, reserve back to full by day{" "}
                  {res.spr.replenishment.replenishment_complete_day} ({res.spr.replenishment.replenishment_window_days}{" "}
                  days of dedicated buying).
                </p>
              ) : (
                <p className="caption mt-2">No drawdown occurred, so no replenishment is needed.</p>
              )}
            </div>
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Live-check**

With backend and frontend dev servers running, open
`http://localhost:3000/scenario`, run a scenario, and confirm the "Strategic
reserve bridge" section shows both the existing drawdown line and a new refill
timeline line underneath it.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/\(app\)/scenario/page.tsx
git commit -m "feat: show SPR replenishment timeline on the Scenario Console"
```

---

## Self-Review Notes

- **Spec coverage:** Assumptions (Task 1) → replenishment computation (Task 2)
  → Scenario Console line (Task 3). Every section of the phase 5 design doc has
  a task.
- **Placeholder scan:** no TBD/TODO; every step has literal code, YAML, or an
  exact command.
- **Type consistency:** `replenishment` dict keys match exactly between the
  Python return value (Task 2) and the TypeScript interface (Task 3) — same 6
  field names, same shape.
- **Regression risk called out explicitly:** Task 2 Step 6 re-runs the full
  suite specifically because `schedule()`'s existing fields must stay
  byte-identical; the 3 new tests in Step 1 test only the new `replenishment`
  sub-dict, never touching the pre-existing drawdown assertions.
