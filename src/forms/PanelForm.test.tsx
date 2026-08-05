// Regression tests for numeric input handling (#200): blank numeric inputs
// report NaN via valueAsNumber, and NaN must never reach the saved options —
// it propagates into the panel viewBox and SVG geometry.
import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { StandardEditorProps } from '@grafana/data';
import { PanelForm } from './PanelForm';
import { Weathermap } from 'types';
import { getData, theme } from '../testData';


// Deep-freeze the value handed to the form: any residual in-place mutation of
// props.value throws immediately (#233). Handlers must clone before writing.
const deepFreeze = <T,>(o: T): T => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.values(o as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};

const Harness = ({ initial, onChangeSpy }: { initial: Weathermap; onChangeSpy: jest.Mock }) => {
  const [wm, setWm] = useState(initial);
  const props = {
    value: deepFreeze(wm),
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

// #306: the view-mode zoom & pan opt-in writes immutably and defaults off.
test('view mode zoom & pan toggle writes the panel setting (#306)', () => {
  const spy = jest.fn();
  render(<Harness initial={getData(theme)} onChangeSpy={spy} />);
  const toggle = screen.getByTestId('nwm-view-zoom-pan');
  expect((toggle as HTMLInputElement).checked).toBe(false);
  fireEvent.click(toggle);
  expect(lastValue(spy).settings.panel.viewZoomPan).toBe(true);
  fireEvent.click(screen.getByTestId('nwm-view-zoom-pan'));
  expect(lastValue(spy).settings.panel.viewZoomPan).toBe(false);
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

// Background image upload (#344). jsdom has a real FileReader, so the whole
// read -> sanitize -> store path runs for real here.
describe('background image upload (#344)', () => {
  const withBackground = () => {
    const initial = getData(theme);
    initial.settings.panel.backgroundImage = { url: '', fit: 'contain' };
    return initial;
  };
  const svgFile = (name = 'rack.svg', bytes = 512) =>
    new File([new Uint8Array(bytes).fill(60)], name, { type: 'image/svg+xml' });

  test('uploading embeds the file as a data URI in the existing url field', async () => {
    const spy = jest.fn();
    render(<Harness initial={withBackground()} onChangeSpy={spy} />);
    const input = screen.getByTestId('bg-image-upload') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [svgFile()] } });
    await screen.findByTestId('bg-image-upload-note');
    const saved = lastValue(spy).settings.panel.backgroundImage!.url;
    expect(saved.startsWith('data:image/svg+xml;base64,')).toBe(true);
    // No schema change: fit and attachToCanvas are untouched.
    expect(lastValue(spy).settings.panel.backgroundImage!.fit).toBe('contain');
  });

  test('a file over the hard cap is refused and nothing is saved', () => {
    const spy = jest.fn();
    render(<Harness initial={withBackground()} onChangeSpy={spy} />);
    const huge = svgFile('huge.png');
    Object.defineProperty(huge, 'size', { value: 5 * 1024 * 1024 });
    fireEvent.change(screen.getByTestId('bg-image-upload'), { target: { files: [huge] } });
    expect(screen.getByTestId('bg-image-upload-note').textContent).toMatch(/too large to embed/i);
    expect(spy).not.toHaveBeenCalled();
  });

  test('a file over the warn threshold embeds but says so', async () => {
    const spy = jest.fn();
    render(<Harness initial={withBackground()} onChangeSpy={spy} />);
    const big = svgFile('big.svg', 2048);
    Object.defineProperty(big, 'size', { value: 2 * 1024 * 1024 });
    fireEvent.change(screen.getByTestId('bg-image-upload'), { target: { files: [big] } });
    await screen.findByTestId('bg-image-upload-note');
    expect(screen.getByTestId('bg-image-upload-note').textContent).toMatch(/slow every save|Large embeds/i);
    expect(lastValue(spy).settings.panel.backgroundImage!.url.startsWith('data:')).toBe(true);
  });

  test('an unsupported type is refused even if the picker is bypassed', async () => {
    const spy = jest.fn();
    render(<Harness initial={withBackground()} onChangeSpy={spy} />);
    const bad = new File(['<script>'], 'evil.html', { type: 'text/html' });
    fireEvent.change(screen.getByTestId('bg-image-upload'), { target: { files: [bad] } });
    await screen.findByTestId('bg-image-upload-note');
    expect(screen.getByTestId('bg-image-upload-note').textContent).toMatch(/not a supported image type/i);
    expect(spy).not.toHaveBeenCalled();
  });

  test('an embedded source shows as read-only summary, not a wall of base64', () => {
    const initial = withBackground();
    initial.settings.panel.backgroundImage!.url = 'data:image/svg+xml;base64,PHN2Zy8+';
    render(<Harness initial={initial} onChangeSpy={jest.fn()} />);
    const field = document.querySelector('input[name="bgImageURL"]') as HTMLInputElement;
    expect(field.value).toMatch(/^Embedded image \(SVG, /);
    expect(field.readOnly).toBe(true);
  });

  test('an embedded source with stray whitespace is still shown as a summary', () => {
    // Imported dashboards can carry wrapped base64; classify the sanitized
    // form so they read the same as a freshly uploaded image.
    const initial = withBackground();
    initial.settings.panel.backgroundImage!.url = 'data:image/svg+xml;base64,PHN2\n Zy8+';
    render(<Harness initial={initial} onChangeSpy={jest.fn()} />);
    const field = document.querySelector('input[name="bgImageURL"]') as HTMLInputElement;
    expect(field.value).toMatch(/^Embedded image \(SVG, /);
    expect(field.readOnly).toBe(true);
  });

  test('removing the background clears a previous upload note', async () => {
    const spy = jest.fn();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Harness initial={withBackground()} onChangeSpy={spy} />);
    fireEvent.change(screen.getByTestId('bg-image-upload'), { target: { files: [svgFile()] } });
    await screen.findByTestId('bg-image-upload-note');
    fireEvent.click(screen.getByTestId('bg-image-remove'));
    expect(screen.queryByTestId('bg-image-upload-note')).toBeNull();
    confirmSpy.mockRestore();
  });

  test('a linked URL stays editable and is shown verbatim', () => {
    const initial = withBackground();
    initial.settings.panel.backgroundImage!.url = 'https://example.com/bg.png';
    render(<Harness initial={initial} onChangeSpy={jest.fn()} />);
    const field = document.querySelector('input[name="bgImageURL"]') as HTMLInputElement;
    expect(field.value).toBe('https://example.com/bg.png');
    expect(field.readOnly).toBe(false);
  });
});
