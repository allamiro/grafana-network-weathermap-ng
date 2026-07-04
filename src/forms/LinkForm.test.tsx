// Component-level regression tests for the link query dropdowns (#49, #191):
// the options must stay visually distinguishable with real multi-series data,
// and selecting an option must store the frame's full display name (the
// stored value is what the panel matches series by).
import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { StandardEditorProps, toDataFrame } from '@grafana/data';
import { LinkForm } from './LinkForm';
import { Weathermap } from 'types';
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
