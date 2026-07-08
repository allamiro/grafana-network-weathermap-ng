import React from 'react';
import { getDefaultRelativeTimeRange, getTimeZone, LoadingState, PanelProps, toDataFrame } from '@grafana/data';
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

test('Gradient color applies to link arrow tips (issue #283)', () => {
  let testProps = { ...mPanelProps };
  const weathermap = handleVersionedStateUpdates(getData(theme), theme);
  weathermap.settings.link.gradientColor = true;
  testProps.options = { weathermap };
  testProps.onOptionsChange = (o: SimpleOptions) => {
    testProps.options = o;
  };

  const { container } = render(<WeathermapPanel {...testProps} />);
  const arrows = Array.from(container.querySelectorAll('polygon'));
  expect(arrows.length).toBeGreaterThan(0);
  // Arrow heads must be painted with the gradient, not a solid color, so the
  // gradient continues smoothly to the tips.
  expect(arrows.every((p) => (p.getAttribute('fill') || '').startsWith('url(#grad'))).toBe(true);
});

test('Arrow tips use a solid color when gradient is off', () => {
  let testProps = { ...mPanelProps };
  const weathermap = handleVersionedStateUpdates(getData(theme), theme);
  weathermap.settings.link.gradientColor = false;
  testProps.options = { weathermap };
  testProps.onOptionsChange = (o: SimpleOptions) => {
    testProps.options = o;
  };

  const { container } = render(<WeathermapPanel {...testProps} />);
  const arrows = Array.from(container.querySelectorAll('polygon'));
  expect(arrows.length).toBeGreaterThan(0);
  expect(arrows.some((p) => (p.getAttribute('fill') || '').startsWith('url(#grad'))).toBe(false);
});

// DOCUMENT_POSITION_FOLLOWING = 4 (avoids colliding with the imported `Node` type).
const FOLLOWS = 4;

test('Nodes paint in creation order by default (#280)', () => {
  let testProps = { ...mPanelProps };
  testProps.options = { weathermap: handleVersionedStateUpdates(getData(theme), theme) };
  testProps.onOptionsChange = (o: SimpleOptions) => {
    testProps.options = o;
  };

  render(<WeathermapPanel {...testProps} />);
  const aGroup = screen.getByText('Node A').closest('g')!;
  const bGroup = screen.getByText('Node B').closest('g')!;
  // Node B (created second) renders after Node A, so it sits on top.
  expect(aGroup.compareDocumentPosition(bGroup) & FOLLOWS).toBeTruthy();
});

test('A higher z-index node paints on top (#280)', () => {
  let testProps = { ...mPanelProps };
  const weathermap = handleVersionedStateUpdates(getData(theme), theme);
  // Give the first node (Node A) a high z-index so it should render last.
  weathermap.nodes.find((n) => n.label === 'Node A')!.zIndex = 10;
  testProps.options = { weathermap };
  testProps.onOptionsChange = (o: SimpleOptions) => {
    testProps.options = o;
  };

  render(<WeathermapPanel {...testProps} />);
  const aGroup = screen.getByText('Node A').closest('g')!;
  const bGroup = screen.getByText('Node B').closest('g')!;
  // Now Node A must render AFTER Node B (i.e. B is followed by A) → A on top.
  expect(bGroup.compareDocumentPosition(aGroup) & FOLLOWS).toBeTruthy();
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

  // #224: a CURRENT-version map with missing nested settings must also repair
  // through migration instead of crashing on direct dereferences.
  test.each(['panel', 'tooltip', 'scale', 'link'])(
    'current-version weathermap missing settings.%s renders',
    (key) => {
      const wm = handleVersionedStateUpdates(getData(theme), theme) as unknown as {
        settings: Record<string, unknown>;
      };
      delete wm.settings[key];
      const { container } = renderWith(wm);
      expect(container.querySelector('#nw-testing')).toBeInTheDocument();
    }
  );
});

