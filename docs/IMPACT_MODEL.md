# ARGUS Impact Model — what is this worth in rupees?

Judging asks for business impact. Here is the quantified case, with every input traceable to
[`data/assumptions.yaml`](../data/assumptions.yaml) or a cited public figure. We show the
arithmetic so it can be challenged — ranges, not point claims.

## 1. The cost of the problem (baseline)

- India crude imports: **4.75 mb/d** (5.4 mb/d processing × 88% import share)
- Every **+$1/bbl** sustained on the import bill ≈ **$4.75M/day ≈ ₹41 crore/day**
- A Hormuz-class disruption (our P50 simulation, 60% closure): Brent +$55–60 at peak
  → import bill stress of **₹2,200–2,500 crore/day** at peak, before mitigation
- McKinsey (cited in the problem statement): economies **without** automated response
  intelligence took **47 days longer** to stabilise supply than those with it.

## 2. Value lever A — lead time on procurement (the big one)

Backtested lead times (no-look-ahead replay of 3 real crises): **2–125 days**, median case ~29 days.

When ARGUS's posterior crosses the action threshold *before* the price event, procurement can
fix cargoes at pre-crisis differentials. In the 2019 Abqaiq episode, Brent jumped ~15% (+$9/bbl)
in one session; grade differentials and freight moved further.

> Conservative claim: acting **3 days** earlier on just **1 mb/d** of replacement volume at
> **+$5/bbl** cheaper pre-spike terms = **$15M ≈ ₹130 crore saved per episode** — and the Red
> Sea backtest suggests the achievable window is 10× that.

Even at one Hormuz-class scare per two years, expected value is **₹65+ crore/year** on the most
conservative reading of one lever.

## 3. Value lever B — refinery continuity

Unmanaged, our P10 (bad-tail) runs show stock cover approaching the 7-day operational floor,
forcing run cuts to the 60% minimum. Each day of a 15% national run cut removes ~0.8 mb/d of
products. At a **$8/bbl** gross refining margin, that is **$6.4M ≈ ₹55 crore/day** of margin
destroyed — before considering product shortages. The managed-vs-unmanaged band gap in every
scenario chart is this lever, visualised.

## 4. Value lever C — SPR discipline

A naive "release everything now" drawdown exhausts ISPRL Phase I (39 mbbl ≈ 9.5 days cover) in
the first fortnight and leaves nothing for the post-relief tail. The scheduler's need-based
release keeps a reserve tail through day 60. The difference in the P10 runs is **3–5 days of
avoided run cuts** → ₹165–275 crore per episode via lever B rates.

## 5. Cost side

Free-tier data feeds, open-source solvers, one GPU-free VM. Production hardening (paid AIS,
Worldscale freight feed, Neo4j Aura, on-prem LLM) estimated **< ₹1.5 crore/year** — under 3% of
the single-episode value of lever A alone.

## 6. Scalability (15% of judging)

The engine is commodity-agnostic: the graph schema (supplier → terminal → route → chokepoint →
port → processor) and the risk/scenario/LP stack transfer directly to **LNG** (India imports
~50%), **fertiliser/urea**, **edible oils**, and **semiconductor precursors**. Same codebase,
new `data/` folder. Buyers: refiners (IOCL/BPCL/HPCL/RIL), PPAC/MoPNG, ISPRL, power utilities,
and any import-dependent economy — the problem statement's own framing ("import-dependent
economies") is the addressable market.
