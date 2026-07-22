# Phase 1: Supplier-level disruption risk scoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live disruption risk score "by supplier" (Russia, Iraq, Saudi Arabia,
UAE, USA, Nigeria, Kuwait, Angola) alongside the existing corridor score, closing a
gap the problem statement names explicitly ("probability score by corridor and
supplier").

**Architecture:** Mirror the existing corridor-risk pattern end to end: new
assumption priors → `Event` gains an independent `supplier` axis → extractor
classifies both axes per headline → `RiskEngine.supplier_risk()` (Bayesian, same
math as `corridor_risk`) → new API endpoints → frontend surfaces the score on the
Network page and in the supplier drawer.

**Tech Stack:** FastAPI/Python backend (pytest for tests), Next.js/TypeScript
frontend. No new dependencies.

## Global Constraints

- Supplier ids used everywhere must exactly match `data/suppliers_grades.json`
  supplier `id` fields: `russia, iraq, saudi-arabia, uae, usa, nigeria, kuwait,
  angola`.
- `supplier_risk()` looks up its prior by **exact** key construction
  (`f"base_hazard_supplier_{supplier_id}_annual_pct"`), not the fuzzy substring
  matching `corridor_risk()` uses for chokepoints — supplier ids are already exact,
  one-to-one identifiers, so exact lookup is simpler and has no ambiguity risk.
- An `Event` can be corridor-tagged, supplier-tagged, both, or (never persisted)
  neither — `corridor` and `supplier` are independent, both nullable.

---

### Task 1: Assumption priors for supplier hazard

**Files:**
- Modify: `data/assumptions.yaml`

**Interfaces:**
- Produces: 8 new keys under `risk_engine` in the assumptions YAML, each shaped
  like the existing `base_hazard_<chokepoint>_annual_pct` entries (a dict with
  `value`, `note`, `confidence`), loaded automatically by the existing
  `data.assumptions()` — no code change needed for this file to become visible via
  `GET /api/assumptions`.

- [ ] **Step 1: Add the 8 supplier hazard priors**

In `data/assumptions.yaml`, inside the existing `risk_engine:` block, immediately
after the `base_hazard_malacca_annual_pct` line, insert:

```yaml
  base_hazard_supplier_russia_annual_pct: {value: 6.0, note: "Sanctions/price-cap regime volatility; highest of India's suppliers", source: "expert-judgment prior, consistent with payment_risk note in suppliers_grades.json", confidence: low}
  base_hazard_supplier_iraq_annual_pct: {value: 2.5, note: "Political instability risk to export continuity", confidence: low}
  base_hazard_supplier_saudi-arabia_annual_pct: {value: 1.5, note: "Generally stable exporter; includes low-probability attack tail risk (cf. 2019 Abqaiq)", confidence: low}
  base_hazard_supplier_uae_annual_pct: {value: 1.0, confidence: low}
  base_hazard_supplier_usa_annual_pct: {value: 0.5, note: "Most stable of India's suppliers", confidence: low}
  base_hazard_supplier_nigeria_annual_pct: {value: 2.0, note: "Pipeline vandalism/sabotage history in Niger Delta", confidence: low}
  base_hazard_supplier_kuwait_annual_pct: {value: 1.0, confidence: low}
  base_hazard_supplier_angola_annual_pct: {value: 1.0, confidence: low}
```

- [ ] **Step 2: Verify the YAML parses and the new keys are visible**

Run: `cd backend && .venv/bin/python3 -c "from app.core import data; a = data.assumptions()['risk_engine']; print(a['base_hazard_supplier_russia_annual_pct'])"`
Expected: `{'value': 6.0, 'note': '...', 'source': '...', 'confidence': 'low'}`

- [ ] **Step 3: Commit**

```bash
git add data/assumptions.yaml
git commit -m "feat: add per-supplier disruption hazard priors"
```

---

### Task 2: RiskEngine supplier scoring

**Files:**
- Modify: `backend/app/engines/risk.py`
- Test: `backend/tests/test_risk.py`

**Interfaces:**
- Consumes: `data.assumptions()["risk_engine"]` (Task 1's new keys),
  `data.suppliers()` (existing, from `backend/app/core/data.py`).
- Produces: `Event.supplier: str | None = None` (new field, default `None`, added
  at the end of the dataclass so no existing keyword-argument call site breaks);
  `Event.corridor` becomes `str | None` (still a required constructor argument —
  no default — just a wider type, since every current call site passes it
  explicitly); `RiskEngine.events_for_supplier(supplier_id: str) -> list[Event]`;
  `RiskEngine.supplier_risk(supplier_id: str, horizon_days: int = 30, now_ts:
  float | None = None) -> dict` returning
  `{supplier, horizon_days, prior_annual_pct, prior_horizon_prob,
  posterior_horizon_prob, drivers}` (same shape as `corridor_risk`, keyed
  `supplier` instead of `chokepoint`); `RiskEngine.all_suppliers(horizon_days: int
  = 30) -> list[dict]`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_risk.py`:

```python
def test_supplier_no_evidence_returns_prior_as_posterior():
    engine = RiskEngine()
    score = engine.supplier_risk("russia", horizon_days=30)
    assert score["prior_horizon_prob"] == score["posterior_horizon_prob"]
    assert score["drivers"] == []


def test_unlisted_supplier_gets_nominal_fallback_prior():
    engine = RiskEngine()
    score = engine.supplier_risk("some-untracked-supplier", horizon_days=30)
    assert score["prior_annual_pct"] == 0.5
    assert 0 < score["prior_horizon_prob"] < 0.01


def test_supplier_attack_evidence_raises_posterior_above_prior():
    engine = RiskEngine()
    baseline = engine.supplier_risk("russia", horizon_days=30)["posterior_horizon_prob"]
    engine.ingest(Event(
        corridor=None, supplier="russia", severity="attack", summary="test supplier event",
        source="test", corroborations=3,
    ))
    updated = engine.supplier_risk("russia", horizon_days=30)["posterior_horizon_prob"]
    assert updated > baseline


def test_supplier_and_corridor_events_are_independent():
    """A corridor-tagged event must not move a supplier's score, and vice versa —
    the two axes are independent evidence streams even though they share one
    Event list and one Bayesian update mechanism."""
    engine = RiskEngine()
    corridor_baseline = engine.corridor_risk("hormuz", horizon_days=30)["posterior_horizon_prob"]
    supplier_baseline = engine.supplier_risk("russia", horizon_days=30)["posterior_horizon_prob"]
    engine.ingest(Event(
        corridor=None, supplier="russia", severity="attack", summary="supplier-only event",
        source="test", corroborations=3,
    ))
    assert engine.corridor_risk("hormuz", horizon_days=30)["posterior_horizon_prob"] == corridor_baseline
    assert engine.supplier_risk("russia", horizon_days=30)["posterior_horizon_prob"] > supplier_baseline
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python3 -m pytest tests/test_risk.py -v -k supplier`
Expected: FAIL — `AttributeError: 'RiskEngine' object has no attribute 'supplier_risk'`
(and `Event(...)` calls fail since `supplier=` isn't a recognized field yet).

- [ ] **Step 3: Add the `supplier` field to `Event`**

In `backend/app/engines/risk.py`, replace the `Event` dataclass:

```python
@dataclass
class Event:
    corridor: str | None   # chokepoint id, or None if this is a supplier-only event
    severity: str          # rung on the escalation ladder
    summary: str
    source: str
    timestamp: float = field(default_factory=time.time)
    corroborations: int = 1
    supplier: str | None = None   # supplier id, or None if this is a corridor-only event
```

- [ ] **Step 4: Add `events_for_supplier`**

In `backend/app/engines/risk.py`, right after the existing `events` method, add:

```python
    def events_for_supplier(self, supplier_id: str) -> list[Event]:
        return [e for e in self._events if e.supplier == supplier_id]
```

- [ ] **Step 5: Add `supplier_risk` and `all_suppliers`**

In `backend/app/engines/risk.py`, right after `all_corridors`, add:

```python
    def supplier_risk(self, supplier_id: str, horizon_days: int = 30,
                      now_ts: float | None = None) -> dict:
        """Score a supplier's own disruption risk (sanctions, export-terminal
        incidents, political instability) — same Bayesian shape as corridor_risk.
        Looked up by exact key (supplier ids are exact, one-to-one identifiers),
        unlike corridor_risk's fuzzy substring match for chokepoints."""
        a = data.assumptions()["risk_engine"]
        prior_key = f"base_hazard_supplier_{supplier_id}_annual_pct"
        prior_annual = a.get(prior_key, {}).get("value", 0.5)

        lam = -math.log(1 - prior_annual / 100.0)
        p0 = 1 - math.exp(-lam * horizon_days / 365.0)

        halflife = a["evidence_halflife_days"]["value"]
        ratios = a["severity_likelihood_ratios"]
        odds = p0 / (1 - p0)
        drivers = []
        now = now_ts if now_ts is not None else time.time()
        for e in self.events_for_supplier(supplier_id):
            age_days = (now - e.timestamp) / 86400.0
            if age_days < 0:
                continue
            decay = 0.5 ** (age_days / halflife)
            lr = ratios.get(e.severity, 1.0)
            effective_lr = 1.0 + (lr - 1.0) * decay * min(e.corroborations, 3) / 3.0
            odds *= effective_lr
            drivers.append({
                "summary": e.summary, "severity": e.severity, "source": e.source,
                "age_days": round(age_days, 1), "likelihood_ratio_applied": round(effective_lr, 2),
            })

        p = odds / (1 + odds)
        return {
            "supplier": supplier_id,
            "horizon_days": horizon_days,
            "prior_annual_pct": prior_annual,
            "prior_horizon_prob": round(p0, 4),
            "posterior_horizon_prob": round(p, 4),
            "drivers": sorted(drivers, key=lambda d: -d["likelihood_ratio_applied"]),
        }

    def all_suppliers(self, horizon_days: int = 30) -> list[dict]:
        return [self.supplier_risk(s["id"], horizon_days) for s in data.suppliers()]
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python3 -m pytest tests/test_risk.py -v`
Expected: PASS, all tests including the 4 new ones and all pre-existing corridor
tests (which must still pass unchanged — this task must not alter corridor
scoring behavior).

- [ ] **Step 7: Commit**

```bash
git add backend/app/engines/risk.py backend/tests/test_risk.py
git commit -m "feat: add supplier-level disruption risk scoring to RiskEngine"
```

---

### Task 3: Extractor supplier axis

**Files:**
- Modify: `backend/app/engines/extractor.py`
- Test: `backend/tests/test_extractor.py` (new)

**Interfaces:**
- Consumes: nothing new from other tasks (pure text-classification module).
- Produces: `SUPPLIERS: list[str]` (the 8 supplier ids); `extract_batch` /
  `_extract_rules` return dicts that now include a `"supplier": str | None` key
  alongside the existing `"corridor"`, `"severity"`, `"summary"` keys (`None`
  instead of the string `"none"` for "not applicable" — the LLM prompt still asks
  for the string `"none"`, but `_parse_array` normalizes that to `None` in the
  returned dict, same normalization corridor already implicitly got before this
  change).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_extractor.py`:

```python
"""Tests for the rule-based fallback extractor (app/engines/extractor.py).
The LLM path isn't tested here — it needs network/API keys — but the rule
fallback is pure and deterministic, and it's what runs with zero API keys
configured, which is the common case for judges/reviewers running this locally.
"""
from app.engines.extractor import _extract_rules


def test_corridor_only_headline():
    ev = _extract_rules("Houthi rebels attack oil tanker in the Red Sea")
    assert ev is not None
    assert ev["corridor"] == "bab-el-mandeb"
    assert ev["supplier"] is None
    assert ev["severity"] == "attack"


def test_supplier_only_headline():
    ev = _extract_rules("US imposes new sanctions on Rosneft oil exports")
    assert ev is not None
    assert ev["corridor"] is None
    assert ev["supplier"] == "russia"
    assert ev["severity"] == "rhetoric"


def test_headline_matching_neither_axis_is_irrelevant():
    assert _extract_rules("Local council approves new bike lane funding") is None


def test_severity_required_even_with_a_matched_axis():
    """A headline that names a supplier country but carries no severity signal
    at all should still be dropped — matching an axis alone isn't enough."""
    assert _extract_rules("Saudi Arabia announces new tourism campaign") is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python3 -m pytest tests/test_extractor.py -v`
Expected: FAIL — `KeyError: 'supplier'` on the first two tests (current
`_extract_rules` doesn't return a `supplier` key, and doesn't match Russia/UAE/
etc. patterns at all yet).

- [ ] **Step 3: Add `SUPPLIERS`, extend the prompt, add supplier rule patterns**

In `backend/app/engines/extractor.py`, replace the top of the file from `CORRIDORS`
through the `_SEVERITY_PATTERNS` list:

```python
CORRIDORS = ["hormuz", "bab-el-mandeb", "suez", "malacca", "danish-straits"]
SUPPLIERS = ["russia", "iraq", "saudi-arabia", "uae", "usa", "nigeria", "kuwait", "angola"]
SEVERITIES = ["rhetoric", "incident", "attack", "partial_closure", "full_closure"]

_BATCH_PROMPT = """You classify news headlines about energy shipping security and crude oil supplier disruption.
For EACH numbered headline, output one object. Return ONLY a JSON array, same order,
same length as the input list: [{{"corridor": one of {corridors} or "none",
"supplier": one of {suppliers} or "none",
"severity": one of {severities} or "none", "summary": "<=140 chars factual summary"}}, ...]
corridor = a shipping chokepoint/lane security event (attack, closure, rerouting near that strait).
supplier = a disruption to one of these 8 countries' own crude exports (sanctions, export-terminal
incident, pipeline attack, political instability affecting production/exports) — NOT a corridor
transit event. A headline may hit corridor, supplier, both, or neither.
severity guide: rhetoric=threats/warnings/drills/sanction announcements; incident=jamming/near-miss/
harassment/minor supply hiccup; attack=strike/seizure/boarding/mine/terminal or pipeline attack;
partial_closure=traffic restricted, major operators suspending transit, or partial export halt;
full_closure=corridor shut or supplier fully halts exports. Not about shipping security or supplier
disruption => corridor "none" and supplier "none".
HEADLINES:
{texts}"""

# --- rule fallback ----------------------------------------------------------
_CORRIDOR_PATTERNS = {
    "hormuz": r"hormuz|persian gulf|gulf of oman|iran.{0,30}(tanker|strait|navy)|fujairah",
    "bab-el-mandeb": r"bab.el.mandeb|red sea|houthi|yemen|gulf of aden",
    "suez": r"suez|sumed",
    "malacca": r"malacca|singapore strait",
    "danish-straits": r"danish strait|baltic.{0,20}(tanker|oil)|primorsk",
}
_SUPPLIER_PATTERNS = {
    "russia": r"russia|rosneft|urals crude|espo|novorossiysk|primorsk|kozmino",
    "iraq": r"\biraq\b|basra oil|basrah crude",
    "saudi-arabia": r"saudi arabia|saudi aramco|ras tanura|\byanbu\b",
    "uae": r"\buae\b|abu dhabi|adnoc|fujairah|jebel dhanna",
    "usa": r"u\.?s\.? (crude|oil|sanctions)|texas oil|permian|corpus christi",
    "nigeria": r"nigeria|bonny light|niger delta|qua iboe",
    "kuwait": r"\bkuwait\b",
    "angola": r"\bangola\b|cabinda",
}
_SEVERITY_PATTERNS = [
    ("full_closure", r"clos(ed|ure) to (all )?(shipping|traffic)|blockade in effect"),
    ("partial_closure", r"suspend\w{0,3}\b.{0,25}(transit|shipping|passage|crossing|export|shipment)|reroute|divert(s|ing|ed)? (around|away)|halts?\b.{0,20}(red sea|hormuz|suez|export|shipment)"),
    ("attack", r"attack|missile|drone str|struck|seiz(e|ed|ure)|boarded|mine (hit|blast)|explosion|hijack"),
    ("incident", r"jamming|near.miss|harass|intercept|close encounter|fired warning|collision"),
    ("rhetoric", r"threat(en)?s?|warn(s|ing)?|vows|drill|exercise|escalat|sanction"),
]
```

- [ ] **Step 4: Update `_extract_rules` to check both axes**

In `backend/app/engines/extractor.py`, replace `_extract_rules`:

```python
def _extract_rules(text: str) -> dict | None:
    t = text.lower()
    corridor = next((c for c, p in _CORRIDOR_PATTERNS.items() if re.search(p, t)), None)
    supplier = next((s for s, p in _SUPPLIER_PATTERNS.items() if re.search(p, t)), None)
    if corridor is None and supplier is None:
        return None
    severity = next((s for s, p in _SEVERITY_PATTERNS if re.search(p, t)), None)
    if severity is None:
        return None
    return {"corridor": corridor, "supplier": supplier, "severity": severity,
            "summary": text[:140], "extractor": "rules"}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python3 -m pytest tests/test_extractor.py -v`
Expected: PASS, all 4 tests.

- [ ] **Step 6: Update `_parse_array` for the two-axis LLM response shape**

In `backend/app/engines/extractor.py`, replace `_parse_array`:

```python
def _parse_array(raw: str, n: int) -> list[dict | None] | None:
    m = re.search(r"\[.*\]", raw, re.DOTALL)
    try:
        arr = json.loads(m.group(0) if m else raw)
    except Exception:
        return None
    if not isinstance(arr, list) or len(arr) != n:
        return None
    out: list[dict | None] = []
    for item in arr:
        if not isinstance(item, dict):
            out.append(None)
            continue
        corridor = item.get("corridor")
        corridor = corridor if corridor in CORRIDORS else None
        supplier = item.get("supplier")
        supplier = supplier if supplier in SUPPLIERS else None
        if (corridor is None and supplier is None) or item.get("severity") not in SEVERITIES:
            out.append(None)
        else:
            out.append({"corridor": corridor, "supplier": supplier, "severity": item["severity"],
                        "summary": str(item.get("summary", ""))[:140]})
    return out
```

- [ ] **Step 7: Update `extract_batch` to pass `suppliers` into the prompt**

In `backend/app/engines/extractor.py`, in `extract_batch`, change:

```python
    prompt = _BATCH_PROMPT.format(corridors=CORRIDORS, severities=SEVERITIES, texts=numbered)
```

to:

```python
    prompt = _BATCH_PROMPT.format(corridors=CORRIDORS, suppliers=SUPPLIERS, severities=SEVERITIES, texts=numbered)
```

- [ ] **Step 8: Run the full extractor test file once more**

Run: `cd backend && .venv/bin/python3 -m pytest tests/test_extractor.py -v`
Expected: PASS (unchanged from step 5 — this step confirms steps 6-7 didn't break
the rule-fallback tests, since `_parse_array`/`extract_batch` are LLM-path only and
untested directly here).

- [ ] **Step 9: Commit**

```bash
git add backend/app/engines/extractor.py backend/tests/test_extractor.py
git commit -m "feat: add supplier axis to headline extraction (LLM prompt + rule fallback)"
```

---

### Task 4: Wire supplier events into the news poller

**Files:**
- Modify: `backend/app/engines/news.py`
- Modify: `backend/app/routers/intel.py`
- Modify: `backend/app/routers/risk.py`

**Interfaces:**
- Consumes: `Event` (Task 2, now with `supplier`), `extract_batch` (Task 3, now
  returns dicts with a `supplier` key).
- Produces: `GET /api/risk/suppliers` → `ENGINE.all_suppliers(horizon_days)`;
  `GET /api/risk/suppliers/{supplier_id}` → `ENGINE.supplier_risk(supplier_id,
  horizon_days)`; `GET /api/intel/events` response objects gain a `"supplier"`
  key.

- [ ] **Step 1: Update the poll clustering key to include supplier**

In `backend/app/engines/news.py`, in `poll()`, replace:

```python
        clusters: dict[tuple[str, str], list[tuple[dict, str]]] = {}
        for ev, domain in extracted:
            clusters.setdefault((ev["corridor"], ev["severity"]), []).append((ev, domain))
        for (corridor, severity), members in clusters.items():
            ev, domain = members[0]
            ENGINE.ingest(Event(
                corridor=corridor, severity=severity, summary=ev["summary"],
                source=f"{stats['source']}:{domain} (+{len(members) - 1} corroborating)",
                corroborations=len(members),
            ))
```

with:

```python
        clusters: dict[tuple[str | None, str | None, str], list[tuple[dict, str]]] = {}
        for ev, domain in extracted:
            clusters.setdefault((ev.get("corridor"), ev.get("supplier"), ev["severity"]), []).append((ev, domain))
        for (corridor, supplier, severity), members in clusters.items():
            ev, domain = members[0]
            ENGINE.ingest(Event(
                corridor=corridor, supplier=supplier, severity=severity, summary=ev["summary"],
                source=f"{stats['source']}:{domain} (+{len(members) - 1} corroborating)",
                corroborations=len(members),
            ))
```

(The comment above this block about clustering by corridor+severity to avoid
saturating the Bayesian engine still applies — it now clusters by the full
`(corridor, supplier, severity)` triple so corridor-events and supplier-events,
and different suppliers, are never merged into the same cluster.)

- [ ] **Step 2: Add `supplier` to the events API response**

In `backend/app/routers/intel.py`, in `get_events`, replace:

```python
    return [
        {"corridor": e.corridor, "severity": e.severity, "summary": e.summary,
         "source": e.source, "timestamp": e.timestamp, "corroborations": e.corroborations}
        for e in sorted(ENGINE.events(), key=lambda e: -e.timestamp)[:50]
    ]
```

with:

```python
    return [
        {"corridor": e.corridor, "supplier": e.supplier, "severity": e.severity, "summary": e.summary,
         "source": e.source, "timestamp": e.timestamp, "corroborations": e.corroborations}
        for e in sorted(ENGINE.events(), key=lambda e: -e.timestamp)[:50]
    ]
```

- [ ] **Step 3: Add the supplier risk endpoints and widen manual event injection**

In `backend/app/routers/risk.py`, replace the whole file:

```python
"""Risk endpoints: corridor + supplier risk scores, and manual event injection
(until live feeds land)."""
from fastapi import APIRouter
from pydantic import BaseModel

from ..engines.risk import ENGINE, Event

router = APIRouter()


@router.get("/corridors")
def corridors(horizon_days: int = 30):
    return ENGINE.all_corridors(horizon_days)


@router.get("/corridors/{chokepoint_id}")
def corridor(chokepoint_id: str, horizon_days: int = 30):
    return ENGINE.corridor_risk(chokepoint_id, horizon_days)


@router.get("/suppliers")
def suppliers(horizon_days: int = 30):
    return ENGINE.all_suppliers(horizon_days)


@router.get("/suppliers/{supplier_id}")
def supplier(supplier_id: str, horizon_days: int = 30):
    return ENGINE.supplier_risk(supplier_id, horizon_days)


class EventIn(BaseModel):
    corridor: str | None = None
    supplier: str | None = None
    severity: str
    summary: str
    source: str = "manual"
    corroborations: int = 1


@router.post("/events")
def add_event(e: EventIn):
    ENGINE.ingest(Event(**e.model_dump()))
    return {"ok": True, "events_total": len(ENGINE.events())}
```

- [ ] **Step 4: Verify live**

With the backend running (`cd backend && .venv/bin/uvicorn app.main:app --port
8000`, or reuse the already-running dev instance):

```bash
curl -s localhost:8000/api/risk/suppliers | python3 -m json.tool
```

Expected: a JSON array of 8 objects, one per supplier id, each with `supplier`,
`horizon_days`, `prior_annual_pct` (matching Task 1's values), `prior_horizon_prob`,
`posterior_horizon_prob`, `drivers: []` (no events yet).

```bash
curl -s -X POST localhost:8000/api/risk/events -H 'Content-Type: application/json' \
  -d '{"supplier": "russia", "severity": "attack", "summary": "test", "source": "manual"}'
curl -s localhost:8000/api/risk/suppliers/russia | python3 -m json.tool
```

Expected: `posterior_horizon_prob` for Russia now higher than
`prior_horizon_prob`, with one driver in `drivers`.

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && .venv/bin/python3 -m pytest -v`
Expected: PASS, all tests (existing + Task 2's + Task 3's).

- [ ] **Step 6: Commit**

```bash
git add backend/app/engines/news.py backend/app/routers/intel.py backend/app/routers/risk.py
git commit -m "feat: wire supplier events through the news poller and expose supplier risk API"
```

---

### Task 5: Frontend data layer

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/useNetworkData.tsx`

**Interfaces:**
- Consumes: `GET /api/risk/suppliers` (Task 4).
- Produces: `SupplierRisk` interface (exported from `api.ts`); `api.supplierRisk():
  Promise<SupplierRisk[]>`; `useNetworkData()`'s return value gains a
  `supplierRisk: SupplierRisk[]` field (initial empty array, populated on load and
  refreshed every 60s alongside `risk`/`intel`/`newsStatus`).

- [ ] **Step 1: Add the type and API call**

In `frontend/src/lib/api.ts`, add this interface right after the existing
`CorridorRisk` interface:

```typescript
export interface SupplierRisk {
  supplier: string; horizon_days: number; prior_annual_pct: number;
  prior_horizon_prob: number; posterior_horizon_prob: number;
  drivers: { summary: string; severity: string; source: string; age_days: number; likelihood_ratio_applied: number }[];
}
```

In the `api` object, add (right after `corridorRisk`):

```typescript
  supplierRisk: () => get<SupplierRisk[]>("/api/risk/suppliers"),
```

- [ ] **Step 2: Fold `supplierRisk` into the shared context**

In `frontend/src/lib/useNetworkData.tsx`:

Change the import line to also pull in `SupplierRisk`:

```tsx
import {
  api, BacktestRow, Chokepoint, CorridorRisk, GradeInfo, IntelEvent, NewsStatus, Port,
  Refinery, Route, SprSite, Supplier, SupplierRisk,
} from "./api";
```

Add `supplierRisk: SupplierRisk[];` to the `NetworkData` interface (after `risk:
CorridorRisk[];`).

Add `supplierRisk: [],` to the `EMPTY` object (after `risk: [],`).

In the initial fetch, add `api.supplierRisk()` to the `Promise.all` array and
destructure it:

```tsx
    Promise.all([
      api.refineries(), api.ports(), api.spr(), api.chokepoints(), api.routes(),
      api.corridorRisk(), api.supplierRisk(), api.graphStats(), api.suppliers(), api.grades(),
      api.events(), api.backtests(), api.newsStatus(),
    ])
      .then(([rf, po, sp, cp, rt, rk, srk, gs, su, gr, ev, bt, ns]) => {
        if (cancelled) return;
        setData({
          refineries: rf, ports: po, spr: sp, chokepoints: cp, routes: rt,
          risk: rk, supplierRisk: srk, suppliers: su, grades: gr, intel: ev, backtests: bt,
          newsStatus: ns, graphStats: { nodes: gs.nodes, edges: gs.edges },
          loaded: true, error: false,
        });
      })
```

In the 60-second poll interval, add `api.supplierRisk()` alongside the existing
calls:

```tsx
    const t = setInterval(() => {
      Promise.all([api.corridorRisk(), api.supplierRisk(), api.events(), api.newsStatus()])
        .then(([r, sr, e, ns]) => {
          if (cancelled) return;
          setData((d) => ({ ...d, risk: r, supplierRisk: sr, intel: e, newsStatus: ns }));
        })
        .catch(() => {});
    }, 60_000);
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/useNetworkData.tsx
git commit -m "feat: fetch and share supplier risk data in the frontend data layer"
```

---

### Task 6: Frontend UI — Network page badge and supplier drawer

**Files:**
- Modify: `frontend/src/app/(app)/network/page.tsx`
- Modify: `frontend/src/components/AssetDrawer.tsx`
- Modify: `frontend/src/app/(app)/war-room/page.tsx`

**Interfaces:**
- Consumes: `useNetworkData()`'s `supplierRisk` field (Task 5); `riskBand(p:
  number): "low" | "elevated" | "high"` (already exported from
  `frontend/src/components/globe/GlobeMap.tsx`).
- Produces: no new exports — page/component-local JSX changes only.

- [ ] **Step 1: Add a risk badge to the Network page supplier list**

In `frontend/src/app/(app)/network/page.tsx`, add the import (alongside the
existing `useNetworkData` import):

```tsx
import { riskBand } from "@/components/globe/GlobeMap";
```

Add this constant near the top of the file, after the `Tab` type:

```tsx
const BAND_COLOR: Record<string, string> = {
  low: "var(--risk-low)", elevated: "var(--risk-elevated)", high: "var(--risk-high)",
};
```

Find the supplier list rendering block:

```tsx
          {tab === "suppliers" && filteredSuppliers.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setSelection({ kind: "supplier", supplier: s })}
              className={`block w-full px-3 py-3 text-left transition-colors duration-150 ${i > 0 ? "hairline-section" : ""} ${
                selection?.kind === "supplier" && selection.supplier.id === s.id
                  ? "bg-accent/10" : "hover:bg-surface-2"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-ink">{s.name}</span>
                <span className="figure text-[12px] text-ink-3">{s.share_pct}%</span>
              </div>
              <p className="caption mt-0.5">{s.export_terminals.length} terminal{s.export_terminals.length !== 1 ? "s" : ""}, {s.grades.length} grades</p>
            </button>
          ))}
```

Replace with:

```tsx
          {tab === "suppliers" && filteredSuppliers.map((s, i) => {
            const r = d.supplierRisk.find((x) => x.supplier === s.id);
            const band = r ? riskBand(r.posterior_horizon_prob) : null;
            return (
              <button
                key={s.id}
                onClick={() => setSelection({ kind: "supplier", supplier: s })}
                className={`block w-full px-3 py-3 text-left transition-colors duration-150 ${i > 0 ? "hairline-section" : ""} ${
                  selection?.kind === "supplier" && selection.supplier.id === s.id
                    ? "bg-accent/10" : "hover:bg-surface-2"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-medium text-ink">{s.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="figure text-[12px] text-ink-3">{s.share_pct}% of imports</span>
                    {r && (
                      <span className="figure text-[12px]" style={{ color: BAND_COLOR[band!] }}>
                        {(r.posterior_horizon_prob * 100).toFixed(1)}% risk
                      </span>
                    )}
                  </span>
                </div>
                <p className="caption mt-0.5">{s.export_terminals.length} terminal{s.export_terminals.length !== 1 ? "s" : ""}, {s.grades.length} grades</p>
              </button>
            );
          })}
