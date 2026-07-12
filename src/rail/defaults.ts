/**
 * Rail Operations mode defaults (#300). Factory functions return fresh objects
 * on every call so shared default state can never leak between panels.
 */
import { BGImageOptions } from 'types';
import { PLUGIN_ASSET_BASE } from 'utils';
import { MapLayer, RailOperationsConfig } from './types';

/** Well-known layer ids; renderers group entities by these. Order = paint order. */
export const RAIL_LAYER_IDS = {
  infrastructure: 'rail-infrastructure',
  controlPoints: 'rail-control-points',
  tracks: 'rail-tracks',
  blocks: 'rail-blocks',
  signals: 'rail-signals',
  switches: 'rail-switches',
  trains: 'rail-trains',
  routes: 'rail-routes',
  incidents: 'rail-incidents',
  labels: 'rail-labels',
  editorGuides: 'rail-editor-guides',
} as const;

const LAYER_DEFS: Array<Pick<MapLayer, 'id' | 'label'>> = [
  { id: RAIL_LAYER_IDS.infrastructure, label: 'Infrastructure' },
  { id: RAIL_LAYER_IDS.controlPoints, label: 'Control points' },
  { id: RAIL_LAYER_IDS.tracks, label: 'Tracks' },
  { id: RAIL_LAYER_IDS.blocks, label: 'Block boundaries' },
  { id: RAIL_LAYER_IDS.routes, label: 'Routes' },
  { id: RAIL_LAYER_IDS.switches, label: 'Switches & crossovers' },
  { id: RAIL_LAYER_IDS.signals, label: 'Signals' },
  { id: RAIL_LAYER_IDS.trains, label: 'Trains' },
  { id: RAIL_LAYER_IDS.incidents, label: 'Incidents & maintenance' },
  { id: RAIL_LAYER_IDS.labels, label: 'Labels' },
  { id: RAIL_LAYER_IDS.editorGuides, label: 'Editor guides' },
];

/** All layers visible and unlocked; editor guides render only in edit mode regardless. */
export function createDefaultRailLayers(): MapLayer[] {
  return LAYER_DEFS.map((def, i) => ({ ...def, visible: true, locked: false, zIndex: i }));
}

export function createDefaultRailConfig(): RailOperationsConfig {
  return {
    controlPoints: [],
    trackSegments: [],
    signals: [],
    switches: [],
    crossovers: [],
    trains: [],
    routes: [],
    incidents: [],
    layers: createDefaultRailLayers(),
  };
}

/**
 * Bundled baseline background (static context only: dark canvas, grid, safe
 * area, corridor/alignment guides — no tracks, stations, signals, trains, or
 * states). Shipped inside dist/ by the existing copy pipeline, so it works
 * air-gapped and is covered by plugin signing. The plugin id is fixed in
 * plugin.json, matching how bundled node icons are referenced (NodeForm).
 */
export const RAIL_BASELINE_BACKGROUND_URL = `${PLUGIN_ASSET_BASE}/img/rail/rail-plugin-base.svg`;

/** The one-click baseline preset: background attached to the canvas so it pans/zooms with the railway. */
export function createRailBaselineBackground(): BGImageOptions {
  return {
    url: RAIL_BASELINE_BACKGROUND_URL,
    fit: 'contain',
    attachToCanvas: true,
  };
}
