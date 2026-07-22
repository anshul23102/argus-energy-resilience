# ARGUS requirements gap-closing roadmap

Audit against the ET AI Hackathon 2.0 Problem Statement 2 text (every "what you may
build" item, every suggested technology, every Evaluation Focus item), cross-checked
against the actual codebase, not just README claims. This is the decomposition
referenced by each phase's own spec/plan — see
`docs/superpowers/specs/YYYY-MM-DD-phase-N-*-design.md` for each phase as it's
brainstormed.

Explicitly out of scope for this roadmap (per user instruction): demo video,
presentation deck, architecture diagram — deliverables, not product gaps.

## Confirmed done (not touched by this roadmap)

Corridor-level Bayesian risk scoring, chokepoint-closure scenario modelling
(refinery run rate / retail price / GDP / CAD impact), procurement LP (grade
compatibility, spare capacity, cost minimization), SPR drawdown scheduling,
knowledge graph, LLM news extraction + briefing with rules fallback, Monte Carlo
simulation, geospatial 3D map, historical backtesting with lead-time measurement,
executable order sheets, editable sourced assumptions, response-time
instrumentation.

## Phases

1. **Supplier-level disruption risk scoring** — problem statement asks for risk
   "by corridor and supplier"; engine only does corridor today.
2. **OPEC+ emergency cut scenario type** — named explicitly as an example scenario;
   engine only models chokepoint closures, not source-side production cuts.
3. **Power sector stress modeling** — named explicitly as a required cascading
   impact; not modeled at all today (only refining/retail fuel).
4. **Procurement LP realism** — tanker/vessel availability and port congestion,
   both named explicitly as LP factors; LP has neither today.
5. **SPR replenishment window modeling** — named explicitly for the reserve agent;
   engine models drawdown only, never refill.
6. **Multi-agent orchestration** — rework the deterministic
   `engines/orchestrator.py` pipeline into real LLM-driven agents (Watchtower,
   Simulator, Trader, Reservist, Briefer) with tool access to the engines built in
   phases 1-5 plus the existing risk/scenario/procurement/spr engines — matching
   the BUILD_PLAN's original agent vision and the problem statement's suggested
   "Agentic AI / Multi-Agent Systems" more literally, while keeping the engines
   themselves as the source of truth for all math (agents call them as tools, they
   don't recompute).
7. **Sanctions (OFAC SDN) live feed** — named explicitly as a perception-layer
   input; `payment_risk` today is a hand-written static note, not a live feed.
8. **AIS vessel tracking** — named explicitly twice (agent input + suggested
   geospatial tech); nothing implemented today.
9. **RAG over geopolitical/commodity intelligence sources** — named as a suggested
   technology; extraction today is direct LLM classification with no retrieval.

Order rationale: phases 1-5 are engine-level gaps that directly extend existing,
working code paths and each maps to a named Evaluation Focus item. Phase 6 comes
after them so the new agents have a full, meaningful tool surface to orchestrate.
Phases 7-9 are new external data-feed integrations — the heaviest and most
infrastructure-dependent lifts (live websockets, external registries, retrieval
indices) — saved for last.

Each phase gets its own brainstormed design (approved before any code), its own
implementation plan, and is built and verified before the next phase starts.
