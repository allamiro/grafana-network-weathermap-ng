/**
 * Signal renderer (#300, Phase 3). Read-only visualization of a signal head
 * beside its track: pole from the track to a colored head at the configured
 * position along the segment polyline. Aspect and health compose by severity
 * (a failed head shows failed, never a stale aspect), and shape reinforces
 * color: failed heads carry an ✕, data-quality states render hollow.
 */
import React from 'react';
import {
  clampProgress,
  getPointAtProgressMeasured,
  getTangentAtProgressMeasured,
  MeasuredPolyline,
} from '../../geometry/polyline';
import { RailEntityState, RailHoverTarget, RailSignal as RailSignalModel } from '../types';
import { ResolvedRailState } from '../queries';

interface Props {
  signal: RailSignalModel;
  measured: MeasuredPolyline;
  state: ResolvedRailState;
  labelColor: string;
  onHover: (target: RailHoverTarget, e: React.MouseEvent<SVGElement>) => void;
  onHoverLoss: (e: React.MouseEvent<SVGElement>) => void;
}

const HEAD_RADIUS = 4;
const POLE_LENGTH = 10;
const HOLLOW_STATES: ReadonlySet<RailEntityState> = new Set<RailEntityState>(['stale', 'unknown', 'no_data']);

export const RailSignalGlyph = ({ signal, measured, state, labelColor, onHover, onHoverLoss }: Props) => {
  if (typeof signal.positionPercent !== 'number' || !Number.isFinite(signal.positionPercent)) {
    // Validation reports position-out-of-range; the renderer skips.
    return null;
  }
  const progress = clampProgress(signal.positionPercent);
  const [px, py] = getPointAtProgressMeasured(measured, progress);
  const [tx, ty] = getTangentAtProgressMeasured(measured, progress);
  // Signal stands on the left of the direction of travel.
  const [nx, ny] = [ty, -tx];
  const headX = px + nx * POLE_LENGTH;
  const headY = py + ny * POLE_LENGTH;
  const hollow = HOLLOW_STATES.has(state.state);

  const hoverTarget: RailHoverTarget = {
    title: signal.label || `Signal ${signal.id}`,
    lines: [
      `Aspect: ${state.label ?? state.state}${state.value !== undefined ? ` (${state.value})` : ''}`,
      `Facing: ${signal.facingDirection}`,
      `Position: ${Math.round(progress * 100)}% along ${signal.segmentId}`,
    ],
  };

  return (
    <g
      onMouseMove={(e) => onHover(hoverTarget, e)}
      onMouseOut={onHoverLoss}
      data-testid="rail-signal"
      data-rail-id={signal.id}
      data-rail-state={state.state}
    >
      <line x1={px} y1={py} x2={headX} y2={headY} stroke={labelColor} strokeWidth={1.2} />
      <circle
        cx={headX}
        cy={headY}
        r={HEAD_RADIUS}
        fill={hollow ? 'none' : state.color}
        stroke={hollow ? state.color : labelColor}
        strokeWidth={1.2}
        strokeDasharray={hollow ? '2 2' : undefined}
      />
      {state.state === 'failed' ? (
        <g stroke={labelColor} strokeWidth={1.4} data-testid="rail-signal-failed-mark">
          <line x1={headX - HEAD_RADIUS} y1={headY - HEAD_RADIUS} x2={headX + HEAD_RADIUS} y2={headY + HEAD_RADIUS} />
          <line x1={headX - HEAD_RADIUS} y1={headY + HEAD_RADIUS} x2={headX + HEAD_RADIUS} y2={headY - HEAD_RADIUS} />
        </g>
      ) : null}
    </g>
  );
};
