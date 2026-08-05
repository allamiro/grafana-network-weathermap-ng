import { FieldType, toDataFrame } from '@grafana/data';
import { defaultNodes, getData, legacyWeathermap, theme } from 'testData';
import { DrawnNode, Weathermap } from 'types';
import {
  addViaToLink,
  buildQueryOptions,
  getDataFrameName,
  getValueField,
  clampUtilization,
  utilizationToSpeed,
  utilizationToDotCount,
  getValueSeries,
  resolveLinkChain,
  spreadLabels,
  aggregateFieldValues,
  calculateRectangleAutoHeight,
  calculateRectangleAutoWidth,
  CURRENT_VERSION,
  finiteOrFallback,
  finitePosition,
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
  sanitizeImageSource,
  formatBytes,
  BG_IMAGE_MAX_BYTES,
  BG_IMAGE_WARN_BYTES,
  sanitizeWaypoints,
  roundPathCorners,
  valueAtTime,
  buildLegacyNameAliases,
  getLegacyDataFrameName,
  rebindLegacyQueryNames,
  pathTotalLength,
  pointAtPathLength,
  pointAtPathPercent,
  directionAtPathLength,
  subPath,
  pathToSvg,
  pathToPoints,
  nearestSegmentIndex,
  chordNormalOffset,
  translatePoint,
  translatePath,
  pathGradientStops,
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

  test.each([
    ['panel.backgroundColor', (st: Record<string, Record<string, unknown>>) => delete st.panel.backgroundColor],
    ['panel.zoomScale', (st: Record<string, Record<string, unknown>>) => delete st.panel.zoomScale],
    ['link.stroke.color', (st: Record<string, Record<string, Record<string, unknown>>>) => delete st.link.stroke.color],
    ['link.label.background', (st: Record<string, Record<string, Record<string, unknown>>>) => delete st.link.label.background],
    ['link.label.border', (st: Record<string, Record<string, Record<string, unknown>>>) => delete st.link.label.border],
    ['link.label.font', (st: Record<string, Record<string, Record<string, unknown>>>) => delete st.link.label.font],
    ['tooltip.fontSize', (st: Record<string, Record<string, unknown>>) => delete st.tooltip.fontSize],
  ])('true for a current-version map missing renderer leaf %s (#232)', (_name, mutate) => {
    const wm = migrated() as unknown as { settings: never };
    mutate(wm.settings);
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
// #253: the panel is datasource-agnostic because getValueField resolves the
// value field by numeric TYPE and getDataFrameName falls back through
// Grafana's display-name chain. Lock resolution for the frame shapes the
// major datasources actually emit — no containers needed.
describe('datasource frame shapes resolve (#253)', () => {
  test('InfluxDB Flux shape: typed _time/_value fields, name from tag set', () => {
    // Real Flux frames mark _time as FieldType.time and carry the tag set in
    // the frame name; the value field is literally named _value.
    const frame = toDataFrame({
      name: 'wm_link_bps {device="core-a", direction="tx"}',
      fields: [
        { name: '_time', type: FieldType.time, values: [1000, 2000] },
        { name: '_value', type: FieldType.number, values: [42.5, 43.5], labels: { device: 'core-a', direction: 'tx' } },
      ],
    });
    expect(getValueField(frame).name).toBe('_value');
    expect(getDataFrameName(frame, [frame])).toContain('core-a');
  });

  test('InfluxQL shape: Time/mean fields with an alias', () => {
    // Alias-by lands as the display name on the value field.
    const frame = toDataFrame({
      name: 'wm_link_bps.mean',
      fields: [
        { name: 'Time', type: FieldType.time, values: [1000, 2000] },
        { name: 'mean', type: FieldType.number, values: [10, 20], config: { displayNameFromDS: 'core-a→core-b tx' } },
      ],
    });
    expect(getValueField(frame).name).toBe('mean');
    expect(getDataFrameName(frame, [frame])).toBe('core-a→core-b tx');
  });

  test('Elasticsearch shape: @timestamp + aggregation field with an alias', () => {
    // The query Alias lands as the display name on the value field.
    const frame = toDataFrame({
      fields: [
        { name: '@timestamp', type: FieldType.time, values: [1000, 2000] },
        {
          name: 'Average bps',
          type: FieldType.number,
          values: [7, 9],
          config: { displayNameFromDS: 'core-a→core-b tx' },
        },
      ],
    });
    expect(getValueField(frame).name).toBe('Average bps');
    expect(getDataFrameName(frame, [frame])).toBe('core-a→core-b tx');
  });

  test('Zabbix-like shape: item-named numeric field, no per-field display name', () => {
    const frame = toDataFrame({
      name: 'core-a: Interface ge-0/0/1(): Bits sent',
      fields: [
        { name: 'Time', values: [1000, 2000] },
        { name: 'Interface ge-0/0/1(): Bits sent', values: [100, 200] },
      ],
    });
    expect(getValueField(frame).values[1]).toBe(200);
    expect(getDataFrameName(frame, [frame])).toContain('Bits sent');
  });

  test('SQL (Postgres/MySQL) Time series shape: metric column names the frame', () => {
    // `SELECT time, value, series AS metric` with Format as Time series pivots
    // long->wide: one frame per metric value, named by it, with a numeric
    // "value" field. The panel binds by that metric name.
    const frame = toDataFrame({
      name: 'core-a→core-b tx',
      fields: [
        { name: 'time', type: FieldType.time, values: [1000, 2000] },
        { name: 'value', type: FieldType.number, values: [42.5, 43.5], labels: { metric: 'core-a→core-b tx' } },
      ],
    });
    expect(getValueField(frame).name).toBe('value');
    expect(getDataFrameName(frame, [frame])).toContain('core-a→core-b tx');
  });

  test('SQL Table shape: wide frame binds every aliased value column', () => {
    // Format as Table returns one wide frame; each aliased numeric column is a
    // bindable series keyed by its column name (same path as #260 wide frames).
    const frame = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1000, 2000] },
        { name: 'core-a tx', type: FieldType.number, values: [10, 20] },
        { name: 'core-a rx', type: FieldType.number, values: [30, 40] },
      ],
    });
    expect(getValueSeries(frame, [frame]).map((s) => s.name)).toEqual(['core-a tx', 'core-a rx']);
  });
});

