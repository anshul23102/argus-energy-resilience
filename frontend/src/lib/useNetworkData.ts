"use client";

import { useEffect, useState } from "react";
import {
  api, BacktestRow, Chokepoint, CorridorRisk, GradeInfo, IntelEvent, Port,
  Refinery, Route, SprSite, Supplier,
} from "./api";

export function useNetworkData() {
  const [refineries, setRefineries] = useState<Refinery[]>([]);
  const [ports, setPorts] = useState<Port[]>([]);
  const [spr, setSpr] = useState<SprSite[]>([]);
  const [chokepoints, setChokepoints] = useState<Chokepoint[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [grades, setGrades] = useState<Record<string, GradeInfo>>({});
  const [risk, setRisk] = useState<CorridorRisk[]>([]);
  const [intel, setIntel] = useState<IntelEvent[]>([]);
  const [backtests, setBacktests] = useState<BacktestRow[]>([]);
  const [graphStats, setGraphStats] = useState<{ nodes: number; edges: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.refineries(), api.ports(), api.spr(), api.chokepoints(), api.routes(),
      api.corridorRisk(), api.graphStats(), api.suppliers(), api.grades(),
      api.events(), api.backtests(),
    ])
      .then(([rf, po, sp, cp, rt, rk, gs, su, gr, ev, bt]) => {
        if (cancelled) return;
        setRefineries(rf); setPorts(po); setSpr(sp); setChokepoints(cp); setRoutes(rt);
        setRisk(rk); setSuppliers(su); setGrades(gr); setIntel(ev); setBacktests(bt);
        setGraphStats({ nodes: gs.nodes, edges: gs.edges });
        setLoaded(true);
      })
      .catch(() => !cancelled && setError(true));

    const t = setInterval(() => {
      api.corridorRisk().then((r) => !cancelled && setRisk(r)).catch(() => {});
      api.events().then((e) => !cancelled && setIntel(e)).catch(() => {});
    }, 60_000);

    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return { refineries, ports, spr, chokepoints, routes, suppliers, grades, risk, intel, backtests, graphStats, loaded, error };
}
