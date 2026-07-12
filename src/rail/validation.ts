/**
 * Rail topology validation (#300). Non-destructive: reports structured issues
 * for the editor to display, never throws for user configuration errors, and
 * never deletes or repairs objects (normalization handles shape repair;
 * validation reports semantics on the repaired config).
 */
import { RailOperationsConfig, RailValidationIssue } from './types';

const finitePair = (p: unknown): boolean =>
  Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

const inUnitRange = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

export function validateRailTopology(config: RailOperationsConfig): RailValidationIssue[] {
  const issues: RailValidationIssue[] = [];
  const report = (severity: 'error' | 'warning', entityType: string, entityId: string | undefined, code: string, message: string) => {
    issues.push({ severity, entityType, entityId, code, message });
  };

  const collections: Array<[string, Array<{ id: string }>]> = [
    ['controlPoint', config.controlPoints],
    ['trackSegment', config.trackSegments],
    ['signal', config.signals],
    ['switch', config.switches],
    ['crossover', config.crossovers],
    ['train', config.trains],
    ['route', config.routes],
    ['incident', config.incidents],
    ['layer', config.layers],
  ];

  // Missing and duplicate ids (checked per collection; ids are only required
  // to be unique among entities of the same type).
  for (const [entityType, entities] of collections) {
    const seen = new Map<string, number>();
    entities.forEach((entity, index) => {
      if (!entity.id) {
        report('error', entityType, undefined, 'missing-id', `${entityType} at index ${index} has no id.`);
        return;
      }
      seen.set(entity.id, (seen.get(entity.id) ?? 0) + 1);
    });
    for (const [id, count] of seen) {
      if (count > 1) {
        report('error', entityType, id, 'duplicate-id', `${entityType} id "${id}" is used ${count} times.`);
      }
    }
  }

  const controlPointIds = new Set(config.controlPoints.map((cp) => cp.id).filter(Boolean));
  const segmentIds = new Set(config.trackSegments.map((s) => s.id).filter(Boolean));

  // Control points: non-finite positions.
  for (const cp of config.controlPoints) {
    if (!finitePair(cp.position)) {
      report('error', 'controlPoint', cp.id || undefined, 'non-finite-position', `Control point "${cp.label || cp.id}" has a non-finite position.`);
    }
  }

  // Track segments.
  const segmentIdentity = new Map<string, string[]>();
  for (const seg of config.trackSegments) {
    for (const [field, refId] of [
      ['fromControlPointId', seg.fromControlPointId],
      ['toControlPointId', seg.toControlPointId],
    ] as const) {
      if (!refId || !controlPointIds.has(refId)) {
        report('error', 'trackSegment', seg.id || undefined, 'missing-control-point', `Track segment "${seg.id}" ${field} references missing control point "${refId}".`);
      }
    }
    if (seg.fromControlPointId && seg.fromControlPointId === seg.toControlPointId && !(seg.viaPoints && seg.viaPoints.length > 0)) {
      report('error', 'trackSegment', seg.id || undefined, 'zero-length-segment', `Track segment "${seg.id}" starts and ends at the same control point with no via points.`);
    }
    for (const p of seg.viaPoints ?? []) {
      if (!finitePair(p)) {
        report('error', 'trackSegment', seg.id || undefined, 'non-finite-via-point', `Track segment "${seg.id}" has a non-finite via point.`);
        break;
      }
    }
    // Duplicate physical identity: same block + track number between the same
    // endpoints is almost always a copy-paste mistake.
    if (seg.blockId && seg.trackNumber && seg.fromControlPointId && seg.toControlPointId) {
      const endpoints = [seg.fromControlPointId, seg.toControlPointId].sort().join('~');
      const key = `${endpoints}|${seg.blockId}|${seg.trackNumber}`;
      const holders = segmentIdentity.get(key) ?? [];
      holders.push(seg.id);
      segmentIdentity.set(key, holders);
    }
  }
  for (const [key, holders] of segmentIdentity) {
    if (holders.length > 1) {
      const [, blockId, trackNumber] = key.split('|');
      report('warning', 'trackSegment', holders[1], 'duplicate-track-identity', `Segments ${holders.map((h) => `"${h}"`).join(', ')} share block "${blockId}" / track "${trackNumber}" between the same control points.`);
    }
  }

  // Signals.
  for (const sig of config.signals) {
    if (!sig.segmentId || !segmentIds.has(sig.segmentId)) {
      report('error', 'signal', sig.id || undefined, 'missing-segment', `Signal "${sig.id}" references missing track segment "${sig.segmentId}".`);
    }
    if (!inUnitRange(sig.positionPercent)) {
      report('error', 'signal', sig.id || undefined, 'position-out-of-range', `Signal "${sig.id}" positionPercent must be within 0..1.`);
    }
  }

  // Switches.
  for (const sw of config.switches) {
    for (const [field, refId] of [
      ['normalSegmentId', sw.normalSegmentId],
      ['reverseSegmentId', sw.reverseSegmentId],
    ] as const) {
      if (!refId || !segmentIds.has(refId)) {
        report('error', 'switch', sw.id || undefined, 'missing-segment', `Switch "${sw.id}" ${field} references missing track segment "${refId}".`);
      }
    }
    if (sw.normalSegmentId && sw.normalSegmentId === sw.reverseSegmentId) {
      report('error', 'switch', sw.id || undefined, 'identical-paths', `Switch "${sw.id}" normal and reverse paths reference the same segment.`);
    }
    if (sw.controlPointId && !controlPointIds.has(sw.controlPointId)) {
      report('warning', 'switch', sw.id || undefined, 'missing-control-point', `Switch "${sw.id}" references missing control point "${sw.controlPointId}".`);
    }
  }

  // Crossovers.
  for (const co of config.crossovers) {
    if (co.trackSegmentIds.length < 2) {
      report('error', 'crossover', co.id || undefined, 'insufficient-segments', `Crossover "${co.id}" needs at least 2 track segments (has ${co.trackSegmentIds.length}).`);
    }
    for (const refId of co.trackSegmentIds) {
      if (!segmentIds.has(refId)) {
        report('error', 'crossover', co.id || undefined, 'missing-segment', `Crossover "${co.id}" references missing track segment "${refId}".`);
      }
    }
  }

  // Trains: schema-level checks only (rendering is deferred); a train may be
  // fully query-driven, so static fields are validated only when present.
  for (const train of config.trains) {
    if (train.segmentId && !segmentIds.has(train.segmentId)) {
      report('error', 'train', train.id || undefined, 'missing-segment', `Train "${train.id}" references missing track segment "${train.segmentId}".`);
    }
    if (train.progress !== undefined && !inUnitRange(train.progress)) {
      report('error', 'train', train.id || undefined, 'progress-out-of-range', `Train "${train.id}" progress must be within 0..1.`);
    }
  }

  // Routes and incidents.
  for (const [entityType, entities] of [
    ['route', config.routes],
    ['incident', config.incidents],
  ] as Array<['route' | 'incident', Array<{ id: string; segmentIds: string[] }>]>) {
    for (const entity of entities) {
      if (entity.segmentIds.length === 0) {
        report('warning', entityType, entity.id || undefined, 'empty-segment-list', `${entityType} "${entity.id}" covers no track segments.`);
      }
      for (const refId of entity.segmentIds) {
        if (!segmentIds.has(refId)) {
          report('error', entityType, entity.id || undefined, 'missing-segment', `${entityType} "${entity.id}" references missing track segment "${refId}".`);
        }
      }
    }
  }

  // Orphans (warnings): entities nothing else references are usually leftovers.
  const referencedControlPoints = new Set<string>();
  for (const seg of config.trackSegments) {
    referencedControlPoints.add(seg.fromControlPointId);
    referencedControlPoints.add(seg.toControlPointId);
  }
  for (const sw of config.switches) {
    if (sw.controlPointId) {
      referencedControlPoints.add(sw.controlPointId);
    }
  }
  for (const cp of config.controlPoints) {
    if (cp.id && !referencedControlPoints.has(cp.id)) {
      report('warning', 'controlPoint', cp.id, 'orphaned', `Control point "${cp.label || cp.id}" is not connected to any track segment.`);
    }
  }

  return issues;
}
