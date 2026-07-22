"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  api, BacktestRow, Chokepoint, CorridorRisk, GradeInfo, IntelEvent, NewsStatus, Port,
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
  newsStatus: NewsStatus | null;
  graphStats: { nodes: number; edges: number } | null;
  loaded: boolean;
  error: boolean;
}

const EMPTY: NetworkData = {
  refineries: [], ports: [], spr: [], chokepoints: [], routes: [], suppliers: [],
  grades: {}, risk: [], intel: [], backtests: [], newsStatus: null, graphStats: null,
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
      .catch(() => !cancelled && setData((d) => ({ ...d, error: true })));

    const t = setInterval(() => {
      Promise.all([api.corridorRisk(), api.events(), api.newsStatus()])
        .then(([r, e, ns]) => {
          if (cancelled) return;
          setData((d) => ({ ...d, risk: r, intel: e, newsStatus: ns }));
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
