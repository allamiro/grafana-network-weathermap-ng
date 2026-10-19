// Hostile-data render matrix: shapes that have crashed the panel in the wild
// (#178 was one instance) or can appear via hand-edited/provisioned
// dashboards. The panel must render — degraded, never thrown.
import React from 'react';
import { getDefaultRelativeTimeRange, getTimeZone, LoadingState, PanelProps, toDataFrame } from '@grafana/data';
import { fireEvent, render, screen } from '@testing-library/react';
import { WeathermapPanel } from 'WeathermapPanel';
import { Anchor, SimpleOptions, Weathermap } from 'types';
import { getData, getData2, theme } from 'testData';
import { handleVersionedStateUpdates } from 'utils';

const renderPanel = (
  series: unknown[],
  mutate?: (wm: Weathermap) => void,
  onOptionsChange: (o: unknown) => void = () => {}
) => {
  const wm = getData(theme);
  wm.links[0].sides.A.query = 'A QUERY';
  wm.links[0].sides.Z.query = 'Z QUERY';
  wm.nodes.forEach((n) => (n.statusQuery = 'STATUS X'));
  if (mutate) {
    mutate(wm);
  }
  const props = {
    id: 1,
    data: { state: LoadingState.Done, series, timeRange: getDefaultRelativeTimeRange() },
    timeRange: getDefaultRelativeTimeRange(),
    timeZone: getTimeZone(),
    options: { weathermap: wm },
    transparent: false,
    width: 600,
    height: 400,
    fieldConfig: {},
    renderCounter: 1,
    title: 'T',
    eventBus: {},
    onOptionsChange,
  } as unknown as PanelProps<SimpleOptions>;
  render(<WeathermapPanel {...props} />);
};

const expectRendered = () => expect(screen.getAllByTestId('link').length).toBeGreaterThan(0);

const goodFrame = (name: string, values: number[] = [1, 2, 3]) =>
  toDataFrame({
    refId: 'A',
    fields: [
      { name: 'Time', values: values.map((_, i) => i * 1000) },
      { name: 'Value', values, config: { displayNameFromDS: name } },
    ],
  });

test('frame with a time field but no value field', () => {
  renderPanel([toDataFrame({ fields: [{ name: 'Time', values: [1, 2, 3] }] })]);
  expectRendered();
});

test('frame with all-NaN values', () => {
  renderPanel([goodFrame('A QUERY', [NaN, NaN, NaN] as unknown as number[])]);
  expectRendered();
});

test('frames with duplicate display names', () => {
  renderPanel([goodFrame('A QUERY'), goodFrame('A QUERY'), goodFrame('Z QUERY')]);
  expectRendered();
});

test('value field without a time field', () => {
  renderPanel([
    toDataFrame({
      refId: 'A',
      fields: [{ name: 'Value', values: [5, 6], config: { displayNameFromDS: 'A QUERY' } }],
    }),
  ]);
  expectRendered();
});

test('link whose queries match no frame', () => {
  renderPanel([goodFrame('SOMETHING ELSE ENTIRELY')]);
  expectRendered();
});

test('zero and negative panel-ish values', () => {
  renderPanel([goodFrame('A QUERY', [0, -100, 0])]);
  expectRendered();
});

test('node icon pointing at a nonexistent bundled icon still renders', () => {
  renderPanel([goodFrame('A QUERY')], (wm) => {
    wm.nodes[0].nodeIcon = {
      src: 'public/plugins/tamirsuliman-weathermap-panel/icons/networking/does-not-exist.svg',
      name: 'networking/does-not-exist',
      size: { width: 40, height: 40 },
      padding: { vertical: 0, horizontal: 0 },
      drawInside: false,
    };
  });
  expectRendered();
});

test('scale with a single threshold and out-of-range utilization', () => {
  renderPanel([goodFrame('A QUERY', [10_000_000_000])], (wm) => {
    wm.scale = [{ percent: 0, color: '#00ff00' }];
    wm.links[0].sides.A.bandwidth = 1; // utilization far above 100%
  });
  expectRendered();
});

test('connection node with fewer than two links (corrupt VIA) does not crash', () => {
  renderPanel([goodFrame('A QUERY')], (wm) => {
    wm.nodes.push({
      ...JSON.parse(JSON.stringify(wm.nodes[0])),
      id: 'dangling-via',
      label: 'C0',
      isConnection: true,
    });
  });
  expectRendered();
});