```

- [ ] **Step 2: Show supplier risk in the AssetDrawer**

In `frontend/src/components/AssetDrawer.tsx`, add a `supplierRisk` prop. Change
the function signature:

```tsx
export default function AssetDrawer({
  selection, grades, routes, onClose,
}: {
  selection: Selection | null;
  grades: Record<string, GradeInfo>;
  routes: Route[];
  onClose: () => void;
}) {
```

to:

```tsx
export default function AssetDrawer({
  selection, grades, routes, supplierRisk, onClose,
}: {
  selection: Selection | null;
  grades: Record<string, GradeInfo>;
  routes: Route[];
  supplierRisk?: SupplierRisk[];
  onClose: () => void;
}) {
```

Add the import at the top of the file:

```tsx
import { GradeInfo, Route, SupplierRisk } from "@/lib/api";
```

(this replaces the existing `import { GradeInfo, Route } from "@/lib/api";` line —
same import, one more named type).

Inside the `{selection.kind === "supplier" && (...)}` block, right after the
opening `<>` and before the existing `<div className="hairline-section flex gap-6
pb-4 text-[13px]">` block, insert:

```tsx
          {(() => {
            const r = supplierRisk?.find((x) => x.supplier === selection.supplier.id);
            if (!r) return null;
            return (
              <div className="hairline-section pb-4">
                <div className="flex items-baseline justify-between">
                  <span className="section-label">30-day disruption risk</span>
                  <span className="stat-value text-[22px] text-ink">{(r.posterior_horizon_prob * 100).toFixed(1)}%</span>
                </div>
                {r.drivers.length > 0 && (
                  <p className="caption mt-1">{r.drivers[0].summary}</p>
                )}
              </div>
            );
          })()}
```

- [ ] **Step 3: Thread `supplierRisk` from pages into `AssetDrawer`**

In `frontend/src/app/(app)/network/page.tsx`, find:

```tsx
        <AssetDrawer selection={selection} grades={d.grades} routes={d.routes} onClose={() => setSelection(null)} />
```

Replace with:

```tsx
        <AssetDrawer selection={selection} grades={d.grades} routes={d.routes} supplierRisk={d.supplierRisk} onClose={() => setSelection(null)} />
```

In `frontend/src/app/(app)/war-room/page.tsx`, find:

```tsx
      <AssetDrawer selection={selection} grades={d.grades} routes={d.routes} onClose={() => setSelection(null)} />
```

Replace with:

```tsx
      <AssetDrawer selection={selection} grades={d.grades} routes={d.routes} supplierRisk={d.supplierRisk} onClose={() => setSelection(null)} />
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Live-check**

With backend and frontend dev servers running:
1. Open `http://localhost:3000/network`, switch to the Suppliers tab. Confirm each
   supplier row shows both its import share and a colored risk percentage (should
   roughly track the priors from Task 1 — Russia highest, USA lowest — until live
   news events shift them).
2. Click a supplier row. Confirm the drawer shows a "30-day disruption risk" line
   near the top.
3. Open `http://localhost:3000/war-room`, click a supplier terminal marker on the
   globe. Confirm the same risk line appears in the drawer there too.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/\(app\)/network/page.tsx frontend/src/components/AssetDrawer.tsx frontend/src/app/\(app\)/war-room/page.tsx
git commit -m "feat: surface supplier disruption risk in Network page and asset drawer"
```

---

## Self-Review Notes

- **Spec coverage:** Assumptions (Task 1) → RiskEngine (Task 2) → Extractor (Task
  3) → poller/API wiring (Task 4) → frontend data layer (Task 5) → frontend UI
  (Task 6). Every section of the phase 1 design doc has a task.
- **Placeholder scan:** no TBD/TODO; every step has literal code, YAML, or an exact
  command.
- **Type consistency:** `Event.supplier` (Task 2) is threaded through
  `extract_batch`'s dict shape (Task 3), `news.py`'s clustering (Task 4),
  `SupplierRisk` (Task 5) matches `RiskEngine.supplier_risk`'s exact return shape
  (Task 2), and `AssetDrawer`'s new `supplierRisk` prop type (Task 6) matches
  `SupplierRisk[]` from Task 5.
- **Field-ordering gotcha called out explicitly:** Task 2 Step 3 keeps `corridor`
  in its original dataclass position (just widens its type to `str | None`, no
  default) specifically so no existing keyword-argument call site elsewhere in the
  codebase (`backtest.py`, `risk.py` itself) needs to change; `supplier` is added
  at the very end, after the two already-defaulted fields, satisfying Python
  dataclass field-ordering rules.
- **Regression risk called out explicitly:** Task 4 Step 1's clustering-key change
  is the one spot most likely to silently break existing corridor-event behavior
  if done wrong (e.g., forgetting to widen the tuple type or dropping the
  `.get(...)` defensive access since `corridor`/`supplier` can now genuinely be
  `None` inside a real dict, not just absent) — Task 4 Step 5 (full test suite) and
  Step 4 (live curl check with a real supplier event) both catch this before
  commit.
