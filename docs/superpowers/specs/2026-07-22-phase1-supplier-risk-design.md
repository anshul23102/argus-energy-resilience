# Phase 1: Supplier-level disruption risk scoring — design

Part of the [requirements gap-closing roadmap](2026-07-22-requirements-gap-roadmap.md).
The problem statement asks for a live disruption probability score "by corridor and
supplier" — today's `RiskEngine` only scores by corridor (chokepoint). This phase adds
the supplier axis, mirroring the existing corridor-risk pattern.

## Assumptions

Add to `data/assumptions.yaml` under `risk_engine`, one entry per supplier in
`data/suppliers_grades.json`, following the exact naming/shape convention of the
existing `base_hazard_<chokepoint>_annual_pct` entries:

```yaml
base_hazard_supplier_russia_annual_pct: {value: 6.0, note: "Sanctions/price-cap regime volatility; highest of India's suppliers", source: "expert-judgment prior, consistent with payment_risk note in suppliers_grades.json", confidence: low}
base_hazard_supplier_iraq_annual_pct: {value: 2.5, note: "Political instability risk to export continuity", confidence: low}
base_hazard_supplier_nigeria_annual_pct: {value: 2.0, note: "Pipeline vandalism/sabotage history in Niger Delta", confidence: low}
base_hazard_supplier_saudi-arabia_annual_pct: {value: 1.5, note: "Generally stable exporter; includes low-probability attack tail risk (cf. 2019 Abqaiq)", confidence: low}
base_hazard_supplier_angola_annual_pct: {value: 1.0, confidence: low}
base_hazard_supplier_uae_annual_pct: {value: 1.0, confidence: low}
base_hazard_supplier_kuwait_annual_pct: {value: 1.0, confidence: low}
base_hazard_supplier_usa_annual_pct: {value: 0.5, note: "Most stable of India's suppliers", confidence: low}
```

These are expert-judgment priors (same honesty-ledger treatment as existing corridor
priors) — visible and editable on the Assumptions page once wired through
`data.assumptions()`, which requires no code change since it already loads the whole
YAML tree generically.

## Extractor: add a supplier axis

`engines/extractor.py` currently classifies each headline into one of 5 corridors (or
`"none"`) plus a severity rung. This phase adds an independent `supplier` label — a
headline can name a corridor, a supplier, both, or neither (e.g., "Iran threatens to
close Hormuz" → corridor=hormuz, supplier=none; "US imposes new sanctions on Rosneft
exports" → corridor=none, supplier=russia).

- `SUPPLIERS = ["russia", "iraq", "saudi-arabia", "uae", "usa", "nigeria", "kuwait", "angola"]`
  (matches `data/suppliers_grades.json` ids exactly).
- `_BATCH_PROMPT`: extend the JSON schema the LLM returns to include
  `"supplier": one of {suppliers} or "none"`, with a short guide line distinguishing
  corridor-only headlines (chokepoint/shipping-lane security) from supplier-only
  headlines (sanctions, export-terminal incidents, production/political disruption
  tied to one of the 8 named source countries).
- Rule fallback: `_SUPPLIER_PATTERNS`, same style as the existing
  `_CORRIDOR_PATTERNS` — country name plus supply-disruption keywords, e.g.
  `"russia": r"russia|rosneft|urals|espo|novorossiysk|primorsk|kozmino"` combined with
  the existing `_SEVERITY_PATTERNS` (reused as-is; sanctions/pipeline-attack style
  language already matches `attack`/`partial_closure`/`rhetoric` rungs reasonably).
- `_extract_rules(text)` returns both `corridor` and `supplier` (each independently
  `None` if no pattern hit, and the function no longer bails out just because one axis
  is `None` — only when *both* are `None` is the headline irrelevant); `extract_batch`
  / `_parse_array` updated to carry the new field through the LLM and rules paths
  alike.

## Risk engine: supplier scoring

`engines/risk.py`:
- `Event` dataclass gains `supplier: str | None = None`.
- `RiskEngine.events(corridor=None)` stays as-is for corridor filtering; add
  `RiskEngine.events_for_supplier(supplier_id)` filtering on `e.supplier == supplier_id`.
- New `RiskEngine.supplier_risk(supplier_id, horizon_days=30, now_ts=None) -> dict` —
  same Bayesian shape as `corridor_risk`: prior annual hazard → horizon probability →
  Bayes-factor update from decayed, corroborated supplier-tagged events. Looks up
  `base_hazard_supplier_<id>_annual_pct` from assumptions instead of the chokepoint
  key. Returns the same shape as `corridor_risk` (`supplier`, `horizon_days`,
  `prior_annual_pct`, `prior_horizon_prob`, `posterior_horizon_prob`, `drivers`) so the
  frontend can reuse rendering logic.
- New `RiskEngine.all_suppliers(horizon_days=30) -> list[dict]` — one entry per
  supplier in `data.suppliers()`, same pattern as `all_corridors`.

## API

`routers/risk.py`:
- `GET /api/risk/suppliers?horizon_days=30` → `ENGINE.all_suppliers(horizon_days)`.
- `GET /api/risk/suppliers/{supplier_id}?horizon_days=30` → `ENGINE.supplier_risk(...)`.

## Frontend

- `lib/api.ts`: `SupplierRisk` interface (mirrors `CorridorRisk` but keyed
  `supplier` instead of `chokepoint`); `api.supplierRisk(): Promise<SupplierRisk[]>`.
- `lib/useNetworkData.tsx`: fetch `supplierRisk` alongside the existing `risk` array
  in the initial load and the 60s poll (same treatment as `newsStatus` from the
  earlier polish round).
- Network page (`(app)/network/page.tsx`): in the supplier list, show a risk badge
  (percentage + color band, reusing `riskBand()`/`BAND_COLOR` already defined for
  corridors) next to each supplier row, replacing/augmenting the existing
  `share_pct` display.
- `AssetDrawer.tsx`: when a supplier is selected, show its posterior risk and top
  evidence drivers (same layout idea as the Corridor Risk page's evidence list, kept
  compact since the drawer is a side panel).

## Out of scope

Wiring supplier risk into the procurement LP as a cost or constraint factor — a
natural follow-on, not what "risk score by corridor and supplier" literally asks
for. Multi-agent orchestration (phase 6) and every later phase are untouched here.