describe('malformed links and geometry (#198)', () => {
  test('skips links with missing endpoint nodes but renders valid links', () => {
    renderPanel([goodFrame('A QUERY')], (wm) => {
      const ghost = { ...JSON.parse(JSON.stringify(wm.nodes[0])), id: 'ghost-node' };
      const mkLink = (a: unknown, z: unknown, id: string) => ({
        ...JSON.parse(JSON.stringify(wm.links[0])),
        id,
        nodes: [a, z],
      });
      // Malformed links FIRST, proving they are skipped rather than aborting
      // processing before the valid link is reached.
      wm.links.unshift(mkLink(ghost, wm.nodes[1], 'missing-source'));
      wm.links.unshift(mkLink(wm.nodes[0], ghost, 'missing-target'));
      wm.links.unshift(mkLink(ghost, ghost, 'missing-both'));
    });
    // Only the one valid link renders; the three malformed ones are skipped.
    expect(screen.getAllByTestId('link')).toHaveLength(1);
  });

  // A hand-edited or partially provisioned link can lack endpoints entirely,
  // not just point at a deleted node (#392). Each shape is tested on its own
  // so one crash cannot hide another.
  test.each([
    ['no nodes array', (l: Record<string, unknown>) => delete l.nodes],
    ['empty nodes array', (l: Record<string, unknown>) => (l.nodes = [])],
    ['only one endpoint', (l: Record<string, unknown>) => (l.nodes = (l.nodes as unknown[]).slice(0, 1))],
    ['a null endpoint', (l: Record<string, unknown>) => (l.nodes = [(l.nodes as unknown[])[0], null])],
  ])('skips a link with %s and renders the valid one', (_shape, breakLink) => {
    renderPanel([goodFrame('A QUERY')], (wm) => {
      const partial = { ...JSON.parse(JSON.stringify(wm.links[0])), id: 'partial' };
      breakLink(partial);
      wm.links.unshift(partial);
    });
    expect(screen.getAllByTestId('link')).toHaveLength(1);
  });

  test('a link missing a side is repaired by migration and drawn (control)', () => {
    // needsMigration checks every renderer-required leaf (#232), so a missing
    // side is filled in rather than skipped; this passed before #392 too.
    renderPanel([goodFrame('A QUERY')], (wm) => {
      const partial = { ...JSON.parse(JSON.stringify(wm.links[0])), id: 'no-z-side' };
      delete partial.sides.Z;
      wm.links.unshift(partial);
    });
    expect(screen.getAllByTestId('link')).toHaveLength(2);
  });

  test('overlapping nodes do not emit NaN geometry', () => {
    renderPanel([goodFrame('A QUERY')], (wm) => {
      wm.nodes[1].position = [...wm.nodes[0].position] as [number, number];
    });
    expect(screen.getAllByTestId('link').length).toBeGreaterThan(0);
    expect(document.body.innerHTML).not.toContain('NaN');
  });

  // #198 (dc59251): with both link ends anchored at Center on overlapping
  // nodes, the arrow's direction vector has length 0. Without the guard,
  // normalising divides 0/0 and both arrow polygons get NaN points. The
  // default Right/Left anchors keep the ends apart, so Center is what makes
  // the length exactly 0.
  test('a zero-length link does not emit NaN arrow polygons', () => {
    renderPanel([], (wm) => {
      wm.nodes[1].position = [...wm.nodes[0].position] as [number, number];
      wm.links[0].sides.A.anchor = Anchor.Center;
      wm.links[0].sides.Z.anchor = Anchor.Center;
    });
    const polygons = document.querySelectorAll('polygon');
    expect(polygons).toHaveLength(2);
    polygons.forEach((p) => expect(p.getAttribute('points')).not.toContain('NaN'));
  });

  // #339: every one of these came from a real failure mode. `null` and a
  // missing key threw and took down the WHOLE panel; the rest rendered NaN
  // into link points, arrow polygons and gradient axes with no error shown.
  describe.each([
    ['a NaN coordinate', [NaN, 300]],
    ['an Infinity coordinate', [Infinity, 300]],
    ['a short array', [200]],
    ['an empty array', []],
    ['a null position', null],
    ['a missing position', undefined],
    ['a non-array position', {}],
    ['numeric strings', ['200', '300']],
  ])('node with %s (#339)', (_name, position) => {
    const withPosition = (wm: Weathermap) => {
      (wm.nodes[1] as unknown as { position: unknown }).position = position;
    };

    test('renders without throwing, and emits no NaN geometry', () => {
      expect(() => renderPanel([goodFrame('A QUERY')], withPosition)).not.toThrow();
      expect(screen.getAllByTestId('link').length).toBeGreaterThan(0);
      expect(document.body.innerHTML).not.toContain('NaN');
    });

    test('still renders with gradient coloring and grid guides on', () => {
      // These read node positions by paths separate from the link geometry —
      // and the grid-guide rect specifically reads nodes[0], so the malformed
      // value has to go there as well or that path is never actually stressed.
      expect(() =>
        renderPanel([goodFrame('A QUERY')], (wm) => {
          withPosition(wm);
          (wm.nodes[0] as unknown as { position: unknown }).position = position;
          wm.settings.link.gradientColor = true;
          wm.settings.panel.grid.guidesEnabled = true;
        })
      ).not.toThrow();
      expect(document.body.innerHTML).not.toContain('NaN');
    });
  });

  test('a malformed position is never repaired in the saved options', () => {
    // The coercion is render-only: options.weathermap is user data, and a bad
    // coordinate must not be silently overwritten with a guess. This fixture
    // is pre-migration, so the version migration does persist once — what
    // matters is that the position it writes is still the user's original.
    const onOptionsChange = jest.fn();
    renderPanel(
      [goodFrame('A QUERY')],
      (wm) => {
        (wm.nodes[1] as unknown as { position: unknown }).position = null;
      },
      onOptionsChange
    );
    for (const [saved] of onOptionsChange.mock.calls) {
      expect((saved as { weathermap: Weathermap }).weathermap.nodes[1].position).toBeNull();
    }
  });
});

