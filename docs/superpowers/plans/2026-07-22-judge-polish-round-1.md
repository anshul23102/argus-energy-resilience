# Judge-facing polish, round 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three judge-facing rough edges found by running ARGUS live: a blank-page
flash on every navigation, nonsensical negative-premium copy, and no freshness signal
on risk scores.

**Architecture:** Frontend-only changes (Next.js app router, `frontend/src/`). No
backend changes — all three fixes are display-layer. Fix 1 converts the existing
per-page data-fetch hook into a React Context provider mounted once at the `(app)`
layout level, so client-side navigation within the app shell reuses already-fetched
data instead of re-fetching. Fixes 2 and 3 are small, independent display changes
layered on top.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind. No
frontend test framework is installed in this repo (`frontend/package.json` has no
jest/vitest/RTL) — adding one is out of scope for this polish pass. Verification
uses TypeScript compilation (`tsc --noEmit`) plus live checks against the running
dev server (`http://localhost:3000`) and backend (`http://localhost:8000`), which
are already up from the audit session.

## Global Constraints

- No backend (`backend/`) changes in this plan — all three fixes are frontend
  display-layer only, per the design doc.
- Preserve the existing public shape of `useNetworkData()` (same field names) so
  every page consuming it keeps working without a page-level rewrite, except where
  a task explicitly adds a new field.
- No new npm dependencies.

---

### Task 1: Shared network-data context (fixes the blank-page flash)

**Files:**
- Create: `frontend/src/lib/useNetworkData.tsx`
- Delete: `frontend/src/lib/useNetworkData.ts`
- Modify: `frontend/src/app/(app)/layout.tsx`
- Modify: `frontend/src/components/AppShell.tsx`

**Interfaces:**
- Consumes: existing `api` object from `frontend/src/lib/api.ts` (`api.refineries()`,
  `api.ports()`, `api.spr()`, `api.chokepoints()`, `api.routes()`,
  `api.corridorRisk()`, `api.graphStats()`, `api.suppliers()`, `api.grades()`,
  `api.events()`, `api.backtests()`) — unchanged signatures.
- Produces: `NetworkDataProvider` (React component, wraps children), and
  `useNetworkData()` (hook, returns
  `{ refineries, ports, spr, chokepoints, routes, suppliers, grades, risk, intel,
  backtests, graphStats, loaded, error }` — identical shape to the current hook).
  Task 3 will extend this shape with a `newsStatus` field.

- [ ] **Step 1: Create the context/provider file**

Create `frontend/src/lib/useNetworkData.tsx`:

```tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  api, BacktestRow, Chokepoint, CorridorRisk, GradeInfo, IntelEvent, Port,
  Refinery, Route, SprSite, Supplier,
} from "./api";

interface NetworkData {
  refineries: Refinery[];
  ports: Port[];
  spr: SprSite[];
  chokepoints: Chokepoint[];
  routes: Route[];
  suppliers: Supplier[];
  grades: Record<string, GradeInfo>;
  risk: CorridorRisk[];
  intel: IntelEvent[];
  backtests: BacktestRow[];
  graphStats: { nodes: number; edges: number } | null;
  loaded: boolean;
  error: boolean;
}

const EMPTY: NetworkData = {
  refineries: [], ports: [], spr: [], chokepoints: [], routes: [], suppliers: [],
  grades: {}, risk: [], intel: [], backtests: [], graphStats: null,
  loaded: false, error: false,
};

const NetworkDataContext = createContext<NetworkData>(EMPTY);

export function NetworkDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<NetworkData>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.refineries(), api.ports(), api.spr(), api.chokepoints(), api.routes(),
      api.corridorRisk(), api.graphStats(), api.suppliers(), api.grades(),
      api.events(), api.backtests(),
    ])
      .then(([rf, po, sp, cp, rt, rk, gs, su, gr, ev, bt]) => {
        if (cancelled) return;
        setData({
          refineries: rf, ports: po, spr: sp, chokepoints: cp, routes: rt,
          risk: rk, suppliers: su, grades: gr, intel: ev, backtests: bt,
          graphStats: { nodes: gs.nodes, edges: gs.edges },
          loaded: true, error: false,
        });
      })
      .catch(() => !cancelled && setData((d) => ({ ...d, error: true })));

    const t = setInterval(() => {
      Promise.all([api.corridorRisk(), api.events()])
        .then(([r, e]) => {
          if (cancelled) return;
          setData((d) => ({ ...d, risk: r, intel: e }));
        })
        .catch(() => {});
    }, 60_000);

    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return (
    <NetworkDataContext.Provider value={data}>{children}</NetworkDataContext.Provider>
  );
}

export function useNetworkData() {
  return useContext(NetworkDataContext);
}
```

