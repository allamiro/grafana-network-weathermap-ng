/**
 * Rail-specific geometry composition (#300). The generic math lives in
 * src/geometry/polyline.ts; this module only knows how a track segment's
 * ordered polyline derives from its control points:
 *
 *   [fromControlPoint.position, ...(viaPoints ?? []), toControlPoint.position]
 *
 * so moving a control point moves every connected track.
 */
import { MeasuredPolyline, measurePolyline, PolylinePoint } from '../geometry/polyline';
import { RailControlPoint, RailTrackSegment } from './types';

export function buildControlPointIndex(controlPoints: RailControlPoint[]): Map<string, RailControlPoint> {
  const index = new Map<string, RailControlPoint>();
  for (const cp of controlPoints) {
    // First occurrence wins on duplicate ids (validation reports them).
    if (cp.id && !index.has(cp.id)) {
      index.set(cp.id, cp);
    }
  }
  return index;
}

/**
 * Measured polyline for a segment, or undefined when an endpoint reference is
 * dangling (validation reports it; the renderer skips the segment). Non-finite
 * coordinates are dropped by measurePolyline's sanitization, so a segment can
 * degrade (fewer points) but never emit NaN geometry.
 */
export function measureSegment(
  segment: RailTrackSegment,
  controlPointIndex: Map<string, RailControlPoint>
): MeasuredPolyline | undefined {
  const from = controlPointIndex.get(segment.fromControlPointId);
  const to = controlPointIndex.get(segment.toControlPointId);
  if (!from || !to) {
    return undefined;
  }
  const path: PolylinePoint[] = [from.position, ...(segment.viaPoints ?? []), to.position];
  const measured = measurePolyline(path);
  // Fewer than 2 placeable points (e.g. both endpoints non-finite) cannot
  // render as a track.
  return measured.points.length < 2 ? undefined : measured;
}
