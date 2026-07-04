import React from 'react';
import { getDefaultRelativeTimeRange, getTimeZone, LoadingState, PanelProps } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { fireEvent, render, screen } from '@testing-library/react';
import { WeathermapPanel } from 'WeathermapPanel';
import { SimpleOptions } from 'types';
import { handleVersionedStateUpdates } from 'utils';
import { getConnectedLinkData, getData, theme } from 'testData';

const mPanelProps = {
  id: 1,
  data: {
    state: LoadingState.Done,
    series: [],
    timeRange: getDefaultRelativeTimeRange(),
  },
  timeRange: getDefaultRelativeTimeRange(),
  timeZone: getTimeZone(),
  options: {
    weathermap: null as unknown as SimpleOptions['weathermap'],
  },
  transparent: false,
  width: 600,
  height: 400,
  fieldConfig: {},
  renderCounter: 1,
  title: 'Test Panel Title',
  eventBus: {},
  onOptionsChange: (options: SimpleOptions) => {
    console.log('OPTION CHANGE CALLED');
  },
} as unknown as PanelProps<SimpleOptions>;

// Annoying wrapper to support movementX/Y in mouse events for testing
class MouseMoveEvent extends MouseEvent {
  readonly movementX = 0 as number;
  readonly movementY = 0 as number;
  constructor(init?: MouseEventInit) {
    super('mousemove', init);
    if (init?.movementX) {
      this.movementX = init.movementX ?? 0;
    }
    if (init?.movementY) {
      this.movementY = init.movementY ?? 0;
    }
  }
}

// Restore the editPanel location spy after every test — even if an assertion
// throws mid-test — so `editPanel=1` never leaks into subsequent tests. Scoped
// to this spy only so global scaffolding mocks (e.g. canvas measureText) stay
// intact.
let getSearchSpy: jest.SpyInstance | undefined;
afterEach(() => {
  getSearchSpy?.mockRestore();
  getSearchSpy = undefined;
});

test('Creating a weathermap', () => {
  let testProps = { ...mPanelProps };
  testProps.options.weathermap = handleVersionedStateUpdates(getData(theme), theme);
  testProps.onOptionsChange = (options: SimpleOptions) => {
    testProps.options = options;
  };

  // Render the panel
  const { container } = render(<WeathermapPanel {...testProps} />);

  // Check the SVG exists
  let wmRendered = container.querySelector('#nw-testing')!;
  expect(wmRendered).toHaveProperty('tagName', 'svg');

  // Check for each node
  testProps.options.weathermap.nodes.forEach((n) => {
    expect(screen.queryByText(n.label!)).not.toBeNull();
  });

  // Check that we have a link
  expect(screen.getAllByTestId('link')).toHaveLength(1);

  // Check that link hover works
  fireEvent.mouseMove(screen.getByTestId('link').firstChild!);
  fireEvent.mouseLeave(screen.getByTestId('link').firstChild!);

  // Check link labels
  expect(screen.getAllByText('n/a')).toHaveLength(2);

  // Check we can drag the viewport
  const prevTranslation = container.querySelector('g')!.getAttribute('transform');
  fireEvent.mouseDown(container.querySelector('#nw-testing')!);
  const event: MouseEvent = new MouseMoveEvent({ movementX: 10, movementY: 10, buttons: 4, bubbles: true });
  fireEvent(container.querySelector('#nw-testing')!, event);
  fireEvent.mouseUp(container.querySelector('#nw-testing')!);
  const newTranslation = container.querySelector('g')!.getAttribute('transform');
  expect(prevTranslation).not.toEqual(newTranslation);

  // TODO: find a working way to check node dragging
});

