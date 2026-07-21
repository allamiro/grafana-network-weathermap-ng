// View-mode zoom & pan (#306): opt-in wheel zoom and drag pan while VIEWING
// a dashboard. The viewer's zoom/pan is local browser state — it must never
// be written into the saved panel options — and double-click resets it.
// jsdom runs without ?editPanel, so these tests exercise real view mode.
import React from 'react';
import { getDefaultRelativeTimeRange, getTimeZone, LoadingState, PanelProps } from '@grafana/data';
import { fireEvent, render } from '@testing-library/react';
import { WeathermapPanel } from 'WeathermapPanel';
import { SimpleOptions, Weathermap } from 'types';
import { getData, theme } from 'testData';
import { handleVersionedStateUpdates } from 'utils';

const renderPanel = (mutate?: (wm: Weathermap) => void) => {
  const wm = handleVersionedStateUpdates(getData(theme), theme);
  if (mutate) {
    mutate(wm);
  }
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
  const utils = render(<WeathermapPanel {...props} />);
  const svg = utils.container.querySelector('svg[id^="nw-"]')! as SVGSVGElement;
  return { ...utils, svg, onOptionsChange, savedWidth: wm.settings.panel.panelSize.width };
};

const viewBoxWidth = (svg: SVGSVGElement) => Number(svg.getAttribute('viewBox')!.split(' ')[2]);

describe('view-mode zoom & pan (#306)', () => {
  test('without the opt-in, plain wheel does nothing in view mode (page scroll preserved)', () => {
    const { svg, onOptionsChange, savedWidth } = renderPanel();
    fireEvent.wheel(svg, { deltaY: 100 });
    expect(viewBoxWidth(svg)).toBe(savedWidth);
    expect(onOptionsChange).not.toHaveBeenCalled();
  });

  test('legacy Shift+wheel still zooms via the options path when the opt-in is off', () => {
    const { svg, onOptionsChange } = renderPanel();
    fireEvent.wheel(svg, { deltaY: 100, shiftKey: true });
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange.mock.calls[0][0].weathermap.settings.panel.zoomScale).toBe(1);
  });

  test('with the opt-in, wheel zooms locally and never writes the panel options', () => {
    const { svg, onOptionsChange, savedWidth } = renderPanel((wm) => {
      wm.settings.panel.viewZoomPan = true;
    });
    fireEvent.wheel(svg, { deltaY: 100 }); // zoom out one step
    expect(viewBoxWidth(svg)).toBeCloseTo(savedWidth * 1.2, 6);
    fireEvent.wheel(svg, { deltaY: -100 }); // and back in
    expect(viewBoxWidth(svg)).toBeCloseTo(savedWidth, 6);
    expect(onOptionsChange).not.toHaveBeenCalled();
  });

  test('double-click resets the viewer-local zoom and pan to the saved view', () => {
    const { svg, onOptionsChange, savedWidth } = renderPanel((wm) => {
      wm.settings.panel.viewZoomPan = true;
    });
    fireEvent.wheel(svg, { deltaY: 100 });
    fireEvent.wheel(svg, { deltaY: 100 });
    expect(viewBoxWidth(svg)).toBeCloseTo(savedWidth * 1.44, 6);
    fireEvent.doubleClick(svg);
    expect(viewBoxWidth(svg)).toBeCloseTo(savedWidth, 6);
    expect(onOptionsChange).not.toHaveBeenCalled();
  });

  test('plain left-drag pans in view mode and the pan is never persisted', () => {
    const { svg, container, onOptionsChange } = renderPanel((wm) => {
      wm.settings.panel.viewZoomPan = true;
    });
    const group = container.querySelectorAll('svg[id^="nw-"] > g')[1] as SVGGElement;
    const before = group.getAttribute('transform');

    fireEvent.mouseDown(svg, { buttons: 1 });
    const move = new MouseEvent('mousemove', { bubbles: true, buttons: 1 });
    Object.defineProperty(move, 'movementX', { value: 40 });
    Object.defineProperty(move, 'movementY', { value: 25 });
    svg.dispatchEvent(move);
    fireEvent.mouseUp(svg);

    expect(group.getAttribute('transform')).not.toBe(before);
    expect(onOptionsChange).not.toHaveBeenCalled();
  });

  test('without the opt-in, plain left-drag does not pan (legacy behavior)', () => {
    const { svg, container, onOptionsChange } = renderPanel();
    const group = container.querySelectorAll('svg[id^="nw-"] > g')[1] as SVGGElement;
    const before = group.getAttribute('transform');

    fireEvent.mouseDown(svg, { buttons: 1 });
    const move = new MouseEvent('mousemove', { bubbles: true, buttons: 1 });
    Object.defineProperty(move, 'movementX', { value: 40 });
    Object.defineProperty(move, 'movementY', { value: 25 });
    svg.dispatchEvent(move);

    expect(group.getAttribute('transform')).toBe(before);
    // Legacy mouse-up persists the (unchanged) offset — allowed, unchanged
    // behavior; the assertion above is what matters for the gate.
    fireEvent.mouseUp(svg);
    expect(onOptionsChange).toHaveBeenCalled();
  });
});