describe('wide data frames expose every value field (#260)', () => {
  // Zabbix data alignment, Grafana join transformations, and SQL wide mode
  // all produce a single frame carrying many named value fields. Every one
  // of them must be independently bindable, not just the first.
  const wideFrame = () =>
    toDataFrame({
      refId: 'A',
      fields: [
        { name: 'Time', type: FieldType.time, values: [1000, 2000] },
        { name: 'core-a in', type: FieldType.number, values: [10, 20] },
        { name: 'core-a out', type: FieldType.number, values: [30, 40] },
        { name: 'STATUS X', type: FieldType.number, values: [1, 0] },
      ],
    });

  test('getValueSeries returns one entry per numeric field with its display name', () => {
    const frame = wideFrame();
    const series = getValueSeries(frame, [frame]);
    expect(series.map((entry) => entry.name)).toEqual(['core-a in', 'core-a out', 'STATUS X']);
    // Each entry carries its own field, not the first one repeated.
    expect(series[1].field.values[1]).toBe(40);
    expect(series[2].field.values[1]).toBe(0);
  });

  test('getValueSeries matches getValueField semantics on narrow frames', () => {
    const frame = toDataFrame({
      name: 'wm_link_bps',
      fields: [
        { name: 'Time', type: FieldType.time, values: [1000] },
        { name: 'Value', type: FieldType.number, values: [7] },
      ],
    });
    const series = getValueSeries(frame, [frame]);
    expect(series).toHaveLength(1);
    expect(series[0].field).toBe(getValueField(frame));
  });

  test('getValueSeries keeps the second-field fallback for untyped frames', () => {
    // Some datasources ship untyped fields; the legacy fallback binds the
    // second field so those keep resolving exactly as getValueField does.
    const frame = toDataFrame({
      name: 'legacy',
      fields: [
        { name: 'Time', values: [1000], type: FieldType.string },
        { name: 'reading', values: ['12'], type: FieldType.string },
      ],
    });
    const series = getValueSeries(frame, [frame]);
    expect(series).toHaveLength(1);
    expect(series[0].field.name).toBe('reading');
  });

  test('getValueSeries throws for frames without any bindable field', () => {
    const frame = toDataFrame({ name: 'empty', fields: [] });
    expect(() => getValueSeries(frame, [frame])).toThrow();
  });

  test('buildQueryOptions lists every value field of a wide frame', () => {
    const frame = wideFrame();
    const options = buildQueryOptions([frame]);
    expect(options.map((o) => o.value)).toEqual(['core-a in', 'core-a out', 'STATUS X']);
  });
});

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

