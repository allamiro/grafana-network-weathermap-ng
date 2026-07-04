// Regression tests for numeric input handling (#200): blank numeric inputs
// report NaN via valueAsNumber, and NaN must never reach the saved options —
// it propagates into the panel viewBox and SVG geometry.
import React, { useState } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { StandardEditorProps } from '@grafana/data';
import { PanelForm } from './PanelForm';
import { Weathermap } from 'types';
import { getData, theme } from '../testData';

const Harness = ({ initial, onChangeSpy }: { initial: Weathermap; onChangeSpy: jest.Mock }) => {
  const [wm, setWm] = useState(initial);
  const props = {
    value: wm,
    onChange: (v: Weathermap) => {
      onChangeSpy(v);
      setWm(v);
    },
    context: { data: [] },
    item: { settings: { placeholder: '' } },
  } as unknown as StandardEditorProps<Weathermap, { placeholder: string }>;
  return <PanelForm {...props} />;
};

const lastValue = (spy: jest.Mock): Weathermap => spy.mock.calls[spy.mock.calls.length - 1][0];

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
