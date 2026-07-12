/**
 * Safe normalization of saved rail configuration (#300). Saved panel JSON can
 * be hand-edited, provisioned, or truncated (same threat model as #224 for the
 * core map), so every shape is repaired before render code dereferences it.
 *
 * Contract:
 *  - never mutates its input (options objects can be frozen by Grafana)
 *  - never throws on malformed input
 *  - arrays are rebuilt by REPLACEMENT, not deep-merged, so deleted entries
 *    can never be resurrected by a defaults merge
 *  - entries are repaired, not deleted — reporting problems is validation's
 *    job (validateRailTopology), and it must see the user's real data
 *  - render-path callers must memoize (useMemo keyed on the saved rail
 *    object), matching how normalizeWeathermap is wrapped in WeathermapPanel:
 *    every call rebuilds the whole config with fresh identities
 */
import { isFinitePoint } from '../geometry/polyline';
import { createDefaultRailLayers } from './defaults';
import {
  MapLayer,
  MapMode,
  RailControlPointType,
  RailEntityState,
  RailOperationsConfig,
  RailTrainMarker,
  RailValueMapping,
  TrackDirection,
} from './types';

/** Absent or unrecognized mode is always plain network mode. */
export function normalizeMapMode(raw: unknown): MapMode {
  return raw === 'rail' ? 'rail' : 'network';
}

const CONTROL_POINT_TYPES: readonly RailControlPointType[] = [
  'station',
  'junction',
  'interlocking',
  'yard',
  'terminal',
  'depot',
  'control_point',
];

