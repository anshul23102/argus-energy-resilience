// Coordinate math for the globe/flat morphable map. Ported from
// batuhan-bas/the-geographies (MIT) — dependency-free trig, unchanged.

export interface GeoCoordinate { longitude: number; latitude: number; }
export interface CartesianCoordinate { x: number; y: number; z: number; }
export interface MorphablePosition {
  sphere: CartesianCoordinate;
  flat: CartesianCoordinate;
  geo: GeoCoordinate;
}

export const GLOBE_RADIUS = 1;
const DEG_TO_RAD = Math.PI / 180;

/** Geographic (lon, lat) to a point on the globe's sphere. */
export function geoToSphere(longitude: number, latitude: number, radius: number = GLOBE_RADIUS): CartesianCoordinate {
  const phi = (90 - latitude) * DEG_TO_RAD;
  const theta = (longitude + 180) * DEG_TO_RAD;
  return {
    x: -radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  };
}

/** Geographic (lon, lat) to the flat equirectangular plane (z = 0). */
export function geoToFlat(longitude: number, latitude: number, scale: number = 2): CartesianCoordinate {
  return { x: (longitude / 180) * scale, y: (latitude / 90) * scale * 0.5, z: 0 };
}

export function createMorphablePosition(longitude: number, latitude: number): MorphablePosition {
  return { sphere: geoToSphere(longitude, latitude), flat: geoToFlat(longitude, latitude), geo: { longitude, latitude } };
}

/** t = 0 -> globe, t = 1 -> flat. */
export function interpolatePosition(m: MorphablePosition, t: number): CartesianCoordinate {
  const c = Math.max(0, Math.min(1, t));
  return {
    x: m.sphere.x + (m.flat.x - m.sphere.x) * c,
    y: m.sphere.y + (m.flat.y - m.sphere.y) * c,
    z: m.sphere.z + (m.flat.z - m.sphere.z) * c,
  };
}
