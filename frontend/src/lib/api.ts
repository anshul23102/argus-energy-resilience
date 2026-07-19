const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

export interface Refinery {
  id: string; name: string; operator: string; state: string;
  lat: number; lon: number; capacity_mmtpa: number; coastal: boolean;
  nelson_complexity: number; sulfur_tolerance: string; crude_diet: string[];
}
export interface Port { id: string; name: string; lat: number; lon: number; coast: string; handles_vlcc: boolean; }
export interface SprSite { id: string; name: string; lat: number; lon: number; capacity_mmt: number; }
export interface Chokepoint {
  id: string; name: string; lat: number; lon: number;
  daily_oil_flow_mbd: number | null; supply_at_risk_pct: number; alternatives: string;
}
export interface Route {
  id: string; name: string; chokepoints: string[]; distance_nm: number;
  voyage_days: number; waypoints: [number, number][];
}
export interface CorridorRisk {
  chokepoint: string; horizon_days: number; prior_annual_pct: number;
  prior_horizon_prob: number; posterior_horizon_prob: number;
  drivers: { summary: string; severity: string; source: string; age_days: number; likelihood_ratio_applied: number }[];
}

export interface Quote { price: number; change_pct: number; stale: boolean; }
export interface Prices { as_of: number; brent: Quote; wti: Quote; usd_inr: Quote; }
export interface IntelEvent { corridor: string; severity: string; summary: string; source: string; timestamp: number; corroborations: number; }
export interface BacktestRow { id: string; name: string; corridor: string; alert_date: string | null; peak_impact_date: string; lead_time_days: number | null; }

export const api = {
  prices: () => get<Prices>("/api/intel/prices"),
  events: () => get<IntelEvent[]>("/api/intel/events"),
  backtests: () => get<BacktestRow[]>("/api/intel/backtest"),
  refineries: () => get<Refinery[]>("/api/assets/refineries"),
  ports: () => get<Port[]>("/api/assets/ports"),
  spr: () => get<SprSite[]>("/api/assets/spr"),
  chokepoints: () => get<Chokepoint[]>("/api/assets/chokepoints"),
  routes: () => get<Route[]>("/api/assets/routes"),
  corridorRisk: () => get<CorridorRisk[]>("/api/risk/corridors"),
  graphStats: () => get<{ nodes: number; edges: number; by_kind: Record<string, number> }>("/api/assets/graph/stats"),
};