// #133 review (d8a582d): dashboard links and icon srcs are user data (and may
// come from template-variable substitution), so unsafe schemes must be dropped
// at the point of use. The fixtures set them directly in saved options, which
// is how a hand-edited or provisioned dashboard would deliver them.
describe('unsafe URLs never reach the browser (#133)', () => {
  let openSpy: jest.SpyInstance;
  beforeEach(() => {
    openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
  });
  afterEach(() => {
    openSpy.mockRestore();
  });

  // View mode: no editPanel in the URL, so a click opens the dashboard link.
  test('a javascript: node dashboard link is never passed to window.open', () => {
    renderPanel([goodFrame('A QUERY')], (wm) => {
      wm.nodes[0].dashboardLink = 'javascript:alert(1)';
    });
    fireEvent.click(screen.getByText('Node A').closest('g')!);
    expect(openSpy).not.toHaveBeenCalled();
  });

  test('a safe node dashboard link opens in a new tab (control)', () => {
    renderPanel([goodFrame('A QUERY')], (wm) => {
      wm.nodes[0].dashboardLink = '/d/abc';
    });
    fireEvent.click(screen.getByText('Node A').closest('g')!);
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith('/d/abc', '_blank', 'noopener,noreferrer');
  });

  // Link clicks go through the same openDashboardLink; firstChild is the
  // A-side polyline.
  test('a javascript: link dashboard link is never passed to window.open', () => {
    renderPanel([goodFrame('A QUERY')], (wm) => {
      wm.links[0].sides.A.dashboardLink = 'javascript:alert(1)';
    });
    fireEvent.click(screen.getAllByTestId('link')[0].firstChild!);
    expect(openSpy).not.toHaveBeenCalled();
  });

  test('a safe link dashboard link opens in a new tab (control)', () => {
    renderPanel([goodFrame('A QUERY')], (wm) => {
      wm.links[0].sides.A.dashboardLink = '/d/abc';
    });
    fireEvent.click(screen.getAllByTestId('link')[0].firstChild!);
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith('/d/abc', '_blank', 'noopener,noreferrer');
  });

  const iconWithSrc = (src: string) => (wm: Weathermap) => {
    wm.nodes[0].nodeIcon = {
      src,
      name: 'custom_icon',
      size: { width: 40, height: 40 },
      padding: { vertical: 0, horizontal: 0 },
      drawInside: false,
    };
  };

  // No background image is configured, so any <image> must be a node icon.
  test('a javascript: node icon src renders no image', () => {
    renderPanel([goodFrame('A QUERY')], iconWithSrc('javascript:alert(1)'));
    expectRendered();
    expect(document.querySelector('image[href^="javascript:"]')).toBeNull();
    expect(document.querySelectorAll('image')).toHaveLength(0);
  });

  test('a bundled node icon src renders its image (control)', () => {
    const src = 'public/plugins/tamirsuliman-weathermap-panel/icons/x.svg';
    renderPanel([goodFrame('A QUERY')], iconWithSrc(src));
    const images = document.querySelectorAll('image');
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('href')).toBe(src);
  });
});

