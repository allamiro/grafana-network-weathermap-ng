import {
  generatePortGrid,
  PortGridOptions,
  PORT_GRID_PRESETS,
  PORT_STATUS_UP_COLOR,
  PORT_STATUS_DOWN_COLOR,
} from 'gridGenerator';
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

test('status coloring stamps up/down mappings and a background fill on every port', () => {
  const nodes = generatePortGrid({ ...base, count: 3, statusColoring: true }, theme);
  for (const node of nodes) {
    expect(node.statusValueMappings).toEqual([
      { value: 0, color: PORT_STATUS_DOWN_COLOR },
      { value: 1, color: PORT_STATUS_UP_COLOR },
    ]);
    expect(node.nodeStatusColorTarget).toBe('background');
  }
});

test('status coloring is off unless requested (no mappings by default)', () => {
  const nodes = generatePortGrid({ ...base, count: 3 }, theme);
  expect(nodes.every((n) => n.statusValueMappings === undefined)).toBe(true);
});

describe('presets', () => {
  test('every device preset enables status coloring so it renders as a live board', () => {
    for (const preset of PORT_GRID_PRESETS) {
      expect(preset.values.statusColoring).toBe(true);
    }
  });

  test('every preset produces a valid grid of its stated count', () => {
    for (const preset of PORT_GRID_PRESETS) {
      const opts = { ...base, ...preset.values, originX: 0, originY: 0 } as PortGridOptions;
      const nodes = generatePortGrid(opts, theme);
      expect(nodes).toHaveLength(preset.values.count!);
      // Every generated node is a plain, uniquely-identified node.
      expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length);
      expect(nodes.every((n) => n.isConnection === false)).toBe(true);
    }
  });

  test('the patch-panel preset is a single sequential row', () => {
    const preset = PORT_GRID_PRESETS.find((p) => p.label.includes('patch panel'))!;
    const nodes = generatePortGrid({ ...base, ...preset.values, originX: 0, originY: 0 } as PortGridOptions, theme);
    const ys = new Set(nodes.map((n) => n.position[1]));
    expect(ys.size).toBe(1); // one row
    expect(nodes[0].label).toBe('P1');
  });

  test('the PDU preset is a single vertical column', () => {
    const preset = PORT_GRID_PRESETS.find((p) => p.label.startsWith('PDU'))!;
    const nodes = generatePortGrid({ ...base, ...preset.values, originX: 0, originY: 0 } as PortGridOptions, theme);
    const xs = new Set(nodes.map((n) => n.position[0]));
    expect(xs.size).toBe(1); // one column
    expect(nodes[0].label).toBe('Outlet 1');
  });
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