describe('traffic-flow animation mapping (#273)', () => {
  test('clampUtilization bounds and sanitizes', () => {
    expect(clampUtilization(0.5)).toBe(0.5);
    expect(clampUtilization(4)).toBe(1);
    expect(clampUtilization(0)).toBe(0);
    expect(clampUtilization(-3)).toBe(0);
    expect(clampUtilization(NaN)).toBe(0);
    // Non-finite input is invalid -> no dots, not max speed.
    expect(clampUtilization(Infinity)).toBe(0);
    expect(clampUtilization(-Infinity)).toBe(0);
  });

  test('speed follows 20 + sqrt(u) * 100 and gates zero traffic', () => {
    expect(utilizationToSpeed(0)).toBe(0);
    expect(utilizationToSpeed(NaN)).toBe(0);
    expect(utilizationToSpeed(-1)).toBe(0);
    expect(utilizationToSpeed(1)).toBe(120);
    expect(utilizationToSpeed(0.25)).toBe(70);
    // Over-bandwidth clamps to the max speed instead of racing away.
    expect(utilizationToSpeed(9)).toBe(120);
  });

  test('dot count follows 1 + round(u * 7) and gates zero traffic', () => {
    expect(utilizationToDotCount(0)).toBe(0);
    expect(utilizationToDotCount(NaN)).toBe(0);
    expect(utilizationToDotCount(-0.5)).toBe(0);
    expect(utilizationToDotCount(0.01)).toBe(1);
    expect(utilizationToDotCount(0.5)).toBe(5);
    expect(utilizationToDotCount(1)).toBe(8);
    expect(utilizationToDotCount(50)).toBe(8);
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

describe('legacy knightss27 query-name rebind (#331)', () => {
  // A table-style frame (Infinity JSON, SQL) where the value is NOT at index 1:
  // the original plugin stored getFieldDisplayName(fields[1], frame) — here the
  // string column — while this fork binds by the first numeric field's name.
  const tableFrame = (refId: string, legacyName: string, currentName: string) =>
    toDataFrame({
      refId,
      fields: [
        { name: 'Time', values: [1, 2] },
        { name: 'iface', type: FieldType.string, values: ['a', 'b'], config: { displayNameFromDS: legacyName } },
        { name: 'bps', values: [100, 200], config: { displayNameFromDS: currentName } },
      ],
    });

  const wmWithQueries = (names: { [path: string]: string }): Weathermap => {
    const wm = JSON.parse(JSON.stringify(getData(theme)));
    wm.links[0].sides.A.query = names.aQuery;
    wm.links[0].sides.A.bandwidthQuery = names.aBandwidth;
    wm.links[0].sides.Z.query = names.zQuery;
    wm.links[0].statusQuery = names.status;
    wm.links[0].tooltipMetrics = [{ label: 'm', queryA: names.metricA, queryZ: names.metricZ }];
    wm.nodes[0].statusQuery = names.nodeStatus;
    wm.nodes[0].tooltipMetrics = [{ label: 'n', query: names.nodeMetric }];
    return wm;
  };

  test('getLegacyDataFrameName reproduces the old fields[1] naming', () => {
    const frame = tableFrame('A', 'Interface A', 'Throughput A');
    expect(getLegacyDataFrameName(frame)).toBe('Interface A');
    expect(getDataFrameName(frame, [frame])).toBe('Throughput A');
    expect(getLegacyDataFrameName(toDataFrame({ fields: [] }))).toBeUndefined();
  });

  test('aliases map legacy names to current names, unambiguously only', () => {
    const frames = [tableFrame('A', 'Interface A', 'Throughput A'), tableFrame('B', 'Interface B', 'Throughput B')];
    const aliases = buildLegacyNameAliases(frames);
    expect(aliases.get('Interface A')).toBe('Throughput A');
    expect(aliases.get('Interface B')).toBe('Throughput B');
    expect(aliases.size).toBe(2);
  });

  test('a legacy name shared by two frames produces no alias', () => {
    const frames = [tableFrame('A', 'SAME', 'Throughput A'), tableFrame('B', 'SAME', 'Throughput B')];
    expect(buildLegacyNameAliases(frames).size).toBe(0);
  });

  test('a legacy name that equals a live current name is never redirected', () => {
    // Frame B's current name IS "Interface A" — redirecting it would break a
    // working binding, so no alias may exist for it.
    const frames = [tableFrame('A', 'Interface A', 'Throughput A'), tableFrame('B', 'Interface B', 'Interface A')];
    const aliases = buildLegacyNameAliases(frames);
    expect(aliases.has('Interface A')).toBe(false);
    expect(aliases.get('Interface B')).toBe('Interface A');
  });

  test('rebind rewrites every query-holding field to the current name', () => {
    const frames = [tableFrame('A', 'Interface A', 'Throughput A'), tableFrame('B', 'Interface B', 'Throughput B')];
    const wm = wmWithQueries({
      aQuery: 'Interface A',
      aBandwidth: 'Interface B',
      zQuery: 'Interface B',
      status: 'Interface A',
      metricA: 'Interface A',
      metricZ: 'Interface B',
      nodeStatus: 'Interface B',
      nodeMetric: 'Interface A',
    });
    const rebound = rebindLegacyQueryNames(wm, frames);
    expect(rebound).not.toBeNull();
    expect(rebound!.links[0].sides.A.query).toBe('Throughput A');
    expect(rebound!.links[0].sides.A.bandwidthQuery).toBe('Throughput B');
    expect(rebound!.links[0].sides.Z.query).toBe('Throughput B');
    expect(rebound!.links[0].statusQuery).toBe('Throughput A');
    expect(rebound!.links[0].tooltipMetrics![0].queryA).toBe('Throughput A');
    expect(rebound!.links[0].tooltipMetrics![0].queryZ).toBe('Throughput B');
    expect(rebound!.nodes[0].statusQuery).toBe('Throughput B');
    expect(rebound!.nodes[0].tooltipMetrics![0].query).toBe('Throughput A');
    // the input map is never mutated
    expect(wm.links[0].sides.A.query).toBe('Interface A');
  });

  test('a map whose names already resolve returns null (steady state)', () => {
    const frames = [tableFrame('A', 'Interface A', 'Throughput A')];
    const wm = wmWithQueries({ aQuery: 'Throughput A' });
    expect(rebindLegacyQueryNames(wm, frames)).toBeNull();
  });

  test('template-variable and unknown query strings pass through untouched', () => {
    const frames = [tableFrame('A', 'Interface A', 'Throughput A')];
    const wm = wmWithQueries({ aQuery: '$myVar', zQuery: 'not-a-known-name', aBandwidth: 'Interface A' });
    const rebound = rebindLegacyQueryNames(wm, frames);
    expect(rebound).not.toBeNull();
    expect(rebound!.links[0].sides.A.query).toBe('$myVar');
    expect(rebound!.links[0].sides.Z.query).toBe('not-a-known-name');
    expect(rebound!.links[0].sides.A.bandwidthQuery).toBe('Throughput A');
  });

  test('no frames or no aliasable frames yields no rewrite', () => {
    const wm = wmWithQueries({ aQuery: 'Interface A' });
    expect(rebindLegacyQueryNames(wm, [])).toBeNull();
    // time-series frames where old and new naming agree produce no aliases
    const agreeing = toDataFrame({
      refId: 'A',
      fields: [
        { name: 'Time', values: [1, 2] },
        { name: 'Value', values: [1, 2], config: { displayNameFromDS: 'wan-in' } },
      ],
    });
    expect(rebindLegacyQueryNames(wm, [agreeing])).toBeNull();
  });
});

// Codex review hardening (#333): aliases must also be unambiguous on the
// TARGET side, and the steady state must not clone.
describe('legacy rebind alias target guards (#331 review)', () => {
  const tableFrame = (refId: string, legacyName: string, currentName: string) =>
    toDataFrame({
      refId,
      fields: [
        { name: 'Time', values: [1, 2] },
        { name: 'iface', type: FieldType.string, values: ['a', 'b'], config: { displayNameFromDS: legacyName } },
        { name: 'bps', values: [100, 200], config: { displayNameFromDS: currentName } },
      ],
    });

  test('aliases whose current target name is duplicated are rejected', () => {
    // Two frames with distinct legacy names but the SAME current name: the
    // frame map resolves that name first-match, so redirecting either legacy
    // name onto it could silently bind the wrong series.
    const frames = [tableFrame('A', 'Interface A', 'DUP'), tableFrame('B', 'Interface B', 'DUP')];
    expect(buildLegacyNameAliases(frames).size).toBe(0);
  });

  test('a duplicated target only disqualifies its own aliases', () => {
    const frames = [
      tableFrame('A', 'Interface A', 'DUP'),
      tableFrame('B', 'Interface B', 'DUP'),
      tableFrame('C', 'Interface C', 'Throughput C'),
    ];
    const aliases = buildLegacyNameAliases(frames);
    expect(aliases.size).toBe(1);
    expect(aliases.get('Interface C')).toBe('Throughput C');
  });

  test('steady state returns null even when aliases exist (no clone path)', () => {
    // The datasource's legacy/current names permanently differ, so the alias
    // map is non-empty on every refresh — but nothing stored matches, so the
    // fast path must return null without rewriting.
    const frames = [tableFrame('A', 'Interface A', 'Throughput A')];
    const wm = JSON.parse(JSON.stringify(getData(theme)));
    wm.links[0].sides.A.query = 'Throughput A';
    expect(buildLegacyNameAliases(frames).size).toBe(1);
    expect(rebindLegacyQueryNames(wm, frames)).toBeNull();
  });
});

// Node positions are hostile input (#339): saved options are hand-editable and
// can arrive truncated. Reading position[0] directly threw on a missing value
// and seeded NaN through every derived coordinate.
describe('finitePosition (#339)', () => {
  test('passes through a well-formed position', () => {
    expect(finitePosition([200, 300])).toEqual([200, 300]);
    expect(finitePosition([0, 0])).toEqual([0, 0]);
    expect(finitePosition([-40, -12.5])).toEqual([-40, -12.5]);
  });

  test('accepts numeric strings, which already rendered correctly', () => {
    // Every consumer coerced these through arithmetic, so maps using them work
    // today — rejecting them now would be a regression.
    expect(finitePosition(['200', '300'])).toEqual([200, 300]);
  });

  test.each([
    ['NaN coordinate', [NaN, 300]],
    ['Infinity coordinate', [Infinity, 300]],
    ['-Infinity coordinate', [300, -Infinity]],
    ['short array', [200]],
    ['empty array', []],
    ['null', null],
    ['undefined', undefined],
    ['plain object', {}],
    ['string', 'nope'],
    ['number', 42],
    ['array of objects', [{}, {}]],
    ['nested arrays', [[1], [2]]],
  ])('coerces %s to the fallback instead of throwing', (_name, input) => {
    const [x, y] = finitePosition(input);
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);
  });

  test('a partially valid position keeps the readable coordinate', () => {
    expect(finitePosition([200, NaN])).toEqual([200, 0]);
    expect(finitePosition([NaN, 300])).toEqual([0, 300]);
  });

  test('honours an explicit fallback', () => {
    expect(finitePosition(null, 50)).toEqual([50, 50]);
    expect(finitePosition([200, NaN], 50)).toEqual([200, 50]);
  });

  test('a non-finite fallback cannot reintroduce what this helper removes', () => {
    expect(finitePosition([NaN, 0], NaN)).toEqual([0, 0]);
    expect(finitePosition(null, Infinity)).toEqual([0, 0]);
    expect(finitePosition([undefined, undefined], -Infinity)).toEqual([0, 0]);
  });

  test('never mutates or aliases its input', () => {
    const input: [number, number] = [10, 20];
    const out = finitePosition(input);
    expect(out).not.toBe(input);
    expect(input).toEqual([10, 20]);
  });
});

// Embedded background images (#344). The security boundary matters most here:
// sanitizeUrl also guards NAVIGATION targets, so data: URIs must be accepted
// by the image helper WITHOUT ever becoming acceptable to navigate to.
describe('sanitizeImageSource (#344)', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo=';
  const SVG = 'data:image/svg+xml;base64,PHN2Zy8+';

  test('accepts the image data URI types we support', () => {
    for (const type of ['png', 'jpeg', 'jpg', 'gif', 'webp', 'svg+xml']) {
      const uri = `data:image/${type};base64,PHN2Zy8+`;
      expect(sanitizeImageSource(uri)).toBe(uri);
    }
  });

  test('still accepts everything a linked source could be', () => {
    expect(sanitizeImageSource('https://example.com/bg.png')).toBe('https://example.com/bg.png');
    expect(sanitizeImageSource('http://localhost:8080/rack2.svg')).toBe('http://localhost:8080/rack2.svg');
    expect(sanitizeImageSource('/public/img/bg.png')).toBe('/public/img/bg.png');
    expect(sanitizeImageSource('  https://example.com/bg.png  ')).toBe('https://example.com/bg.png');
  });

  test('rejects non-image and script-bearing data URIs', () => {
    expect(sanitizeImageSource('data:text/html;base64,PHNjcmlwdD4=')).toBe('');
    expect(sanitizeImageSource('data:application/javascript;base64,YWxlcnQoMSk=')).toBe('');
    expect(sanitizeImageSource('data:image/svg+xml,<svg onload=alert(1)>')).toBe(''); // not base64
    expect(sanitizeImageSource('data:image/png,rawbytes')).toBe(''); // missing base64 marker
    expect(sanitizeImageSource('data:image/tiff;base64,AAAA')).toBe(''); // unsupported type
  });

  test('rejects the schemes sanitizeUrl rejects', () => {
    expect(sanitizeImageSource('javascript:alert(1)')).toBe('');
    expect(sanitizeImageSource('java\nscript:alert(1)')).toBe('');
    expect(sanitizeImageSource('//evil.example.com/bg.png')).toBe('');
    expect(sanitizeImageSource('')).toBe('');
    expect(sanitizeImageSource(null)).toBe('');
    expect(sanitizeImageSource(undefined)).toBe('');
  });

  test('does NOT widen the shared navigation guard', () => {
    // The whole reason this helper exists: a data: URI is fine as an image and
    // must stay unusable as a link target.
    expect(sanitizeUrl(PNG)).toBe('');
    expect(sanitizeUrl(SVG)).toBe('');
    expect(sanitizeImageSource(PNG)).toBe(PNG);
    expect(sanitizeImageSource(SVG)).toBe(SVG);
  });

  test('rejects a truncated base64 payload at the sanitizer, not at load time', () => {
    // Canonical base64 is whole 4-char groups; without a length check a
    // truncated payload passed here and only surfaced later as a broken image.
    expect(sanitizeImageSource('data:image/png;base64,iVBORw0KGg')).toBe(''); // 10 chars
    expect(sanitizeImageSource('data:image/png;base64,iVBORw0KGgo')).toBe(''); // 11 chars
    expect(sanitizeImageSource('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo='); // 12
  });

  test('strips whitespace inside a data URI rather than rejecting it', () => {
    // Base64 wrapped across lines (some encoders do this) still resolves.
    expect(sanitizeImageSource('data:image/png;base64,iVBO\n Rw0K Ggo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
  });
});

describe('background image size limits (#344)', () => {
  test('warn threshold sits below the hard cap', () => {
    expect(BG_IMAGE_WARN_BYTES).toBeLessThan(BG_IMAGE_MAX_BYTES);
    expect(BG_IMAGE_WARN_BYTES).toBe(1024 * 1024);
    expect(BG_IMAGE_MAX_BYTES).toBe(4 * 1024 * 1024);
  });

  test('formatBytes reads the way an editor message should', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(5 * 1024)).toBe('5.0 KB');
    expect(formatBytes(53 * 1024)).toBe('53 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(4 * 1024 * 1024)).toBe('4.0 MB');
  });

  test('formatBytes never emits NaN for junk input', () => {
    expect(formatBytes(NaN)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(Infinity)).toBe('0 B');
  });
});

describe('polyline path helpers (#332)', () => {
  // A 3-4-5 L-shape: (0,0) -> (30,0) -> (30,40). Segment lengths 30 and 40.
  const L = [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 30, y: 40 },
  ];

  test('pathTotalLength sums segments; degenerate inputs are 0', () => {
    expect(pathTotalLength(L)).toBe(70);
    expect(pathTotalLength([{ x: 5, y: 5 }])).toBe(0);
    expect(pathTotalLength([])).toBe(0);
  });

  test('pointAtPathLength walks across joints and clamps both ends', () => {
    expect(pointAtPathLength(L, 15)).toEqual({ x: 15, y: 0 });
    expect(pointAtPathLength(L, 30)).toEqual({ x: 30, y: 0 }); // exactly at the joint
    expect(pointAtPathLength(L, 50)).toEqual({ x: 30, y: 20 }); // into the second segment
    expect(pointAtPathLength(L, -5)).toEqual({ x: 0, y: 0 }); // clamped to start
    expect(pointAtPathLength(L, 999)).toEqual({ x: 30, y: 40 }); // clamped to end
  });

  test('pointAtPathPercent maps 0/0.5/1 to start/arc-midpoint/end', () => {
    expect(pointAtPathPercent(L, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAtPathPercent(L, 0.5)).toEqual({ x: 30, y: 5 }); // 35 of 70 = 5 into segment 2
    expect(pointAtPathPercent(L, 1)).toEqual({ x: 30, y: 40 });
  });

  test('directionAtPathLength returns the containing segment direction, skipping zero-length segments', () => {
    expect(directionAtPathLength(L, 10)).toEqual({ x: 1, y: 0 });
    expect(directionAtPathLength(L, 50)).toEqual({ x: 0, y: 1 });
    // Duplicate point creates a zero-length segment that must not yield NaN.
    const withDup = [L[0], L[1], L[1], L[2]];
    expect(directionAtPathLength(withDup, 50)).toEqual({ x: 0, y: 1 });
    // A fully degenerate path falls back to +x.
    expect(
      directionAtPathLength(
        [
          { x: 3, y: 3 },
          { x: 3, y: 3 },
        ],
        0
      )
    ).toEqual({ x: 1, y: 0 });
  });

  test('subPath keeps interior bends and interpolates both cut points', () => {
    expect(subPath(L, 10, 50)).toEqual([
      { x: 10, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 20 },
    ]);
    // Cuts inside a single segment produce a straight two-point path.
    expect(subPath(L, 5, 25)).toEqual([
      { x: 5, y: 0 },
      { x: 25, y: 0 },
    ]);
    // Degenerate range collapses to two identical points.
    expect(subPath(L, 30, 30)).toEqual([
      { x: 30, y: 0 },
      { x: 30, y: 0 },
    ]);
    // A full-range subPath reproduces the whole polyline.
    expect(subPath(L, 0, 70)).toEqual(L);
  });

  test('pathToSvg and pathToPoints serialize for animateMotion and <polyline>', () => {
    expect(pathToSvg(L)).toBe('M 0 0 L 30 0 L 30 40');
    expect(pathToPoints(L)).toBe('0,0 30,0 30,40');
  });

  test('spreadLabels slides polyline labels along the path, not the chord', () => {
    // One label on the L-shape path with no competitors: keeps its preferred
    // offset, and that offset resolves to a point ON the path.
    const result = spreadLabels([
      {
        key: 'wp:A',
        segment: { x1: 0, y1: 0, x2: 30, y2: 40 },
        path: L,
        offsetPercent: 50,
        width: 10,
        height: 5,
      },
    ]);
    expect(result.get('wp:A')).toBe(50);
  });
});

describe('waypoint sanitization and VIA interop (#332 review hardening)', () => {
  test('sanitizeWaypoints drops malformed entries and non-arrays', () => {
    expect(sanitizeWaypoints(undefined)).toEqual([]);
    expect(sanitizeWaypoints('junk')).toEqual([]);
    expect(sanitizeWaypoints({ x: 1, y: 2 })).toEqual([]);
    expect(
      sanitizeWaypoints([
        { x: 10, y: 20 },
        { x: NaN, y: 5 },
        { x: 5, y: Infinity },
        null,
        'garbage',
        { x: '30', y: 40 },
        { y: 50 },
        { x: 60, y: 70 },
      ])
    ).toEqual([
      { x: 10, y: 20 },
      { x: 60, y: 70 },
    ]);
    // returns fresh objects, never aliases of the input
    const src = [{ x: 1, y: 2 }];
    const out = sanitizeWaypoints(src);
    expect(out[0]).not.toBe(src[0]);
  });

  test('inserting a VIA clears waypoints from BOTH resulting segments', () => {
    const wm: Weathermap = JSON.parse(JSON.stringify(getData(theme)));
    wm.links[0].waypoints = [
      { x: 250, y: 200 },
      { x: 350, y: 200 },
    ];
    const updated = addViaToLink(wm, wm.links[0].id, theme);
    expect(updated.links).toHaveLength(2);
    // Copying the full A->Z bend list onto each half would make both halves
    // retrace every bend (looping); a VIA insert resets polyline routing.
    expect(updated.links[0].waypoints).toBeUndefined();
    expect(updated.links[1].waypoints).toBeUndefined();
  });

  test('removing a VIA concatenates the two segments’ waypoints in path order', () => {
    const wm: Weathermap = JSON.parse(JSON.stringify(getData(theme)));
    const split = addViaToLink(wm, wm.links[0].id, theme);
    split.links[0].waypoints = [{ x: 210, y: 250 }];
    split.links[1].waypoints = [{ x: 390, y: 250 }];
    const conn = split.nodes.find((n) => n.isConnection)!;
    const merged = removeVia(split, conn.id);
    expect(merged.links).toHaveLength(1);
    expect(merged.links[0].waypoints).toEqual([
      { x: 210, y: 250 },
      { x: 390, y: 250 },
    ]);
  });

  test('removing a VIA between waypoint-less segments stays waypoint-less', () => {
    const wm: Weathermap = JSON.parse(JSON.stringify(getData(theme)));
    const split = addViaToLink(wm, wm.links[0].id, theme);
    const conn = split.nodes.find((n) => n.isConnection)!;
    const merged = removeVia(split, conn.id);
    expect(merged.links[0].waypoints).toBeUndefined();
  });
});

describe('roundPathCorners (#336)', () => {
  const L = [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 30, y: 40 },
  ];

  test('radius 0 and bend-less paths pass through untouched', () => {
    expect(roundPathCorners(L, 0)).toBe(L);
    const straight = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(roundPathCorners(straight, 10)).toBe(straight);
  });

  test('a bend is replaced by a curve entering and exiting radius px from the corner', () => {
    const out = roundPathCorners(L, 10);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[out.length - 1]).toEqual({ x: 30, y: 40 });
    // curve entry: 10px before the corner along segment 1
    expect(out[1]).toEqual({ x: 20, y: 0 });
    // curve exit: 10px after the corner along segment 2
    expect(out[out.length - 2]).toEqual({ x: 30, y: 10 });
    // the sharp vertex itself is gone
    expect(out.some((p) => p.x === 30 && p.y === 0)).toBe(false);
    // rounding cuts the corner: total arc length strictly decreases
    expect(pathTotalLength(out)).toBeLessThan(pathTotalLength(L));
  });

  test('radius clamps to half of the shorter adjacent segment', () => {
    const out = roundPathCorners(L, 100); // min(100, 30/2, 40/2) -> symmetric r = 15
    expect(out[1]).toEqual({ x: 15, y: 0 });
    expect(out[out.length - 2]).toEqual({ x: 30, y: 15 });
  });

  test('zero-length segments at a bend are kept as sharp points, never NaN', () => {
    const withDup = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }];
    const out = roundPathCorners(withDup, 10);
    out.forEach((p) => {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    });
  });
});

