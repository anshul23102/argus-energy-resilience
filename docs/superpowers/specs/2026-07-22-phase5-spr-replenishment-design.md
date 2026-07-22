# Phase 5: SPR replenishment window modeling — design

Part of the [requirements gap-closing roadmap](2026-07-22-requirements-gap-roadmap.md).
The problem statement asks the "Strategic Reserve Optimisation Agent" to model
"optimal SPR drawdown schedules... and replenishment window estimates."
`engines/spr.py` models drawdown only today — after a crisis, the module stops,
leaving no estimate of how or when the depleted reserve gets refilled before
the next crisis.

## Assumptions

New top-level `spr` block in `data/assumptions.yaml`:

```yaml
spr:
  max_replenishment_mbd: {value: 0.15, note: "Max sustainable SPR refill/injection rate via supplemental purchases post-crisis; typically slower than emergency drawdown since it's discretionary, budget-paced procurement, not an emergency release", confidence: low}
  replenishment_cooldown_days: {value: 14, note: "Days after first relief cargo arrives before dedicated refill purchasing begins (market/budget lag)", confidence: low}
```

## `engines/spr.py`

The existing drawdown loop (`schedule()`'s day-by-day release computation) is
untouched — every existing return field stays byte-identical. After it
computes `remaining` (reserve left at the end of the modeled crisis window),
compute the replenishment window analytically. Refill happens at a constant
rate, so a second day-by-day loop isn't needed — direct arithmetic is simpler
and exact:

```
refill_needed_mbbl        = reserve_start_mbbl - remaining
replenishment_start_day   = relief_day + cooldown_days     # relief_day is the
                                                             # existing variable
                                                             # already used for
                                                             # drawdown timing
replenishment_window_days = ceil(refill_needed_mbbl / max_replenishment_mbd)
replenishment_complete_day = replenishment_start_day + replenishment_window_days
```

`relief_day` is reused as-is from the existing drawdown computation
(`first_relief_days` if given, else `horizon_days`) — no new "when did the
crisis end" concept is introduced; replenishment planning is treated as
starting once first relief arrives, same simplification the existing drawdown
logic already makes.

Added as a new `replenishment` sub-dict in the return value:

```python
"replenishment": {
    "refill_needed_mbbl": ...,
    "max_replenishment_mbd": ...,
    "cooldown_days": ...,
    "replenishment_start_day": ...,
    "replenishment_window_days": ...,
    "replenishment_complete_day": ...,
},
```

Degenerate case: if the SPR never released anything (`refill_needed_mbbl <= 0`,
e.g. procurement fully covered the gap without needing reserve support),
`replenishment_window_days` is `0` and `replenishment_complete_day` equals
`replenishment_start_day` — correctly representing "nothing to refill."

## Frontend

`(app)/scenario/page.tsx`'s "Strategic reserve bridge" section gains a second
line describing the refill timeline: when dedicated replenishment purchasing
starts, how long it takes, and when the reserve is back to full. The
`ScenarioResponse` interface's `spr` field type gains the new `replenishment`
shape.

## Out of scope

Modeling replenishment COST (at what price India rebuys the barrels it
released, versus what it sold... it didn't sell anything, it released from a
reserve it already owned, so "replenishment cost" is really just "cost of
buying refill barrels at post-crisis market price") — a real follow-on lever,
but not what "replenishment window" literally asks for (a timing estimate, not
a cost estimate). Could be a future addition layered onto this one.