// #199: the panel must not call onOptionsChange during the render phase and
// must not mutate the saved options object; migrated options are persisted
// from an effect after commit.
describe('migration persistence is a commit-phase effect (#199)', () => {
  test('old-version options persist migrated weathermap without mutating input', () => {
    const legacy = JSON.parse(JSON.stringify(getData(theme)));
    delete legacy.version;
    const snapshot = JSON.parse(JSON.stringify(legacy));
    const onOptionsChange = jest.fn();

    render(<WeathermapPanel {...{ ...mPanelProps, options: { weathermap: legacy }, onOptionsChange }} />);

    expect(legacy).toEqual(snapshot);
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    const persisted = onOptionsChange.mock.calls[0][0].weathermap;
    expect(persisted.version).toBeDefined();
    expect(persisted).not.toBe(legacy);
  });

  test('current-version options trigger no option writes', () => {
    const wm = handleVersionedStateUpdates(getData(theme), theme);
    const onOptionsChange = jest.fn();

    render(<WeathermapPanel {...{ ...mPanelProps, options: { weathermap: wm }, onOptionsChange }} />);

    expect(onOptionsChange).not.toHaveBeenCalled();
  });
});

// #201: timeline and state synchronization.
describe('timeline and state synchronization (#201)', () => {
  const timelineProps = () => {
    const testProps = { ...mPanelProps };
    const weathermap = handleVersionedStateUpdates(getData(theme), theme);
    weathermap.settings.link.timeline = { enabled: true };
    weathermap.links[0].sides.A.query = 'link-series';
    weathermap.nodes[0].statusQuery = 'status-series';
    testProps.options = { weathermap };
    testProps.timeRange = {
      from: { valueOf: () => 1_000_000 },
      to: { valueOf: () => 2_000_000, toLocaleString: () => '2M' },
    } as unknown as PanelProps<SimpleOptions>['timeRange'];
    testProps.data = {
      state: LoadingState.Done,
      series: [
        toDataFrame({
          refId: 'A',
          fields: [
            { name: 'Time', values: [1_200_000, 2_000_000] },
            { name: 'Value', values: [42, 87], config: { displayNameFromDS: 'link-series' } },
          ],
        }),
        toDataFrame({
          refId: 'B',
          fields: [
            { name: 'Time', values: [1_200_000, 2_000_000] },
            { name: 'Value', values: [1, 0], config: { displayNameFromDS: 'status-series' } },
          ],
        }),
      ],
      timeRange: getDefaultRelativeTimeRange(),
    } as unknown as PanelProps<SimpleOptions>['data'];
    testProps.onOptionsChange = jest.fn();
    return testProps;
  };

  const scrubBack = () => {
    // One ArrowLeft moves the slider one step below the live position, which
    // lands between the two samples: step-hold resolves to the first sample.
    const handle = screen.getByRole('slider');
    fireEvent.keyDown(handle, { key: 'ArrowLeft', keyCode: 37 });
  };

  test('timeline scrub updates link label value', () => {
    const { container } = render(<WeathermapPanel {...timelineProps()} />);

    // Live: the A-side label shows the most recent sample (87).
    expect(container.textContent).toContain('87');
    expect(container.textContent).not.toContain('42');

    scrubBack();

    // Scrubbed: the label replays the historical sample (42).
    expect(container.textContent).toContain('42');
  });

  test('timeline scrub replays node status', () => {
    const props = timelineProps();
    const statusDown = props.options.weathermap.nodes[0].colors.statusDown;
    render(<WeathermapPanel {...props} />);

    const nodeRect = () =>
      screen.getByText(props.options.weathermap.nodes[0].label!).closest('g')!.querySelector('rect')!;

    // Live: the last status sample is 0 -> node is down.
    expect(nodeRect().getAttribute('stroke')).toBe(statusDown);

    scrubBack();

    // Scrubbed into history: the status sample there is 1 -> node was up.
    expect(nodeRect().getAttribute('stroke')).not.toBe(statusDown);
  });

  test('pan offset resyncs from changed options', () => {
    const testProps = { ...mPanelProps };
    const weathermap = handleVersionedStateUpdates(getData(theme), theme);
    testProps.options = { weathermap };
    testProps.onOptionsChange = jest.fn();

    const { container, rerender } = render(<WeathermapPanel {...testProps} />);
    const before = container.querySelector('g')!.getAttribute('transform');

    // An external change to the saved offset (dashboard reload, other session).
    const changed = JSON.parse(JSON.stringify(weathermap));
    changed.settings.panel.offset = { x: 120, y: 80 };
    rerender(<WeathermapPanel {...{ ...testProps, options: { weathermap: changed } }} />);

    const after = container.querySelector('g')!.getAttribute('transform');
    expect(after).not.toEqual(before);
    expect(after).toContain('120');
    expect(after).toContain('80');
  });

  test('VIA chain labels and hover tooltip resolve chain data without mutation side effects', () => {
    const testProps = { ...mPanelProps };
    const weathermap = handleVersionedStateUpdates(getConnectedLinkData(theme), theme);
    // Segment 1 (A -> C0) carries the chain's A-side data; segment 2
    // (C0 -> B) carries the chain's Z-side data.
    weathermap.links[0].sides.A.query = 'a1-series';
    weathermap.links[1].sides.Z.query = 'z2-series';
    testProps.options = { weathermap };
    const mkFrame = (name: string, v: number) =>
      toDataFrame({
        fields: [
          { name: 'Time', values: [1, 2] },
          { name: 'Value', values: [v, v], config: { displayNameFromDS: name } },
        ],
      });
    testProps.data = {
      state: LoadingState.Done,
      series: [mkFrame('a1-series', 331), mkFrame('z2-series', 222)],
      timeRange: getDefaultRelativeTimeRange(),
    } as unknown as PanelProps<SimpleOptions>['data'];
    testProps.onOptionsChange = jest.fn();

    const { container } = render(<WeathermapPanel {...testProps} />);

    // The A-side value propagates through the connection: both the origin
    // segment and the segment leaving the connection label with 331.
    const count331 = (container.textContent!.match(/331/g) || []).length;
    expect(count331).toBe(2);
    const renderedBefore = container.textContent;
    const optionsBefore = JSON.stringify(testProps.options.weathermap.links);

    // Hover segment 1: its target is the connection, so the tooltip resolves
    // the forward chain (segment 2's Z data) on the fly.
    const segment1 = screen.getAllByTestId('link')[0];
    fireEvent.mouseMove(segment1.firstChild!);
    const tooltip = Array.from(document.querySelectorAll('div')).map((el) => el.textContent || '');
    expect(tooltip.some((t) => t.includes('222'))).toBe(true);
    fireEvent.mouseLeave(segment1.firstChild!);

    // Hovering resolved chain data into the tooltip only: the rendered map
    // and the saved options are byte-identical afterwards.
    expect(container.textContent).toBe(renderedBefore);
    expect(JSON.stringify(testProps.options.weathermap.links)).toBe(optionsBefore);
  });

  test('multi-VIA chains show the origin data on every downstream segment', () => {
    // A -> C1 -> C2 -> B: three segments through two consecutive connection
    // nodes. Every segment's A-side label must resolve back to the origin
    // link's series, regardless of segment order in the links array.
    const testProps = { ...mPanelProps };
    const weathermap = handleVersionedStateUpdates(getConnectedLinkData(theme), theme);
    const c2 = JSON.parse(JSON.stringify(weathermap.nodes[2]));
    c2.id = 'conn-2';
    c2.label = 'C1';
    c2.position = [350, 350];
    weathermap.nodes.push(c2);
    const seg3 = JSON.parse(JSON.stringify(weathermap.links[1]));
    // Rewire: seg2 now ends at C2; seg3 runs C2 -> B.
    weathermap.links[1].nodes[1] = c2;
    seg3.id = 'seg-3';
    seg3.nodes[0] = c2;
    weathermap.links.push(seg3);
    weathermap.links[0].sides.A.query = 'origin-series';
    testProps.options = { weathermap };
    testProps.data = {
      state: LoadingState.Done,
      series: [
        toDataFrame({
          fields: [
            { name: 'Time', values: [1, 2] },
            { name: 'Value', values: [777, 777], config: { displayNameFromDS: 'origin-series' } },
          ],
        }),
      ],
      timeRange: getDefaultRelativeTimeRange(),
    } as unknown as PanelProps<SimpleOptions>['data'];
    testProps.onOptionsChange = jest.fn();

    const { container } = render(<WeathermapPanel {...testProps} />);

    // Three segments, each labeling its A side with the origin value.
    expect(screen.getAllByTestId('link')).toHaveLength(3);
    expect((container.textContent!.match(/777/g) || []).length).toBe(3);
  });

  test('scrubbed node status resolves raw negative values like live mode', () => {
    const props = timelineProps();
    const node = props.options.weathermap.nodes[0];
    // Two thresholds: raw -3 must match the -5 mapping (RED). A clamped
    // value of 0 would wrongly match the 0 mapping (GREEN) instead.
    node.statusValueMappings = [
      { value: -5, color: '#aa0000' },
      { value: 0, color: '#00aa00' },
    ];
    props.data.series[1] = toDataFrame({
      refId: 'B',
      fields: [
        { name: 'Time', values: [1_200_000, 2_000_000] },
        { name: 'Value', values: [-3, 7], config: { displayNameFromDS: 'status-series' } },
      ],
    });
    render(<WeathermapPanel {...props} />);

    const nodeRect = () => screen.getByText(node.label!).closest('g')!.querySelector('rect')!;

    // Live: last sample is 7 -> highest threshold <= 7 is 0 -> green.
    expect(nodeRect().getAttribute('stroke')).toBe('#00aa00');

    scrubBack();

    // Scrubbed to the -3 sample: threshold -5 applies -> red, not the
    // clamped-to-zero green.
    expect(nodeRect().getAttribute('stroke')).toBe('#aa0000');
  });
});

