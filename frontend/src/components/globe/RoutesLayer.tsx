"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { geoToSphere, geoToFlat, GLOBE_RADIUS } from "@/lib/geo/coordinates";
import { morphProgressRef } from "./morphState";

interface RouteInput {
  id: string;
  waypoints: [number, number][];
  distanceNm: number;
  color: [number, number, number];
  opacity: number;
  tooltip: string;
}

interface RoutesLayerProps {
  routes: RouteInput[];
  onHover?: (text: string | null, x: number, y: number) => void;
}

interface PathPoint3 { sphere: THREE.Vector3; flat: THREE.Vector3; }

/** Bulge each waypoint outward (globe: radial lift, flat: +z lift) so routes read as raised corridors rather than lines painted flat on the surface — same visual idea as the old map's arcify(), adapted to 3D. */
function buildPath(waypoints: [number, number][], distanceNm: number): PathPoint3[] {
  const n = waypoints.length;
  const peakFraction = Math.min(0.16, 0.03 + distanceNm * 0.000012);
  return waypoints.map(([lon, lat], i) => {
    const t = n <= 1 ? 0 : i / (n - 1);
    const bulge = peakFraction * 4 * t * (1 - t);
    const sphere = geoToSphere(lon, lat, GLOBE_RADIUS * (1.01 + bulge));
    const flat = geoToFlat(lon, lat);
    flat.z = bulge * 0.6;
    return { sphere: new THREE.Vector3(sphere.x, sphere.y, sphere.z), flat: new THREE.Vector3(flat.x, flat.y, flat.z) };
  });
}

function pointOnPath(path: THREE.Vector3[], t: number): THREE.Vector3 {
  if (path.length === 1) return path[0];
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = path[i].distanceTo(path[i - 1]);
    segLens.push(d);
    total += d;
  }
  let target = t * total;
  for (let i = 0; i < segLens.length; i++) {
    if (target <= segLens[i] || i === segLens.length - 1) {
      const f = segLens[i] > 0 ? target / segLens[i] : 0;
      return path[i].clone().lerp(path[i + 1], f);
    }
    target -= segLens[i];
  }
  return path[path.length - 1];
}

export default function RoutesLayer({ routes, onHover }: RoutesLayerProps) {
  const lineRef = useRef<THREE.LineSegments>(null);
  const packetsRef = useRef<THREE.InstancedMesh>(null);

  const built = useMemo(() => routes.map((r) => ({ ...r, path: buildPath(r.waypoints, r.distanceNm) })), [routes]);

  const { positions, segStarts, colors } = useMemo(() => {
    const pos: number[] = [];
    const starts: number[] = [];
    const cols: number[] = [];
    for (const r of built) {
      starts.push(pos.length / 3);
      for (let i = 0; i < r.path.length - 1; i++) {
        pos.push(0, 0, 0, 0, 0, 0); // placeholder, filled in useFrame
        cols.push(r.color[0] / 255, r.color[1] / 255, r.color[2] / 255, r.color[0] / 255, r.color[1] / 255, r.color[2] / 255);
      }
    }
    return { positions: new Float32Array(pos), segStarts: starts, colors: new Float32Array(cols) };
  }, [built]);

  const geometry = useMemo(() => {
    if (positions.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions.slice(), 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, [positions, colors]);

  const totalPackets = built.length * 3;
  const PACKET_RADIUS = 0.006;

  useEffect(() => {
    if (!packetsRef.current) return;
    const c = new THREE.Color("#ffd682");
    for (let i = 0; i < totalPackets; i++) packetsRef.current.setColorAt(i, c);
    if (packetsRef.current.instanceColor) packetsRef.current.instanceColor.needsUpdate = true;
  }, [totalPackets]);

  const startRef = useRef(performance.now());
  const tmpMatrix = useMemo(() => new THREE.Matrix4(), []);

  useFrame(() => {
    const t = morphProgressRef.current;

    if (lineRef.current) {
      const position = lineRef.current.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (position) {
        let idx = 0;
        for (const r of built) {
          for (let i = 0; i < r.path.length - 1; i++) {
            for (const p of [r.path[i], r.path[i + 1]]) {
              const x = p.sphere.x + (p.flat.x - p.sphere.x) * t;
              const y = p.sphere.y + (p.flat.y - p.sphere.y) * t;
              const z = p.sphere.z + (p.flat.z - p.sphere.z) * t;
              position.array[idx++] = x; position.array[idx++] = y; position.array[idx++] = z;
            }
          }
        }
        position.needsUpdate = true;
      }
    }

    if (packetsRef.current) {
      const elapsed = (performance.now() - startRef.current) / 1000;
      let instance = 0;
      built.forEach((r, ri) => {
        const phase = (r.id.length * 37 % 100) / 100;
        [0, 0.33, 0.66].forEach((offset) => {
          const frac = (elapsed / 14 + phase + offset) % 1;
          const sphereP = pointOnPath(r.path.map((p) => p.sphere), frac);
          const flatP = pointOnPath(r.path.map((p) => p.flat), frac);
          const x = sphereP.x + (flatP.x - sphereP.x) * t;
          const y = sphereP.y + (flatP.y - sphereP.y) * t;
          const z = sphereP.z + (flatP.z - sphereP.z) * t;
          tmpMatrix.makeScale(PACKET_RADIUS, PACKET_RADIUS, PACKET_RADIUS);
          tmpMatrix.setPosition(x, y, z);
          packetsRef.current!.setMatrixAt(instance, tmpMatrix);
          instance++;
        });
      });
      packetsRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  const handlePointerMove = (e: import("@react-three/fiber").ThreeEvent<PointerEvent>) => {
    const idx = Math.floor((e.index ?? 0) / 2);
    let routeIdx = 0;
    for (let i = segStarts.length - 1; i >= 0; i--) {
      if (idx >= segStarts[i]) { routeIdx = i; break; }
    }
    onHover?.(built[routeIdx]?.tooltip ?? null, e.clientX, e.clientY);
  };

  if (!geometry) return null;

  return (
    <>
      <lineSegments
        ref={lineRef}
        geometry={geometry}
        renderOrder={4}
        onPointerMove={handlePointerMove}
        onPointerOut={() => onHover?.(null, 0, 0)}
      >
        <lineBasicMaterial vertexColors transparent opacity={0.75} toneMapped={false} />
      </lineSegments>
      {totalPackets > 0 && (
        <instancedMesh ref={packetsRef} args={[null as unknown as THREE.BufferGeometry, null as unknown as THREE.Material, totalPackets]} renderOrder={5}>
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial vertexColors toneMapped={false} />
        </instancedMesh>
      )}
    </>
  );
}
