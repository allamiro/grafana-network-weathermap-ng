import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { StandardEditorProps } from '@grafana/data';
import { NodeForm } from './NodeForm';
import { Weathermap } from 'types';
import { getData, theme } from '../testData';

// Stateful harness: the editor only re-renders when onChange delivers a new
// options object, which is exactly the behavior under test (#162).

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
  return <NodeForm {...props} />;
};

const openStatusSection = async () => {
  // Pick "Node A" in the react-select node picker, then expand Status.
  const picker = screen.getAllByRole('combobox')[0];
  fireEvent.keyDown(picker, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByText('Node A'));
  fireEvent.click(screen.getByText('Status'));
};

test('status color target keeps its selected indicator after changing (#162)', async () => {
  const spy = jest.fn();
  const initial = getData(theme);
  render(<Harness initial={initial} onChangeSpy={spy} />);
  await openStatusSection();

  expect(screen.getByRole('radio', { name: 'Border' })).toBeChecked();

  const background = screen.getByRole('radio', { name: 'Background' });
  fireEvent.click(background);

  expect(background).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Border' })).not.toBeChecked();
  // The editor must receive a new object, not a mutation of the rendered one,
  // or the options pane can skip re-rendering on reference equality.
  const updated = spy.mock.calls[0][0];
  expect(updated).not.toBe(initial);
  const nodeA = updated.nodes.find((n: { label: string }) => n.label === 'Node A');
  expect(nodeA.nodeStatusColorTarget).toBe('background');
});

test('status color target radios have stable per-node ids (#162)', async () => {
  const initial = getData(theme);
  render(<Harness initial={initial} onChangeSpy={jest.fn()} />);
  await openStatusSection();

  const nodeA = initial.nodes.find((n) => n.label === 'Node A')!;
  for (const target of ['border', 'background', 'both']) {
    const id = `option-${target}-nwm-status-color-target-${nodeA.id}`;
    expect(document.getElementById(id)).toBeInTheDocument();
  }
});

// #200: blank numeric inputs must not write NaN into node positions.
describe('number inputs do not store NaN (#200)', () => {
  const lastValue = (spy: jest.Mock): Weathermap => spy.mock.calls[spy.mock.calls.length - 1][0];

  const openNodeA = async () => {
    const picker = screen.getAllByRole('combobox')[0];
    fireEvent.keyDown(picker, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByText('Node A'));
  };

  test('clearing the X position keeps the previous coordinate', async () => {
    const initial = getData(theme);
    const nodeA = initial.nodes.find((n) => n.label === 'Node A')!;
    const startX = nodeA.position[0];
    const spy = jest.fn();
    const { container } = render(<Harness initial={initial} onChangeSpy={spy} />);
    await openNodeA();

    const xInput = container.querySelector('input[name="X"]')!;
    fireEvent.change(xInput, { target: { value: '' } });

    const updated = lastValue(spy).nodes.find((n) => n.label === 'Node A')!;
    expect(updated.position[0]).toBe(startX);
    expect(Number.isNaN(updated.position[0])).toBe(false);
  });

  test('0 is a valid coordinate and typing resumes after a blank', async () => {
    const spy = jest.fn();
    const { container } = render(<Harness initial={getData(theme)} onChangeSpy={spy} />);
    await openNodeA();

    const xInput = container.querySelector('input[name="X"]')!;
    fireEvent.change(xInput, { target: { value: '0' } });
    expect(lastValue(spy).nodes.find((n) => n.label === 'Node A')!.position[0]).toBe(0);

    fireEvent.change(xInput, { target: { value: '' } });
    fireEvent.change(xInput, { target: { value: '250' } });
    expect(lastValue(spy).nodes.find((n) => n.label === 'Node A')!.position[0]).toBe(250);
  });
});

// #225: form updates must deliver new object references, not mutations of
// props.value.
test('position change delivers a new weathermap and node reference (#225)', async () => {
  const initial = getData(theme);
  const before = JSON.parse(JSON.stringify(initial));
  const spy = jest.fn();
  const { container } = render(<Harness initial={initial} onChangeSpy={spy} />);
  const picker = screen.getAllByRole('combobox')[0];
  fireEvent.keyDown(picker, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByText('Node A'));

  fireEvent.change(container.querySelector('input[name="X"]')!, { target: { value: '321' } });

  const updated = spy.mock.calls[spy.mock.calls.length - 1][0];
  expect(updated).not.toBe(initial);
  expect(updated.nodes).not.toBe(initial.nodes);
  const idx = updated.nodes.findIndex((n: { label?: string }) => n.label === 'Node A');
  expect(updated.nodes[idx]).not.toBe(initial.nodes[idx]);
  expect(updated.nodes[idx].position[0]).toBe(321);
  // The original object is untouched.
  expect(initial).toEqual(before);
});

// #225 follow-up (review): color/status/connection handlers must also deliver
// new references.
test('node color change delivers new node and colors references (#225)', async () => {
  const initial = getData(theme);
  const before = JSON.parse(JSON.stringify(initial));
  const spy = jest.fn();
  render(<Harness initial={initial} onChangeSpy={spy} />);
  const picker = screen.getAllByRole('combobox')[0];
  fireEvent.keyDown(picker, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByText('Node A'));

  // The apply-to-all button (inside the Colors collapse) exercises the bulk
  // path without opening color pickers.
  fireEvent.click(screen.getByText('Colors'));
  fireEvent.click(screen.getByText(/Apply to All/i));

  const updated = spy.mock.calls[spy.mock.calls.length - 1][0];
  expect(updated).not.toBe(initial);
  expect(updated.nodes).not.toBe(initial.nodes);
  expect(updated.nodes[0]).not.toBe(initial.nodes[0]);
  expect(updated.nodes[0].colors).not.toBe(initial.nodes[0].colors);
  expect(initial).toEqual(before);
});

test('toggling Use As Connection keeps the node label (#282)', async () => {
  const spy = jest.fn();
  const initial = getData(theme);
  render(<Harness initial={initial} onChangeSpy={spy} />);

  // Select Node A and open the Advanced section.
  const picker = screen.getAllByRole('combobox')[0];
  fireEvent.keyDown(picker, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByText('Node A'));
  fireEvent.click(screen.getByText('Advanced'));

  // Toggle "Use As Connection (BETA)".
  let el: HTMLElement | null = screen.getByText('Use As Connection (BETA)');
  while (el && !el.querySelector('input')) {
    el = el.parentElement;
  }
  const toggle = el!.querySelector('input') as HTMLInputElement;
  fireEvent.click(toggle);

  const updated = spy.mock.calls[spy.mock.calls.length - 1][0];
  const nodeA = updated.nodes.find((n: { label?: string }) => n.label === 'Node A');
  // The node keeps its label (not renamed to "C0") and becomes a connection.
  expect(nodeA).toBeDefined();
  expect(nodeA.isConnection).toBe(true);
});

test('a newly added node gets its own colors object (#281)', () => {
  const spy = jest.fn();
  const initial = getData(theme);
  render(<Harness initial={initial} onChangeSpy={spy} />);

  fireEvent.click(screen.getByText('Add Node'));

  const updated = spy.mock.calls[spy.mock.calls.length - 1][0];
  const newNode = updated.nodes[updated.nodes.length - 1];
  // Same values as the first node, but a distinct object — so editing one
  // node's color can never affect another (#281).
  expect(newNode.colors).toEqual(updated.nodes[0].colors);
  expect(newNode.colors).not.toBe(updated.nodes[0].colors);
});
