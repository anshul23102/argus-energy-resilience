"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { PathLayer, ScatterplotLayer, TextLayer } from "deck.gl";
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

// Bulge each route's waypoints upward so paths read as flight corridors above
// the globe once the map is pitched in 3D, rather than flat lines painted on
// the surface. Peak altitude scales with route length; z is metres.
function arcify(waypoints: [number, number][], distanceNm: number): [number, number, number][] {
  const n = waypoints.length;
  const peak = Math.min(160000, 25000 + distanceNm * 12);
  return waypoints.map((p, i) => {
    const t = n <= 1 ? 0 : i / (n - 1);
    const z = peak * 4 * t * (1 - t);
    return [p[0], p[1], z];
  });
}

export default function WarRoomMap({
  refineries, ports, spr, chokepoints, routes, suppliers, risk,
  selection, onSelect, interactive = true, initialPitch = 45, initialZoom = 3.3,
  center = [58, 20],
}: {
  refineries: Refinery[]; ports: Port[]; spr: SprSite[]; chokepoints: Chokepoint[];
  routes: Route[]; suppliers: Supplier[]; risk: CorridorRisk[];
  selection?: Selection | null; onSelect?: (s: Selection | null) => void;
  interactive?: boolean; initialPitch?: number; initialZoom?: number;
  center?: [number, number];
}) {
  const mapDiv = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const [ready, setReady] = useState(false);

  const terminals: TerminalPoint[] = useMemo(
    () => suppliers.flatMap((s) => s.export_terminals.map((t) => ({ ...t, supplierId: s.id, supplierName: s.name }))),
    [suppliers],
  );

  useEffect(() => {
    if (!mapDiv.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapDiv.current,
      style: {
        version: 8,
        sources: {
          land: { type: "geojson", data: "/land.geojson" },
          terrain: {
            type: "raster-dem",
            tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
            tileSize: 256,
            encoding: "terrarium",
            maxzoom: 13,
          },
        },
        layers: [
          { id: "ocean", type: "background", paint: { "background-color": "#0a1220" } },
          { id: "land", type: "fill", source: "land", paint: { "fill-color": "#141f30" } },
          { id: "coast", type: "line", source: "land", paint: { "line-color": "#33465f", "line-width": 0.7 } },
        ],
        sky: {
          "sky-color": "#0d1626",
          "sky-horizon-blend": 0.5,
          "horizon-color": "#1a2b42",
          "horizon-fog-blend": 0.6,
          "fog-color": "#0a1220",
          "fog-ground-blend": 0.4,
        } as maplibregl.SkySpecification,
      },
      center,
      zoom: initialZoom,
      pitch: initialPitch,
      bearing: -8,
      attributionControl: false,
      dragRotate: interactive,
      dragPan: interactive,
      scrollZoom: interactive,
      touchZoomRotate: interactive,
      doubleClickZoom: interactive,
      keyboard: interactive,
    });
    mapRef.current = map;

    const overlay = new MapboxOverlay({ layers: [] });
    map.addControl(overlay);
    overlayRef.current = overlay;
    // The deck.gl overlay control is functional the instant it's added; it
    // does not need to wait on maplibre's own tile-loading lifecycle. Gating
    // `ready` on map "load" left the picking layers empty indefinitely under
    // globe projection, since maplibre's loaded()/"load" wait on outstanding
    // tile requests that can churn continuously at low zoom on a globe.
    setReady(true);

    // Deliberately mercator, not globe: deck.gl-mapbox's MapboxOverlay syncs
    // its picking viewport to maplibre's camera assuming a standard mercator
    // projection. Under globe projection the two drift apart as the camera
    // rotates and tilts, so a rendered node's true screen position and its
    // pickable position under the cursor silently diverge; every hover/click
    // target then misses. Terrain, pitch and sky still deliver a real 3D
    // scene without that desync.
    //
    // 3D terrain needs sources fully registered, which the "load" event does
    // not guarantee (setTerrain throws "Style is not done loading" if called
    // too early); "idle" does guarantee it, so terrain is applied there,
    // independently, best-effort.
    map.on("load", () => {
      map.resize();
    });
    map.once("idle", () => {
      try {
        map.setTerrain({ source: "terrain", exaggeration: 1.4 });
      } catch (e) {
        console.warn("3D terrain unavailable, falling back to flat map:", e);
      }
    });

    // luma.gl is meant to own drawing-buffer sizing for deck's overlay canvas via
    // its own resize observation, but in practice that canvas's pixel-buffer
    // attributes (canvas.width/height, the actual WebGL resolution) can get stuck
    // at the browser's 300x150 default while its CSS box correctly fills the
    // container — visually the map looks fine (the buffer is just upscaled), but
    // every deck.gl pick/hover coordinate is computed against that tiny stale
    // buffer, so it silently resolves to the wrong object everywhere off the top
    // left corner. Force both canvases' real pixel buffers to track the actual
    // container size directly, rather than trusting the libraries' own observers.
    const syncCanvasBuffers = () => {
      if (!mapDiv.current) return;
      map.resize();
      const dpr = window.devicePixelRatio || 1;
      const rect = mapDiv.current.getBoundingClientRect();
      const deckCanvas = mapDiv.current.querySelector<HTMLCanvasElement>("#deckgl-overlay");
      if (!deckCanvas) return;
      const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
      if (deckCanvas.width === w && deckCanvas.height === h) return;
      deckCanvas.width = w;
      deckCanvas.height = h;
      // Setting the canvas's own width/height attributes doesn't notify deck: its
      // luma.gl canvas context caches its own CSS/device-pixel size from a resize
      // observer that, in this overlay-control setup, never fires again after the
      // first (pre-layout) measurement. Deck's picking math runs entirely off that
      // stale cache, so without this every hover/click resolves against a
      // phantom 300x150 buffer regardless of what's actually visible on screen.
      // Reach into deck's internals directly to force the cache current — private
      // API, guarded so a future deck.gl version that removes it fails silently
      // rather than crashing the map.
      type InternalCanvasContext = {
        cssWidth: number; cssHeight: number;
        devicePixelWidth: number; devicePixelHeight: number; devicePixelRatio: number;
      };
      type InternalDeck = { _canvasContext?: InternalCanvasContext; _updateCanvasSize?: () => void };
      const deck = (overlayRef.current as unknown as { _deck?: InternalDeck })?._deck;
      const ctx = deck?._canvasContext;
      if (ctx) {
        ctx.cssWidth = rect.width;
        ctx.cssHeight = rect.height;
        ctx.devicePixelWidth = w;
        ctx.devicePixelHeight = h;
        ctx.devicePixelRatio = dpr;
      }
      deck?._updateCanvasSize?.();
    };
    const ro = new ResizeObserver(syncCanvasBuffers);
    ro.observe(mapDiv.current);
    map.once("idle", syncCanvasBuffers);
    // Layout can still settle a frame or two after mount even once the map
    // reports idle; re-check shortly after as a final safety net.
    const settleTimer = setTimeout(syncCanvasBuffers, 500);
    map.on("error", (e) => console.error("maplibre:", e.error?.message ?? e));

    if (interactive) {
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    }

    return () => {
      clearTimeout(settleTimer); ro.disconnect(); map.remove();
      mapRef.current = null; overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!overlayRef.current || !ready) return;
    const riskByCp = Object.fromEntries(risk.map((r) => [r.chokepoint, r.posterior_horizon_prob]));
    const selectedTerminals = selection?.kind === "supplier"
      ? new Set(selection.supplier.export_terminals.map((t) => t.id)) : null;

    overlayRef.current.setProps({ layers: [
      new PathLayer<Route>({
        id: "routes",
        data: routes,
        getPath: (d) => arcify(d.waypoints, d.distance_nm),
        getColor: (d) => {
          if (selectedTerminals) {
            const on = d.from_terminals.some((t) => selectedTerminals.has(t));
            return on ? [235, 185, 70, 235] : [110, 128, 156, 22];
          }
          const worst = Math.max(0, ...d.chokepoints.map((c) => riskByCp[c] ?? 0));
          const [r, g, b] = RISK_RGB[riskBand(worst)];
          return [r, g, b, 130];
        },
        getWidth: (d) => (selectedTerminals && d.from_terminals.some((t) => selectedTerminals!.has(t)) ? 3 : 1.6),
        widthUnits: "pixels",
        pickable: interactive,
        updateTriggers: { getColor: [risk, selection], getWidth: [selection] },
        onHover: (i) => setHover(i.object ? { x: i.x, y: i.y, text: `${i.object.name} · ${i.object.distance_nm.toLocaleString()} nm · ${i.object.voyage_days}d` } : null),
      }),
      new ScatterplotLayer<Chokepoint>({
        id: "chokepoints",
        data: chokepoints.filter((c) => c.daily_oil_flow_mbd),
        getPosition: (d) => [d.lon, d.lat],
        getRadius: (d) => 32000 + d.supply_at_risk_pct * 5500,
        radiusMinPixels: 8, radiusMaxPixels: 32,
        getFillColor: (d) => { const [r, g, b] = RISK_RGB[riskBand(riskByCp[d.id] ?? 0)]; return [r, g, b, 165]; },
        stroked: true, getLineColor: [255, 255, 255, 210], getLineWidth: 1.5, lineWidthUnits: "pixels",
        pickable: interactive,
        updateTriggers: { getFillColor: [risk] },
        onHover: (i) => setHover(i.object ? { x: i.x, y: i.y, text: `${i.object.name} · ${i.object.supply_at_risk_pct}% of imports exposed` } : null),
        onClick: (i) => i.object && onSelect?.({ kind: "chokepoint", chokepoint: i.object }),
      }),
      new ScatterplotLayer<TerminalPoint>({
        id: "terminals",
        data: terminals,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: 24000, radiusMinPixels: 5, radiusMaxPixels: 9,
        getFillColor: (d) => (selection?.kind === "supplier" && selection.supplier.id === d.supplierId ? [235, 185, 70, 240] : [156, 172, 196, 200]),
        stroked: true, getLineColor: [10, 16, 26, 255], getLineWidth: 1, lineWidthUnits: "pixels",
        pickable: interactive,
        updateTriggers: { getFillColor: [selection] },
        onHover: (i) => setHover(i.object ? { x: i.x, y: i.y, text: `${i.object.name}, ${i.object.supplierName}` } : null),
        onClick: (i) => {
          const s = suppliers.find((x) => x.id === i.object?.supplierId);
          if (s) onSelect?.({ kind: "supplier", supplier: s });
        },
      }),
      new ScatterplotLayer<Refinery>({
        id: "refineries",
        data: refineries,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: (d) => 10000 + d.capacity_mmtpa * 1600, radiusMinPixels: 4, radiusMaxPixels: 18,
        getFillColor: (d) => (selection?.kind === "refinery" && selection.refinery.id === d.id ? [235, 185, 70, 240] : [104, 168, 245, 205]),
        stroked: true, getLineColor: [16, 32, 64, 255], getLineWidth: 1, lineWidthUnits: "pixels",
        pickable: interactive,
        updateTriggers: { getFillColor: [selection] },
        onHover: (i) => setHover(i.object ? { x: i.x, y: i.y, text: `${i.object.name} · ${i.object.capacity_mmtpa} MMTPA` } : null),
        onClick: (i) => i.object && onSelect?.({ kind: "refinery", refinery: i.object }),
      }),
      new ScatterplotLayer<Port>({
        id: "ports", data: ports, getPosition: (d) => [d.lon, d.lat],
        getRadius: 7000, radiusMinPixels: 3, getFillColor: [212, 130, 240, 190],
        pickable: interactive,
        onHover: (i) => setHover(i.object ? { x: i.x, y: i.y, text: `${i.object.name}${i.object.handles_vlcc ? " · VLCC capable" : ""}` } : null),
      }),
      new ScatterplotLayer<SprSite>({
        id: "spr", data: spr, getPosition: (d) => [d.lon, d.lat],
        getRadius: 11000, radiusMinPixels: 4, getFillColor: [244, 196, 60, 220],
        stroked: true, getLineColor: [90, 65, 0, 255], getLineWidth: 1,
        pickable: interactive,
        onHover: (i) => setHover(i.object ? { x: i.x, y: i.y, text: `${i.object.name}, strategic reserve · ${i.object.capacity_mmt} MMT` } : null),
      }),
      new TextLayer<Chokepoint>({
        id: "cp-labels",
        data: chokepoints.filter((c) => c.daily_oil_flow_mbd),
        getPosition: (d) => [d.lon, d.lat],
        getText: (d) => d.name.replace("Strait of ", "").replace(" Canal / SUMED", ""),
        getSize: 12, getColor: [226, 232, 240, 230], getPixelOffset: [0, -20],
        fontFamily: "var(--font-inter), sans-serif", fontWeight: 600,
      }),
    ]});
  }, [refineries, ports, spr, chokepoints, routes, risk, terminals, suppliers, selection, ready, interactive, onSelect]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapDiv} className="h-full w-full" />
      {hover && (
        <div
          className="pointer-events-none absolute z-30 rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-[12px] text-ink shadow-lg"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          {hover.text}
        </div>
      )}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg">
          <span className="caption">Loading network map</span>
        </div>
      )}
    </div>
  );
}
