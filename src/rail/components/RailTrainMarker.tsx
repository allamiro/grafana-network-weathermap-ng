/**
 * Train marker renderer (#300, Phase 4). An individually identified train
 * placed by segment + normalized progress along the segment's complete
 * polyline — never a traffic-flow particle. The marker is a rounded body
 * with a direction nose, optionally rotated to the local track tangent.
 * Stale telemetry dims the marker and dashes its outline (shape + pattern,
 * never color alone). Read-only: click-through opens a drill-down dashboard.
 */
import React from 'react';
import {
  getPointAtProgressMeasured,
  getTangentAtProgressMeasured,
  MeasuredPolyline,
} from '../../geometry/polyline';
import { RailHoverTarget, RailTrainMarker as RailTrainMarkerModel } from '../types';
import { ResolvedTrainTelemetry } from '../queries';

interface Props {
  train: RailTrainMarkerModel;
  telemetry: ResolvedTrainTelemetry;
  measured: MeasuredPolyline;
  fontSize: number;
  showLabel: boolean;
  labelColor: string;
  /** Smooth position updates (CSS transition) — gated by the panel's animation state. */
  motionEnabled: boolean;
  allowDrillDown: boolean;
  onHover: (target: RailHoverTarget, e: React.MouseEvent<SVGElement>) => void;
  onHoverLoss: (e: React.MouseEvent<SVGElement>) => void;
  onDrillDown: (rawLink: string) => void;
}

const BODY_LENGTH = 18;
const BODY_WIDTH = 8;

export const RailTrainMarkerGlyph = ({
  train,
  telemetry,
  measured,
  fontSize,
  showLabel,
  labelColor,
  motionEnabled,
  allowDrillDown,
  onHover,
  onHoverLoss,
  onDrillDown,
}: Props) => {
  if (telemetry.progress === undefined) {
    // Not placeable (no static or resolvable position): render nothing.
    return null;
  }
  const [x, y] = getPointAtProgressMeasured(measured, telemetry.progress);
  const [tx, ty] = getTangentAtProgressMeasured(measured, telemetry.progress);
  const rotate = train.rotate !== false;
  const angle = rotate ? (Math.atan2(ty, tx) * 180) / Math.PI : 0;

  const displayLabel = train.label || train.id;
  const drillDown = allowDrillDown && train.dashboardLink;
  const fmt = (v: number | undefined, unit: string) => (v === undefined ? undefined : `${v} ${unit}`);
  const hoverTarget: RailHoverTarget = {
    title: `Train ${displayLabel}`,
    lines: [
      `Segment: ${telemetry.segmentId} (${Math.round(telemetry.progress * 100)}%)`,
      ...(train.direction ? [`Direction: ${train.direction}`] : []),
      ...(fmt(telemetry.speed, 'km/h') ? [`Speed: ${fmt(telemetry.speed, 'km/h')}`] : []),
      ...(telemetry.delay !== undefined ? [`Delay: ${telemetry.delay}s`] : []),
      ...(telemetry.destination !== undefined ? [`Destination: ${telemetry.destination}`] : []),
      `State: ${telemetry.state.state}${telemetry.stale ? ' (stale telemetry)' : ''}`,
    ],
  };

  return (
    <g
      // Translate/rotate as a group transform: when motion is enabled the
      // compositor transitions between data refreshes. The PARENT keys this
      // component by train id + segment id, so a segment change remounts the
      // marker — a safe snap, never a teleport animation across the map.
      transform={`translate(${x}, ${y}) rotate(${angle})`}
      style={motionEnabled ? { transition: 'transform 0.8s linear' } : undefined}
      onMouseMove={(e) => onHover(hoverTarget, e)}
      onMouseOut={onHoverLoss}
      onClick={drillDown ? () => onDrillDown(train.dashboardLink!) : undefined}
      cursor={drillDown ? 'pointer' : undefined}
      data-testid="rail-train"
      data-rail-id={train.id}
      data-rail-segment={telemetry.segmentId}
      data-rail-state={telemetry.state.state}
      opacity={telemetry.stale ? 0.55 : 1}
    >
      <rect
        x={-BODY_LENGTH / 2}
        y={-BODY_WIDTH / 2}
        width={BODY_LENGTH}
        height={BODY_WIDTH}
        rx={3}
        fill={telemetry.state.color}
        stroke={labelColor}
        strokeWidth={1.2}
        strokeDasharray={telemetry.stale ? '3 2' : undefined}
      />
      {/* Direction nose. */}
      <polygon
        points={`${BODY_LENGTH / 2},${-BODY_WIDTH / 2} ${BODY_LENGTH / 2 + 5},0 ${BODY_LENGTH / 2},${BODY_WIDTH / 2}`}
        fill={telemetry.state.color}
        stroke={labelColor}
        strokeWidth={1}
      />
      {showLabel ? (
        <text
          // Counter-rotate so labels stay upright on rotated markers.
          transform={`rotate(${-angle})`}
          y={-BODY_WIDTH - 3}
          textAnchor="middle"
          fontSize={fontSize}
          fill={labelColor}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
          data-testid="rail-train-label"
        >
          {displayLabel}
        </text>
      ) : null}
    </g>
  );
};
