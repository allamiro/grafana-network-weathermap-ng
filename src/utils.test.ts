import { toDataFrame } from '@grafana/data';
import { defaultNodes, getData, legacyWeathermap, theme } from 'testData';
import { DrawnNode, Weathermap } from 'types';
import {
  addViaToLink,
  buildQueryOptions,
  getDataFrameName,
  resolveLinkChain,
  spreadLabels,
  aggregateFieldValues,
  calculateRectangleAutoHeight,
  calculateRectangleAutoWidth,
  CURRENT_VERSION,
  finiteOrFallback,
  getSolidFromAlphaColor,
  handleVersionedStateUpdates,
  isSafeUrl,
  measureText,
  nearestMultiple,
  needsMigration,
  parseOptionalFiniteNumber,
  getTimeField,
  removeVia,
  sampleAtTime,
  sanitizeUrl,
  valueAtTime,
} from 'utils';

test('getSolidFromAlphaColor', () => {
  expect(getSolidFromAlphaColor('rgba(0, 0, 0, 0.5)', '#ffffff')).toBe('rgb(127.5,127.5,127.5)');
  expect(getSolidFromAlphaColor('#ffffff', '#ffffff')).toBe('#ffffff');
  expect(getSolidFromAlphaColor('rgba(255, 255, 255, 0.5)', '#000000')).toBe('rgb(127.5,127.5,127.5)');
});

// Doesn't work as expected in test env
test('measureText', () => {
  expect(measureText('test', 12)).toHaveProperty('width', 4);
});

test('nearestMultiple', () => {
  expect(nearestMultiple(5, 10)).toBe(10);
  expect(nearestMultiple(43, 10)).toBe(50);
});

test('node calculations', () => {
  let d: DrawnNode = defaultNodes[0] as unknown as DrawnNode;
  let wm: Weathermap = getData(theme);
  d.labelWidth = measureText(d.label!, 12).width;
  expect(calculateRectangleAutoHeight(d, wm)).toBe(18);
  expect(calculateRectangleAutoWidth(d, wm)).toBe(26);

  d.nodeIcon!.size = { width: 40, height: 40 };
  d.nodeIcon!.drawInside = true;

  expect(calculateRectangleAutoHeight(d, wm)).not.toBe(18);
  expect(calculateRectangleAutoWidth(d, wm)).not.toBe(26);
});

test('versioned state updates', () => {
  let wm: Weathermap = getData(theme);
  expect(handleVersionedStateUpdates(wm, theme)).toHaveProperty('version', CURRENT_VERSION);
});

// #200: blank numeric inputs report NaN via valueAsNumber; these helpers are
// what keeps that out of the saved options.
describe('numeric input helpers (#200)', () => {
  test('finiteOrFallback keeps finite values, including 0', () => {
    expect(finiteOrFallback(5, 1)).toBe(5);
    expect(finiteOrFallback(0, 1)).toBe(0);
    expect(finiteOrFallback(-3.5, 1)).toBe(-3.5);
  });

  test('finiteOrFallback replaces NaN and infinities with the fallback', () => {
    expect(finiteOrFallback(NaN, 1)).toBe(1);
    expect(finiteOrFallback(Infinity, 2)).toBe(2);
    expect(finiteOrFallback(-Infinity, 0)).toBe(0);
  });

  test('parseOptionalFiniteNumber maps blank/invalid to undefined, keeps 0', () => {
    expect(parseOptionalFiniteNumber('')).toBeUndefined();
    expect(parseOptionalFiniteNumber('   ')).toBeUndefined();
    expect(parseOptionalFiniteNumber('abc')).toBeUndefined();
    expect(parseOptionalFiniteNumber('0')).toBe(0);
    expect(parseOptionalFiniteNumber('-3.5')).toBe(-3.5);
  });
});

