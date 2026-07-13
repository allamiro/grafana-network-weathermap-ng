/**
 * Rail Operations editor (#300, Phase 5). Rendered only when the map mode is
 * 'rail' (WeathermapBuilder gates the mount). Monitoring-only: every field
 * binds read-only telemetry; there are no control actions of any kind.
 *
 * Conventions shared with the other forms: immutable updates via
 * structuredClone + onChange, confirm() before destructive deletes, URL
 * fields sanitized on entry, numeric inputs guarded against NaN. Entity ids
 * are generated (uuid) and never editable, so duplicate ids cannot be
 * authored through the UI; validation still reports duplicates from
 * hand-edited JSON. Validation is live, report-only, and never auto-deletes.
 */
import React, { useState } from 'react';
import { css } from '@emotion/css';
import {
  Button,
  ControlledCollapse,
  InlineField,
  InlineSwitch,
  Input,
  Select,
  TextArea,
  useStyles2,
} from '@grafana/ui';
import { GrafanaTheme2, SelectableValue, StandardEditorProps } from '@grafana/data';
import { v4 as uuidv4 } from 'uuid';
import { Weathermap } from 'types';
import { finiteOrFallback, parseOptionalFiniteNumber, sanitizeUrl } from 'utils';
import { FormDivider } from './FormDivider';
import { createDefaultRailConfig } from '../rail/defaults';
import { normalizeRailConfig } from '../rail/normalize';
import { validateRailTopology } from '../rail/validation';
import {
  RailControlPointType,
  RailIncidentOverlay,
  RailOperationsConfig,
  TrackDirection,
} from '../rail/types';

interface Settings {}
interface Props extends StandardEditorProps<Weathermap, Settings> {}

const CONTROL_POINT_TYPES: RailControlPointType[] = [
  'station',
  'junction',
  'interlocking',
  'yard',
  'terminal',
  'depot',
  'control_point',
];
const DIRECTIONS: TrackDirection[] = [
  'eastbound',
  'westbound',
  'northbound',
  'southbound',
  'inbound',
  'outbound',
  'bidirectional',
];
const INCIDENT_KINDS: Array<RailIncidentOverlay['kind']> = ['incident', 'maintenance', 'possession'];

const toOptions = (values: string[]): Array<SelectableValue<string>> => values.map((v) => ({ label: v, value: v }));

/** "x1,y1; x2,y2" <-> viaPoints. Forgiving parse: malformed pairs are dropped. */
const viaPointsToText = (viaPoints: Array<[number, number]> | undefined): string =>
  (viaPoints ?? []).map(([x, y]) => `${x},${y}`).join('; ');
const textToViaPoints = (text: string): Array<[number, number]> | undefined => {
  const pairs = text
    .split(';')
    .map((chunk) => chunk.split(',').map((n) => Number(n.trim())))
    .filter((pair) => pair.length === 2 && pair.every((n) => Number.isFinite(n)))
    .map((pair): [number, number] => [pair[0], pair[1]]);
  return pairs.length > 0 ? pairs : undefined;
};

