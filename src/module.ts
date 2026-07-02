import { PanelPlugin } from '@grafana/data';
import { config } from '@grafana/runtime';
import { SimpleOptions } from './types';
import { WeathermapPanel } from './WeathermapPanel';
import { WeathermapBuilder } from 'forms/WeathermapBuilder';
import { ExportForm } from 'forms/ExportForm';
import { CURRENT_VERSION, handleVersionedStateUpdates } from 'utils';

export const plugin = new PanelPlugin<SimpleOptions>(WeathermapPanel)
  .setMigrationHandler((panel) => {
    // Migrate options saved by older plugin versions when the panel model
    // loads, before the panel or its editor forms render (#162).
    const options = panel.options;
    const wm = options?.weathermap;
    if (wm && (!wm.version || wm.version !== CURRENT_VERSION)) {
      return { ...options, weathermap: handleVersionedStateUpdates(wm, config.theme2) };
    }
    return options ?? {};
  })
  .setPanelOptions((builder) => {
  return builder
    .addCustomEditor({
      id: 'weathermapEditor',
      path: 'weathermap',
      name: 'Edit Weathermap',
      description: 'Add, remove, and edit weathermap nodes and links.',
      editor: WeathermapBuilder,
      settings: {
        placeholder: 'This is my placeholder.',
      },
    })
    .addCustomEditor({
      id: 'exportForm',
      path: 'weathermap',
      name: 'Export Weathermap',
      description: `Export an SVG snapshot of the weathermap. The SVG exports show only links and nodes, for the entire panel please use Grafana's image renderer plugin.`,
      editor: ExportForm,
    });
});