// #392 on a current-version map: migration does not repair partial links there
// (needsMigration is false), so the panel itself must cope.
describe('partial saved links on a current-version map (#392)', () => {
  const renderCurrent = (mutate: (wm: Weathermap) => void, build = getData) => {
    const wm = handleVersionedStateUpdates(build(theme), theme);
    mutate(wm);
    const props = {
      id: 1,
      data: { state: LoadingState.Done, series: [goodFrame('A QUERY')], timeRange: getDefaultRelativeTimeRange() },
      timeRange: getDefaultRelativeTimeRange(),
      timeZone: getTimeZone(),
      options: { weathermap: wm },
      width: 600,
      height: 400,
      onOptionsChange: () => {},
    } as unknown as PanelProps<SimpleOptions>;
    return { wm, props, ...render(<WeathermapPanel {...props} />) };
  };
  const partialOf = (wm: Weathermap, id: string, breakLink: (l: Record<string, any>) => void) => {
    const l = { ...JSON.parse(JSON.stringify(wm.links[0])), id };
    breakLink(l);
    return l as Weathermap['links'][number];
  };

  test.each([
    ['no Z side', (l: Record<string, any>) => delete l.sides.Z],
    ['an empty Z side', (l: Record<string, any>) => (l.sides.Z = {})],
    ['an out-of-range anchor', (l: Record<string, any>) => (l.sides.A.anchor = 99)],
    ['no nodes array', (l: Record<string, any>) => delete l.nodes],
  ])('skips a link with %s and draws the valid one', (_shape, breakLink) => {
    renderCurrent((wm) => wm.links.unshift(partialOf(wm, 'partial', breakLink)));
    expect(screen.getAllByTestId('link')).toHaveLength(1);
  });

  test('hover highlighting ignores partial links instead of crashing', () => {
    renderCurrent((wm) => {
      wm.settings.link.hoverHighlight = true;
      wm.links.push(partialOf(wm, 'no-nodes', (l) => delete l.nodes));
    });
    fireEvent.mouseMove(screen.getAllByTestId('link')[0].firstChild!, { clientX: 100, clientY: 150 });
    expect(screen.getByText(/^Usage - /)).toBeInTheDocument();
  });

  test('an undrawable first link does not shift the valid links', () => {
    // Two valid A->B links share both anchors, so their positions depend on
    // the per-anchor fill counters. The panel builds the drawn links twice per
    // render (initial state and the data effect); if the counter reset is
    // skipped because the first saved link cannot be drawn, the second pass
    // starts from the first pass's counts and every valid link shifts.
    const sharedAnchors = (wm: Weathermap) => {
      wm.nodes[0].anchors[Anchor.Right].numLinks = 2;
      wm.nodes[1].anchors[Anchor.Left].numLinks = 2;
    };
    const points = () => screen.getAllByTestId('link').map((g) => g.querySelector('polyline')?.getAttribute('points'));

    const clean = renderCurrent(sharedAnchors, getData2);
    const expected = points();
    expect(expected).toHaveLength(2);
    clean.unmount();

    const { props, rerender } = renderCurrent((wm) => {
      sharedAnchors(wm);
      wm.links.unshift(partialOf(wm, 'no-nodes', (l) => delete l.nodes));
    }, getData2);
    expect(points()).toEqual(expected);
    rerender(<WeathermapPanel {...props} width={601} />);
    expect(points()).toEqual(expected);
  });

  test('a partial link does not change node sizing', () => {
    const sizeOfNodeA = () => {
      const rect = screen.getByText('Node A').closest('g')!.querySelector('rect')!;
      return [rect.getAttribute('width'), rect.getAttribute('height')];
    };
    const baseline = renderCurrent(() => {});
    const expected = sizeOfNodeA();
    baseline.unmount();
    // A thick partial link on Node A's Top and Right anchors (one endpoint).
    renderCurrent((wm) =>
      wm.links.push(
        partialOf(wm, 'thick-partial', (l) => {
          l.nodes = [l.nodes[0]];
          l.stroke = 80;
          l.sides.A.anchor = Anchor.Top;
        })
      )
    );
    expect(sizeOfNodeA()).toEqual(expected);
  });
});