test('Uses explicit per-side direction labels in the link tooltip when set', () => {
  let testProps = { ...mPanelProps };
  const weathermap = handleVersionedStateUpdates(getData(theme), theme);
  weathermap.links[0].sides.A.directionLabel = 'TX-UPLINK';
  weathermap.links[0].sides.Z.directionLabel = 'RX-DOWNLINK';
  // A custom tooltip metric row must use the same per-side labels, not the
  // generic Inbound/Outbound wording.
  weathermap.links[0].tooltipMetrics = [{ label: 'Errors', queryA: 'a-series', queryZ: 'z-series' }];
  testProps.options.weathermap = weathermap;
  testProps.onOptionsChange = (options: SimpleOptions) => {
    testProps.options = options;
  };

  render(<WeathermapPanel {...testProps} />);

  // Hover the link to open its tooltip.
  fireEvent.mouseMove(screen.getByTestId('link').firstChild!);

  // Both explicit labels replace the generic Inbound/Outbound wording.
  expect(screen.getAllByText(/TX-UPLINK/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/RX-DOWNLINK/).length).toBeGreaterThan(0);
  // The custom metric row uses the direction labels and not "Inbound"/"Outbound".
  const metricRow = screen.getByText(/Errors/).textContent || '';
  expect(metricRow).toContain('TX-UPLINK');
  expect(metricRow).toContain('RX-DOWNLINK');
  expect(metricRow).not.toContain('Inbound');
  expect(metricRow).not.toContain('Outbound');

  fireEvent.mouseLeave(screen.getByTestId('link').firstChild!);
});

test('Renders a link with a custom arrow meeting point without breaking geometry', () => {
  let testProps = { ...mPanelProps };
  const weathermap = handleVersionedStateUpdates(getData(theme), theme);
  weathermap.links[0].arrowMeetPercent = 90;
  // Fresh options object so we don't mutate the shared mock props.
  testProps.options = { weathermap };
  testProps.onOptionsChange = (options: SimpleOptions) => {
    testProps.options = options;
  };

  render(<WeathermapPanel {...testProps} />);

  const link = screen.getByTestId('link');
  expect(link).not.toBeNull();
  // A shifted meeting point must still produce finite coordinates
  // (no divide-by-zero / NaN in the arrow geometry).
  expect(link.innerHTML).not.toContain('NaN');
});

test('Draws the background image inside the canvas when Move With Map is enabled', () => {
  let testProps = { ...mPanelProps };
  const weathermap = handleVersionedStateUpdates(getData(theme), theme);
  weathermap.settings.panel.backgroundImage = {
    url: 'https://example.com/bg.png',
    fit: 'contain',
    attachToCanvas: true,
  };
  testProps.options = { weathermap };
  testProps.onOptionsChange = (options: SimpleOptions) => {
    testProps.options = options;
  };

  const { container } = render(<WeathermapPanel {...testProps} />);

  const images = Array.from(container.querySelectorAll('image'));
  expect(images.some((im) => im.getAttribute('href') === 'https://example.com/bg.png')).toBe(true);
});

test('Keeps the background image static (no in-canvas image) when Move With Map is off', () => {
  let testProps = { ...mPanelProps };
  const weathermap = handleVersionedStateUpdates(getData(theme), theme);
  weathermap.settings.panel.backgroundImage = {
    url: 'https://example.com/bg.png',
    fit: 'contain',
  };
  testProps.options = { weathermap };
  testProps.onOptionsChange = (options: SimpleOptions) => {
    testProps.options = options;
  };

  const { container } = render(<WeathermapPanel {...testProps} />);

  const images = Array.from(container.querySelectorAll('image'));
  expect(images.some((im) => im.getAttribute('href') === 'https://example.com/bg.png')).toBe(false);
});

test('Double-clicking a link in edit mode inserts a VIA', () => {
  getSearchSpy = jest.spyOn(locationService, 'getSearch').mockReturnValue(new URLSearchParams('editPanel=1'));
  let captured: SimpleOptions | null = null;
  let testProps = { ...mPanelProps };
  testProps.options = { weathermap: handleVersionedStateUpdates(getData(theme), theme) };
  testProps.onOptionsChange = (o: SimpleOptions) => {
    captured = o;
  };

  render(<WeathermapPanel {...testProps} />);
  fireEvent.doubleClick(screen.getByTestId('link'));

  expect(captured).not.toBeNull();
  expect(captured!.weathermap.nodes.length).toBe(3); // A, B, and the new VIA
  expect(captured!.weathermap.nodes.some((n) => n.isConnection)).toBe(true);
  expect(captured!.weathermap.links.length).toBe(2);
});

