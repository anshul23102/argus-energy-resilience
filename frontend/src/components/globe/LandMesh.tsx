"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { geoJsonToMorphable, createMorphableBufferGeometry } from "@/lib/geo/morphing";
import { morphProgressRef } from "./morphState";
import "./MorphMaterial";

interface LandFeature { geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown }; }
interface LandGeoJSON { features: LandFeature[]; }

/** All of ARGUS's landmass (public/land.geojson, already used by the old MapLibre map) merged into a single morphable mesh. One draw call for ~127 land polygons. */
export default function LandMesh() {
  const [geojson, setGeojson] = useState<LandGeoJSON | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  useEffect(() => {
    fetch("/land.geojson").then((r) => r.json()).then(setGeojson).catch(() => {});
  }, []);

  const geometry = useMemo(() => {
    if (!geojson) return null;
    const parts: THREE.BufferGeometry[] = [];
    for (const f of geojson.features) {
      const morphable = geoJsonToMorphable(f.geometry.type, f.geometry.coordinates);
      if (morphable.positions.length === 0) continue;
      parts.push(createMorphableBufferGeometry(morphable));
    }
    if (parts.length === 0) return null;
    return mergeGeometries(parts, false);
  }, [geojson]);

  useFrame(() => {
    if (materialRef.current) materialRef.current.uniforms.morphProgress.value = morphProgressRef.current;
  });

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} renderOrder={1}>
      <morphShaderMaterial ref={materialRef} color="#28405c" side={THREE.DoubleSide} />
    </mesh>
  );
}
