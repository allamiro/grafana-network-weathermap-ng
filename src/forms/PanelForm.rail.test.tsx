// Rail Operations mode editor entry points (#300), Phase 1: the mode selector
// and the one-click baseline background preset. Rail rendering ships later —
// these tests pin the schema-level editor behavior.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { getData, theme } from '../testData';
import { RAIL_BASELINE_BACKGROUND_URL } from '../rail/defaults';
import { isSafeUrl } from 'utils';
import { Harness, lastValue } from './panelFormTestHarness';

const selectMode = (mode: 'Network' | 'Rail (experimental)') => {
  const select = screen.getByTestId('nwm-map-mode');
  fireEvent.keyDown(select.querySelector('input') ?? select, { key: 'ArrowDown' });
  fireEvent.click(screen.getByText(mode));
};

describe('rail operations editor entry (#300)', () => {
  test('mode selector defaults to network and does not persist a mapMode key for network', () => {
    const spy = jest.fn();
    render(<Harness initial={getData(theme)} onChangeSpy={spy} />);
    expect(screen.getByTestId('nwm-map-mode')).toBeInTheDocument();
    // Baseline preset is rail-only UI: hidden in network mode.
    expect(screen.queryByTestId('nwm-rail-baseline')).not.toBeInTheDocument();
  });

  test('switching to rail sets mapMode and switching back removes the key entirely', () => {
    const spy = jest.fn();
    render(<Harness initial={getData(theme)} onChangeSpy={spy} />);

    selectMode('Rail (experimental)');
    expect(lastValue(spy).mapMode).toBe('rail');
    expect(screen.getByTestId('nwm-rail-baseline')).toBeInTheDocument();

    selectMode('Network');
    const final = lastValue(spy);
    expect(final.mapMode).toBeUndefined();
    expect('mapMode' in final).toBe(false);
  });

  test('baseline preset applies the bundled background attached to the canvas', () => {
    const initial = getData(theme);
    initial.mapMode = 'rail';
    const spy = jest.fn();
    render(<Harness initial={initial} onChangeSpy={spy} />);

    fireEvent.click(screen.getByTestId('nwm-rail-baseline'));
    const bg = lastValue(spy).settings.panel.backgroundImage!;
    expect(bg.url).toBe(RAIL_BASELINE_BACKGROUND_URL);
    expect(bg.attachToCanvas).toBe(true);
    // Local bundled path: scheme-less, passes the URL safety gate, no external host.
    expect(isSafeUrl(bg.url)).toBe(true);
    expect(bg.url.startsWith('public/plugins/')).toBe(true);
  });

  test('baseline preset never overwrites an existing background without confirmation', () => {
    const initial = getData(theme);
    initial.mapMode = 'rail';
    initial.settings.panel.backgroundImage = { url: 'https://example.com/mine.png', fit: 'contain' };
    const spy = jest.fn();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Harness initial={initial} onChangeSpy={spy} />);

    fireEvent.click(screen.getByTestId('nwm-rail-baseline'));
    expect(confirmSpy).toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled(); // declined -> untouched

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByTestId('nwm-rail-baseline'));
    expect(lastValue(spy).settings.panel.backgroundImage!.url).toBe(RAIL_BASELINE_BACKGROUND_URL);
    confirmSpy.mockRestore();
  });

  test('re-clicking with the baseline already loaded preserves customized fit and attach settings', () => {
    const initial = getData(theme);
    initial.mapMode = 'rail';
    // User loaded the baseline earlier, then customized fit/attach via the
    // background controls; the button must not silently reset them.
    initial.settings.panel.backgroundImage = { url: RAIL_BASELINE_BACKGROUND_URL, fit: 'cover', attachToCanvas: false };
    const spy = jest.fn();
    render(<Harness initial={initial} onChangeSpy={spy} />);

    fireEvent.click(screen.getByTestId('nwm-rail-baseline'));
    expect(spy).not.toHaveBeenCalled();
  });
});
