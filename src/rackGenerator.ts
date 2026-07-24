import { GrafanaTheme2 } from '@grafana/data';
import { Node } from 'types';
import { generateBasicNode, nearestMultiple } from 'utils';
import {
  generatePortGrid,
  PortGridOrdering,
  PORT_STATUS_UP_COLOR,
  PORT_STATUS_DOWN_COLOR,
} from 'gridGenerator';

// Rack elevation generator (#319): lay out a rack of *different* devices by
// rack-unit (U) position — a companion to the port grid generator (#267), which
// lays out the ports of a *single* device. Where #267 answers "generate this
// switch's 48 ports", this answers "stack the devices in the rack". A device
// can optionally carry a port faceplate, which is drawn by reusing the #267
// engine at the device's computed position.
//
// It only creates plain weathermap nodes positioned by U — no DCIM/inventory
// state. It figures the *geometry* from the U-slots you give it; it does not
// know or infer your rack's contents.

export interface RackDevicePorts {
  count: number;
  rows?: number;
  cols?: number;
  ordering?: PortGridOrdering;
  // `{n}` → port number. e.g. "Gi0/{n}".
  labelPattern?: string;
  // `{n}` → port number, `{label}` → the port label. e.g. "PORT R-SW1 Gi0/{n}".
  statusQueryTemplate?: string;
  statusColoring?: boolean;
}

export interface RackDevice {
  label: string;
  // Starting rack unit (1-based) and height in U. A 2U device at u=40 occupies
  // U40–U41.
  u: number;
  height: number;
  icon?: string;
  // Device-level status (for a device row without a port faceplate).
  statusQuery?: string;
  statusColoring?: boolean;
  // Optional faceplate: the device's ports, drawn via the #267 engine to the
  // right of the device label.
  ports?: RackDevicePorts;
}

export interface RackElevationOptions {
  // Total rack height in U (e.g. 42).
  rackUnits: number;
  // Datacenter convention is bottom-up (U1 at the floor); allow top-down.
  numbering?: 'bottom-up' | 'top-down';
  // Vertical pixels per rack unit.
  uPx: number;
  // Width of the device-label column, in px — the port faceplate starts to its
  // right.
  labelWidth: number;
  // Port faceplate spacing (used when a device has ports).
  portHSpacing: number;
  portVSpacing: number;
  // Top-left origin of the rack, in panel coordinates.
  originX: number;
  originY: number;
  devices: RackDevice[];
  // Snap generated positions to this grid when > 0.
  gridSize?: number;
  // --- Optional visual scaffolding (#321). All default off, so a map without
  // them generates exactly the pre-existing device+faceplate nodes. These add
  // *plain* nodes only — they don't change the geometry of the devices. ---
  // Draw a rack enclosure: a single border-only backdrop node spanning the whole
  // rack (behind everything, transparent fill), so devices read as mounted in a
  // rack instead of floating.
  frame?: boolean;
  // Optional title drawn above the frame (e.g. "Rack A1"). Only used with frame.
  frameLabel?: string;
  // Draw U-position markers (U1, U2 …) down the left rail. uMarkerStep controls
  // how often — every U by default, e.g. 5 = label every fifth U.
  uMarkers?: boolean;
  uMarkerStep?: number;
  // Draw device bodies filling the label column (like mounted equipment) instead
  // of hugging the label text.
  fullWidthDevices?: boolean;
}

function stampStatusColoring(node: Node): void {
  node.statusValueMappings = [
    { value: 0, color: PORT_STATUS_DOWN_COLOR },
    { value: 1, color: PORT_STATUS_UP_COLOR },
  ];
  node.nodeStatusColorTarget = 'background';
}

