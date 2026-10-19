// Component-level regression tests for the link query dropdowns (#49, #191):
// the options must stay visually distinguishable with real multi-series data,
// and selecting an option must store the frame's full display name (the
// stored value is what the panel matches series by).
import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { StandardEditorProps, toDataFrame } from '@grafana/data';
import { LinkForm } from './LinkForm';
import { Anchor, Weathermap } from 'types';
import { getData, theme } from '../testData';
import { deepFreeze } from '../test/deepFreeze';
import { openSections, pickOption, richMap, sweepEditor } from '../test/editorSweep';

const promFrame = (refId: string, displayName: string, fieldName = 'Value') =>
  toDataFrame({
    refId,
    fields: [
      { name: 'Time', values: [1, 2] },
      { name: fieldName, values: [10, 20], config: { displayNameFromDS: displayName } },
    ],
  });

// Simulates one Prometheus rate() query returning several series: same refId,
// same "Value" field, distinct label sets — the #191 scenario.
const MULTI_SERIES = [
  promFrame('A', 'wm_link_bps{device="rtr-1", direction="tx", interface="ge-0/0/1", job="wm", site="dfw"}'),
  promFrame('A', 'wm_link_bps{device="rtr-1", direction="tx", interface="ge-0/0/2", job="wm", site="dfw"}'),
  promFrame('A', 'wm_link_bps{device="rtr-2", direction="tx", interface="ge-0/0/1", job="wm", site="atl"}'),
];

const Harness = ({
  initial,
  onChangeSpy,
  frames,
}: {
  initial: Weathermap;
  onChangeSpy: jest.Mock;
  frames: unknown[];
}) => {
  const [wm, setWm] = useState(initial);
  const props = {
    // Frozen: any in-place mutation of props.value throws (#233); handlers
    // must deliver new state.
    value: deepFreeze(wm),
    onChange: (v: Weathermap) => {
      onChangeSpy(v);
      setWm(v);
    },
    context: { data: frames },
    item: { settings: { placeholder: '' } },
  } as unknown as StandardEditorProps<Weathermap, { placeholder: string }>;
  return <LinkForm {...props} />;
};

// Open the react-select whose control currently shows the given text (its
// placeholder or selected value): walk up from that text node to the nearest
// ancestor containing a combobox input, then key ArrowDown on it.
const openSelectShowing = (text: string) => {
  const shown = screen.getByText(text);
  let control: HTMLElement | null = shown.parentElement;
  while (control && !control.querySelector('[role="combobox"]')) {
    control = control.parentElement;
  }
  const combobox = control?.querySelector('[role="combobox"]');
  expect(combobox).toBeTruthy();
  fireEvent.keyDown(combobox!, { key: 'ArrowDown' });
};

const selectFirstLink = async () => {
  openSelectShowing('Select a link');
  fireEvent.click(await screen.findByText(/Node A/));
};

test('one query with many series renders distinct A Side Query options (#191)', async () => {
  render(<Harness initial={getData(theme)} onChangeSpy={jest.fn()} frames={MULTI_SERIES} />);
  await selectFirstLink();

  openSelectShowing('Select A Side Query');
  const options = await screen.findAllByRole('option');

  expect(options.length).toBe(MULTI_SERIES.length);
  const labels = options.map((o) => o.textContent);
  expect(new Set(labels).size).toBe(labels.length);
  // Every label carries something that tells the series apart.
  expect(labels.filter((l) => l?.includes('ge-0/0/1'))).toHaveLength(2);
});

test('selecting an option stores the full display name, not the label (#191)', async () => {
  const spy = jest.fn();
  render(<Harness initial={getData(theme)} onChangeSpy={spy} frames={MULTI_SERIES} />);
  await selectFirstLink();

  openSelectShowing('Select A Side Query');
  const options = await screen.findAllByRole('option');
  fireEvent.click(options[1]);

  const updated: Weathermap = spy.mock.calls[spy.mock.calls.length - 1][0];
  expect(updated.links[0].sides.A.query).toBe(
    'wm_link_bps{device="rtr-1", direction="tx", interface="ge-0/0/2", job="wm", site="dfw"}'
  );
});

