/**
 * Track segment renderer (#300): one polyline per PHYSICAL track, following
 * the complete ordered geometry (endpoints derive from control points, via
 * points in between — never the endpoint chord). Direction chevrons and an
 * optional block label ride the same measured path. States are categorical
 * (occupied/blocked/failed/...), never bandwidth percentages, and a state
 * change alters dash pattern as well as color so color is not the only
 * signal.
 */
import React from 'react';
import {
  getPointAtProgressMeasured,
  getTangentAtProgressMeasured,
  MeasuredPolyline,
} from '../../geometry/polyline';
import { RailTrackSegment as RailTrackSegmentModel } from '../types';
import { ResolvedRailState } from '../queries';
import { RailHoverTarget } from './RailControlPoint';

interface Props {
  segment: RailTrackSegmentModel;
  measured: MeasuredPolyline;
  state: ResolvedRailState;
  fontSize: number;
  showBlockLabels: boolean;
  labelColor: string;
  onHover: (target: RailHoverTarget, e: React.MouseEvent<SVGElement>) => void;
  onHoverLoss: (e: React.MouseEvent<SVGElement>) => void;
}

const DEFAULT_STROKE = 4;
/** States rendered with a dashed pattern in addition to their color. */
const DASHED_STATES = new Set(['blocked', 'failed', 'maintenance', 'stale', 'unknown', 'no_data']);
const CHEVRON_POSITIONS = [0.25, 0.5, 0.75];

export const RailTrackSegmentLine = ({
  segment,
  measured,
  state,
  fontSize,
  showBlockLabels,
  labelColor,
  onHover,
  onHoverLoss,
}: Props) => {
  const strokeWidth =
    typeof segment.strokeWidth === 'number' && Number.isFinite(segment.strokeWidth) && segment.strokeWidth > 0
      ? segment.strokeWidth
      : DEFAULT_STROKE;

  const hoverTarget: RailHoverTarget = {
    title: `Track ${segment.trackNumber || '?'} — ${segment.id}`,
    lines: [
      ...(segment.blockId ? [`Block: ${segment.blockId}`] : []),
      `Direction: ${segment.direction}`,
      `State: ${state.label ?? state.state}${state.value !== undefined ? ` (${state.value})` : ''}`,
    ],
  };

  const pointsAttr = measured.points.map((p) => `${p[0]},${p[1]}`).join(' ');
  const mid = getPointAtProgressMeasured(measured, 0.5);

  return (
    <g>
      <polyline
        points={pointsAttr}
        fill="none"
        stroke={state.color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={DASHED_STATES.has(state.state) ? '8 5' : undefined}
        onMouseMove={(e) => onHover(hoverTarget, e)}
        onMouseOut={onHoverLoss}
        data-testid="rail-track"
        data-rail-id={segment.id}
        data-rail-state={state.state}
      />
      {segment.direction !== 'bidirectional' && measured.totalLength > 0
        ? CHEVRON_POSITIONS.map((progress, i) => {
            const [px, py] = getPointAtProgressMeasured(measured, progress);
            const [tx, ty] = getTangentAtProgressMeasured(measured, progress);
            const angle = (Math.atan2(ty, tx) * 180) / Math.PI;
            const size = Math.max(3, strokeWidth);
            return (
              <path
                key={i}
                d={`M ${-size} ${-size} L ${size * 0.8} 0 L ${-size} ${size}`}
                fill="none"
                stroke={labelColor}
                strokeWidth={1.5}
                strokeLinecap="round"
                transform={`translate(${px}, ${py}) rotate(${angle})`}
                style={{ pointerEvents: 'none' }}
                data-testid="rail-direction-marker"
              />
            );
          })
        : null}
      {showBlockLabels && segment.showLabel !== false && segment.blockId ? (
        <text
          x={mid[0]}
          y={mid[1] - strokeWidth - 3}
          textAnchor="middle"
          fontSize={fontSize}
          fill={labelColor}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
          data-testid="rail-block-label"
        >
          {segment.blockId}
        </text>
      ) : null}
    </g>
  );
};