- [ ] **Step 2: Delete the old hook file**

```bash
rm frontend/src/lib/useNetworkData.ts
```

(Both files can't coexist — `useNetworkData.ts` and `useNetworkData.tsx` would be an
ambiguous module resolution for the same import path `@/lib/useNetworkData`.)

- [ ] **Step 3: Wire the provider into the app layout**

Replace `frontend/src/app/(app)/layout.tsx` in full:

```tsx
import AppShell from "@/components/AppShell";
import { NetworkDataProvider } from "@/lib/useNetworkData";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <NetworkDataProvider>
      <AppShell>{children}</AppShell>
    </NetworkDataProvider>
  );
}
```

- [ ] **Step 4: Add a first-load loading state to AppShell**

In `frontend/src/components/AppShell.tsx`, add the import (alongside the existing
`IntroOverlay` import at the top):

```tsx
import { useNetworkData } from "@/lib/useNetworkData";
```

Inside `AppShell`, right after the existing `const [apiDown, setApiDown] =
useState(false);` line, add:

```tsx
const { loaded } = useNetworkData();
```

Then replace the existing main element:

```tsx
<main className="min-h-0 flex-1 overflow-auto">{children}</main>
```

with:

```tsx
<main className="min-h-0 flex-1 overflow-auto">
  {loaded ? children : (
    <div className="flex h-full w-full items-center justify-center">
      <p className="text-[14px] text-ink-3">Loading ARGUS…</p>
    </div>
  )}
</main>
```

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. If `useNetworkData.ts` still shows up in the error output,
confirm Step 2's delete actually happened (`ls frontend/src/lib/useNetworkData.*`
should show only the `.tsx` file).

- [ ] **Step 6: Live-check no blank flash + single fetch on nav**

With the dev server running at `http://localhost:3000` (and backend at
`http://localhost:8000`):
1. Open `http://localhost:3000/war-room` in a browser, wait for it to fully load.
2. Open the network tab / request log. Click through War Room → Corridor Risk →
   Scenario Console → Network → Global Context → Assumptions → Sources in quick
   succession.
3. Confirm: each page shows content immediately (no empty-page flash), and
   `/api/assets/refineries`, `/api/assets/suppliers`, `/api/assets/routes`, etc. are
   each called only once total (from the initial mount), not once per page visit.
   `/api/risk/corridors` and `/api/intel/events` may additionally appear once every
   60 seconds from the poll interval — that's expected.
4. Reload `http://localhost:3000/war-room` fresh (hard refresh) and confirm you
   briefly see "Loading ARGUS…" centered in the main panel before content appears,
   instead of a blank/empty page.

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/lib/useNetworkData.tsx src/app/\(app\)/layout.tsx src/components/AppShell.tsx
git status  # confirm src/lib/useNetworkData.ts shows as deleted
git add -u
git commit -m "fix: share network data via context to stop per-page refetch flash"
```

---

### Task 2: Fix negative-premium copy in the scenario console

**Files:**
- Modify: `frontend/src/app/(app)/scenario/page.tsx:186-189`

**Interfaces:**
- Consumes: `res.procurement.daily_premium_musd` (`number`, already present in the
  `ScenarioResponse` interface defined earlier in the same file) and
  `res.procurement.first_relief_days` (`number | null`, same interface).
- Produces: no new exports — page-local JSX change only.

- [ ] **Step 1: Replace the summary paragraph**

In `frontend/src/app/(app)/scenario/page.tsx`, find:

```tsx
              <p className="caption mt-4">
                First seaborne relief in {res.procurement.first_relief_days ?? "unknown"} days, premium
                ${res.procurement.daily_premium_musd}M per day above baseline.
              </p>
```

Replace with:

```tsx
              <p className="caption mt-4">
                First seaborne relief in {res.procurement.first_relief_days ?? "unknown"} days,{" "}
                {res.procurement.daily_premium_musd >= 0
                  ? `premium $${res.procurement.daily_premium_musd}M per day above baseline.`
                  : `$${Math.abs(res.procurement.daily_premium_musd)}M per day cheaper than baseline.`}
              </p>
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Live-check both branches**

