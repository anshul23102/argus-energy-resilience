"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { geoToSphere, geoToFlat, GLOBE_RADIUS } from "@/lib/geo/coordinates";
import { morphProgressRef } from "./morphState";

interface CountryFeature { geometry: { type: "Polygon" | "MultiPolygon"; coordinates: [number, number][][] | [number, number][][][] }; }
interface CountriesGeoJSON { features: CountryFeature[]; }

function extractOuterRings(f: CountryFeature): [number, number][][] {
  if (f.geometry.type === "Polygon") return [(f.geometry.coordinates as [number, number][][])[0]];
  return (f.geometry.coordinates as [number, number][][][]).map((poly) => poly[0]);
}

const BORDER_RADIUS = GLOBE_RADIUS * 1.002;

/** Political border lines from public/countries.geojson (already Kashmir-corrected). CPU-lerp per ring, updated every frame from morphProgressRef so borders track the globe<->flat morph without triggering React state updates. */
export default function CountryBorders() {
  const [geojson, setGeojson] = useState<CountriesGeoJSON | null>(null);
  const lineRef = useRef<THREE.LineSegments>(null);

  useEffect(() => {
    fetch("/countries.geojson").then((r) => r.json()).then(setGeojson).catch(() => {});
  }, []);

  const { sphere, flat, segmentCount } = useMemo(() => {
    if (!geojson) return { sphere: new Float32Array(0), flat: new Float32Array(0), segmentCount: 0 };
    const sphereArr: number[] = [];
    const flatArr: number[] = [];
    for (const f of geojson.features) {
      for (const ring of extractOuterRings(f)) {
        for (let i = 0; i < ring.length - 1; i++) {
          for (const [lon, lat] of [ring[i], ring[i + 1]]) {
            const s = geoToSphere(lon, lat, BORDER_RADIUS);
            const fl = geoToFlat(lon, lat);
            sphereArr.push(s.x, s.y, s.z);
            flatArr.push(fl.x, fl.y, fl.z + 0.002);
          }
        }
      }
    }
    return { sphere: new Float32Array(sphereArr), flat: new Float32Array(flatArr), segmentCount: sphereArr.length / 3 };
  }, [geojson]);

  const geometry = useMemo(() => {
    if (segmentCount === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(sphere), 3));
    return g;
  }, [sphere, segmentCount]);

  useFrame(() => {
    if (!lineRef.current) return;
    const position = lineRef.current.geometry.getAttribute("position") as THREE.BufferAttribute;
    if (!position) return;
    const t = morphProgressRef.current;
    for (let i = 0; i < position.count * 3; i++) {
      position.array[i] = sphere[i] + (flat[i] - sphere[i]) * t;
    }
    position.needsUpdate = true;
  });

  if (!geometry) return null;

  return (
    <lineSegments ref={lineRef} geometry={geometry} renderOrder={2}>
      <lineBasicMaterial color="#4a6488" transparent opacity={0.85} />
    </lineSegments>
  );
}
