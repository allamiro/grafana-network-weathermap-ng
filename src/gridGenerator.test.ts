import { generatePortGrid, PortGridOptions } from 'gridGenerator';
import { theme } from 'testData';

const base: PortGridOptions = {
  count: 24,
  rows: 1,
  cols: 24,
  labelPattern: 'Gi1/0/{n}',
  originX: 100,
  originY: 100,
  hSpacing: 20,
  vSpacing: 30,
};

test('generates a 24-port single-row switch grid', () => {
  const nodes = generatePortGrid(base, theme);
  expect(nodes).toHaveLength(24);
  // Sequential labels from the pattern.
  expect(nodes[0].label).toBe('Gi1/0/1');
  expect(nodes[23].label).toBe('Gi1/0/24');
  // Single row: y constant, x steps by hSpacing.
  expect(nodes[0].position).toEqual([100, 100]);
  expect(nodes[1].position).toEqual([120, 100]);
  expect(nodes[23].position).toEqual([100 + 23 * 20, 100]);
  // Generated nodes are plain, editable nodes (not connections) with unique ids.
  expect(nodes.every((n) => n.isConnection === false)).toBe(true);
  expect(new Set(nodes.map((n) => n.id)).size).toBe(24);
});

test('generates a 48-port two-row grid with odd/even faceplate ordering', () => {
  const nodes = generatePortGrid({ ...base, count: 48, rows: 2, cols: 24, ordering: 'odd-even' }, theme);
  expect(nodes).toHaveLength(48);
  // Odd ports on the top row, even ports directly below, columns advancing every pair.
  expect(nodes[0].position).toEqual([100, 100]); // port 1 — top, col 0
  expect(nodes[1].position).toEqual([100, 130]); // port 2 — bottom, col 0
  expect(nodes[2].position).toEqual([120, 100]); // port 3 — top, col 1
  expect(nodes[3].position).toEqual([120, 130]); // port 4 — bottom, col 1
  expect(nodes[47].label).toBe('Gi1/0/48');
});

test('column-major ordering fills top-to-bottom then across', () => {
  const nodes = generatePortGrid({ ...base, count: 6, rows: 3, cols: 2, ordering: 'column-major' }, theme);
  expect(nodes[0].position).toEqual([100, 100]); // col 0 row 0
  expect(nodes[1].position).toEqual([100, 130]); // col 0 row 1
  expect(nodes[2].position).toEqual([100, 160]); // col 0 row 2
  expect(nodes[3].position).toEqual([120, 100]); // col 1 row 0
});

test('honors a custom label pattern and start number', () => {
  const nodes = generatePortGrid({ ...base, count: 3, labelPattern: 'Te2/1/{n}', startNumber: 49 }, theme);
  expect(nodes.map((n) => n.label)).toEqual(['Te2/1/49', 'Te2/1/50', 'Te2/1/51']);
});

test('applies a status query template with {n} and {label} substitution', () => {
  const nodes = generatePortGrid(
    { ...base, count: 2, labelPattern: 'Gi1/0/{n}', statusQueryTemplate: 'ifOperStatus {label}' },
    theme
  );
  expect(nodes[0].statusQuery).toBe('ifOperStatus Gi1/0/1');
  expect(nodes[1].statusQuery).toBe('ifOperStatus Gi1/0/2');

  const byNumber = generatePortGrid({ ...base, count: 2, statusQueryTemplate: 'port_up{port="{n}"}' }, theme);
  expect(byNumber[0].statusQuery).toBe('port_up{port="1"}');
});

test('snaps positions to the grid when a grid size is given', () => {
  const nodes = generatePortGrid({ ...base, count: 2, originX: 103, originY: 97, hSpacing: 21, gridSize: 10 }, theme);
  // nearestMultiple snaps up (ceil): 103 -> 110, 97 -> 100; node 2 at 124 -> 130.
  expect(nodes[0].position).toEqual([110, 100]);
  expect(nodes[1].position).toEqual([130, 100]);
});

test('sets node padding from nodeSize when provided', () => {
  const nodes = generatePortGrid({ ...base, count: 1, nodeSize: 12 }, theme);
  expect(nodes[0].padding).toEqual({ horizontal: 12, vertical: 12 });
});

describe('invalid input', () => {
  test('rejects a non-positive port count', () => {
    expect(() => generatePortGrid({ ...base, count: 0 }, theme)).toThrow(/positive/i);
    expect(() => generatePortGrid({ ...base, count: -5 }, theme)).toThrow(/positive/i);
  });

  test('rejects a fractional port count', () => {
    expect(() => generatePortGrid({ ...base, count: 3.5 }, theme)).toThrow(/whole number/i);
  });

  test('rejects a grid too small to hold the ports', () => {
    expect(() => generatePortGrid({ ...base, count: 48, rows: 2, cols: 12 }, theme)).toThrow(/too few/i);
  });

  test('rejects non-finite spacing', () => {
    expect(() => generatePortGrid({ ...base, hSpacing: NaN }, theme)).toThrow(/spacing/i);
    expect(() => generatePortGrid({ ...base, vSpacing: Infinity }, theme)).toThrow(/spacing/i);
  });
});