// #224: a current-version map with incomplete nested settings must repair
// through the migration path — render code dereferences these shapes directly.
describe('needsMigration (#224)', () => {
  const migrated = () => handleVersionedStateUpdates(JSON.parse(JSON.stringify(legacyWeathermap)), theme);

  test('false for a fully migrated map', () => {
    expect(needsMigration(migrated())).toBe(false);
  });

  test('true for missing or old versions', () => {
    const wm = migrated() as unknown as Record<string, unknown>;
    delete wm.version;
    expect(needsMigration(wm as never)).toBe(true);
    wm.version = 3;
    expect(needsMigration(wm as never)).toBe(true);
  });

  test.each(['panel', 'tooltip', 'scale', 'link', 'fontSizing'])(
    'true for a current-version map missing settings.%s',
    (key) => {
      const wm = migrated() as unknown as { settings: Record<string, unknown> };
      delete wm.settings[key];
      expect(needsMigration(wm as never)).toBe(true);
    }
  );

  test('true for a current-version map missing a nested shape (panel.panelSize)', () => {
    const wm = migrated() as unknown as { settings: { panel: Record<string, unknown> } };
    delete wm.settings.panel.panelSize;
    expect(needsMigration(wm as never)).toBe(true);
  });

  test('true for malformed nested objects with missing leaves (panelSize: {})', () => {
    const wm = migrated() as unknown as { settings: { panel: Record<string, unknown> } };
    wm.settings.panel.panelSize = {};
    expect(needsMigration(wm as never)).toBe(true);
  });

  test('true for malformed scale fontSizing ({} passes object checks)', () => {
    const wm = migrated() as unknown as { settings: { scale: Record<string, unknown> } };
    wm.settings.scale.fontSizing = {};
    expect(needsMigration(wm as never)).toBe(true);
  });

  test('nullish input does not throw', () => {
    expect(needsMigration(undefined)).toBe(false);
    expect(needsMigration(null)).toBe(false);
  });
});

// #199: the migration runs during render (panel and editor), so it must be a
// pure function of its input — mutating the saved options object in place made
// React re-render behavior fragile and corrupted the "before" state.
test('versioned state updates do not mutate the input object (#199)', () => {
  const input = JSON.parse(JSON.stringify(legacyWeathermap));
  const snapshot = JSON.parse(JSON.stringify(input));

  const migrated = handleVersionedStateUpdates(input, theme);

  expect(input).toEqual(snapshot);
  expect(migrated).not.toBe(input);
  expect(migrated.version).toBe(CURRENT_VERSION);
});

// Idempotency is covered by 'handleVersionedStateUpdates round-trip
// guarantees' further down — no separate #199 copy needed.

test('versioned state updates backfill settings missing from pre-v14 options (#162)', () => {
  const migrated = handleVersionedStateUpdates(JSON.parse(JSON.stringify(legacyWeathermap)), theme);

  expect(migrated.version).toBe(CURRENT_VERSION);
  // Theme-derived colors are undefined under the stub test theme, so assert
  // on the theme-independent defaults.
  expect(migrated.settings.tooltip.fontSize).toBe(9);
  expect(migrated.settings.tooltip.textColor).toBe('white');
  expect(migrated.settings.scale.size.width).toBe(50);
  expect(migrated.settings.scale.position.x).toBe(0);
  // Pre-existing settings survive the merge.
  expect(migrated.settings.fontSizing.link).toBe(7);
  expect(migrated.settings.panel.panelSize.width).toBe(600);
  // The old object-style scale converts to the array format.
  expect(Array.isArray(migrated.scale)).toBe(true);
  expect(migrated.scale).toContainEqual({ percent: 10, color: '#73BF69' });
});

describe('isSafeUrl', () => {
  test('allows safe relative Grafana paths', () => {
    expect(isSafeUrl('/d/abc123/my-dashboard')).toBe(true);
    expect(isSafeUrl('/d/abc123/my-dashboard?var-foo=bar')).toBe(true);
    expect(isSafeUrl('public/plugins/tamirsuliman-weathermap-panel/icons/router.svg')).toBe(true);
    expect(isSafeUrl('./relative/icon.png')).toBe(true);
  });

  test('allows http and https absolute URLs', () => {
    expect(isSafeUrl('http://example.com/dashboard')).toBe(true);
    expect(isSafeUrl('https://example.com/icon.svg')).toBe(true);
    expect(isSafeUrl('HTTPS://EXAMPLE.COM/icon.svg')).toBe(true);
  });

  test('rejects javascript URLs', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    // Obfuscated with embedded control characters / whitespace
    expect(isSafeUrl('java\nscript:alert(1)')).toBe(false);
    expect(isSafeUrl('  javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('JavaScript:alert(1)')).toBe(false);
  });

  test('rejects data URLs', () => {
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(false);
  });

  test('rejects file URLs', () => {
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
  });

  test('rejects other unsafe schemes', () => {
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeUrl('blob:https://example.com/uuid')).toBe(false);
    expect(isSafeUrl('ftp://example.com/file')).toBe(false);
  });

  test('rejects protocol-relative URLs', () => {
    expect(isSafeUrl('//evil.com/payload')).toBe(false);
  });

  test('rejects empty and nullish values', () => {
    expect(isSafeUrl('')).toBe(false);
    expect(isSafeUrl('   ')).toBe(false);
    expect(isSafeUrl(undefined)).toBe(false);
    expect(isSafeUrl(null)).toBe(false);
  });
});

