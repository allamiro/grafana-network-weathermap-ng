/**
 * Switch/points renderer (#300, Phase 3). Read-only visualization of point
 * position: a base at the switch location with one leg toward each of the
 * normal and reverse paths. The commanded/detected leg draws solid and
 * heavy; the inactive leg thin and faded. Detection loss renders dashed
 * legs (alarm), a lock renders a square outline, and a failed machine
 * carries an ✕ — shape always reinforces color.
 */
import React from 'react';
import { getTangentAtProgressMeasured, MeasuredPolyline, PolylinePoint } from '../../geometry/polyline';
import { RailControlPoint, RailHoverTarget, RailSwitch as RailSwitchModel, RailTrackSegment } from '../types';
import { ResolvedSwitchState } from '../queries';

interface Props {
  railSwitch: RailSwitchModel;
  normalSegment: RailTrackSegment | undefined;
  reverseSegment: RailTrackSegment | undefined;
  measuredSegments: Map<string, MeasuredPolyline>;
  controlPointIndex: Map<string, RailControlPoint>;
  state: ResolvedSwitchState;
  labelColor: string;
  onHover: (target: RailHoverTarget, e: React.MouseEvent<SVGElement>) => void;
  onHoverLoss: (e: React.MouseEvent<SVGElement>) => void;
}

const LEG_LENGTH = 14;
const BASE_RADIUS = 3.5;

/**
 * The switch sits at its control point, or at the endpoint the two paths
 * share. Point and anchor id are resolved TOGETHER — leg directions must be
 * computed relative to the same control point the glyph is drawn at, even
 * when the configured controlPointId is dangling and the shared-endpoint
 * fallback engages (review fix: a mismatched pair pointed both legs ~180°
 * away from the pointwork).
 */
export function findSwitchAnchor(
  railSwitch: RailSwitchModel,
  normalSegment: RailTrackSegment | undefined,
  reverseSegment: RailTrackSegment | undefined,
  controlPointIndex: Map<string, RailControlPoint>
): { point: PolylinePoint; anchorId: string } | undefined {
  if (railSwitch.controlPointId) {
    const cp = controlPointIndex.get(railSwitch.controlPointId);
    if (cp && Number.isFinite(cp.position[0]) && Number.isFinite(cp.position[1])) {
      return { point: [cp.position[0], cp.position[1]], anchorId: railSwitch.controlPointId };
    }
    // Dangling/NaN control point: fall through to the shared endpoint.
  }
  if (!normalSegment || !reverseSegment) {
    return undefined;
  }
  const reverseEnds = [reverseSegment.fromControlPointId, reverseSegment.toControlPointId];
  const shared = [normalSegment.fromControlPointId, normalSegment.toControlPointId].find(
    (id) => id && reverseEnds.includes(id)
  );
  if (!shared) {
    return undefined;
  }
  const cp = controlPointIndex.get(shared);
  if (!cp || !Number.isFinite(cp.position[0]) || !Number.isFinite(cp.position[1])) {
    return undefined;
  }
  return { point: [cp.position[0], cp.position[1]], anchorId: shared };
}

/** Unit direction pointing away from the switch along a segment. */
function legDirection(
  segment: RailTrackSegment | undefined,
  measuredSegments: Map<string, MeasuredPolyline>,
  switchControlPointId: string | undefined
): PolylinePoint | undefined {
  if (!segment) {
    return undefined;
  }
  const measured = measuredSegments.get(segment.id);
  if (!measured) {
    return undefined;
  }
  if (segment.toControlPointId === switchControlPointId && segment.fromControlPointId !== switchControlPointId) {
    // Switch sits at the segment's far end: walk backward.
    const [tx, ty] = getTangentAtProgressMeasured(measured, 1);
    return [-tx, -ty];
  }
  return getTangentAtProgressMeasured(measured, 0);
}

export const RailSwitchGlyph = ({
  railSwitch,
  normalSegment,
  reverseSegment,
  measuredSegments,
  controlPointIndex,
  state,
  labelColor,
  onHover,
  onHoverLoss,
}: Props) => {
  const anchor = findSwitchAnchor(railSwitch, normalSegment, reverseSegment, controlPointIndex);
  if (!anchor) {
    // Dangling references: validation reports, renderer skips.
    return null;
  }
  const [x, y] = anchor.point;
  const anchorId = anchor.anchorId;

  const legs: Array<{ segment: RailTrackSegment | undefined; active: boolean; testid: string }> = [
    { segment: normalSegment, active: state.position === 'normal', testid: 'rail-switch-leg-normal' },
    { segment: reverseSegment, active: state.position === 'reverse', testid: 'rail-switch-leg-reverse' },
  ];

  const hoverTarget: RailHoverTarget = {
    title: railSwitch.label || `Switch ${railSwitch.id}`,
    lines: [
      `Position: ${state.position}`,
      `Detected: ${state.detected ? 'yes' : 'NO'}`,
      ...(state.locked ? ['Locked'] : []),
      `State: ${state.state}`,
    ],
  };

  return (
    <g
      onMouseMove={(e) => onHover(hoverTarget, e)}
      onMouseOut={onHoverLoss}
      data-testid="rail-switch"
      data-rail-id={railSwitch.id}
      data-rail-position={state.position}
      data-rail-state={state.state}
    >
      {legs.map(({ segment, active, testid }) => {
        const dir = legDirection(segment, measuredSegments, anchorId);
        if (!dir) {
          return null;
        }
        return (
          <line
            key={testid}
            x1={x}
            y1={y}
            x2={x + dir[0] * LEG_LENGTH}
            y2={y + dir[1] * LEG_LENGTH}
            stroke={active ? state.color : labelColor}
            strokeWidth={active ? 3 : 1}
            opacity={active ? 1 : 0.45}
            strokeDasharray={state.detected ? undefined : '3 3'}
            data-testid={testid}
            data-rail-active={active ? 'true' : 'false'}
          />
        );
      })}
      <circle cx={x} cy={y} r={BASE_RADIUS} fill={state.color} stroke={labelColor} strokeWidth={1} />
      {state.locked ? (
        <rect
          x={x - BASE_RADIUS - 2.5}
          y={y - BASE_RADIUS - 2.5}
          width={2 * BASE_RADIUS + 5}
          height={2 * BASE_RADIUS + 5}
          fill="none"
          stroke={labelColor}
          strokeWidth={1}
          data-testid="rail-switch-lock"
        />
      ) : null}
      {state.state === 'failed' ? (
        <g stroke={labelColor} strokeWidth={1.4} data-testid="rail-switch-failed-mark">
          <line x1={x - BASE_RADIUS} y1={y - BASE_RADIUS} x2={x + BASE_RADIUS} y2={y + BASE_RADIUS} />
          <line x1={x - BASE_RADIUS} y1={y + BASE_RADIUS} x2={x + BASE_RADIUS} y2={y - BASE_RADIUS} />
        </g>
      ) : null}
    </g>
  );
};
