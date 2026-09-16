import React, { memo } from 'react';
import { DataFrame, Field, FieldType, getValueFormat, PanelData, TimeRange } from '@grafana/data';
import { LegendDisplayMode, TimeSeries, TooltipDisplayMode, TooltipPlugin } from '@grafana/ui';
import { TooltipOptions } from '../types';
import { getTimeField, getValueSeries } from '../utils';

interface Props {
  data: PanelData;
  queryA?: string;
  queryZ?: string;
  timeRange: TimeRange;
  timeZone: string;
  settings: TooltipOptions;
  bandwidth: number;
  units: string;
  inboundLabel: string;
  outboundLabel: string;
}

const getlinkGraphFormatter =
  (fmt_id: string) =>
  (v: any): string => {
    let formatter = getValueFormat(fmt_id);
    let formattedValue = formatter(v);
    return `${formattedValue.text} ${formattedValue.suffix}`;
  };

// Cursor position belongs to the tooltip wrapper. Keep the chart's inputs
// independent of it so pointer movement cannot rebuild Grafana's plot (#365).
export const LinkTooltipGraph = memo(function LinkTooltipGraph({
  data,
  queryA,
  queryZ,
  timeRange,
  timeZone,
  settings,
  bandwidth,
  units,
  inboundLabel,
  outboundLabel,
}: Props) {
  // Depend on the data snapshot, too: a refresh can reuse its series array.
  const { series } = data;
  // Tooltip graph series: one slim frame (time + value field) per value series
  // bound to the hovered link. Wide frames (#260) can carry both bound series —
  // or unrelated ones — inside a single frame, so matching happens per value
  // field rather than per frame, and only the matching field is graphed.
  const filteredGraphSeries: Array<{ frame: DataFrame; isInbound: boolean }> = [];
  if (queryA || queryZ) {
    for (const frame of series) {
      let valueSeries: Array<{ name: string; field: Field }> = [];
      try {
        valueSeries = getValueSeries(frame, series);
      } catch (e) {
        console.warn('Network Weathermap: Error while attempting to access query data.', e);
        continue;
      }
      const timeField = getTimeField(frame);
      for (const { name, field } of valueSeries) {
        if (name !== queryA && name !== queryZ) {
          continue;
        }
        // Grafana's <TimeSeries> requires an x field of FieldType.time and
        // crashes on hover when none exists (#364). getTimeField's epoch-ms
        // fallback returns a number-typed field (e.g. Infinity's table parser
        // leaves "Time" as a plain number), so the slim copy retypes it to
        // time — dropping the inherited display processor, which was built for
        // a number field and would render the graph-tooltip timestamp as an
        // SI-abbreviated number. Frames with no usable time axis — or where
        // the fallback is the value field itself — keep the text tooltip but
        // skip the graph.
        if (!timeField || timeField === field) {
          continue;
        }
        filteredGraphSeries.push({
          frame: {
            ...frame,
            fields: [
              timeField.type === FieldType.time
                ? timeField
                : { ...timeField, type: FieldType.time, display: undefined },
              field,
            ],
          },
          isInbound: name === queryZ,
        });
      }
    }
  }

  if (filteredGraphSeries.length === 0) {
    return null;
  }

  return (
    <React.Fragment>
      <TimeSeries
        width={250}
        height={100}
        timeRange={timeRange}
        timeZone={timeZone}
        frames={filteredGraphSeries.map(({ frame, isInbound }) => {
          const lineColor = isInbound ? settings.inboundColor : settings.outboundColor;
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
          if (settings.scaleToBandwidth && bandwidth > 0) {
            opts.softMax = bandwidth;
          }
          return opts;
        }}
        tweakAxis={(opts, forField: Field) => {
          // Only format the value (y) axis — leave the time axis alone.
          if (forField.type !== FieldType.number) {
            return opts;
          }
          opts.formatValue = getlinkGraphFormatter(units);
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
                timeZone={timeZone}
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
            background: settings.inboundColor,
            paddingLeft: '5px',
            marginRight: '4px',
          }}
        ></div>
        <div style={{ fontSize: settings.fontSize }}>{inboundLabel}</div>
        <div
          style={{
            width: '10px',
            height: '3px',
            background: settings.outboundColor,
            marginLeft: '10px',
            marginRight: '4px',
          }}
        ></div>
        <div
          style={{
            fontSize: settings.fontSize,
          }}
        >
          {outboundLabel}
        </div>
      </div>
    </React.Fragment>
  );
});