describe('nearestSegmentIndex (#336)', () => {
  const path = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];
  test('picks the segment closest to the point', () => {
    expect(nearestSegmentIndex(path, { x: 50, y: 10 })).toBe(0);
    expect(nearestSegmentIndex(path, { x: 90, y: 50 })).toBe(1);
  });
  test('clamps beyond segment ends and handles degenerate paths', () => {
    expect(nearestSegmentIndex(path, { x: -50, y: 5 })).toBe(0);
    expect(nearestSegmentIndex([{ x: 5, y: 5 }], { x: 0, y: 0 })).toBe(0);
    expect(
      nearestSegmentIndex(
        [
          { x: 5, y: 5 },
          { x: 5, y: 5 },
        ],
        { x: 0, y: 0 }
      )
    ).toBe(0);
  });
});

// linkOffset on bent paths (#336 item 3). The rejected alternative was
// per-segment miter offsetting; these tests pin the properties that made
// chord-normal translation the correct operation instead.
describe('chordNormalOffset and path translation (#336)', () => {
  const segments = (pts: Array<{ x: number; y: number }>) =>
    pts.slice(1).map((p, i) => ({ x: p.x - pts[i].x, y: p.y - pts[i].y }));
  const length = (pts: Array<{ x: number; y: number }>) =>
    segments(pts).reduce((t, s) => t + Math.hypot(s.x, s.y), 0);

  test('offsets perpendicular to the chord, keeping the pre-#336 sign convention', () => {
    // A horizontal A->Z chord offsets straight down (+y), exactly as the
    // straight-link code did before waypoints existed.
    expect(chordNormalOffset({ x: 0, y: 0 }, { x: 100, y: 0 }, 20)).toEqual({ x: 0, y: 20 });
    // A vertical chord offsets to -x.
    expect(chordNormalOffset({ x: 0, y: 0 }, { x: 0, y: 100 }, 20)).toEqual({ x: -20, y: 0 });
    // Reversing the chord reverses the shift.
    expect(chordNormalOffset({ x: 100, y: 0 }, { x: 0, y: 0 }, 20)).toEqual({ x: 0, y: -20 });
  });

  test('the offset vector has exactly the requested magnitude on any chord angle', () => {
    const v = chordNormalOffset({ x: 0, y: 0 }, { x: 30, y: 40 }, 12);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(12, 10);
    // Perpendicular to the chord.
    expect(v.x * 30 + v.y * 40).toBeCloseTo(0, 10);
  });

  test('returns a zero vector for absent, zero and non-finite offsets', () => {
    const a = { x: 0, y: 0 };
    const z = { x: 100, y: 0 };
    expect(chordNormalOffset(a, z, undefined)).toEqual({ x: 0, y: 0 });
    expect(chordNormalOffset(a, z, 0)).toEqual({ x: 0, y: 0 });
    expect(chordNormalOffset(a, z, NaN)).toEqual({ x: 0, y: 0 });
    expect(chordNormalOffset(a, z, Infinity)).toEqual({ x: 0, y: 0 });
  });

  test('returns a zero vector for coincident endpoints instead of NaN', () => {
    const v = chordNormalOffset({ x: 50, y: 50 }, { x: 50, y: 50 }, 20);
    expect(v).toEqual({ x: 0, y: 0 });
    expect(Number.isNaN(v.x) || Number.isNaN(v.y)).toBe(false);
  });

  test('translation preserves arc length exactly, at every offset', () => {
    // Arc length is the parameter arrows, labels, collision spreading and
    // animation duration all key off. Per-segment offsetting changes it;
    // translation cannot.
    const path = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 60 },
      { x: 160, y: 60 },
    ];
    const rounded = roundPathCorners(path, 18);
    for (const offset of [-40, -18, -6, 6, 18, 40]) {
      const shifted = translatePath(rounded, chordNormalOffset(rounded[0], rounded[rounded.length - 1], offset));
      expect(length(shifted)).toBeCloseTo(length(rounded), 9);
      expect(shifted).toHaveLength(rounded.length);
    }
  });

  test('translation never reverses a segment, so it cannot introduce a self-intersection', () => {
    // This shape is the miter-offset failure case: a short (12px) segment
    // between two same-handed bends. Offsetting it per-segment by 15px flips
    // that middle segment and the path doubles back through itself.
    // Translation leaves every segment direction identical.
    const path = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 12 },
      { x: 0, y: 12 },
    ];
    const shifted = translatePath(path, chordNormalOffset(path[0], path[path.length - 1], 15));
    const before = segments(path);
    const after = segments(shifted);
    after.forEach((s, i) => {
      expect(s.x).toBeCloseTo(before[i].x, 10);
      expect(s.y).toBeCloseTo(before[i].y, 10);
    });
  });

  test('two opposite offsets keep a constant separation the whole way along', () => {
    // What linkOffset is actually for: spreading a parallel bundle. Every
    // vertex pair stays exactly |offsetA - offsetZ| apart.
    const path = [
      { x: 0, y: 0 },
      { x: 50, y: -30 },
      { x: 120, y: -30 },
      { x: 170, y: 0 },
    ];
    const lo = translatePath(path, chordNormalOffset(path[0], path[3], -8));
    const hi = translatePath(path, chordNormalOffset(path[0], path[3], 8));
    lo.forEach((p, i) => expect(Math.hypot(hi[i].x - p.x, hi[i].y - p.y)).toBeCloseTo(16, 9));
  });

  test('translating by a zero vector is the identity', () => {
    const path = [
      { x: 3, y: 4 },
      { x: 9, y: 1 },
    ];
    expect(translatePath(path, { x: 0, y: 0 })).toEqual(path);
  });

  test('produces fresh objects and never mutates its input', () => {
    const path = [
      { x: 3, y: 4 },
      { x: 9, y: 1 },
    ];
    const snapshot = JSON.parse(JSON.stringify(path));
    const shifted = translatePath(path, { x: 5, y: 5 });
    expect(path).toEqual(snapshot);
    expect(shifted[0]).not.toBe(path[0]);
    const p = { x: 1, y: 2 };
    expect(translatePoint(p, { x: 0, y: 0 })).not.toBe(p);
  });

  test('rounding corners then translating equals translating then rounding', () => {
    // Rounding is translation-equivariant, so the render order of the two is
    // free — the offset can be applied to the raw waypoints before rounding.
    const path = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 60 },
    ];
    const delta = chordNormalOffset(path[0], path[2], 14);
    const roundThenShift = translatePath(roundPathCorners(path, 20), delta);
    const shiftThenRound = roundPathCorners(translatePath(path, delta), 20);
    expect(roundThenShift).toHaveLength(shiftThenRound.length);
    roundThenShift.forEach((p, i) => {
      expect(p.x).toBeCloseTo(shiftThenRound[i].x, 9);
      expect(p.y).toBeCloseTo(shiftThenRound[i].y, 9);
    });
  });
});