test('Right-clicking a VIA in edit mode removes it', () => {
  getSearchSpy = jest.spyOn(locationService, 'getSearch').mockReturnValue(new URLSearchParams('editPanel=1'));
  let captured: SimpleOptions | null = null;
  let testProps = { ...mPanelProps };
  testProps.options = { weathermap: handleVersionedStateUpdates(getConnectedLinkData(theme), theme) };
  testProps.onOptionsChange = (o: SimpleOptions) => {
    captured = o;
  };

  render(<WeathermapPanel {...testProps} />);
  // Connection nodes render their label in edit mode.
  const viaGroup = screen.getByText('C0').closest('g')!;
  fireEvent.contextMenu(viaGroup);

  expect(captured).not.toBeNull();
  expect(captured!.weathermap.nodes.some((n) => n.isConnection)).toBe(false);
  expect(captured!.weathermap.nodes.length).toBe(2);
  expect(captured!.weathermap.links.length).toBe(1);
});

test('Panning the viewport works with the Cmd key (macOS)', () => {
  let testProps = { ...mPanelProps };
  testProps.options = { weathermap: handleVersionedStateUpdates(getData(theme), theme) };
  testProps.onOptionsChange = (o: SimpleOptions) => {
    testProps.options = o;
  };

  const { container } = render(<WeathermapPanel {...testProps} />);
  const svg = container.querySelector('#nw-testing')!;
  const prev = container.querySelector('g')!.getAttribute('transform');

  // Cmd (metaKey) + drag should pan just like Ctrl/middle-mouse on other OSes.
  fireEvent.mouseDown(svg);
  fireEvent(svg, new MouseMoveEvent({ movementX: 10, movementY: 10, metaKey: true, bubbles: true }));
  fireEvent.mouseUp(svg);

  expect(container.querySelector('g')!.getAttribute('transform')).not.toEqual(prev);
});

test('Zoom responds to horizontal scroll (macOS Shift+scroll remap)', () => {
  getSearchSpy = jest.spyOn(locationService, 'getSearch').mockReturnValue(new URLSearchParams('editPanel=1'));
  let testProps = { ...mPanelProps };
  testProps.options = { weathermap: handleVersionedStateUpdates(getConnectedLinkData(theme), theme) };
  testProps.onOptionsChange = (o: SimpleOptions) => {
    testProps.options = o;
  };

  const { container } = render(<WeathermapPanel {...testProps} />);
  // macOS remaps Shift+scroll to the horizontal axis; only deltaX is set.
  fireEvent.wheel(container.querySelector('#nw-testing_')!, { deltaX: 1, deltaY: 0 });
  expect(testProps.options.weathermap.settings.panel.zoomScale).not.toEqual(0);
});

test('Shows the timeline slider when enabled', () => {
  let testProps = { ...mPanelProps };
  const weathermap = handleVersionedStateUpdates(getData(theme), theme);
  weathermap.settings.link.timeline = { enabled: true };
  testProps.options = { weathermap };
  // A valid (ascending) time range so the slider bounds are well-formed.
  testProps.timeRange = {
    from: { valueOf: () => 1_000_000 },
    to: { valueOf: () => 2_000_000, toLocaleString: () => '2M' },
  } as unknown as PanelProps<SimpleOptions>['timeRange'];
  testProps.onOptionsChange = (o: SimpleOptions) => {
    testProps.options = o;
  };

  render(<WeathermapPanel {...testProps} />);
  const timeline = screen.getByTestId('weathermap-timeline');
  expect(timeline).not.toBeNull();
  // Starts in the live state.
  expect(timeline.textContent).toContain('Live');
});

test('Hides the timeline slider when disabled', () => {
  let testProps = { ...mPanelProps };
  testProps.options = { weathermap: handleVersionedStateUpdates(getData(theme), theme) };
  testProps.onOptionsChange = (o: SimpleOptions) => {
    testProps.options = o;
  };

  render(<WeathermapPanel {...testProps} />);
  expect(screen.queryByTestId('weathermap-timeline')).toBeNull();
});

// Tests plays badly with new deps
// test('Editing a weathermap', () => {
//   let testProps = { ...mPanelProps };
//   let weathermap = handleVersionedStateUpdates(getData2(theme), theme);

//   testProps.options.weathermap = weathermap;

//   testProps.onOptionsChange = (options: SimpleOptions) => {
//     testProps.options = options;
//   };

//   // Render the panel
//   const { rerender } = render(<WeathermapPanel {...testProps} />);

