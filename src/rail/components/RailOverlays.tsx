/**
 * Route and incident/maintenance overlays (#300, Phase 3). Read-only washes
 * re-tracing the covered segments' full polylines: routes as a translucent
 * band (an established path through the topology), incidents/maintenance as
 * a dashed hazard band with a letter badge at the first segment's midpoint
 * (I = incident, M = maintenance, P = possession) so color is never the only
 * signal. Activation is data-driven via overlayActive: a torn-down route
 * whose query vanished renders nothing.
 */
import React from 'react';
import { getPointAtProgressMeasured, MeasuredPolyline } from '../../geometry/polyline';
import { RAIL_STATE_COLORS, RailHoverTarget, RailIncidentOverlay, RailRoute } from '../types';

interface CommonProps {
  measuredSegments: Map<string, MeasuredPolyline>;
  onHover: (target: RailHoverTarget, e: React.MouseEvent<SVGElement>) => void;
  onHoverLoss: (e: React.MouseEvent<SVGElement>) => void;
}

const OVERLAY_WIDTH = 10;

const coveredPolylines = (segmentIds: string[], measuredSegments: Map<string, MeasuredPolyline>) =>
  // Dedupe: a hand-authored list can repeat a segment, which would produce
  // duplicate React keys and double-count the tooltip's segment total.
  [...new Set(segmentIds)]
    .map((id) => ({ id, measured: measuredSegments.get(id) }))
    .filter((entry): entry is { id: string; measured: MeasuredPolyline } => entry.measured !== undefined);

export const RailRouteOverlay = ({
  route,
  measuredSegments,
  onHover,
  onHoverLoss,
}: CommonProps & { route: RailRoute }) => {
  const covered = coveredPolylines(route.segmentIds, measuredSegments);
  if (covered.length === 0) {
    return null;
  }
  const color = route.color || '#3B82F6';
  const hoverTarget: RailHoverTarget = {
    title: route.label || `Route ${route.id}`,
    lines: [`Segments: ${covered.length}${covered.length < route.segmentIds.length ? ` of ${route.segmentIds.length} (some missing)` : ''}`],
  };
  return (
    <g
      onMouseMove={(e) => onHover(hoverTarget, e)}
      onMouseOut={onHoverLoss}
      data-testid="rail-route"
      data-rail-id={route.id}
    >
      {covered.map(({ id, measured }) => (
        <polyline
          key={id}
          points={measured.points.map((p) => `${p[0]},${p[1]}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={OVERLAY_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.3}
        />
      ))}
    </g>
  );
};

const INCIDENT_BADGE: Record<RailIncidentOverlay['kind'], string> = {
  incident: 'I',
  maintenance: 'M',
  possession: 'P',
};

export const RailIncidentOverlayGlyph = ({
  incident,
  measuredSegments,
  labelColor,
  onHover,
  onHoverLoss,
}: CommonProps & { incident: RailIncidentOverlay; labelColor: string }) => {
  const covered = coveredPolylines(incident.segmentIds, measuredSegments);
  if (covered.length === 0) {
    return null;
  }
  const color = incident.kind === 'incident' ? RAIL_STATE_COLORS.failed : RAIL_STATE_COLORS.maintenance;
  const badgePos = getPointAtProgressMeasured(covered[0].measured, 0.5);
  const hoverTarget: RailHoverTarget = {
    title: incident.label || `${incident.kind} ${incident.id}`,
    lines: [`Kind: ${incident.kind}`, `Segments: ${covered.length}`],
  };
  return (
    <g
      onMouseMove={(e) => onHover(hoverTarget, e)}
      onMouseOut={onHoverLoss}
      data-testid="rail-incident"
      data-rail-id={incident.id}
      data-rail-kind={incident.kind}
    >
      {covered.map(({ id, measured }) => (
        <polyline
          key={id}
          points={measured.points.map((p) => `${p[0]},${p[1]}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={OVERLAY_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="6 6"
          opacity={0.45}
        />
      ))}
      <g data-testid="rail-incident-badge">
        <circle cx={badgePos[0]} cy={badgePos[1]} r={7} fill={color} stroke={labelColor} strokeWidth={1} />
        <text
          x={badgePos[0]}
          y={badgePos[1] + 3}
          textAnchor="middle"
          fontSize={9}
          fontWeight="bold"
          fill={labelColor}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {INCIDENT_BADGE[incident.kind]}
        </text>
      </g>
    </g>
  );
};