describe('sanitizeUrl', () => {
  test('returns the value when safe', () => {
    expect(sanitizeUrl('https://example.com/icon.svg')).toBe('https://example.com/icon.svg');
    expect(sanitizeUrl('/d/abc123/my-dashboard')).toBe('/d/abc123/my-dashboard');
    expect(sanitizeUrl('  https://example.com/icon.svg  ')).toBe('https://example.com/icon.svg');
  });

  test('returns empty string when unsafe', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(sanitizeUrl('file:///etc/passwd')).toBe('');
    expect(sanitizeUrl('//evil.com')).toBe('');
    expect(sanitizeUrl(undefined)).toBe('');
    expect(sanitizeUrl(null)).toBe('');
  });
});

describe('aggregateFieldValues', () => {
  const vals = [10, 20, 30, 40, 100];

  test('last returns the most recent valid value', () => {
    expect(aggregateFieldValues(vals, 'last')).toBe(100);
    expect(aggregateFieldValues(vals, undefined)).toBe(100);
  });

  test('avg returns the mean', () => {
    expect(aggregateFieldValues([10, 20, 30], 'avg')).toBe(20);
  });

  test('min and max', () => {
    expect(aggregateFieldValues(vals, 'min')).toBe(10);
    expect(aggregateFieldValues(vals, 'max')).toBe(100);
  });

  test('p95 uses nearest-rank', () => {
    // 20 points 1..20 -> ceil(0.95*20)=19 -> value 19
    const twenty = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(aggregateFieldValues(twenty, 'p95')).toBe(19);
  });

  test('skips null/NaN and clamps negatives to 0', () => {
    expect(aggregateFieldValues([null, 10, NaN, -5, 20], 'max')).toBe(20);
    // negative clamped to 0, so min is 0
    expect(aggregateFieldValues([10, -5, 20], 'min')).toBe(0);
    // last valid value is 20 (nulls skipped)
    expect(aggregateFieldValues([10, 20, null], 'last')).toBe(20);
  });

  test('returns 0 for empty or all-invalid input', () => {
    expect(aggregateFieldValues([], 'avg')).toBe(0);
    expect(aggregateFieldValues([null, NaN], 'max')).toBe(0);
    expect(aggregateFieldValues(undefined, 'last')).toBe(0);
  });
});

describe('VIA helpers (addViaToLink / removeVia)', () => {
  test('addViaToLink splits a link and preserves endpoint data', () => {
    const wm: Weathermap = getData(theme);
    // Give each side a distinct query to verify data preservation.
    wm.links[0].sides.A.query = 'A-query';
    wm.links[0].sides.Z.query = 'Z-query';
    const endNode = wm.links[0].nodes[1];
    const linkId = wm.links[0].id;

    addViaToLink(wm, linkId, theme);

    // One new connection node and one new link segment.
    expect(wm.nodes.filter((n) => n.isConnection)).toHaveLength(1);
    expect(wm.links).toHaveLength(2);

    const conn = wm.nodes.find((n) => n.isConnection)!;
    expect(conn.anchors[0].numLinks).toBe(2);

    const first = wm.links.find((l) => l.nodes[1].id === conn.id)!; // A <-> C
    const second = wm.links.find((l) => l.nodes[0].id === conn.id)!; // C <-> B
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    // A-side data stays on the first segment; B-side moves to the second.
    expect(first.sides.A.query).toBe('A-query');
    expect(first.sides.Z.query).toBeUndefined();
    expect(second.sides.Z.query).toBe('Z-query');
    expect(second.nodes[1].id).toBe(endNode.id);
  });

  test('removeVia merges the two segments back and preserves data', () => {
    const wm: Weathermap = getData(theme);
    const linkId = wm.links[0].id;
    wm.links[0].sides.A.query = 'A-query';
    wm.links[0].sides.Z.query = 'Z-query';
    const aId = wm.links[0].nodes[0].id;
    const bId = wm.links[0].nodes[1].id;

    addViaToLink(wm, linkId, theme);
    const conn = wm.nodes.find((n) => n.isConnection)!;

    removeVia(wm, conn.id);

    expect(wm.nodes.filter((n) => n.isConnection)).toHaveLength(0);
    expect(wm.links).toHaveLength(1);
    expect(wm.links[0].nodes[0].id).toBe(aId);
    expect(wm.links[0].nodes[1].id).toBe(bId);
    expect(wm.links[0].sides.A.query).toBe('A-query');
    expect(wm.links[0].sides.Z.query).toBe('Z-query');
  });

  test('removeVia is a no-op for a non-connection node', () => {
    const wm: Weathermap = getData(theme);
    const before = { nodes: wm.nodes.length, links: wm.links.length };
    removeVia(wm, wm.nodes[0].id);
    expect(wm.nodes).toHaveLength(before.nodes);
    expect(wm.links).toHaveLength(before.links);
  });

  test('removeVia is a no-op for a C->C self-loop (same in/out link)', () => {
    const wm: Weathermap = getData(theme);
    const conn = wm.nodes.find((n) => n.isConnection) ?? wm.nodes[0];
    conn.isConnection = true;
    // A single self-loop link would otherwise satisfy the one-in/one-out check.
    wm.links = [{ ...wm.links[0], id: 'self', nodes: [conn, conn] }];
    removeVia(wm, conn.id);
    expect(wm.links).toHaveLength(1);
    expect(wm.links[0].id).toBe('self');
    expect(wm.nodes.some((n) => n.id === conn.id)).toBe(true);
  });
});

