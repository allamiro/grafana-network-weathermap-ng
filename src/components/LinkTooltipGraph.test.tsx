import React from 'react';
import { dateTime, FieldType, getTimeZone, LoadingState, PanelData, toDataFrame } from '@grafana/data';
import * as grafanaUi from '@grafana/ui';
import { render } from '@testing-library/react';
import { LinkTooltipGraph } from './LinkTooltipGraph';

describe('LinkTooltipGraph', () => {
  test('repeated mount and unmount cycles preserve series matching and render graph without field state corruption', () => {
    const frame = toDataFrame({
      name: 'Traffic',
      refId: 'Traffic',
      fields: [
        { name: 'time', type: FieldType.time, values: [1000, 2000] },
        { name: 'value', type: FieldType.number, values: [10, 20], labels: { metric: 'router-a: 10104' } },
        { name: 'value', type: FieldType.number, values: [30, 40], labels: { metric: 'router-a: 10105' } },
      ],
    });

    const otherFrame = toDataFrame({
      name: 'Link Status',
      refId: 'Link Status',
      fields: [
        { name: 'time', type: FieldType.time, values: [1000, 2000] },
        { name: 'value', type: FieldType.number, values: [1, 1], labels: { metric: 'status' } },
      ],
    });

    const timeRange = { from: dateTime(1000), to: dateTime(2000), raw: { from: 'now-1h', to: 'now' } };
    const data: PanelData = {
      state: LoadingState.Done,
      series: [frame, otherFrame],
      timeRange,
    };

    const defaultProps = {
      data,
      queryA: 'Traffic value router-a: 10105',
      queryZ: 'Traffic value router-a: 10104',
      timeRange,
      timeZone: getTimeZone(),
      settings: {
        inboundColor: '#00ff00',
        outboundColor: '#0000ff',
        fontSize: 12,
        scaleToBandwidth: false,
      } as any,
      bandwidth: 1000000000,
      units: 'bps',
      inboundLabel: 'Inbound',
      outboundLabel: 'Outbound',
    };

    const expectedFrameStates = [
      undefined,
      { displayName: 'Traffic value router-a: 10104', multipleFrames: true },
      { displayName: 'Traffic value router-a: 10105', multipleFrames: true },
    ];
    const expectedOtherFrameStates = [undefined, { displayName: 'Link Status value status', multipleFrames: true }];

    const timeSeriesSpy = jest.spyOn(grafanaUi, 'TimeSeries');

    try {
      for (let cycle = 1; cycle <= 5; cycle++) {
        const { unmount, container } = render(<LinkTooltipGraph {...defaultProps} />);

        const canvas = container.querySelector('canvas');
        expect(canvas).toBeInTheDocument();
        expect(container.querySelectorAll('.u-cursor-pt')).toHaveLength(2);

        expect(timeSeriesSpy).toHaveBeenCalledTimes(cycle);
        const { frames } = timeSeriesSpy.mock.calls[cycle - 1][0];
        expect(frames).toHaveLength(2);

        const inboundFrame = frames.find((f) => f.fields.some((field) => field.labels?.metric === 'router-a: 10104'));
        expect(inboundFrame).toBeDefined();
        const inboundValueField = inboundFrame?.fields.find((field) => field.name === 'value');
        expect(inboundValueField?.config?.custom?.lineColor).toBe(defaultProps.settings.inboundColor);

        const outboundFrame = frames.find((f) => f.fields.some((field) => field.labels?.metric === 'router-a: 10105'));
        expect(outboundFrame).toBeDefined();
        const outboundValueField = outboundFrame?.fields.find((field) => field.name === 'value');
        expect(outboundValueField?.config?.custom?.lineColor).toBe(defaultProps.settings.outboundColor);

        // Verify that source fields in data.series remain unmodified without TimeSeries state corruption.
        expect(frame.fields.map((f) => f.state)).toEqual(expectedFrameStates);
        expect(otherFrame.fields.map((f) => f.state)).toEqual(expectedOtherFrameStates);

        unmount();
      }
    } finally {
      timeSeriesSpy.mockRestore();
    }
  });
});
