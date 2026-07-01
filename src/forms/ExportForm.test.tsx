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