// #201 follow-up: node status replays raw values — negatives are legitimate
// status mapping inputs, and "no usable sample" must not collapse into 0.
describe('sampleAtTime (raw step-hold, no clamping)', () => {
  const times = [1000, 2000, 3000];

  test('preserves negative values', () => {
    expect(sampleAtTime(times, [-3, -7, 5], 2500)).toBe(-7);
    expect(sampleAtTime(times, [-3, -7, 5], 900)).toBe(-3);
  });

  test('step-hold matches valueAtTime walk (skips null/NaN backwards)', () => {
    expect(sampleAtTime(times, [4, null, NaN], 3500)).toBe(4);
    expect(sampleAtTime(times, [4, 9, 2], 2999)).toBe(9);
  });

  test('returns undefined when nothing is usable', () => {
    expect(sampleAtTime([], [], 1000)).toBeUndefined();
    expect(sampleAtTime(undefined, undefined, 1000)).toBeUndefined();
    expect(sampleAtTime(times, [null, NaN, null], 2000)).toBeUndefined();
  });
});

// #204: duplicate display names must behave deterministically — the dropdown
// keeps the first occurrence, and the panel's value map does the same.
describe('duplicate display names are deterministic (#204)', () => {
  const dupFrame = (refId: string, displayName: string, value: number) =>
    toDataFrame({
      refId,
      fields: [
        { name: 'Time', values: [1, 2] },
        { name: 'Value', values: [value, value], config: { displayNameFromDS: displayName } },
      ],
    });

  test('buildQueryOptions keeps the first frame for a duplicated name', () => {
    const frames = [dupFrame('A', 'dup-series', 1), dupFrame('B', 'dup-series', 2), dupFrame('C', 'unique', 3)];
    const options = buildQueryOptions(frames);

    // One option per distinct name; the duplicate collapses to one entry.
    expect(options.map((o) => o.value)).toEqual(['dup-series', 'unique']);
  });
});

describe('timeline helpers (valueAtTime / getTimeField)', () => {
  const times = [1000, 2000, 3000];
  const values = [10, 20, 30];

  test('exact and step-hold (most recent sample at or before time)', () => {
    expect(valueAtTime(times, values, 2000)).toBe(20);
    expect(valueAtTime(times, values, 2500)).toBe(20); // hold previous
  });

  test('before the first sample uses the first point', () => {
    expect(valueAtTime(times, values, 500)).toBe(10);
  });

  test('after the last sample uses the last point', () => {
    expect(valueAtTime(times, values, 9999)).toBe(30);
  });

  test('skips null/NaN backwards and clamps negatives', () => {
    expect(valueAtTime([1000, 2000, 3000], [10, null, 30], 2500)).toBe(10);
    expect(valueAtTime([1000, 2000], [-5, 20], 1500)).toBe(0); // -5 clamped
  });

  test('returns 0 for empty or missing input', () => {
    expect(valueAtTime([], [], 1000)).toBe(0);
    expect(valueAtTime(undefined, undefined, 1000)).toBe(0);
  });

  test('getTimeField returns the time field', () => {
    const frame: any = {
      fields: [
        { name: 'Time', type: 'time', values: [1, 2] },
        { name: 'Value', type: 'number', values: [3, 4] },
      ],
    };
    expect(getTimeField(frame)?.name).toBe('Time');
  });

  test('getTimeField does not fall back to a non-numeric first field', () => {
    const frame: any = {
      fields: [
        { name: 'Host', type: 'string', values: ['a', 'b'] },
        { name: 'Value', type: 'number', values: [3, 4] },
      ],
    };
    expect(getTimeField(frame)).toBeUndefined();
  });
});

