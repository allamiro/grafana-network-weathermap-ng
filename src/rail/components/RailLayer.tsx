/**
 * Rail Operations root layer (#300, Phases 2-3). A self-contained SVG <g>
 * rendered inside the panel's pan/zoom transform group, so the baseline
 * background (attachToCanvas), zoom, pan, and SVG export all apply for free.
 *
 * Monitoring-only: everything here visualizes read-only telemetry. Renders
 * control points, physical track segments, signals, switches, crossovers,
 * and route/incident overlays with layer visibility, zoom gating,
 * categorical states, tooltips, and drill-downs. Trains arrive in Phase 4.
 */
import React, { useMemo } from 'react';
import { MeasuredPolyline } from '../../geometry/polyline';
import { buildControlPointIndex, measureSegment } from '../geometry';
import { createDefaultRailLayers, RAIL_LAYER_IDS } from '../defaults';
import {
  availabilityDefault,
  overlayActive,
  resolveRailQuery,
  resolveSegmentState,
  resolveSignalState,
  resolveSwitchState,
  resolveTrainTelemetry,
  statusDefault,
} from '../queries';
import { MapLayer, RailHoverTarget, RailOperationsConfig, RailTrackSegment } from '../types';
import { RailControlPointGlyph } from './RailControlPoint';
import { RailCrossoverGlyph } from './RailCrossover';
import { RailIncidentOverlayGlyph, RailRouteOverlay } from './RailOverlays';
import { RailSignalGlyph } from './RailSignal';
import { RailSwitchGlyph } from './RailSwitch';
import { RailTrackSegmentLine } from './RailTrackSegment';
import { RailTrainMarkerGlyph } from './RailTrainMarker';

