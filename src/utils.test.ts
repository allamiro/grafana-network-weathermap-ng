import { defaultNodes, getData, legacyWeathermap, theme } from 'testData';
import { DrawnNode, Weathermap } from 'types';
import {
  addViaToLink,
  aggregateFieldValues,
  calculateRectangleAutoHeight,
  calculateRectangleAutoWidth,
  CURRENT_VERSION,
  getSolidFromAlphaColor,
  handleVersionedStateUpdates,
  isSafeUrl,
  measureText,
  nearestMultiple,
  getTimeField,
  removeVia,
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