//   // Check for each node
//   testProps.options.weathermap.nodes.forEach((n) => {
//     expect(screen.queryByText(n.label!)).not.toBeNull();
//   });

//   // Check that icons are rendered
//   console.log(weathermap.nodes[0])
//   weathermap.nodes[0].label = '';
//   console.log(weathermap.nodes[0])
//   let testProps2 = { ...mPanelProps };
//   testProps2.options.weathermap = weathermap;
//   rerender(<WeathermapPanel {...testProps2} />);
//   expect(screen.queryByText('Node A')).toBeNull();

//   testProps.options.weathermap.nodes[0].nodeIcon!.drawInside = true;
//   testProps.options.weathermap.nodes[0].nodeIcon!.size = { width: 100, height: 100 };
//   testProps.options.weathermap.nodes[0].nodeIcon!.src = '/icons/test';
//   rerender(<WeathermapPanel {...testProps} />);
//   expect(screen.queryByText('Node A')).toBeNull();

//   testProps.options.weathermap.nodes[0].label = 'Node A';
//   rerender(<WeathermapPanel {...testProps} />);
//   expect(screen.queryByText('Node A')).not.toBeNull();

//   // Check that we have two links
//   expect(screen.getAllByTestId('link')).toHaveLength(2);
// });

test('Connected links', () => {
  let testProps = { ...mPanelProps };
  testProps.options.weathermap = handleVersionedStateUpdates(getConnectedLinkData(theme), theme);
  testProps.onOptionsChange = (options: SimpleOptions) => {
    testProps.options = options;
  };

  // Render the panel
  render(<WeathermapPanel {...testProps} />);

  // Check for each node
  testProps.options.weathermap.nodes.forEach((n) => {
    if (n.isConnection) {
      expect(screen.queryByText(n.label!)).toBeNull();
    } else {
      expect(screen.queryByText(n.label!)).not.toBeNull();
    }
  });

  // Check that we have two links (one is a connection)
  expect(screen.getAllByTestId('link')).toHaveLength(2);
});

test('Shows an error notice when a query fails', () => {
  let testProps = { ...mPanelProps };
  testProps.options.weathermap = handleVersionedStateUpdates(getData(theme), theme);
  testProps.data = {
    state: LoadingState.Error,
    series: [],
    error: { message: 'boom' },
    timeRange: getDefaultRelativeTimeRange(),
  } as unknown as PanelProps<SimpleOptions>['data'];

  render(<WeathermapPanel {...testProps} />);

  const notice = screen.getByTestId('weathermap-data-notice');
  expect(notice.textContent).toContain('Query error');
  expect(notice.textContent).toContain('boom');
});

test('Shows a no-data notice when queries are configured but return nothing', () => {
  let testProps = { ...mPanelProps };
  const weathermap = handleVersionedStateUpdates(getData(theme), theme);
  weathermap.links[0].sides.A.query = 'A-series';
  testProps.options.weathermap = weathermap;
  testProps.data = {
    state: LoadingState.Done,
    series: [],
    timeRange: getDefaultRelativeTimeRange(),
  } as unknown as PanelProps<SimpleOptions>['data'];

  render(<WeathermapPanel {...testProps} />);

  const notice = screen.getByTestId('weathermap-data-notice');
  expect(notice.textContent).toContain('No data');
});

test('Shows no notice for a topology-only map with no queries', () => {
  let testProps = { ...mPanelProps };
  testProps.options.weathermap = handleVersionedStateUpdates(getData(theme), theme);
  testProps.data = {
    state: LoadingState.Done,
    series: [],
    timeRange: getDefaultRelativeTimeRange(),
  } as unknown as PanelProps<SimpleOptions>['data'];

  render(<WeathermapPanel {...testProps} />);

  expect(screen.queryByTestId('weathermap-data-notice')).toBeNull();
});

