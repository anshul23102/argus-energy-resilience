"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import gsap from "gsap";
import LandMesh from "./LandMesh";
import CountryBorders from "./CountryBorders";
import MarkersLayer, { MarkerPoint } from "./MarkersLayer";
import RoutesLayer from "./RoutesLayer";
import { morphProgressRef } from "./morphState";
import { geoToSphere } from "@/lib/geo/coordinates";
import {
  Chokepoint, CorridorRisk, Port, Refinery, Route, SprSite, Supplier, Terminal,
} from "@/lib/api";

const RISK_RGB: Record<string, [number, number, number]> = {
  low: [82, 216, 166], elevated: [235, 185, 70], high: [232, 92, 78],
};

export function riskBand(p: number): "low" | "elevated" | "high" {
  if (p >= 0.15) return "high";
  if (p >= 0.05) return "elevated";
  return "low";
}

export type Selection =
  | { kind: "supplier"; supplier: Supplier }
  | { kind: "refinery"; refinery: Refinery }
  | { kind: "chokepoint"; chokepoint: Chokepoint };

interface TerminalPoint extends Terminal { supplierId: string; supplierName: string; }

interface GlobeMapProps {
  refineries: Refinery[]; ports: Port[]; spr: SprSite[]; chokepoints: Chokepoint[];
  routes: Route[]; suppliers: Supplier[]; risk: CorridorRisk[];
  selection?: Selection | null; onSelect?: (s: Selection | null) => void;
  interactive?: boolean; center?: [number, number];
}

function initialCameraPosition(center: [number, number], distance = 2.4): [number, number, number] {
  const p = geoToSphere(center[0], center[1], 1);
  const len = Math.hypot(p.x, p.y, p.z) || 1;
  return [(p.x / len) * distance, (p.y / len) * distance, (p.z / len) * distance];
}

// The flat map lives in a totally different local coordinate range (a small
// ~2x1 equirectangular rectangle) than the globe (a unit sphere), so a
// camera position tuned for one badly frames the other — refit on toggle.
function CameraRig({ isFlat, globePosition }: { isFlat: boolean; globePosition: [number, number, number] }) {
  const { camera } = useThree();
  useEffect(() => {
    const target = isFlat ? { x: 0, y: 0, z: 2.6 } : { x: globePosition[0], y: globePosition[1], z: globePosition[2] };
    gsap.to(camera.position, { ...target, duration: 1.1, ease: "power2.inOut" });
  }, [isFlat, camera, globePosition]);
  return null;
}

