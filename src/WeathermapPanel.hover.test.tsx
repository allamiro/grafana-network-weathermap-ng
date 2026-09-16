import React from 'react';
import { dateTime, FieldType, getTimeZone, LoadingState, PanelProps, toDataFrame } from '@grafana/data';
import { TimeSeries } from '@grafana/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { WeathermapPanel } from './WeathermapPanel';
import { SimpleOptions } from './types';
import { getData, theme } from './testData';
import { handleVersionedStateUpdates } from './utils';

jest.mock('@grafana/ui', () => ({
  ...jest.requireActual('@grafana/ui'),
  TimeSeries: jest.fn(() => null),
}));

const chart = jest.mocked(TimeSeries);
const chartProps = () => chart.mock.calls[chart.mock.calls.length - 1][0];

const panelProps = (): PanelProps<SimpleOptions> => {
  const weathermap = handleVersionedStateUpdates(getData(theme), theme);
  weathermap.links[0].sides.A.query = 'out';
  weathermap.links[0].sides.Z.query = 'in';
  weathermap.nodes[0].tooltipMetrics = [{ label: 'Traffic', query: 'out' }];
  const timeRange = { from: dateTime(1000), to: dateTime(2000), raw: { from: 'now-1h', to: 'now' } };
  return {
    id: 1,
    data: {
      state: LoadingState.Done,
      series: [
        toDataFrame({
          fields: [
            { name: 'Time', type: FieldType.time, values: [1000, 2000] },
            { name: 'out', type: FieldType.number, values: [10, 20] },
            { name: 'in', type: FieldType.number, values: [30, 40] },
          ],
        }),
      ],
      timeRange,
    },
    timeRange,
    timeZone: getTimeZone(),
    options: { weathermap },
    width: 600,
    height: 400,
    onOptionsChange: jest.fn(),
  } as unknown as PanelProps<SimpleOptions>;
};

beforeEach(() => chart.mockClear());

test('moving over the same link repositions its tooltip without rendering the chart again', () => {
  render(<WeathermapPanel {...panelProps()} />);
  const link = screen.getByTestId('link').firstChild!;
  fireEvent.mouseMove(link, { clientX: 100, clientY: 150 });
  expect(chart).toHaveBeenCalledTimes(1);
  const tooltip = screen.getByText(/Usage -/).parentElement!;
  const className = tooltip.className;
  const position = getComputedStyle(tooltip).left;

  for (let x = 101; x <= 120; x++) {
    fireEvent.mouseMove(link, { clientX: x, clientY: 150 });
  }

  expect(getComputedStyle(tooltip).left).not.toBe(position);
  expect(chart).toHaveBeenCalledTimes(1);
  expect(tooltip.className).toBe(className);
  fireEvent.mouseMove(link, { clientX: 500, clientY: 50 });
  expect(tooltip.style.transform).toBe('translate(-100%, 0%)');
  expect(tooltip.className).toBe(className);
  expect(chart).toHaveBeenCalledTimes(1);
  fireEvent.mouseLeave(link);
  expect(screen.queryByText(/Usage -/)).not.toBeInTheDocument();
});

test('the visible graph receives fresh series and time ranges without pointer movement', () => {
  const props = panelProps();
  const { rerender } = render(<WeathermapPanel {...props} />);
  fireEvent.mouseMove(screen.getByTestId('link').firstChild!);
  const previousFrames = chartProps().frames;
  const frame = toDataFrame({
    fields: [
      { name: 'Time', type: FieldType.time, values: [3000, 4000] },
      { name: 'out', type: FieldType.number, values: [50, 60] },
      { name: 'in', type: FieldType.number, values: [70, 80] },
    ],
  });
  const original = structuredClone(frame);
  const updated = { ...props, data: { ...props.data, series: [frame] } };
  rerender(<WeathermapPanel {...updated} />);

  expect(chartProps().frames).not.toBe(previousFrames);
  expect(chartProps().frames.map((f) => f.fields[1].values)).toEqual([
    [50, 60],
    [70, 80],
  ]);
  // Grafana caches display names in field.state; chart styling must leave
  // the source configuration, field types, and samples untouched.
  expect(frame.fields.map(({ config, type, values }) => ({ config, type, values }))).toEqual(
    original.fields.map(({ config, type, values }) => ({ config, type, values }))
  );

  const timeRange = { from: dateTime(3000), to: dateTime(4000), raw: { from: 'now-30m', to: 'now' } };
  rerender(<WeathermapPanel {...updated} timeRange={timeRange} />);
  expect(chartProps().timeRange).toBe(timeRange);
});