export function generateRackElevation(opts: RackElevationOptions, theme: GrafanaTheme2): Node[] {
  const bottomUp = (opts.numbering ?? 'bottom-up') === 'bottom-up';

  // Validation — throw a human-readable message the form can surface.
  if (!Number.isFinite(opts.rackUnits) || opts.rackUnits <= 0) {
    throw new Error('Rack size (U) must be a positive number.');
  }
  if (!Number.isFinite(opts.uPx) || opts.uPx <= 0) {
    throw new Error('Pixels per U must be a positive number.');
  }
  if (!Number.isFinite(opts.originX) || !Number.isFinite(opts.originY)) {
    throw new Error('Origin X and Y must be finite numbers.');
  }
  if (!opts.devices || opts.devices.length === 0) {
    throw new Error('Add at least one device to the rack.');
  }
  for (const dev of opts.devices) {
    if (!Number.isFinite(dev.u) || dev.u < 1) {
      throw new Error(`Device "${dev.label}" has an invalid U position (must be ≥ 1).`);
    }
    if (!Number.isFinite(dev.height) || dev.height < 1) {
      throw new Error(`Device "${dev.label}" has an invalid U height (must be ≥ 1).`);
    }
    if (dev.u + dev.height - 1 > opts.rackUnits) {
      throw new Error(`Device "${dev.label}" (U${dev.u}, ${dev.height}U) does not fit in a ${opts.rackUnits}U rack.`);
    }
  }

  const snap = (v: number): number => (opts.gridSize && opts.gridSize > 0 ? nearestMultiple(v, opts.gridSize) : v);
  const nodes: Node[] = [];

  // Screen-Y of the vertical center of rack unit `u` (for a single-U slot). The
  // device loop and the U-markers share this so they stay aligned.
  const uCenterY = (u: number): number => {
    const topY = bottomUp ? opts.originY + (opts.rackUnits - u) * opts.uPx : opts.originY + (u - 1) * opts.uPx;
    return topY + opts.uPx / 2;
  };

  // Rack chassis geometry (#321 hybrid look). With `frame` on we draw a real
  // rack — an outer enclosure plus two mounting rails — and the devices become
  // uniform full-width bars between the rails, with U-numbers on the left rail.
  // The port faceplates sit to the right of the rack, outside the frame, each
  // still a labeled status node from the #267 engine.
  const chassis = !!opts.frame;
  const bars = chassis || !!opts.fullWidthDevices;
  const RAIL_W = 18;
  const RAIL_GAP = 5;
  const bodyCenterX = opts.originX + opts.labelWidth / 2;
  // Where the faceplate starts: clear of the right rail + outer frame with room
  // for the first port's left half when there's a chassis, else the classic
  // small gap after the label column.
  const faceOriginX = chassis ? opts.originX + opts.labelWidth + RAIL_GAP + RAIL_W + 46 : opts.originX + opts.labelWidth + 12;
  // Padding for the legacy narrow box: fill the column a bit when full-width is
  // requested without a chassis, else hug the label (the pre-#321 default).
  const narrowHPadding = opts.fullWidthDevices ? Math.min(24, Math.max(12, Math.round(opts.labelWidth / 2) - 8)) : 10;

  const stampIcon = (node: Node, icon: string, size: number): void => {
    node.nodeIcon = {
      src: 'public/plugins/tamirsuliman-weathermap-panel/icons/' + icon + '.svg',
      name: icon,
      size: { width: size, height: size },
      padding: { vertical: 0, horizontal: 0 },
      drawInside: false,
    };
  };

  for (const dev of opts.devices) {
    const topU = dev.u + dev.height - 1;
    // Bottom-up: the highest U sits at the top of the rack (smallest screen Y).
    const topY = bottomUp
      ? opts.originY + (opts.rackUnits - topU) * opts.uPx
      : opts.originY + (dev.u - 1) * opts.uPx;
    const centerY = topY + (dev.height * opts.uPx) / 2;
    // Device-level status only colors the body when the device itself carries a
    // status query. Port-bearing devices carry status on their ports instead, so
    // their bar stays a neutral chassis face.
    const bodyStatus = !!dev.statusColoring && !!dev.statusQuery;

    if (bars) {
      // Uniform full-width bar: an empty (hidden-label) node whose width is
      // exactly 2×padding, so every bar is the same width regardless of the
      // device name length. The name rides on top as its own text node.
      const bar = generateBasicNode('', [snap(bodyCenterX), snap(centerY)], theme);
      bar.showLabel = false;
      bar.padding = {
        horizontal: Math.round(opts.labelWidth / 2),
        vertical: Math.max(4, Math.round((dev.height * opts.uPx) / 2) - 2),
      };
      if (dev.statusQuery) {
        bar.statusQuery = dev.statusQuery;
      }
      if (bodyStatus) {
        stampStatusColoring(bar);
      }
      nodes.push(bar);

      // Device name, centered on the bar and painted above it.
      const name = generateBasicNode(dev.label, [snap(bodyCenterX), snap(centerY)], theme);
      name.padding = { horizontal: 2, vertical: 2 };
      name.fontBold = true;
      name.colors = { ...name.colors, background: 'transparent', border: 'transparent' };
      name.zIndex = 1;
      if (dev.icon) {
        stampIcon(name, dev.icon, 36);
      }
      nodes.push(name);
    } else {
      // Legacy narrow, label-hugging box (the pre-#321 default look).
      const node = generateBasicNode(dev.label, [snap(bodyCenterX), snap(centerY)], theme);
      node.padding = { horizontal: narrowHPadding, vertical: Math.max(4, Math.round((dev.height * opts.uPx) / 2) - 6) };
      if (dev.icon) {
        stampIcon(node, dev.icon, 36);
      }
      if (dev.statusQuery) {
        node.statusQuery = dev.statusQuery;
      }
      if (dev.statusColoring) {
        stampStatusColoring(node);
      }
      nodes.push(node);
    }

    // Optional per-device port faceplate, drawn by the #267 engine to the right
    // of the label, aligned to the device's row.
    if (dev.ports && dev.ports.count > 0) {
      const p = dev.ports;
      const rows = p.rows ?? 1;
      const cols = p.cols ?? Math.ceil(p.count / rows);
      const portNodes = generatePortGrid(
        {
          count: p.count,
          rows,
          cols,
          ordering: p.ordering ?? 'row-major',
          labelPattern: p.labelPattern ?? '{n}',
          startNumber: 1,
          nodeSize: 2,
          hSpacing: opts.portHSpacing,
          vSpacing: opts.portVSpacing,
          originX: faceOriginX,
          // Center the (possibly multi-row) faceplate within the device's row.
          originY: centerY - ((rows - 1) * opts.portVSpacing) / 2,
          statusQueryTemplate: p.statusQueryTemplate,
          statusColoring: p.statusColoring ?? dev.statusColoring,
          gridSize: opts.gridSize,
        },
        theme
      );
      nodes.push(...portNodes);
    }
  }

  // U-position markers (U1, U2 …). Plain, muted text nodes — no fill or border.
  // On the left mounting rail when there's a chassis, else in a small gutter to
  // the left of the device column.
  if (opts.uMarkers) {
    const step = Number.isFinite(opts.uMarkerStep) && (opts.uMarkerStep as number) > 0 ? Math.floor(opts.uMarkerStep as number) : 1;
    const markerX = chassis ? opts.originX - RAIL_GAP - RAIL_W / 2 : opts.originX - 24;
    for (let u = 1; u <= opts.rackUnits; u += step) {
      const marker = generateBasicNode(`U${u}`, [snap(markerX), snap(uCenterY(u))], theme);
      marker.padding = { horizontal: 2, vertical: 1 };
      marker.fontSize = 9;
      marker.colors = { ...marker.colors, background: 'transparent', border: 'transparent' };
      marker.zIndex = 1;
      nodes.push(marker);
    }
  }

  // Rack chassis: an outer enclosure plus two mounting rails, all border-only
  // (transparent fill) and pushed behind the equipment via negative zIndex. Each
  // is an empty, hidden-label node sized to a target box via padding
  // (box ≈ 2×padding).
  if (chassis) {
    const rackCenterY = opts.originY + (opts.rackUnits * opts.uPx) / 2;
    const rackHalfH = Math.round((opts.rackUnits * opts.uPx) / 2);

    const railBox = (cx: number, z: number): Node => {
      const rail = generateBasicNode('', [snap(cx), snap(rackCenterY)], theme);
      rail.showLabel = false;
      rail.padding = { horizontal: Math.round(RAIL_W / 2), vertical: rackHalfH };
      rail.colors = { ...rail.colors, background: 'transparent' };
      rail.zIndex = z;
      return rail;
    };
    const leftRail = railBox(opts.originX - RAIL_GAP - RAIL_W / 2, -1);
    const rightRail = railBox(opts.originX + opts.labelWidth + RAIL_GAP + RAIL_W / 2, -1);

    const frameLeft = opts.originX - RAIL_GAP - RAIL_W - 6;
    const frameRight = opts.originX + opts.labelWidth + RAIL_GAP + RAIL_W + 6;
    const frameCx = (frameLeft + frameRight) / 2;
    const frame = generateBasicNode('', [snap(frameCx), snap(rackCenterY)], theme);
    frame.showLabel = false;
    frame.padding = { horizontal: Math.round((frameRight - frameLeft) / 2), vertical: rackHalfH + 5 };
    frame.colors = { ...frame.colors, background: 'transparent' };
    frame.zIndex = -2;

    // Frame first (furthest back), then the two rails.
    nodes.unshift(leftRail, rightRail);
    nodes.unshift(frame);

    // Optional rack title, centered above the frame.
    if (opts.frameLabel) {
      const title = generateBasicNode(opts.frameLabel, [snap(frameCx), snap(opts.originY - 16)], theme);
      title.padding = { horizontal: 4, vertical: 2 };
      title.fontBold = true;
      title.colors = { ...title.colors, background: 'transparent', border: 'transparent' };
      nodes.unshift(title);
    }
  }

  return nodes;
}
