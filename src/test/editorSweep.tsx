// Editor sweep: proves every control a form renders delivers NEW state through
// onChange and never writes into props.value (#225, #233). The harness
// deep-freezes the value it hands the form, so an in-place write throws (our
// modules are strict mode).
//
// Rather than list the controls (there are well over a hundred, and new ones
// keep arriving), the sweep finds every control a form renders and drives
// each one once: buttons, switches, radios, text/number inputs (including the
// box next to each slider), selects, unit pickers and color pickers. Every
// onChange it causes must
//   (a) not throw,
//   (b) carry a new top-level object, and
//   (c) differ from the value it replaced.
// A few controls only change local state (the node and link pickers, section
// headers, the icon aspect-ratio lock) and deliver nothing, so callers also
// assert how many controls must deliver a change. A handler that stops
// calling onChange, or a fixture that stops showing a section, then fails.
//
// Icons: the shared react-inlinesvg mock drops onClick, so an <Icon onClick>
// is only swept when the test file mocks react-inlinesvg to keep the handler
// and mark the <svg data-clickable> (see ColorForm.test.tsx).
//
// Not swept: the background file input, which goes through FileReader; the
// upload tests in PanelForm.test.tsx cover it with a frozen harness.
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StandardEditorProps, toDataFrame } from '@grafana/data';
import { Weathermap } from 'types';
import { generateBasicLink, handleVersionedStateUpdates } from 'utils';
import { getData, theme } from '../testData';
import { deepFreeze } from './deepFreeze';

type EditorProps = StandardEditorProps<Weathermap, { placeholder: string }>;
type Delivery = { prev: Weathermap; next: Weathermap };

// Two series for the query selects to choose between.
const frames = [
  toDataFrame({
    refId: 'A',
    fields: [
      { name: 'Time', values: [1, 2] },
      { name: 'Value', values: [10, 20], config: { displayNameFromDS: 'series-a' } },
    ],
  }),
  toDataFrame({
    refId: 'B',
    fields: [
      { name: 'Time', values: [1, 2] },
      { name: 'Value', values: [30, 40], config: { displayNameFromDS: 'series-b' } },
    ],
  }),
];

const Harness = ({
  Form,
  initial,
  deliveries,
}: {
  Form: React.ComponentType<EditorProps>;
  initial: Weathermap;
  deliveries: Delivery[];
}) => {
  const [wm, setWm] = useState(initial);
  const value = deepFreeze(wm);
  const props = {
    value,
    onChange: (next: Weathermap) => {
      deliveries.push({ prev: value, next });
      setWm(next);
    },
    context: { data: frames },
    item: { settings: { placeholder: '' } },
  } as unknown as EditorProps;
  return <Form {...props} />;
};

type Kind = 'button' | 'color' | 'toggle' | 'radio' | 'text' | 'select' | 'unit';
type Control = { kind: Kind; el: HTMLElement; name: string };

// Grafana's InlineField does not link its label to an InlineSwitch (the
// switch generates its own id, e.g. "switch-93"), so el.labels is empty. For
// such controls only, look up to six levels for the field's direct <label>
// child, so they get a stable, readable name rather than a generated id.
const fieldLabel = (el: HTMLElement): string | undefined => {
  let p = el.parentElement;
  for (let depth = 0; p && depth < 6; depth++, p = p.parentElement) {
    const text = Array.from(p.children)
      .find((c) => c.tagName === 'LABEL' && c.textContent?.trim())
      ?.textContent?.trim();
    if (text) {
      return text;
    }
  }
  return undefined;
};

const generatedId = (id: string) => id === '' || /^switch-\d+$/.test(id);

const describeEl = (el: HTMLElement): string =>
  el.getAttribute('aria-label') ||
  el.getAttribute('placeholder') ||
  el.getAttribute('name') ||
  (generatedId(el.id) ? undefined : el.id) ||
  el.textContent?.trim() ||
  fieldLabel(el) ||
  el.id ||
  el.tagName;

