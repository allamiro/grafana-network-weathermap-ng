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

// Multi-car consist, mimic-board style: a short row of rounded cars with a
// small direction nose on the lead car.
const CAR_COUNT = 4;
const CAR_LENGTH = 7;
const CAR_GAP = 1.5;
const CAR_WIDTH = 7;
const BODY_LENGTH = CAR_COUNT * CAR_LENGTH + (CAR_COUNT - 1) * CAR_GAP;
const BODY_WIDTH = CAR_WIDTH;
/**
 * Position glide between data refreshes. Long enough that a typical dashboard
 * refresh cadence (5s) reads as a continuous crawl along the line rather than
 * discrete hops (which also visibly cut corners at path bends).
 */
const MOTION_TRANSITION = 'transform 4.5s linear';

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
      // Translate/rotate as a CSS transform (px = SVG user units), NOT the
      // SVG transform attribute: CSS transitions reliably animate the CSS
      // property across engines, while attribute-driven transitions have
      // long-standing WebKit gaps. When motion is enabled the compositor
      // transitions between data refreshes. The PARENT keys this component
      // by train id + segment id, so a segment change remounts the marker —
      // a safe snap, never a teleport animation across the map.
      style={{
        transform: `translate(${x}px, ${y}px) rotate(${angle}deg)`,
        ...(motionEnabled ? { transition: MOTION_TRANSITION } : {}),
      }}
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
      {Array.from({ length: CAR_COUNT }, (_, car) => (
        <rect
          key={car}
          x={-BODY_LENGTH / 2 + car * (CAR_LENGTH + CAR_GAP)}
          y={-BODY_WIDTH / 2}
          width={CAR_LENGTH}
          height={BODY_WIDTH}
          rx={2}
          fill={telemetry.state.color}
          stroke={labelColor}
          strokeWidth={1}
          strokeDasharray={telemetry.stale ? '3 2' : undefined}
        />
      ))}
      {/* Direction nose on the lead car. */}
      <polygon
        points={`${BODY_LENGTH / 2},${-BODY_WIDTH / 2} ${BODY_LENGTH / 2 + 4},0 ${BODY_LENGTH / 2},${BODY_WIDTH / 2}`}
        fill={telemetry.state.color}
        stroke={labelColor}
        strokeWidth={1}
      />
      {showLabel ? (
        <text
          // Counter-rotate so labels stay upright on rotated markers (static
          // attribute is fine here — the label itself is not transitioned).
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
