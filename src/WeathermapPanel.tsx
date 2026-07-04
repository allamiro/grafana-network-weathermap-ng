import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  DataFrame,
  dateTimeFormat,
  Field,
  FieldType,
  getTimeZone,
  getValueFormat,
  LoadingState,
  PanelProps,
} from '@grafana/data';
import {
  Anchor,
  DrawnLink,
  DrawnNode,
  Link,
  LinkSide,
  LinkTooltipMetric,
  Node,
  SimpleOptions,
  Position,
  Weathermap,
  HoveredLink,
  HoveredNode,
  NodeTooltipMetric,
  Threshold,
} from 'types';
import { css, cx } from '@emotion/css';
import {
  Button,
  LegendDisplayMode,
  Slider,
  TimeSeries,
  TooltipDisplayMode,
  TooltipPlugin,
  useStyles2,
  useTheme2,
} from '@grafana/ui';
import { getTemplateSrv, locationService } from '@grafana/runtime';
import {
  measureText,
  getSolidFromAlphaColor,
  nearestMultiple,
  calculateRectangleAutoWidth,
  calculateRectangleAutoHeight,
  CURRENT_VERSION,
  handleVersionedStateUpdates,
  resolveLinkChain,
  spreadLabels,
  LabelPlacement,
  getDataFrameName,
  getValueField,
  sanitizeUrl,
  aggregateFieldValues,
  getTimeField,
  valueAtTime,
  addViaToLink,
  removeVia,
} from 'utils';
import MapNode from './components/MapNode';
import ColorScale from 'components/ColorScale';

