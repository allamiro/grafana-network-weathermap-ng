// #47/#48 (0753727): frame values are resolved once per data/mode change in a
// memo, not once per link and not again when only geometry changes (dragging a
// node re-renders on every mouse move). getValueSeries is the per-frame value
// resolver, so its call count measures that work. It is wrapped through a
// file-scoped module mock because jest.spyOn on an ES export is unreliable
// under @swc/jest; MapNode and LinkTooltipGraph import '../utils', which
// resolves to the same mocked module.
import React from 'react';
import {
  getDefaultRelativeTimeRange,
  getTimeZone,
  LoadingState,
  PanelData,
  PanelProps,
  toDataFrame,
} from '@grafana/data';
import { render } from '@testing-library/react';
import { WeathermapPanel } from 'WeathermapPanel';
import { SimpleOptions, Weathermap } from 'types';
import { getData, theme } from 'testData';
import { getValueSeries, handleVersionedStateUpdates } from 'utils';

jest.mock('utils', () => {
  const actual = jest.requireActual('utils');
  return { ...actual, getValueSeries: jest.fn(actual.getValueSeries) };
});
const getValueSeriesMock = getValueSeries as jest.Mock;

// Two narrow frames, one per link side, so every link reads both of them.
const frames = ['s1', 's2'].map((n, i) =>
  toDataFrame({
    refId: n,
    fields: [
      { name: 'Time', values: [1, 2] },
      { name: 'Value', values: [i, i], config: { displayNameFromDS: n } },
    ],
  })
);

// No node statusQuery: MapNode resolves frames for status itself, which would
// add a per-node (not per-link) count to the panel's own work.
const mapWithLinks = (count: number): Weathermap => {
  const wm = handleVersionedStateUpdates(getData(theme), theme);
  const link = wm.links[0];
  link.sides.A.query = 's1';
  link.sides.Z.query = 's2';
  wm.links = Array.from({ length: count }, (_, i) => ({ ...structuredClone(link), id: `l${i}` }));
  return wm;
};

const panelProps = (data: PanelData, weathermap: Weathermap) =>
  ({
    id: 1,
    data,
    timeRange: getDefaultRelativeTimeRange(),
    timeZone: getTimeZone(),
    options: { weathermap },
    transparent: false,
    width: 600,
    height: 400,
    fieldConfig: {},
    renderCounter: 1,
    title: 'T',
    eventBus: {},
    onOptionsChange: jest.fn(),
  } as unknown as PanelProps<SimpleOptions>);

describe('frame value resolution is not repeated per link or per geometry change (#47, #48)', () => {
  // #48 (0753727): values used to be resolved by scanning every frame inside
  // each link's draw, so the work grew with the number of links.
  test('the number of frame scans does not grow with the number of links', () => {
    const scansFor = (linkCount: number) => {
      const data = {
        state: LoadingState.Done,
        series: frames,
        timeRange: getDefaultRelativeTimeRange(),
      } as unknown as PanelData;
      getValueSeriesMock.mockClear();
      const { unmount } = render(<WeathermapPanel {...panelProps(data, mapWithLinks(linkCount))} />);
      unmount();
      return getValueSeriesMock.mock.calls.length;
    };
    // One resolve per frame for the whole render, however many links read it.
    expect(scansFor(1)).toBe(frames.length);
    expect(scansFor(20)).toBe(frames.length);
  });

  // #47 (0753727): moving a node changes only geometry, so the same `data`
  // object must not be re-resolved. Streaming keeps the #331 legacy-name
  // rebind (which runs on Done) out of the count.
  test('moving a node with unchanged data does not resolve frame values again', () => {
    const data = {
      state: LoadingState.Streaming,
      series: frames,
      timeRange: getDefaultRelativeTimeRange(),
    } as unknown as PanelData;
    const wm = mapWithLinks(1);
    const { rerender } = render(<WeathermapPanel {...panelProps(data, wm)} />);

    const moved: Weathermap = structuredClone(wm);
    moved.nodes[0].position = [moved.nodes[0].position[0] + 40, moved.nodes[0].position[1]];
    getValueSeriesMock.mockClear();
    rerender(<WeathermapPanel {...panelProps(data, moved)} />);
    expect(getValueSeriesMock).not.toHaveBeenCalled();
  });
});
