import { PanelPlugin, PanelModel } from '@grafana/data';
import { plugin } from './module';
import { SimpleOptions, Weathermap } from './types';
import { CURRENT_VERSION } from 'utils';

// Mirrors the shape of weathermaps saved before options schema v14 (e.g. the
// bundled test dashboard): no version field and no tooltip/scale settings.
export const legacyWeathermap = {
  id: 'legacy-weathermap',
  nodes: [],
  links: [],
  scale: {
    '10': '#73BF69',
    '50': '#C4162A',
  },
  settings: {
    fontSizing: {
      link: 7,
      node: 10,
    },
    linkArrow: {
      height: 10,
      offset: 2,
      width: 8,
    },
    link: {
      label: {
        background: 'rgba(204, 204, 220, 0.1)',
        border: 'rgba(204, 204, 220, 0.25)',
        font: 'rgb(204, 204, 220)',
      },
      spacing: {
        horizontal: 10,
        vertical: 5,
      },
      stroke: {
        color: 'rgba(204, 204, 220, 0.1)',
      },
    },
    panel: {
      backgroundColor: '#ffffff',
      panelSize: {
        width: 600,
        height: 600,
      },
    },
  },
} as unknown as Weathermap;

describe('Network Weathermap', () => {
  it('Should be instance of PanelPlugin', () => {
    expect(plugin).toBeInstanceOf(PanelPlugin);
  });

  describe('migration handler', () => {
    it('backfills settings missing from pre-v14 saved options (#162)', () => {
      const panel = {
        options: { weathermap: JSON.parse(JSON.stringify(legacyWeathermap)) },
      } as PanelModel<SimpleOptions>;

      const migrated = plugin.onPanelMigration!(panel) as SimpleOptions;

      expect(migrated.weathermap.version).toBe(CURRENT_VERSION);
      expect(migrated.weathermap.settings.tooltip.backgroundColor).toBeDefined();
      expect(migrated.weathermap.settings.tooltip.fontSize).toBeDefined();
      expect(migrated.weathermap.settings.scale.size.width).toBeDefined();
      expect(migrated.weathermap.settings.scale.position.x).toBeDefined();
      // Pre-existing settings survive the merge.
      expect(migrated.weathermap.settings.fontSizing.link).toBe(7);
      expect(migrated.weathermap.settings.panel.panelSize.width).toBe(600);
    });

    it('converts the old object-style scale to the array format', () => {
      const panel = {
        options: { weathermap: JSON.parse(JSON.stringify(legacyWeathermap)) },
      } as PanelModel<SimpleOptions>;

      const migrated = plugin.onPanelMigration!(panel) as SimpleOptions;

      expect(Array.isArray(migrated.weathermap.scale)).toBe(true);
      expect(migrated.weathermap.scale).toContainEqual({ percent: 10, color: '#73BF69' });
    });

    it('leaves current-version options and empty panels untouched', () => {
      const current = JSON.parse(JSON.stringify(legacyWeathermap));
      current.version = CURRENT_VERSION;
      const panel = { options: { weathermap: current } } as PanelModel<SimpleOptions>;
      expect(plugin.onPanelMigration!(panel)).toBe(panel.options);

      const emptyPanel = {} as PanelModel<SimpleOptions>;
      expect(plugin.onPanelMigration!(emptyPanel)).toEqual({});
    });
  });
});
