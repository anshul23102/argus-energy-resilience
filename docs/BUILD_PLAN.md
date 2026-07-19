# ARGUS — AI Energy Supply Chain Resilience Platform
### ET AI Hackathon 2.0 · Problem Statement 2 · Build Plan
**Deadline: 22 July 2026, 11:59 PM IST — ~3.5 days remaining (plan written 19 July, evening)**

---

## 1. The Concept in One Paragraph

**ARGUS** (working name — "the giant who never sleeps, with a hundred eyes") is a live intelligence
war-room for India's crude oil supply chain. It watches the world continuously — news, ship
movements, sanctions, prices — maintains a probabilistic disruption risk score per supply corridor,
and when a threat materializes (or an analyst asks "what if?"), it simulates the cascading impact on
India's actual refineries, fuel prices, and strategic reserves, then **generates an executable
procurement response plan** — which cargoes to buy, from where, on which routes, at what cost —
optimized by a real linear-programming engine, not LLM guesswork. Judges see: signal → simulation →
decision, end-to-end, in minutes.

## 2. Why This Wins (the "extra")

Every criterion in their evaluation focus is a feature we deliberately build:

| Their evaluation focus | Our answer |
|---|---|
| Disruption signal detection lead time & accuracy | **Historical backtesting**: replay Abqaiq attack (Sep 2019), Russia sanctions (Feb 2022), Red Sea crisis (Nov 2023–24) through our risk engine and show the score rising N days before price impact. Almost no team will backtest. |
| Quality & executability of procurement alternatives | LP optimizer outputs an actual order sheet: supplier, grade, volume, laycan window, route, freight cost, days-to-delivery — constrained by real refinery grade compatibility. |
| Scenario model fidelity, explicit testable assumptions | `assumptions.yaml` — every elasticity, capacity, and lead time is a named, sourced, editable parameter. Judges can change one live and watch outputs shift. |
| Geospatial evidence depth | deck.gl war-room map: real tanker positions (AIS), real refineries/ports/pipelines, chokepoints, animated flow rerouting. |
| End-to-end response time signal→recommendation | A visible "response clock" in the demo: event detected 00:00 → risk repriced 00:40 → scenario simulated 01:30 → procurement plan issued 03:00. |

**The unconventional core:** most teams will build "LLM reads news and writes a report." We build a
**hybrid neuro-symbolic system** — LLMs only at the perception edge (turning messy text into
structured events) and the explanation edge (briefings); everything between is principled CS:
Bayesian risk updating, Monte Carlo simulation, network-flow routing, linear programming. This is
both genuinely better engineering *and* a killer pitch line: *"The LLM never does the math."*

## 3. System Architecture (5 subsystems)

```
 ┌────────────────────────  PERCEPTION LAYER  ───────────────────────┐
 │  News/GDELT ingester → LLM event extractor → structured events    │
 │  AIS vessel feed (aisstream.io) → corridor congestion + anomalies │
 │  Price feed (Brent/WTI/Dubai via yfinance) → volatility signals   │
 │  Sanctions registries (OFAC SDN csv) → entity risk flags          │
 └───────────────┬───────────────────────────────────────────────────┘
                 ▼
 ┌── RISK ENGINE ──────────────┐    ┌── KNOWLEDGE GRAPH (Neo4j) ────┐
 │ Bayesian hazard model per   │◄──►│ Suppliers, grades, vessels,   │
 │ corridor/chokepoint/supplier│    │ routes, chokepoints, ports,   │
 │ (prior from history, updated│    │ refineries, crude diets, SPR  │
 │ by live events)             │    │ caverns — ~500 real entities  │
 └──────────────┬──────────────┘    └───────────────────────────────┘
                ▼
 ┌── SCENARIO ENGINE ─────────────────────────────────────────────┐
 │ Monte Carlo simulation over supply network. Shocks: Hormuz     │
 │ closure %, Red Sea suspension, OPEC+ cut, supplier default.    │
 │ Outputs: refinery run-rate paths, SPR days-of-cover, landed    │
 │ cost curve, retail price + GDP impact (published elasticities) │
 └──────────────┬─────────────────────────────────────────────────┘
                ▼
 ┌── DECISION ENGINE ─────────────────────────────────────────────┐
 │ Procurement LP (PuLP): min cost s.t. demand, grade compat,     │
 │ route capacity, tanker availability, laycan timing             │
 │ SPR drawdown optimizer: when/how much to release               │
 └──────────────┬─────────────────────────────────────────────────┘
                ▼
 ┌── AGENT ORCHESTRATION + WAR ROOM UI ───────────────────────────┐
 │ Claude-powered agents (Watchtower, Simulator, Trader, Reserve  │
 │ Strategist, Briefing Officer) with tool access to all engines. │
 │ Next.js + deck.gl map, scenario console, order sheets, brief.  │
 └────────────────────────────────────────────────────────────────┘
```

