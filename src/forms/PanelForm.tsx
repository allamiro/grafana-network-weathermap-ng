import React from 'react';
import {
  Button,
  ColorPicker,
  InlineField,
  InlineFieldRow,
  InlineLabel,
  InlineSwitch,
  Input,
  Select,
  Slider,
  useStyles2,
  UnitPicker,
} from '@grafana/ui';
import { GrafanaTheme2, StandardEditorProps } from '@grafana/data';
import { Weathermap, ValueMappingMode } from 'types';
import { v4 as uuidv4 } from 'uuid';
import { FormDivider } from './FormDivider';
import { css } from '@emotion/css';
import { finiteOrFallback, sanitizeUrl } from 'utils';
import { createRailBaselineBackground, RAIL_BASELINE_BACKGROUND_URL } from '../rail/defaults';
import { normalizeMapMode } from '../rail/normalize';

interface Settings {}

interface Props extends StandardEditorProps<Weathermap, Settings> {}

export const PanelForm = ({ value, onChange }: Props) => {
  const styles = useStyles2(getStyles);

  // Immutable panel-settings update (#225): clone the settings path so
  // onChange delivers new references instead of mutating props.value.
  const updatePanelSettings = (patch: Partial<Weathermap['settings']['panel']>) => {
    onChange({
      ...value,
      settings: { ...value.settings, panel: { ...value.settings.panel, ...patch } },
    });
  };

  const handleColorChange = (color: string) => {
    let options = structuredClone(value);
    if (!color.startsWith('image') && options.settings.panel.backgroundColor.startsWith('image')) {
      options.settings.panel.backgroundColor =
        'image|' + color + '|' + options.settings.panel.backgroundColor.split('|', 3)[2];
    } else {
      options.settings.panel.backgroundColor = color;
    }
    onChange(options);
  };

  if (value) {
    return (
      <React.Fragment>
        <FormDivider title="Panel" />
        <InlineField grow label="Background:" className={styles.inlineField}>
          <React.Fragment></React.Fragment>
        </InlineField>
        <InlineLabel width={'auto'} style={{ marginBottom: '4px', marginLeft: '12px' }}>
          - Color:
          <ColorPicker
            color={
              value.settings.panel.backgroundColor.startsWith('image')
                ? value.settings.panel.backgroundColor.split('|', 3)[1]
                : value.settings.panel.backgroundColor
            }
            onChange={handleColorChange}
          />
        </InlineLabel>
        <InlineField grow label={'- Image:'} style={{ marginBottom: '4px', marginLeft: '12px' }}>
          {value.settings.panel.backgroundImage ? (
            <Button
              variant="destructive"
              size="md"
              icon="trash-alt"
              onClick={() => {
                if (!confirm('Are you sure you want remove the background image?')) {
                  return;
                }
                let options = structuredClone(value);
                options.settings.panel.backgroundImage = undefined;
                onChange(options);
              }}
              style={{ justifyContent: 'center' }}
            ></Button>
          ) : (
            <Button
              onClick={() => {
                let options = structuredClone(value);
                options.settings.panel.backgroundImage = {
                  url: '',
                  fit: 'contain',
                };
                onChange(options);
              }}
              icon="plus"
              style={{ justifyContent: 'center' }}
            ></Button>
          )}
        </InlineField>
        {value.settings.panel.backgroundImage ? (
          <>
            <InlineField grow label="Image Source" className={styles.inlineField} style={{ marginLeft: '24px' }}>
              <Input
                value={value.settings.panel.backgroundImage.url}
                placeholder={'https://example.com/background.jpg'}
                type={'text'}
                name={'bgImageURL'}
                onChange={(e) => {
                  let options = structuredClone(value);
                  if (options.settings.panel.backgroundImage) {
                    options.settings.panel.backgroundImage.url = sanitizeUrl(e.currentTarget.value);
                  }
                  onChange(options);
                }}
              ></Input>
            </InlineField>
            <InlineField grow label="Image Fit" className={styles.inlineField} style={{ marginLeft: '24px' }}>
              <Select
                onChange={(v) => {
                  let options = structuredClone(value);
                  if (options.settings.panel.backgroundImage) {
                    options.settings.panel.backgroundImage.fit = v.value ? v.value : 'contain';
                  }
                  onChange(options);
                }}
                value={value.settings.panel.backgroundImage.fit}
                options={['contain', 'cover', 'auto'].map((s) => {
                  return { label: s, value: s };
                })}
                placeholder={'Select image fit'}
              ></Select>
            </InlineField>
            <InlineField
              grow
              label="Move With Map"
              className={styles.inlineField}
              style={{ marginLeft: '24px' }}
              tooltip={'Attach the background image to the map canvas so it pans and zooms with the nodes and links instead of staying fixed.'}
            >
              <InlineSwitch
                value={value.settings.panel.backgroundImage.attachToCanvas ?? false}
                onChange={(e) => {
                  let options = structuredClone(value);
                  if (options.settings.panel.backgroundImage) {
                    options.settings.panel.backgroundImage.attachToCanvas = e.currentTarget.checked;
                  }
                  onChange(options);
                }}
              />
            </InlineField>
          </>
        ) : (
          ''
        )}
        <InlineField grow label="Viewbox Width (px)" className={styles.inlineField}>
          <Input
            value={value.settings.panel.panelSize.width}
            placeholder={'Panel Width'}
            type={'number'}
            name={'panelWidth'}
            onChange={(e) => {
              updatePanelSettings({
                panelSize: {
                  ...value.settings.panel.panelSize,
                  width: finiteOrFallback(e.currentTarget.valueAsNumber, value.settings.panel.panelSize.width),
                },
              });
            }}
          ></Input>
        </InlineField>
        <InlineField grow label="Viewbox Height (px)" className={styles.inlineField}>
          <Input
            value={value.settings.panel.panelSize.height}
            placeholder={'Panel Height'}
            type={'number'}
            name={'panelHeight'}
            onChange={(e) => {
              updatePanelSettings({
                panelSize: {
                  ...value.settings.panel.panelSize,
                  height: finiteOrFallback(e.currentTarget.valueAsNumber, value.settings.panel.panelSize.height),
                },
              });
            }}
          ></Input>
        </InlineField>
        <InlineField grow label="Zoom Scale" className={styles.inlineField}>
          <Input
            value={value.settings.panel.zoomScale}
            placeholder={'Zoom Scale'}
            type={'number'}
            onChange={(e) => {
              updatePanelSettings({
                zoomScale: finiteOrFallback(e.currentTarget.valueAsNumber, value.settings.panel.zoomScale),
              });
            }}
          ></Input>
        </InlineField>
        <InlineField grow label="View Offset X" className={styles.inlineField}>
          <Input
            value={value.settings.panel.offset.x}
            placeholder={'Offset X'}
            type={'number'}
            onChange={(e) => {
              updatePanelSettings({
                offset: {
                  ...value.settings.panel.offset,
                  x: finiteOrFallback(e.currentTarget.valueAsNumber, value.settings.panel.offset.x),
                },
              });
            }}
          ></Input>
        </InlineField>
        <InlineField grow label="View Offset Y" className={styles.inlineField}>
          <Input
            value={value.settings.panel.offset.y}
            placeholder={'Offset Y'}
            type={'number'}
            onChange={(e) => {
              updatePanelSettings({
                offset: {
                  ...value.settings.panel.offset,
                  y: finiteOrFallback(e.currentTarget.valueAsNumber, value.settings.panel.offset.y),
                },
              });
            }}
          ></Input>
        </InlineField>
        <InlineField grow label={'Display Timestamp'}>
          <InlineSwitch
            value={value.settings.panel.showTimestamp}
            onChange={(e) => {
              let wm = structuredClone(value);
              wm.settings.panel.showTimestamp = e.currentTarget.checked;
              onChange(wm);
            }}
          />
        </InlineField>
        <FormDivider title="Link Options" />
        <InlineField grow label={'Toggle all as Percentage Throughput'}>
          <InlineSwitch
            value={value.settings.link.showAllWithPercentage}
            onChange={(e) => {
              let wm = structuredClone(value);
              wm.settings.link.showAllWithPercentage = e.currentTarget.checked;
              onChange(wm);
            }}
          />
        </InlineField>
        <InlineField
          grow
          label={'Value Display Mode'}
          tooltip={'How each metric value is resolved across the selected dashboard time range: the most recent point, or an aggregate (average, minimum, maximum, or 95th percentile) over the whole range.'}
        >
          <Select
            options={[
              { label: 'Last', value: 'last', description: 'Use the most recent data point' },
              { label: 'Average', value: 'avg', description: 'Mean of all data points in the time range' },
              { label: 'Min', value: 'min', description: 'Smallest value in the time range' },
              { label: 'Max', value: 'max', description: 'Largest value in the time range' },
              { label: '95th Percentile', value: 'p95', description: '95th percentile over the time range' },
            ]}
            value={value.settings.link.valueMappingMode ?? 'last'}
            onChange={(selected) => {
              let wm = structuredClone(value);
              wm.settings.link.valueMappingMode = selected.value as ValueMappingMode;
              onChange(wm);
            }}
          />
        </InlineField>
        <InlineField
          grow
          label={'Timeline Slider'}
          tooltip={'Show a slider at the bottom of the panel to scrub through the selected time range and view link values as they were at that moment.'}
        >
          <InlineSwitch
            value={value.settings.link.timeline?.enabled ?? false}
            onChange={(e) => {
              let wm = structuredClone(value);
              wm.settings.link.timeline = { enabled: e.currentTarget.checked };
              onChange(wm);
            }}
          />
        </InlineField>
        <InlineField grow label={'Default Link Units'}>
          <UnitPicker
            onChange={(val) => {
              let wm = structuredClone(value);
              wm.settings.link.defaultUnits = val;
              onChange(wm);
            }}
            value={value.settings.link.defaultUnits ? value.settings.link.defaultUnits : 'bps'}
          />
        </InlineField>
        <InlineField grow label={'Link Value Decimal Places'} tooltip={'Number of decimal places for throughput labels and percentage values. Leave blank for automatic precision.'}>
          <Input
            type="number"
            min={0}
            max={10}
            placeholder="auto"
            value={value.settings.link.linkDecimals ?? ''}
            onChange={(e) => {
              let wm = structuredClone(value);
              const v = e.currentTarget.valueAsNumber;
              wm.settings.link.linkDecimals = isNaN(v) ? undefined : Math.max(0, Math.floor(v));
              onChange(wm);
            }}
          />
        </InlineField>
        <InlineField grow label={'Reset All Links to Default Units'}>
          <Button
            variant="destructive"
            size="md"
            icon="trash-alt"
            onClick={() => {
              if (!confirm('Are you sure you want to reset all link units?')) {
                return;
              }
              let options = structuredClone(value);
              for (let l of options.links) {
                l.units = undefined;
              }
              onChange(options);
            }}
            style={{ justifyContent: 'center' }}
          ></Button>
        </InlineField>

        <InlineLabel width="auto" style={{ marginBottom: '4px' }}>
          Base Color:
          <ColorPicker
            color={value.settings.link.stroke.color}
            onChange={(color) => {
              let options = structuredClone(value);
              options.settings.link.stroke.color = color;
              onChange(options);
            }}
          />
        </InlineLabel>
        <InlineField grow label="Link Spacing Horizontal" className={styles.inlineField}>
          <Slider
            min={0}
            max={30}
            value={value.settings.link.spacing.horizontal}
            step={1}
            onChange={(num) => {
              let options = structuredClone(value);
              options.settings.link.spacing.horizontal = num;
              onChange(options);
            }}
          />
        </InlineField>
        <InlineField grow label="Link Spacing Vertical" className={styles.inlineField}>
          <Slider
            min={0}
            max={30}
            value={value.settings.link.spacing.vertical}
            step={1}
            onChange={(num) => {
              let options = structuredClone(value);
              options.settings.link.spacing.vertical = num;
              onChange(options);
            }}
          />
        </InlineField>
        <InlineLabel width="auto" style={{ marginBottom: '4px' }}>
          Label Background Color:
          <ColorPicker
            color={value.settings.link.label.background}
            onChange={(color) => {
              let options = structuredClone(value);
              options.settings.link.label.background = color;
              onChange(options);
            }}
          />
        </InlineLabel>
        <InlineLabel width="auto" style={{ marginBottom: '4px' }}>
          Label Border Color:
          <ColorPicker
            color={value.settings.link.label.border}
            onChange={(color) => {
              let options = structuredClone(value);
              options.settings.link.label.border = color;
              onChange(options);
            }}
          />
        </InlineLabel>
        <InlineLabel width="auto" style={{ marginBottom: '4px' }}>
          Label Font Color:
          <ColorPicker
            color={value.settings.link.label.font}
            onChange={(color) => {
              let options = structuredClone(value);
              options.settings.link.label.font = color;
              onChange(options);
            }}
          />
        </InlineLabel>
        <FormDivider title="Arrow Options" />

        <FormDivider title="Link Visualization" />
        <InlineField grow label="Gradient Color" tooltip="Blend A-side and Z-side utilization colors along each link" className={styles.inlineField}>
          <InlineSwitch
            value={value.settings.link.gradientColor ?? false}
            onChange={(e) => {
              let options = structuredClone(value);
              options.settings.link.gradientColor = e.currentTarget.checked;
              onChange(options);
            }}
          />
        </InlineField>
        <InlineField grow label="Flow Animation" tooltip="Animate dashes along each link to indicate traffic direction" className={styles.inlineField}>
          <InlineSwitch
            value={value.settings.link.flowAnimation?.enabled ?? false}
            onChange={(e) => {
              let options = structuredClone(value);
              if (!options.settings.link.flowAnimation) {
                options.settings.link.flowAnimation = { enabled: false, speed: 2 };
              }
              options.settings.link.flowAnimation.enabled = e.currentTarget.checked;
              onChange(options);
            }}
          />
        </InlineField>
        {value.settings.link.flowAnimation?.enabled && (
          <InlineField grow label="Animation Speed (s)" tooltip="Duration in seconds for one full animation cycle" className={styles.inlineField}>
            <Slider
              min={0.5}
              max={10}
              value={value.settings.link.flowAnimation?.speed ?? 2}
              step={0.5}
              onChange={(num) => {
                let options = structuredClone(value);
                if (!options.settings.link.flowAnimation) {
                  options.settings.link.flowAnimation = { enabled: true, speed: 2 };
                }
                options.settings.link.flowAnimation.speed = num;
                onChange(options);
              }}
            />
          </InlineField>
        )}
        <InlineField grow label="Dynamic Stroke Width" tooltip="Scale link thickness with traffic utilization instead of using a fixed stroke" className={styles.inlineField}>
          <InlineSwitch
            value={value.settings.link.dynamicStroke?.enabled ?? false}
            onChange={(e) => {
              let options = structuredClone(value);
              if (!options.settings.link.dynamicStroke) {
                options.settings.link.dynamicStroke = { enabled: false, minWidth: 1, maxWidth: 10 };
              }
              options.settings.link.dynamicStroke.enabled = e.currentTarget.checked;
              onChange(options);
            }}
          />
        </InlineField>
        {value.settings.link.dynamicStroke?.enabled && (
          <>
            <InlineField grow label="Min Stroke Width" className={styles.inlineField}>
              <Slider
                min={1}
                max={20}
                value={value.settings.link.dynamicStroke?.minWidth ?? 1}
                step={1}
                onChange={(num) => {
                  let options = structuredClone(value);
                  options.settings.link.dynamicStroke!.minWidth = num;
                  onChange(options);
                }}
              />
            </InlineField>
            <InlineField grow label="Max Stroke Width" className={styles.inlineField}>
              <Slider
                min={1}
                max={30}
                value={value.settings.link.dynamicStroke?.maxWidth ?? 10}
                step={1}
                onChange={(num) => {
                  let options = structuredClone(value);
                  options.settings.link.dynamicStroke!.maxWidth = num;
                  onChange(options);
                }}
              />
            </InlineField>
          </>
        )}

        <FormDivider title="Grid Options" />
        <InlineFieldRow className={styles.inlineRow}>
          <InlineField grow label="Enable Node Grid Snapping" className={styles.inlineField}>
            <InlineSwitch
              value={value.settings.panel.grid.enabled}
              onChange={(e) => {
                let wm = structuredClone(value);
                wm.settings.panel.grid.enabled = e.currentTarget.checked;
                wm.settings.panel.grid.guidesEnabled = false;
                onChange(wm);
              }}
            />
          </InlineField>
          {value.settings.panel.grid.enabled ? (
            <InlineField grow label="Grid Size (px)" className={styles.inlineField}>
              <Slider
                min={2}
                max={50}
                value={value.settings.panel.grid.size}
                step={1}
                onChange={(num) => {
                  let options = structuredClone(value);
                  options.settings.panel.grid.size = num;
                  onChange(options);
                }}
              />
            </InlineField>
          ) : (
            ''
          )}
        </InlineFieldRow>
        {value.settings.panel.grid.enabled ? (
          <InlineFieldRow className={styles.inlineRow}>
            <InlineField grow label="Grid Guides" className={styles.inlineField}>
              <InlineSwitch
                value={value.settings.panel.grid.guidesEnabled}
                onChange={(e) => {
                  let wm = structuredClone(value);
                  wm.settings.panel.grid.guidesEnabled = e.currentTarget.checked;
                  onChange(wm);
                }}
              />
            </InlineField>
          </InlineFieldRow>
        ) : (
          ''
        )}
        <FormDivider title="Font Options" />
        <InlineField grow label="Node Font Size" className={styles.inlineField}>
          <Slider
            min={2}
            max={40}
            value={value.settings.fontSizing.node}
            step={1}
            onChange={(num) => {
              let options = structuredClone(value);
              options.settings.fontSizing.node = num;
              onChange(options);
            }}
          />
        </InlineField>
        <InlineField grow label="Link Font Size" className={styles.inlineField}>
          <Slider
            min={2}
            max={40}
            value={value.settings.fontSizing.link}
            step={1}
            onChange={(num) => {
              let options = structuredClone(value);
              options.settings.fontSizing.link = num;
              onChange(options);
            }}
          />
        </InlineField>
        <FormDivider title="Interaction & Labels" />
        <InlineField
          grow
          label="Hover Highlight"
          className={styles.inlineField}
          tooltip={'Hovering a link highlights its whole path (including VIA segments) and fades unrelated links.'}
        >
          <InlineSwitch
            value={value.settings.link.hoverHighlight ?? false}
            onChange={(e) => {
              let options = structuredClone(value);
              options.settings.link.hoverHighlight = e.currentTarget.checked;
              onChange(options);
            }}
          />
        </InlineField>
        <InlineField
          grow
          label="Label Collision Avoidance"
          className={styles.inlineField}
          tooltip={'Nudge overlapping link value labels along their links so they stop covering each other.'}
        >
          <InlineSwitch
            value={value.settings.link.labelCollision ?? false}
            onChange={(e) => {
              let options = structuredClone(value);
              options.settings.link.labelCollision = e.currentTarget.checked;
              onChange(options);
            }}
          />
        </InlineField>
        <InlineField
          grow
          label="Hide Labels When Zoomed Out"
          className={styles.inlineField}
          tooltip={
            'Hide link value labels once the map is zoomed out this many scroll steps or more. 0 always shows labels.'
          }
        >
          <Slider
            min={0}
            max={10}
            step={1}
            value={value.settings.link.labelHideZoom ?? 0}
            onChange={(num) => {
              let options = structuredClone(value);
              options.settings.link.labelHideZoom = num;
              onChange(options);
            }}
          />
        </InlineField>
        <FormDivider title="Status Legend" />
        <InlineField
          grow
          label="Show Status Legend"
          className={styles.inlineField}
          tooltip={'A small legend explaining your status colors, positioned in panel percent coordinates.'}
        >
          <InlineSwitch
            value={value.settings.statusLegend?.enabled ?? false}
            onChange={(e) => {
              let options = structuredClone(value);
              if (!options.settings.statusLegend) {
                options.settings.statusLegend = {
                  enabled: e.currentTarget.checked,
                  position: { x: 1, y: 1 },
                  items: [
                    { color: '#73BF69', label: 'up', id: uuidv4() },
                    { color: '#F2495C', label: 'down', id: uuidv4() },
                  ],
                };
              } else {
                options.settings.statusLegend.enabled = e.currentTarget.checked;
              }
              onChange(options);
            }}
          />
        </InlineField>
        {value.settings.statusLegend?.enabled ? (
          <React.Fragment>
            <InlineField grow label="Legend Position X (%)" className={styles.inlineField}>
              <Slider
                min={0}
                max={100}
                step={1}
                value={value.settings.statusLegend.position.x}
                onChange={(num) => {
                  let options = structuredClone(value);
                  options.settings.statusLegend!.position.x = num;
                  onChange(options);
                }}
              />
            </InlineField>
            <InlineField grow label="Legend Position Y (%)" className={styles.inlineField}>
              <Slider
                min={0}
                max={100}
                step={1}
                value={value.settings.statusLegend.position.y}
                onChange={(num) => {
                  let options = structuredClone(value);
                  options.settings.statusLegend!.position.y = num;
                  onChange(options);
                }}
              />
            </InlineField>
            {value.settings.statusLegend.items.map((item, li) => (
              <InlineFieldRow key={item.id ?? li} className={styles.inlineRow}>
                <InlineLabel width={'auto'} style={{ marginBottom: '4px' }}>
                  Color:
                  <ColorPicker
                    color={item.color}
                    onChange={(color) => {
                      let options = structuredClone(value);
                      options.settings.statusLegend!.items[li].color = color;
                      onChange(options);
                    }}
                  />
                </InlineLabel>
                <InlineField grow label="Label">
                  <Input
                    value={item.label}
                    type={'text'}
                    onChange={(e) => {
                      let options = structuredClone(value);
                      options.settings.statusLegend!.items[li].label = e.currentTarget.value;
                      onChange(options);
                    }}
                  />
                </InlineField>
                <Button
                  variant="destructive"
                  icon="trash-alt"
                  size="sm"
                  aria-label="Remove legend item"
                  onClick={() => {
                    let options = structuredClone(value);
                    options.settings.statusLegend!.items.splice(li, 1);
                    onChange(options);
                  }}
                />
              </InlineFieldRow>
            ))}
            <Button
              variant="secondary"
              icon="plus"
              size="sm"
              onClick={() => {
                let options = structuredClone(value);
                options.settings.statusLegend!.items.push({ color: '#FF9830', label: 'label', id: uuidv4() });
                onChange(options);
              }}
            >
              Add Legend Item
            </Button>
          </React.Fragment>
        ) : (
          ''
        )}
        <FormDivider title="Tootlip Options" />
        <InlineLabel width={'auto'} style={{ marginBottom: '4px' }}>
          Background Color:
          <ColorPicker
            color={value.settings.tooltip.backgroundColor}
            onChange={(color) => {
              let options = structuredClone(value);
              options.settings.tooltip.backgroundColor = color;
              onChange(options);
            }}
          />
        </InlineLabel>
        <InlineLabel width="auto" style={{ marginBottom: '4px' }}>
          Text Color:
          <ColorPicker
            color={value.settings.tooltip.textColor}
            onChange={(color) => {
              let options = structuredClone(value);
              options.settings.tooltip.textColor = color;
              onChange(options);
            }}
          />
        </InlineLabel>
        <InlineField grow label="Tooltip Font Size" className={styles.inlineField}>
          <Slider
            min={2}
            max={40}
            value={value.settings.tooltip.fontSize}
            step={1}
            onChange={(num) => {
              let options = structuredClone(value);
              options.settings.tooltip.fontSize = num;
              onChange(options);
            }}
          />
        </InlineField>
        <InlineLabel width="auto" style={{ marginBottom: '4px' }}>
          Inbound Graph Color:
          <ColorPicker
            color={value.settings.tooltip.inboundColor}
            onChange={(color) => {
              let options = structuredClone(value);
              options.settings.tooltip.inboundColor = color;
              onChange(options);
            }}
          />
        </InlineLabel>
        <InlineLabel width="auto" style={{ marginBottom: '4px' }}>
          Outbound Graph Color:
          <ColorPicker
            color={value.settings.tooltip.outboundColor}
            onChange={(color) => {
              let options = structuredClone(value);
              options.settings.tooltip.outboundColor = color;
              onChange(options);
            }}
          />
        </InlineLabel>
        <InlineField grow label="Scale to Include Bandwidth" className={styles.inlineField}>
          <InlineSwitch
            value={value.settings.tooltip.scaleToBandwidth}
            onChange={(e) => {
              let wm = structuredClone(value);
              wm.settings.tooltip.scaleToBandwidth = e.currentTarget.checked;
              onChange(wm);
            }}
          />
        </InlineField>
        <FormDivider title="Scale Options" />
        <InlineField grow label="Scale Title" className={styles.inlineField}>
          <Input
            value={value.settings.scale.title}
            placeholder={'Scale Title'}
            type={'text'}
            name={'scaleTitle'}
            onChange={(e) => {
              let options = structuredClone(value);
              options.settings.scale.title = e.currentTarget.value;
              onChange(options);
            }}
          ></Input>
        </InlineField>
        <InlineField grow label="Scale Width" className={styles.inlineField}>
          <Slider
            min={10}
            max={200}
            value={value.settings.scale.size.width}
            step={1}
            onChange={(num) => {
              let options = structuredClone(value);
              options.settings.scale.size.width = num;
              onChange(options);
            }}
          />
        </InlineField>
        <InlineField grow label="Scale Height" className={styles.inlineField}>
          <Slider
            min={0}
            max={1000}
            value={value.settings.scale.size.height}
            step={10}
            onChange={(num) => {
              let options = structuredClone(value);
              options.settings.scale.size.height = num;
              onChange(options);
            }}
          />
        </InlineField>
        <InlineField grow label="Scale Position X" className={styles.inlineField}>
          <Slider
            min={0}
            max={100}
            value={value.settings.scale.position.x}
            step={1}
            onChange={(num) => {
              let options = structuredClone(value);
              options.settings.scale.position.x = num;
              onChange(options);
            }}
          />
        </InlineField>
        <InlineField grow label="Scale Position Y" className={styles.inlineField}>
          <Slider
            min={0}
            max={100}
            value={value.settings.scale.position.y}
            step={1}
            onChange={(num) => {
              let options = structuredClone(value);
              options.settings.scale.position.y = num;
              onChange(options);
            }}
          />
        </InlineField>
        <InlineField grow label="Title Font Size" className={styles.inlineField}>
          <Slider
            min={2}
            max={40}
            value={value.settings.scale.fontSizing.title}
            step={1}
            onChange={(num) => {
              let options = structuredClone(value);
              options.settings.scale.fontSizing.title = num;
              onChange(options);
            }}
          />
        </InlineField>
        <InlineField grow label="Threshold Font Size" className={styles.inlineField}>
          <Slider
            min={2}
            max={40}
            value={value.settings.scale.fontSizing.threshold}
            step={1}
            onChange={(num) => {
              let options = structuredClone(value);
              options.settings.scale.fontSizing.threshold = num;
              onChange(options);
            }}
          />
        </InlineField>
        {/* Legibility overrides (#278): explicit font color and an optional
            background box, so the scale stays readable over background images
            or light map content. Unset = previous automatic behavior. */}
        <InlineLabel width={'auto'} style={{ marginBottom: '4px' }}>
          Scale Font Color:
          <ColorPicker
            color={value.settings.scale.fontColor || '#ffffff'}
            onChange={(color) => {
              let options = structuredClone(value);
              options.settings.scale.fontColor = color;
              onChange(options);
            }}
          />
          {value.settings.scale.fontColor ? (
            <Button
              variant="secondary"
              size="sm"
              style={{ marginLeft: '8px' }}
              onClick={() => {
                let options = structuredClone(value);
                options.settings.scale.fontColor = undefined;
                onChange(options);
              }}
            >
              Auto
            </Button>
          ) : (
            ''
          )}
        </InlineLabel>
        <InlineLabel width={'auto'} style={{ marginBottom: '4px' }}>
          Scale Background:
          <ColorPicker
            color={value.settings.scale.backgroundColor || 'rgba(0, 0, 0, 0)'}
            onChange={(color) => {
              let options = structuredClone(value);
              options.settings.scale.backgroundColor = color;
              onChange(options);
            }}
          />
          {value.settings.scale.backgroundColor ? (
            <Button
              variant="secondary"
              size="sm"
              style={{ marginLeft: '8px' }}
              onClick={() => {
                let options = structuredClone(value);
                options.settings.scale.backgroundColor = undefined;
                onChange(options);
              }}
            >
              None
            </Button>
          ) : (
            ''
          )}
        </InlineLabel>
        <FormDivider title="Animation" />
        {/* Animation foundation (#264): master switch and safety gates for
            traffic-flow particles (#273) and future animation features.
            Everything defaults to off/conservative. */}
        <InlineField
          grow
          label="Enable Traffic Animation"
          className={styles.inlineField}
          tooltip="Animated dots along links showing metric-derived direction and intensity. Individual links can also opt in or out in the link editor."
        >
          <InlineSwitch
            data-testid="nwm-animation-enabled"
            value={value.settings.animation?.enabled ?? false}
            onChange={(e) => {
              let options = structuredClone(value);
              options.settings.animation = {
                ...(options.settings.animation ?? {}),
                enabled: e.currentTarget.checked,
              };
              onChange(options);
            }}
          />
        </InlineField>
        <InlineField grow label="Respect Reduced Motion" className={styles.inlineField}>
          <InlineSwitch
            value={value.settings.animation?.respectReducedMotion ?? true}
            onChange={(e) => {
              let options = structuredClone(value);
              options.settings.animation = {
                enabled: options.settings.animation?.enabled ?? false,
                ...(options.settings.animation ?? {}),
                respectReducedMotion: e.currentTarget.checked,
              };
              onChange(options);
            }}
          />
        </InlineField>
        <InlineField grow label="Pause In Edit Mode" className={styles.inlineField}>
          <InlineSwitch
            value={value.settings.animation?.pauseInEditMode ?? true}
            onChange={(e) => {
              let options = structuredClone(value);
              options.settings.animation = {
                enabled: options.settings.animation?.enabled ?? false,
                ...(options.settings.animation ?? {}),
                pauseInEditMode: e.currentTarget.checked,
              };
              onChange(options);
            }}
          />
        </InlineField>
        <InlineField
          grow
          label="Show Animation Legend"
          className={styles.inlineField}
          tooltip="Legend explaining the animation glyphs. Only rendered while animation is active on this panel."
        >
          <InlineSwitch
            value={value.settings.animation?.showLegend ?? true}
            onChange={(e) => {
              let options = structuredClone(value);
              options.settings.animation = {
                enabled: options.settings.animation?.enabled ?? false,
                ...(options.settings.animation ?? {}),
                showLegend: e.currentTarget.checked,
              };
              onChange(options);
            }}
          />
        </InlineField>
        <InlineField grow label="Max Animated Links" className={styles.inlineField}>
          <Input
            value={value.settings.animation?.maxAnimatedLinks ?? 100}
            type={'number'}
            min={0}
            onChange={(e) => {
              let options = structuredClone(value);
              options.settings.animation = {
                enabled: options.settings.animation?.enabled ?? false,
                ...(options.settings.animation ?? {}),
                maxAnimatedLinks: Math.max(
                  0,
                  finiteOrFallback(
                    e.currentTarget.valueAsNumber,
                    options.settings.animation?.maxAnimatedLinks ?? 100
                  )
                ),
              };
              onChange(options);
            }}
          />
        </InlineField>
        <FormDivider title="Rail Operations" />
        {/* Rail Operations mode (#300), Phase 1: schema + baseline preset only.
            Monitoring-only visualization; rail rendering and editor tools ship
            in later phases. Absent mapMode always means 'network'. */}
        <InlineField
          grow
          label="Map Mode"
          className={styles.inlineField}
          tooltip="Experimental. 'Rail' enables the monitoring-only Rail Operations mode (visualization of read-only rail telemetry). Rendering for rail objects arrives in a later release; existing network maps are unaffected."
        >
          <Select
            data-testid="nwm-map-mode"
            value={normalizeMapMode(value.mapMode)}
            options={[
              { label: 'Network', value: 'network' },
              { label: 'Rail (experimental)', value: 'rail' },
            ]}
            onChange={(v) => {
              let options = structuredClone(value);
              if (v.value === 'rail') {
                options.mapMode = 'rail';
              } else {
                // Plain network maps stay byte-identical to pre-rail saves:
                // no mapMode key is persisted for the default mode.
                delete options.mapMode;
              }
              onChange(options);
            }}
          ></Select>
        </InlineField>
        {normalizeMapMode(value.mapMode) === 'rail' ? (
          <InlineField
            grow
            label="Baseline Background"
            className={styles.inlineField}
            tooltip="Applies the bundled rail baseline background (dark canvas, grid, corridor and alignment guides — static context only) attached to the map canvas so it pans and zooms with the railway."
          >
            <Button
              data-testid="nwm-rail-baseline"
              variant="secondary"
              size="md"
              onClick={() => {
                const existing = value.settings.panel.backgroundImage?.url;
                if (existing === RAIL_BASELINE_BACKGROUND_URL) {
                  // Already loaded: keep the user's customized fit /
                  // attach-to-canvas instead of silently resetting them.
                  return;
                }
                if (existing && !confirm('Replace the existing background image with the rail baseline?')) {
                  return;
                }
                let options = structuredClone(value);
                options.settings.panel.backgroundImage = createRailBaselineBackground();
                onChange(options);
              }}
              style={{ justifyContent: 'center' }}
            >
              Load rail baseline
            </Button>
          </InlineField>
        ) : (
          ''
        )}
      </React.Fragment>
    );
  } else {
    return <React.Fragment />;
  }
};

const getStyles = (theme: GrafanaTheme2) => {
  return {
    inlineField: css`
      flex: 1 0 auto;
    `,
    inlineRow: css`
      flex-flow: column;
    `,
  };
};
