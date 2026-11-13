import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Weathermap } from 'types';
import { getData, theme } from 'testData';
import { ExportForm } from './ExportForm';
import { getExportSvg, registerExportSvg, unregisterExportSvg } from 'exportSvgRegistry';

test('SVG export does not crash when the SVG element is missing', async () => {
  // Nothing registered for this map: the panel has not rendered in edit mode.
  const value = getData(theme);
  expect(getExportSvg(value.id)).toBeUndefined();

  const createObjectURL = jest.fn(() => 'blob:mock');
  // jsdom does not implement createObjectURL; provide a spy either way.
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;

  const onChange = jest.fn();
  const props = { value, onChange } as unknown as StandardEditorProps<Weathermap>;
  render(<ExportForm {...props} />);

  // #133 (d8a582d): the click handler is async, so a TypeError on the missing
  // element surfaces as a rejected promise, not a throw from the click. Collect
  // unhandled rejections and console errors so the failure lands in this test
  // instead of whichever test happens to run next.
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => rejections.push(reason);
  process.on('unhandledRejection', onRejection);
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  try {
    const button = screen.getByText('Export SVG');
    // Should not throw and should bail out before attempting to build a blob.
    expect(() => fireEvent.click(button)).not.toThrow();
    // Let the async handler settle and Node report any unhandled rejection.
    await new Promise((r) => setTimeout(r, 0));

    expect(rejections).toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  } finally {
    process.off('unhandledRejection', onRejection);
    errorSpy.mockRestore();
  }
});

test('the download anchor is owned by React and no stray node is left in the document', async () => {
  const value = getData(theme);
  const props = { value, onChange: jest.fn() } as unknown as StandardEditorProps<Weathermap>;
  const { container, unmount } = render(<ExportForm {...props} />);

  // The anchor is part of the component's own subtree rather than something
  // appended to document.body behind React's back.
  const anchors = container.querySelectorAll('a');
  expect(anchors).toHaveLength(1);

  const anchorCountBefore = document.querySelectorAll('a').length;
  fireEvent.click(screen.getByText('Export JSON'));
  await new Promise((r) => setTimeout(r, 0));

  // Exporting reuses that one anchor: it neither appends nor leaks a node.
  expect(document.querySelectorAll('a')).toHaveLength(anchorCountBefore);
  expect(anchors[0].getAttribute('download')).toContain('network-weathermap-');

  // And unmounting takes the anchor with it, which an imperatively appended
  // node would not have done.
  unmount();
  expect(document.querySelectorAll('a')).toHaveLength(anchorCountBefore - 1);
});

