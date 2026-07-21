// GeoJSON -> morphable Three.js geometry. Technique ported from
// batuhan-bas/the-geographies (MIT): every vertex carries both a sphere and
// a flat position; a shader (see MorphMaterial.tsx) mixes between them so
// the globe<->flat transition runs entirely on the GPU at 60fps.
import * as THREE from "three";
import { createMorphablePosition, interpolatePosition, MorphablePosition } from "./coordinates";

interface MorphableGeometry {
  positions: MorphablePosition[];
  indices: number[];
}

type Ring = [number, number][];
type PolygonCoords = Ring[];

function polygonToMorphable(coordinates: PolygonCoords): MorphableGeometry {
  const outerRing = coordinates?.[0];
  if (!outerRing || outerRing.length < 3) return { positions: [], indices: [] };

  try {
    const shape = new THREE.Shape();
    shape.moveTo(outerRing[0][0], outerRing[0][1]);
    for (let i = 1; i < outerRing.length; i++) shape.lineTo(outerRing[i][0], outerRing[i][1]);
    shape.closePath();

    const shapeGeom = new THREE.ShapeGeometry(shape);
    const posAttr = shapeGeom.getAttribute("position");
    const indexAttr = shapeGeom.getIndex();
    if (!posAttr || !indexAttr) { shapeGeom.dispose(); return { positions: [], indices: [] }; }

    const positions: MorphablePosition[] = [];
    for (let i = 0; i < posAttr.count; i++) positions.push(createMorphablePosition(posAttr.getX(i), posAttr.getY(i)));
    const indices: number[] = [];
    for (let i = 0; i < indexAttr.count; i++) indices.push(indexAttr.getX(i));

    shapeGeom.dispose();
    return { positions, indices };
  } catch {
    return { positions: [], indices: [] };
  }
}

/** Polygon or MultiPolygon GeoJSON coordinates -> morphable geometry. Holes are dropped deliberately (solid land fill, no lake cutouts). */
export function geoJsonToMorphable(type: "Polygon" | "MultiPolygon", coordinates: unknown): MorphableGeometry {
  if (type === "Polygon") return polygonToMorphable(coordinates as PolygonCoords);

  const all: MorphableGeometry = { positions: [], indices: [] };
  for (const poly of coordinates as PolygonCoords[]) {
    const g = polygonToMorphable(poly);
    const offset = all.positions.length;
    all.positions.push(...g.positions);
    for (const idx of g.indices) all.indices.push(idx + offset);
  }
  return all;
}

function geoDistance(a: MorphablePosition, b: MorphablePosition): number {
  const dLon = Math.abs(a.geo.longitude - b.geo.longitude);
  const dLat = Math.abs(a.geo.latitude - b.geo.latitude);
  const adjustedDLon = dLon > 180 ? 360 - dLon : dLon;
  return Math.sqrt(adjustedDLon * adjustedDLon + dLat * dLat);
}

/** Subdivide triangles wider than ~5 degrees so they don't distort when bent onto the sphere. */
function subdivideLargeTriangles(m: MorphableGeometry): MorphableGeometry {
  const maxEdge = 5;
  let positions = [...m.positions];
  let indices = [...m.indices];

  for (let iter = 0; iter < 5; iter++) {
    const next: number[] = [];
    let didSplit = false;
    for (let i = 0; i < indices.length; i += 3) {
      const [i0, i1, i2] = [indices[i], indices[i + 1], indices[i + 2]];
      const [p0, p1, p2] = [positions[i0], positions[i1], positions[i2]];
      if (!p0 || !p1 || !p2) continue;
      const longest = Math.max(geoDistance(p0, p1), geoDistance(p1, p2), geoDistance(p2, p0));
      if (longest > maxEdge) {
        didSplit = true;
        const mid = (a: MorphablePosition, b: MorphablePosition) =>
          createMorphablePosition((a.geo.longitude + b.geo.longitude) / 2, (a.geo.latitude + b.geo.latitude) / 2);
        const m01 = positions.push(mid(p0, p1)) - 1;
        const m12 = positions.push(mid(p1, p2)) - 1;
        const m20 = positions.push(mid(p2, p0)) - 1;
        next.push(i0, m01, m20, m01, i1, m12, m20, m12, i2, m01, m12, m20);
      } else {
        next.push(i0, i1, i2);
      }
    }
    indices = next;
    if (!didSplit) break;
  }
  return { positions, indices };
}

/** Build a THREE.BufferGeometry with position/spherePosition/flatPosition attributes for GPU morphing. */
export function createMorphableBufferGeometry(raw: MorphableGeometry, initialT = 0): THREE.BufferGeometry {
  const { positions, indices } = subdivideLargeTriangles(raw);
  const geometry = new THREE.BufferGeometry();
  const n = positions.length;

  const sphere = new Float32Array(n * 3);
  const flat = new Float32Array(n * 3);
  const interpolated = new Float32Array(n * 3);

  for (let i = 0; i < n; i++) {
    const mp = positions[i];
    const idx = i * 3;
    sphere[idx] = mp.sphere.x; sphere[idx + 1] = mp.sphere.y; sphere[idx + 2] = mp.sphere.z;
    flat[idx] = mp.flat.x; flat[idx + 1] = mp.flat.y; flat[idx + 2] = mp.flat.z;
    const interp = interpolatePosition(mp, initialT);
    interpolated[idx] = interp.x; interpolated[idx + 1] = interp.y; interpolated[idx + 2] = interp.z;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(interpolated, 3));
  geometry.setAttribute("spherePosition", new THREE.BufferAttribute(sphere, 3));
  geometry.setAttribute("flatPosition", new THREE.BufferAttribute(flat, 3));
  if (indices.length) geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Snap the CPU-side position attribute to an endpoint (0 = globe, 1 = flat), used only for accurate raycasting once settled — the visible morph itself runs in the vertex shader every frame regardless. */
export function snapMorphProgress(geometry: THREE.BufferGeometry, t: number): void {
  const sphere = geometry.getAttribute("spherePosition") as THREE.BufferAttribute;
  const flatAttr = geometry.getAttribute("flatPosition") as THREE.BufferAttribute;
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  if (!sphere || !flatAttr || !position) return;
  const c = Math.max(0, Math.min(1, t));
  for (let i = 0; i < position.count; i++) {
    const idx = i * 3;
    position.array[idx] = sphere.array[idx] + (flatAttr.array[idx] - sphere.array[idx]) * c;
    position.array[idx + 1] = sphere.array[idx + 1] + (flatAttr.array[idx + 1] - sphere.array[idx + 1]) * c;
    position.array[idx + 2] = sphere.array[idx + 2] + (flatAttr.array[idx + 2] - sphere.array[idx + 2]) * c;
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}
