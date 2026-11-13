// The Export editor gets the panel's <svg> from the panel itself (through
// exportSvgRegistry) rather than by searching the global document, which
// Grafana's plugin review does not allow. These tests pin the panel side:
// what it registers, when, and that it cleans up.
import React from 'react';
import { getDefaultRelativeTimeRange, getTimeZone, LoadingState, PanelProps } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { render } from '@testing-library/react';
import { WeathermapPanel } from 'WeathermapPanel';
import { SimpleOptions } from 'types';
import { getData, theme } from 'testData';
import { handleVersionedStateUpdates } from 'utils';
import { getExportSvg, registerExportSvg, unregisterExportSvg } from 'exportSvgRegistry';

let getSearchSpy: jest.SpyInstance | undefined;
afterEach(() => {
  getSearchSpy?.mockRestore();
  getSearchSpy = undefined;
});
const enterEditMode = () => {
  getSearchSpy = jest.spyOn(locationService, 'getSearch').mockReturnValue(new URLSearchParams('editPanel=1'));
};

const panelProps = () => {
  const wm = handleVersionedStateUpdates(getData(theme), theme);
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
    onOptionsChange: jest.fn(),
  } as unknown as PanelProps<SimpleOptions>;
  return { wm, props };
};

describe('panel hands its SVG to the Export editor', () => {
  test('in edit mode it registers the <svg> it rendered, and removes it on unmount', () => {
    enterEditMode();
    const { wm, props } = panelProps();
    const { container, unmount } = render(<WeathermapPanel {...props} />);

    const own = container.querySelector(`svg[id="nw-${wm.id}_"]`);
    expect(own).not.toBeNull();
    // The very element this panel rendered: not a lookup that could land on
    // another panel's map.
    expect(getExportSvg(wm.id)).toBe(own);

    unmount();
    expect(getExportSvg(wm.id)).toBeUndefined();
  });

  test('in view mode it registers nothing', () => {
    const { wm, props } = panelProps();
    render(<WeathermapPanel {...props} />);
    expect(getExportSvg(wm.id)).toBeUndefined();
  });

  test('re-renders keep the entry, and unmounting does not evict an element another panel registered', () => {
    enterEditMode();
    const { wm, props } = panelProps();
    const { rerender, unmount } = render(<WeathermapPanel {...props} />);
    rerender(<WeathermapPanel {...props} renderCounter={2} />);
    expect(getExportSvg(wm.id)).toBeDefined();

    // Another instance with the same map id (a copied panel) registers after.
    const other = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    registerExportSvg(wm.id, other);
    unmount();
    expect(getExportSvg(wm.id)).toBe(other);
    unregisterExportSvg(wm.id, other);
  });
});
