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

const promFrame = (refId: string, displayName: string) =>
  toDataFrame({
    refId,
    fields: [
      { name: 'Time', values: [1, 2] },
      { name: 'Value', values: [10, 20], config: { displayNameFromDS: displayName } },
    ],
  });

// Simulates one Prometheus rate() query returning several series: same refId,
// same "Value" field, distinct label sets — the #191 scenario.
const MULTI_SERIES = [
  promFrame('A', 'wm_link_bps{device="rtr-1", direction="tx", interface="ge-0/0/1", job="wm", site="dfw"}'),
  promFrame('A', 'wm_link_bps{device="rtr-1", direction="tx", interface="ge-0/0/2", job="wm", site="dfw"}'),
  promFrame('A', 'wm_link_bps{device="rtr-2", direction="tx", interface="ge-0/0/1", job="wm", site="atl"}'),
];

const Harness = ({ initial, onChangeSpy, frames }: { initial: Weathermap; onChangeSpy: jest.Mock; frames: unknown[] }) => {
  const [wm, setWm] = useState(initial);
  const props = {
    value: wm,
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