export const RailForm = ({ value, onChange }: Props) => {
  const styles = useStyles2(getStyles);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');

  if (!value) {
    return <React.Fragment />;
  }
  // Edit the NORMALIZED view (idempotent repair; e.g. appends missing default
  // layers), and normalize the draft before mutating so section indexes always
  // line up with what is displayed — a saved config with layers: [] would
  // otherwise show an empty layer manager while the renderer shows defaults.
  const rail: RailOperationsConfig = normalizeRailConfig(value.rail ?? createDefaultRailConfig());

  const updateRail = (mutate: (draft: RailOperationsConfig) => void) => {
    const options = structuredClone(value);
    options.rail = normalizeRailConfig(options.rail ?? createDefaultRailConfig());
    mutate(options.rail);
    onChange(options);
  };

  const removeEntity = (collection: keyof RailOperationsConfig, id: string, label: string) => {
    if (!confirm(`Delete ${label}? References to it are kept and reported by validation — nothing else is removed.`)) {
      return;
    }
    updateRail((draft) => {
      (draft[collection] as Array<{ id: string }>) = (draft[collection] as Array<{ id: string }>).filter(
        (entity) => entity.id !== id
      );
    });
  };

  const controlPointOptions = toOptions(rail.controlPoints.map((cp) => cp.id));
  const controlPointLabel = (id: string) => rail.controlPoints.find((cp) => cp.id === id)?.label || id;
  const segmentOptions = rail.trackSegments.map((s) => ({
    label: `${s.id.slice(0, 8)}… (track ${s.trackNumber || '?'}${s.blockId ? `, ${s.blockId}` : ''})`,
    value: s.id,
  }));

  const issues = validateRailTopology(rail);

  const queryField = (
    label: string,
    current: string | undefined,
    apply: (v: string | undefined) => void,
    tooltip?: string
  ) => (
    <InlineField grow label={label} className={styles.inlineField} tooltip={tooltip}>
      <Input
        value={current ?? ''}
        placeholder="series display name"
        onChange={(e) => apply(e.currentTarget.value || undefined)}
      />
    </InlineField>
  );

  return (
    <React.Fragment>
      <FormDivider title="Rail: Control Points" />
      {rail.controlPoints.length === 0 ? <div className={styles.empty}>No control points yet.</div> : null}
      {rail.controlPoints.map((cp, i) => (
        <ControlledCollapse key={cp.id} label={`${cp.label || 'Control point'} (${cp.type})`}>
          <InlineField grow label="Label" className={styles.inlineField}>
            <Input
              value={cp.label}
              data-testid={`nwm-rail-cp-label-${i}`}
              onChange={(e) => {
                const label = e.currentTarget.value;
                updateRail((d) => {
                  d.controlPoints[i].label = label;
                });
              }}
            />
          </InlineField>
          <InlineField grow label="Type" className={styles.inlineField}>
            <Select
              value={cp.type}
              options={toOptions(CONTROL_POINT_TYPES)}
              onChange={(v) =>
                updateRail((d) => {
                  d.controlPoints[i].type = (v.value as RailControlPointType) ?? 'control_point';
                })
              }
            />
          </InlineField>
          <InlineField grow label="X" className={styles.inlineField}>
            <Input
              type="number"
              value={cp.position[0]}
              onChange={(e) => {
                const x = finiteOrFallback(e.currentTarget.valueAsNumber, cp.position[0]);
                updateRail((d) => {
                  d.controlPoints[i].position = [x, d.controlPoints[i].position[1]];
                });
              }}
            />
          </InlineField>
          <InlineField grow label="Y" className={styles.inlineField}>
            <Input
              type="number"
              value={cp.position[1]}
              onChange={(e) => {
                const y = finiteOrFallback(e.currentTarget.valueAsNumber, cp.position[1]);
                updateRail((d) => {
                  d.controlPoints[i].position = [d.controlPoints[i].position[0], y];
                });
              }}
            />
          </InlineField>
          {queryField('Status Query', cp.statusQuery, (v) =>
            updateRail((d) => {
              d.controlPoints[i].statusQuery = v;
            })
          )}
          <InlineField grow label="Dashboard Link" className={styles.inlineField}>
            <Input
              value={cp.dashboardLink ?? ''}
              placeholder="/d/uid/dashboard"
              onChange={(e) => {
                const link = sanitizeUrl(e.currentTarget.value) || undefined;
                updateRail((d) => {
                  d.controlPoints[i].dashboardLink = link;
                });
              }}
            />
          </InlineField>
          <Button
            variant="destructive"
            size="sm"
            icon="trash-alt"
            data-testid={`nwm-rail-cp-delete-${i}`}
            onClick={() => removeEntity('controlPoints', cp.id, `control point "${cp.label || cp.id}"`)}
          >
            Delete
          </Button>
        </ControlledCollapse>
      ))}
      <Button
        size="sm"
        icon="plus"
        data-testid="nwm-rail-add-cp"
        onClick={() =>
          updateRail((d) => {
            d.controlPoints.push({
              id: uuidv4(),
              type: 'station',
              position: [100, 100 + 40 * d.controlPoints.length],
              label: `Station ${d.controlPoints.length + 1}`,
            });
          })
        }
      >
        Add Control Point
      </Button>

      <FormDivider title="Rail: Track Segments" />
      <div className={styles.hint}>
        One segment per PHYSICAL track. Two parallel tracks are two segments — never one link.
      </div>
      {rail.trackSegments.length === 0 ? <div className={styles.empty}>No track segments yet.</div> : null}
      {rail.trackSegments.map((seg, i) => (
        <ControlledCollapse
          key={seg.id}
          label={`Track ${seg.trackNumber || '?'}: ${controlPointLabel(seg.fromControlPointId)} → ${controlPointLabel(
            seg.toControlPointId
          )}${seg.blockId ? ` (${seg.blockId})` : ''}`}
        >
          <InlineField grow label="From" className={styles.inlineField}>
            <Select
              value={seg.fromControlPointId}
              options={controlPointOptions.map((o) => ({ ...o, label: controlPointLabel(o.value!) }))}
              onChange={(v) =>
                updateRail((d) => {
                  d.trackSegments[i].fromControlPointId = v.value ?? '';
                })
              }
            />
          </InlineField>
          <InlineField grow label="To" className={styles.inlineField}>
            <Select
              value={seg.toControlPointId}
              options={controlPointOptions.map((o) => ({ ...o, label: controlPointLabel(o.value!) }))}
              onChange={(v) =>
                updateRail((d) => {
                  d.trackSegments[i].toControlPointId = v.value ?? '';
                })
              }
            />
          </InlineField>
          <InlineField grow label="Track #" className={styles.inlineField}>
            <Input
              value={seg.trackNumber}
              onChange={(e) => {
                const trackNumber = e.currentTarget.value;
                updateRail((d) => {
                  d.trackSegments[i].trackNumber = trackNumber;
                });
              }}
            />
          </InlineField>
          <InlineField grow label="Direction" className={styles.inlineField}>
            <Select
              value={seg.direction}
              options={toOptions(DIRECTIONS)}
              onChange={(v) =>
                updateRail((d) => {
                  d.trackSegments[i].direction = (v.value as TrackDirection) ?? 'bidirectional';
                })
              }
            />
          </InlineField>
          <InlineField grow label="Block ID" className={styles.inlineField}>
            <Input
              value={seg.blockId ?? ''}
              onChange={(e) => {
                const blockId = e.currentTarget.value || undefined;
                updateRail((d) => {
                  d.trackSegments[i].blockId = blockId;
                });
              }}
            />
          </InlineField>
          <InlineField
            grow
            label="Via Points"
            className={styles.inlineField}
            tooltip="Intermediate waypoints as x,y pairs separated by semicolons — e.g. 250,60; 300,80. Endpoints come from the control points."
          >
            <Input
              // Remount when the stored value changes (e.g. after an import)
              // so the uncontrolled input can never display stale text.
              key={`vias-${viaPointsToText(seg.viaPoints)}`}
              defaultValue={viaPointsToText(seg.viaPoints)}
              placeholder="250,60; 300,80"
              onBlur={(e) => {
                const viaPoints = textToViaPoints(e.currentTarget.value);
                updateRail((d) => {
                  d.trackSegments[i].viaPoints = viaPoints;
                });
              }}
            />
          </InlineField>
          {queryField('Occupancy Query', seg.occupancyQuery, (v) =>
            updateRail((d) => {
              d.trackSegments[i].occupancyQuery = v;
            })
          )}
          {queryField('Availability Query', seg.availabilityQuery, (v) =>
            updateRail((d) => {
              d.trackSegments[i].availabilityQuery = v;
            })
          )}
          {queryField('Status Query', seg.statusQuery, (v) =>
            updateRail((d) => {
              d.trackSegments[i].statusQuery = v;
            })
          )}
          <InlineField grow label="Stroke Width" className={styles.inlineField}>
            <Input
              type="number"
              value={seg.strokeWidth ?? ''}
              placeholder="4"
              onChange={(e) => {
                const strokeWidth = parseOptionalFiniteNumber(e.currentTarget.value);
                updateRail((d) => {
                  d.trackSegments[i].strokeWidth = strokeWidth;
                });
              }}
            />
          </InlineField>
          <Button
            variant="destructive"
            size="sm"
            icon="trash-alt"
            onClick={() => removeEntity('trackSegments', seg.id, `track segment "${seg.id}"`)}
          >
            Delete
          </Button>
        </ControlledCollapse>
      ))}
      <Button
        size="sm"
        icon="plus"
        data-testid="nwm-rail-add-segment"
        onClick={() =>
          updateRail((d) => {
            d.trackSegments.push({
              id: uuidv4(),
              fromControlPointId: d.controlPoints[0]?.id ?? '',
              toControlPointId: d.controlPoints[1]?.id ?? '',
              trackNumber: `${d.trackSegments.length + 1}`,
              direction: 'bidirectional',
            });
          })
        }
      >
        Add Track Segment
      </Button>

      <FormDivider title="Rail: Signals" />
      {rail.signals.map((sig, i) => (
        <ControlledCollapse key={sig.id} label={sig.label || `Signal ${i + 1}`}>
          <InlineField grow label="Label" className={styles.inlineField}>
            <Input
              value={sig.label ?? ''}
              onChange={(e) => {
                const label = e.currentTarget.value || undefined;
                updateRail((d) => {
                  d.signals[i].label = label;
                });
              }}
            />
          </InlineField>
          <InlineField grow label="Segment" className={styles.inlineField}>
            <Select
              value={sig.segmentId}
              options={segmentOptions}
              onChange={(v) =>
                updateRail((d) => {
                  d.signals[i].segmentId = v.value ?? '';
                })
              }
            />
          </InlineField>
          <InlineField grow label="Position (0..1)" className={styles.inlineField}>
            <Input
              type="number"
              step={0.05}
              value={sig.positionPercent}
              onChange={(e) => {
                const positionPercent = finiteOrFallback(e.currentTarget.valueAsNumber, sig.positionPercent);
                updateRail((d) => {
                  d.signals[i].positionPercent = positionPercent;
                });
              }}
            />
          </InlineField>
          <InlineField grow label="Facing" className={styles.inlineField}>
            <Select
              value={sig.facingDirection}
              options={toOptions(DIRECTIONS)}
              onChange={(v) =>
                updateRail((d) => {
                  d.signals[i].facingDirection = (v.value as TrackDirection) ?? 'bidirectional';
                })
              }
            />
          </InlineField>
          {queryField('Aspect Query', sig.stateQuery, (v) =>
            updateRail((d) => {
              d.signals[i].stateQuery = v;
            }),
            'Convention: 0 = stop, 1 = caution, 2 = clear. Override with value mappings via JSON import.'
          )}
          {queryField('Health Query', sig.healthQuery, (v) =>
            updateRail((d) => {
              d.signals[i].healthQuery = v;
            })
          )}
          <Button
            variant="destructive"
            size="sm"
            icon="trash-alt"
            onClick={() => removeEntity('signals', sig.id, `signal "${sig.label || sig.id}"`)}
          >
            Delete
          </Button>
        </ControlledCollapse>
      ))}
      <Button
        size="sm"
        icon="plus"
        data-testid="nwm-rail-add-signal"
        onClick={() =>
          updateRail((d) => {
            d.signals.push({
              id: uuidv4(),
              segmentId: d.trackSegments[0]?.id ?? '',
              positionPercent: 0.5,
              facingDirection: d.trackSegments[0]?.direction ?? 'bidirectional',
            });
          })
        }
      >
        Add Signal
      </Button>

      <FormDivider title="Rail: Switches & Crossovers" />
      {rail.switches.map((sw, i) => (
        <ControlledCollapse key={sw.id} label={sw.label || `Switch ${i + 1}`}>
          <InlineField grow label="Normal Path" className={styles.inlineField}>
            <Select
              value={sw.normalSegmentId}
              options={segmentOptions}
              onChange={(v) =>
                updateRail((d) => {
                  d.switches[i].normalSegmentId = v.value ?? '';
                })
              }
            />
          </InlineField>
          <InlineField grow label="Reverse Path" className={styles.inlineField}>
            <Select
              value={sw.reverseSegmentId}
              options={segmentOptions}
              onChange={(v) =>
                updateRail((d) => {
                  d.switches[i].reverseSegmentId = v.value ?? '';
                })
              }
            />
          </InlineField>
          <InlineField grow label="At Control Point" className={styles.inlineField}>
            <Select
              isClearable
              value={sw.controlPointId}
              options={controlPointOptions.map((o) => ({ ...o, label: controlPointLabel(o.value!) }))}
              onChange={(v) =>
                updateRail((d) => {
                  d.switches[i].controlPointId = v?.value ?? undefined;
                })
              }
            />
          </InlineField>
          {queryField('Position Query', sw.positionQuery, (v) =>
            updateRail((d) => {
              d.switches[i].positionQuery = v;
            }),
            'Convention: 0 = normal, 1 = reverse, 2 = moving.'
          )}
          {queryField('Detected Query', sw.detectedQuery, (v) =>
            updateRail((d) => {
              d.switches[i].detectedQuery = v;
            })
          )}
          {queryField('Locked Query', sw.lockedQuery, (v) =>
            updateRail((d) => {
              d.switches[i].lockedQuery = v;
            })
          )}
          {queryField('Health Query', sw.healthQuery, (v) =>
            updateRail((d) => {
              d.switches[i].healthQuery = v;
            })
          )}
          <Button
            variant="destructive"
            size="sm"
            icon="trash-alt"
            onClick={() => removeEntity('switches', sw.id, `switch "${sw.label || sw.id}"`)}
          >
            Delete
          </Button>
        </ControlledCollapse>
      ))}
      <Button
        size="sm"
        icon="plus"
        data-testid="nwm-rail-add-switch"
        onClick={() =>
          updateRail((d) => {
            d.switches.push({
              id: uuidv4(),
              normalSegmentId: d.trackSegments[0]?.id ?? '',
              reverseSegmentId: d.trackSegments[1]?.id ?? '',
            });
          })
        }
      >
        Add Switch
      </Button>
      {rail.crossovers.map((co, i) => (
        <ControlledCollapse key={co.id} label={co.label || `Crossover ${i + 1} (${co.geometry})`}>
          <InlineField grow label="Track A" className={styles.inlineField}>
            <Select
              value={co.trackSegmentIds[0]}
              options={segmentOptions}
              onChange={(v) =>
                updateRail((d) => {
                  d.crossovers[i].trackSegmentIds = [v.value ?? '', d.crossovers[i].trackSegmentIds[1] ?? ''];
                })
              }
            />
          </InlineField>
          <InlineField grow label="Track B" className={styles.inlineField}>
            <Select
              value={co.trackSegmentIds[1]}
              options={segmentOptions}
              onChange={(v) =>
                updateRail((d) => {
                  d.crossovers[i].trackSegmentIds = [d.crossovers[i].trackSegmentIds[0] ?? '', v.value ?? ''];
                })
              }
            />
          </InlineField>
          <InlineField grow label="Geometry" className={styles.inlineField}>
            <Select
              value={co.geometry}
              options={toOptions(['single', 'double', 'scissors'])}
              onChange={(v) =>
                updateRail((d) => {
                  d.crossovers[i].geometry = (v.value as 'single' | 'double' | 'scissors') ?? 'single';
                })
              }
            />
          </InlineField>
          {queryField('Availability Query', co.stateQuery, (v) =>
            updateRail((d) => {
              d.crossovers[i].stateQuery = v;
            })
          )}
          <Button
            variant="destructive"
            size="sm"
            icon="trash-alt"
            onClick={() => removeEntity('crossovers', co.id, `crossover "${co.label || co.id}"`)}
          >
            Delete
          </Button>
        </ControlledCollapse>
      ))}
      <Button
        size="sm"
        icon="plus"
        data-testid="nwm-rail-add-crossover"
        onClick={() =>
          updateRail((d) => {
            d.crossovers.push({
              id: uuidv4(),
              trackSegmentIds: [d.trackSegments[0]?.id ?? '', d.trackSegments[1]?.id ?? ''],
              geometry: 'single',
            });
          })
        }
      >
        Add Crossover
      </Button>

      <FormDivider title="Rail: Trains" />
      {rail.trains.map((train, i) => (
        <ControlledCollapse key={train.id} label={train.label || `Train ${i + 1}`}>
          <InlineField grow label="Label" className={styles.inlineField}>
            <Input
              value={train.label ?? ''}
              onChange={(e) => {
                const label = e.currentTarget.value || undefined;
                updateRail((d) => {
                  d.trains[i].label = label;
                });
              }}
            />
          </InlineField>
          {queryField('Position Series Prefix', train.segmentQuery, (v) =>
            updateRail((d) => {
              d.trains[i].segmentQuery = v;
            }),
            "Data-driven position: with prefix 'TRAIN RD-218', a series named 'TRAIN RD-218 <segment id>' places the train at that series' value (0..1) along that segment."
          )}
          <InlineField grow label="Static Segment" className={styles.inlineField}>
            <Select
              isClearable
              value={train.segmentId}
              options={segmentOptions}
              onChange={(v) =>
                updateRail((d) => {
                  d.trains[i].segmentId = v?.value ?? undefined;
                })
              }
            />
          </InlineField>
          <InlineField grow label="Static Progress (0..1)" className={styles.inlineField}>
            <Input
              type="number"
              step={0.05}
              value={train.progress ?? ''}
              onChange={(e) => {
                const progress = parseOptionalFiniteNumber(e.currentTarget.value);
                updateRail((d) => {
                  d.trains[i].progress = progress;
                });
              }}
            />
          </InlineField>
          {queryField('Progress Query', train.progressQuery, (v) =>
            updateRail((d) => {
              d.trains[i].progressQuery = v;
            })
          )}
          {queryField('Speed Query', train.speedQuery, (v) =>
            updateRail((d) => {
              d.trains[i].speedQuery = v;
            })
          )}
          {queryField('Delay Query', train.delayQuery, (v) =>
            updateRail((d) => {
              d.trains[i].delayQuery = v;
            })
          )}
          {queryField('Status Query', train.statusQuery, (v) =>
            updateRail((d) => {
              d.trains[i].statusQuery = v;
            })
          )}
          {queryField('Stale Query', train.staleQuery, (v) =>
            updateRail((d) => {
              d.trains[i].staleQuery = v;
            })
          )}
          <InlineField grow label="Rotate With Track" className={styles.inlineField}>
            <InlineSwitch
              value={train.rotate !== false}
              onChange={(e) => {
                const rotate = e.currentTarget.checked ? undefined : false;
                updateRail((d) => {
                  d.trains[i].rotate = rotate;
                });
              }}
            />
          </InlineField>
          <InlineField grow label="Dashboard Link" className={styles.inlineField}>
            <Input
              value={train.dashboardLink ?? ''}
              onChange={(e) => {
                const link = sanitizeUrl(e.currentTarget.value) || undefined;
                updateRail((d) => {
                  d.trains[i].dashboardLink = link;
                });
              }}
            />
          </InlineField>
          <Button
            variant="destructive"
            size="sm"
            icon="trash-alt"
            onClick={() => removeEntity('trains', train.id, `train "${train.label || train.id}"`)}
          >
            Delete
          </Button>
        </ControlledCollapse>
      ))}
      <Button
        size="sm"
        icon="plus"
        data-testid="nwm-rail-add-train"
        onClick={() =>
          updateRail((d) => {
            d.trains.push({ id: uuidv4(), label: `Train ${d.trains.length + 1}` });
          })
        }
      >
        Add Train
      </Button>

      <FormDivider title="Rail: Routes & Incidents" />
      {rail.routes.map((route, i) => (
        <ControlledCollapse key={route.id} label={route.label || `Route ${i + 1}`}>
          <InlineField grow label="Label" className={styles.inlineField}>
            <Input
              value={route.label ?? ''}
              onChange={(e) => {
                const label = e.currentTarget.value || undefined;
                updateRail((d) => {
                  d.routes[i].label = label;
                });
              }}
            />
          </InlineField>
          <InlineField grow label="Segments" className={styles.inlineField}>
            <Select
              isMulti
              value={route.segmentIds}
              options={segmentOptions}
              onChange={(v) =>
                updateRail((d) => {
                  d.routes[i].segmentIds = ((v as Array<SelectableValue<string>>) ?? [])
                    .map((o) => o.value ?? '')
                    .filter(Boolean);
                })
              }
            />
          </InlineField>
          {queryField('Established Query', route.stateQuery, (v) =>
            updateRail((d) => {
              d.routes[i].stateQuery = v;
            }),
            'Route renders while this resolves non-zero. No query = always shown.'
          )}
          <Button
            variant="destructive"
            size="sm"
            icon="trash-alt"
            onClick={() => removeEntity('routes', route.id, `route "${route.label || route.id}"`)}
          >
            Delete
          </Button>
        </ControlledCollapse>
      ))}
      <Button
        size="sm"
        icon="plus"
        data-testid="nwm-rail-add-route"
        onClick={() =>
          updateRail((d) => {
            d.routes.push({ id: uuidv4(), segmentIds: [] });
          })
        }
      >
        Add Route
      </Button>
      {rail.incidents.map((incident, i) => (
        <ControlledCollapse key={incident.id} label={incident.label || `${incident.kind} ${i + 1}`}>
          <InlineField grow label="Kind" className={styles.inlineField}>
            <Select
              value={incident.kind}
              options={toOptions(INCIDENT_KINDS)}
              onChange={(v) =>
                updateRail((d) => {
                  d.incidents[i].kind = (v.value as RailIncidentOverlay['kind']) ?? 'incident';
                })
              }
            />
          </InlineField>
          <InlineField grow label="Label" className={styles.inlineField}>
            <Input
              value={incident.label ?? ''}
              onChange={(e) => {
                const label = e.currentTarget.value || undefined;
                updateRail((d) => {
                  d.incidents[i].label = label;
                });
              }}
            />
          </InlineField>
          <InlineField grow label="Segments" className={styles.inlineField}>
            <Select
              isMulti
              value={incident.segmentIds}
              options={segmentOptions}
              onChange={(v) =>
                updateRail((d) => {
                  d.incidents[i].segmentIds = ((v as Array<SelectableValue<string>>) ?? [])
                    .map((o) => o.value ?? '')
                    .filter(Boolean);
                })
              }
            />
          </InlineField>
          {queryField('Active Query', incident.stateQuery, (v) =>
            updateRail((d) => {
              d.incidents[i].stateQuery = v;
            })
          )}
          <Button
            variant="destructive"
            size="sm"
            icon="trash-alt"
            onClick={() => removeEntity('incidents', incident.id, `${incident.kind} "${incident.label || incident.id}"`)}
          >
            Delete
          </Button>
        </ControlledCollapse>
      ))}
      <Button
        size="sm"
        icon="plus"
        data-testid="nwm-rail-add-incident"
        onClick={() =>
          updateRail((d) => {
            d.incidents.push({ id: uuidv4(), kind: 'maintenance', segmentIds: [] });
          })
        }
      >
        Add Incident/Maintenance
      </Button>

      <FormDivider title="Rail: Layers" />
      {rail.layers.map((layer, i) => (
        <div key={layer.id} className={styles.layerRow}>
          <span className={styles.layerLabel}>{layer.label}</span>
          <InlineField label="Visible">
            <InlineSwitch
              data-testid={`nwm-rail-layer-visible-${layer.id}`}
              value={layer.visible}
              onChange={(e) => {
                const visible = e.currentTarget.checked;
                updateRail((d) => {
                  d.layers[i].visible = visible;
                });
              }}
            />
          </InlineField>
          <InlineField label="Locked">
            <InlineSwitch
              value={layer.locked}
              onChange={(e) => {
                const locked = e.currentTarget.checked;
                updateRail((d) => {
                  d.layers[i].locked = locked;
                });
              }}
            />
          </InlineField>
        </div>
      ))}

      <FormDivider title="Rail: Topology Validation" />
      {issues.length === 0 ? (
        <div className={styles.validationOk} data-testid="nwm-rail-validation-ok">
          No topology issues.
        </div>
      ) : (
        <div data-testid="nwm-rail-validation-issues">
          {issues.map((issue, i) => (
            <div key={i} className={issue.severity === 'error' ? styles.validationError : styles.validationWarning}>
              [{issue.severity}] {issue.message}
            </div>
          ))}
        </div>
      )}

      <FormDivider title="Rail: Import / Export" />
      <Button
        size="sm"
        icon="download-alt"
        data-testid="nwm-rail-export"
        onClick={() => {
          const blob = new Blob([JSON.stringify(rail, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'rail-config.json';
          a.click();
          URL.revokeObjectURL(url);
        }}
      >
        Export Rail JSON
      </Button>
      <TextArea
        className={styles.importArea}
        rows={4}
        placeholder="Paste a rail configuration JSON to import…"
        value={importText}
        data-testid="nwm-rail-import-text"
        onChange={(e) => setImportText(e.currentTarget.value)}
      />
      <Button
        size="sm"
        icon="upload"
        data-testid="nwm-rail-import"
        onClick={() => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(importText);
          } catch (err) {
            setImportError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
            return;
          }
          if (!confirm('Replace the current rail configuration with the imported one?')) {
            return;
          }
          setImportError('');
          const imported = normalizeRailConfig(parsed);
          updateRail((draft) => {
            Object.assign(draft, imported);
          });
          setImportText('');
        }}
      >
        Import Rail JSON
      </Button>
      {importError ? (
        <div className={styles.validationError} data-testid="nwm-rail-import-error">
          {importError}
        </div>
      ) : null}
    </React.Fragment>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  inlineField: css`
    flex: 1 0 auto;
  `,
  empty: css`
    color: ${theme.colors.text.secondary};
    font-style: italic;
    margin: 4px 0;
  `,
  hint: css`
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
    margin-bottom: 6px;
  `,
  layerRow: css`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
  `,
  layerLabel: css`
    min-width: 160px;
  `,
  validationOk: css`
    color: ${theme.colors.success.text};
  `,
  validationError: css`
    color: ${theme.colors.error.text};
  `,
  validationWarning: css`
    color: ${theme.colors.warning.text};
  `,
  importArea: css`
    margin: 6px 0;
  `,
});