test('short custom legends appear verbatim in the dropdown', async () => {
  const frames = [promFrame('A', 'SW-CORE to BKB-CARPINA'), promFrame('B', 'BKB-CARPINA to SW-CORE')];
  render(<Harness initial={getData(theme)} onChangeSpy={jest.fn()} frames={frames} />);
  await selectFirstLink();

  openSelectShowing('Select A Side Query');
  expect(await screen.findByText('SW-CORE to BKB-CARPINA')).toBeInTheDocument();
  expect(screen.getByText('BKB-CARPINA to SW-CORE')).toBeInTheDocument();
});

// Anchor accounting regressions (#202): addNewLink creates a self-link and
// increments the center anchor by 2, so removeLink must decrement both
// endpoint sides independently — an else-if between them drifts the count.
describe('link anchor accounting (#202)', () => {
  const lastValue = (spy: jest.Mock): Weathermap => spy.mock.calls[spy.mock.calls.length - 1][0];

  test('removing_self_link_restores_anchor_counts', () => {
    const initial = getData(theme);
    const before = initial.nodes[0].anchors[Anchor.Center].numLinks;
    const spy = jest.fn();
    render(<Harness initial={initial} onChangeSpy={spy} frames={[]} />);

    // Add Link creates a self-link on nodes[0] and selects it.
    fireEvent.click(screen.getByRole('button', { name: /Add Link/ }));
    expect(lastValue(spy).nodes[0].anchors[Anchor.Center].numLinks).toBe(before + 2);

    fireEvent.click(screen.getByRole('button', { name: /Remove Link/ }));
    expect(lastValue(spy).nodes[0].anchors[Anchor.Center].numLinks).toBe(before);
  });

  test('removing a self-link from an already-drifted map clamps at 0', async () => {
    // A saved map hit by the old else-if bug can hold a self-link while the
    // anchor count already reads 0; removal must not push it negative.
    const initial = getData(theme);
    const node = initial.nodes[0];
    const selfLink = initial.links[0];
    selfLink.nodes = [node, node];
    selfLink.sides.A.anchor = Anchor.Center;
    selfLink.sides.Z.anchor = Anchor.Center;
    initial.links = [selfLink];
    node.anchors[Anchor.Center].numLinks = 0;

    const spy = jest.fn();
    render(<Harness initial={initial} onChangeSpy={spy} frames={[]} />);
    openSelectShowing('Select a link');
    fireEvent.click(await screen.findByText('Node A <> Node A'));

    fireEvent.click(screen.getByRole('button', { name: /Remove Link/ }));
    const updated = lastValue(spy);
    expect(updated.links).toHaveLength(0);
    expect(updated.nodes[0].anchors[Anchor.Center].numLinks).toBe(0);
  });

  test('removing a normal two-node link decrements each endpoint once', async () => {
    const initial = getData(theme);
    const linkToRemove = initial.links[0];
    const anchorA = linkToRemove.sides.A.anchor;
    const anchorZ = linkToRemove.sides.Z.anchor;
    const idA = linkToRemove.nodes[0].id;
    const idZ = linkToRemove.nodes[1].id;
    expect(idA).not.toBe(idZ);
    const beforeA = initial.nodes.find((n) => n.id === idA)!.anchors[anchorA].numLinks;
    const beforeZ = initial.nodes.find((n) => n.id === idZ)!.anchors[anchorZ].numLinks;

    const spy = jest.fn();
    render(<Harness initial={initial} onChangeSpy={spy} frames={[]} />);
    await selectFirstLink();

    fireEvent.click(screen.getByRole('button', { name: /Remove Link/ }));
    const updated = lastValue(spy);
    expect(updated.nodes.find((n) => n.id === idA)!.anchors[anchorA].numLinks).toBe(beforeA - 1);
    expect(updated.nodes.find((n) => n.id === idZ)!.anchors[anchorZ].numLinks).toBe(beforeZ - 1);
  });
});