describe('resolveLinkChain (#179)', () => {
  const node = (id: string, isConnection = false) => ({ id, isConnection } as never);
  const link = (id: string, a: unknown, z: unknown) => ({ id, nodes: [a, z] } as never);

  it('walks a VIA chain in both directions from a middle segment', () => {
    const a = node('a');
    const c1 = node('c1', true);
    const c2 = node('c2', true);
    const z = node('z');
    const links = [link('l1', a, c1), link('l2', c1, c2), link('l3', c2, z), link('other', node('x'), node('y'))];
    expect([...resolveLinkChain(links as never, 'l2')].sort()).toEqual(['l1', 'l2', 'l3']);
    expect([...resolveLinkChain(links as never, 'l1')].sort()).toEqual(['l1', 'l2', 'l3']);
    expect([...resolveLinkChain(links as never, 'l3')].sort()).toEqual(['l1', 'l2', 'l3']);
  });

  it('returns just the link itself when it has no connection endpoints', () => {
    const links = [link('solo', node('a'), node('z'))];
    expect([...resolveLinkChain(links as never, 'solo')]).toEqual(['solo']);
    expect([...resolveLinkChain(links as never, 'missing')]).toEqual(['missing']);
  });
});

describe('spreadLabels (#179)', () => {
  const seg = { x1: 0, y1: 0, x2: 100, y2: 0 };

  it('keeps non-overlapping labels at their preferred offsets', () => {
    const result = spreadLabels([
      { key: 'a', segment: seg, offsetPercent: 20, width: 10, height: 10 },
      { key: 'b', segment: seg, offsetPercent: 80, width: 10, height: 10 },
    ]);
    expect(result.get('a')).toBe(20);
    expect(result.get('b')).toBe(80);
  });

  it('nudges the second of two colliding labels apart', () => {
    const result = spreadLabels([
      { key: 'a', segment: seg, offsetPercent: 50, width: 20, height: 10 },
      { key: 'b', segment: seg, offsetPercent: 50, width: 20, height: 10 },
    ]);
    expect(result.get('a')).toBe(50);
    expect(result.get('b')).not.toBe(50);
    // The two resolved boxes must no longer overlap horizontally.
    expect(Math.abs(result.get('b')! - result.get('a')!)).toBeGreaterThanOrEqual(20);
  });

  it('stays within the allowed offset range', () => {
    const labels = Array.from({ length: 8 }, (_, i) => ({
      key: `k${i}`,
      segment: seg,
      offsetPercent: 50,
      width: 18,
      height: 10,
    }));
    const result = spreadLabels(labels);
    for (const pct of result.values()) {
      expect(pct).toBeGreaterThanOrEqual(10);
      expect(pct).toBeLessThanOrEqual(90);
    }
  });
});

