"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { geoToSphere, geoToFlat, GLOBE_RADIUS } from "@/lib/geo/coordinates";
import { morphProgressRef } from "./morphState";

export interface MarkerPoint {
  id: string;
  lon: number;
  lat: number;
  radius: number;
  color: [number, number, number];
  tooltip: string;
  selected?: boolean;
}

interface MarkersLayerProps {
  points: MarkerPoint[];
  onHover?: (text: string | null, x: number, y: number) => void;
  onClick?: (id: string) => void;
  interactive?: boolean;
}

const tmpMatrix = new THREE.Matrix4();
const tmpVec = new THREE.Vector3();

function selectedRgb([r, g, b]: [number, number, number]): [number, number, number] {
  return [
    Math.round(r * 0.4 + 235 * 0.6),
    Math.round(g * 0.4 + 185 * 0.6),
    Math.round(b * 0.4 + 70 * 0.6),
  ];
}

interface MarkerGroupProps {
  color: string;
  points: MarkerPoint[];
  onHover?: (text: string | null, x: number, y: number) => void;
  onClick?: (id: string) => void;
  interactive?: boolean;
}

/** One color's worth of markers as a single InstancedMesh. A flat `meshBasicMaterial
 * color` (not per-instance vertex colors) is the whole point here — it's a plain,
 * always-correct material property with no InstancedMesh.instanceColor timing or
 * support dependency, unlike the per-instance vertexColors approach this replaced. */
function MarkerGroup({ color, points, onHover, onClick, interactive = true }: MarkerGroupProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();

  const positions = useMemo(
    () => points.map((p) => ({ sphere: geoToSphere(p.lon, p.lat, GLOBE_RADIUS * 1.01), flat: geoToFlat(p.lon, p.lat) })),
    [points],
  );

  useFrame(() => {
    if (!meshRef.current) return;
    const t = morphProgressRef.current;
    points.forEach((p, i) => {
      const pos = positions[i];
      const x = pos.sphere.x + (pos.flat.x - pos.sphere.x) * t;
      const y = pos.sphere.y + (pos.flat.y - pos.sphere.y) * t;
      const z = pos.sphere.z + (pos.flat.z - pos.sphere.z) * t + (t > 0.5 ? 0.003 : 0);
      tmpMatrix.makeScale(p.radius, p.radius, p.radius);
      tmpMatrix.setPosition(x, y, z);
      meshRef.current!.setMatrixAt(i, tmpMatrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  const isFrontFacing = (instanceId: number) => {
    if (morphProgressRef.current > 0.5) return true; // flat mode: everything faces the camera
    const pos = positions[instanceId];
    tmpVec.set(pos.sphere.x, pos.sphere.y, pos.sphere.z).normalize();
    const toCamera = camera.position.clone().normalize();
    return tmpVec.dot(toCamera) > 0.15;
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (e.instanceId === undefined) return;
    if (!isFrontFacing(e.instanceId)) { onHover?.(null, 0, 0); return; }
    onHover?.(points[e.instanceId]?.tooltip ?? null, e.clientX, e.clientY);
    document.body.style.cursor = "pointer";
  };
  const handlePointerOut = () => { onHover?.(null, 0, 0); document.body.style.cursor = "auto"; };
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.instanceId === undefined || !isFrontFacing(e.instanceId)) return;
    onClick?.(points[e.instanceId]?.id);
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, points.length]}
      onPointerMove={interactive ? handlePointerMove : undefined}
      onPointerOut={interactive ? handlePointerOut : undefined}
      onClick={interactive ? handleClick : undefined}
      renderOrder={3}
    >
      <sphereGeometry args={[1, 12, 12]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </instancedMesh>
  );
}

/** One marker layer (chokepoints, refineries, ports, SPR sites, or supplier terminals),
 * split into one MarkerGroup per distinct color — cheap, since each layer only ever has
 * a handful of colors (a few risk bands, or one fixed color). */
export default function MarkersLayer({ points, onHover, onClick, interactive = true }: MarkersLayerProps) {
  const groups = useMemo(() => {
    const byKey = new Map<string, { color: string; points: MarkerPoint[] }>();
    for (const p of points) {
      const rgb = p.selected ? selectedRgb(p.color) : p.color;
      const key = rgb.join(",");
      let group = byKey.get(key);
      if (!group) {
        group = { color: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`, points: [] };
        byKey.set(key, group);
      }
      group.points.push(p);
    }
    return Array.from(byKey.entries()).map(([key, g]) => ({ key, ...g }));
  }, [points]);

  return (
    <>
      {groups.map((g) => (
        <MarkerGroup
          key={g.key}
          color={g.color}
          points={g.points}
          onHover={onHover}
          onClick={onClick}
          interactive={interactive}
        />
      ))}
    </>
  );
}