// #204: with two frames sharing a display name, the resolved link value must
// come from the FIRST frame — matching the dropdown's de-duplication — not
// from whichever duplicate happens to arrive last in data.series.
test('duplicate display names resolve deterministically to the first frame (#204)', () => {
  const testProps = { ...mPanelProps };
  const weathermap = handleVersionedStateUpdates(getData(theme), theme);
  weathermap.links[0].sides.A.query = 'dup-series';
  testProps.options = { weathermap };
  const mkFrame = (refId: string, v: number) =>
    toDataFrame({
      refId,
      fields: [
        { name: 'Time', values: [1, 2] },
        { name: 'Value', values: [v, v], config: { displayNameFromDS: 'dup-series' } },
      ],
    });
  testProps.data = {
    state: LoadingState.Done,
    series: [mkFrame('A', 53), mkFrame('B', 97)],
    timeRange: getDefaultRelativeTimeRange(),
  } as unknown as PanelProps<SimpleOptions>['data'];
  testProps.onOptionsChange = jest.fn();

  const { container } = render(<WeathermapPanel {...testProps} />);

  expect(container.textContent).toContain('53');
  expect(container.textContent).not.toContain('97');
});

// #225: interaction persistence must not mutate the rendered options object.
// Deep-freeze makes any in-place write throw, and the persisted payload must
// be a new object carrying the change.
test('pan persistence delivers a new object without mutating options (#225)', () => {
  const deepFreeze = (o: unknown): unknown => {
    if (o && typeof o === 'object') {
      Object.values(o as Record<string, unknown>).forEach(deepFreeze);
      Object.freeze(o);
    }
    return o;
  };
  const weathermap = handleVersionedStateUpdates(getData(theme), theme);
  deepFreeze(weathermap);
  const spy = jest.fn();
  const testProps = { ...mPanelProps, options: { weathermap }, onOptionsChange: spy };

  const { container } = render(<WeathermapPanel {...testProps} />);
  fireEvent.mouseDown(container.querySelector('#nw-testing')!);
  fireEvent(
    container.querySelector('#nw-testing')!,
    new MouseMoveEvent({ movementX: 25, movementY: 10, buttons: 4, bubbles: true })
  );
  fireEvent.mouseUp(container.querySelector('#nw-testing')!);

  expect(spy).toHaveBeenCalled();
  const persisted = spy.mock.calls[spy.mock.calls.length - 1][0].weathermap;
  expect(persisted).not.toBe(weathermap);
  expect(persisted.settings.panel.offset).not.toEqual({ x: 0, y: 0 });
  // The frozen original is untouched.
  expect(weathermap.settings.panel.offset).toEqual({ x: 0, y: 0 });
});