// #200: clearing the bandwidth input must not write NaN into link options.
describe('number inputs do not store NaN (#200)', () => {
  const lastValue = (spy: jest.Mock): Weathermap => spy.mock.calls[spy.mock.calls.length - 1][0];

  test('clearing the A-side bandwidth keeps the previous value', async () => {
    const initial = getData(theme);
    initial.links[0].sides.A.bandwidth = 1000;
    const spy = jest.fn();
    const { container } = render(<Harness initial={initial} onChangeSpy={spy} frames={[]} />);
    await selectFirstLink();

    const bandwidth = container.querySelector('input[name="Abandwidth"]')!;
    fireEvent.change(bandwidth, { target: { value: '' } });

    expect(lastValue(spy).links[0].sides.A.bandwidth).toBe(1000);

    fireEvent.change(bandwidth, { target: { value: '0' } });
    expect(lastValue(spy).links[0].sides.A.bandwidth).toBe(0);
  });

  test('link offset treats blank and invalid input as unset', async () => {
    const initial = getData(theme);
    initial.links[0].linkOffset = 5;
    const spy = jest.fn();
    const { container } = render(<Harness initial={initial} onChangeSpy={spy} frames={[]} />);
    await selectFirstLink();

    const offset = Array.from(container.querySelectorAll('input[type="number"]')).find(
      (el) => (el as HTMLInputElement).placeholder === '0'
    )!;
    fireEvent.change(offset, { target: { value: '' } });
    expect(lastValue(spy).links[0].linkOffset).toBeUndefined();

    fireEvent.change(offset, { target: { value: '12' } });
    expect(lastValue(spy).links[0].linkOffset).toBe(12);
  });
});

test('link status controls are available for every link (#273)', async () => {
  render(<Harness initial={getData(theme)} onChangeSpy={jest.fn()} frames={MULTI_SERIES} />);
  await selectFirstLink();

  // The full down-state configuration ships with the editor: status query,
  // down color, and blink — nothing depends on hand-edited JSON.
  expect(screen.getByText('Link Status')).not.toBeNull();
  expect(screen.getByText('Select query (value < 1 = down)')).not.toBeNull();
  expect(screen.getByText('Down Color:')).not.toBeNull();
  expect(screen.getByText('Blink when down')).not.toBeNull();
});

// #49 (8992c88): long Prometheus display names are shown as "refId: metric"
// rather than the full label set. Both names are over the 60-char verbatim
// limit and the field names carry the metric, so the concise form is unique.
test('query dropdown shows the concise refId: metric label for long names (#49)', async () => {
  const frames = [
    promFrame('A', 'node_cpu_seconds_total{mode="idle",instance="host-1:9100",job="node"}', 'node_cpu_seconds_total'),
    promFrame(
      'B',
      'node_network_transmit_bytes_total{device="eth0",instance="host-1:9100"}',
      'node_network_transmit_bytes_total'
    ),
  ];
  render(<Harness initial={getData(theme)} onChangeSpy={jest.fn()} frames={frames} />);
  await selectFirstLink();

  openSelectShowing('Select A Side Query');
  const options = await screen.findAllByRole('option');
  expect(options.map((o) => o.textContent)).toEqual([
    'A: node_cpu_seconds_total',
    'B: node_network_transmit_bytes_total',
  ]);
});

// #42/#46 (da46e76): the query and bandwidth menus render in a portal on
// document.body. Rendered inline they were clipped by the options pane.
// Grafana UI 11.6 already defaults menuShouldPortal to true, so dropping the
// prop alone passes today; this fails if portalling is turned off
// (menuShouldPortal={false}) or Grafana's default changes.
test.each(['Select A Side Query', 'Select Bandwidth'])(
  'the "%s" menu portals out of the form (#42, #46)',
  async (placeholder) => {
    const { container } = render(<Harness initial={getData(theme)} onChangeSpy={jest.fn()} frames={MULTI_SERIES} />);
    await selectFirstLink();

    // Both sides show a 'Select Bandwidth' placeholder; open the A side's.
    const shown = screen.getAllByText(placeholder)[0];
    let control: HTMLElement | null = shown.parentElement;
    while (control && !control.querySelector('[role="combobox"]')) {
      control = control.parentElement;
    }
    fireEvent.keyDown(control!.querySelector('[role="combobox"]')!, { key: 'ArrowDown' });
    const options = await screen.findAllByRole('option');

    expect(options).toHaveLength(MULTI_SERIES.length);
    expect(container.contains(options[0])).toBe(false);
    expect(document.body.contains(options[0])).toBe(true);
  }
);

