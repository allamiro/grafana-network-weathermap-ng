// Background image sources (#344): linked URLs, embedded data: URIs, the
// edit-mode failure notice, and the hostile-input boundary.
import React from 'react';
import { getDefaultRelativeTimeRange, getTimeZone, LoadingState, PanelProps } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { act, render, screen, waitFor } from '@testing-library/react';
import { WeathermapPanel } from 'WeathermapPanel';
import { SimpleOptions, Weathermap } from 'types';
import { getData, theme } from 'testData';
import { handleVersionedStateUpdates } from 'utils';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const SVG_URI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=';

const renderPanel = (mutate?: (wm: Weathermap) => void) => {
  const wm = handleVersionedStateUpdates(getData(theme), theme);
  mutate?.(wm);
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
  return render(<WeathermapPanel {...props} />);
};

const withBackground = (url: string, attachToCanvas: boolean) => (wm: Weathermap) => {
  wm.settings.panel.backgroundImage = { url, fit: 'contain', attachToCanvas };
};

describe('background image sources (#344)', () => {
  test('an embedded data URI renders on the canvas path', () => {
    const { container } = renderPanel(withBackground(SVG_URI, true));
    const image = container.querySelector('svg image');
    expect(image).not.toBeNull();
    expect(image!.getAttribute('href')).toBe(SVG_URI);
  });

  test('an embedded data URI renders on the CSS (fixed) path', () => {
    const { container } = renderPanel(withBackground(PNG, false));
    expect(container.innerHTML).toContain(`url(${PNG})`);
  });

  test('a linked URL still works on both paths, unchanged', () => {
    const url = 'https://example.com/rack.svg';
    const canvas = renderPanel(withBackground(url, true));
    expect(canvas.container.querySelector('svg image')!.getAttribute('href')).toBe(url);
    const fixed = renderPanel(withBackground(url, false));
    expect(fixed.container.innerHTML).toContain(`url(${url})`);
  });

  test.each([
    ['a script data URI', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a non-base64 svg payload', 'data:image/svg+xml,<svg onload=alert(1)>'],
    ['an unsupported image type', 'data:image/tiff;base64,AAAA'],
  ])('%s is refused at render time, not just in the editor', (_name, hostile) => {
    // Defense in depth: a hand-edited dashboard never reaches the DOM with it.
    const canvas = renderPanel(withBackground(hostile, true));
    expect(canvas.container.querySelector('svg image')).toBeNull();
    const fixed = renderPanel(withBackground(hostile, false));
    expect(fixed.container.innerHTML).not.toContain('alert(1)');
    expect(fixed.container.innerHTML).not.toContain('data:text/html');
  });

  test('no background configured renders no image element', () => {
    const { container } = renderPanel();
    expect(container.querySelector('svg image')).toBeNull();
  });
});

describe('background image failure notice (#344)', () => {
  let spy: jest.SpyInstance | undefined;
  afterEach(() => {
    spy?.mockRestore();
    spy = undefined;
  });
  const enterEditMode = () => {
    spy = jest.spyOn(locationService, 'getSearch').mockReturnValue(new URLSearchParams('editPanel=1'));
  };

  test('a source the sanitizer refuses is reported in edit mode', async () => {
    enterEditMode();
    renderPanel(withBackground('data:text/html;base64,PHNjcmlwdD4=', true));
    await waitFor(() => expect(screen.getByTestId('weathermap-data-notice')).toBeTruthy());
    expect(screen.getByTestId('weathermap-data-notice').textContent).toMatch(/rejected/i);
  });

  // Absence is asserted after the effects have actually been flushed, not
  // after an arbitrary sleep: a fixed delay neither proves the effect ran nor
  // catches a notice that appears later, and goes flaky on a slow machine.
  const settle = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  test('the same bad source is silent in VIEW mode', async () => {
    renderPanel(withBackground('data:text/html;base64,PHNjcmlwdD4=', true));
    await settle();
    expect(screen.queryByTestId('weathermap-data-notice')).toBeNull();
  });

  test('a valid source produces no notice', async () => {
    enterEditMode();
    renderPanel(withBackground(SVG_URI, true));
    await settle();
    expect(screen.queryByTestId('weathermap-data-notice')).toBeNull();
  });

  test('no background configured produces no notice', async () => {
    enterEditMode();
    renderPanel();
    await settle();
    expect(screen.queryByTestId('weathermap-data-notice')).toBeNull();
  });

  test('a failure found in edit mode does not leak into view mode', async () => {
    // The probe state survives a mode switch until its effect re-runs, so the
    // notice is gated on isEditMode at render too.
    enterEditMode();
    const bad = 'data:text/html;base64,PHNjcmlwdD4=';
    const first = renderPanel(withBackground(bad, true));
    await waitFor(() => expect(screen.getByTestId('weathermap-data-notice')).toBeTruthy());
    // Unmount before re-rendering: RTL keeps every render in the document, so
    // without this the assertion below would find the FIRST render's banner.
    first.unmount();
    spy?.mockRestore();
    spy = undefined;
    renderPanel(withBackground(bad, true));
    await settle();
    expect(screen.queryByTestId('weathermap-data-notice')).toBeNull();
  });
});
