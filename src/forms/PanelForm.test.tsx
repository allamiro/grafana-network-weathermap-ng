// Regression tests for numeric input handling (#200): blank numeric inputs
// report NaN via valueAsNumber, and NaN must never reach the saved options —
// it propagates into the panel viewBox and SVG geometry.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { getData, theme } from '../testData';
import { Harness, lastValue } from './panelFormTestHarness';

const containsNaN = (o: unknown): boolean => {
  if (typeof o === 'number') {
    return Number.isNaN(o);
  }
  if (Array.isArray(o)) {
    return o.some(containsNaN);
  }
  if (o && typeof o === 'object') {
    return Object.values(o).some(containsNaN);
  }
  return false;
};

describe('number inputs do not store NaN (#200)', () => {
  test('clearing the viewbox width keeps the previous value', () => {
    const initial = getData(theme);
    const startWidth = initial.settings.panel.panelSize.width;
    const spy = jest.fn();
    const { container } = render(<Harness initial={initial} onChangeSpy={spy} />);

    const width = container.querySelector('input[name="panelWidth"]')!;
    fireEvent.change(width, { target: { value: '' } });

    expect(lastValue(spy).settings.panel.panelSize.width).toBe(startWidth);
    expect(Number.isNaN(lastValue(spy).settings.panel.panelSize.width)).toBe(false);
  });

  test('0 is stored as a valid value and typing resumes after a blank', () => {
    const spy = jest.fn();
    const { container } = render(<Harness initial={getData(theme)} onChangeSpy={spy} />);

    const width = container.querySelector('input[name="panelWidth"]')!;
    fireEvent.change(width, { target: { value: '0' } });
    expect(lastValue(spy).settings.panel.panelSize.width).toBe(0);

    fireEvent.change(width, { target: { value: '' } });
    fireEvent.change(width, { target: { value: '800' } });
    expect(lastValue(spy).settings.panel.panelSize.width).toBe(800);
  });

  test('zoom scale and offsets never store NaN when cleared', () => {
    const initial = getData(theme);
    const before = {
      zoom: initial.settings.panel.zoomScale,
      x: initial.settings.panel.offset.x,
      y: initial.settings.panel.offset.y,
    };
    const spy = jest.fn();
    const { container } = render(<Harness initial={initial} onChangeSpy={spy} />);

    // The zoom/offset inputs carry no name attribute, so clear every number
    // input in the form — any unguarded handler then surfaces NaN in the
    // containsNaN sweep below.
    const numberInputs = Array.from(container.querySelectorAll('input[type="number"]'));
    for (const input of numberInputs) {
      fireEvent.change(input, { target: { value: '' } });
    }

    const updated = lastValue(spy);
    expect(updated.settings.panel.zoomScale).toBe(before.zoom);
    expect(updated.settings.panel.offset.x).toBe(before.x);
    expect(updated.settings.panel.offset.y).toBe(before.y);
    expect(containsNaN(updated)).toBe(false);
  });
});

// #225: panel-settings updates must deliver new object references.
test('viewbox width change delivers a new weathermap object (#225)', () => {
  const initial = getData(theme);
  const before = JSON.parse(JSON.stringify(initial));
  const spy = jest.fn();
  const { container } = render(<Harness initial={initial} onChangeSpy={spy} />);

  fireEvent.change(container.querySelector('input[name="panelWidth"]')!, { target: { value: '850' } });

  const updated = lastValue(spy);
  expect(updated).not.toBe(initial);
  expect(updated.settings.panel).not.toBe(initial.settings.panel);
  expect(updated.settings.panel.panelSize.width).toBe(850);
  expect(initial).toEqual(before);
});

// #278: the scale legibility overrides render, write immutably, and clear
// back to the automatic behavior.
test('scale font color and background controls appear and clear (#278)', async () => {
  const spy = jest.fn();
  const initial = getData(theme);
  render(<Harness initial={initial} onChangeSpy={spy} />);

  expect(screen.getByText(/Scale Font Color/)).not.toBeNull();
  expect(screen.getByText(/Scale Background/)).not.toBeNull();
  // No override set: the clear buttons are absent (auto behavior active).
  expect(screen.queryByRole('button', { name: 'Auto' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'None' })).toBeNull();
});

test('clearing a configured scale font color restores auto contrast (#278)', async () => {
  const spy = jest.fn();
  const initial = getData(theme);
  initial.settings.scale.fontColor = '#ff00cc';
  initial.settings.scale.backgroundColor = '#181b1f';
  render(<Harness initial={initial} onChangeSpy={spy} />);

  fireEvent.click(screen.getByRole('button', { name: 'Auto' }));
  expect(lastValue(spy).settings.scale.fontColor).toBeUndefined();
  // The background override is untouched by the font clear.
  expect(lastValue(spy).settings.scale.backgroundColor).toBe('#181b1f');

  fireEvent.click(screen.getByRole('button', { name: 'None' }));
  expect(lastValue(spy).settings.scale.backgroundColor).toBeUndefined();
});