// #238: VIA insert/remove must not mutate the rendered options — the helpers
// mutate their argument by design, so the panel must hand them a clone.
// Deep-freezing makes any residual in-place write throw.
test('VIA insert and remove leave the rendered options untouched (#238)', () => {
  const deepFreeze = (o: unknown): unknown => {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.values(o as Record<string, unknown>).forEach(deepFreeze);
      Object.freeze(o);
    }
    return o;
  };
  getSearchSpy = jest.spyOn(locationService, 'getSearch').mockReturnValue(new URLSearchParams('editPanel=1'));
  const weathermap = handleVersionedStateUpdates(getData(theme), theme);
  deepFreeze(weathermap);
  const spy = jest.fn();
  render(<WeathermapPanel {...{ ...mPanelProps, options: { weathermap }, onOptionsChange: spy }} />);

  // Insert a VIA by double-clicking the link.
  fireEvent.doubleClick(screen.getByTestId('link'));

  expect(spy).toHaveBeenCalled();
  const inserted = spy.mock.calls[spy.mock.calls.length - 1][0].weathermap;
  expect(inserted).not.toBe(weathermap);
  expect(inserted.nodes.filter((n: { isConnection?: boolean }) => n.isConnection)).toHaveLength(1);
  // The frozen original never gained the connection node.
  expect(weathermap.nodes.some((n) => n.isConnection)).toBe(false);
});

