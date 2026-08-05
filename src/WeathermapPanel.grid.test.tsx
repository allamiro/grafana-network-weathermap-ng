// Grid guides are an editing aid (#347): they visualize the grid that node
// dragging snaps to, so they must not paint graph paper over a saved dashboard.
import React from 'react';
import { getDefaultRelativeTimeRange, getTimeZone, LoadingState, PanelProps } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { render } from '@testing-library/react';
import { WeathermapPanel } from 'WeathermapPanel';
import { SimpleOptions, Weathermap } from 'types';
import { getData, theme } from 'testData';
import { handleVersionedStateUpdates } from 'utils';

let getSearchSpy: jest.SpyInstance | undefined;
afterEach(() => {
  getSearchSpy?.mockRestore();
  getSearchSpy = undefined;
});
const enterEditMode = () => {
  getSearchSpy = jest.spyOn(locationService, 'getSearch').mockReturnValue(new URLSearchParams('editPanel=1'));
};

const renderPanel = (mutate?: (wm: Weathermap) => void) => {
  const wm = handleVersionedStateUpdates(getData(theme), theme);
  mutate?.(wm);
  const onOptionsChange = jest.fn();
  const props = {
    id: 1,
    data: { state: LoadingState.Done, series: [], timeRange: getDefaultRelativeTimeRange() },
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
  return { ...render(<WeathermapPanel {...props} />), onOptionsChange };
};

const withGuides = (wm: Weathermap) => {
  wm.settings.panel.grid = { enabled: true, size: 20, guidesEnabled: true };
};
const guideRects = (c: HTMLElement) => c.querySelectorAll('rect[fill="url(#smallGrid)"]').length;

describe('grid guides (#347)', () => {
  test('are drawn in edit mode', () => {
    enterEditMode();
    expect(guideRects(renderPanel(withGuides).container)).toBeGreaterThan(0);
  });

  test('are NOT drawn in view mode, even when enabled', () => {
    expect(guideRects(renderPanel(withGuides).container)).toBe(0);
  });

  test('stay off in edit mode when the option is off', () => {
    enterEditMode();
    const { container } = renderPanel((wm) => {
      wm.settings.panel.grid = { enabled: true, size: 20, guidesEnabled: false };
    });
    expect(guideRects(container)).toBe(0);
  });

  test('snapping is untouched — the option still round-trips through migration', () => {
    // Only the DRAWING changed; the persisted settings are unaffected, so a
    // saved dashboard keeps whatever it had.
    const raw = getData(theme);
    raw.settings.panel.grid = { enabled: true, size: 25, guidesEnabled: true };
    const wm = handleVersionedStateUpdates(raw, theme);
    expect(wm.settings.panel.grid).toEqual({ enabled: true, size: 25, guidesEnabled: true });
  });

  test('rendering never writes the option back', () => {
    enterEditMode();
    const { onOptionsChange } = renderPanel(withGuides);
    expect(onOptionsChange).not.toHaveBeenCalled();
  });
});
