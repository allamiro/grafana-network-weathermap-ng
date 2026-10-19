import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { StandardEditorProps } from '@grafana/data';
import { ColorForm } from './ColorForm';
import { Weathermap } from 'types';
import { getData, theme } from '../testData';
import { deepFreeze } from '../test/deepFreeze';
import { richMap, sweepEditor } from '../test/editorSweep';

// The shared react-inlinesvg mock (.config/jest/mocks) drops every prop but
// src, so the threshold trash <Icon onClick> cannot be clicked in jsdom. Keep
// the handler and mark the icon, so the sweep below drives it like a button.
jest.mock('react-inlinesvg', () => {
  const { createElement } = jest.requireActual('react');
  return {
    __esModule: true,
    default: ({ src, onClick }: { src: string; onClick?: () => void }) =>
      createElement('svg', {
        'data-testid': src.replace(/(.+)\/(.+)\.svg$/, '$2'),
        'data-clickable': onClick ? 'true' : undefined,
        onClick,
      }),
  };
});

// Stateful harness: the editor only re-renders when onChange delivers a new
// options object, which is exactly the behavior under test (#162).
const Harness = ({ initial, onChangeSpy }: { initial: Weathermap; onChangeSpy: jest.Mock }) => {
  const [wm, setWm] = useState(initial);
  const props = {
    // Frozen: any in-place mutation of props.value throws (#233); handlers
    // must deliver new state.
    value: deepFreeze(wm),
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

// #226: a blanked threshold draft must render as an empty field, not a NaN
// value attribute (React logs "Received NaN for the value attribute").
test('clearing a threshold renders an empty field without React NaN warnings (#226)', () => {
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const initial = getData(theme);
  initial.scale = [{ percent: 10, color: '#111111' }];
  render(<Harness initial={initial} onChangeSpy={jest.fn()} />);

  const threshold = screen.getByLabelText('Weathermap Threshold 10') as HTMLInputElement;
  fireEvent.change(threshold, { target: { value: '' } });

  expect(threshold.value).toBe('');
  // The rendered attribute is the reliable check. jsdom sanitizes the value
  // property of a number input to '' either way, and React logs the NaN
  // warning only once per process: after the #200 test above blanks a
  // threshold, this test saw no warning even with the bug back.
  expect(threshold.getAttribute('value')).toBe('');
  const nanWarnings = errorSpy.mock.calls.filter((c) => String(c[0]).includes('Received NaN'));
  errorSpy.mockRestore();
  expect(nanWarnings).toEqual([]);
});

// #233 (d96e5a6): the threshold color handler wrote into the frozen
// props.value, which throws in the harness and never reaches onChange.
test('threshold color change delivers a new weathermap (#233)', async () => {
  const initial = getData(theme);
  initial.scale = [{ percent: 10, color: '#111111' }];
  const spy = jest.fn();
  render(<Harness initial={initial} onChangeSpy={spy} />);

  // The swatch opens Grafana's real ColorPicker popover; pick a named color.
  fireEvent.click(screen.getByRole('button', { name: '#111111 color' }));
  fireEvent.click(await screen.findByRole('button', { name: 'red color' }));

  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy.mock.calls[0][0]).not.toBe(initial);
  expect(spy.mock.calls[0][0].scale[0].color).toBe('#F2495C');
});

// Every control in the form, driven once against a deep-frozen value: none may
// throw, and each onChange must carry a new object that differs from the one
// it replaced (#225, #233). The count is how many controls must deliver a
// change, so a handler that stops calling onChange fails too. See
// src/test/editorSweep.tsx.
describe('every ColorForm control delivers new state without mutating props.value', () => {
  test('percentage mode', async () => {
    const { problems, changed, silent } = await sweepEditor({ Form: ColorForm, initial: richMap });
    expect(problems).toEqual([]);
    // Pinned exactly: a control that stops delivering moves into `silent`, a
    // removed one lowers the count, and a new one has to be classified here.
    expect(silent).toEqual([]);
    expect(changed).toHaveLength(9);
  }, 30000);

  // Absolute value mode adds the scale unit picker.
  test('absolute value mode', async () => {
    const { problems, changed, silent } = await sweepEditor({
      Form: ColorForm,
      initial: () => {
        const wm = richMap();
        wm.settings.colorScaleMode = 'value';
        return wm;
      },
    });
    expect(problems).toEqual([]);
    // Pinned exactly: a control that stops delivering moves into `silent`, a
    // removed one lowers the count, and a new one has to be classified here.
    expect(silent).toEqual([]);
    expect(changed).toHaveLength(10);
  }, 30000);
});