test('VIA remove leaves the rendered options untouched (#238)', () => {
  const deepFreeze = (o: unknown): unknown => {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.values(o as Record<string, unknown>).forEach(deepFreeze);
      Object.freeze(o);
    }
    return o;
  };
  getSearchSpy = jest.spyOn(locationService, 'getSearch').mockReturnValue(new URLSearchParams('editPanel=1'));
  // Start from a map that already has a VIA (connection node between two links).
  const weathermap = handleVersionedStateUpdates(getConnectedLinkData(theme), theme);
  const viaCount = weathermap.nodes.filter((n) => n.isConnection).length;
  expect(viaCount).toBe(1);
  deepFreeze(weathermap);
  const spy = jest.fn();
  const { container } = render(
    <WeathermapPanel {...{ ...mPanelProps, options: { weathermap }, onOptionsChange: spy }} />
  );

  // Right-click the connection node to remove the VIA. Connection nodes render
  // as small transparent rects; find its group via the drawn node transform.
  const connection = container.querySelector('g[cursor="move"] rect[fill="transparent"]')!.closest('g')!;
  fireEvent.contextMenu(connection);

  expect(spy).toHaveBeenCalled();
  const removed = spy.mock.calls[spy.mock.calls.length - 1][0].weathermap;
  expect(removed).not.toBe(weathermap);
  expect(removed.nodes.filter((n: { isConnection?: boolean }) => n.isConnection)).toHaveLength(0);
  expect(removed.links).toHaveLength(1);
  // The frozen original still holds its VIA — nothing was written in place.
  expect(weathermap.nodes.filter((n) => n.isConnection)).toHaveLength(1);
  expect(weathermap.links).toHaveLength(2);
});
