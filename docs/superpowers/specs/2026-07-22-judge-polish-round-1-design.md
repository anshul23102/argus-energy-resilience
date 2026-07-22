# Judge-facing polish, round 1 — design

Three fixes found by running the live app end to end (backend + frontend, real news
poll, a live scenario run), in priority order.

## 1. Blank-page flash on navigation

**Problem:** `useNetworkData` (`frontend/src/lib/useNetworkData.ts`) re-fetches all
~11 endpoints from scratch on every route mount, with no shared cache and no loading
skeleton. Clicking War Room → Corridor Risk → Scenario → Network in quick succession
(what a judge does) shows each page fully empty for 1–3 seconds before content pops
in. Reproduced live.

**Fix:** Convert `useNetworkData` into a React Context provider mounted once in
`frontend/src/app/(app)/layout.tsx`. That layout wraps `AppShell` and persists across
client-side navigation within the `(app)` route group — Next.js does not remount it
per page — so the fetch-and-poll effect runs once per session instead of once per
page visit.

- `frontend/src/lib/useNetworkData.tsx` (renamed from `.ts` for JSX): export
  `NetworkDataProvider` (does the existing Promise.all fetch + 60s risk/events poll,
  holds state) and `useNetworkData()` (now `useContext` instead of its own fetch
  effect). Return shape is unchanged, so no page component needs to change.
- `frontend/src/app/(app)/layout.tsx`: wrap `<AppShell>` in `<NetworkDataProvider>`.
- `frontend/src/components/AppShell.tsx`: while the provider's `loaded` is false on
  first mount, render a minimal centered loading state in `<main>` instead of the
  page content, so the one unavoidable initial fetch doesn't flash blank content
  either. Subsequent navigations never hit this state since data is already loaded.

## 2. Negative "premium" copy

**Problem:** `scenario/page.tsx`'s order-sheet summary reads *"premium $-4.6M per day
above baseline"* when the LP picks a net-discounted grade mix (e.g. Urals). The
number (`procurement.daily_premium_musd`) is correct; the fixed sentence reads as
broken math when it goes negative.

**Fix:** In `scenario/page.tsx`, branch the sentence on sign:
- `>= 0`: "premium $X M per day above baseline" (unchanged).
- `< 0`: "$|X| M per day cheaper than baseline".

No backend change — `procurement.py`'s `daily_premium_musd` semantics are correct as
is.

## 3. No freshness indicator on risk scores

**Problem:** Right after backend startup (or between the 60s risk polls), corridor
risk numbers can be a stale prior-only value with no signal they're about to change.
Reproduced live: Hormuz jumped 0.3% → 4.2% with no visual indication of when that
happened or would happen next.

**Fix:** Surface the backend's own poll timestamp, which is the true signal of
evidence freshness (not client fetch time, which would misleadingly show "just now"
even if the backend hasn't polled recently):

- `frontend/src/lib/api.ts`: add `newsStatus()` hitting the existing
  `/api/intel/news/status` endpoint (already returns `last_poll.at`).
- `useNetworkData.tsx`: fetch `newsStatus` in the initial `Promise.all` and in the
  existing 60s poll tick alongside risk/events; expose it in the context value.
- `war-room/page.tsx`: small caption under "Highest disruption risk, 30 day" —
  "Evidence as of {relative time}".
- `risk/page.tsx`: same caption near the top of the corridor list.
- A small shared `timeAgo(epochSeconds)` helper (e.g. in `lib/`) formats both.

## Out of scope

Anything from the "post-hackathon hardening" or "new capability" tracks discussed
separately — this round is judge-facing polish only, scoped for same-day turnaround.