describe('SVG export URL handling (#203)', () => {
  const registered: Array<[string, SVGSVGElement]> = [];
  // Stands in for the panel: builds its <svg> and registers it the way
  // WeathermapPanel does in edit mode.
  const setupSvg = (value: Weathermap, hrefs: string[]) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const href of hrefs) {
      const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      image.setAttribute('href', href);
      svg.appendChild(image);
    }
    registerExportSvg(value.id, svg);
    registered.push([value.id, svg]);
    return svg;
  };

  const clickExport = async () => {
    fireEvent.click(screen.getByText('Export SVG'));
    // let the async handler settle
    await new Promise((r) => setTimeout(r, 0));
  };

  afterEach(() => {
    jest.restoreAllMocks();
    registered.splice(0).forEach(([id, el]) => unregisterExportSvg(id, el));
    document.querySelectorAll('svg').forEach((el) => el.remove());
  });

  test('svg export handles absolute icon url fetch failure', async () => {
    const value = getData(theme);
    setupSvg(value, ['https://icons.example.com/broken.svg', 'public/plugins/x/icons/ok.svg']);

    const fetchMock = jest.fn((url: string) =>
      url.includes('broken')
        ? Promise.reject(new Error('network down'))
        : Promise.resolve({ ok: true, text: () => Promise.resolve('<svg/>') })
    );
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
    const blobSpy = jest.fn(() => 'blob:mock');
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = blobSpy;
    let blobContent = '';
    const RealBlob = global.Blob;
    jest.spyOn(global, 'Blob').mockImplementation((parts?: BlobPart[], opts?: BlobPropertyBag) => {
      blobContent = ((parts ?? []) as string[]).join('');
      return new RealBlob(parts, opts);
    });

    const props = { value, onChange: jest.fn() } as unknown as StandardEditorProps<Weathermap>;
    render(<ExportForm {...props} />);
    await clickExport();

    // Export completed despite the failed absolute fetch...
    expect(blobSpy).toHaveBeenCalled();
    // ...the broken icon keeps its original href...
    expect(blobContent).toContain('https://icons.example.com/broken.svg');
    // ...and the healthy relative icon was inlined.
    expect(blobContent).toContain('data:image/svg+xml;base64,');
    // The absolute URL was fetched as-is, not origin-prefixed.
    expect(fetchMock).toHaveBeenCalledWith('https://icons.example.com/broken.svg');
  });

  test('data: hrefs are not fetched or rewritten (any scheme casing)', async () => {
    const value = getData(theme);
    // Mixed case on one of them: URL schemes are case-insensitive, so DATA:
    // must be recognized the same as data:.
    setupSvg(value, ['data:image/svg+xml;base64,AAAA', 'DATA:image/svg+xml;base64,BBBB']);

    const fetchMock = jest.fn();
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
    const blobSpy = jest.fn(() => 'blob:mock');
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = blobSpy;

    const props = { value, onChange: jest.fn() } as unknown as StandardEditorProps<Weathermap>;
    render(<ExportForm {...props} />);
    await clickExport();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(blobSpy).toHaveBeenCalled();
  });
});

// Grafana review of 1.6.23: plugins must not query the global document. The
// export used document.getElementById(`nw-<id>_`), which can match another
// panel's element (a copied panel keeps the same map id) or Grafana's own.
describe('SVG export takes the panel SVG from the registry, not the document', () => {
  const svgWithImage = (href: string) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('href', href);
    svg.appendChild(image);
    return svg;
  };

  afterEach(() => {
    jest.restoreAllMocks();
    document.querySelectorAll('svg').forEach((el) => el.remove());
  });

  test('exports the registered element even when a decoy with the old id is in the document', async () => {
    const value = getData(theme);
    // A decoy carrying the id the old lookup searched for. If the export ever
    // goes back to the document, it picks this one up.
    const decoy = svgWithImage('data:image/svg+xml;base64,DECOY');
    decoy.setAttribute('id', `nw-${value.id}_`);
    document.body.appendChild(decoy);

    const own = svgWithImage('data:image/svg+xml;base64,OWN');
    registerExportSvg(value.id, own);

    const getById = jest.spyOn(document, 'getElementById');
    const query = jest.spyOn(document, 'querySelector');
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = jest.fn(() => 'blob:mock');
    let blobContent = '';
    const RealBlob = global.Blob;
    jest.spyOn(global, 'Blob').mockImplementation((parts?: BlobPart[], opts?: BlobPropertyBag) => {
      blobContent = ((parts ?? []) as string[]).join('');
      return new RealBlob(parts, opts);
    });

    try {
      const props = { value, onChange: jest.fn() } as unknown as StandardEditorProps<Weathermap>;
      render(<ExportForm {...props} />);
      fireEvent.click(screen.getByText('Export SVG'));
      await new Promise((r) => setTimeout(r, 0));

      expect(blobContent).toContain('OWN');
      expect(blobContent).not.toContain('DECOY');
      expect(getById).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
    } finally {
      unregisterExportSvg(value.id, own);
    }
  });

  test('a decoy with the old id alone is not exported', async () => {
    const value = getData(theme);
    const decoy = svgWithImage('data:image/svg+xml;base64,DECOY');
    decoy.setAttribute('id', `nw-${value.id}_`);
    document.body.appendChild(decoy);

    const createObjectURL = jest.fn(() => 'blob:mock');
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;

    const props = { value, onChange: jest.fn() } as unknown as StandardEditorProps<Weathermap>;
    render(<ExportForm {...props} />);
    fireEvent.click(screen.getByText('Export SVG'));
    await new Promise((r) => setTimeout(r, 0));

    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
