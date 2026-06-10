import React, { useEffect, useState, useRef, useMemo } from 'react';
import { DataFrame, Field, FieldType, getTimeZone, getValueFormat, PanelProps } from '@grafana/data';
import {
  Anchor,
  DrawnLink,
  DrawnNode,
  Link,
  LinkSide,
  Node,
  SimpleOptions,
  Position,
  Weathermap,
  HoveredLink,
  Threshold,
} from 'types';
import { css, cx } from '@emotion/css';
import {
  LegendDisplayMode,
  TimeSeries,
  TooltipDisplayMode,
  TooltipPlugin,
  useStyles2,
  useTheme2,
} from '@grafana/ui';
import { locationService } from '@grafana/runtime';
import {
  measureText,
  getSolidFromAlphaColor,
  nearestMultiple,
  calculateRectangleAutoWidth,
  calculateRectangleAutoHeight,
  CURRENT_VERSION,
  handleVersionedStateUpdates,
  getDataFrameName,
  getValueField,
} from 'utils';
import MapNode from './components/MapNode';
import ColorScale from 'components/ColorScale';

// Calculate node position, width, etc.
function generateDrawnNode(d: Node, i: number, wm: Weathermap): DrawnNode {
  let toReturn: DrawnNode = { ...d } as DrawnNode;
  toReturn.index = i;
  toReturn.x = toReturn.position[0];
  toReturn.y = toReturn.position[1];
  toReturn.labelWidth = measureText(d.label ? d.label : '', wm.settings.fontSizing.node).width;
  toReturn.anchors = {
    0: { numLinks: toReturn.anchors[0].numLinks, numFilledLinks: 0 },
    1: { numLinks: toReturn.anchors[1].numLinks, numFilledLinks: 0 },
    2: { numLinks: toReturn.anchors[2].numLinks, numFilledLinks: 0 },
    3: { numLinks: toReturn.anchors[3].numLinks, numFilledLinks: 0 },
    4: { numLinks: toReturn.anchors[4].numLinks, numFilledLinks: 0 },
  };
  return toReturn;
}

// Format link values as the proper prefix of bits
const getlinkValueFormatter = (fmt_id: string) => getValueFormat(fmt_id);
const getlinkGraphFormatter =
  (fmt_id: string) =>
  (v: any): string => {
    let formatter = getValueFormat(fmt_id);
    let formattedValue = formatter(v);
    return `${formattedValue.text} ${formattedValue.suffix}`;
  };

/**
 * Weathermap panel component.
 */
