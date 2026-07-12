/**
 * Rail Operations root layer (#300, Phase 2). A self-contained SVG <g>
 * rendered inside the panel's pan/zoom transform group, so the baseline
 * background (attachToCanvas), zoom, pan, and SVG export all apply for free.
 *
 * Monitoring-only: everything here visualizes read-only telemetry. Renders
 * control points and physical track segments with layer visibility, zoom
 * gating, categorical states, tooltips, and drill-downs. Signals, switches,
 * crossovers, routes, and trains arrive in later phases.
 */
import React, { useMemo } from 'react';
import { MeasuredPolyline } from '../../geometry/polyline';
import { buildControlPointIndex, measureSegment } from '../geometry';
import { RAIL_LAYER_IDS } from '../defaults';
import { resolveRailQuery, resolveSegmentState, statusDefault } from '../queries';
import { MapLayer, RailOperationsConfig } from '../types';
import { RailControlPointGlyph, RailHoverTarget } from './RailControlPoint';
import { RailTrackSegmentLine } from './RailTrackSegment';

export interface RailLayerProps {
  config: RailOperationsConfig;
  frameMap: Map<string, number>;
  /** Current wheel-step zoom (higher = zoomed out), for layer min/max gating. */
  zoomScale: number;
  isEditMode: boolean;
  fontSizing: { node: number; link: number };
  neutralColor: string;
  labelColor: string;
  onHover: (target: RailHoverTarget, e: React.MouseEvent<SVGElement>) => void;
  onHoverLoss: (e: React.MouseEvent<SVGElement>) => void;
  onDrillDown: (rawLink: string) => void;
}

/**
 * A layer renders when visible and the zoom step is inside its optional
 * [minZoom, maxZoom] window (zoomScale grows when zooming OUT, matching
 * settings.link.labelHideZoom semantics).
 */
export const railLayerVisible = (layer: MapLayer | undefined, zoomScale: number, isEditMode: boolean): boolean => {
  if (!layer) {
    // Missing layer entries default to visible; normalization appends the
    // well-known set, so this only covers hand-built configs in tests.
    return true;
  }
  if (!layer.visible) {
    return false;
  }
  if (layer.id === RAIL_LAYER_IDS.editorGuides && !isEditMode) {
    return false;
  }
  if (layer.minZoom !== undefined && zoomScale < layer.minZoom) {
    return false;
  }
  if (layer.maxZoom !== undefined && zoomScale > layer.maxZoom) {
    return false;
  }
  return true;
};

export const RailLayer = ({
  config,
  frameMap,
  zoomScale,
  isEditMode,
  fontSizing,
  neutralColor,
  labelColor,
  onHover,
  onHoverLoss,
  onDrillDown,
}: RailLayerProps) => {
  // Static geometry: recomputed only when the rail config object changes
  // (normalizeWeathermap output is memoized upstream), not per data refresh.
  const controlPointIndex = useMemo(() => buildControlPointIndex(config.controlPoints), [config.controlPoints]);
  const measuredSegments = useMemo(() => {
    const measured = new Map<string, MeasuredPolyline>();
    for (const segment of config.trackSegments) {
      const m = measureSegment(segment, controlPointIndex);
      if (m) {
        measured.set(segment.id, m);
      }
      // Dangling/degenerate segments are skipped; validation reports them.
    }
    return measured;
  }, [config.trackSegments, controlPointIndex]);

  const layerById = useMemo(() => new Map(config.layers.map((l) => [l.id, l])), [config.layers]);
  const visible = (layerId: string) => railLayerVisible(layerById.get(layerId), zoomScale, isEditMode);

  const tracksVisible = visible(RAIL_LAYER_IDS.tracks);
  const controlPointsVisible = visible(RAIL_LAYER_IDS.controlPoints);
  const labelsVisible = visible(RAIL_LAYER_IDS.labels);

  const byZIndex = <T extends { zIndex?: number }>(entities: T[]): T[] =>
    [...entities].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  return (
    <g data-testid="rail-layer">
      {tracksVisible ? (
        <g data-testid="rail-tracks-layer">
          {byZIndex(config.trackSegments).map((segment) => {
            const measured = measuredSegments.get(segment.id);
            if (!measured) {
              return null;
            }
            return (
              <RailTrackSegmentLine
                key={segment.id || `segment-${config.trackSegments.indexOf(segment)}`}
                segment={segment}
                measured={measured}
                state={resolveSegmentState(segment, frameMap)}
                fontSize={fontSizing.link}
                showBlockLabels={labelsVisible}
                labelColor={labelColor}
                onHover={onHover}
                onHoverLoss={onHoverLoss}
              />
            );
          })}
        </g>
      ) : null}
      {controlPointsVisible ? (
        <g data-testid="rail-control-points-layer">
          {byZIndex(config.controlPoints).map((cp, i) => (
            <RailControlPointGlyph
              key={cp.id || `cp-${i}`}
              controlPoint={cp}
              state={resolveRailQuery(cp.statusQuery, undefined, frameMap, statusDefault)}
              fontSize={fontSizing.node}
              showLabel={labelsVisible}
              neutralColor={neutralColor}
              labelColor={labelColor}
              onHover={onHover}
              onHoverLoss={onHoverLoss}
              onDrillDown={onDrillDown}
            />
          ))}
        </g>
      ) : null}
      {/* The editor-guides layer gates baseline alignment helpers; the
          bundled background SVG carries the actual guide artwork, so nothing
          renders here yet. Signals/switches/trains: Phases 3-4. */}
    </g>
  );
};