// Every interactive control in render order. The order is stable across
// renders with the same setup, so index k names the same control each time.
const findControls = (root: HTMLElement): Control[] => {
  const controls: Control[] = [];
  root.querySelectorAll<HTMLElement>('button, input, svg[data-clickable]').forEach((el) => {
    const name = describeEl(el);
    if (el.tagName.toLowerCase() === 'svg') {
      controls.push({ kind: 'button', el, name: `icon ${el.dataset.testid}` });
      return;
    }
    if (el.tagName === 'BUTTON') {
      // ColorPicker swatches are buttons labelled "<color> color".
      controls.push({ kind: / color$/.test(el.getAttribute('aria-label') ?? '') ? 'color' : 'button', el, name });
      return;
    }
    const input = el as HTMLInputElement;
    if (input.type === 'file' || input.type === 'hidden' || input.disabled || input.readOnly) {
      return;
    }
    if (input.type === 'checkbox') {
      controls.push({ kind: 'toggle', el, name });
    } else if (input.type === 'radio') {
      if (!input.checked) {
        controls.push({ kind: 'radio', el, name: `${input.name}=${input.value}` });
      }
    } else if (input.getAttribute('role') === 'combobox') {
      controls.push({ kind: 'select', el, name });
    } else if (input.placeholder === 'Choose') {
      // UnitPicker: Grafana's Cascader, which only edits through a search select.
      controls.push({ kind: 'unit', el, name });
    } else {
      controls.push({ kind: 'text', el, name });
    }
  });
  return controls;
};

// Role queries compute accessible names for the whole document and are far
// too slow to run hundreds of times, so menus and popovers are found by their
// attributes instead.
const all = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector));
const waitForAll = async (selector: string) => {
  await waitFor(() => expect(all(selector).length).toBeGreaterThan(0));
  return all(selector);
};

const drive = async ({ kind, el }: Control) => {
  switch (kind) {
    case 'button':
    case 'toggle':
    case 'radio':
      fireEvent.click(el);
      return;
    case 'text': {
      const input = el as HTMLInputElement;
      const numeric = input.type === 'number' || (input.value !== '' && Number.isFinite(Number(input.value)));
      const next = numeric ? (input.value === '7' ? '8' : '7') : 'https://example.com/sweep';
      // Some inputs commit on change, others on blur.
      fireEvent.change(input, { target: { value: next } });
      fireEvent.blur(input);
      return;
    }
    case 'select': {
      fireEvent.keyDown(el, { key: 'ArrowDown' });
      const option = all('[role="option"]').find((o) => o.getAttribute('aria-selected') !== 'true');
      if (option) {
        fireEvent.click(option);
      }
      return;
    }
    case 'unit': {
      // A keystroke swaps the cascader for a searchable select, which offers
      // any typed text as "Custom unit: <text>".
      const before = new Set(all('[role="combobox"]'));
      fireEvent.keyDown(el, { key: 'z' });
      const search = all('[role="combobox"]').find((c) => !before.has(c));
      if (!search) {
        throw new Error('the unit search box did not open');
      }
      fireEvent.change(search, { target: { value: 'sweepunit' } });
      const options = await waitForAll('[role="option"]');
      fireEvent.click(options.find((o) => o.textContent === 'Custom unit: sweepunit')!);
      return;
    }
    case 'color': {
      fireEvent.click(el);
      const current = el.getAttribute('aria-label');
      const pick = current === 'red color' || current === '#F2495C color' ? 'blue color' : 'red color';
      // Earlier pickers' popovers may still be open; the newest is last.
      const swatches = await waitForAll(`button[aria-label="${pick}"]`);
      fireEvent.click(swatches[swatches.length - 1]);
      return;
    }
  }
};

export type SweepCase = {
  Form: React.ComponentType<EditorProps>;
  initial: () => Weathermap;
  // Brings the controls under test on screen (pick a node, open sections).
  setup?: () => Promise<void>;
};

const mount = async ({ Form, initial, setup }: SweepCase, deliveries: Delivery[]) => {
  const { container } = render(<Harness Form={Form} initial={initial()} deliveries={deliveries} />);
  await setup?.();
  // Setup only navigates; anything it delivered is not the control's doing.
  deliveries.length = 0;
  return container;
};

const shape = (controls: Control[]) => controls.map((c) => c.kind).join(',');

/**
 * Drives every control of the form once. Returns each rule violation as
 * `{ control, problem }`, the labels of the controls that delivered state, and
 * `silent`: the controls that delivered nothing, as `kind "name"` without the
 * index so the list survives reordering. Tests pin `silent` exactly, so a
 * handler that stops calling onChange fails, and a new control must be
 * classified.
 */