// Calculate node position, width, etc.
function generateDrawnNode(d: Node, i: number, wm: Weathermap): DrawnNode {
  let toReturn: DrawnNode = { ...d } as DrawnNode;
  toReturn.index = i;
  toReturn.x = toReturn.position[0];
  toReturn.y = toReturn.position[1];

  // Resolve Grafana template variables ($var) at draw time
  const tmplSrv = getTemplateSrv();
  if (toReturn.label !== undefined) {
    toReturn.label = tmplSrv?.replace(toReturn.label) ?? toReturn.label;
  }
  if (toReturn.statusQuery) {
    toReturn.statusQuery = tmplSrv?.replace(toReturn.statusQuery) ?? toReturn.statusQuery;
  }
  if (toReturn.dashboardLink) {
    toReturn.dashboardLink = tmplSrv?.replace(toReturn.dashboardLink) ?? toReturn.dashboardLink;
  }

  toReturn.labelWidth = measureText(
    toReturn.label ? toReturn.label : '',
    toReturn.fontSize ?? wm.settings.fontSizing.node
  ).width;
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
 * Saved dashboards can carry missing or partial weathermap options
 * (hand-edited JSON, provisioning, interrupted saves). Normalize the shape so
 * render code never dereferences a missing array; a missing weathermap stays
 * undefined and renders the empty state.
 */
const normalizeWeathermap = (raw: Weathermap | undefined | null): Weathermap | undefined =>
  raw ? { ...raw, nodes: raw.nodes ?? [], links: raw.links ?? [], scale: raw.scale ?? [] } : undefined;

/**
 * Weathermap panel component.
 */
export const WeathermapPanel: React.FC<PanelProps<SimpleOptions>> = (props: PanelProps<SimpleOptions>) => {
  const { options, data, width: width2, height: height2, onOptionsChange, timeRange } = props;
  const styles = useStyles2(getStyles);
  const theme = useTheme2();
  // Render from a normalized — and, when the saved schema is older or the map
  // is partial, locally migrated — copy, so the first render is already safe
  // even before the migrated options are persisted below.
  // Typed as the original `options.weathermap` was: non-null for the type
  // system, guarded by truthiness checks at runtime (it is undefined when the
  // panel has no saved weathermap yet).
  const wm = useMemo(() => {
    const normalized = normalizeWeathermap(options.weathermap);
    if (normalized && normalized.version !== CURRENT_VERSION) {
      return handleVersionedStateUpdates(JSON.parse(JSON.stringify(normalized)), theme);
    }
    return normalized;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.weathermap, theme]) as Weathermap;

  if (options.weathermap && (!options.weathermap.version || options.weathermap.version !== CURRENT_VERSION)) {
    onOptionsChange({ weathermap: wm });
  }

  // Check for editing-related feature set
  const isEditMode = locationService.getSearch().has('editPanel');

  const [draggedNode, setDraggedNode] = useState(null as unknown as DrawnNode);
  const [selectedNodes, setSelectedNodes] = useState([] as DrawnNode[]);

  // Timeline slider (#158): when scrubbing, holds the selected timestamp (ms).
  // null means "live" — resolve values with the normal value-mapping mode.
  const timelineEnabled = Boolean(wm?.settings?.link?.timeline?.enabled);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  // Clamp the scrub position into the current dashboard range so the label and
  // the resolved data stay in sync even after the time range changes.
  const timeFromMs = timeRange.from.valueOf();
  const timeToMs = timeRange.to.valueOf();
  const effectiveScrub =
    scrubTime === null ? null : Math.min(timeToMs, Math.max(timeFromMs, scrubTime));
  const useTimeline = timelineEnabled && effectiveScrub !== null;

  function getScaleColor(current: number, max: number) {
    const defaultColor = getSolidFromAlphaColor(wm.settings.link.stroke.color, wm.settings.panel.backgroundColor);
    let assignedColor = defaultColor;

    if (wm.settings.colorScaleMode === 'value') {
      wm.scale.forEach((threshold: Threshold) => {
        if (threshold.percent <= current) {
          assignedColor = threshold.color;
        }
      });
    } else {
      if (max === 0) {
        return defaultColor;
      }
      const percent = (current / max) * 100;
      wm.scale.forEach((threshold: Threshold) => {
        if (threshold.percent <= percent) {
          assignedColor = threshold.color;
        }
      });
    }

    return assignedColor;
  }

  function getLinkStroke(currentValue: number, bandwidth: number, fixedStroke: number): number {
    const ds = wm.settings.link.dynamicStroke;
    if (!ds?.enabled || bandwidth === 0) {
      return fixedStroke;
    }
    const pct = Math.min(1, Math.max(0, currentValue / bandwidth));
    return ds.minWidth + (ds.maxWidth - ds.minWidth) * pct;
  }

  // Get a point a percentage of the way between two nodes
  function getPercentPoint(source: Position, target: Position, percent: number): Position {
    const newX = target.x + (source.x - target.x) * percent;
    const newY = target.y + (source.y - target.y) * percent;
    return { x: newX, y: newY };
  }

  // Shift a base point along the (from -> to) direction by `offset`. Lets the
  // arrow "meeting point" sit at an arbitrary base rather than the fixed midpoint.
  function shiftAlong(base: Position, from: Position, to: Position, offset: number): Position {
    const a = to.x - from.x;
    const b = to.y - from.y;
    const dist = Math.sqrt(a * a + b * b);
    if (dist === 0) {
      return { x: base.x, y: base.y };
    }
    return { x: base.x - (offset * a) / dist, y: base.y - (offset * b) / dist };
  }

  // Find the points that create the two other points of a triangle for the arrow's tip
  function getArrowPolygon(_p1: any, _p2: any, height: number, width: number) {
    let h = height;
    let w = width / 2;
    let vec1 = { x: _p2.x - _p1.x, y: _p2.y - _p1.y };
    let length = Math.sqrt(vec1.x * vec1.x + vec1.y * vec1.y);
    if (!isFinite(length) || length === 0) {
      // Overlapping endpoints have no direction; fall back to a fixed unit
      // vector so the SVG never receives NaN coordinates.
      vec1 = { x: 1, y: 0 };
    } else {
      vec1.x = vec1.x / length;
      vec1.y = vec1.y / length;
    }
    let vec2 = { x: -vec1.y, y: vec1.x };
    let v1 = { x: _p2.x - h * vec1.x + w * vec2.x, y: _p2.y - h * vec1.y + w * vec2.y };
    let v2 = { x: _p2.x - h * vec1.x - w * vec2.x, y: _p2.y - h * vec1.y - w * vec2.y };
    return { p1: v1, p2: v2 };
  }

  const [nodes, setNodes] = useState(
    wm
      ? wm.nodes.map((d, i) => {
          return generateDrawnNode(d, i, wm);
        })
      : []
  );

  // To be used to calculate how many links we've drawn
  let tempNodes = nodes.slice();

  const [links, setLinks] = useState(wm ? generateDrawnLinks(wm.links, new Map()) : []);

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
  // Build the drawable links, skipping any whose endpoint nodes are missing.
  function generateDrawnLinks(linkList: Link[], frameMap: Map<string, number>): DrawnLink[] {
    return linkList.flatMap((d, i) => {
      const drawn = generateDrawnLink(d, i, frameMap);
      return drawn ? [drawn] : [];
    });
  }

  function generateDrawnLink(d: Link, i: number, frameMap: Map<string, number>): DrawnLink | null {
    let toReturn: DrawnLink = { ...d, sides: { A: { ...d.sides.A }, Z: { ...d.sides.Z } } } as DrawnLink;
    toReturn.index = i;

    // Resolve Grafana template variables ($var) in all query and link strings
    const tmplSrv = getTemplateSrv();
    (['A', 'Z'] as const).forEach((side) => {
      if (toReturn.sides[side].bandwidthQuery) {
        toReturn.sides[side].bandwidthQuery = tmplSrv?.replace(toReturn.sides[side].bandwidthQuery!) ?? toReturn.sides[side].bandwidthQuery;
      }
      if (toReturn.sides[side].query) {
        toReturn.sides[side].query = tmplSrv?.replace(toReturn.sides[side].query!) ?? toReturn.sides[side].query;
      }
      if (toReturn.sides[side].dashboardLink) {
        toReturn.sides[side].dashboardLink = tmplSrv?.replace(toReturn.sides[side].dashboardLink) ?? toReturn.sides[side].dashboardLink;
      }
    });
    if (toReturn.statusQuery) {
      toReturn.statusQuery = tmplSrv?.replace(toReturn.statusQuery) ?? toReturn.statusQuery;
    }

    const linkValueFormatter = getlinkValueFormatter(
      d.units ? d.units : wm.settings.link.defaultUnits ? wm.settings.link.defaultUnits : 'bps'
    );
    const linkDecimals = wm.settings.link.linkDecimals;

    // Set the link's source and target node. A link referencing a node that no
    // longer exists (hand-edited JSON, partial provisioning) is skipped by the
    // callers rather than crashing the panel on the dereferences below.
    toReturn.source = nodes.filter((n) => n.id === toReturn.nodes[0]?.id)[0];
    toReturn.target = nodes.filter((n) => n.id === toReturn.nodes[1]?.id)[0];
    if (!toReturn.source || !toReturn.target) {
      return null;
    }

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
          let scaledSideValue = linkValueFormatter(toReturn.sides[side].currentValue, linkDecimals);
          toReturn.sides[side].currentValueText = `${scaledSideValue.text} ${scaledSideValue.suffix}`;

          // Get the percentage througput text
          toReturn.sides[side].currentPercentageText =
            toReturn.sides[side].bandwidth > 0
              ? `${((toReturn.sides[side].currentValue / toReturn.sides[side].bandwidth) * 100).toFixed(linkDecimals ?? 2)}%`
              : 'n/a%';
        }
      }

      // Display throughput % when necessary
      if (toReturn.showThroughputPercentage || wm.settings.link.showAllWithPercentage) {
        toReturn.sides[side].currentText = toReturn.sides[side].currentPercentageText;
      } else {
        toReturn.sides[side].currentText = toReturn.sides[side].currentValueText;
      }

      let scaledBandwidth = linkValueFormatter(toReturn.sides[side].bandwidth, linkDecimals);
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

    if (d.linkOffset) {
      const dx = toReturn.lineStartZ.x - toReturn.lineStartA.x;
      const dy = toReturn.lineStartZ.y - toReturn.lineStartA.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        const nx = (-dy / dist) * d.linkOffset;
        const ny = (dx / dist) * d.linkOffset;
        toReturn.lineStartA = { x: toReturn.lineStartA.x + nx, y: toReturn.lineStartA.y + ny };
        toReturn.lineStartZ = { x: toReturn.lineStartZ.x + nx, y: toReturn.lineStartZ.y + ny };
      }
    }

    // The point where the two directional arrows meet. Defaults to the midpoint
    // (50%) but can be shifted along the A->Z line via arrowMeetPercent (#62).
    // Clamped to keep the junction from overlapping either node box.
    const meetPercent = Math.min(95, Math.max(5, d.arrowMeetPercent ?? 50)) / 100;
    const meetPoint: Position = {
      x: toReturn.lineStartA.x + (toReturn.lineStartZ.x - toReturn.lineStartA.x) * meetPercent,
      y: toReturn.lineStartA.y + (toReturn.lineStartZ.y - toReturn.lineStartA.y) * meetPercent,
    };

    toReturn.lineEndA = shiftAlong(
      meetPoint,
      toReturn.lineStartZ,
      toReturn.lineStartA,
      -toReturn.arrows.offset - toReturn.arrows.height
    );

    if (tempNodes[toReturn.target.index].isConnection) {
      toReturn.lineEndA = toReturn.lineStartZ;
      toReturn.lineEndZ = toReturn.lineStartZ;
    }

    toReturn.arrowCenterA = shiftAlong(meetPoint, toReturn.lineStartZ, toReturn.lineStartA, -toReturn.arrows.offset);
    toReturn.arrowPolygonA = getArrowPolygon(
      toReturn.lineStartA,
      toReturn.arrowCenterA,
      toReturn.arrows.height,
      toReturn.arrows.width
    );

    toReturn.lineEndZ = shiftAlong(
      meetPoint,
      toReturn.lineStartZ,
      toReturn.lineStartA,
      toReturn.arrows.offset + toReturn.arrows.height
    );
    toReturn.arrowCenterZ = shiftAlong(meetPoint, toReturn.lineStartZ, toReturn.lineStartA, toReturn.arrows.offset);
    toReturn.arrowPolygonZ = getArrowPolygon(
      toReturn.lineStartZ,
      toReturn.arrowCenterZ,
      toReturn.arrows.height,
      toReturn.arrows.width
    );

    // Single-direction links (#179): one full-length A line ending in one
    // arrow at the Z node edge. VIA middle segments (connection targets) are
    // already full-length with no arrows, so only final segments change.
    if (d.singleDirection && !tempNodes[toReturn.target.index].isConnection) {
      toReturn.lineEndA = shiftAlong(
        toReturn.lineStartZ,
        toReturn.lineStartZ,
        toReturn.lineStartA,
        -toReturn.arrows.height
      );
      toReturn.arrowCenterA = toReturn.lineStartZ;
      toReturn.arrowPolygonA = getArrowPolygon(
        toReturn.lineStartA,
        toReturn.arrowCenterA,
        toReturn.arrows.height,
        toReturn.arrows.width
      );
    }

    if (d.statusQuery) {
      const sv = frameMap.get(d.statusQuery);
      toReturn.isDown = sv === undefined || sv < 1;
    } else {
      toReturn.isDown = false;
    }

    return toReturn;
  }

  // Build the data-frame value map once per data/mode change instead of once per link.
  // Key: display name (from getDataFrameName). Value: resolved numeric value.
  const dataFrameMap = useMemo(() => {
    const mode = wm?.settings?.link?.valueMappingMode;
    const map = new Map<string, number>();
    data.series.forEach((frame) => {
      if (frame.fields.length < 2) {
        return;
      }
      try {
        const fieldValues = getValueField(frame).values as Array<number | null | undefined>;
        const resolvedValue =
          useTimeline && effectiveScrub !== null
            ? valueAtTime(
                getTimeField(frame)?.values as Array<number | null | undefined>,
                fieldValues,
                effectiveScrub
              )
            : aggregateFieldValues(fieldValues, mode);
        map.set(getDataFrameName(frame, data.series), resolvedValue);
      } catch (e) {
        console.warn('Network Weathermap: Error while attempting to access query data.', e);
      }
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, wm?.settings?.link?.valueMappingMode, useTimeline, effectiveScrub]);

  // Minimize uneeded state changes
  const mounted = useRef(false);

  // Update nodes on props/data change
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
    } else if (wm) {
      setNodes(
        wm.nodes.map((d, i) => {
          return generateDrawnNode(d, i, wm);
        })
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, data]);

  tempNodes = nodes.slice();

  // Update links on props/data change
  useEffect(() => {
    if (wm) {
      setLinks(generateDrawnLinks(wm.links, dataFrameMap));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, data, nodes, dataFrameMap]);

  const zoom = (e: WheelEvent) => {
    // Just don't allow zooming when not in edit mode
    if (!isEditMode && !e.shiftKey) {
      return;
    }

    // Use the dominant scroll axis so macOS Shift+scroll (which the OS remaps to
    // horizontal/deltaX) and trackpad gestures still zoom reliably.
    const scroll = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (scroll === 0) {
      return;
    }

    const delta = scroll > 0 ? 1 : -1;
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

  let aspectX = wm ? wm.settings.panel.panelSize.width / width2 : 1;
  let aspectY = wm ? wm.settings.panel.panelSize.height / height2 : 1;
  let aspectMultiplier = Math.max(aspectX, aspectY);

  const updateAspects = () => {
    aspectX = wm ? wm.settings.panel.panelSize.width / width2 : 1;
    aspectY = wm ? wm.settings.panel.panelSize.height / height2 : 1;
    aspectMultiplier = Math.max(aspectX, aspectY);
  };

  const [offset, setOffset] = useState(wm ? wm.settings.panel.offset : { x: 0, y: 0 });

  const drag = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (e.ctrlKey || e.metaKey || e.buttons === 4 || e.shiftKey) {
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

  // Hover highlight (#179): when enabled, hovering a link keeps its whole VIA
  // chain at full opacity and fades every other link and value label.
  const hoverChain =
    wm?.settings.link.hoverHighlight && hoveredLink ? resolveLinkChain(wm.links, hoveredLink.link.id) : null;
  const linkOpacity = (id: string) => (hoverChain && !hoverChain.has(id) ? 0.12 : 1);

  // Zoom-dependent labels (#179): hide value labels once zoomed out past the
  // configured number of wheel steps.
  const labelHideZoom = wm?.settings.link.labelHideZoom ?? 0;
  const hideValueLabels = labelHideZoom > 0 && wm.settings.panel.zoomScale >= labelHideZoom;

  // Label collision avoidance (#179): opt-in greedy pass that nudges value
  // labels along their own link until they stop overlapping each other.
  let collisionOffsets: Map<string, number> | null = null;
  if (wm?.settings.link.labelCollision && !hideValueLabels) {
    const placements: LabelPlacement[] = [];
    const fs = wm.settings.fontSizing.link;
    for (const d of links) {
      if (d.nodes[0].id === d.nodes[1].id) {
        continue;
      }
      placements.push({
        key: `${d.id}:A`,
        segment: { x1: d.lineStartZ.x, y1: d.lineStartZ.y, x2: d.lineStartA.x, y2: d.lineStartA.y },
        offsetPercent: (tempNodes[d.target.index].isConnection ? 1 : 0.5) * d.sides.A.labelOffset,
        width: measureText(`${d.sides.A.currentText}`, fs).width + fs * 1.5,
        height: fs * 2,
      });
      if (!tempNodes[d.target.index].isConnection && !d.singleDirection) {
        placements.push({
          key: `${d.id}:Z`,
          segment: { x1: d.lineStartA.x, y1: d.lineStartA.y, x2: d.lineStartZ.x, y2: d.lineStartZ.y },
          offsetPercent: 0.5 * d.sides.Z.labelOffset,
          width: measureText(`${d.sides.Z.currentText}`, fs).width + fs * 1.5,
          height: fs * 2,
        });
      }
    }
    collisionOffsets = spreadLabels(placements);
  }

  // VIA editing on the canvas (#67): double-click a link to insert a waypoint
  // (a connection node at the link midpoint, which can then be dragged), and
  // right-click a VIA to remove it and merge the two segments back together.
  const handleAddVia = (linkId: string, e: React.MouseEvent<SVGElement>) => {
    if (!isEditMode) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const updated = addViaToLink(wm, linkId, theme);
    onOptionsChange({ ...options, weathermap: updated });
  };

  const handleRemoveVia = (node: DrawnNode, e: React.MouseEvent<SVGElement>) => {
    if (!isEditMode || !node.isConnection) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const updated = removeVia(wm, node.id);
    onOptionsChange({ ...options, weathermap: updated });
  };

  const [hoveredNode, setHoveredNode] = useState(null as unknown as HoveredNode);

  const handleNodeHover = (d: DrawnNode, e: React.MouseEvent<SVGElement>) => {
    // Only show a tooltip when the node actually has metrics configured, and
    // never while a node is being dragged in edit mode. Clear any stale tooltip
    // on the early-return path so it doesn't linger once a drag begins.
    if (e.shiftKey || draggedNode || !d.tooltipMetrics || d.tooltipMetrics.length === 0) {
      setHoveredNode(null as unknown as HoveredNode);
      return;
    }
    let mouseX = e.clientX;
    let mouseY = e.clientY;
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    }
    setHoveredNode({ node: d, mouseX, mouseY });
  };

  const handleNodeHoverLoss = (e: React.MouseEvent<SVGElement>) => {
    if (e.shiftKey) {
      return;
    }
    setHoveredNode(null as unknown as HoveredNode);
  };

  // Resolve the tooltip label for a given link side, preferring an explicit
  // per-side direction label (#70) and falling back to the generic wording.
  const sideDirectionLabel = (link: DrawnLink, side: 'A' | 'Z', fallback: string): string => {
    const label = link.sides[side].directionLabel;
    return label && label.trim() !== '' ? label : fallback;
  };

  // Navigate to a user-provided dashboard link only if it passes URL validation.
  // Values may have been produced by template-variable substitution at runtime,
  // so they are re-sanitized here before ever reaching window.open.
  const openDashboardLink = (rawLink: string, sameTab = false) => {
    const safeLink = sanitizeUrl(rawLink);
    if (safeLink) {
      window.open(safeLink, sameTab ? '_self' : '_blank', 'noopener,noreferrer');
    }
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

  // Build an in-panel notice for query errors or missing data so operators can
  // diagnose problems without opening the browser console. The map still renders
  // underneath; the notice is a non-interactive banner overlaid at the top.
  const dataNotice: { level: 'error' | 'info'; message: string } | null = (() => {
    if (data.state === LoadingState.Error) {
      const message = data.error?.message || data.errors?.[0]?.message || 'A query returned an error.';
      return { level: 'error', message: `Query error: ${message}` };
    }
    // Only warn about missing data when the map actually expects some — i.e. at
    // least one node or link has a query configured. A topology-only map is fine.
    const expectsData = Boolean(
      wm?.links?.some(
        (l) =>
          l.sides.A.query ||
          l.sides.Z.query ||
          l.sides.A.bandwidthQuery ||
          l.sides.Z.bandwidthQuery ||
          l.statusQuery
      ) || wm?.nodes?.some((n) => n.statusQuery)
    );
    if (expectsData && data.series.length === 0 && data.state !== LoadingState.Loading) {
      return {
        level: 'info',
        message:
          'No data returned by the panel’s queries. Check the queries, the data source, and the dashboard time range.',
      };
    }
    return null;
  })();

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
        {dataNotice ? (
          <div
            role="alert"
            data-testid="weathermap-data-notice"
            className={css`
              position: absolute;
              top: 8px;
              left: 50%;
              transform: translateX(-50%);
              max-width: 90%;
              z-index: 9999;
              pointer-events: none;
              padding: 6px 12px;
              border-radius: 4px;
              font-size: 12px;
              text-align: center;
              box-shadow: ${theme.shadows.z1};
              background-color: ${dataNotice.level === 'error'
                ? theme.colors.error.main
                : theme.colors.warning.main};
              color: ${dataNotice.level === 'error'
                ? theme.colors.error.contrastText
                : theme.colors.warning.contrastText};
            `}
          >
            {dataNotice.message}
          </div>
        ) : (
          ''
        )}
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
              {hoveredLink.link.source.label} {hoveredLink.side === 'A' ? '--->' : '<---'}{' '}
              {hoveredLink.link.target.label}
            </div>
            <div style={{ fontSize: wm.settings.tooltip.fontSize }}>
              Usage - {sideDirectionLabel(hoveredLink.link, hoveredLink.side === 'A' ? 'Z' : 'A', 'Inbound')}:{' '}
              {hoveredLink.link.sides[hoveredLink.side === 'A' ? 'Z' : 'A'].currentValueText},{' '}
              {sideDirectionLabel(hoveredLink.link, hoveredLink.side, 'Outbound')}:{' '}
              {hoveredLink.link.sides[hoveredLink.side === 'A' ? 'A' : 'Z'].currentValueText}
            </div>
            <div style={{ fontSize: wm.settings.tooltip.fontSize }}>
              Bandwidth - {sideDirectionLabel(hoveredLink.link, hoveredLink.side === 'A' ? 'Z' : 'A', 'Inbound')}:{' '}
              {hoveredLink.link.sides[hoveredLink.side === 'A' ? 'Z' : 'A'].currentBandwidthText},{' '}
              {sideDirectionLabel(hoveredLink.link, hoveredLink.side, 'Outbound')}:{' '}
              {hoveredLink.link.sides[hoveredLink.side === 'A' ? 'A' : 'Z'].currentBandwidthText}
            </div>
            <div style={{ fontSize: wm.settings.tooltip.fontSize }}>
              Throughput (%) - {sideDirectionLabel(hoveredLink.link, hoveredLink.side === 'A' ? 'Z' : 'A', 'Inbound')}:{' '}
              {hoveredLink.link.sides[hoveredLink.side === 'A' ? 'Z' : 'A'].currentPercentageText},{' '}
              {sideDirectionLabel(hoveredLink.link, hoveredLink.side, 'Outbound')}:{' '}
              {hoveredLink.link.sides[hoveredLink.side === 'A' ? 'A' : 'Z'].currentPercentageText}
            </div>
            {hoveredLink.link.tooltipMetrics && hoveredLink.link.tooltipMetrics.length > 0 && (
              <div style={{ borderTop: `1px solid ${theme.colors.border.medium}`, marginTop: '4px', paddingTop: '4px' }}>
                {hoveredLink.link.tooltipMetrics.map((metric: LinkTooltipMetric, idx: number) => {
                  const fmt = getlinkValueFormatter(
                    metric.units || (hoveredLink.link.units ? hoveredLink.link.units : wm.settings.link.defaultUnits ? wm.settings.link.defaultUnits : 'bps')
                  );
                  const linkDecimals = wm.settings.link.linkDecimals;
                  const inboundVal = metric.queryA ? dataFrameMap.get(metric.queryA) : undefined;
                  const outboundVal = metric.queryZ ? dataFrameMap.get(metric.queryZ) : undefined;
                  const fmtVal = (v: number | undefined) => {
                    if (v === undefined) { return 'n/a'; }
                    const r = fmt(v, linkDecimals);
                    return `${r.text} ${r.suffix}`.trim();
                  };
                  const parts: string[] = [];
                  if (metric.queryA !== undefined && metric.queryA !== '') {
                    parts.push(`${sideDirectionLabel(hoveredLink.link, 'A', 'Inbound')}: ${fmtVal(inboundVal)}`);
                  }
                  if (metric.queryZ !== undefined && metric.queryZ !== '') {
                    parts.push(`${sideDirectionLabel(hoveredLink.link, 'Z', 'Outbound')}: ${fmtVal(outboundVal)}`);
                  }
                  return (
                    <div key={idx} style={{ fontSize: wm.settings.tooltip.fontSize }}>
                      {metric.label}{parts.length > 0 ? ` - ${parts.join(', ')}` : ''}
                    </div>
                  );
                })}
              </div>
            )}
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
                  <div style={{ fontSize: wm.settings.tooltip.fontSize }}>
                    {sideDirectionLabel(hoveredLink.link, 'Z', 'Inbound')}
                  </div>
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
                    {sideDirectionLabel(hoveredLink.link, 'A', 'Outbound')}
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
        {hoveredNode && hoveredNode.node.tooltipMetrics && hoveredNode.node.tooltipMetrics.length > 0 ? (
          <div
            data-testid="weathermap-node-tooltip"
            className={css`
              position: absolute;
              top: ${hoveredNode.mouseY - 10}px;
              left: ${hoveredNode.mouseX + 14}px;
              transform: translate(
                ${hoveredNode.mouseX > width2 * 0.65 ? '-100%' : '0%'},
                ${hoveredNode.mouseY < 120 ? '0%' : '-100%'}
              );
              pointer-events: none;
              background-color: ${wm.settings.tooltip.backgroundColor};
              color: ${wm.settings.tooltip.textColor} !important;
              font-size: ${wm.settings.tooltip.fontSize} !important;
              z-index: 10000;
              display: flex;
              flex-direction: column;
              padding: ${wm.settings.tooltip.fontSize}px;
              border-radius: 4px;
              border: 1px solid ${theme.colors.border.medium};
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
              {hoveredNode.node.label}
            </div>
            {hoveredNode.node.tooltipMetrics.map((metric: NodeTooltipMetric, idx: number) => {
              const fmt = getlinkValueFormatter(metric.units || 'none');
              const raw = metric.query ? dataFrameMap.get(metric.query) : undefined;
              let valueText = 'n/a';
              if (raw !== undefined) {
                const formatted = fmt(raw, wm.settings.link.linkDecimals);
                valueText = `${formatted.text} ${formatted.suffix}`.trim();
              }
              return (
                <div key={idx} style={{ fontSize: wm.settings.tooltip.fontSize }}>
                  {metric.label ? `${metric.label}: ` : ''}
                  {valueText}
                </div>
              );
            })}
          </div>
        ) : (
          ''
        )}
        <ColorScale thresholds={wm.scale} settings={wm.settings} />
        {wm.settings.statusLegend?.enabled && wm.settings.statusLegend.items.length > 0 ? (
          <div
            className={css`
              position: absolute;
              top: ${wm.settings.statusLegend.position.y}%;
              left: ${wm.settings.statusLegend.position.x}%;
              z-index: 2;
              padding: 6px 10px;
              border-radius: 4px;
              background-color: ${theme.colors.background.secondary};
              border: 1px solid ${theme.colors.border.weak};
              font-size: 12px;
              pointer-events: none;
            `}
            data-testid="status-legend"
          >
            {wm.settings.statusLegend.items.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', lineHeight: '18px' }}>
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '2px',
                    backgroundColor: item.color,
                    display: 'inline-block',
                  }}
                ></span>
                {item.label}
              </div>
            ))}
          </div>
        ) : (
          ''
        )}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            backgroundImage:
              wm.settings.panel.backgroundImage &&
              !wm.settings.panel.backgroundImage.attachToCanvas &&
              sanitizeUrl(wm.settings.panel.backgroundImage.url)
                ? `url(${sanitizeUrl(wm.settings.panel.backgroundImage.url)})`
                : 'none',
            backgroundSize: wm.settings.panel.backgroundImage?.fit,
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundColor:
              wm.settings.panel.backgroundImage && !wm.settings.panel.backgroundImage.attachToCanvas
                ? 'none'
                : wm.settings.panel.backgroundColor,
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
            if (isDragging && (e.ctrlKey || e.metaKey || e.buttons === 4 || e.shiftKey)) {
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
          <defs>
            {wm.settings.panel.grid.enabled && (
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
            )}
            {wm.settings.link.flowAnimation?.enabled && (
              <style>{`
                @keyframes link-flow-forward {
                  from { stroke-dashoffset: 15; }
                  to { stroke-dashoffset: 0; }
                }
              `}</style>
            )}
            {links.some((d) => d.isDown && d.statusBlink) && (
              <style>{`
                @keyframes link-blink {
                  0%, 100% { opacity: 1; }
                  50% { opacity: 0.15; }
                }
              `}</style>
            )}
            {wm.settings.link.gradientColor &&
              links.map((d) => (
                <React.Fragment key={d.id}>
                  <linearGradient
                    id={`grad-a-${d.id}`}
                    x1={d.lineStartA.x}
                    y1={d.lineStartA.y}
                    x2={d.lineEndA.x}
                    y2={d.lineEndA.y}
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor={getScaleColor(d.sides.A.currentValue, d.sides.A.bandwidth)} />
                    <stop offset="100%" stopColor={getScaleColor(d.sides.Z.currentValue, d.sides.Z.bandwidth)} />
                  </linearGradient>
                  <linearGradient
                    id={`grad-z-${d.id}`}
                    x1={d.lineStartZ.x}
                    y1={d.lineStartZ.y}
                    x2={d.lineEndZ.x}
                    y2={d.lineEndZ.y}
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor={getScaleColor(d.sides.Z.currentValue, d.sides.Z.bandwidth)} />
                    <stop offset="100%" stopColor={getScaleColor(d.sides.A.currentValue, d.sides.A.bandwidth)} />
                  </linearGradient>
                </React.Fragment>
              ))}
          </defs>
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
            {wm.settings.panel.backgroundImage &&
            wm.settings.panel.backgroundImage.attachToCanvas &&
            sanitizeUrl(wm.settings.panel.backgroundImage.url) ? (
              <image
                href={sanitizeUrl(wm.settings.panel.backgroundImage.url)}
                x={0}
                y={0}
                width={wm.settings.panel.panelSize.width}
                height={wm.settings.panel.panelSize.height}
                preserveAspectRatio={
                  wm.settings.panel.backgroundImage.fit === 'cover'
                    ? 'xMidYMid slice'
                    : wm.settings.panel.backgroundImage.fit === 'auto'
                    ? 'none'
                    : 'xMidYMid meet'
                }
              />
            ) : (
              ''
            )}
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
                    opacity={linkOpacity(d.id)}
                    strokeOpacity={1}
                    width={Math.abs(d.target.x - d.source.x)}
                    height={Math.abs(d.target.y - d.source.y)}
                    style={isEditMode ? { cursor: 'copy' } : undefined}
                    onDoubleClick={(e) => handleAddVia(d.id, e)}
                  >
                    <line
                      strokeWidth={getLinkStroke(d.sides.A.currentValue, d.sides.A.bandwidth, d.stroke)}
                      stroke={
                        d.isDown
                          ? (d.statusDownColor || '#d32f2f')
                          : wm.settings.link.gradientColor
                          ? `url(#grad-a-${d.id})`
                          : getScaleColor(d.sides.A.currentValue, d.sides.A.bandwidth)
                      }
                      strokeDasharray={d.isDown ? '8 4' : undefined}
                      x1={d.lineStartA.x}
                      y1={d.lineStartA.y}
                      x2={d.lineEndA.x}
                      y2={d.lineEndA.y}
                      onMouseMove={(e) => {
                        handleLinkHover(d, 'A', e);
                      }}
                      onMouseOut={handleLinkHoverLoss}
                      onClick={() => {
                        if (!isEditMode && d.sides.A.dashboardLink.length > 0) {
                          openDashboardLink(d.sides.A.dashboardLink);
                        }
                      }}
                      style={{
                        ...(d.sides.A.dashboardLink.length > 0 ? { cursor: 'pointer' } : {}),
                        ...(d.isDown && d.statusBlink
                          ? { animation: 'link-blink 1s ease-in-out infinite' }
                          : wm.settings.link.flowAnimation?.enabled
                          ? {
                              strokeDasharray: '10 5',
                              animation: `link-flow-forward ${wm.settings.link.flowAnimation.speed}s linear infinite`,
                            }
                          : {}),
                      }}
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
                          fill={d.isDown ? (d.statusDownColor || '#d32f2f') : getScaleColor(d.sides.A.currentValue, d.sides.A.bandwidth)}
                          onMouseMove={(e) => {
                            handleLinkHover(d, 'A', e);
                          }}
                          onMouseOut={handleLinkHoverLoss}
                          onClick={() => {
                            if (!isEditMode && d.sides.A.dashboardLink.length > 0) {
                              openDashboardLink(d.sides.A.dashboardLink);
                            }
                          }}
                          style={d.sides.A.dashboardLink.length > 0 ? { cursor: 'pointer' } : {}}
                        ></polygon>
                        {!d.singleDirection && (
                        <React.Fragment>
                        <line
                          strokeWidth={getLinkStroke(d.sides.Z.currentValue, d.sides.Z.bandwidth, d.stroke)}
                          stroke={
                            d.isDown
                              ? (d.statusDownColor || '#d32f2f')
                              : wm.settings.link.gradientColor
                              ? `url(#grad-z-${d.id})`
                              : getScaleColor(d.sides.Z.currentValue, d.sides.Z.bandwidth)
                          }
                          strokeDasharray={d.isDown ? '8 4' : undefined}
                          x1={d.lineStartZ.x}
                          y1={d.lineStartZ.y}
                          x2={d.lineEndZ.x}
                          y2={d.lineEndZ.y}
                          onMouseMove={(e) => {
                            handleLinkHover(d, 'Z', e);
                          }}
                          onMouseOut={handleLinkHoverLoss}
                          onClick={() => {
                            if (!isEditMode && d.sides.Z.dashboardLink.length > 0) {
                              openDashboardLink(d.sides.Z.dashboardLink);
                            }
                          }}
                          style={{
                            ...(d.sides.Z.dashboardLink.length > 0 ? { cursor: 'pointer' } : {}),
                            ...(d.isDown && d.statusBlink
                              ? { animation: 'link-blink 1s ease-in-out infinite' }
                              : wm.settings.link.flowAnimation?.enabled
                              ? {
                                  strokeDasharray: '10 5',
                                  animation: `link-flow-forward ${wm.settings.link.flowAnimation.speed}s linear infinite`,
                                }
                              : {}),
                          }}
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
                          fill={d.isDown ? (d.statusDownColor || '#d32f2f') : getScaleColor(d.sides.Z.currentValue, d.sides.Z.bandwidth)}
                          onMouseMove={(e) => {
                            handleLinkHover(d, 'Z', e);
                          }}
                          onMouseOut={handleLinkHoverLoss}
                          onClick={() => {
                            if (!isEditMode && d.sides.Z.dashboardLink.length > 0) {
                              openDashboardLink(d.sides.Z.dashboardLink);
                            }
                          }}
                          style={d.sides.Z.dashboardLink.length > 0 ? { cursor: 'pointer' } : {}}
                        ></polygon>
                        </React.Fragment>
                        )}
                      </React.Fragment>
                    )}
                  </g>
                );
              })}
            </g>
            <g>
              {links.map((d, i) => {
                if (d.nodes[0].id === d.nodes[1].id || hideValueLabels) {
                  return;
                }
                const aPct =
                  collisionOffsets?.get(`${d.id}:A`) ??
                  (tempNodes[d.target.index].isConnection ? 1 : 0.5) * d.sides.A.labelOffset;
                const transform = getPercentPoint(d.lineStartZ, d.lineStartA, aPct / 100);
                return (
                  <g
                    fontStyle={'italic'}
                    opacity={linkOpacity(d.id)}
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
                if (
                  d.nodes[0].id === d.nodes[1].id ||
                  tempNodes[d.target.index].isConnection ||
                  d.singleDirection ||
                  hideValueLabels
                ) {
                  return;
                }
                const zPct = collisionOffsets?.get(`${d.id}:Z`) ?? 0.5 * d.sides.Z.labelOffset;
                const transform = getPercentPoint(d.lineStartA, d.lineStartZ, zPct / 100);
                return (
                  <g
                    fontStyle={'italic'}
                    opacity={linkOpacity(d.id)}
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
              {links.map((d, i) => {
                if (d.nodes[0].id === d.nodes[1].id) {
                  return;
                }
                const dx = d.lineEndA.x - d.lineStartA.x;
                const dy = d.lineEndA.y - d.lineStartA.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len === 0) {
                  return;
                }
                let angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
                const flipped = angleDeg > 90 || angleDeg < -90;
                if (flipped) {
                  angleDeg += 180;
                }
                const perpOffset = -(d.stroke / 2 + wm.settings.fontSizing.link / 2 + 2);
                const labelDist = Math.min(len * 0.25, 30);

                const aPosX = d.lineStartA.x + (dx / len) * labelDist;
                const aPosY = d.lineStartA.y + (dy / len) * labelDist;

                const zdx = d.lineEndZ.x - d.lineStartZ.x;
                const zdy = d.lineEndZ.y - d.lineStartZ.y;
                const zlen = Math.sqrt(zdx * zdx + zdy * zdy);
                const zPosX = zlen > 0 ? d.lineStartZ.x + (zdx / zlen) * labelDist : d.lineStartZ.x;
                const zPosY = zlen > 0 ? d.lineStartZ.y + (zdy / zlen) * labelDist : d.lineStartZ.y;

                return (
                  <React.Fragment key={i}>
                    {d.sides.A.portLabel && (
                      <g transform={`translate(${aPosX},${aPosY}) rotate(${angleDeg})`}>
                        <text
                          x={0}
                          y={perpOffset}
                          textAnchor="middle"
                          dominantBaseline="auto"
                          fontSize={`${wm.settings.fontSizing.link}px`}
                          fill={wm.settings.link.label.font}
                          className={styles.noSelect}
                        >
                          {d.sides.A.portLabel}
                        </text>
                      </g>
                    )}
                    {d.sides.Z.portLabel && (
                      <g transform={`translate(${zPosX},${zPosY}) rotate(${angleDeg})`}>
                        <text
                          x={0}
                          y={flipped ? -perpOffset : perpOffset}
                          textAnchor="middle"
                          dominantBaseline="auto"
                          fontSize={`${wm.settings.fontSizing.link}px`}
                          fill={wm.settings.link.label.font}
                          className={styles.noSelect}
                        >
                          {d.sides.Z.portLabel}
                        </text>
                      </g>
                    )}
                  </React.Fragment>
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
                      if (e.ctrlKey || e.metaKey) {
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
                      setLinks(generateDrawnLinks(wm.links, dataFrameMap));
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
                      if ((e.ctrlKey || e.metaKey) && isEditMode) {
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
                        openDashboardLink(tempNodes[i].dashboardLink, tempNodes[i].openInSameTab);
                      }
                      // Force an update
                      onOptionsChange(options);
                    },
                    onMouseMove: (e) => handleNodeHover(d, e),
                    onMouseLeave: (e) => handleNodeHoverLoss(e),
                    onContextMenu: (e) => handleRemoveVia(d, e),
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
        {timelineEnabled &&
          (() => {
            const fromMs = timeFromMs;
            const toMs = timeToMs;
            // Guard against a degenerate/inverted range (would make an invalid slider).
            if (!(toMs > fromMs)) {
              return null;
            }
            const current = effectiveScrub ?? toMs;
            const step = Math.max(1, Math.round((toMs - fromMs) / 500));
            return (
              <div
                data-testid="weathermap-timeline"
                className={css`
                  position: absolute;
                  bottom: 0;
                  left: 0;
                  right: 0;
                  display: flex;
                  align-items: center;
                  gap: 8px;
                  padding: 6px 10px;
                  background-color: ${theme.colors.background.secondary};
                  border-top: 1px solid ${theme.colors.border.weak};
                `}
              >
                <span style={{ fontSize: '12px', whiteSpace: 'nowrap', minWidth: '128px' }}>
                  {useTimeline ? dateTimeFormat(current, { timeZone: getTimeZone() }) : 'Live (latest)'}
                </span>
                <div style={{ flex: '1 1 auto' }}>
                  <Slider
                    min={fromMs}
                    max={toMs}
                    step={step}
                    value={current}
                    onChange={(v) => setScrubTime(v)}
                  />
                </div>
                <Button variant="secondary" size="sm" disabled={!useTimeline} onClick={() => setScrubTime(null)}>
                  Live
                </Button>
              </div>
            );
          })()}
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
    noSelect: css`
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      user-select: none;
    `,
  };
};
