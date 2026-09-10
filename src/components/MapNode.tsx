import React, { useMemo, useRef } from 'react';
import { DrawnNode, Weathermap } from '../types';
import {
  nearestMultiple,
  measureText,
  getSolidFromAlphaColor,
  calculateRectangleAutoWidth,
  calculateRectangleAutoHeight,
  getTimeField,
  getValueSeries,
  sanitizeUrl,
  sampleAtTime,
  isLayerVisible,
} from '../utils';
import { css } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import { DraggableCore, DraggableEventHandler } from 'react-draggable';
import { PanelData } from '@grafana/data';

interface NodeProps {
  node: DrawnNode;
  draggedNode: DrawnNode;
  selectedNodes: DrawnNode[];
  wm: Weathermap;
  onDrag: DraggableEventHandler;
  onStop: DraggableEventHandler;
  onClick: React.MouseEventHandler<SVGGElement>;
  onMouseMove?: React.MouseEventHandler<SVGGElement>;
  onMouseLeave?: React.MouseEventHandler<SVGGElement>;
  onContextMenu?: React.MouseEventHandler<SVGGElement>;
  disabled: boolean;
  data: PanelData;
  // Timeline scrub position (ms) or null/undefined for live. When set, node
  // status replays the value at that time — matching link value behavior (#201).
  scrubTimeMs?: number | null;
}

// Calculate the middle of the rectangle for text centering
function calculateTextY(d: DrawnNode) {
  return d.nodeIcon?.drawInside ? d.nodeIcon.size.height / 2 + d.nodeIcon.padding.vertical : 0;
}

// Find where to draw the rectangle for the node (top left x)
function calculateRectX(d: DrawnNode, wm: Weathermap) {
  const offset = Math.min(
    -calculateRectangleAutoWidth(d, wm) / 2,
    d.label !== undefined
      ? -(measureText(d.label, d.fontSize ?? wm.settings.fontSizing.node).width / 2 + d.padding.horizontal)
      : 0
  );
  return offset;
}

// Find where to draw the rectangle for the node (top left y)
function calculateRectY(d: DrawnNode, wm: Weathermap) {
  return -calculateRectangleAutoHeight(d, wm) / 2;
}

