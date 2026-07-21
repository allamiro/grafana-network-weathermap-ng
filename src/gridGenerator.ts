import { GrafanaTheme2 } from '@grafana/data';
import { Node } from 'types';
import { generateBasicNode, nearestMultiple } from 'utils';

// Port-grid generator (#267): a pure helper that produces aligned port nodes for
// switch faceplates, patch panels, PDU strips, blade chassis, etc. It only
// creates plain weathermap nodes — no new node type, no inventory/DCIM state.
// The whole feature's testable surface lives here; the editor form is a thin
// wrapper that calls generatePortGrid once and appends the result.

export type PortGridOrdering = 'row-major' | 'column-major' | 'odd-even';

// Standard port-board status colors, matching the universal switch-LED
// convention (green = link up, red = link down). Applied to every generated
// port when status coloring is enabled, so a status-bound board reads up/down
// at a glance instead of leaving 48 default-colored nodes to hand-edit.
export const PORT_STATUS_UP_COLOR = '#73BF69';
export const PORT_STATUS_DOWN_COLOR = '#F2495C';

export interface PortGridOptions {
  // How many port nodes to create.
  count: number;
  // Layout grid. For 'odd-even' the layout is always two rows (odd ports on the
  // top row, even on the bottom, like a real switch faceplate); rows is ignored.
  rows: number;
  cols: number;
  // Label template — `{n}` is replaced with the port number, e.g. "Gi1/0/{n}".
  labelPattern: string;
  // First port number (default 1).
  startNumber?: number;
  // Top-left origin of the grid, in panel coordinates.
  originX: number;
  originY: number;
  // Gap between adjacent columns / rows, in pixels.
  hSpacing: number;
  vSpacing: number;
  // Node padding applied to every generated node (square-ish cells). Optional.
  nodeSize?: number;
  // Faceplate blocks: insert `groupGap` extra px after every `groupSize`
  // columns, so a 48-port board breaks into blocks of ports like real switch
  // hardware instead of one even strip. 0 (either) = no grouping.
  groupSize?: number;
  groupGap?: number;
  // Fill order (default 'row-major').
  ordering?: PortGridOrdering;
  // Optional per-port status query — `{n}` → port number, `{label}` → the
  // generated label, so one action binds all ports (e.g. "ifOperStatus {label}").
  statusQueryTemplate?: string;
  // When true, stamp standard up/down status value mappings (green ≥1, red 0)
  // and fill the node background — turning the block into a live port board.
  statusColoring?: boolean;
  // Optional icon name (as used elsewhere, e.g. "rack/patch-panel").
  icon?: string;
  // When > 0, snap generated positions to this grid so ports line up with
  // hand-placed nodes (pass wm.settings.panel.grid.size when snapping is on).
  gridSize?: number;
}

// Substitute `{n}` (port number) and `{label}` (final node label) in a template.
function fillTemplate(template: string, portNumber: number, label: string): string {
  return template.replace(/\{n\}/g, String(portNumber)).replace(/\{label\}/g, label);
}

// Map a generation index to a (row, col) cell for the chosen ordering. Ports are
// always numbered sequentially (1..count); only their placement changes.
function cellFor(i: number, rows: number, cols: number, ordering: PortGridOrdering): { row: number; col: number } {
  switch (ordering) {
    case 'column-major':
      return { row: i % rows, col: Math.floor(i / rows) };
    case 'odd-even':
      // Two-row faceplate: odd port (i=0,2,4…) on top, even (i=1,3,5…) below.
      return { row: i % 2, col: Math.floor(i / 2) };
    case 'row-major':
    default:
      return { row: Math.floor(i / cols), col: i % cols };
  }
}

// The tunable fields the editor form holds. Presets fill a subset of these;
// origin is intentionally left to the user so a preset lands where they want.
export interface PortGridFormValues {
  count: number;
  rows: number;
  cols: number;
  ordering: PortGridOrdering;
  labelPattern: string;
  startNumber: number;
  nodeSize: number;
  hSpacing: number;
  vSpacing: number;
  groupSize: number;
  groupGap: number;
  originX: number;
  originY: number;
  statusQueryTemplate: string;
  statusColoring: boolean;
  icon: string;
}

