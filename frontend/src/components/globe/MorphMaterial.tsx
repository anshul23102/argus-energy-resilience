"use client";

// GPU globe<->flat morph shader. Technique ported from
// batuhan-bas/the-geographies (MIT); day/night, city-lights and twilight
// shading dropped deliberately — ARGUS is a dark control-room tool, not a
// photorealistic globe, so land reads as a flat-shaded surface with a soft
// directional highlight instead.
import type React from "react";
import { shaderMaterial } from "@react-three/drei";
import * as THREE from "three";
import { extend } from "@react-three/fiber";

const MorphShaderMaterial = shaderMaterial(
  {
    morphProgress: 0,
    color: new THREE.Color("#1b2a3f"),
    emissive: new THREE.Color("#000000"),
    emissiveIntensity: 0,
    lightDirection: new THREE.Vector3(0.4, 0.6, 0.7).normalize(),
  },
  `
    attribute vec3 spherePosition;
    attribute vec3 flatPosition;
    uniform float morphProgress;
    varying vec3 vNormal;

    void main() {
      vec3 morphedPosition = mix(spherePosition, flatPosition, morphProgress);
      vec3 sphereNormal = normalize(spherePosition);
      vec3 flatNormal = vec3(0.0, 0.0, 1.0);
      vNormal = normalMatrix * normalize(mix(sphereNormal, flatNormal, morphProgress));
      gl_Position = projectionMatrix * modelViewMatrix * vec4(morphedPosition, 1.0);
    }
  `,
  `
    uniform vec3 color;
    uniform vec3 emissive;
    uniform float emissiveIntensity;
    uniform vec3 lightDirection;
    varying vec3 vNormal;

    void main() {
      vec3 normal = normalize(vNormal);
      if (!gl_FrontFacing) normal = -normal;
      float diffuse = max(dot(normal, lightDirection), 0.0);
      vec3 shaded = color * (0.55 + diffuse * 0.45) + emissive * emissiveIntensity;
      gl_FragColor = vec4(shaded, 1.0);
    }
  `,
);

extend({ MorphShaderMaterial });

interface MorphShaderMaterialProps {
  morphProgress?: number;
  color?: THREE.Color | string;
  emissive?: THREE.Color | string;
  emissiveIntensity?: number;
  side?: THREE.Side;
  attach?: string;
  ref?: React.Ref<THREE.ShaderMaterial>;
}

declare module "@react-three/fiber" {
  interface ThreeElements {
    morphShaderMaterial: MorphShaderMaterialProps;
  }
}

export { MorphShaderMaterial };