const MapNode: React.FC<NodeProps> = (props: NodeProps) => {
  const { node, draggedNode, selectedNodes, wm, onDrag, onStop, onClick, onMouseMove, onMouseLeave, onContextMenu, disabled, data, scrubTimeMs } =
    props;
  const styles = useStyles2(getStyles);

  // React 19 removed ReactDOM.findDOMNode, which react-draggable falls back to
  // when no nodeRef is provided. Passing an explicit nodeRef avoids that crash.
  const nodeRef = useRef<SVGGElement>(null);

  const rectX = useMemo(() => calculateRectX(node, wm), [node, wm]);
  const rectY = useMemo(() => calculateRectY(node, wm), [node, wm]);
  const rectWidth = useMemo(() => calculateRectangleAutoWidth(node, wm), [node, wm]);
  const rectHeight = useMemo(() => calculateRectangleAutoHeight(node, wm), [node, wm]);
  const textY = useMemo(() => calculateTextY(node), [node]);

  let nodeStatusColor: string | null = null;
  if (node.statusQuery) {
    const matches: Array<number | null | undefined> = [];
    for (const frame of data.series) {
      // A transient empty or valueless frame (fresh exporter, scrape gap,
      // regex matching nothing) must not take down the whole panel (#178) —
      // series resolution throws for frames without a value field. Wide
      // frames carry one bindable series per value field (#260).
      try {
        for (const { name, field } of getValueSeries(frame, data.series)) {
          if (name !== node.statusQuery) {
            continue;
          }
          // Timeline scrubbing (#201): while scrubbing, node status replays
          // the raw value at the selected time (step-hold like link values,
          // but without their throughput negative-clamp — negative status
          // values are legitimate mapping inputs and must resolve like live
          // mode). Live mode keeps reading the most recent datapoint.
          if (scrubTimeMs !== null && scrubTimeMs !== undefined) {
            matches.push(
              sampleAtTime(
                getTimeField(frame)?.values as Array<number | null | undefined>,
                field.values as Array<number | null | undefined>,
                scrubTimeMs
              )
            );
          } else {
            matches.push(field.values[field.values.length - 1]);
          }
        }
      } catch (e) {
        continue;
      }
    }

    // A null sample (no data at that instant) is treated as missing.
    const rawValue = matches.length > 0 ? matches[0] ?? undefined : undefined;

    if (rawValue === undefined) {
      nodeStatusColor = node.colors.statusDown;
    } else if (node.statusValueMappings && node.statusValueMappings.length > 0) {
      // Threshold matching: apply the highest threshold whose value <= rawValue
      const sorted = [...node.statusValueMappings].sort((a, b) => a.value - b.value);
      const match = sorted.filter((m) => m.value <= rawValue).pop();
      nodeStatusColor = match ? match.color : null;
    } else {
      nodeStatusColor = rawValue < 1 ? node.colors.statusDown : null;
    }
  }

  const colorTarget = node.nodeStatusColorTarget ?? 'border';
  const statusFill =
    nodeStatusColor !== null && (colorTarget === 'background' || colorTarget === 'both')
      ? nodeStatusColor
      : null;
  const statusStroke =
    nodeStatusColor !== null && (colorTarget === 'border' || colorTarget === 'both')
      ? nodeStatusColor
      : null;

  // Check if this node is selected for dragging
  let nodeIsSelected = selectedNodes.find((n) => n.index === node.index);

  return (
    <DraggableCore
      nodeRef={nodeRef as unknown as React.RefObject<HTMLElement>}
      disabled={disabled}
      onDrag={onDrag}
      onStop={onStop}
    >
      <g
        ref={nodeRef}
        cursor={disabled ? (node.dashboardLink ? 'pointer' : '') : 'move'}
        display={node.label !== undefined ? 'inline' : 'none'}
        onClick={onClick}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onContextMenu={onContextMenu}
        transform={`translate(${
          wm.settings.panel.grid.enabled &&
          draggedNode &&
          (draggedNode.index === node.index || selectedNodes.find((n) => n.index === node.index))
            ? nearestMultiple(node.x, wm.settings.panel.grid.size)
            : node.x
        },
                    ${
                      wm.settings.panel.grid.enabled &&
                      draggedNode &&
                      (draggedNode.index === node.index || selectedNodes.find((n) => n.index === node.index))
                        ? nearestMultiple(node.y, wm.settings.panel.grid.size)
                        : node.y
                    })`}
      >
        {node.label !== '' || node.nodeIcon?.drawInside ? (
          <React.Fragment>
            <rect
              x={rectX}
              y={rectY}
              width={rectWidth}
              height={rectHeight}
              fill={
                node.isConnection
                  ? 'transparent'
                  : getSolidFromAlphaColor(
                      statusFill !== null ? statusFill : node.colors.background,
                      wm.settings.panel.backgroundColor
                    )
              }
              stroke={
                nodeIsSelected
                  ? getSolidFromAlphaColor(node.colors.font, wm.settings.panel.backgroundColor)
                  : node.isConnection
                  ? disabled
                    ? 'transparent'
                    : getSolidFromAlphaColor(node.colors.background, wm.settings.panel.backgroundColor)
                  : getSolidFromAlphaColor(
                      statusStroke !== null ? statusStroke : node.colors.border,
                      wm.settings.panel.backgroundColor
                    )
              }
              strokeWidth={node.isConnection ? 2 : 4}
              rx={6}
              ry={7}
              style={{ paintOrder: 'stroke' }}
            ></rect>
            {node.showLabel !== false && isLayerVisible(wm, 'nodeLabels') && (
              <text
                x={0}
                y={textY}
                textAnchor={'middle'}
                alignmentBaseline={'central'}
                dominantBaseline={'central'}
                fill={node.colors.font}
                className={styles.nodeText}
                fontSize={node.isConnection ? '6px' : `${node.fontSize ?? wm.settings.fontSizing.node}px`}
                fontWeight={node.fontBold ? 'bold' : undefined}
              >
                {node.label !== undefined && !(node.isConnection && disabled) ? node.label : ''}
              </text>
            )}
          </React.Fragment>
        ) : (
          ''
        )}
        {node.nodeIcon && sanitizeUrl(node.nodeIcon.src) !== '' ? (
          <image
            x={-node.nodeIcon.size.width / 2}
            y={
              node.nodeIcon.drawInside
                ? node.label!.length > 0
                  ? -(
                      node.nodeIcon.size.height +
                      node.nodeIcon.padding.vertical +
                      measureText(node.label!, node.fontSize ?? wm.settings.fontSizing.node).actualBoundingBoxAscent
                    ) / 2
                  : -node.nodeIcon.size.height / 2
                : node.label!.length > 0
                ? textY - node.nodeIcon.size.height - rectHeight / 2 - 1 - node.nodeIcon.padding.vertical
                : -node.nodeIcon.size.height / 2
            }
            width={node.nodeIcon.size.width}
            height={node.nodeIcon.size.height}
            href={sanitizeUrl(node.nodeIcon.src)}
          />
        ) : (
          ''
        )}
      </g>
    </DraggableCore>
  );
};

const getStyles = () => {
  return {
    nodeText: css`
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      -khtml-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      -o-user-select: none;
      user-select: none;
    `,
  };
};

export default MapNode;
