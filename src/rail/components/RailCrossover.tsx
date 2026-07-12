/**
 * Crossover renderer (#300, Phase 3). Read-only connector strokes between two
 * parallel track segments: single (one diagonal), double (two opposing
 * diagonals), scissors (both crossing). Availability drives the color; an
 * unavailable crossover renders dashed as well.
 */
import React from 'react';
import { getPointAtProgressMeasured, MeasuredPolyline } from '../../geometry/polyline';
import { RailCrossover as RailCrossoverModel, RailEntityState, RailHoverTarget } from '../types';
import { ResolvedRailState } from '../queries';

interface Props {
  crossover: RailCrossoverModel;
  measuredSegments: Map<string, MeasuredPolyline>;
  state: ResolvedRailState;
  onHover: (target: RailHoverTarget, e: React.MouseEvent<SVGElement>) => void;
  onHoverLoss: (e: React.MouseEvent<SVGElement>) => void;
}

const UNAVAILABLE_STATES: ReadonlySet<RailEntityState> = new Set<RailEntityState>([
  'blocked',
  'failed',
  'maintenance',
  'stale',
  'unknown',
  'no_data',
]);

export const RailCrossoverGlyph = ({ crossover, measuredSegments, state, onHover, onHoverLoss }: Props) => {
  const [aId, bId] = crossover.trackSegmentIds;
  const a = aId ? measuredSegments.get(aId) : undefined;
  const b = bId ? measuredSegments.get(bId) : undefined;
  if (!a || !b) {
    // Insufficient or dangling segments: validation reports, renderer skips.
    return null;
  }

  const connectors: Array<[number, number]> =
    crossover.geometry === 'single' ? [[0.45, 0.55]] : [[0.45, 0.55], [0.55, 0.45]];

  const hoverTarget: RailHoverTarget = {
    title: crossover.label || `Crossover ${crossover.id}`,
    lines: [`Geometry: ${crossover.geometry}`, `State: ${state.label ?? state.state}`],
  };

  return (
    <g
      onMouseMove={(e) => onHover(hoverTarget, e)}
      onMouseOut={onHoverLoss}
      data-testid="rail-crossover"
      data-rail-id={crossover.id}
      data-rail-state={state.state}
    >
      {connectors.map(([pa, pb], i) => {
        const [x1, y1] = getPointAtProgressMeasured(a, pa);
        const [x2, y2] = getPointAtProgressMeasured(b, pb);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={state.color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={UNAVAILABLE_STATES.has(state.state) ? '6 4' : undefined}
            data-testid="rail-crossover-connector"
          />
        );
      })}
    </g>
  );
};