export interface RailLayerProps {
  config: RailOperationsConfig;
  frameMap: Map<string, number>;
  /** Current wheel-step zoom (higher = zoomed out), for layer min/max gating. */
  zoomScale: number;
  isEditMode: boolean;
  /**
   * Whether smooth train motion is allowed — the panel's animationActive
   * gate (master switch, reduced motion, edit-mode pause, timeline scrub).
   */
  motionEnabled: boolean;
  /**
   * Cap on smoothly-animated train markers. Uses the same VALUE as
   * settings.animation.maxAnimatedLinks but is applied independently of the
   * link-particle budget. Highest-zIndex (most prominent) trains animate
   * first.
   */
  maxAnimated: number;
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

/** Canonical paint order fallback for layers missing from a saved config. */
const DEFAULT_LAYER_ORDER = new Map(createDefaultRailLayers().map((l, i) => [l.id, i]));

/** Sort entities by zIndex, keeping each entry's ORIGINAL index for stable keys. */
const byZIndexIndexed = <T extends { zIndex?: number }>(entities: T[]): Array<{ entity: T; index: number }> =>
  entities
    .map((entity, index) => ({ entity, index }))
    .sort((a, b) => (a.entity.zIndex ?? 0) - (b.entity.zIndex ?? 0) || a.index - b.index);

export const RailLayer = ({
  config,
  frameMap,
  zoomScale,
  isEditMode,
  motionEnabled,
  maxAnimated,
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
  // Per-index measurement: every segment renders its OWN geometry even when
  // ids are missing ('' after normalization) or duplicated — id collisions
  // must not make one track silently draw another's polyline.
  const measuredByIndex = useMemo(
    () => config.trackSegments.map((segment) => measureSegment(segment, controlPointIndex)),
    [config.trackSegments, controlPointIndex]
  );
  // Reference lookups (signals/switches/crossovers/overlays) resolve by id,
  // first occurrence wins — the same rule as buildControlPointIndex and the
  // duplicate-id validation report.
  const measuredSegments = useMemo(() => {
    const measured = new Map<string, MeasuredPolyline>();
    config.trackSegments.forEach((segment, i) => {
      const m = measuredByIndex[i];
      if (m && segment.id && !measured.has(segment.id)) {
        measured.set(segment.id, m);
      }
      // Dangling/degenerate segments are skipped; validation reports them.
    });
    return measured;
  }, [config.trackSegments, measuredByIndex]);
  const segmentById = useMemo(() => {
    const map = new Map<string, RailTrackSegment>();
    for (const s of config.trackSegments) {
      if (s.id && !map.has(s.id)) {
        map.set(s.id, s);
      }
    }
    return map;
  }, [config.trackSegments]);
  const knownSegmentIds = useMemo(() => new Set(segmentById.keys()), [segmentById]);

  const layerById = useMemo(() => new Map(config.layers.map((l) => [l.id, l])), [config.layers]);
  const visible = (layerId: string) => railLayerVisible(layerById.get(layerId), zoomScale, isEditMode);
  const labelsVisible = visible(RAIL_LAYER_IDS.labels);

  // Each populated layer becomes one <g>, painted in layer zIndex order so a
  // user-reordered layer stack is honored (canonical order as fallback).
  const layerGroups: Array<{ layerId: string; render: () => JSX.Element }> = [];

  if (visible(RAIL_LAYER_IDS.tracks)) {
    layerGroups.push({
      layerId: RAIL_LAYER_IDS.tracks,
      render: () => (
        <g key={RAIL_LAYER_IDS.tracks} data-testid="rail-tracks-layer">
          {byZIndexIndexed(config.trackSegments).map(({ entity: segment, index }) => {
            const measured = measuredByIndex[index];
            if (!measured) {
              return null;
            }
            return (
              <RailTrackSegmentLine
                key={`${segment.id || 'segment'}-${index}`}
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
      ),
    });
  }

  if (visible(RAIL_LAYER_IDS.routes) && config.routes.length > 0) {
    layerGroups.push({
      layerId: RAIL_LAYER_IDS.routes,
      render: () => (
        <g key={RAIL_LAYER_IDS.routes} data-testid="rail-routes-layer">
          {byZIndexIndexed(config.routes).map(({ entity: route, index }) =>
            overlayActive(route.stateQuery, frameMap) ? (
              <RailRouteOverlay
                key={`${route.id || 'route'}-${index}`}
                route={route}
                measuredSegments={measuredSegments}
                onHover={onHover}
                onHoverLoss={onHoverLoss}
              />
            ) : null
          )}
        </g>
      ),
    });
  }

  if (visible(RAIL_LAYER_IDS.incidents) && config.incidents.length > 0) {
    layerGroups.push({
      layerId: RAIL_LAYER_IDS.incidents,
      render: () => (
        <g key={RAIL_LAYER_IDS.incidents} data-testid="rail-incidents-layer">
          {byZIndexIndexed(config.incidents).map(({ entity: incident, index }) =>
            overlayActive(incident.stateQuery, frameMap) ? (
              <RailIncidentOverlayGlyph
                key={`${incident.id || 'incident'}-${index}`}
                incident={incident}
                measuredSegments={measuredSegments}
                labelColor={labelColor}
                onHover={onHover}
                onHoverLoss={onHoverLoss}
              />
            ) : null
          )}
        </g>
      ),
    });
  }

  if (visible(RAIL_LAYER_IDS.switches) && (config.switches.length > 0 || config.crossovers.length > 0)) {
    layerGroups.push({
      layerId: RAIL_LAYER_IDS.switches,
      render: () => (
        <g key={RAIL_LAYER_IDS.switches} data-testid="rail-switches-layer">
          {byZIndexIndexed(config.crossovers).map(({ entity: crossover, index }) => (
            <RailCrossoverGlyph
              key={`${crossover.id || 'crossover'}-${index}`}
              crossover={crossover}
              measuredSegments={measuredSegments}
              state={
                resolveRailQuery(crossover.stateQuery, undefined, frameMap, availabilityDefault) ?? {
                  state: 'normal',
                  color: neutralColor,
                }
              }
              onHover={onHover}
              onHoverLoss={onHoverLoss}
            />
          ))}
          {byZIndexIndexed(config.switches).map(({ entity: railSwitch, index }) => (
            <RailSwitchGlyph
              key={`${railSwitch.id || 'switch'}-${index}`}
              railSwitch={railSwitch}
              normalSegment={segmentById.get(railSwitch.normalSegmentId)}
              reverseSegment={segmentById.get(railSwitch.reverseSegmentId)}
              measuredSegments={measuredSegments}
              controlPointIndex={controlPointIndex}
              state={resolveSwitchState(railSwitch, frameMap)}
              labelColor={labelColor}
              onHover={onHover}
              onHoverLoss={onHoverLoss}
            />
          ))}
        </g>
      ),
    });
  }

  if (visible(RAIL_LAYER_IDS.signals) && config.signals.length > 0) {
    layerGroups.push({
      layerId: RAIL_LAYER_IDS.signals,
      render: () => (
        <g key={RAIL_LAYER_IDS.signals} data-testid="rail-signals-layer">
          {byZIndexIndexed(config.signals).map(({ entity: signal, index }) => {
            const measured = signal.segmentId ? measuredSegments.get(signal.segmentId) : undefined;
            if (!measured) {
              return null;
            }
            return (
              <RailSignalGlyph
                key={`${signal.id || 'signal'}-${index}`}
                signal={signal}
                measured={measured}
                state={resolveSignalState(signal, frameMap)}
                labelColor={labelColor}
                onHover={onHover}
                onHoverLoss={onHoverLoss}
              />
            );
          })}
        </g>
      ),
    });
  }

  if (visible(RAIL_LAYER_IDS.trains) && config.trains.length > 0) {
    layerGroups.push({
      layerId: RAIL_LAYER_IDS.trains,
      render: () => (
        <g key={RAIL_LAYER_IDS.trains} data-testid="rail-trains-layer">
          {byZIndexIndexed(config.trains).map(({ entity: train, index }, sortedIndex, sorted) => {
            const telemetry = resolveTrainTelemetry(train, frameMap, knownSegmentIds);
            const measured = telemetry.segmentId ? measuredSegments.get(telemetry.segmentId) : undefined;
            if (!measured) {
              // Missing/deleted segment or no position: never a crash, never
              // a guessed placement. Validation reports static dangling refs.
              return null;
            }
            return (
              <RailTrainMarkerGlyph
                // Keyed by train + segment: a segment change REMOUNTS the
                // marker, so motion transitions never teleport across the map.
                key={`${train.id || 'train'}-${index}-${telemetry.segmentId}`}
                train={train}
                telemetry={telemetry}
                measured={measured}
                fontSize={fontSizing.node}
                showLabel={labelsVisible}
                labelColor={labelColor}
                motionEnabled={motionEnabled && sorted.length - sortedIndex <= maxAnimated}
                allowDrillDown={!isEditMode}
                onHover={onHover}
                onHoverLoss={onHoverLoss}
                onDrillDown={onDrillDown}
              />
            );
          })}
        </g>
      ),
    });
  }

  if (visible(RAIL_LAYER_IDS.controlPoints)) {
    layerGroups.push({
      layerId: RAIL_LAYER_IDS.controlPoints,
      render: () => (
        <g key={RAIL_LAYER_IDS.controlPoints} data-testid="rail-control-points-layer">
          {byZIndexIndexed(config.controlPoints).map(({ entity: cp, index }) => (
            <RailControlPointGlyph
              key={`${cp.id || 'cp'}-${index}`}
              controlPoint={cp}
              state={resolveRailQuery(cp.statusQuery, undefined, frameMap, statusDefault)}
              fontSize={fontSizing.node}
              showLabel={labelsVisible}
              neutralColor={neutralColor}
              labelColor={labelColor}
              allowDrillDown={!isEditMode}
              onHover={onHover}
              onHoverLoss={onHoverLoss}
              onDrillDown={onDrillDown}
            />
          ))}
        </g>
      ),
    });
  }

  const layerOrder = (layerId: string) =>
    layerById.get(layerId)?.zIndex ?? DEFAULT_LAYER_ORDER.get(layerId) ?? 0;
  layerGroups.sort((a, b) => layerOrder(a.layerId) - layerOrder(b.layerId));

  return (
    <g data-testid="rail-layer">
      {layerGroups.map((group) => group.render())}
      {/* The editor-guides layer gates baseline alignment helpers; the
          bundled background SVG carries the actual guide artwork, so nothing
          renders here yet. */}
    </g>
  );
};