const TRACK_DIRECTIONS: readonly TrackDirection[] = [
  'eastbound',
  'westbound',
  'northbound',
  'southbound',
  'inbound',
  'outbound',
  'bidirectional',
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function asOptionalString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asOptionalNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Enum-like fields are coerced to a valid member, never cast (#300 review). */
function asMember<T extends string>(v: unknown, valid: readonly T[], fallback: T): T {
  return typeof v === 'string' && (valid as readonly string[]).includes(v) ? (v as T) : fallback;
}

function asOptionalMember<T extends string>(v: unknown, valid: readonly T[]): T | undefined {
  return typeof v === 'string' && (valid as readonly string[]).includes(v) ? (v as T) : undefined;
}

type RawEntity = Record<string, unknown> & { id: string };

/**
 * Coerce to an array of plain-object entries with a string id, then apply a
 * per-entity repair producing the typed known fields. Non-array input becomes
 * []; entries that are not objects are dropped (they cannot be repaired); a
 * missing/non-string id becomes '' so validation can report it. Unknown extra
 * fields are preserved. The spread-widening cast lives here, in exactly one
 * place — repair() itself is fully type-checked against T.
 */
function normalizeEntities<T extends { id: string }>(raw: unknown, repair: (entry: RawEntity) => Omit<T, 'id'>): T[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isRecord).map((entry) => {
    const id = asString(entry.id, '');
    const repaired = repair({ ...entry, id }) as Record<string, unknown>;
    const result: Record<string, unknown> = { ...entry, ...repaired, id };
    // Optional fields repaired to undefined stay ABSENT: the saved garbage
    // value is dropped and no present-but-undefined key flickers across
    // normalize -> JSON round-trips.
    for (const key of Object.keys(repaired)) {
      if (repaired[key] === undefined) {
        delete result[key];
      }
    }
    return result as unknown as T;
  });
}

/**
 * Coordinate pairs keep their (possibly non-finite) numeric values so
 * validation can report them; entries that are not 2-number arrays are
 * dropped. Renderer-side geometry (src/geometry/polyline.ts) independently
 * guards against non-finite coordinates via isFinitePoint.
 */
function normalizePointArray(raw: unknown): Array<[number, number]> {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((p) => Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number')
    .map((p): [number, number] => [p[0], p[1]]);
}

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((v): v is string => typeof v === 'string');
}

const ENTITY_STATES: readonly RailEntityState[] = [
  'normal',
  'clear',
  'occupied',
  'approach',
  'stop',
  'caution',
  'blocked',
  'degraded',
  'maintenance',
  'failed',
  'stale',
  'unknown',
  'no_data',
];

/**
 * Value mappings are dereferenced at render time (state resolution), so
 * garbage here could crash the panel. Non-array input strips the key;
 * entries must be objects with a usable value and a valid state; color and
 * label survive only as strings.
 */
function normalizeValueMappings(raw: unknown): RailValueMapping[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw.filter(isRecord).flatMap((m): RailValueMapping[] => {
    const value = typeof m.value === 'number' || (typeof m.value === 'string' && m.value !== '') ? m.value : undefined;
    const state = asOptionalMember(m.state, ENTITY_STATES);
    if (value === undefined || state === undefined) {
      return [];
    }
    return [
      {
        value,
        state,
        ...(typeof m.color === 'string' ? { color: m.color } : {}),
        ...(typeof m.label === 'string' ? { label: m.label } : {}),
      },
    ];
  });
}

/**
 * Layers: keep the user's saved layer states, repair each entry, and append
 * any missing default layers so renderers can rely on the well-known set
 * existing. Unknown (user-added) layer ids are preserved.
 */
function normalizeLayers(raw: unknown): MapLayer[] {
  const defaults = createDefaultRailLayers();
  // Entries without a usable id are dropped BEFORE indexing so positional
  // zIndex fallbacks reflect the kept list, not the raw saved array.
  const saved = (Array.isArray(raw) ? raw.filter(isRecord) : []).filter((l) => typeof l.id === 'string' && l.id !== '');
  const repaired: MapLayer[] = saved.map((l, i) => {
    const minZoom = asOptionalNumber(l.minZoom);
    const maxZoom = asOptionalNumber(l.maxZoom);
    return {
      id: l.id as string,
      label: asString(l.label, l.id as string),
      visible: typeof l.visible === 'boolean' ? l.visible : true,
      locked: typeof l.locked === 'boolean' ? l.locked : false,
      zIndex: asOptionalNumber(l.zIndex) ?? i,
      ...(minZoom !== undefined ? { minZoom } : {}),
      ...(maxZoom !== undefined ? { maxZoom } : {}),
    };
  });
  const seen = new Set(repaired.map((l) => l.id));
  for (const def of defaults) {
    if (!seen.has(def.id)) {
      repaired.push(def);
    }
  }
  return repaired;
}

/**
 * Repair an arbitrary saved value into a well-formed RailOperationsConfig.
 * Missing/foreign input yields the default (empty) config.
 */
export function normalizeRailConfig(raw: unknown): RailOperationsConfig {
  const source = isRecord(raw) ? raw : {};
  return {
    controlPoints: normalizeEntities(source.controlPoints, (cp) => ({
      type: asMember(cp.type, CONTROL_POINT_TYPES, 'control_point'),
      label: asString(cp.label, ''),
      position: isFinitePoint(cp.position)
        ? ([cp.position[0], cp.position[1]] as [number, number])
        : // Reported by validation (non-finite-position), never rendered.
          ([NaN, NaN] as [number, number]),
      shortLabel: asOptionalString(cp.shortLabel),
      statusQuery: asOptionalString(cp.statusQuery),
      dashboardLink: asOptionalString(cp.dashboardLink),
      zIndex: asOptionalNumber(cp.zIndex),
    })),
    trackSegments: normalizeEntities(source.trackSegments, (seg) => ({
      fromControlPointId: asString(seg.fromControlPointId, ''),
      toControlPointId: asString(seg.toControlPointId, ''),
      trackNumber: asString(seg.trackNumber, ''),
      direction: asMember(seg.direction, TRACK_DIRECTIONS, 'bidirectional'),
      // Non-array garbage resolves to undefined, which normalizeEntities
      // strips — the key ends up absent rather than passed through.
      viaPoints: Array.isArray(seg.viaPoints) ? normalizePointArray(seg.viaPoints) : undefined,
      blockId: asOptionalString(seg.blockId),
      occupancyQuery: asOptionalString(seg.occupancyQuery),
      availabilityQuery: asOptionalString(seg.availabilityQuery),
      statusQuery: asOptionalString(seg.statusQuery),
      valueMappings: normalizeValueMappings(seg.valueMappings),
      strokeWidth: asOptionalNumber(seg.strokeWidth),
      showLabel: typeof seg.showLabel === 'boolean' ? seg.showLabel : undefined,
      zIndex: asOptionalNumber(seg.zIndex),
    })),
    signals: normalizeEntities(source.signals, (sig) => ({
      segmentId: asString(sig.segmentId, ''),
      positionPercent: typeof sig.positionPercent === 'number' ? sig.positionPercent : NaN,
      facingDirection: asMember(sig.facingDirection, TRACK_DIRECTIONS, 'bidirectional'),
      stateQuery: asOptionalString(sig.stateQuery),
      healthQuery: asOptionalString(sig.healthQuery),
      valueMappings: normalizeValueMappings(sig.valueMappings),
      label: asOptionalString(sig.label),
      zIndex: asOptionalNumber(sig.zIndex),
    })),
    switches: normalizeEntities(source.switches, (sw) => ({
      normalSegmentId: asString(sw.normalSegmentId, ''),
      reverseSegmentId: asString(sw.reverseSegmentId, ''),
      controlPointId: asOptionalString(sw.controlPointId),
      positionQuery: asOptionalString(sw.positionQuery),
      detectedQuery: asOptionalString(sw.detectedQuery),
      lockedQuery: asOptionalString(sw.lockedQuery),
      healthQuery: asOptionalString(sw.healthQuery),
      label: asOptionalString(sw.label),
      zIndex: asOptionalNumber(sw.zIndex),
    })),
    crossovers: normalizeEntities(source.crossovers, (co) => ({
      trackSegmentIds: normalizeStringArray(co.trackSegmentIds),
      geometry: co.geometry === 'double' || co.geometry === 'scissors' ? co.geometry : ('single' as const),
      stateQuery: asOptionalString(co.stateQuery),
      label: asOptionalString(co.label),
      zIndex: asOptionalNumber(co.zIndex),
    })),
    trains: normalizeEntities<RailTrainMarker>(source.trains, (train) => ({
      label: asOptionalString(train.label),
      labelQuery: asOptionalString(train.labelQuery),
      segmentId: asOptionalString(train.segmentId),
      segmentQuery: asOptionalString(train.segmentQuery),
      progress: typeof train.progress === 'number' ? train.progress : undefined,
      progressQuery: asOptionalString(train.progressQuery),
      direction: asOptionalMember(train.direction, TRACK_DIRECTIONS),
      directionQuery: asOptionalString(train.directionQuery),
      speedQuery: asOptionalString(train.speedQuery),
      delayQuery: asOptionalString(train.delayQuery),
      destinationQuery: asOptionalString(train.destinationQuery),
      statusQuery: asOptionalString(train.statusQuery),
      staleQuery: asOptionalString(train.staleQuery),
      dashboardLink: asOptionalString(train.dashboardLink),
      rotate: typeof train.rotate === 'boolean' ? train.rotate : undefined,
      zIndex: asOptionalNumber(train.zIndex),
    })),
    routes: normalizeEntities(source.routes, (r) => ({
      segmentIds: normalizeStringArray(r.segmentIds),
      label: asOptionalString(r.label),
      stateQuery: asOptionalString(r.stateQuery),
      color: asOptionalString(r.color),
      zIndex: asOptionalNumber(r.zIndex),
    })),
    incidents: normalizeEntities(source.incidents, (inc) => ({
      kind: inc.kind === 'maintenance' || inc.kind === 'possession' ? inc.kind : ('incident' as const),
      segmentIds: normalizeStringArray(inc.segmentIds),
      label: asOptionalString(inc.label),
      stateQuery: asOptionalString(inc.stateQuery),
      zIndex: asOptionalNumber(inc.zIndex),
    })),
    layers: normalizeLayers(source.layers),
  };
}
