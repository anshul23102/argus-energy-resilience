"use client";

import { useEffect, useMemo, useRef } from "react";
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
const tmpColor = new THREE.Color();
const tmpVec = new THREE.Vector3();

/** One instanced-mesh marker layer (chokepoints, refineries, ports, SPR sites, or supplier terminals). Positions morph globe<->flat every frame from morphProgressRef; picking uses InstancedMesh's per-instance raycasting with a front-face filter so a marker on the globe's far side can't be hovered/clicked through. */
export default function MarkersLayer({ points, onHover, onClick, interactive = true }: MarkersLayerProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();

  const positions = useMemo(
    () => points.map((p) => ({ sphere: geoToSphere(p.lon, p.lat, GLOBE_RADIUS * 1.01), flat: geoToFlat(p.lon, p.lat) })),
    [points],
  );

  useEffect(() => {
    if (!meshRef.current) return;
    points.forEach((p, i) => {
      tmpColor.setRGB(p.color[0] / 255, p.color[1] / 255, p.color[2] / 255);
      if (p.selected) tmpColor.lerp(new THREE.Color("#ebb946"), 0.6);
      meshRef.current!.setColorAt(i, tmpColor);
    });
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [points]);

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

  if (points.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[null as unknown as THREE.BufferGeometry, null as unknown as THREE.Material, points.length]}
      onPointerMove={interactive ? handlePointerMove : undefined}
      onPointerOut={interactive ? handlePointerOut : undefined}
      onClick={interactive ? handleClick : undefined}
      renderOrder={3}
    >
      <sphereGeometry args={[1, 12, 12]} />
      <meshBasicMaterial vertexColors toneMapped={false} />
    </instancedMesh>
  );
}
