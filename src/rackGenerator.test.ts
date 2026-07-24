import { generateRackElevation, RackElevationOptions } from 'rackGenerator';
import { PORT_STATUS_UP_COLOR, PORT_STATUS_DOWN_COLOR } from 'gridGenerator';
import { theme } from 'testData';

const base: RackElevationOptions = {
  rackUnits: 10,
  numbering: 'bottom-up',
  uPx: 30,
  labelWidth: 80,
  portHSpacing: 40,
  portVSpacing: 26,
  originX: 100,
  originY: 100,
  devices: [],
};

const y = (n: { position: [number, number] }) => n.position[1];

test('places devices by U — higher U sits higher on screen (bottom-up)', () => {
  const nodes = generateRackElevation(
    {
      ...base,
      devices: [
        { label: 'SW-TOP', u: 9, height: 2 }, // U9–10, top of rack
        { label: 'SRV-BOTTOM', u: 1, height: 1 }, // U1, floor
      ],
    },
    theme
  );
  const top = nodes.find((n) => n.label === 'SW-TOP')!;
  const bottom = nodes.find((n) => n.label === 'SRV-BOTTOM')!;
  // U9–10 device center is above (smaller Y) the U1 device.
  expect(y(top)).toBeLessThan(y(bottom));
  // Concrete geometry: topU=10 → topY=100, center=100+30=130.
  expect(top.position).toEqual([140, 130]);
  // U1 → topY=100+(10-1)*30=370, center=385.
  expect(y(bottom)).toBe(385);
});

test('top-down numbering puts U1 at the top', () => {
  const nodes = generateRackElevation(
    {
      ...base,
      numbering: 'top-down',
      devices: [
        { label: 'A', u: 1, height: 1 },
        { label: 'B', u: 9, height: 1 },
      ],
    },
    theme
  );
  const a = nodes.find((n) => n.label === 'A')!;
  const b = nodes.find((n) => n.label === 'B')!;
  expect(y(a)).toBeLessThan(y(b)); // U1 on top
});

test('a taller device gets more vertical padding', () => {
  const nodes = generateRackElevation(
    { ...base, devices: [{ label: '1U', u: 1, height: 1 }, { label: '4U', u: 3, height: 4 }] },
    theme
  );
  const oneU = nodes.find((n) => n.label === '1U')!;
  const fourU = nodes.find((n) => n.label === '4U')!;
  expect(fourU.padding.vertical).toBeGreaterThan(oneU.padding.vertical);
});

