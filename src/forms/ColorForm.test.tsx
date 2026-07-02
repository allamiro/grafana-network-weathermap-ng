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
