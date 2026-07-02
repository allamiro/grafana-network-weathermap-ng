import React from 'react';
import { render, screen } from '@testing-library/react';
import { StandardEditorProps } from '@grafana/data';
import { WeathermapBuilder } from './WeathermapBuilder';
import { Weathermap } from 'types';
import { CURRENT_VERSION } from 'utils';
import { legacyWeathermap } from '../module.test';

const renderBuilder = (value: Weathermap | undefined) => {
  const onChange = jest.fn();
  const props = {
    value,
    onChange,
    context: { data: [] },
    item: { settings: { placeholder: '' } },
  } as unknown as StandardEditorProps<Weathermap, { placeholder: string }>;
  render(<WeathermapBuilder {...props} />);
  return onChange;
};

// Regression test for #162: opening the panel editor on a dashboard saved
// before options schema v14 crashed in PanelForm because the child forms
// rendered the raw options (missing settings.tooltip / settings.scale) before
// the migrated value from onChange made it back through props.
test('renders the editor for pre-v14 weathermaps without crashing (#162)', () => {
  const onChange = renderBuilder(JSON.parse(JSON.stringify(legacyWeathermap)));

  // These sections read settings.tooltip.* and settings.scale.* directly.
  expect(screen.getByText('Tooltip Font Size')).toBeInTheDocument();
  expect(screen.getByText('Scale Title')).toBeInTheDocument();

  expect(onChange).toHaveBeenCalledTimes(1);
  const migrated = onChange.mock.calls[0][0];
  expect(migrated.version).toBe(CURRENT_VERSION);
  expect(migrated.settings.tooltip).toBeDefined();
  expect(migrated.settings.scale).toBeDefined();
});

test('initializes and renders the default weathermap when no value is saved', () => {
  const onChange = renderBuilder(undefined);

  expect(onChange).toHaveBeenCalledTimes(1);
  const initialized = onChange.mock.calls[0][0];
  expect(initialized.version).toBe(CURRENT_VERSION);
  expect(initialized.nodes).toHaveLength(2);
  // Previously the builder rendered nothing on the first pass; now the forms
  // render immediately with the initialized value.
  expect(screen.getByText('Tooltip Font Size')).toBeInTheDocument();
});