// One-click starting points for common rack devices. These are *only* parameter
// bundles — no device-specific generation code — so the generic generator stays
// the single source of truth. Users tweak the fields after applying one.
export const PORT_GRID_PRESETS: Array<{ label: string; values: Partial<PortGridFormValues> }> = [
  {
    // Real 48-port switch: ports 1..48 numbered sequentially, odd on the top
    // row and even directly below, columns advancing every pair.
    label: '48-port switch',
    values: {
      count: 48,
      rows: 2,
      cols: 24,
      ordering: 'odd-even',
      labelPattern: 'Gi1/0/{n}',
      startNumber: 1,
      nodeSize: 4,
      hSpacing: 46,
      vSpacing: 34,
      groupSize: 6,
      groupGap: 18,
      statusColoring: true,
    },
  },
  {
    label: '24-port switch',
    values: {
      count: 24,
      rows: 2,
      cols: 12,
      ordering: 'odd-even',
      labelPattern: 'Gi1/0/{n}',
      startNumber: 1,
      nodeSize: 4,
      hSpacing: 46,
      vSpacing: 34,
      groupSize: 6,
      groupGap: 18,
      statusColoring: true,
    },
  },
  {
    // Patch panel: a single sequential row of jacks, left to right.
    label: '24-port patch panel',
    values: {
      count: 24,
      rows: 1,
      cols: 24,
      ordering: 'row-major',
      labelPattern: 'P{n}',
      startNumber: 1,
      nodeSize: 4,
      hSpacing: 40,
      vSpacing: 40,
      groupSize: 6,
      groupGap: 16,
      statusColoring: true,
    },
  },
  {
    // Vertical PDU strip: one column of outlets, top to bottom.
    label: 'PDU strip (24)',
    values: {
      count: 24,
      rows: 24,
      cols: 1,
      ordering: 'column-major',
      labelPattern: 'Outlet {n}',
      startNumber: 1,
      nodeSize: 4,
      hSpacing: 40,
      vSpacing: 26,
      statusColoring: true,
    },
  },
  {
    // Blade chassis: a true 2-D grid of bays.
    label: 'Blade chassis (16)',
    values: {
      count: 16,
      rows: 2,
      cols: 8,
      ordering: 'row-major',
      labelPattern: 'Blade {n}',
      startNumber: 1,
      nodeSize: 8,
      hSpacing: 62,
      vSpacing: 60,
      statusColoring: true,
    },
  },
];

export function generatePortGrid(opts: PortGridOptions, theme: GrafanaTheme2): Node[] {
  const ordering: PortGridOrdering = opts.ordering ?? 'row-major';
  const start = opts.startNumber ?? 1;

  // Validation — throw with a human-readable message so the form can surface it.
  if (!Number.isFinite(opts.count) || opts.count <= 0) {
    throw new Error('Port count must be a positive number.');
  }
  if (!Number.isInteger(opts.count)) {
    throw new Error('Port count must be a whole number.');
  }
  if (!Number.isFinite(opts.rows) || opts.rows <= 0 || !Number.isFinite(opts.cols) || opts.cols <= 0) {
    throw new Error('Rows and columns must be positive numbers.');
  }
  // 'odd-even' is inherently two rows; other orderings must have enough cells.
  if (ordering !== 'odd-even' && opts.rows * opts.cols < opts.count) {
    throw new Error(`A ${opts.rows}×${opts.cols} grid has ${opts.rows * opts.cols} cells — too few for ${opts.count} ports.`);
  }
  if (!Number.isFinite(opts.hSpacing) || !Number.isFinite(opts.vSpacing)) {
    throw new Error('Horizontal and vertical spacing must be finite numbers.');
  }
  if (!Number.isFinite(opts.originX) || !Number.isFinite(opts.originY)) {
    throw new Error('Origin X and Y must be finite numbers.');
  }

  const nodes: Node[] = [];
  for (let i = 0; i < opts.count; i++) {
    const portNumber = start + i;
    const { row, col } = cellFor(i, opts.rows, opts.cols, ordering);

    let x = opts.originX + col * opts.hSpacing;
    // Faceplate block gap: shove each column right by one gap per completed
    // block of `groupSize` columns to its left.
    if (opts.groupSize && opts.groupSize > 0 && opts.groupGap) {
      x += Math.floor(col / opts.groupSize) * opts.groupGap;
    }
    let y = opts.originY + row * opts.vSpacing;
    if (opts.gridSize && opts.gridSize > 0) {
      x = nearestMultiple(x, opts.gridSize);
      y = nearestMultiple(y, opts.gridSize);
    }

    const label = fillTemplate(opts.labelPattern, portNumber, '');
    const node = generateBasicNode(label, [x, y], theme);

    if (opts.nodeSize !== undefined && Number.isFinite(opts.nodeSize) && opts.nodeSize >= 0) {
      node.padding = { horizontal: opts.nodeSize, vertical: opts.nodeSize };
    }
    if (opts.statusQueryTemplate) {
      node.statusQuery = fillTemplate(opts.statusQueryTemplate, portNumber, label);
    }
    if (opts.statusColoring) {
      // value 0 → red (down), value ≥ 1 → green (up); highest matching wins.
      node.statusValueMappings = [
        { value: 0, color: PORT_STATUS_DOWN_COLOR },
        { value: 1, color: PORT_STATUS_UP_COLOR },
      ];
      node.nodeStatusColorTarget = 'background';
    }
    if (opts.icon) {
      node.nodeIcon = {
        src: 'public/plugins/tamirsuliman-weathermap-panel/icons/' + opts.icon + '.svg',
        name: opts.icon,
        size: { width: 40, height: 40 },
        padding: { vertical: 0, horizontal: 0 },
        drawInside: false,
      };
    }

    nodes.push(node);
  }

  return nodes;
}