test('a device with ports composes a port faceplate via the #267 engine', () => {
  const nodes = generateRackElevation(
    {
      ...base,
      devices: [
        {
          label: 'R-SW1',
          u: 8,
          height: 2,
          ports: { count: 8, rows: 2, cols: 4, labelPattern: 'Gi0/{n}', statusQueryTemplate: 'PORT R-SW1 Gi0/{n}', statusColoring: true },
        },
      ],
    },
    theme
  );
  // 1 device-label node + 8 port nodes.
  expect(nodes).toHaveLength(9);
  const ports = nodes.filter((n) => /^Gi0\//.test(n.label ?? ''));
  expect(ports).toHaveLength(8);
  expect(ports[0].statusQuery).toBe('PORT R-SW1 Gi0/1');
  expect(ports[7].statusQuery).toBe('PORT R-SW1 Gi0/8');
  // Faceplate ports sit to the right of the label column.
  expect(ports.every((n) => n.position[0] > base.originX + base.labelWidth)).toBe(true);
  // Status coloring stamped on the ports.
  expect(ports[0].statusValueMappings).toEqual([
    { value: 0, color: PORT_STATUS_DOWN_COLOR },
    { value: 1, color: PORT_STATUS_UP_COLOR },
  ]);
});

test('device-level status coloring stamps up/down mappings on the device node', () => {
  const nodes = generateRackElevation(
    { ...base, devices: [{ label: 'SRV-1', u: 1, height: 1, statusQuery: 'PORT SRV-1 eth0', statusColoring: true }] },
    theme
  );
  const dev = nodes[0];
  expect(dev.statusQuery).toBe('PORT SRV-1 eth0');
  expect(dev.nodeStatusColorTarget).toBe('background');
  expect(dev.statusValueMappings).toEqual([
    { value: 0, color: PORT_STATUS_DOWN_COLOR },
    { value: 1, color: PORT_STATUS_UP_COLOR },
  ]);
});

// #321 hybrid chassis: a real rack (outer frame + two rails + rail-mounted
// U-numbers + uniform full-width bars) with the labeled port faceplates kept to
// the right. All opt-in — with frame/markers/full-width off the output is the
// pre-#321 narrow-box layout.
describe('chassis + scaffolding (#321 hybrid)', () => {
  const devices = [
    // Port-bearing switch: bar stays a neutral chassis face, ports carry status.
    { label: 'SW', u: 9, height: 2, statusColoring: true, ports: { count: 4, labelPattern: 'P{n}', statusColoring: true } },
    // Device-status server: the bar itself colors up/down.
    { label: 'SRV', u: 1, height: 1, statusQuery: 'up{h="s"}', statusColoring: true },
  ];

  test('by default (no frame/bars) each device is a single narrow node', () => {
    const nodes = generateRackElevation({ ...base, devices: [{ label: 'A', u: 1, height: 1 }, { label: 'B', u: 2, height: 1 }] }, theme);
    expect(nodes).toHaveLength(2);
    expect(nodes.every((n) => n.label === 'A' || n.label === 'B')).toBe(true);
  });

  test('frame draws a chassis: an outer frame plus two rails, behind the equipment', () => {
    const nodes = generateRackElevation({ ...base, devices, frame: true }, theme);
    const frame = nodes.find((n) => n.zIndex === -2);
    const rails = nodes.filter((n) => n.zIndex === -1);
    expect(frame).toBeDefined();
    expect(frame!.showLabel).toBe(false);
    expect(frame!.colors.background).toBe('transparent');
    expect(rails).toHaveLength(2);
    // Frame spans the full rack height (box ≈ 2×vertical padding).
    expect(frame!.padding.vertical * 2).toBeGreaterThanOrEqual(base.rackUnits * base.uPx);
    // Painted first / furthest back.
    expect(nodes[0]).toBe(frame);
  });

  test('a chassis turns devices into uniform full-width bars with the name as its own node', () => {
    const nodes = generateRackElevation({ ...base, devices, frame: true }, theme);
    // One empty bar node per device (zIndex ≥ 0 distinguishes bars from the frame/rails).
    const bars = nodes.filter((n) => n.label === '' && n.showLabel === false && (n.zIndex ?? 0) >= 0);
    expect(bars).toHaveLength(devices.length);
    // Every bar is the same width regardless of the device name.
    expect(new Set(bars.map((b) => b.padding.horizontal)).size).toBe(1);
    // Names ride on top as their own transparent text nodes.
    expect(nodes.some((n) => n.label === 'SW' && n.colors.background === 'transparent')).toBe(true);
    expect(nodes.some((n) => n.label === 'SRV' && n.colors.background === 'transparent')).toBe(true);
  });

  test('port-bearing bars stay neutral; a device-status bar is colored', () => {
    const nodes = generateRackElevation({ ...base, devices, frame: true }, theme);
    // SRV bar carries its device status query + up/down mappings.
    const srvBar = nodes.find((n) => n.label === '' && n.statusQuery === 'up{h="s"}');
    expect(srvBar).toBeDefined();
    expect(srvBar!.statusValueMappings).toBeDefined();
    // The switch bar (has ports) carries no status query and no mappings.
    const neutral = nodes.filter((n) => n.label === '' && (n.zIndex ?? 0) >= 0 && !n.statusQuery);
    expect(neutral.some((b) => b.statusValueMappings === undefined)).toBe(true);
  });

  test('ports render to the right of the rack, still labeled status nodes', () => {
    const nodes = generateRackElevation({ ...base, devices, frame: true }, theme);
    const ports = nodes.filter((n) => /^P\d+$/.test(n.label ?? ''));
    expect(ports).toHaveLength(4);
    expect(ports.every((p) => p.position[0] > base.originX + base.labelWidth)).toBe(true);
  });

  test('U-markers sit on the left rail and align to U centers', () => {
    const nodes = generateRackElevation({ ...base, devices, frame: true, uMarkers: true }, theme);
    const markers = nodes.filter((n) => /^U\d+$/.test(n.label ?? ''));
    expect(markers).toHaveLength(base.rackUnits);
    expect(markers.every((m) => m.position[0] < base.originX)).toBe(true);
    const u1 = markers.find((m) => m.label === 'U1')!;
    const uTop = markers.find((m) => m.label === `U${base.rackUnits}`)!;
    expect(u1.position[1]).toBeGreaterThan(uTop.position[1]); // bottom-up: U1 lower on screen
  });

  test('uMarkerStep thins out the rail numbers', () => {
    const nodes = generateRackElevation({ ...base, devices, frame: true, uMarkers: true, uMarkerStep: 5 }, theme);
    const markers = nodes.filter((n) => /^U\d+$/.test(n.label ?? ''));
    expect(markers.map((m) => m.label)).toEqual(['U1', 'U6']); // 10U rack stepping by 5
  });

  test('frameLabel adds a bold title above the rack', () => {
    const nodes = generateRackElevation({ ...base, devices, frame: true, frameLabel: 'Rack A1' }, theme);
    const title = nodes.find((n) => n.label === 'Rack A1');
    expect(title).toBeDefined();
    expect(title!.fontBold).toBe(true);
    expect(title!.position[1]).toBeLessThan(base.originY);
  });

  test('fullWidthDevices makes bars without a chassis frame', () => {
    const nodes = generateRackElevation({ ...base, devices: [{ label: 'A', u: 1, height: 1 }], fullWidthDevices: true }, theme);
    const bars = nodes.filter((n) => n.label === '' && n.showLabel === false);
    expect(bars).toHaveLength(1); // one bar, no frame/rails
    expect(nodes.some((n) => n.zIndex === -2)).toBe(false);
  });
});

describe('invalid input', () => {
  test('rejects an empty rack', () => {
    expect(() => generateRackElevation({ ...base, devices: [] }, theme)).toThrow(/at least one device/i);
  });

  test('rejects a non-positive rack size', () => {
    expect(() => generateRackElevation({ ...base, rackUnits: 0, devices: [{ label: 'A', u: 1, height: 1 }] }, theme)).toThrow(
      /positive/i
    );
  });

  test('rejects a device that does not fit in the rack', () => {
    expect(() =>
      generateRackElevation({ ...base, rackUnits: 10, devices: [{ label: 'BIG', u: 9, height: 4 }] }, theme)
    ).toThrow(/does not fit/i);
  });

  test('rejects an invalid U position', () => {
    expect(() =>
      generateRackElevation({ ...base, devices: [{ label: 'A', u: 0, height: 1 }] }, theme)
    ).toThrow(/U position/i);
  });
});
