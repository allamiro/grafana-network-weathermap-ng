import React from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Anchor, Weathermap } from 'types';
import { NodeForm } from './NodeForm';
import { LinkForm } from './LinkForm';
import { ColorForm } from './ColorForm';
import { PanelForm } from './PanelForm';
import { v4 as uuidv4 } from 'uuid';
import { useTheme2 } from '@grafana/ui';
import { generateBasicNode, CURRENT_VERSION, generateBasicLink, handleVersionedStateUpdates } from 'utils';

interface Settings {
  placeholder: string;
}

interface Props extends StandardEditorProps<Weathermap, Settings> {}

export const WeathermapBuilder = (props: Props) => {
  const theme = useTheme2();

  const defaultNodes = [generateBasicNode('Node A', [200, 300], theme), generateBasicNode('Node B', [400, 300], theme)];

  const defaultValue: Weathermap = {
    version: CURRENT_VERSION,
    id: uuidv4(),
    nodes: defaultNodes.map((d, i) => {
      let v = d;
      v.anchors[i === 0 ? Anchor.Right : Anchor.Left].numLinks = 1;
      return v;
    }),
    links: [generateBasicLink([defaultNodes[0], defaultNodes[1]])],
    scale: [],
    settings: {
      link: {
        spacing: {
          horizontal: 10,
          vertical: 5,
        },
        stroke: {
          color: theme.colors.secondary.main,
        },
        label: {
          background: theme.colors.secondary.main,
          border: theme.colors.secondary.border,
          font: theme.colors.secondary.contrastText,
        },
        showAllWithPercentage: false,
        dynamicStroke: { enabled: false, minWidth: 1, maxWidth: 10 },
        flowAnimation: { enabled: false, speed: 2 },
        gradientColor: false,
      },
      fontSizing: {
        node: 10,
        link: 7,
      },
      panel: {
        backgroundColor: theme.colors.background.primary,
        showTimestamp: true,
        panelSize: {
          width: 600,
          height: 600,
        },
        zoomScale: 0,
        offset: {
          x: 0,
          y: 0,
        },
        grid: {
          enabled: false,
          size: 10,
          guidesEnabled: false,
        },
      },
      tooltip: {
        fontSize: 9,
        textColor: 'white',
        backgroundColor: theme.colors.background.canvas,
        inboundColor: '#00cf00',
        outboundColor: '#fade2a',
        scaleToBandwidth: false,
      },
      scale: {
        position: {
          x: 0,
          y: 0,
        },
        size: {
          width: 50,
          height: 200,
        },
        title: 'Traffic Load',
        fontSizing: {
          title: 16,
          threshold: 12,
        },
      },
    },
  };

  // onChange does not update props.value within this render pass, so the child
  // forms must also receive the migrated options directly — otherwise they
  // crash on settings (e.g. tooltip, scale) that older saved dashboards lack (#162).
  // The migrated/default value is computed for render here and persisted in the
  // effect below: calling onChange during render is illegal in React and the
  // old code also let the migration mutate props.value in place (#199).
  const value = props.value;
  const wm = React.useMemo(() => {
    if (!value) {
      return defaultValue;
    }
    if (!value.version || value.version !== CURRENT_VERSION) {
      return handleVersionedStateUpdates(value, theme);
    }
    return value;
    // defaultValue is a per-render literal; memoizing on value/theme keeps the
    // computed default referentially stable so the persist effect fires once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, theme]);

  React.useEffect(() => {
    // Only persist when render had to substitute a default or migrated copy.
    // Once the write lands, wm === value and this effect goes quiet.
    if (wm !== value) {
      props.onChange(wm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wm, value]);

  return (
    <React.Fragment>
      <NodeForm {...props} value={wm}></NodeForm>
      <LinkForm {...props} value={wm}></LinkForm>
      <ColorForm {...props} value={wm}></ColorForm>
      <PanelForm {...props} value={wm}></PanelForm>
    </React.Fragment>
  );
};
