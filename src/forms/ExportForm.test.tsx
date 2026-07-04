import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Weathermap } from 'types';
import { getData, theme } from 'testData';
import { ExportForm } from './ExportForm';

test('SVG export does not crash when the SVG element is missing', async () => {
  // Ensure the expected SVG element is not present in the DOM.
  const value = getData(theme);
  expect(document.getElementById(`nw-${value.id}_`)).toBeNull();

  const createObjectURL = jest.fn(() => 'blob:mock');
  // jsdom does not implement createObjectURL; provide a spy either way.
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;

  const onChange = jest.fn();
  const props = { value, onChange } as unknown as StandardEditorProps<Weathermap>;
  render(<ExportForm {...props} />);

  const button = screen.getByText('Export SVG');
  // Should not throw and should bail out before attempting to build a blob.
  expect(() => fireEvent.click(button)).not.toThrow();
  // Allow the async handler to settle.
  await Promise.resolve();

  expect(createObjectURL).not.toHaveBeenCalled();
});

describe('SVG export URL handling (#203)', () => {
  const setupSvg = (value: Weathermap, hrefs: string[]) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', `nw-${value.id}_`);
    for (const href of hrefs) {
      const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      image.setAttribute('href', href);
      svg.appendChild(image);
    }
    document.body.appendChild(svg);
    return svg;
  };

  const clickExport = async () => {
    fireEvent.click(screen.getByText('Export SVG'));
    // let the async handler settle
    await new Promise((r) => setTimeout(r, 0));
  };

  afterEach(() => {
    jest.restoreAllMocks();
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

  test('data: hrefs are not fetched or rewritten', async () => {
    const value = getData(theme);
    const dataHref = 'data:image/svg+xml;base64,AAAA';
    setupSvg(value, [dataHref]);

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
