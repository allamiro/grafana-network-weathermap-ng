import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DataFrame, FieldType, StandardEditorProps, toDataFrame } from '@grafana/data';
import { NodeForm } from './NodeForm';
import { Anchor, Weathermap } from 'types';
import { generateBasicLink, generateBasicNode } from 'utils';
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

const Harness = ({
  initial,
  onChangeSpy,
  data = [],
}: {
  initial: Weathermap;
  onChangeSpy: jest.Mock;
  data?: DataFrame[];
}) => {
  const [wm, setWm] = useState(initial);
  const props = {
    value: deepFreeze(wm),
    onChange: (v: Weathermap) => {
      onChangeSpy(v);
      setWm(v);
    },
    context: { data },
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

  // Resolve Node A by label, as the form does, not by fixture order.
  const nodeA = (wm: Weathermap) => wm.nodes.find((n) => n.label === 'Node A')!;

  // #200 (22e71ad): a blank icon width reports NaN; it must keep the previous
  // size instead of saving NaN into the icon geometry.
  test('clearing the icon width keeps the previous size', async () => {
    const initial = getData(theme);
    // A real icon with a non-zero size: the basic node's 0x0 placeholder would
    // make "kept the previous value" indistinguishable from a reset.
    nodeA(initial).nodeIcon = {
      src: 'public/plugins/tamirsuliman-weathermap-panel/icons/x.svg',
      name: 'x',
      size: { width: 40, height: 40 },
      padding: { vertical: 0, horizontal: 0 },
      drawInside: false,
    };
    const spy = jest.fn();
    const { container } = render(<Harness initial={initial} onChangeSpy={spy} />);
    await openNodeA();
    fireEvent.click(screen.getByText('Icon'));

    const width = container.querySelector('input[placeholder="Width"]')!;
    fireEvent.change(width, { target: { value: '' } });
    expect(nodeA(lastValue(spy)).nodeIcon!.size.width).toBe(40);

    // 0 is still a real value, not treated as blank.
    fireEvent.change(width, { target: { value: '0' } });
    expect(nodeA(lastValue(spy)).nodeIcon!.size.width).toBe(0);
  });

  // #200 (22e71ad): a blank status-mapping threshold must keep the previous
  // threshold instead of saving NaN (which matches no value at all).
  test('clearing a status-mapping threshold keeps the previous value', async () => {
    const initial = getData(theme);
    nodeA(initial).statusValueMappings = [{ value: 5, color: '#ff0000' }];
    const spy = jest.fn();
    render(<Harness initial={initial} onChangeSpy={spy} />);
    await openStatusSection();

    let row: HTMLElement | null = screen.getByText('Threshold (≥)');
    while (row && !row.querySelector('input[type="number"]')) {
      row = row.parentElement;
    }
    const threshold = row!.querySelector('input[type="number"]')!;
    fireEvent.change(threshold, { target: { value: '' } });

    expect(nodeA(lastValue(spy)).statusValueMappings![0].value).toBe(5);
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

test('node padding sliders allow values above the old 50 cap (#279)', async () => {
  const spy = jest.fn();
  const initial = getData(theme);
  render(<Harness initial={initial} onChangeSpy={spy} />);

  // Pick "Node A", then expand the Padding section.
  const picker = screen.getAllByRole('combobox')[0];
  fireEvent.keyDown(picker, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByText('Node A'));
  fireEvent.click(screen.getByText('Padding'));

  // Both padding sliders advertise the raised bound, so typed values up to
  // 200 no longer snap back to 50.
  const sliders = screen.getAllByRole('slider').filter((el) => el.getAttribute('aria-valuemax') !== null);
  const maxes = sliders.map((el) => el.getAttribute('aria-valuemax'));
  expect(maxes).toEqual(expect.arrayContaining(['200']));
  expect(maxes).not.toContain('50');
});

// Dashboard link and custom icon source handlers: they clone before writing
// (#233) and refuse unsafe URLs at input (#133).
describe('node link and icon URL inputs (#233, #133)', () => {
  // Resolve Node A by label, as the picker does, not by fixture order.
  const nodeA = (wm: Weathermap) => wm.nodes.find((n) => n.label === 'Node A')!;
  const lastNodeA = (spy: jest.Mock) => nodeA(spy.mock.calls[spy.mock.calls.length - 1][0]);

  const selectNodeA = async () => {
    const picker = screen.getAllByRole('combobox')[0];
    fireEvent.keyDown(picker, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByText('Node A'));
  };

  // #233 (d96e5a6): the dashboard link handler wrote into the frozen
  // props.value, which throws in the harness and never reaches onChange.
  test('dashboard link change delivers a new weathermap', async () => {
    const initial = getData(theme);
    const spy = jest.fn();
    const { container } = render(<Harness initial={initial} onChangeSpy={spy} />);
    await selectNodeA();

    fireEvent.change(container.querySelector('input[name="Dashboard link"]')!, { target: { value: '/d/abc' } });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).not.toBe(initial);
    expect(lastNodeA(spy).dashboardLink).toBe('/d/abc');
  });

  // #133 (d8a582d): a javascript: URL typed into the dashboard link is
  // dropped at input; a safe URL is stored verbatim.
  test('dashboard link refuses unsafe URLs', async () => {
    const spy = jest.fn();
    const { container } = render(<Harness initial={getData(theme)} onChangeSpy={spy} />);
    await selectNodeA();
    const link = container.querySelector('input[name="Dashboard link"]')!;

    fireEvent.change(link, { target: { value: 'javascript:alert(1)' } });
    expect(lastNodeA(spy).dashboardLink).toBe('');

    fireEvent.change(link, { target: { value: 'https://grafana.example/d/x' } });
    expect(lastNodeA(spy).dashboardLink).toBe('https://grafana.example/d/x');
  });

  // #133 (d8a582d): same rule for the custom icon source, which only renders
  // when the node's icon is the "custom_icon" choice.
  test('custom icon source refuses unsafe URLs', async () => {
    const initial = getData(theme);
    nodeA(initial).nodeIcon = {
      src: '',
      name: 'custom_icon',
      size: { width: 40, height: 40 },
      padding: { vertical: 0, horizontal: 0 },
      drawInside: false,
    };
    const spy = jest.fn();
    const { container } = render(<Harness initial={initial} onChangeSpy={spy} />);
    await selectNodeA();
    fireEvent.click(screen.getByText('Icon'));
    const src = container.querySelector('input[name="iconImageURL"]')!;

    fireEvent.change(src, { target: { value: 'javascript:alert(1)' } });
    expect(lastNodeA(spy).nodeIcon!.src).toBe('');

    fireEvent.change(src, { target: { value: 'https://grafana.example/icon.svg' } });
    expect(lastNodeA(spy).nodeIcon!.src).toBe('https://grafana.example/icon.svg');
  });
});

// #54 (4168874): the status query dropdown must name each frame against ALL
// frames. With two datasources Grafana prefixes the frame name ("Prometheus
// value"); a name computed against the frame alone is a bare "value" for
// both, which the map can't bind and the user can't tell apart.
test('the status query dropdown offers the frame-prefixed names the map binds (#54)', async () => {
  const frame = (name: string) =>
    toDataFrame({
      name,
      fields: [
        { name: 'time', type: FieldType.time, values: [1000] },
        { name: 'value', type: FieldType.number, values: [1] },
      ],
    });
  render(
    <Harness initial={getData(theme)} onChangeSpy={jest.fn()} data={[frame('Prometheus'), frame('ClickHouse')]} />
  );
  await openStatusSection();

  let control: HTMLElement | null = screen.getByText('Select query');
  while (control && !control.querySelector('[role="combobox"]')) {
    control = control.parentElement;
  }
  fireEvent.keyDown(control!.querySelector('[role="combobox"]')!, { key: 'ArrowDown' });

  const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
  expect(options).toEqual(['Prometheus value', 'ClickHouse value']);
});

// #390: Remove Node deletes the links attached to the node, and must release
// the anchor slots those links held on the nodes that survive, the same way
// LinkForm's removeLink does. Links are spread across an anchor by numLinks,
// so a stale count keeps the old spacing.
describe('Remove Node releases anchor slots on the surviving nodes (#390)', () => {
  // A, B and C with links A-B, A-C and B-C. generateBasicLink puts side A on
  // the Right anchor and side Z on the Left anchor.
  const triangle = () => {
    const wm = getData(theme); // A-B, with A.Right = 1 and B.Left = 1
    const [a, b] = wm.nodes;
    const c = generateBasicNode('Node C', [300, 450], theme);
    wm.nodes.push(c);
    wm.links.push(generateBasicLink([a, c]), generateBasicLink([b, c]));
    a.anchors[Anchor.Right].numLinks = 2; // A-B, A-C
    b.anchors[Anchor.Right].numLinks = 1; // B-C
    c.anchors[Anchor.Left].numLinks = 2; // A-C, B-C
    return wm;
  };

  const removeNode = async (label: string) => {
    const picker = screen.getAllByRole('combobox')[0];
    fireEvent.keyDown(picker, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByText(label));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Node' }));
  };

  const counts = (wm: Weathermap) =>
    Object.fromEntries(wm.nodes.map((n) => [n.label, [Anchor.Left, Anchor.Right].map((k) => n.anchors[k].numLinks)]));

  test('removing C decrements the anchors its links used on A and B', async () => {
    const spy = jest.fn();
    render(<Harness initial={triangle()} onChangeSpy={spy} />);
    await removeNode('Node C');

    const next: Weathermap = spy.mock.calls[spy.mock.calls.length - 1][0];
    expect(next.nodes.map((n) => n.label)).toEqual(['Node A', 'Node B']);
    expect(next.links.map((l) => l.nodes.map((n) => n.label))).toEqual([['Node A', 'Node B']]);
    // [Left, Right]: A keeps only A-B on its Right; B keeps A-B on its Left
    // and loses B-C on its Right.
    expect(counts(next)).toEqual({ 'Node A': [0, 1], 'Node B': [1, 0] });
  });

  test('a saved map missing an anchor entry still removes the node', async () => {
    const spy = jest.fn();
    const wm = triangle();
    // Hand-edited / partial saved maps must not crash the editor.
    delete (wm.nodes[0].anchors as Partial<(typeof wm.nodes)[0]['anchors']>)[Anchor.Right];
    render(<Harness initial={wm} onChangeSpy={spy} />);
    await removeNode('Node C');

    const next: Weathermap = spy.mock.calls[spy.mock.calls.length - 1][0];
    expect(next.nodes.map((n) => n.label)).toEqual(['Node A', 'Node B']);
    expect(next.nodes[1].anchors[Anchor.Right].numLinks).toBe(0);
  });

  test('partial saved links (missing endpoints or a side) do not crash removal', async () => {
    const spy = jest.fn();
    const wm = triangle();
    const [a, , c] = wm.nodes;
    type SavedLink = Weathermap['links'][number];
    const noEndpoints = { ...generateBasicLink([a, c]), id: 'no-endpoints', nodes: [] } as unknown as SavedLink;
    const onlyC = { ...generateBasicLink([a, c]), id: 'only-c', nodes: [c] } as unknown as SavedLink;
    const noZSide = generateBasicLink([a, c]);
    noZSide.id = 'no-z-side';
    delete (noZSide.sides as Partial<SavedLink['sides']>).Z;
    wm.links.push(noEndpoints, onlyC, noZSide);
    a.anchors[Anchor.Right].numLinks = 3; // A-B, A-C, and the A side of no-z-side
    render(<Harness initial={wm} onChangeSpy={spy} />);
    await removeNode('Node C');

    const next: Weathermap = spy.mock.calls[spy.mock.calls.length - 1][0];
    // The endpoint-less link never touched C, so it stays; the other two go.
    expect(next.links.map((l) => l.id)).toEqual(['nw-link-0', 'no-endpoints']);
    expect(counts(next)).toEqual({ 'Node A': [0, 1], 'Node B': [1, 0] });
  });

  test('an already-drifted count stays at 0 instead of going negative', async () => {
    const spy = jest.fn();
    const wm = triangle();
    wm.nodes[1].anchors[Anchor.Right].numLinks = 0; // B: B-C not counted
    render(<Harness initial={wm} onChangeSpy={spy} />);
    await removeNode('Node C');

    const next: Weathermap = spy.mock.calls[spy.mock.calls.length - 1][0];
    expect(counts(next)).toEqual({ 'Node A': [0, 1], 'Node B': [1, 0] });
  });
});
