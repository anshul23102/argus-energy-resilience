"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import LandMesh from "./LandMesh";
import CountryBorders from "./CountryBorders";
import { geoToSphere } from "@/lib/geo/coordinates";

interface GlobeMapProps {
  center?: [number, number];
  interactive?: boolean;
}

/** Default camera framing centered on a given lon/lat, viewed from outside the globe — mirrors the old MapLibre map's center/pitch/zoom defaults so the swap doesn't jar returning users. */
function initialCameraPosition(center: [number, number], distance = 2.4): [number, number, number] {
  const p = geoToSphere(center[0], center[1], 1);
  const len = Math.hypot(p.x, p.y, p.z) || 1;
  return [(p.x / len) * distance, (p.y / len) * distance, (p.z / len) * distance];
}

export default function GlobeMap({ center = [58, 20], interactive = true }: GlobeMapProps) {
  const cameraPosition = initialCameraPosition(center);

  return (
    <div className="relative h-full w-full">
      <Canvas
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
        style={{ background: "#050b16" }}
      >
        <PerspectiveCamera makeDefault position={cameraPosition} fov={45} near={0.1} far={100} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[3, 4, 5]} intensity={1.1} />
        <OrbitControls
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
      </Canvas>
    </div>
  );
}
