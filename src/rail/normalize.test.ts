import { createDefaultRailConfig, createDefaultRailLayers, RAIL_LAYER_IDS } from './defaults';
import { normalizeMapMode, normalizeRailConfig } from './normalize';
import { RailOperationsConfig } from './types';

describe('normalizeMapMode', () => {
  it('treats absent or unknown values as network', () => {
    expect(normalizeMapMode(undefined)).toBe('network');
    expect(normalizeMapMode(null)).toBe('network');
    expect(normalizeMapMode('network')).toBe('network');
    expect(normalizeMapMode('RAIL')).toBe('network');
    expect(normalizeMapMode(1)).toBe('network');
    expect(normalizeMapMode({})).toBe('network');
  });

  it('accepts only the literal rail value', () => {
    expect(normalizeMapMode('rail')).toBe('rail');
  });
});

describe('rail defaults', () => {
  it('returns fresh objects on every call (no shared mutable state)', () => {
    const a = createDefaultRailConfig();
    const b = createDefaultRailConfig();
    expect(a).not.toBe(b);
    expect(a.layers).not.toBe(b.layers);
    a.layers[0].visible = false;
    a.controlPoints.push({ id: 'x', type: 'station', position: [0, 0], label: 'X' });
    expect(b.layers[0].visible).toBe(true);
    expect(b.controlPoints).toHaveLength(0);
  });

  it('defines all well-known layers with deterministic order', () => {
    const layers = createDefaultRailLayers();
    expect(layers.map((l) => l.id)).toContain(RAIL_LAYER_IDS.tracks);
    expect(layers.map((l) => l.id)).toContain(RAIL_LAYER_IDS.editorGuides);
    expect(new Set(layers.map((l) => l.id)).size).toBe(layers.length);
    expect(layers.map((l) => l.zIndex)).toEqual(layers.map((_, i) => i));
    expect(layers.every((l) => l.visible && !l.locked)).toBe(true);
  });
});

describe('normalizeRailConfig', () => {
  it('yields the default empty config for missing or foreign input', () => {
    for (const raw of [undefined, null, 42, 'rail', [], true]) {
      const config = normalizeRailConfig(raw);
      expect(config.controlPoints).toEqual([]);
      expect(config.trackSegments).toEqual([]);
      expect(config.trains).toEqual([]);
      expect(config.layers.length).toBeGreaterThan(0);
    }
  });

  it('does not mutate its input', () => {
    const raw = Object.freeze({
      controlPoints: Object.freeze([Object.freeze({ id: 'cp-1', type: 'station', position: [1, 2], label: 'A' })]),
      layers: Object.freeze([]),
    });
    expect(() => normalizeRailConfig(raw)).not.toThrow();
    const config = normalizeRailConfig(raw);
    expect(config.controlPoints[0]).toEqual({ id: 'cp-1', type: 'station', position: [1, 2], label: 'A' });
    expect(config.controlPoints[0]).not.toBe(raw.controlPoints[0]);
  });

  it('normalizes malformed arrays safely', () => {
    const config = normalizeRailConfig({
      controlPoints: 'not-an-array',
      trackSegments: [null, 42, 'seg', { id: 7 }, { id: 'seg-1', fromControlPointId: 'a', toControlPointId: 'b' }],
      signals: {},
      trains: [{ id: 'rd-218', segmentId: 'seg-1', progress: 0.63 }],
    });
    expect(config.controlPoints).toEqual([]);
    expect(config.signals).toEqual([]);
    // Non-object entries are dropped; a non-string id is repaired to '' for
    // validation to report rather than the entry being deleted.
    expect(config.trackSegments).toHaveLength(2);
    expect(config.trackSegments[0].id).toBe('');
    expect(config.trackSegments[1].id).toBe('seg-1');
    expect(config.trackSegments[1].trackNumber).toBe('');
    expect(config.trackSegments[1].direction).toBe('bidirectional');
    expect(config.trains).toEqual([{ id: 'rd-218', segmentId: 'seg-1', progress: 0.63 }]);
  });

  it('rebuilds arrays by replacement so entries cannot be resurrected by merging', () => {
    const config = normalizeRailConfig({ trackSegments: [] });
    expect(config.trackSegments).toEqual([]);
  });

  it('keeps only intermediate waypoints as coordinate pairs in viaPoints', () => {
    const config = normalizeRailConfig({
      trackSegments: [
        {
          id: 'seg-1',
          fromControlPointId: 'a',
          toControlPointId: 'b',
          viaPoints: [[10, 20], 'junk', [1], [NaN, 5], { x: 1 }, [30, 40]],
        },
      ],
    });
    // Well-formed pairs survive; non-finite values survive for validation to
    // report (geometry drops them independently at render time).
    expect(config.trackSegments[0].viaPoints).toEqual([
      [10, 20],
      [NaN, 5],
      [30, 40],
    ]);
  });

  it('repairs control point positions to a reportable non-finite pair', () => {
    const config = normalizeRailConfig({
      controlPoints: [{ id: 'cp-1', label: 'A' }, { id: 'cp-2', label: 'B', position: [5, 6] }],
    });
    expect(config.controlPoints[0].position.every((v) => Number.isNaN(v))).toBe(true);
    expect(config.controlPoints[1].position).toEqual([5, 6]);
    expect(config.controlPoints[0].type).toBe('control_point');
  });

  it('preserves saved layer state and appends missing default layers', () => {
    const config = normalizeRailConfig({
      layers: [
        { id: RAIL_LAYER_IDS.tracks, label: 'Tracks', visible: false, locked: true, zIndex: 3 },
        { id: 'custom-layer', label: 'Mine', visible: true, locked: false, zIndex: 99 },
        { label: 'no id — dropped' },
      ],
    });
    const tracks = config.layers.find((l) => l.id === RAIL_LAYER_IDS.tracks)!;
    expect(tracks.visible).toBe(false);
    expect(tracks.locked).toBe(true);
    expect(config.layers.find((l) => l.id === 'custom-layer')).toBeDefined();
    expect(config.layers.find((l) => l.id === RAIL_LAYER_IDS.editorGuides)).toBeDefined();
    expect(config.layers.every((l) => l.id !== '')).toBe(true);
    const ids = config.layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('round-trips an already well-formed config unchanged (idempotent)', () => {
    const wellFormed: RailOperationsConfig = {
      ...createDefaultRailConfig(),
      controlPoints: [{ id: 'cp-1', type: 'station', position: [100, 350], label: 'Station A' }],
      trackSegments: [
        {
          id: 't1-b01',
          fromControlPointId: 'cp-1',
          toControlPointId: 'cp-1',
          trackNumber: '1',
          direction: 'eastbound',
          viaPoints: [[200, 350]],
        },
      ],
    };
    const once = normalizeRailConfig(wellFormed);
    const twice = normalizeRailConfig(once);
    expect(twice).toEqual(once);
  });
});
