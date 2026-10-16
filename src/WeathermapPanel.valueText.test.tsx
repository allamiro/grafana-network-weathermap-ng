// Regression tests for #380: Grafana's value formatters leave prefix and suffix
// undefined for some units ('none' has no suffix, currencies put the symbol in
// prefix). Tooltip metrics, link labels and the link tooltip used to join the
// parts raw, rendering "5 undefined" and dropping "$".
import React from 'react';
import {
  FieldType,
  getDefaultRelativeTimeRange,
  getTimeZone,
  LoadingState,
  PanelProps,
  toDataFrame,
} from '@grafana/data';
import { fireEvent, render, screen } from '@testing-library/react';
import { WeathermapPanel } from './WeathermapPanel';
import { SimpleOptions, Weathermap } from './types';
import { getData, theme } from './testData';
import { handleVersionedStateUpdates } from './utils';

const renderPanel = (configure: (wm: Weathermap) => void) => {
  const weathermap = handleVersionedStateUpdates(getData(theme), theme);
  configure(weathermap);
  const timeRange = getDefaultRelativeTimeRange();
  const props = {
    id: 1,
    data: {
      state: LoadingState.Done,
      series: [
        toDataFrame({
          fields: [
            { name: 'Time', type: FieldType.time, values: [1000] },
            { name: 'reading', type: FieldType.number, values: [5] },
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
  return { weathermap, ...render(<WeathermapPanel {...props} />) };
};

const hoverNode = (wm: Weathermap) =>
  fireEvent.mouseMove(screen.getByText(wm.nodes[0].label!).closest('g')!, { clientX: 100, clientY: 150 });

const hoverLink = () =>
  fireEvent.mouseMove(screen.getAllByTestId('link')[0].firstChild!, { clientX: 100, clientY: 150 });

test('a node tooltip metric with no unit shows the bare number (#380)', () => {
  const { weathermap } = renderPanel((wm) => {
    wm.nodes[0].tooltipMetrics = [{ label: 'Latency', query: 'reading' }];
  });
  hoverNode(weathermap);
  expect(screen.getByText('Latency: 5')).toBeInTheDocument();
  expect(screen.getByTestId('weathermap-node-tooltip')).not.toHaveTextContent('undefined');
});

test('a node tooltip metric keeps a unit suffix (#380)', () => {
  const { weathermap } = renderPanel((wm) => {
    wm.nodes[0].tooltipMetrics = [{ label: 'Latency', query: 'reading', units: 'ms' }];
  });
  hoverNode(weathermap);
  expect(screen.getByText('Latency: 5 ms')).toBeInTheDocument();
});

test('a node tooltip metric keeps a currency prefix (#380)', () => {
  const { weathermap } = renderPanel((wm) => {
    wm.nodes[0].tooltipMetrics = [{ label: 'Cost', query: 'reading', units: 'currencyUSD' }];
  });
  hoverNode(weathermap);
  expect(screen.getByTestId('weathermap-node-tooltip')).toHaveTextContent(/Cost: \$5/);
});

test('a link tooltip extra metric with unit none shows bare numbers (#380)', () => {
  renderPanel((wm) => {
    wm.links[0].tooltipMetrics = [{ label: 'Errors', queryA: 'reading', queryZ: 'reading', units: 'none' }];
  });
  hoverLink();
  expect(screen.getByText(/^Errors - /)).toHaveTextContent(/^Errors - \S+: 5, \S+: 5$/);
});

test('link labels and the link tooltip with unit none never show "undefined" (#380)', () => {
  const { container } = renderPanel((wm) => {
    wm.links[0].units = 'none';
    wm.links[0].sides.A.query = 'reading';
    wm.links[0].sides.Z.query = 'reading';
  });
  expect(container).not.toHaveTextContent('undefined');
  hoverLink();
  expect(screen.getByText(/^Usage - /)).toHaveTextContent(/^Usage - \S+: 5, \S+: 5$/);
  expect(container).not.toHaveTextContent('undefined');
});
