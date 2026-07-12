/**
 * Shared progress-along-path geometry (#300). Deliberately neutral — not under
 * src/rail/ — because both rail track segments and generic moving entities
 * (#266) consume these. Pure functions, no React, no Grafana imports.
 *
 * Robustness contract shared by every helper: malformed input (empty paths,
 * repeated points, non-finite coordinates, out-of-range progress) must produce
 * a predictable finite fallback, never NaN/Infinity — these values feed SVG
 * attributes directly.
 */

export type PolylinePoint = [number, number];

/** Whether a value is a coordinate pair a renderer could actually place. */
export function isFinitePoint(p: unknown): p is PolylinePoint {
  return Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
}

/** Drop points a renderer could not place; malformed entries are validation's job to report. */
export function sanitizePolyline(points: ReadonlyArray<PolylinePoint | undefined | null>): PolylinePoint[] {
  if (!Array.isArray(points)) {
    return [];
  }
  return points.filter(isFinitePoint).map((p): PolylinePoint => [p[0], p[1]]);
}

/** Clamp a progress ratio into [0, 1]; non-finite resolves to 0. */
export function clampProgress(progress: number): number {
  if (!Number.isFinite(progress) || progress <= 0) {
    return 0;
  }
  return Math.min(1, progress);
}

/**
 * Measure once, query many: sanitized points, per-segment lengths, and the
 * total. Every public helper (and later per-train render code) derives from
 * this single pass instead of re-walking the polyline.
 */
export interface MeasuredPolyline {
  points: PolylinePoint[];
  segmentLengths: number[];
  totalLength: number;
}

export function measurePolyline(points: ReadonlyArray<PolylinePoint | undefined | null>): MeasuredPolyline {
  const pts = sanitizePolyline(points);
  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let i = 1; i < pts.length; i++) {
    const length = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segmentLengths.push(length);
    totalLength += length;
  }
  return { points: pts, segmentLengths, totalLength };
}

/** Total length of a polyline; 0 for empty, single-point, or fully malformed input. */
export function getPolylineLength(points: readonly PolylinePoint[]): number {
  return measurePolyline(points).totalLength;
}

function pointAtProgressMeasured(measured: MeasuredPolyline, progress: number): PolylinePoint {
  const { points: pts, segmentLengths, totalLength } = measured;
  if (pts.length === 0) {
    return [0, 0];
  }
  if (pts.length === 1 || totalLength === 0) {
    return [pts[0][0], pts[0][1]];
  }
  let remaining = clampProgress(progress) * totalLength;
  for (let i = 0; i < segmentLengths.length; i++) {
    const segment = segmentLengths[i];
    if (segment >= remaining) {
      const t = segment === 0 ? 0 : remaining / segment;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
    }
    remaining -= segment;
  }
  return [pts[pts.length - 1][0], pts[pts.length - 1][1]];
}

/**
 * Point at a normalized progress (0..1 of total length) along a polyline.
 * Fallbacks: empty input -> [0, 0]; single point or zero total length -> that
 * point. Progress is clamped, so callers can pass raw query values. Callers
 * placing many objects on one path should measurePolyline once and use
 * getPointAtProgressMeasured/getTangentAtProgressMeasured instead.
 */
export function getPointAtProgress(points: readonly PolylinePoint[], progress: number): PolylinePoint {
  return pointAtProgressMeasured(measurePolyline(points), progress);
}

export const getPointAtProgressMeasured = pointAtProgressMeasured;

function tangentAtProgressMeasured(measured: MeasuredPolyline, progress: number): PolylinePoint {
  const { points: pts, segmentLengths, totalLength } = measured;
  if (pts.length < 2 || totalLength === 0) {
    return [1, 0];
  }
  let remaining = clampProgress(progress) * totalLength;
  let lastDirection: PolylinePoint | undefined;
  for (let i = 0; i < segmentLengths.length; i++) {
    const segment = segmentLengths[i];
    if (segment > 0) {
      lastDirection = [(pts[i + 1][0] - pts[i][0]) / segment, (pts[i + 1][1] - pts[i][1]) / segment];
      if (segment >= remaining) {
        return lastDirection;
      }
      remaining -= segment;
    }
  }
  return lastDirection ?? [1, 0];
}

/**
 * Unit tangent (direction of travel) at a normalized progress. Zero-length
 * segments are skipped; a degenerate polyline (no usable direction) falls back
 * to [1, 0] so rotation math stays finite.
 */
export function getTangentAtProgress(points: readonly PolylinePoint[], progress: number): PolylinePoint {
  return tangentAtProgressMeasured(measurePolyline(points), progress);
}

export const getTangentAtProgressMeasured = tangentAtProgressMeasured;

/**
 * At sharp bends the true parallel corner (the miter point) lies further from
 * the vertex than the offset distance; cap that growth so a near-reversal
 * cannot throw the corner to infinity. 4x is the conventional miter limit.
 */
const MITER_LIMIT = 4;

/**
 * Offset a polyline sideways by a signed distance (positive = left of travel
 * direction). Corner vertices are placed at the miter point — the intersection
 * of the two adjacent offset segments — so the offset path stays a true
 * parallel at bends instead of pinching toward the centerline. Zero-length
 * segments are skipped. Used to draw parallel physical tracks from one
 * centerline.
 */
export function getParallelOffsetPath(points: readonly PolylinePoint[], offset: number): PolylinePoint[] {
  const pts = sanitizePolyline(points);
  if (!Number.isFinite(offset) || offset === 0 || pts.length < 2) {
    return pts;
  }
  // Per-segment unit normals (left of direction of travel).
  const normals: Array<PolylinePoint | undefined> = [];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    const segment = Math.hypot(dx, dy);
    normals.push(segment === 0 ? undefined : [dy / segment, -dx / segment]);
  }
  const fallback = normals.find((n) => n !== undefined);
  if (!fallback) {
    return pts;
  }
  return pts.map((p, i) => {
    const before = normals[i - 1] ?? normals[i] ?? fallback;
    const after = normals[i] ?? normals[i - 1] ?? fallback;
    let nx = before[0] + after[0];
    let ny = before[1] + after[1];
    const norm = Math.hypot(nx, ny);
    if (norm === 0) {
      // 180° reversal: adjacent normals cancel; fall back to one side at the
      // plain offset distance (no meaningful miter exists).
      nx = after[0];
      ny = after[1];
      return [p[0] + nx * offset, p[1] + ny * offset];
    }
    nx /= norm;
    ny /= norm;
    // Miter compensation: the averaged unit normal must be scaled by
    // 1/cos(theta/2) = 2/|n1+n2| to land on the intersection of the two
    // offset segments; capped by MITER_LIMIT for near-reversals.
    const miterScale = Math.min(2 / norm, MITER_LIMIT);
    return [p[0] + nx * offset * miterScale, p[1] + ny * offset * miterScale];
  });
}