// #233 (d96e5a6): changing an anchor must clone before writing. The Harness
// deep-freezes props.value, so an in-place write throws and nothing is saved.
test('changing the A-side anchor updates the link and moves the anchor count (#233)', async () => {
  const initial = getData(theme);
  // getData: link 0 runs from Node A's Right anchor (1 link) to Node B's Left.
  expect(initial.links[0].sides.A.anchor).toBe(Anchor.Right);
  expect(initial.nodes[0].anchors[Anchor.Right].numLinks).toBe(1);
  expect(initial.nodes[0].anchors[Anchor.Top].numLinks).toBe(0);
  const spy = jest.fn();
  render(<Harness initial={initial} onChangeSpy={spy} frames={[]} />);
  await selectFirstLink();

  // The A side's anchor Select shows 'Right' (the Z side's shows 'Left').
  openSelectShowing('Right');
  fireEvent.click(await screen.findByRole('option', { name: 'Top' }));

  expect(spy).toHaveBeenCalledTimes(1);
  const updated: Weathermap = spy.mock.calls[0][0];
  expect(updated.links[0].sides.A.anchor).toBe(Anchor.Top);
  expect(updated.nodes[0].anchors[Anchor.Right].numLinks).toBe(0);
  expect(updated.nodes[0].anchors[Anchor.Top].numLinks).toBe(1);
});

// #133 (d8a582d): a link's dashboard URL is a navigation target, so an unsafe
// scheme is refused (stored as '') while a normal https URL is kept verbatim.
test('an unsafe link dashboard URL is refused (#133)', async () => {
  const spy = jest.fn();
  const { container } = render(<Harness initial={getData(theme)} onChangeSpy={spy} frames={[]} />);
  await selectFirstLink();
  const lastValue = (): Weathermap => spy.mock.calls[spy.mock.calls.length - 1][0];

  const input = container.querySelector('input[name="AdashboardLink"]')!;
  fireEvent.change(input, { target: { value: 'javascript:alert(1)' } });
  expect(lastValue().links[0].sides.A.dashboardLink).toBe('');

  fireEvent.change(input, { target: { value: 'https://grafana.example/d/x' } });
  expect(lastValue().links[0].sides.A.dashboardLink).toBe('https://grafana.example/d/x');
});

