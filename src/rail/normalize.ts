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
 */
import { createDefaultRailLayers } from './defaults';
import { MapLayer, MapMode, RailOperationsConfig } from './types';

/** Absent or unrecognized mode is always plain network mode. */
export function normalizeMapMode(raw: unknown): MapMode {
  return raw === 'rail' ? 'rail' : 'network';
}

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

/**
 * Coerce to an array of plain-object entries with a string id. Non-array
 * input becomes []; entries that are not objects are dropped (they cannot be
 * repaired); a missing/non-string id becomes '' so validation can report it.
 */
function normalizeEntityArray<T extends { id: string }>(raw: unknown): T[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isRecord).map((entry) => ({ ...entry, id: asString(entry.id, '') })) as unknown as T[];
}

/**
 * Coordinate pairs keep their (possibly non-finite) numeric values so
 * validation can report them; entries that are not 2-number arrays are
 * dropped. Renderer-side geometry (src/geometry/polyline.ts) independently
 * guards against non-finite coordinates.
 */
function normalizePointArray(raw: unknown): Array<[number, number]> | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
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

/**
 * Layers: keep the user's saved layer states, repair each entry, and append
 * any missing default layers so renderers can rely on the well-known set
 * existing. Unknown (user-added) layer ids are preserved.
 */
function normalizeLayers(raw: unknown): MapLayer[] {
  const defaults = createDefaultRailLayers();
  const saved = Array.isArray(raw) ? raw.filter(isRecord) : [];
  const repaired: MapLayer[] = saved
    .map((l, i) => ({
      id: asString(l.id, ''),
      label: asString(l.label, asString(l.id, `Layer ${i + 1}`)),
      visible: typeof l.visible === 'boolean' ? l.visible : true,
      locked: typeof l.locked === 'boolean' ? l.locked : false,
      zIndex: asOptionalNumber(l.zIndex) ?? i,
      ...(asOptionalNumber(l.minZoom) !== undefined ? { minZoom: asOptionalNumber(l.minZoom) } : {}),
      ...(asOptionalNumber(l.maxZoom) !== undefined ? { maxZoom: asOptionalNumber(l.maxZoom) } : {}),
    }))
    .filter((l) => l.id !== '');
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
    controlPoints: normalizeEntityArray(source.controlPoints).map((cp: Record<string, unknown> & { id: string }) => ({
      ...cp,
      type: asString(cp.type, 'control_point'),
      label: asString(cp.label, ''),
      position:
        Array.isArray(cp.position) && typeof cp.position[0] === 'number' && typeof cp.position[1] === 'number'
          ? ([cp.position[0], cp.position[1]] as [number, number])
          : ([NaN, NaN] as [number, number]), // reported by validation, never rendered
    })) as RailOperationsConfig['controlPoints'],
    trackSegments: normalizeEntityArray(source.trackSegments).map(
      (seg: Record<string, unknown> & { id: string }) => ({
        ...seg,
        fromControlPointId: asString(seg.fromControlPointId, ''),
        toControlPointId: asString(seg.toControlPointId, ''),
        trackNumber: asString(seg.trackNumber, ''),
        direction: asString(seg.direction, 'bidirectional'),
        ...(seg.viaPoints !== undefined ? { viaPoints: normalizePointArray(seg.viaPoints) } : {}),
      })
    ) as RailOperationsConfig['trackSegments'],
    signals: normalizeEntityArray(source.signals).map((sig: Record<string, unknown> & { id: string }) => ({
      ...sig,
      segmentId: asString(sig.segmentId, ''),
      positionPercent: typeof sig.positionPercent === 'number' ? sig.positionPercent : NaN,
      facingDirection: asString(sig.facingDirection, 'bidirectional'),
    })) as RailOperationsConfig['signals'],
    switches: normalizeEntityArray(source.switches).map((sw: Record<string, unknown> & { id: string }) => ({
      ...sw,
      normalSegmentId: asString(sw.normalSegmentId, ''),
      reverseSegmentId: asString(sw.reverseSegmentId, ''),
      controlPointId: asOptionalString(sw.controlPointId),
    })) as RailOperationsConfig['switches'],
    crossovers: normalizeEntityArray(source.crossovers).map((co: Record<string, unknown> & { id: string }) => ({
      ...co,
      trackSegmentIds: normalizeStringArray(co.trackSegmentIds),
      geometry: co.geometry === 'double' || co.geometry === 'scissors' ? co.geometry : 'single',
    })) as RailOperationsConfig['crossovers'],
    trains: normalizeEntityArray(source.trains) as RailOperationsConfig['trains'],
    routes: normalizeEntityArray(source.routes).map((r: Record<string, unknown> & { id: string }) => ({
      ...r,
      segmentIds: normalizeStringArray(r.segmentIds),
    })) as RailOperationsConfig['routes'],
    incidents: normalizeEntityArray(source.incidents).map((inc: Record<string, unknown> & { id: string }) => ({
      ...inc,
      kind: inc.kind === 'maintenance' || inc.kind === 'possession' ? inc.kind : 'incident',
      segmentIds: normalizeStringArray(inc.segmentIds),
    })) as RailOperationsConfig['incidents'],
    layers: normalizeLayers(source.layers),
  };
}
