/**
 * Rail topology validation (#300). Non-destructive: reports structured issues
 * for the editor to display, never throws for user configuration errors, and
 * never deletes or repairs objects (normalization handles shape repair;
 * validation reports semantics on the repaired config).
 */
import { normalizeRailConfig } from './normalize';
import { RailOperationsConfig, RailValidationIssue } from './types';

const finitePair = (p: unknown): boolean =>
  Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

const inUnitRange = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

export function validateRailTopology(rawConfig: RailOperationsConfig): RailValidationIssue[] {
  // Defensive: the "never throws" contract must hold even when a caller
  // passes saved JSON that skipped normalization (e.g. wm.rail straight from
  // a hand-edited dashboard). Normalization is idempotent, so already-clean
  // configs pass through unchanged.
  const config = normalizeRailConfig(rawConfig);
  const issues: RailValidationIssue[] = [];

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
        issues.push({
          severity: 'error',
          entityType,
          code: 'missing-id',
          message: `${entityType} at index ${index} has no id.`,
        });
        return;
      }
      seen.set(entity.id, (seen.get(entity.id) ?? 0) + 1);
    });
    for (const [id, count] of seen) {
      if (count > 1) {
        issues.push({
          severity: 'error',
          entityType,
          entityId: id,
          code: 'duplicate-id',
          message: `${entityType} id "${id}" is used ${count} times.`,
        });
      }
    }
  }

  const controlPointIds = new Set(config.controlPoints.map((cp) => cp.id).filter(Boolean));
  const segmentIds = new Set(config.trackSegments.map((s) => s.id).filter(Boolean));

  // Control points: non-finite positions.
  for (const cp of config.controlPoints) {
    if (!finitePair(cp.position)) {
      issues.push({
        severity: 'error',
        entityType: 'controlPoint',
        entityId: cp.id || undefined,
        code: 'non-finite-position',
        message: `Control point "${cp.label || cp.id}" has a non-finite position.`,
      });
    }
  }

  // Track segments. Physical identity is grouped structurally (never through
  // a delimited string key: blockId/trackNumber are free-form user text).
  const segmentIdentity = new Map<string, Map<string, { blockId: string; trackNumber: string; ids: string[] }>>();
  for (const seg of config.trackSegments) {
    for (const [field, refId] of [
      ['fromControlPointId', seg.fromControlPointId],
      ['toControlPointId', seg.toControlPointId],
    ] as const) {
      if (!refId || !controlPointIds.has(refId)) {
        issues.push({
          severity: 'error',
          entityType: 'trackSegment',
          entityId: seg.id || undefined,
          code: 'missing-control-point',
          message: `Track segment "${seg.id}" ${field} references missing control point "${refId}".`,
        });
      }
    }
    if (seg.fromControlPointId && seg.fromControlPointId === seg.toControlPointId && !(seg.viaPoints && seg.viaPoints.length > 0)) {
      issues.push({
        severity: 'error',
        entityType: 'trackSegment',
        entityId: seg.id || undefined,
        code: 'zero-length-segment',
        message: `Track segment "${seg.id}" starts and ends at the same control point with no via points.`,
      });
    }
    for (const p of seg.viaPoints ?? []) {
      if (!finitePair(p)) {
        issues.push({
          severity: 'error',
          entityType: 'trackSegment',
          entityId: seg.id || undefined,
          code: 'non-finite-via-point',
          message: `Track segment "${seg.id}" has a non-finite via point.`,
        });
        break;
      }
    }
    // Duplicate physical identity: same block + track number between the same
    // endpoints is almost always a copy-paste mistake.
    if (seg.blockId && seg.trackNumber && seg.fromControlPointId && seg.toControlPointId) {
      const endpointKey = JSON.stringify([seg.fromControlPointId, seg.toControlPointId].sort());
      const identityKey = JSON.stringify([seg.blockId, seg.trackNumber]);
      let byIdentity = segmentIdentity.get(endpointKey);
      if (!byIdentity) {
        byIdentity = new Map();
        segmentIdentity.set(endpointKey, byIdentity);
      }
      const holder = byIdentity.get(identityKey);
      if (holder) {
        holder.ids.push(seg.id);
      } else {
        byIdentity.set(identityKey, { blockId: String(seg.blockId), trackNumber: String(seg.trackNumber), ids: [seg.id] });
      }
    }
  }
  for (const byIdentity of segmentIdentity.values()) {
    for (const { blockId, trackNumber, ids } of byIdentity.values()) {
      if (ids.length > 1) {
        issues.push({
          severity: 'warning',
          entityType: 'trackSegment',
          entityId: ids[1],
          code: 'duplicate-track-identity',
          message: `Segments ${ids.map((h) => `"${h}"`).join(', ')} share block "${blockId}" / track "${trackNumber}" between the same control points.`,
        });
      }
    }
  }

  // Signals.
  for (const sig of config.signals) {
    if (!sig.segmentId || !segmentIds.has(sig.segmentId)) {
      issues.push({
        severity: 'error',
        entityType: 'signal',
        entityId: sig.id || undefined,
        code: 'missing-segment',
        message: `Signal "${sig.id}" references missing track segment "${sig.segmentId}".`,
      });
    }
    if (!inUnitRange(sig.positionPercent)) {
      issues.push({
        severity: 'error',
        entityType: 'signal',
        entityId: sig.id || undefined,
        code: 'position-out-of-range',
        message: `Signal "${sig.id}" positionPercent must be within 0..1.`,
      });
    }
  }

  // Switches.
  for (const sw of config.switches) {
    for (const [field, refId] of [
      ['normalSegmentId', sw.normalSegmentId],
      ['reverseSegmentId', sw.reverseSegmentId],
    ] as const) {
      if (!refId || !segmentIds.has(refId)) {
        issues.push({
          severity: 'error',
          entityType: 'switch',
          entityId: sw.id || undefined,
          code: 'missing-segment',
          message: `Switch "${sw.id}" ${field} references missing track segment "${refId}".`,
        });
      }
    }
    if (sw.normalSegmentId && sw.normalSegmentId === sw.reverseSegmentId) {
      issues.push({
        severity: 'error',
        entityType: 'switch',
        entityId: sw.id || undefined,
        code: 'identical-paths',
        message: `Switch "${sw.id}" normal and reverse paths reference the same segment.`,
      });
    }
    if (sw.controlPointId && !controlPointIds.has(sw.controlPointId)) {
      issues.push({
        severity: 'warning',
        entityType: 'switch',
        entityId: sw.id || undefined,
        code: 'missing-control-point',
        message: `Switch "${sw.id}" references missing control point "${sw.controlPointId}".`,
      });
    }
  }

  // Crossovers.
  for (const co of config.crossovers) {
    if (co.trackSegmentIds.length < 2) {
      issues.push({
        severity: 'error',
        entityType: 'crossover',
        entityId: co.id || undefined,
        code: 'insufficient-segments',
        message: `Crossover "${co.id}" needs at least 2 track segments (has ${co.trackSegmentIds.length}).`,
      });
    }
    for (const refId of co.trackSegmentIds) {
      if (!segmentIds.has(refId)) {
        issues.push({
          severity: 'error',
          entityType: 'crossover',
          entityId: co.id || undefined,
          code: 'missing-segment',
          message: `Crossover "${co.id}" references missing track segment "${refId}".`,
        });
      }
    }
  }

  // Trains: schema-level checks only (rendering is deferred); a train may be
  // fully query-driven, so static fields are validated only when present.
  for (const train of config.trains) {
    if (train.segmentId && !segmentIds.has(train.segmentId)) {
      issues.push({
        severity: 'error',
        entityType: 'train',
        entityId: train.id || undefined,
        code: 'missing-segment',
        message: `Train "${train.id}" references missing track segment "${train.segmentId}".`,
      });
    }
    if (train.progress !== undefined && !inUnitRange(train.progress)) {
      issues.push({
        severity: 'error',
        entityType: 'train',
        entityId: train.id || undefined,
        code: 'progress-out-of-range',
        message: `Train "${train.id}" progress must be within 0..1.`,
      });
    }
  }

  // Routes and incidents.
  for (const [entityType, entities] of [
    ['route', config.routes],
    ['incident', config.incidents],
  ] as Array<['route' | 'incident', Array<{ id: string; segmentIds: string[] }>]>) {
    for (const entity of entities) {
      if (entity.segmentIds.length === 0) {
        issues.push({
          severity: 'warning',
          entityType,
          entityId: entity.id || undefined,
          code: 'empty-segment-list',
          message: `${entityType} "${entity.id}" covers no track segments.`,
        });
      }
      for (const refId of entity.segmentIds) {
        if (!segmentIds.has(refId)) {
          issues.push({
            severity: 'error',
            entityType,
            entityId: entity.id || undefined,
            code: 'missing-segment',
            message: `${entityType} "${entity.id}" references missing track segment "${refId}".`,
          });
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
      issues.push({
        severity: 'warning',
        entityType: 'controlPoint',
        entityId: cp.id,
        code: 'orphaned',
        message: `Control point "${cp.label || cp.id}" is not connected to any track segment.`,
      });
    }
  }

  return issues;
}