// #392: hand-edited or partially provisioned dashboards can carry links with
// a missing endpoint. The editor must still render, let the link be picked,
// and remove it, so the dashboard can be repaired from the UI.
describe('partial saved links (#392)', () => {
  const withPartialLinks = () => {
    const wm = getData(theme);
    const base = wm.links[0];
    const partial = (id: string, nodes: unknown[]) =>
      ({ ...JSON.parse(JSON.stringify(base)), id, nodes } as Weathermap['links'][number]);
    wm.links.push(partial('no-endpoints', []), partial('one-endpoint', [wm.nodes[0]]));
    return wm;
  };

  test('the editor renders with partial links in the map', () => {
    render(<Harness initial={withPartialLinks()} onChangeSpy={jest.fn()} frames={[]} />);
    expect(screen.getByRole('button', { name: /Add Link/ })).toBeInTheDocument();
  });

  test('a one-endpoint link can be selected and removed', async () => {
    const spy = jest.fn();
    render(<Harness initial={withPartialLinks()} onChangeSpy={spy} frames={[]} />);
    openSelectShowing('Select a link');
    fireEvent.click(await screen.findByText('Node A <> undefined'));
    fireEvent.click(screen.getByRole('button', { name: /Remove Link/ }));

    const next: Weathermap = spy.mock.calls[spy.mock.calls.length - 1][0];
    expect(next.links.map((l) => l.id)).toEqual([getData(theme).links[0].id, 'no-endpoints']);
  });

  const lastValue = (spy: jest.Mock): Weathermap => spy.mock.calls[spy.mock.calls.length - 1][0];
  // Open the react-select that currently shows `text` (value or placeholder).
  const openSelectAt = (text: string) => {
    let control: HTMLElement | null = screen.getByText(text).parentElement;
    while (control && !control.querySelector('[role="combobox"]')) {
      control = control.parentElement;
    }
    fireEvent.keyDown(control!.querySelector('[role="combobox"]')!, { key: 'ArrowDown' });
  };

  test('a one-endpoint link is repaired by picking its missing Z endpoint', async () => {
    const spy = jest.fn();
    const initial = withPartialLinks();
    const zAnchor = initial.links[0].sides.Z.anchor;
    const before = initial.nodes[1].anchors[zAnchor].numLinks;
    render(<Harness initial={initial} onChangeSpy={spy} frames={[]} />);
    openSelectShowing('Select a link');
    fireEvent.click(await screen.findByText('Node A <> undefined'));
    // The missing Z endpoint shows the side picker's placeholder.
    openSelectAt('Select Z Side');
    fireEvent.click((await screen.findAllByRole('option')).find((o) => o.textContent === 'Node B')!);

    const repaired = lastValue(spy).links.find((l) => l.id === 'one-endpoint')!;
    expect(repaired.nodes.map((n) => n.label)).toEqual(['Node A', 'Node B']);
    expect(lastValue(spy).nodes[1].anchors[zAnchor].numLinks).toBe(before + 1);
  });

  test('a link with no nodes array can be selected and given an endpoint', async () => {
    const spy = jest.fn();
    const initial = getData(theme);
    const noNodes = { ...JSON.parse(JSON.stringify(initial.links[0])), id: 'no-nodes' };
    delete noNodes.nodes;
    initial.links.push(noNodes);
    const aAnchor = initial.links[0].sides.A.anchor;
    const before = initial.nodes[0].anchors[aAnchor].numLinks;
    render(<Harness initial={initial} onChangeSpy={spy} frames={[]} />);
    openSelectShowing('Select a link');
    // Its picker label is empty: it has no endpoints to name.
    fireEvent.click((await screen.findAllByRole('option')).find((o) => o.textContent === '')!);
    openSelectAt('Select A Side');
    fireEvent.click((await screen.findAllByRole('option')).find((o) => o.textContent === 'Node A')!);

    const repaired = lastValue(spy).links.find((l) => l.id === 'no-nodes')!;
    expect(repaired.nodes.map((n) => n?.label)).toEqual(['Node A']);
    expect(lastValue(spy).nodes[0].anchors[aAnchor].numLinks).toBe(before + 1);
  });

  test('removing a link whose anchor is out of range does not crash', async () => {
    const spy = jest.fn();
    const initial = getData(theme);
    const bad = { ...JSON.parse(JSON.stringify(initial.links[0])), id: 'bad-anchor' };
    bad.nodes = [initial.nodes[1], initial.nodes[0]]; // "Node B <> Node A"
    bad.sides.A.anchor = 99;
    initial.links.push(bad);
    render(<Harness initial={initial} onChangeSpy={spy} frames={[]} />);
    openSelectShowing('Select a link');
    fireEvent.click(await screen.findByText('Node B <> Node A'));
    fireEvent.click(screen.getByRole('button', { name: /Remove Link/ }));

    expect(lastValue(spy).links.map((l) => l.id)).toEqual([initial.links[0].id]);
  });
});

// Every control in the form, driven once against a deep-frozen value: none may
// throw, and each onChange must carry a new object that differs from the one
// it replaced (#225, #233). The count is how many controls must deliver a
// change, so a handler that stops calling onChange fails too. See
// src/test/editorSweep.tsx.
test('every LinkForm control delivers new state without mutating props.value', async () => {
  const { problems, changed, silent } = await sweepEditor({
    Form: LinkForm,
    initial: richMap,
    setup: async () => {
      await pickOption('Select a link', /Node A <> Node B/);
      openSections('Stroke and Arrow');
    },
  });
  expect(problems).toEqual([]);
  // Pinned exactly: a control that stops delivering moves into `silent`, a
  // removed one lowers the count, and a new one has to be classified here.
  // The link picker only chooses which link to edit; the section button only expands.
  expect(silent).toEqual(['select "nwm-link-picker"', 'button "Stroke and Arrow"']);
  expect(changed).toHaveLength(52);
}, 30000);