With the dev server and backend running:
1. Open `http://localhost:3000/scenario`.
2. Select "Strait of Hormuz", closure 60%, duration 21 days (defaults), click "Run
   response". Confirm the summary line reads "...cheaper than baseline." (this
   combination produced a negative premium of about -$4.6M/day in the audit — Urals
   at a discount to Brent dominates the mix). If the live news/price feed has moved
   enough that this specific combination now returns a positive premium, pick a
   different chokepoint/closure/duration until you see a negative
   `daily_premium_musd` in the API response (check via
   `curl -s -X POST localhost:8000/api/scenario/respond -H 'Content-Type: application/json' -d '{"chokepoint":"hormuz","closure_pct":60,"duration_days":21}' | python3 -c "import json,sys; print(json.load(sys.stdin)['procurement']['daily_premium_musd'])"`)
   and confirm the UI matches that sign.
3. Try "Bab el-Mandeb" at a high closure percentage (e.g. 90%) — if that combination
   yields a positive `daily_premium_musd`, confirm the summary line reads "premium
   $X M per day above baseline." for that case too. If every combination you try is
   negative, that's fine — the ternary logic for the positive branch is a direct
   mirror of the pre-existing (correct) copy, so a single negative-case check plus
   code review of the branch is sufficient confidence.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(app\)/scenario/page.tsx
git commit -m "fix: correct premium copy when replacement barrels are cheaper than baseline"
```

---

### Task 3: Freshness indicator on risk scores

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/useNetworkData.tsx`
- Create: `frontend/src/lib/time.ts`
- Modify: `frontend/src/app/(app)/war-room/page.tsx`
- Modify: `frontend/src/app/(app)/risk/page.tsx`

**Interfaces:**
- Consumes: `useNetworkData()` from Task 1 (must be complete first — this task edits
  the same context file).
- Produces: `api.newsStatus(): Promise<NewsStatus>`; `NewsStatus` type (exported from
  `api.ts`); `timeAgo(epochSeconds: number | null | undefined): string` (exported
  from `frontend/src/lib/time.ts`); `useNetworkData()`'s return value gains a
  `newsStatus: NewsStatus | null` field.

- [ ] **Step 1: Add the NewsStatus type and API call**

In `frontend/src/lib/api.ts`, add this interface near the other interfaces (after
`IntelEvent`):

```typescript
export interface NewsStatus {
  last_poll: { at: number | null; fetched: number; extracted: number; error: string | null; source?: string };
  extractor_provider: string;
  events_held: number;
}
```

In the `api` object, add a new entry (alongside `events: () => ...`):

```typescript
  newsStatus: () => get<NewsStatus>("/api/intel/news/status"),
```

- [ ] **Step 2: Verify the endpoint shape matches**

Run: `curl -s localhost:8000/api/intel/news/status | python3 -m json.tool`
Expected output shape: a JSON object with `last_poll` (itself an object containing
`at`, a Unix timestamp in seconds, plus `fetched`, `extracted`, `error`, `source`),
`extractor_provider` (string), and `events_held` (number). Confirm this matches the
`NewsStatus` interface from Step 1 field-for-field.

- [ ] **Step 3: Add timeAgo helper**

Create `frontend/src/lib/time.ts`:

```typescript
export function timeAgo(epochSeconds: number | null | undefined): string {
  if (!epochSeconds) return "unknown";
  const diff = Date.now() / 1000 - epochSeconds;
  if (diff < 5) return "just now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
```

- [ ] **Step 4: Fold newsStatus into the shared context**

In `frontend/src/lib/useNetworkData.tsx`:

Change the import line to also pull in `NewsStatus`:

```tsx
import {
  api, BacktestRow, Chokepoint, CorridorRisk, GradeInfo, IntelEvent, NewsStatus, Port,
  Refinery, Route, SprSite, Supplier,
} from "./api";
```

Add `newsStatus: NewsStatus | null;` to the `NetworkData` interface (after
`backtests: BacktestRow[];`).

Add `newsStatus: null,` to the `EMPTY` object (after `backtests: [],`).

In the initial fetch, add `api.newsStatus()` to the `Promise.all` array and destructure
it:

