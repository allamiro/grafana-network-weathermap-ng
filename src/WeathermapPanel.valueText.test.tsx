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
            { name: 'negative', type: FieldType.number, values: [-5] },
            { name: 'big', type: FieldType.number, values: [1500000] },
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

// Characterization of every place a value is formatted, across the shapes
// Grafana's formatters return: no suffix (none), empty suffix that gains a
// scale word (short), spaced suffix (bps), unspaced suffix (percent), and
// prefix (currency, which also carries the minus sign). The panel has always
// put one space between the number and the suffix ("5  b/s", "5 %"); these
// exact strings are pinned so the #380 fix provably changes nothing but the
// missing-suffix and missing-prefix cases. Raw textContent is compared because
// toHaveTextContent collapses the double space.
describe('value text at every call site (#380)', () => {
  const text = (el: Element) => el.textContent;
  const line = (prefix: string) => text(screen.getByText(new RegExp(`^${prefix} - `)));

  // [units, reading=5, big=1500000]
  const linkCases: Array<[string, string, string]> = [
    ['bps', '5  b/s', '1.50  Mb/s'],
    ['Bps', '5  B/s', '1.50  MB/s'],
    ['percent', '5 %', '1500000 %'],
    ['short', '5', '1.50  Mil'],
    ['none', '5', '1500000'],
    ['currencyUSD', '$5', '$1.50 M'],
  ];

  test.each(linkCases)('link Usage line, unit %s', (units, reading, big) => {
    renderPanel((wm) => {
      wm.links[0].units = units;
      wm.links[0].sides.A.query = 'reading';
      wm.links[0].sides.Z.query = 'big';
    });
    hoverLink();
    expect(line('Usage')).toBe(`Usage - Inbound: ${big}, Outbound: ${reading}`);
  });

  // [units, bandwidth 0, bandwidth 5]
  const bandwidthCases: Array<[string, string, string]> = [
    ['bps', '0  b/s', '5  b/s'],
    ['percent', '0 %', '5 %'],
    ['short', '0', '5'],
    ['none', '0', '5'],
    ['currencyUSD', '$0', '$5'],
  ];

  test.each(bandwidthCases)('link Bandwidth line, unit %s', (units, zero, five) => {
    renderPanel((wm) => {
      wm.links[0].units = units;
      wm.links[0].sides.A.bandwidth = 5;
      wm.links[0].sides.Z.bandwidth = 0;
    });
    hoverLink();
    expect(line('Bandwidth')).toBe(`Bandwidth - Inbound: ${zero}, Outbound: ${five}`);
  });

  test('link values clamp negative throughput to 0 and keep the suffix', () => {
    renderPanel((wm) => {
      wm.links[0].units = 'bps';
      wm.links[0].sides.A.query = 'negative';
      wm.links[0].sides.Z.query = 'negative';
    });
    hoverLink();
    expect(line('Usage')).toBe('Usage - Inbound: 0  b/s, Outbound: 0  b/s');
  });

  test('a link side whose query matches nothing still shows n/a', () => {
    const { container } = renderPanel((wm) => {
      wm.links[0].units = 'none';
      wm.links[0].sides.A.query = 'reading';
      wm.links[0].sides.Z.query = 'missing';
    });
    hoverLink();
    expect(line('Usage')).toBe('Usage - Inbound: n/a, Outbound: 5');
    expect(container).not.toHaveTextContent('undefined');
  });

  test('throughput percentage mode is unaffected by units', () => {
    const { container } = renderPanel((wm) => {
      wm.links[0].units = 'none';
      wm.links[0].showThroughputPercentage = true;
      wm.links[0].sides.A.query = 'reading';
      wm.links[0].sides.A.bandwidth = 10;
    });
    expect(container).toHaveTextContent('50.00%');
    hoverLink();
    expect(line('Throughput \\(%\\)')).toMatch(/Outbound: 50\.00%$/);
  });

  test('link decimals still apply', () => {
    renderPanel((wm) => {
      wm.settings.link.linkDecimals = 2;
      wm.links[0].units = 'bps';
      wm.links[0].sides.A.query = 'reading';
    });
    hoverLink();
    expect(line('Usage')).toMatch(/Outbound: 5\.00 {2}b\/s$/);
  });

  // Extra metrics keep negatives (#370) and show n/a for a missing series
  // (#373). [units, reading=5, negative=-5]
  const metricCases: Array<[string | undefined, string, string]> = [
    [undefined, '5', '-5'],
    ['none', '5', '-5'],
    ['ms', '5  ms', '-5  ms'],
    ['percent', '5 %', '-5 %'],
    ['dbm', '5  dbm', '-5  dbm'],
    ['currencyUSD', '$5', '-$5'],
  ];

  test.each(metricCases)('node tooltip metric, unit %s', (units, reading, negative) => {
    const { weathermap } = renderPanel((wm) => {
      wm.nodes[0].tooltipMetrics = [
        { label: 'R', query: 'reading', units },
        { label: 'N', query: 'negative', units },
        { label: 'M', query: 'missing', units },
      ];
    });
    hoverNode(weathermap);
    expect(text(screen.getByText(/^R: /))).toBe(`R: ${reading}`);
    expect(text(screen.getByText(/^N: /))).toBe(`N: ${negative}`);
    expect(text(screen.getByText(/^M: /))).toBe('M: n/a');
  });

  test.each(metricCases)('link tooltip extra metric, unit %s', (units, reading, negative) => {
    renderPanel((wm) => {
      wm.links[0].tooltipMetrics = [
        { label: 'R', queryA: 'reading', queryZ: 'negative', units },
        { label: 'M', queryA: 'missing', queryZ: 'reading', units },
      ];
    });
    hoverLink();
    // A metric without units falls back to the link's units, which default to bps.
    const [r, n] = units === undefined ? ['5  b/s', '-5  b/s'] : [reading, negative];
    expect(line('R')).toBe(`R - Inbound: ${r}, Outbound: ${n}`);
    expect(line('M')).toBe(`M - Inbound: n/a, Outbound: ${r}`);
  });
});