// Gradient coloring on bent paths (#336 item 4). An SVG linearGradient axis is
// always straight, so the stops are repositioned instead: each vertex sits at
// its chord projection, colored by its ARC-LENGTH fraction.
describe('pathGradientStops (#336)', () => {
  const RED = '#ff0000';
  const BLUE = '#0000ff';

  test('a straight link keeps the plain two-stop chord gradient', () => {
    // The regression guarantee: no waypoints must render exactly as before.
    expect(
      pathGradientStops(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        RED,
        BLUE
      )
    ).toEqual([
      { offset: 0, color: RED },
      { offset: 1, color: BLUE },
    ]);
  });

  test('a collinear midpoint keeps the ramp linear (projection == arc length)', () => {
    const stops = pathGradientStops(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ],
      RED,
      BLUE
    );
    expect(stops.map((s) => s.offset)).toEqual([0, 0.5, 1]);
    // Halfway along, the color is the halfway blend.
    expect(stops[1].color).toBe('rgb(128,0,128)');
  });

  test('a bend puts the mid-path color where the path is halfway, not the chord', () => {
    // An isoceles "roof": both segments are 50 long, so the apex is at 50% of
    // the ARC length but only 50% of the chord by projection — and the color
    // there must be the 50% blend.
    const stops = pathGradientStops(
      [
        { x: 0, y: 0 },
        { x: 40, y: 30 },
        { x: 80, y: 0 },
      ],
      RED,
      BLUE
    );
    expect(stops).toHaveLength(3);
    expect(stops[1].color).toBe('rgb(128,0,128)');
    expect(stops[0].offset).toBe(0);
    expect(stops[2].offset).toBe(1);
  });

  test('a bow-out path shifts stops away from their arc-length fraction', () => {
    // The whole point of the fix: on this path the apex is at 50% of the arc
    // length but only 25% of the chord, so the 50% color must be pinned to
    // offset 0.25 — with the old two-stop gradient it appeared at 0.5.
    const stops = pathGradientStops(
      [
        { x: 0, y: 0 },
        { x: 25, y: 60 },
        { x: 50, y: 0 },
      ],
      RED,
      BLUE
    );
    expect(stops[1].offset).toBeCloseTo(0.5, 6);
    // Now an asymmetric bend: apex much closer to A along the chord.
    const asym = pathGradientStops(
      [
        { x: 0, y: 0 },
        { x: 10, y: 60 },
        { x: 100, y: 0 },
      ],
      RED,
      BLUE
    );
    expect(asym[1].offset).toBeCloseTo(0.1, 6); // chord projection
    // ...while its color is the arc-length blend, which is NOT 10%.
    const channels = /rgb\((\d+),/.exec(asym[1].color);
    expect(channels).not.toBeNull();
    const midChannel = Number(channels![1]);
    expect(midChannel).toBeLessThan(255 * 0.9); // red has decayed well past 10%
    expect(midChannel).toBeGreaterThan(255 * 0.2);
  });

  test('offsets are non-decreasing even when the path doubles back', () => {
    // A hairpin projects non-monotonically; SVG requires sorted offsets.
    const stops = pathGradientStops(
      [
        { x: 0, y: 0 },
        { x: 100, y: 10 },
        { x: 40, y: 20 },
        { x: 60, y: 0 },
      ],
      RED,
      BLUE
    );
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i].offset).toBeGreaterThanOrEqual(stops[i - 1].offset);
    }
    expect(stops[0].offset).toBe(0);
    expect(stops[stops.length - 1].offset).toBe(1);
  });

  test('every stop stays inside 0..1 and carries a parseable color', () => {
    const stops = pathGradientStops(roundPathCorners(
      [
        { x: 0, y: 0 },
        { x: 80, y: 0 },
        { x: 80, y: 60 },
        { x: 160, y: 60 },
      ],
      18
    ), RED, BLUE);
    expect(stops.length).toBeGreaterThan(8); // dense rounded path
    stops.forEach((s) => {
      expect(s.offset).toBeGreaterThanOrEqual(0);
      expect(s.offset).toBeLessThanOrEqual(1);
      expect(s.color).toMatch(/^rgba?\([\d.,]+\)$|^#[0-9a-fA-F]+$/);
    });
  });

  test('falls back to two stops for coincident endpoints and zero-length paths', () => {
    const closed = [
      { x: 10, y: 10 },
      { x: 60, y: 40 },
      { x: 10, y: 10 },
    ];
    expect(pathGradientStops(closed, RED, BLUE)).toEqual([
      { offset: 0, color: RED },
      { offset: 1, color: BLUE },
    ]);
    const degenerate = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ];
    expect(pathGradientStops(degenerate, RED, BLUE)).toEqual([
      { offset: 0, color: RED },
      { offset: 1, color: BLUE },
    ]);
  });

  test('falls back to two stops rather than mis-rendering an unreadable color', () => {
    const bent = [
      { x: 0, y: 0 },
      { x: 40, y: 30 },
      { x: 80, y: 0 },
    ];
    // Named CSS colors are not handled by the parser — keep the original
    // strings instead of emitting black.
    expect(pathGradientStops(bent, 'red', BLUE)).toEqual([
      { offset: 0, color: 'red' },
      { offset: 1, color: BLUE },
    ]);
  });

  test('preserves alpha when the scale colors are translucent', () => {
    const stops = pathGradientStops(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ],
      'rgba(255, 0, 0, 0)',
      'rgba(0, 0, 255, 1)'
    );
    expect(stops[1].color).toBe('rgba(128,0,128,0.5)');
  });
});
