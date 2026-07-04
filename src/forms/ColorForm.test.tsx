import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { StandardEditorProps } from '@grafana/data';
import { ColorForm } from './ColorForm';
import { Weathermap } from 'types';
import { getData, theme } from '../testData';

// Stateful harness: the editor only re-renders when onChange delivers a new
// options object, which is exactly the behavior under test (#162).
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
  return <ColorForm {...props} />;
};

test('scale mode keeps its selected indicator after changing (#162)', () => {
  const spy = jest.fn();
  const initial = getData(theme);
  render(<Harness initial={initial} onChangeSpy={spy} />);

  expect(screen.getByRole('radio', { name: 'Percentage' })).toBeChecked();

  const absolute = screen.getByRole('radio', { name: 'Absolute Value' });
  fireEvent.click(absolute);

  expect(absolute).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Percentage' })).not.toBeChecked();
  // The editor must receive a new object, not a mutation of the rendered one,
  // or the options pane can skip re-rendering on reference equality.
  expect(spy.mock.calls[0][0]).not.toBe(initial);
  expect(spy.mock.calls[0][0].settings.colorScaleMode).toBe('value');
});

test('scale mode radios have stable, deterministic ids', () => {
  render(<Harness initial={getData(theme)} onChangeSpy={jest.fn()} />);

  expect(screen.getByRole('radio', { name: 'Percentage' })).toHaveAttribute(
    'id',
    'option-percent-nwm-color-scale-mode'
  );
  expect(screen.getByRole('radio', { name: 'Absolute Value' })).toHaveAttribute(
    'id',
    'option-value-nwm-color-scale-mode'
  );
});

test('threshold inputs have explicit unique ids (#167)', () => {
  const initial = getData(theme);
  initial.scale = [
    { percent: 0, color: '#73BF69' },
    { percent: 50, color: '#C4162A' },
  ];
  render(<Harness initial={initial} onChangeSpy={jest.fn()} />);

  // Without explicit ids, Grafana 13's options-pane Field context assigns
  // every bare control the options-item id, producing duplicate ids.
  expect(document.getElementById('nwm-scale-threshold-0')).toBeInTheDocument();
  expect(document.getElementById('nwm-scale-threshold-1')).toBeInTheDocument();
});

// #200: clearing a threshold input and blurring must not save NaN into the
// scale; the previous threshold value is kept instead.
describe('number inputs do not store NaN (#200)', () => {
  test('clearing a threshold keeps the previous percent on blur', () => {
    const initial = getData(theme);
    initial.scale = [
      { percent: 10, color: '#111111' },
      { percent: 50, color: '#222222' },
    ];
    const spy = jest.fn();
    render(<Harness initial={initial} onChangeSpy={spy} />);

    const threshold = screen.getByLabelText('Weathermap Threshold 10');
    fireEvent.change(threshold, { target: { value: '' } });
    fireEvent.blur(threshold);

    const updated: Weathermap = spy.mock.calls[spy.mock.calls.length - 1][0];
    expect(updated.scale.map((s) => s.percent)).toEqual([10, 50]);
    expect(updated.scale.some((s) => Number.isNaN(s.percent))).toBe(false);
  });

  test('0 is a valid threshold value', () => {
    const initial = getData(theme);
    initial.scale = [{ percent: 10, color: '#111111' }];
    const spy = jest.fn();
    render(<Harness initial={initial} onChangeSpy={spy} />);

    const threshold = screen.getByLabelText('Weathermap Threshold 10');
    fireEvent.change(threshold, { target: { value: '0' } });
    fireEvent.blur(threshold);

    const updated: Weathermap = spy.mock.calls[spy.mock.calls.length - 1][0];
    expect(updated.scale[0].percent).toBe(0);
  });
});

// #225: the threshold commit must deliver a new weathermap/scale reference.
test('threshold commit delivers new object references (#225)', () => {
  const initial = getData(theme);
  initial.scale = [{ percent: 10, color: '#111111' }];
  const before = JSON.parse(JSON.stringify(initial));
  const spy = jest.fn();
  render(<Harness initial={initial} onChangeSpy={spy} />);

  const threshold = screen.getByLabelText('Weathermap Threshold 10');
  fireEvent.change(threshold, { target: { value: '35' } });
  fireEvent.blur(threshold);

  const updated: Weathermap = spy.mock.calls[spy.mock.calls.length - 1][0];
  expect(updated).not.toBe(initial);
  expect(updated.scale).not.toBe(initial.scale);
  expect(updated.scale[0].percent).toBe(35);
  expect(initial).toEqual(before);
});