export const sweepEditor = async (c: SweepCase) => {
  // React reports an error thrown in an event handler through the window
  // 'error' event rather than out of fireEvent.
  let uncaught: string[] = [];
  const recordUncaught = (e: ErrorEvent) => {
    uncaught.push(String(e.error ?? e.message));
    e.preventDefault();
  };
  window.addEventListener('error', recordUncaught);
  // Remove buttons ask first; jsdom has no confirm().
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

  const problems: Array<{ control: string; problem: string }> = [];
  const changed: string[] = [];
  const silent: string[] = [];
  try {
    const deliveries: Delivery[] = [];
    let container = await mount(c, deliveries);
    const expected = findControls(container);
    // Color pickers go last: their popovers stay open and hold focus, which
    // would close a unit picker's search box before it can be typed into.
    const order = expected
      .map((_, k) => k)
      .sort((a, b) => +(expected[a].kind === 'color') - +(expected[b].kind === 'color'));
    for (const k of order) {
      // Keep driving the same render while the form shows the same controls;
      // start over when an earlier control changed the layout (removed a node,
      // switched mode, ...), so control k is always control k of the original.
      let controls = findControls(container);
      if (shape(controls) !== shape(expected)) {
        cleanup();
        container = await mount(c, deliveries);
        controls = findControls(container);
      }
      const label = `${expected[k].kind} #${k} "${expected[k].name}"`;
      deliveries.length = 0;
      uncaught = [];
      try {
        await drive(controls[k]);
      } catch (e) {
        problems.push({ control: label, problem: `drive failed: ${String(e)}` });
      }
      uncaught.forEach((err) => problems.push({ control: label, problem: `threw: ${err}` }));
      deliveries.forEach(({ prev, next }) => {
        if (next === prev) {
          problems.push({ control: label, problem: 'delivered the same object it was given' });
        } else if (JSON.stringify(next) === JSON.stringify(prev)) {
          problems.push({ control: label, problem: 'delivered a copy with no change' });
        }
      });
      if (deliveries.length > 0) {
        changed.push(label);
      } else {
        silent.push(`${expected[k].kind} "${expected[k].name}"`);
      }
    }
  } finally {
    cleanup();
    confirmSpy.mockRestore();
    window.removeEventListener('error', recordUncaught);
  }
  return { problems, changed, silent };
};

/**
 * A current-version map in which every optional editor section has content:
 * Node A has an icon, link, status mapping and tooltip metric; the A-B link
 * has tooltip metrics, units and a waypoint. Node B and a second (B-A) link
 * differ from Node A and the first link, so "Apply to All?" changes something.
 */
export const richMap = (): Weathermap => {
  const wm = handleVersionedStateUpdates(getData(theme), theme);
  const [a, b] = wm.nodes;
  b.colors = { ...b.colors, font: '#111111', background: '#222222', border: '#333333' };
  wm.links.push({
    ...generateBasicLink([b, a]),
    id: 'link-b-a',
    stroke: 3,
    arrows: { width: 4, height: 5, offset: 1 },
  });
  a.nodeIcon = {
    ...a.nodeIcon!,
    src: 'https://example.com/icon.svg',
    name: 'custom_icon',
    size: { width: 40, height: 30 },
  };
  // Set, so the link input starts controlled (an unset link renders an
  // uncontrolled input and React warns when the sweep types into it).
  a.dashboardLink = 'https://example.com/node-a';
  a.statusQuery = 'series-a';
  a.statusValueMappings = [{ value: 1, color: '#00FF00' }];
  a.tooltipMetrics = [{ label: 'CPU', query: 'series-a', units: 'percent' }];
  const [link] = wm.links;
  link.tooltipMetrics = [{ label: 'Errors', queryA: 'series-a', queryZ: 'series-b', units: 'short' }];
  link.statusQuery = 'series-b';
  link.units = 'bps';
  link.waypoints = [{ x: 260, y: 200 }];
  link.cornerRadius = 5;
  wm.scale = [
    { percent: 0, color: '#73BF69' },
    { percent: 50, color: '#C4162A' },
  ];
  return wm;
};

/** Opens the react-select showing `placeholder` and clicks the option matching `label`. */
export const pickOption = async (placeholder: string, label: RegExp | string) => {
  let control: HTMLElement | null = screen.getByText(placeholder).parentElement;
  while (control && !control.querySelector('[role="combobox"]')) {
    control = control.parentElement;
  }
  fireEvent.keyDown(control!.querySelector('[role="combobox"]')!, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByText(label));
};

/** Expands collapsed sections by their header text. */
export const openSections = (...labels: string[]) => labels.forEach((l) => fireEvent.click(screen.getByText(l)));
