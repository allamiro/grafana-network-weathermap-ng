/**
 * Control point renderer (#300): stations, junctions, yards, depots, and
 * interlockings as compact operational glyphs — deliberately not the
 * passenger-map transfer-circle look. Shape varies with type so color is
 * never the only signal. Monitoring-only: click-through opens a drill-down
 * dashboard, nothing more.
 */
import React from 'react';
import { RailControlPoint as RailControlPointModel, RailHoverTarget } from '../types';
import { ResolvedRailState } from '../queries';

// Re-export for existing importers; the contract lives in ../types.
export type { RailHoverTarget };

interface Props {
  controlPoint: RailControlPointModel;
  state: ResolvedRailState | undefined;
  fontSize: number;
  showLabel: boolean;
  neutralColor: string;
  labelColor: string;
  /** Drill-downs are disabled in the panel editor, matching node/link behavior. */
  allowDrillDown: boolean;
  onHover: (target: RailHoverTarget, e: React.MouseEvent<SVGElement>) => void;
  onHoverLoss: (e: React.MouseEvent<SVGElement>) => void;
  onDrillDown: (rawLink: string) => void;
}

const GLYPH_RADIUS = 6;

export const RailControlPointGlyph = ({
  controlPoint,
  state,
  fontSize,
  showLabel,
  neutralColor,
  labelColor,
  allowDrillDown,
  onHover,
  onHoverLoss,
  onDrillDown,
}: Props) => {
  const [x, y] = controlPoint.position;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    // Validation reports non-finite positions; the renderer must simply skip.
    return null;
  }
  const color = state?.color ?? neutralColor;
  const r = GLYPH_RADIUS;

  const hoverTarget: RailHoverTarget = {
    title: controlPoint.label || controlPoint.id,
    lines: [
      `Type: ${controlPoint.type.replace('_', ' ')}`,
      ...(state ? [`Status: ${state.label ?? state.state}${state.value !== undefined ? ` (${state.value})` : ''}`] : []),
    ],
  };

  const drillDown = allowDrillDown && controlPoint.dashboardLink;
  const interactionProps = {
    onMouseMove: (e: React.MouseEvent<SVGElement>) => onHover(hoverTarget, e),
    onMouseOut: onHoverLoss,
    onClick: drillDown ? () => onDrillDown(controlPoint.dashboardLink!) : undefined,
    cursor: drillDown ? 'pointer' : undefined,
    'data-testid': 'rail-control-point',
    'data-rail-id': controlPoint.id,
  };

  let glyph: JSX.Element;
  switch (controlPoint.type) {
    case 'junction':
      // Diamond.
      glyph = (
        <polygon
          points={`${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`}
          fill={color}
          stroke={labelColor}
          strokeWidth={1}
          {...interactionProps}
        />
      );
      break;
    case 'interlocking':
      // Square.
      glyph = (
        <rect x={x - r} y={y - r} width={2 * r} height={2 * r} fill={color} stroke={labelColor} strokeWidth={1} {...interactionProps} />
      );
      break;
    case 'yard':
    case 'depot':
    case 'terminal':
      // Wide box.
      glyph = (
        <rect
          x={x - r * 1.6}
          y={y - r * 0.9}
          width={3.2 * r}
          height={1.8 * r}
          rx={2}
          fill={color}
          stroke={labelColor}
          strokeWidth={1}
          {...interactionProps}
        />
      );
      break;
    case 'station':
      // Circle with a heavier ring.
      glyph = <circle cx={x} cy={y} r={r} fill={color} stroke={labelColor} strokeWidth={1.5} {...interactionProps} />;
      break;
    default:
      // Plain control point: small circle.
      glyph = <circle cx={x} cy={y} r={r * 0.7} fill={color} stroke={labelColor} strokeWidth={1} {...interactionProps} />;
  }

  return (
    <g>
      {glyph}
      {showLabel && (controlPoint.label || controlPoint.shortLabel) ? (
        <text
          x={x}
          y={y - r - 3}
          textAnchor="middle"
          fontSize={fontSize}
          fill={labelColor}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
          data-testid="rail-control-point-label"
        >
          {controlPoint.shortLabel || controlPoint.label}
        </text>
      ) : null}
    </g>
  );
};
