import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { StandardEditorProps } from '@grafana/data';
import { WeathermapBuilder } from './WeathermapBuilder';
import { Weathermap } from 'types';
import { CURRENT_VERSION } from 'utils';
import { getData, legacyWeathermap, theme } from 'testData';

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

test('node and link pickers have explicit unique input ids (#167)', () => {
  renderBuilder(JSON.parse(JSON.stringify(legacyWeathermap)));

  // Without explicit ids, Grafana 13's options-pane Field context assigns
  // every bare control the options-item id, producing duplicate ids.
  expect(document.getElementById('nwm-node-picker')).toBeInTheDocument();
  expect(document.getElementById('nwm-link-picker')).toBeInTheDocument();
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

// #224: the editor must also repair current-version maps with missing nested
// settings — child forms read settings.tooltip/settings.scale directly.
test('renders the editor for a current-version map with missing settings (#224)', () => {
  const wm = JSON.parse(JSON.stringify(legacyWeathermap));
  wm.version = CURRENT_VERSION;
  delete wm.settings.tooltip;
  delete wm.settings.scale;
  const onChange = renderBuilder(wm);

  expect(screen.getByText('Tooltip Font Size')).toBeInTheDocument();
  expect(screen.getByText('Scale Title')).toBeInTheDocument();
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0][0].settings.tooltip).toBeDefined();
});

// #199: migration/defaulting must not mutate props.value and must not fire
// onChange during the render phase — only from an effect after commit.
describe('render purity (#199)', () => {
  test('migration does not mutate props.value', () => {
    const value = JSON.parse(JSON.stringify(legacyWeathermap));
    const snapshot = JSON.parse(JSON.stringify(value));

    const onChange = renderBuilder(value);

    expect(value).toEqual(snapshot);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).not.toBe(value);
  });

  test('migration persists via an effect, not during render', () => {
    // A parent that stores the value in state: onChange fired during the
    // render phase would make React log "Cannot update a component while
    // rendering a different component", and an unguarded effect would loop
    // into "Maximum update depth exceeded".
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const Parent = () => {
      const [wm, setWm] = React.useState<Weathermap>(() => JSON.parse(JSON.stringify(legacyWeathermap)));
      const props = {
        value: wm,
        onChange: setWm,
        context: { data: [] },
        item: { settings: { placeholder: '' } },
      } as unknown as StandardEditorProps<Weathermap, { placeholder: string }>;
      return <WeathermapBuilder {...props} />;
    };

    render(<Parent />);

    const renderPhaseErrors = errorSpy.mock.calls.filter(
      (c) => String(c[0]).includes('Cannot update a component') || String(c[0]).includes('Maximum update depth')
    );
    errorSpy.mockRestore();
    expect(renderPhaseErrors).toEqual([]);
    // The editor settles on the migrated value.
    expect(screen.getByText('Tooltip Font Size')).toBeInTheDocument();
  });
});

// The Grafana 13 "Status Color Target radio loses selection" bug was caused
// by duplicate element ids across the options pane (#167). Guard the whole
// editor: no two rendered elements may share an id, and radio inputs must
// all carry one.
test('editor renders no duplicate element ids (#167)', async () => {
  renderBuilder(getData(theme));

  // Expand the sections that mount id-carrying controls lazily.
  const picker = screen.getAllByRole('combobox')[0];
  fireEvent.keyDown(picker, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByText('Node A'));
  fireEvent.click(screen.getByText('Status'));
  fireEvent.click(screen.getByText('Advanced'));

  const ids = Array.from(document.querySelectorAll('[id]'))
    .map((el) => el.id)
    .filter((id) => id.length > 0);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  expect(duplicates).toEqual([]);

  for (const radio of screen.getAllByRole('radio')) {
    expect(radio.id).not.toBe('');
  }
});