Backend: **Python / FastAPI**, SQLite+Parquet for time series (no ops burden), **Neo4j** for graph
(judge-visible + past-winner signal), **PuLP** for LP, **NetworkX** for routing, **Claude API**
(claude-sonnet-5) for agents. Frontend: **Next.js + deck.gl/MapLibre + Tailwind** — dark
control-room aesthetic, built with the installed design skills (impeccable / taste-skill /
ui-ux-pro-max). Anti-generic UI is an explicit requirement.

## 4. Real Data Sources (all free)

| Data | Source | Mode |
|---|---|---|
| Geopolitical news events | GDELT 2.0 DOC API (15-min updates) + curated RSS | Live |
| Vessel positions (tankers, Hormuz/Red Sea corridors) | aisstream.io websocket (free key) | Live + cached snapshots as fallback |
| Crude prices (Brent, WTI, Dubai proxy) | yfinance futures | Live |
| Sanctions | OFAC SDN list CSV | Static, refreshed |
| India refineries (23, with capacity, complexity, crude diet) | PPAC / company reports — hand-curated once | Static dataset we build |
| Ports, SPR sites (Visakhapatnam, Mangalore, Padur), import terminals | Public records | Static dataset |
| Shipping routes + chokepoint geometry | Hand-built GeoJSON | Static |
| Historical events for backtest | GDELT archive + price history | Static |

The static curated datasets (`data/`) are themselves a differentiator — a real, sourced model of
India's crude infrastructure that no other team will bother assembling.

## 5. 3.5-Day Sprint Schedule

**Tonight (D0):** Repo scaffold, FastAPI + Next.js skeletons, curate core datasets (refineries,
ports, routes, chokepoints, grades), load Neo4j graph, map renders with all assets.
**Day 1 (Jul 20):** Perception layer (GDELT poller, price feed, AIS snapshotter, LLM event
extractor) + Bayesian risk engine + risk backtest harness on the 3 historical crises.
**Day 2 (Jul 21):** Scenario engine (Monte Carlo + assumptions.yaml) + procurement LP + SPR
optimizer + agent orchestration wiring + war-room UI main screens.
**Day 3 (Jul 22):** Polish UI, scripted "Hormuz 60% closure" demo path, record demo video, deck,
architecture diagram, README, impact model, public repo hygiene — **submit by ~9 PM IST buffer**.

Scope-cut order if time runs short (cut from the bottom, never the top):
1. Risk engine + scenario sim + LP + map demo ← never cut
2. Live GDELT + prices ← keep
3. Backtest charts ← keep if at all possible (it's a headline differentiator)
4. Live AIS websocket → fall back to cached real snapshots
5. SPR optimizer → fall back to rule-based drawdown
6. Multi-language briefings, auth, deployment → skip freely

## 6. Deliverables Checklist (per PDF + past-edition norms)

- [ ] Working prototype (runnable locally; deployed link if time permits)
- [ ] Architecture diagram (mermaid → polished)
- [ ] Presentation deck (slides skill; ET-business framing, impact model with ₹ numbers)
- [ ] Demo video (Playwright-scripted screen capture of the crisis walkthrough)
- [ ] Public GitHub repo with real README, assumptions documented, license
- [ ] Impact model: ₹ value of 1 day of disruption lead time for Indian refiners

## 7. Pitch Spine (for the finale)

1. **Hook:** "India imports 88% of its crude; 40% sails through one strait 3,000 km away. When it
   hiccups, your petrol price moves in 11 days. We built the system that sees it coming."
2. Live: Watchtower flags a real news event → risk score moves.
3. "What if it escalates?" → Hormuz 60% closure scenario → cascading impacts on real refineries.
4. Trader agent issues the order sheet; Reserve Strategist schedules SPR release.
5. Backtest slide: "Against the last three real crises, ARGUS signals led price impact by X days."
6. Scalability: same engine → LNG, fertilizer, semiconductors; buyer: refiners, PSUs, policy.