export const WeathermapPanel: React.FC<PanelProps<SimpleOptions>> = (props: PanelProps<SimpleOptions>) => {
  const { options, data, width: width2, height: height2, onOptionsChange, timeRange } = props;
  const styles = useStyles2(getStyles);
  const theme = useTheme2();
  const wm = options.weathermap;

  if (wm && (!wm.version || wm.version !== CURRENT_VERSION)) {
    onOptionsChange({ weathermap: handleVersionedStateUpdates(wm, theme) });
  }

  // Check for editing-related feature set
  const isEditMode = locationService.getSearch().has('editPanel');

  const [draggedNode, setDraggedNode] = useState(null as unknown as DrawnNode);
  const [selectedNodes, setSelectedNodes] = useState([] as DrawnNode[]);

  function getScaleColor(current: number, max: number) {
    if (max === 0) {
      return getSolidFromAlphaColor(wm.settings.link.stroke.color, wm.settings.panel.backgroundColor);
    }

    const percent = (current / max) * 100;
    const defaultColor = getSolidFromAlphaColor(wm.settings.link.stroke.color, wm.settings.panel.backgroundColor);
    let assignedColor = defaultColor;

    wm.scale.forEach((threshold: Threshold) => {
      if (threshold.percent <= percent) {
        assignedColor = threshold.color;
      }
    });

    return assignedColor;
  }

  // Get the middle point between two nodes
  function getMiddlePoint(source: Position, target: Position, offset: number): Position {
    const x = (source.x + target.x) / 2;
    const y = (source.y + target.y) / 2;
    const a = target.x - source.x;
    const b = target.y - source.y;
    const dist = Math.sqrt(a * a + b * b);
    const newX = x - (offset * (target.x - source.x)) / dist;
    const newY = y - (offset * (target.y - source.y)) / dist;
    return { x: newX, y: newY };
  }

  // Get a point a percentage of the way between two nodes
  function getPercentPoint(source: Position, target: Position, percent: number): Position {
    const newX = target.x + (source.x - target.x) * percent;
    const newY = target.y + (source.y - target.y) * percent;
    return { x: newX, y: newY };
  }

  // Find the points that create the two other points of a triangle for the arrow's tip
  function getArrowPolygon(_p1: any, _p2: any, height: number, width: number) {
    let h = height;
    let w = width / 2;
    let vec1 = { x: _p2.x - _p1.x, y: _p2.y - _p1.y };
    let length = Math.sqrt(vec1.x * vec1.x + vec1.y * vec1.y);
    vec1.x = vec1.x / length;
    vec1.y = vec1.y / length;
    let vec2 = { x: -vec1.y, y: vec1.x };
    let v1 = { x: _p2.x - h * vec1.x + w * vec2.x, y: _p2.y - h * vec1.y + w * vec2.y };
    let v2 = { x: _p2.x - h * vec1.x - w * vec2.x, y: _p2.y - h * vec1.y - w * vec2.y };
    return { p1: v1, p2: v2 };
  }

  const [nodes, setNodes] = useState(
    wm.nodes.map((d, i) => {
      return generateDrawnNode(d, i, wm);
    })
  );

  // To be used to calculate how many links we've drawn
  let tempNodes = nodes.slice();

  const [links, setLinks] = useState(
    wm
      ? wm.links.map((d, i) => {
          return generateDrawnLink(d, i, new Map());
        })
      : []
  );

  // Calculate aspect-ratio corrected drag positions
  function getScaledMousePos(pos: { x: number; y: number }): { x: number; y: number } {
    const zoomAmt = Math.pow(1.2, wm.settings.panel.zoomScale);
    return {
      x: pos.x * zoomAmt * aspectMultiplier,
      y: pos.y * zoomAmt * aspectMultiplier,
    };
  }

  // How much extra y-offset the icon adds above the node rect top (for Top anchor)
  function getIconTopExtra(d: DrawnNode): number {
    if (!d.nodeIcon || d.nodeIcon.drawInside || !d.useIconBoundaryForLinks) {
      return 0;
    }
    const rectH = calculateRectangleAutoHeight(d, wm);
    if (d.label && d.label.length > 0) {
      return d.nodeIcon.size.height + d.nodeIcon.padding.vertical + 1;
    }
    return Math.max(0, d.nodeIcon.size.height / 2 - rectH / 2);
  }

  // How much extra x-offset the icon adds beyond the rect edge (for Left/Right anchors)
  function getIconWidthExtra(d: DrawnNode): number {
    if (!d.nodeIcon || d.nodeIcon.drawInside || !d.useIconBoundaryForLinks) {
      return 0;
    }
    return Math.max(0, d.nodeIcon.size.width / 2 - calculateRectangleAutoWidth(d, wm) / 2);
  }

  // Calculate the position of a link given the node and side information
  function getMultiLinkPosition(d: DrawnNode, side: LinkSide): Position {
    // Set initial x and y values for links. Defaults to center x of the node, and the middle y.
    let x = d.x;
    let y = d.y;

    // Set x and y to the rounded value if we are using the grid
    x =
      wm.settings.panel.grid.enabled &&
      draggedNode &&
      (draggedNode.index === d.index || selectedNodes.find((n) => n.index === d.index))
        ? nearestMultiple(d.x, wm.settings.panel.grid.size)
        : x;
    y =
      wm.settings.panel.grid.enabled &&
      draggedNode &&
      (draggedNode.index === d.index || selectedNodes.find((n) => n.index === d.index))
        ? nearestMultiple(d.y, wm.settings.panel.grid.size)
        : y;

    // The maximum link width on this anchor point.
    // Math.max(...[]) returns -Infinity for empty arrays, which corrupts
    // coordinates — default to 0 so positions stay finite.
    const anchorStrokes = wm.links
      .filter((l) => l.nodes[0].id === d.id || l.nodes[1].id === d.id)
      .filter((l) => side.anchor === l.sides.A.anchor || l.sides.Z.anchor === side.anchor)
      .map((l) => l.stroke);
    const maxLinkWidth = anchorStrokes.length > 0 ? Math.max(...anchorStrokes) : 0;

    // Change x values for left/right anchors
    if (side.anchor === Anchor.Left || side.anchor === Anchor.Right) {
      const iconWidthExtra = getIconWidthExtra(d);
      // Align left/right, extending to icon edge when useIconBoundaryForLinks is set
      if (side.anchor === Anchor.Left) {
        x -= calculateRectangleAutoWidth(d, wm) / 2 - maxLinkWidth / 2 + iconWidthExtra;
      } else {
        x += calculateRectangleAutoWidth(d, wm) / 2 - maxLinkWidth / 2 + iconWidthExtra;
      }
      // Calculate vertical alignments given # of links
      if (!d.compactVerticalLinks && d.anchors[side.anchor].numLinks > 1) {
        const linkHeight = maxLinkWidth + wm.settings.link.spacing.vertical;
        const fullHeight =
          linkHeight * d.anchors[side.anchor].numLinks - wm.settings.link.spacing.vertical - maxLinkWidth;
        y -= fullHeight / 2;
        y +=
          (d.anchors[side.anchor].numFilledLinks + 1) * maxLinkWidth +
          d.anchors[side.anchor].numFilledLinks * wm.settings.link.spacing.vertical -
          maxLinkWidth;
      }
    } else if (side.anchor !== Anchor.Center) {
      if (d.useConstantSpacing) {
        // To be used with constant-spacing
        const maxWidth =
          maxLinkWidth * (d.anchors[side.anchor].numLinks - 1) +
          wm.settings.link.spacing.horizontal * (d.anchors[side.anchor].numLinks - 1);
        x +=
          -maxWidth / 2 + d.anchors[side.anchor].numFilledLinks * (maxLinkWidth + wm.settings.link.spacing.horizontal);
      } else {
        // To be used with auto-spacing
        const paddedWidth = d.labelWidth + d.padding.horizontal * 2;
        x +=
          -paddedWidth / 2 +
          (d.anchors[side.anchor].numFilledLinks + 1) *
            (paddedWidth / (nodes[d.index].anchors[side.anchor].numLinks + 1));
      }
      // Add height if we are at the bottom;
      if (side.anchor === Anchor.Bottom) {
        y += calculateRectangleAutoHeight(d, wm) / 2 - maxLinkWidth / 2;
      } else if (side.anchor === Anchor.Top) {
        y -= calculateRectangleAutoHeight(d, wm) / 2;
        y += maxLinkWidth / 2;
        y -= getIconTopExtra(d);
      }
    }
    // Mark that we've drawn another link
    d.anchors[side.anchor].numFilledLinks++;
    return { x, y };
  }

  // Calculate link positions / text / colors / etc.
  function generateDrawnLink(d: Link, i: number, frameMap: Map<string, number>): DrawnLink {
    let toReturn: DrawnLink = { ...d, sides: { A: { ...d.sides.A }, Z: { ...d.sides.Z } } } as DrawnLink;
    toReturn.index = i;

    const linkValueFormatter = getlinkValueFormatter(
      d.units ? d.units : wm.settings.link.defaultUnits ? wm.settings.link.defaultUnits : 'bps'
    );

    // Set the link's source and target node
    toReturn.source = nodes.filter((n) => n.id === toReturn.nodes[0].id)[0];
    toReturn.target = nodes.filter((n) => n.id === toReturn.nodes[1].id)[0];

    // For each of our A/Z sides
    for (let s = 0; s < 2; s++) {
      const side: 'A' | 'Z' = s === 0 ? 'A' : 'Z';

      // Check if we have a query to run for this side's bandwidth
      if (toReturn.sides[side].bandwidthQuery) {
        const bwValue = frameMap.get(toReturn.sides[side].bandwidthQuery!);
        toReturn.sides[side].bandwidth = bwValue !== undefined ? bwValue : 0;
      }

      // Set the display value to zero, just in case nothing exists
      toReturn.sides[side].currentValue = 0;
      toReturn.sides[side].currentText = 'n/a';
      toReturn.sides[side].currentValueText = 'n/a';
      toReturn.sides[side].currentPercentageText = 'n/a%';
      toReturn.sides[side].currentBandwidthText = 'n/a';

      // Check if we have a query to run for this side's throughput
      if (toReturn.sides[side].query) {
        const frameValue = frameMap.get(toReturn.sides[side].query!);

        if (frameValue !== undefined) {
          toReturn.sides[side].currentValue = frameValue;

          // Get the text formatted to KiB/MiB/etc.
          let scaledSideValue = linkValueFormatter(toReturn.sides[side].currentValue);
          toReturn.sides[side].currentValueText = `${scaledSideValue.text} ${scaledSideValue.suffix}`;

          // Get the percentage througput text
          toReturn.sides[side].currentPercentageText =
            toReturn.sides[side].bandwidth > 0
              ? `${((toReturn.sides[side].currentValue / toReturn.sides[side].bandwidth) * 100).toFixed(2)}%`
              : 'n/a%';
        }
      }

      // Display throughput % when necessary
      if (toReturn.showThroughputPercentage || wm.settings.link.showAllWithPercentage) {
        toReturn.sides[side].currentText = toReturn.sides[side].currentPercentageText;
      } else {
        toReturn.sides[side].currentText = toReturn.sides[side].currentValueText;
      }

      let scaledBandwidth = linkValueFormatter(toReturn.sides[side].bandwidth);
      toReturn.sides[side].currentBandwidthText = `${scaledBandwidth.text} ${scaledBandwidth.suffix}`;
    }

    // Calculate positions for links and arrow polygons. Not included above to help with typing.
    if (i === 0) {
      tempNodes = tempNodes.map((n) => {
        n.anchors = {
          0: { numLinks: n.anchors[0].numLinks, numFilledLinks: 0 },
          1: { numLinks: n.anchors[1].numLinks, numFilledLinks: 0 },
          2: { numLinks: n.anchors[2].numLinks, numFilledLinks: 0 },
          3: { numLinks: n.anchors[3].numLinks, numFilledLinks: 0 },
          4: { numLinks: n.anchors[4].numLinks, numFilledLinks: 0 },
        };
        return n;
      });
    }

    toReturn.lineStartA = getMultiLinkPosition(tempNodes[toReturn.source.index], toReturn.sides.A);
    toReturn.lineStartZ = getMultiLinkPosition(tempNodes[toReturn.target.index], toReturn.sides.Z);

    toReturn.lineEndA = getMiddlePoint(
      toReturn.lineStartZ,
      toReturn.lineStartA,
      -toReturn.arrows.offset - toReturn.arrows.height
    );

    if (tempNodes[toReturn.target.index].isConnection) {
      toReturn.lineEndA = toReturn.lineStartZ;
      toReturn.lineEndZ = toReturn.lineStartZ;
    }

    toReturn.arrowCenterA = getMiddlePoint(toReturn.lineStartZ, toReturn.lineStartA, -toReturn.arrows.offset);
    toReturn.arrowPolygonA = getArrowPolygon(
      toReturn.lineStartA,
      toReturn.arrowCenterA,
      toReturn.arrows.height,
      toReturn.arrows.width
    );

    toReturn.lineEndZ = getMiddlePoint(
      toReturn.lineStartZ,
      toReturn.lineStartA,
      toReturn.arrows.offset + toReturn.arrows.height
    );
    toReturn.arrowCenterZ = getMiddlePoint(toReturn.lineStartZ, toReturn.lineStartA, toReturn.arrows.offset);
    toReturn.arrowPolygonZ = getArrowPolygon(
      toReturn.lineStartZ,
      toReturn.arrowCenterZ,
      toReturn.arrows.height,
      toReturn.arrows.width
    );

    return toReturn;
  }

  // Build the data-frame value map once per data/mode change instead of once per link.
  // Key: display name (from getDataFrameName). Value: resolved numeric value.
  const dataFrameMap = useMemo(() => {
    const useAvg = wm.settings.link.valueMappingMode === 'avg';
    const map = new Map<string, number>();
    data.series.forEach((frame) => {
      if (frame.fields.length < 2) {
        return;
      }
      try {
        const fieldValues = getValueField(frame).values;
        let resolvedValue: number;
        if (useAvg && fieldValues.length > 0) {
          let sum = 0;
          let count = 0;
          for (let vi = 0; vi < fieldValues.length; vi++) {
            const v = fieldValues[vi];
            if (v !== null && !isNaN(v)) {
              sum += Math.max(0, v);
              count++;
            }
          }
          resolvedValue = count > 0 ? sum / count : 0;
        } else {
          let lastValid = 0;
          for (let vi = fieldValues.length - 1; vi >= 0; vi--) {
            const v = fieldValues[vi];
            if (v !== null && !isNaN(v)) {
              lastValid = Math.max(0, v);
              break;
            }
          }
          resolvedValue = lastValid;
        }
        map.set(getDataFrameName(frame, data.series), resolvedValue);
      } catch (e) {
        console.warn('Network Weathermap: Error while attempting to access query data.', e);
      }
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, wm.settings.link.valueMappingMode]);

  // Minimize uneeded state changes
  const mounted = useRef(false);

  // Update nodes on props/data change
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
    } else {
      setNodes(
        options.weathermap.nodes.map((d, i) => {
          return generateDrawnNode(d, i, options.weathermap);
        })
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, data]);

  tempNodes = nodes.slice();

  // Update links on props/data change
  useEffect(() => {
    setLinks(
      options.weathermap.links.map((d, i) => {
        return generateDrawnLink(d, i, dataFrameMap);
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, data, nodes, dataFrameMap]);

  const zoom = (e: WheelEvent) => {
    // Just don't allow zooming when not in edit mode
    if (!isEditMode && !e.shiftKey) {
      return;
    }

    const delta = e.deltaY > 0 ? 1 : -1;
    onOptionsChange({
      weathermap: {
        ...wm,
        settings: {
          ...wm.settings,
          panel: { ...wm.settings.panel, zoomScale: wm.settings.panel.zoomScale + delta },
        },
      },
    });
  };

  const [isDragging, setDragging] = useState(false);

  let aspectX = wm.settings.panel.panelSize.width / width2;
  let aspectY = wm.settings.panel.panelSize.height / height2;
  let aspectMultiplier = Math.max(aspectX, aspectY);

  const updateAspects = () => {
    aspectX = wm.settings.panel.panelSize.width / width2;
    aspectY = wm.settings.panel.panelSize.height / height2;
    aspectMultiplier = Math.max(aspectX, aspectY);
  };

  const [offset, setOffset] = useState(wm.settings.panel.offset);

  const drag = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (e.ctrlKey || e.buttons === 4 || e.shiftKey) {
      e.nativeEvent.preventDefault();
      const zoomAmt = Math.pow(1.2, wm.settings.panel.zoomScale);

      setOffset((prev) => {
        return {
          x: prev.x + e.nativeEvent.movementX * zoomAmt * aspectMultiplier,
          y: prev.y + e.nativeEvent.movementY * zoomAmt * aspectMultiplier,
        };
      });
    }
  };

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [hoveredLink, setHoveredLink] = useState(null as unknown as HoveredLink);

  const handleLinkHover = (d: DrawnLink, side: 'A' | 'Z', e: React.MouseEvent<SVGElement>) => {
    if (e.shiftKey) {
      return;
    }

    if (tempNodes[d.source.index].isConnection) {
      // If this link is coming from a connection, we want
      // to take the link to that connection's data

      // Find the link with that data
      let prevLinks = links.filter((l) => l.target.id === d.source.id);

      // Find previous links
      while (prevLinks.length === 1 && tempNodes[prevLinks[0].source.index].isConnection) {
        prevLinks = links.filter((l) => l.target.id === prevLinks[0].source.id);
      }

      // Check there is only one connection (otherwise this doesn't work)
      if (prevLinks.length === 1) {
        for (let key in prevLinks[0].sides.A) {
          if (key !== 'labelOffset' && key !== 'anchor') {
            (d.sides.A as unknown as Record<string, unknown>)[key] = (prevLinks[0].sides.A as unknown as Record<string, unknown>)[key];
          }
        }
      } else {
        console.warn(`Connection node "${d.source.label}" missing input connection.`);
      }
    }

    if (tempNodes[d.target.index].isConnection) {
      // If this link is going to a connection, we want
      // to get the forward data as well.

      // Find the link with that data
      let forwardLinks = links.filter((l) => l.source.id === d.target.id);

      // Find forward links
      while (forwardLinks.length === 1 && tempNodes[forwardLinks[0].target.index].isConnection) {
        forwardLinks = links.filter((l) => l.source.id === forwardLinks[0].target.id);
      }

      // Check there is only one connection (otherwise this doesn't work)
      if (forwardLinks.length === 1) {
        for (let key in forwardLinks[0].sides.Z) {
          if (key !== 'labelOffset' && key !== 'anchor') {
            (d.sides.Z as unknown as Record<string, unknown>)[key] = (forwardLinks[0].sides.Z as unknown as Record<string, unknown>)[key];
          }
        }
      } else {
        console.warn(`Connection node "${d.target.label}" missing output connection.`);
      }
    }

    let mouseX = e.clientX;
    let mouseY = e.clientY;
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    }
    setHoveredLink({ link: d, side, mouseX, mouseY });
  };

  const handleLinkHoverLoss = (e: React.MouseEvent<SVGElement>) => {
    if (e.shiftKey) {
      return;
    }
    setHoveredLink(null as unknown as HoveredLink);
  };

  const filteredGraphQueries = data.series.filter((frame) => {
    if (!hoveredLink) {
      return;
    }

    let displayName = null;
    try {
      displayName = getDataFrameName(frame, data.series);
    } catch (e) {
      console.warn('Network Weathermap: Error while attempting to access query data.', e);
    }

    return displayName === hoveredLink.link.sides.A.query || displayName === hoveredLink.link.sides.Z.query;
  });

  if (wm) {
    return (
      <div
        ref={wrapperRef}
        className={cx(
          styles.wrapper,
          css`
            width: ${width2}px;
            height: ${height2}px;
            position: relative;
          `
        )}
      >
        {hoveredLink ? (
          <div
            className={css`
              position: absolute;
              top: ${hoveredLink.mouseY - 10}px;
              left: ${hoveredLink.mouseX + 14}px;
              transform: translate(
                ${hoveredLink.mouseX > width2 * 0.65 ? '-100%' : '0%'},
                ${hoveredLink.mouseY < 120 ? '0%' : '-100%'}
              );
              pointer-events: none;
              background-color: ${wm.settings.tooltip.backgroundColor};
              color: ${wm.settings.tooltip.textColor} !important;
              font-size: ${wm.settings.tooltip.fontSize} !important;
              z-index: 10000;
              display: ${hoveredLink ? 'flex' : 'none'};
              flex-direction: column;
              padding: ${wm.settings.tooltip.fontSize}px;
              border-radius: 4px;
              border: 1px solid
                ${getScaleColor(
                  hoveredLink.link.sides[hoveredLink.side].currentValue,
                  hoveredLink.link.sides[hoveredLink.side].bandwidth
                )};
            `}
          >
            <div
              style={{
                fontSize: wm.settings.tooltip.fontSize,
                borderBottom: `1px solid ${theme.colors.border.medium}`,
                marginBottom: '4px',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              {hoveredLink.link.nodes[0].label} {hoveredLink.side === 'A' ? '--->' : '<---'}{' '}
              {hoveredLink.link.nodes[1].label}
            </div>
            <div style={{ fontSize: wm.settings.tooltip.fontSize }}>
              Usage - Inbound: {hoveredLink.link.sides[hoveredLink.side === 'A' ? 'Z' : 'A'].currentValueText}, Outbound:{' '}
              {hoveredLink.link.sides[hoveredLink.side === 'A' ? 'A' : 'Z'].currentValueText}
            </div>
            <div style={{ fontSize: wm.settings.tooltip.fontSize }}>
              Bandwidth - Inbound: {hoveredLink.link.sides[hoveredLink.side === 'A' ? 'Z' : 'A'].currentBandwidthText}, Outbound:{' '}
              {hoveredLink.link.sides[hoveredLink.side === 'A' ? 'A' : 'Z'].currentBandwidthText}
            </div>
            <div style={{ fontSize: wm.settings.tooltip.fontSize }}>
              Throughput (%) - Inbound: {hoveredLink.link.sides[hoveredLink.side === 'A' ? 'Z' : 'A'].currentPercentageText}, Outbound:{' '}
              {hoveredLink.link.sides[hoveredLink.side === 'A' ? 'A' : 'Z'].currentPercentageText}
            </div>
            <div style={{ fontSize: wm.settings.tooltip.fontSize, paddingBottom: '4px' }}>
              {hoveredLink.link.sides[hoveredLink.side].dashboardLink.length > 0 ? 'Click to see more.' : ''}
            </div>
            {(hoveredLink.link.sides.A.query || hoveredLink.link.sides.Z.query) && filteredGraphQueries.length > 0 ? (
              <React.Fragment>
                <TimeSeries
                  width={250}
                  height={100}
                  timeRange={timeRange}
                  timeZone={getTimeZone()}
                  frames={filteredGraphQueries.map((frame: DataFrame) => {
                    const isInboundQuery = getDataFrameName(frame, data.series) === hoveredLink.link.sides.Z.query;
                    const lineColor = isInboundQuery
                      ? wm.settings.tooltip.inboundColor
                      : wm.settings.tooltip.outboundColor;
                    // Spread each field to avoid mutating the original frame stored in data.series.
                    // Mutating originals causes stale colors on subsequent renders.
                    return {
                      ...frame,
                      fields: frame.fields.map((f) => ({
                        ...f,
                        config: {
                          ...f.config,
                          custom: {
                            ...f.config.custom,
                            fillOpacity: 10,
                            lineColor,
                          },
                        },
                      })),
                    };
                  })}
                  legend={{
                    calcs: [],
                    displayMode: LegendDisplayMode.List,
                    placement: 'bottom',
                    isVisible: true,
                    showLegend: false,
                  }}
                  tweakScale={(opts, forField: Field) => {
                    // Only adjust the value (y) axis — not the time axis.
                    if (forField.type !== FieldType.number) {
                      return opts;
                    }
                    opts.softMin = 0;
                    if (
                      wm.settings.tooltip.scaleToBandwidth &&
                      hoveredLink.link.sides[hoveredLink.side].bandwidth > 0
                    ) {
                      opts.softMax = hoveredLink.link.sides[hoveredLink.side].bandwidth;
                    }
                    return opts;
                  }}
                  tweakAxis={(opts, forField: Field) => {
                    // Only format the value (y) axis — leave the time axis alone.
                    if (forField.type !== FieldType.number) {
                      return opts;
                    }
                    opts.formatValue = getlinkGraphFormatter(
                      hoveredLink.link.units
                        ? hoveredLink.link.units
                        : wm.settings.link.defaultUnits
                        ? wm.settings.link.defaultUnits
                        : 'bps'
                    );
                    return opts;
                  }}
                >
                  {(config, alignedDataFrame) => {
                    return (
                      <>
                        <TooltipPlugin
                          config={config}
                          data={alignedDataFrame}
                          mode={TooltipDisplayMode.Multi}
                          timeZone={getTimeZone()}
                        />
                      </>
                    );
                  }}
                </TimeSeries>
                <div style={{ display: 'flex', alignItems: 'center', paddingTop: '10px' }}>
                  <div
                    style={{
                      width: '10px',
                      height: '3px',
                      background: wm.settings.tooltip.inboundColor,
                      paddingLeft: '5px',
                      marginRight: '4px',
                    }}
                  ></div>
                  <div style={{ fontSize: wm.settings.tooltip.fontSize }}>Inbound</div>
                  <div
                    style={{
                      width: '10px',
                      height: '3px',
                      background: wm.settings.tooltip.outboundColor,
                      marginLeft: '10px',
                      marginRight: '4px',
                    }}
                  ></div>
                  <div
                    style={{
                      fontSize: wm.settings.tooltip.fontSize,
                    }}
                  >
                    Outbound
                  </div>
                </div>
              </React.Fragment>
            ) : (
              ''
            )}
          </div>
        ) : (
          ''
        )}
        <ColorScale thresholds={wm.scale} settings={wm.settings} />
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            backgroundImage: wm.settings.panel.backgroundImage
              ? `url(${wm.settings.panel.backgroundImage.url})`
              : 'none',
            backgroundSize: wm.settings.panel.backgroundImage?.fit,
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundColor: wm.settings.panel.backgroundImage ? 'none' : wm.settings.panel.backgroundColor,
          }}
          id={`nw-${wm.id}${isEditMode ? '_' : ''}`}
          width={width2}
          height={height2}
          xmlns="http://www.w3.org/2000/svg"
          xmlnsXlink="http://www.w3.org/1999/xlink"
          viewBox={`0 0 ${wm.settings.panel.panelSize.width * Math.pow(1.2, wm.settings.panel.zoomScale)} ${
            wm.settings.panel.panelSize.height * Math.pow(1.2, wm.settings.panel.zoomScale)
          }`}
          shapeRendering="crispEdges"
          textRendering="geometricPrecision"
          fontFamily="sans-serif"
          onWheel={zoom as unknown as React.WheelEventHandler<SVGSVGElement>}
          onMouseDown={(e) => {
            e.preventDefault();
            updateAspects();
            setDragging(true);
          }}
          onMouseMove={(e) => {
            if (isDragging && (e.ctrlKey || e.buttons === 4 || e.shiftKey)) {
              drag(e);
            }
          }}
          onMouseUp={() => {
            setDragging(false);
            let panned = wm;
            panned.settings.panel.offset = offset;
            onOptionsChange({ weathermap: panned });
          }}
          onDoubleClick={() => {
            setSelectedNodes([]);
          }}
        >
          {wm.settings.panel.grid.enabled ? (
            <defs>
              <pattern
                id="smallGrid"
                width={wm.settings.panel.grid.size}
                height={wm.settings.panel.grid.size}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${wm.settings.panel.grid.size} 0 L 0 0 0 ${wm.settings.panel.grid.size}`}
                  fill="none"
                  stroke="gray"
                  strokeWidth="2"
                  opacity={1}
                />
              </pattern>
            </defs>
          ) : (
            ''
          )}
          <g
            transform={`translate(${
              (wm.settings.panel.panelSize.width * Math.pow(1.2, wm.settings.panel.zoomScale) -
                wm.settings.panel.panelSize.width) /
                2 +
              offset.x
            }, ${
              (wm.settings.panel.panelSize.height * Math.pow(1.2, wm.settings.panel.zoomScale) -
                wm.settings.panel.panelSize.height) /
                2 +
              offset.y
            })`}
            overflow="visible"
          >
            {wm.settings.panel.grid.guidesEnabled ? (
              <>
                <rect
                  x={
                    wm.nodes.length > 0
                      ? wm.nodes[0].position[0] -
                        wm.settings.panel.panelSize.width * Math.pow(1.2, wm.settings.panel.zoomScale) * 2
                      : 0
                  }
                  y={
                    wm.nodes.length > 0
                      ? wm.nodes[0].position[1] -
                        wm.settings.panel.panelSize.height * Math.pow(1.2, wm.settings.panel.zoomScale) * 2
                      : 0
                  }
                  width={wm.settings.panel.panelSize.width * Math.pow(1.2, wm.settings.panel.zoomScale) * 4}
                  height={wm.settings.panel.panelSize.height * Math.pow(1.2, wm.settings.panel.zoomScale) * 4}
                  fill="url(#smallGrid)"
                />
              </>
            ) : (
              ''
            )}
          </g>
          <g
            transform={`translate(${
              (wm.settings.panel.panelSize.width * Math.pow(1.2, wm.settings.panel.zoomScale) -
                wm.settings.panel.panelSize.width) /
                2 +
              offset.x
            }, ${
              (wm.settings.panel.panelSize.height * Math.pow(1.2, wm.settings.panel.zoomScale) -
                wm.settings.panel.panelSize.height) /
                2 +
              offset.y
            })`}
          >
            <g>
              {links.map((d, i) => {
                if (d.nodes[0].id === d.nodes[1].id) {
                  return;
                }
                let prevLinks: DrawnLink[] = [];
                // Automatic data collection through connection links
                if (tempNodes[d.source.index].isConnection) {
                  // If this link is coming from a connection, we want to take the link to that connection's data
                  // Find the link with that data
                  prevLinks = links.filter((l) => l.target.id === d.source.id);
                  // Check there is only one connection (otherwise this doesn't work)
                  if (prevLinks.length === 1) {
                    for (let key in d.sides.A) {
                      if (key !== 'labelOffset' && key !== 'anchor') {
                        (d.sides.A as unknown as Record<string, unknown>)[key] = (prevLinks[0].sides.A as unknown as Record<string, unknown>)[key];
                      }
                    }
                  } else {
                    console.warn(`Connection node "${d.source.label}" missing input connection.`);
                  }
                }
                return (
                  <g
                    key={i}
                    className="line"
                    data-testid="link"
                    strokeOpacity={1}
                    width={Math.abs(d.target.x - d.source.x)}
                    height={Math.abs(d.target.y - d.source.y)}
                  >
                    <line
                      strokeWidth={d.stroke}
                      stroke={getScaleColor(d.sides.A.currentValue, d.sides.A.bandwidth)}
                      x1={d.lineStartA.x}
                      y1={d.lineStartA.y}
                      x2={d.lineEndA.x}
                      y2={d.lineEndA.y}
                      onMouseMove={(e) => {
                        handleLinkHover(d, 'A', e);
                      }}
                      onMouseOut={handleLinkHoverLoss}
                      onClick={() => {
                        if (d.sides.A.dashboardLink.length > 0) {
                          window.open(d.sides.A.dashboardLink, '_blank', 'noopener,noreferrer');
                        }
                      }}
                      style={d.sides.A.dashboardLink.length > 0 ? { cursor: 'pointer' } : {}}
                    ></line>
                    {tempNodes[d.source.index].isConnection ? (
                      <circle
                        cx={d.lineStartA.x}
                        cy={d.lineStartA.y}
                        r={prevLinks.length > 0 ? Math.max(d.stroke, prevLinks[0].stroke) / 2 : d.stroke / 2}
                        fill={getScaleColor(d.sides.A.currentValue, d.sides.A.bandwidth)}
                        style={{ paintOrder: 'stroke' }}
                      ></circle>
                    ) : (
                      ''
                    )}
                    {tempNodes[d.target.index].isConnection ? (
                      ''
                    ) : (
                      <React.Fragment>
                        <polygon
                          points={`
                                        ${d.arrowCenterA.x}
                                        ${d.arrowCenterA.y}
                                        ${d.arrowPolygonA.p1.x}
                                        ${d.arrowPolygonA.p1.y}
                                        ${d.arrowPolygonA.p2.x}
                                        ${d.arrowPolygonA.p2.y}
                                    `}
                          fill={getScaleColor(d.sides.A.currentValue, d.sides.A.bandwidth)}
                          onMouseMove={(e) => {
                            handleLinkHover(d, 'A', e);
                          }}
                          onMouseOut={handleLinkHoverLoss}
                          onClick={() => {
                            if (d.sides.A.dashboardLink.length > 0) {
                              window.open(d.sides.A.dashboardLink, '_blank', 'noopener,noreferrer');
                            }
                          }}
                          style={d.sides.A.dashboardLink.length > 0 ? { cursor: 'pointer' } : {}}
                        ></polygon>
                        <line
                          strokeWidth={d.stroke}
                          stroke={getScaleColor(d.sides.Z.currentValue, d.sides.Z.bandwidth)}
                          x1={d.lineStartZ.x}
                          y1={d.lineStartZ.y}
                          x2={d.lineEndZ.x}
                          y2={d.lineEndZ.y}
                          onMouseMove={(e) => {
                            handleLinkHover(d, 'Z', e);
                          }}
                          onMouseOut={handleLinkHoverLoss}
                          onClick={() => {
                            if (d.sides.Z.dashboardLink.length > 0) {
                              window.open(d.sides.Z.dashboardLink, '_blank', 'noopener,noreferrer');
                            }
                          }}
                          style={d.sides.Z.dashboardLink.length > 0 ? { cursor: 'pointer' } : {}}
                        ></line>
                        <polygon
                          points={`
                                        ${d.arrowCenterZ.x}
                                        ${d.arrowCenterZ.y}
                                        ${d.arrowPolygonZ.p1.x}
                                        ${d.arrowPolygonZ.p1.y}
                                        ${d.arrowPolygonZ.p2.x}
                                        ${d.arrowPolygonZ.p2.y}
                                    `}
                          fill={getScaleColor(d.sides.Z.currentValue, d.sides.Z.bandwidth)}
                          onMouseMove={(e) => {
                            handleLinkHover(d, 'Z', e);
                          }}
                          onMouseOut={handleLinkHoverLoss}
                          onClick={() => {
                            if (d.sides.Z.dashboardLink.length > 0) {
                              window.open(d.sides.Z.dashboardLink, '_blank', 'noopener,noreferrer');
                            }
                          }}
                          style={d.sides.Z.dashboardLink.length > 0 ? { cursor: 'pointer' } : {}}
                        ></polygon>
                      </React.Fragment>
                    )}
                  </g>
                );
              })}
            </g>
            <g>
              {links.map((d, i) => {
                if (d.nodes[0].id === d.nodes[1].id) {
                  return;
                }
                const transform = getPercentPoint(
                  d.lineStartZ,
                  d.lineStartA,
                  (tempNodes[d.target.index].isConnection ? 1 : 0.5) * (d.sides.A.labelOffset / 100)
                );
                return (
                  <g
                    fontStyle={'italic'}
                    transform={`translate(${transform.x},${transform.y})`}
                    onMouseMove={(e) => {
                      handleLinkHover(d, 'A', e);
                    }}
                    onMouseOut={handleLinkHoverLoss}
                    key={i}
                  >
                    <rect
                      x={
                        -measureText(`${d.sides.A.currentText}`, wm.settings.fontSizing.link).width / 2 -
                        (wm.settings.fontSizing.link * 1.5) / 2
                      }
                      y={-wm.settings.fontSizing.link}
                      width={
                        measureText(`${d.sides.A.currentText}`, wm.settings.fontSizing.link).width +
                        wm.settings.fontSizing.link * 1.5
                      }
                      height={wm.settings.fontSizing.link * 2}
                      fill={getSolidFromAlphaColor(
                        wm.settings.link.label.background,
                        wm.settings.panel.backgroundColor
                      )}
                      stroke={getSolidFromAlphaColor(wm.settings.link.label.border, wm.settings.panel.backgroundColor)}
                      strokeWidth={2}
                      rx={(wm.settings.fontSizing.link + 8) / 2}
                    ></rect>
                    <text
                      x={0}
                      y={
                        measureText(`${d.sides.A.currentText}`, wm.settings.fontSizing.link).actualBoundingBoxAscent / 2
                      }
                      textAnchor={'middle'}
                      fontSize={`${wm.settings.fontSizing.link}px`}
                      fill={wm.settings.link.label.font}
                    >
                      {`${d.sides.A.currentText}`}
                    </text>
                  </g>
                );
              })}
            </g>
            <g>
              {links.map((d, i) => {
                if (d.nodes[0].id === d.nodes[1].id || tempNodes[d.target.index].isConnection) {
                  return;
                }
                const transform = getPercentPoint(d.lineStartA, d.lineStartZ, 0.5 * (d.sides.Z.labelOffset / 100));
                return (
                  <g
                    fontStyle={'italic'}
                    transform={`translate(${transform.x},${transform.y})`}
                    onMouseMove={(e) => {
                      handleLinkHover(d, 'Z', e);
                    }}
                    onMouseOut={handleLinkHoverLoss}
                    key={i}
                  >
                    <rect
                      x={
                        -measureText(`${d.sides.Z.currentText}`, wm.settings.fontSizing.link).width / 2 -
                        (wm.settings.fontSizing.link * 1.5) / 2
                      }
                      y={-wm.settings.fontSizing.link}
                      width={
                        measureText(`${d.sides.Z.currentText}`, wm.settings.fontSizing.link).width +
                        wm.settings.fontSizing.link * 1.5
                      }
                      height={wm.settings.fontSizing.link * 2}
                      fill={getSolidFromAlphaColor(
                        wm.settings.link.label.background,
                        wm.settings.panel.backgroundColor
                      )}
                      stroke={getSolidFromAlphaColor(wm.settings.link.label.border, wm.settings.panel.backgroundColor)}
                      strokeWidth={2}
                      rx={(wm.settings.fontSizing.link + 8) / 2}
                    ></rect>
                    <text
                      x={0}
                      y={
                        measureText(`${d.sides.Z.currentText}`, wm.settings.fontSizing.link).actualBoundingBoxAscent / 2
                      }
                      textAnchor={'middle'}
                      fontSize={`${wm.settings.fontSizing.link}px`}
                      fill={wm.settings.link.label.font}
                    >
                      {`${d.sides.Z.currentText}`}
                    </text>
                  </g>
                );
              })}
            </g>
            <g>
              {nodes.map((d, i) => (
                <MapNode
                  key={d.id}
                  {...{
                    node: d,
                    draggedNode: draggedNode,
                    selectedNodes: selectedNodes,
                    wm: wm,
                    onDrag: (e, position) => {
                      // Return early if we actually want to just pan the whole weathermap.
                      if (e.ctrlKey) {
                        return;
                      }

                      // Otherwise set our currently dragged node and manage scaling and grid settings.
                      setDraggedNode(d);
                      setNodes((prevState) =>
                        prevState.map((val, index) => {
                          if (index === i || selectedNodes.find((n) => n.id === nodes[index].id)) {
                            const scaledPos = getScaledMousePos({ x: position.deltaX, y: position.deltaY });
                            val.x = Math.round(
                              wm.settings.panel.grid.enabled
                                ? wm.nodes[index].position[0] + (val.x + scaledPos.x - wm.nodes[index].position[0])
                                : val.x + scaledPos.x
                            );
                            val.y = Math.round(
                              wm.settings.panel.grid.enabled
                                ? wm.nodes[index].position[1] + (val.y + scaledPos.y - wm.nodes[index].position[1])
                                : val.y + scaledPos.y
                            );
                          }
                          return val;
                        })
                      );
                      tempNodes = nodes.slice();
                      setLinks(
                        wm.links.map((d, i) => {
                          return generateDrawnLink(d, i, dataFrameMap);
                        })
                      );
                    },
                    onStop: (e, position) => {
                      // setDraggedNode(null as unknown as DrawnNode);
                      setDraggedNode(null as unknown as DrawnNode);
                      let current: Weathermap = wm;
                      current.nodes[i].position = [
                        wm.settings.panel.grid.enabled
                          ? nearestMultiple(nodes[i].x, wm.settings.panel.grid.size)
                          : nodes[i].x,
                        wm.settings.panel.grid.enabled
                          ? nearestMultiple(nodes[i].y, wm.settings.panel.grid.size)
                          : nodes[i].y,
                      ];

                      for (let node of selectedNodes) {
                        current.nodes[node.index].position = [
                          wm.settings.panel.grid.enabled
                            ? nearestMultiple(nodes[node.index].x, wm.settings.panel.grid.size)
                            : nodes[node.index].x,
                          wm.settings.panel.grid.enabled
                            ? nearestMultiple(nodes[node.index].y, wm.settings.panel.grid.size)
                            : nodes[node.index].y,
                        ];
                      }

                      onOptionsChange({
                        ...options,
                        weathermap: current,
                      });
                    },
                    onClick: (e) => {
                      if (e.ctrlKey && isEditMode) {
                        setSelectedNodes((v) => {
                          let cIndex = v.findIndex((n) => n.id === tempNodes[i].id);
                          if (cIndex > -1) {
                            v.splice(cIndex, 1);
                          } else {
                            v.push(tempNodes[i]);
                          }
                          return v;
                        });
                      } else if (!isEditMode && tempNodes[i].dashboardLink) {
                        window.open(tempNodes[i].dashboardLink, '_blank', 'noopener,noreferrer');
                      }
                      // Force an update
                      onOptionsChange(options);
                    },
                    disabled: !isEditMode,
                    data: data,
                  }}
                />
              ))}
            </g>
          </g>
        </svg>
        <div
          className={cx(
            styles.timeText,
            css`
              color: ${theme.colors.getContrastText(
                wm.settings.panel.backgroundColor.startsWith('image')
                  ? wm.settings.panel.backgroundColor.split('|', 3)[1]
                  : wm.settings.panel.backgroundColor
              )};
            `
          )}
        >
          {wm.settings.panel.showTimestamp ? timeRange.to.toLocaleString() : ''}
        </div>
      </div>
    );
  } else {
    return <React.Fragment />;
  }
};

const getStyles = () => {
  return {
    wrapper: css`
      position: relative;
      font-size: 10px;
      font-family: sans-serif;
    `,
    textBox: css`
      position: absolute;
      bottom: 0;
      left: 0;
      padding: 10px;
    `,
    nodeText: css`
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      -khtml-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      -o-user-select: none;
      user-select: none;
    `,
    timeText: css`
      position: absolute;
      bottom: 0;
      right: 0;
      color: black;
      padding: 5px 10px;
      font-size: 12px;
    `,
  };
};
