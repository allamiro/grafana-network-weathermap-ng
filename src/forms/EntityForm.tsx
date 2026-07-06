import React, { useState } from 'react';
import { css } from '@emotion/css';
import { Button, InlineField, InlineSwitch, Input, Select, useStyles2 } from '@grafana/ui';
import { SelectableValue, StandardEditorProps } from '@grafana/data';
import { v4 as uuidv4 } from 'uuid';
import { Weathermap, Link, MovingEntity } from 'types';
import { FormDivider } from './FormDivider';
import { buildQueryOptions, finiteOrFallback } from 'utils';

interface Settings {
  placeholder: string;
}

interface Props extends StandardEditorProps<Weathermap, Settings> {}

// Editor for moving entities (#266): markers that travel along a link,
// positioned by a 0..1 progress metric. Follows the LinkForm patterns —
// structuredClone before every write, explicit inputIds (#167).
export const EntityForm = (props: Props) => {
  const { value, onChange, context } = props;
  const styles = useStyles2(getStyles);

  const [currentEntity, setCurrentEntity] = useState('null' as unknown as MovingEntity);

  const entities = value.entities ?? [];
  const queryOptions = buildQueryOptions(context.data);

  const updateEntity = (i: number, patch: Partial<MovingEntity>) => {
    let weathermap: Weathermap = structuredClone(value);
    weathermap.entities = weathermap.entities ?? [];
    weathermap.entities[i] = { ...weathermap.entities[i], ...patch };
    onChange(weathermap);
    setCurrentEntity(weathermap.entities[i]);
  };

  const addNewEntity = () => {
    if (value.links.length === 0) {
      throw new Error('There must be >= 1 Links to create a moving entity.');
    }
    let weathermap: Weathermap = structuredClone(value);
    const entity: MovingEntity = {
      id: uuidv4(),
      label: `Entity ${(weathermap.entities?.length ?? 0) + 1}`,
      linkId: value.links[0].id,
      progressQuery: undefined,
      icon: '●',
      size: 14,
      showLabel: true,
    };
    weathermap.entities = [...(weathermap.entities ?? []), entity];
    onChange(weathermap);
    setCurrentEntity(entity);
  };

  const removeEntity = (i: number) => {
    let weathermap: Weathermap = structuredClone(value);
    weathermap.entities = (weathermap.entities ?? []).filter((_, ei) => ei !== i);
    onChange(weathermap);
    setCurrentEntity('null' as unknown as MovingEntity);
  };

  const linkLabel = (link: Link | undefined) =>
    link && link.nodes.length > 0 ? `${link.nodes[0]?.label} <> ${link.nodes[1]?.label}` : '';

  return (
    <React.Fragment>
      <h6
        style={{
          padding: '10px 0px 5px 5px',
          marginTop: '10px',
          borderTop: '1px solid var(--in-content-button-background)',
        }}
      >
        Moving Entities
      </h6>
      <Select
        inputId="nwm-entity-picker"
        onChange={(v) => {
          setCurrentEntity(v as MovingEntity);
        }}
        value={currentEntity}
        options={entities}
        getOptionLabel={(e) => e?.label ?? ''}
        getOptionValue={(e) => e?.id ?? ''}
        className={styles.entitySelect}
        placeholder={'Select a moving entity'}
        isClearable
      ></Select>

      {entities.map((entity: MovingEntity, i) => {
        if (currentEntity && entity.id === currentEntity.id) {
          return (
            <React.Fragment key={entity.id}>
              <FormDivider title="Entity Options" />
              <InlineField grow label="Label" labelWidth={'auto'}>
                <Input
                  id={`nwm-entity-label-${i}`}
                  value={entity.label}
                  placeholder="Entity label"
                  onChange={(e) => updateEntity(i, { label: e.currentTarget.value })}
                />
              </InlineField>
              <InlineField grow label="Link" labelWidth={'auto'}>
                <Select
                  inputId={`nwm-entity-link-${i}`}
                  onChange={(v) => updateEntity(i, { linkId: (v as Link).id })}
                  value={value.links.find((l) => l.id === entity.linkId)}
                  options={value.links}
                  getOptionLabel={(link) => linkLabel(link as Link)}
                  getOptionValue={(link) => (link as Link).id as unknown as Link}
                  placeholder={'Select a link'}
                ></Select>
              </InlineField>
              <InlineField grow label="Progress query (0..1)" labelWidth={'auto'}>
                <Select
                  inputId={`nwm-entity-progress-${i}`}
                  onChange={(v) => updateEntity(i, { progressQuery: (v as SelectableValue<string>)?.value })}
                  value={entity.progressQuery}
                  options={queryOptions}
                  placeholder={'Select a query'}
                  isClearable
                ></Select>
              </InlineField>
              <InlineField grow label="Icon (text/emoji)" labelWidth={'auto'}>
                <Input
                  id={`nwm-entity-icon-${i}`}
                  value={entity.icon ?? ''}
                  placeholder="●"
                  onChange={(e) => updateEntity(i, { icon: e.currentTarget.value })}
                />
              </InlineField>
              <InlineField grow label="Size" labelWidth={'auto'}>
                <Input
                  id={`nwm-entity-size-${i}`}
                  value={entity.size ?? 14}
                  type="number"
                  onChange={(e) =>
                    updateEntity(i, { size: finiteOrFallback(e.currentTarget.valueAsNumber, entity.size ?? 14) })
                  }
                />
              </InlineField>
              <InlineField grow label="Show label" labelWidth={'auto'}>
                <InlineSwitch
                  id={`nwm-entity-show-label-${i}`}
                  value={entity.showLabel !== false}
                  onChange={(e) => updateEntity(i, { showLabel: e.currentTarget.checked })}
                />
              </InlineField>
              <Button variant="destructive" icon="trash-alt" size="md" onClick={() => removeEntity(i)}>
                Remove Entity
              </Button>
            </React.Fragment>
          );
        }
        return null;
      })}

      <Button
        variant="secondary"
        icon="plus"
        size="md"
        onClick={addNewEntity}
        className={styles.addNew}
        disabled={value.links.length === 0}
      >
        Add Entity
      </Button>
      <Button
        variant="secondary"
        icon="trash-alt"
        size="md"
        onClick={() => {
          let weathermap: Weathermap = structuredClone(value);
          weathermap.entities = [];
          onChange(weathermap);
          setCurrentEntity('null' as unknown as MovingEntity);
        }}
        className={styles.clearAll}
        disabled={entities.length === 0}
      >
        Clear All
      </Button>
    </React.Fragment>
  );
};

const getStyles = () => {
  return {
    entitySelect: css`
      margin: 0px 0px;
    `,
    addNew: css`
      width: calc(50% - 10px);
      justify-content: center;
      margin: 10px 0px;
      margin-right: 5px;
    `,
    clearAll: css`
      width: calc(50% - 10px);
      justify-content: center;
      margin: 10px 0px;
      margin-left: 5px;
    `,
  };
};