```tsx
    Promise.all([
      api.refineries(), api.ports(), api.spr(), api.chokepoints(), api.routes(),
      api.corridorRisk(), api.graphStats(), api.suppliers(), api.grades(),
      api.events(), api.backtests(), api.newsStatus(),
    ])
      .then(([rf, po, sp, cp, rt, rk, gs, su, gr, ev, bt, ns]) => {
        if (cancelled) return;
        setData({
          refineries: rf, ports: po, spr: sp, chokepoints: cp, routes: rt,
          risk: rk, suppliers: su, grades: gr, intel: ev, backtests: bt,
          newsStatus: ns, graphStats: { nodes: gs.nodes, edges: gs.edges },
          loaded: true, error: false,
        });
      })
```

In the 60-second poll interval, add `api.newsStatus()` alongside the existing calls:

```tsx
    const t = setInterval(() => {
      Promise.all([api.corridorRisk(), api.events(), api.newsStatus()])
        .then(([r, e, ns]) => {
          if (cancelled) return;
          setData((d) => ({ ...d, risk: r, intel: e, newsStatus: ns }));
        })
        .catch(() => {});
    }, 60_000);
```

- [ ] **Step 5: Display freshness on War Room**

In `frontend/src/app/(app)/war-room/page.tsx`, add the import:

```tsx
import { timeAgo } from "@/lib/time";
```

Find:

```tsx
          <p className="section-label px-3 pb-2 pt-1">Highest disruption risk, 30 day</p>
```

Replace with:

```tsx
          <p className="section-label px-3 pt-1">Highest disruption risk, 30 day</p>
          <p className="caption px-3 pb-2 text-[11px] text-ink-3">
            Evidence as of {timeAgo(d.newsStatus?.last_poll.at ?? null)}
          </p>
```

- [ ] **Step 6: Display freshness on Corridor Risk**

In `frontend/src/app/(app)/risk/page.tsx`, add the import (alongside the existing
`InfoTip` import):

```tsx
import { timeAgo } from "@/lib/time";
```

Find the closing of the intro paragraph:

```tsx
        parameters on the <Link href="/assumptions" className="text-accent hover:underline">Assumptions page</Link>.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-x-12 lg:grid-cols-2">
```

Replace with:

```tsx
        parameters on the <Link href="/assumptions" className="text-accent hover:underline">Assumptions page</Link>.
      </p>
      <p className="caption mt-3">Evidence as of {timeAgo(d.newsStatus?.last_poll.at ?? null)}</p>

      <div className="mt-10 grid grid-cols-1 gap-x-12 lg:grid-cols-2">
```

- [ ] **Step 7: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Live-check**

With the dev server and backend running:
1. Open `http://localhost:3000/war-room`. Confirm a caption reading something like
   "Evidence as of 2m ago" appears under "Highest disruption risk, 30 day".
2. Cross-check against the backend: `curl -s localhost:8000/api/intel/news/status |
   python3 -c "import json,sys,time; d=json.load(sys.stdin); print(round((time.time()-d['last_poll']['at'])/60,1), 'min ago')"`
   — confirm the UI caption is consistent with this value (within ~1 minute, since
   the UI polls every 60s).
3. Open `http://localhost:3000/risk`. Confirm the same "Evidence as of..." caption
   appears near the top, above the corridor cards.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/useNetworkData.tsx frontend/src/lib/time.ts frontend/src/app/\(app\)/war-room/page.tsx frontend/src/app/\(app\)/risk/page.tsx
git commit -m "feat: surface evidence freshness on war room and corridor risk pages"
```

---

## Self-Review Notes

- **Spec coverage:** Fix 1 → Task 1. Fix 2 → Task 2. Fix 3 → Task 3. All three design
  doc items have a task.
- **Placeholder scan:** no TBD/TODO; every step has literal code or an exact command.
- **Type consistency:** `NetworkData` interface (Task 1) → extended in Task 3 with
  `newsStatus`; `NewsStatus` type defined once in `api.ts` (Task 3 Step 1) and reused
  identically in `useNetworkData.tsx`. `timeAgo` signature matches its two call sites
  (`d.newsStatus?.last_poll.at ?? null`, both passing `number | null`).
- **Task independence:** Task 2 has no dependency on Tasks 1 or 3 and can run in any
  order relative to them. Task 3 depends on Task 1's file existing (`useNetworkData.tsx`)
  since it edits that same file — run Task 1 before Task 3.