test('Shows a node tooltip with configured metrics on hover', () => {
  let testProps = { ...mPanelProps };
  const weathermap = handleVersionedStateUpdates(getData(theme), theme);
  weathermap.nodes[0].tooltipMetrics = [{ label: 'Latency', query: 'latency-series', units: 's' }];
  testProps.options.weathermap = weathermap;
  testProps.onOptionsChange = (options: SimpleOptions) => {
    testProps.options = options;
  };

  render(<WeathermapPanel {...testProps} />);

  // No tooltip until we hover.
  expect(screen.queryByTestId('weathermap-node-tooltip')).toBeNull();

  // Hover the node that has metrics configured.
  const nodeGroup = screen.getByText(weathermap.nodes[0].label!).closest('g')!;
  fireEvent.mouseMove(nodeGroup);

  const tooltip = screen.getByTestId('weathermap-node-tooltip');
  expect(tooltip.textContent).toContain('Latency');
  // With no matching series the value resolves to n/a rather than crashing.
  expect(tooltip.textContent).toContain('n/a');

  // Leaving the node hides the tooltip again.
  fireEvent.mouseLeave(nodeGroup);
  expect(screen.queryByTestId('weathermap-node-tooltip')).toBeNull();
});

test('Shows no node tooltip when the node has no configured metrics', () => {
  let testProps = { ...mPanelProps };
  const weathermap = handleVersionedStateUpdates(getData(theme), theme);
  testProps.options.weathermap = weathermap;
  testProps.onOptionsChange = (options: SimpleOptions) => {
    testProps.options = options;
  };

  render(<WeathermapPanel {...testProps} />);

  const nodeGroup = screen.getByText(weathermap.nodes[0].label!).closest('g')!;
  fireEvent.mouseMove(nodeGroup);

  expect(screen.queryByTestId('weathermap-node-tooltip')).toBeNull();
});

test('Check edit mode display', () => {
  let testProps = { ...mPanelProps };
  testProps.options.weathermap = handleVersionedStateUpdates(getConnectedLinkData(theme), theme);
  testProps.onOptionsChange = (options: SimpleOptions) => {
    testProps.options = options;
  };

  getSearchSpy = jest.spyOn(locationService, 'getSearch').mockReturnValue(new URLSearchParams('editPanel=1'));

  // Render the panel
  const { container, rerender } = render(<WeathermapPanel {...testProps} />);

  // Check for each node
  testProps.options.weathermap.nodes.forEach((n) => {
    expect(screen.queryByText(n.label!)).not.toBeNull();
  });

  // Check we can zoom the viewport (only possible in edit mode)
  fireEvent.wheel(container.querySelector('#nw-testing_')!, { deltaY: 1 });
  expect(testProps.options.weathermap.settings.panel.zoomScale).not.toEqual(0);

  // Re-render with updated options so the component sees the new zoomScale
  rerender(<WeathermapPanel {...testProps} />);
  fireEvent.wheel(container.querySelector('#nw-testing_')!, { deltaY: -1 });
  expect(testProps.options.weathermap.settings.panel.zoomScale).toEqual(0);

  getSearchSpy.mockReturnValue(new URLSearchParams(''));
  rerender(<WeathermapPanel {...testProps} />);
  fireEvent.wheel(container.querySelector('#nw-testing')!, { deltaY: -1 });
  expect(testProps.options.weathermap.settings.panel.zoomScale).toEqual(0);
});

describe('renders empty or missing weathermap without throwing (#198)', () => {
  const renderWith = (weathermap: unknown) => {
    const props = {
      ...mPanelProps,
      options: { weathermap: weathermap as SimpleOptions['weathermap'] },
      onOptionsChange: jest.fn(),
    };
    return render(<WeathermapPanel {...props} />);
  };

  test('missing weathermap renders the empty state', () => {
    const { container } = renderWith(undefined);
    expect(container).toBeInTheDocument();
    expect(screen.queryAllByTestId('link')).toHaveLength(0);
  });

  test('weathermap with missing nodes array renders', () => {
    const wm = handleVersionedStateUpdates(getData(theme), theme) as unknown as Record<string, unknown>;
    delete wm.nodes;
    wm.links = [];
    const { container } = renderWith(wm);
    expect(container).toBeInTheDocument();
  });

  test('weathermap with missing links array renders its nodes', () => {
    const wm = handleVersionedStateUpdates(getData(theme), theme) as unknown as Record<string, unknown>;
    delete wm.links;
    const { container } = renderWith(wm);
    expect(container.querySelector('#nw-testing')).toBeInTheDocument();
  });

  test('partially initialized unversioned weathermap is migrated for render', () => {
    // Only an id and one empty array: no version, no settings, no nodes.
    const { container } = renderWith({ id: 'partial', links: [] });
    expect(container).toBeInTheDocument();
  });
});