describe('buildQueryOptions (#49, #191)', () => {
  const frame = (refId: string, displayName: string, valueFieldName = 'Value') =>
    toDataFrame({
      refId,
      fields: [
        { name: 'Time', values: [1, 2] },
        { name: valueFieldName, values: [10, 20], config: { displayNameFromDS: displayName } },
      ],
    });

  test('one query returning many series keeps every label distinguishable (#191)', () => {
    // Simulates a single Prometheus rate() query: same refId, same "Value"
    // field, distinct label sets in the display name.
    const frames = [
      frame('A', 'wm_link_bps{device="rtr-1",interface="ge-0/0/1",direction="tx",job="wm",site="dfw"}'),
      frame('A', 'wm_link_bps{device="rtr-1",interface="ge-0/0/2",direction="tx",job="wm",site="dfw"}'),
      frame('A', 'wm_link_bps{device="rtr-2",interface="ge-0/0/1",direction="tx",job="wm",site="atl"}'),
    ];
    const opts = buildQueryOptions(frames);
    expect(opts).toHaveLength(3);
    // pre-#191-fix behavior collapsed all labels to "A: Value"
    const labels = opts.map((o) => o.label);
    expect(new Set(labels).size).toBe(3);
    expect(labels[0]).toContain('ge-0/0/1');
    // stored values stay the full display names so existing configs match
    expect(opts.map((o) => o.value)).toEqual(frames.map((f) => getDataFrameName(f, frames)));
    opts.forEach((o) => expect(o.value).toContain('wm_link_bps'));
  });

  test('long unique disambiguation strings stay concise (#49)', () => {
    const frames = [
      frame('A', 'node_cpu_seconds_total{mode="idle",instance="host-1:9100",job="node"}', 'node_cpu_seconds_total'),
      frame('B', 'node_network_transmit_bytes_total{device="eth0",instance="host-1:9100"}', 'node_network_transmit_bytes_total'),
    ];
    const opts = buildQueryOptions(frames);
    expect(opts.map((o) => o.label)).toEqual(['A: node_cpu_seconds_total', 'B: node_network_transmit_bytes_total']);
  });

  test('short display names (custom legends) are shown verbatim', () => {
    const frames = [frame('A', 'SW-CORE to BKB-CARPINA'), frame('B', 'BKB-CARPINA to SW-CORE')];
    const opts = buildQueryOptions(frames);
    expect(opts.map((o) => o.label)).toEqual(['SW-CORE to BKB-CARPINA', 'BKB-CARPINA to SW-CORE']);
  });

  test('frames without a value field or with duplicate names are skipped', () => {
    const empty = toDataFrame({ fields: [] });
    const dupe = frame('A', 'SAME NAME');
    const opts = buildQueryOptions([empty, dupe, frame('A', 'SAME NAME')]);
    expect(opts).toHaveLength(1);
  });
});

describe('handleVersionedStateUpdates round-trip guarantees', () => {
  test('migration is idempotent: migrating a migrated map changes nothing', () => {
    const once = handleVersionedStateUpdates(JSON.parse(JSON.stringify(legacyWeathermap)), theme);
    const twice = handleVersionedStateUpdates(JSON.parse(JSON.stringify(once)), theme);
    expect(twice).toEqual(once);
  });

  test('migration preserves node and link identity and query bindings', () => {
    const legacy = JSON.parse(JSON.stringify(legacyWeathermap));
    const migrated = handleVersionedStateUpdates(legacy, theme);

    // Every node keeps its id, label, and position.
    expect(migrated.nodes.map((n: { id: string }) => n.id)).toEqual(
      legacyWeathermap.nodes.map((n: { id: string }) => n.id)
    );
    for (let i = 0; i < legacyWeathermap.nodes.length; i++) {
      expect(migrated.nodes[i].label).toBe(legacyWeathermap.nodes[i].label);
      expect(migrated.nodes[i].position).toEqual(legacyWeathermap.nodes[i].position);
    }
    // Every link keeps its endpoints and per-side query/bandwidth bindings.
    expect(migrated.links).toHaveLength(legacyWeathermap.links.length);
    for (let i = 0; i < legacyWeathermap.links.length; i++) {
      const before = legacyWeathermap.links[i] as any;
      const after = migrated.links[i] as any;
      expect(after.id).toBe(before.id);
      for (const side of ['A', 'Z']) {
        expect(after.sides[side].query).toEqual(before.sides[side].query);
        expect(after.sides[side].bandwidth).toEqual(before.sides[side].bandwidth);
      }
    }
  });

  test('a current-version map passes through migration with all config intact', () => {
    // Simulates a dashboard saved by an older 1.5.x release at the current
    // schema version: newer optional fields (statusLegend, hoverHighlight,
    // labelCollision) are absent — they are handled by runtime defaults, so
    // migration must neither invent them nor disturb anything else.
    const saved = JSON.parse(JSON.stringify(getData(theme)));
    saved.links[0].sides.A.query = 'MY QUERY';

    const migrated = handleVersionedStateUpdates(JSON.parse(JSON.stringify(saved)), theme);
    expect(migrated.links[0].sides.A.query).toBe('MY QUERY');
    expect(migrated.version).toBe(CURRENT_VERSION);
    expect(migrated.nodes.map((n: { id: string }) => n.id)).toEqual(saved.nodes.map((n: { id: string }) => n.id));
    expect(migrated.settings.statusLegend).toBeUndefined();
  });
});