export default function GlobeMap({
  refineries, ports, spr, chokepoints, routes, suppliers, risk,
  selection, onSelect, interactive = true, center = [58, 20],
}: GlobeMapProps) {
  const cameraPosition = useMemo(() => initialCameraPosition(center), [center]);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const [isFlat, setIsFlat] = useState(false);

  const terminals: TerminalPoint[] = useMemo(
    () => suppliers.flatMap((s) => s.export_terminals.map((t) => ({ ...t, supplierId: s.id, supplierName: s.name }))),
    [suppliers],
  );
  const riskByCp = useMemo(() => Object.fromEntries(risk.map((r) => [r.chokepoint, r.posterior_horizon_prob])), [risk]);
  const selectedTerminalIds = selection?.kind === "supplier"
    ? new Set(selection.supplier.export_terminals.map((t) => t.id)) : null;

  const chokepointMarkers: MarkerPoint[] = useMemo(() => chokepoints
    .filter((c) => c.daily_oil_flow_mbd)
    .map((c) => {
      const [r, g, b] = RISK_RGB[riskBand(riskByCp[c.id] ?? 0)];
      return {
        id: c.id, lon: c.lon, lat: c.lat,
        radius: 0.02 + c.supply_at_risk_pct * 0.0009,
        color: [r, g, b], tooltip: `${c.name} · ${c.supply_at_risk_pct}% of imports exposed`,
        selected: selection?.kind === "chokepoint" && selection.chokepoint.id === c.id,
      };
    }), [chokepoints, riskByCp, selection]);

  const refineryMarkers: MarkerPoint[] = useMemo(() => refineries.map((rf) => ({
    id: rf.id, lon: rf.lon, lat: rf.lat,
    radius: 0.011 + rf.capacity_mmtpa * 0.0004,
    color: [104, 168, 245] as [number, number, number],
    tooltip: `${rf.name} · ${rf.capacity_mmtpa} MMTPA`,
    selected: selection?.kind === "refinery" && selection.refinery.id === rf.id,
  })), [refineries, selection]);

  const portMarkers: MarkerPoint[] = useMemo(() => ports.map((p) => ({
    id: p.id, lon: p.lon, lat: p.lat, radius: 0.009,
    color: [212, 130, 240] as [number, number, number],
    tooltip: `${p.name}${p.handles_vlcc ? " · VLCC capable" : ""}`,
  })), [ports]);

  const sprMarkers: MarkerPoint[] = useMemo(() => spr.map((s) => ({
    id: s.id, lon: s.lon, lat: s.lat, radius: 0.012,
    color: [244, 196, 60] as [number, number, number],
    tooltip: `${s.name}, strategic reserve · ${s.capacity_mmt} MMT`,
  })), [spr]);

  const terminalMarkers: MarkerPoint[] = useMemo(() => terminals.map((t) => ({
    id: t.id, lon: t.lon, lat: t.lat, radius: 0.008,
    color: (selectedTerminalIds ? [235, 185, 70] : [156, 172, 196]) as [number, number, number],
    tooltip: `${t.name}, ${t.supplierName}`,
    selected: selectedTerminalIds?.has(t.id),
  })), [terminals, selectedTerminalIds]);

  const routeInputs = useMemo(() => routes.map((r) => {
    const onSelectedPath = selectedTerminalIds ? r.from_terminals.some((t) => selectedTerminalIds.has(t)) : false;
    let color: [number, number, number] = [110, 128, 156];
    let opacity = 0.5;
    if (selectedTerminalIds) {
      color = onSelectedPath ? [235, 185, 70] : [110, 128, 156];
      opacity = onSelectedPath ? 0.9 : 0.12;
    } else {
      const worst = Math.max(0, ...r.chokepoints.map((c) => riskByCp[c] ?? 0));
      color = RISK_RGB[riskBand(worst)];
      opacity = 0.55;
    }
    return {
      id: r.id, waypoints: r.waypoints, distanceNm: r.distance_nm, color, opacity,
      tooltip: `${r.name} · ${r.distance_nm.toLocaleString()} nm · ${r.voyage_days}d`,
    };
  }), [routes, selectedTerminalIds, riskByCp]);

  const handleHover = (text: string | null, x: number, y: number) => {
    setHover(text ? { x, y, text } : null);
  };

  const toggleView = () => {
    const target = isFlat ? 0 : 1;
    gsap.to(morphProgressRef, { current: target, duration: 1.1, ease: "power2.inOut" });
    setIsFlat(!isFlat);
  };

  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{ position: cameraPosition, fov: 45, near: 0.1, far: 100 }}
        gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
        dpr={[1, 1.5]}
        style={{ background: "#050b16" }}
      >
        <CameraRig isFlat={isFlat} globePosition={cameraPosition} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[3, 4, 5]} intensity={1.1} />
        <OrbitControls
          makeDefault
          enabled={interactive}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          minDistance={1.3}
          maxDistance={5}
          rotateSpeed={0.5}
          zoomSpeed={0.7}
        />
        <LandMesh />
        <CountryBorders />
        <RoutesLayer routes={routeInputs} onHover={handleHover} />
        <MarkersLayer points={portMarkers} onHover={handleHover} interactive={interactive} />
        <MarkersLayer points={sprMarkers} onHover={handleHover} interactive={interactive} />
        <MarkersLayer
          points={terminalMarkers} onHover={handleHover} interactive={interactive}
          onClick={(id) => {
            const t = terminals.find((x) => x.id === id);
            const s = t && suppliers.find((x) => x.id === t.supplierId);
            if (s) onSelect?.({ kind: "supplier", supplier: s });
          }}
        />
        <MarkersLayer
          points={refineryMarkers} onHover={handleHover} interactive={interactive}
          onClick={(id) => {
            const rf = refineries.find((x) => x.id === id);
            if (rf) onSelect?.({ kind: "refinery", refinery: rf });
          }}
        />
        <MarkersLayer
          points={chokepointMarkers} onHover={handleHover} interactive={interactive}
          onClick={(id) => {
            const cp = chokepoints.find((x) => x.id === id);
            if (cp) onSelect?.({ kind: "chokepoint", chokepoint: cp });
          }}
        />
      </Canvas>

      {hover && (
        <div
          className="pointer-events-none absolute z-30 rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-[12px] text-ink shadow-lg"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          {hover.text}
        </div>
      )}

      {interactive && (
        <button
          onClick={toggleView}
          className="panel-glass absolute bottom-5 right-20 z-20 rounded-md px-4 py-2 text-[13px] font-medium text-ink-2 transition-colors duration-150 hover:text-ink"
        >
          {isFlat ? "Globe view" : "Flat view"}
        </button>
      )}
    </div>
  );
}