test('a new data snapshot refreshes the graph even when its series array is reused', () => {
  const props = panelProps();
  const { rerender } = render(<WeathermapPanel {...props} />);
  fireEvent.mouseMove(screen.getByTestId('link').firstChild!);
  const previousFrames = chartProps().frames;
  const previousRenderCount = chart.mock.calls.length;

  props.data.series[0].fields[1].values = [90, 100];
  rerender(<WeathermapPanel {...props} data={{ ...props.data }} />);

  expect(chart.mock.calls.length).toBeGreaterThan(previousRenderCount);
  expect(chartProps().frames).not.toBe(previousFrames);
  expect(chartProps().frames[0].fields[1].values).toEqual([90, 100]);
});

test('tooltip color, scale, and unit changes still reach the graph', () => {
  const props = panelProps();
  props.options.weathermap.links[0].sides.A.bandwidth = 1000;
  const { rerender } = render(<WeathermapPanel {...props} />);
  fireEvent.mouseMove(screen.getByTestId('link').firstChild!);
  const settings = props.options.weathermap.settings;
  rerender(
    <WeathermapPanel
      {...props}
      options={{
        weathermap: {
          ...props.options.weathermap,
          settings: {
            ...settings,
            tooltip: { ...settings.tooltip, inboundColor: '#ff0000', outboundColor: '#0000ff', scaleToBandwidth: true },
            link: { ...settings.link, defaultUnits: 'Bps' },
          },
        },
      }}
    />
  );

  const graph = chartProps();
  expect(graph.frames.map((f) => f.fields[1].config.custom.lineColor)).toEqual(['#0000ff', '#ff0000']);
  const field = graph.frames[0].fields[1];
  expect(graph.tweakScale!({ scaleKey: 'y', orientation: 1, direction: 1 }, field).softMax).toBe(1000);
  expect(graph.tweakAxis!({ scaleKey: 'y', theme }, field).formatValue!(40)).toContain('B/s');
});

test('switching hover targets updates query bindings, bandwidth, units, and direction labels', () => {
  const props = panelProps();
  const firstLink = props.options.weathermap.links[0];
  props.options.weathermap.settings.tooltip.scaleToBandwidth = true;
  props.options.weathermap.links.push({
    ...firstLink,
    id: 'second-link',
    units: 'Bps',
    sides: {
      A: { ...firstLink.sides.A, query: 'in', bandwidth: 2000, directionLabel: 'Transmit' },
      Z: { ...firstLink.sides.Z, query: '', bandwidth: 3000, directionLabel: 'Receive' },
    },
  });
  render(<WeathermapPanel {...props} />);
  fireEvent.mouseMove(screen.getAllByTestId('link')[0].firstChild!);
  expect(chartProps().frames).toHaveLength(2);

  const secondLink = screen.getAllByTestId('link')[1];
  fireEvent.mouseMove(secondLink.firstChild!);
  let graph = chartProps();
  expect(graph.frames).toHaveLength(1);
  expect(graph.frames[0].fields[1].name).toBe('in');
  expect(graph.tweakScale!({ scaleKey: 'y', orientation: 1, direction: 1 }, graph.frames[0].fields[1]).softMax).toBe(
    2000
  );
  expect(graph.tweakAxis!({ scaleKey: 'y', theme }, graph.frames[0].fields[1]).formatValue!(40)).toContain('B/s');
  expect(screen.getByText('Transmit')).toBeInTheDocument();
  expect(screen.getByText('Receive')).toBeInTheDocument();

  fireEvent.mouseMove(secondLink.querySelectorAll('polyline')[1]);
  graph = chartProps();
  expect(graph.tweakScale!({ scaleKey: 'y', orientation: 1, direction: 1 }, graph.frames[0].fields[1]).softMax).toBe(
    3000
  );
});

test('node tooltip movement and edge flipping reuse the same stylesheet rule', () => {
  const props = panelProps();
  render(<WeathermapPanel {...props} />);
  const node = screen.getByText(props.options.weathermap.nodes[0].label!).closest('g')!;
  fireEvent.mouseMove(node, { clientX: 100, clientY: 150 });
  const tooltip = screen.getByTestId('weathermap-node-tooltip');
  const className = tooltip.className;
  const position = getComputedStyle(tooltip).left;
  const transform = getComputedStyle(tooltip).transform;

  fireEvent.mouseMove(node, { clientX: 500, clientY: 50 });

  expect(getComputedStyle(tooltip).left).not.toBe(position);
  expect(getComputedStyle(tooltip).transform).not.toBe(transform);
  expect(tooltip.className).toBe(className);
  expect(tooltip).toHaveTextContent('Traffic');
});
