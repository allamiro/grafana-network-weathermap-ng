import { useStyles2, useTheme2 } from '@grafana/ui';
import { getValueFormat, GrafanaTheme2 } from '@grafana/data';
import { css, cx } from '@emotion/css';
import React from 'react';
import { Threshold, WeathermapSettings } from 'types';

// Format an absolute threshold value for the legend. With a scale unit set,
// route the raw number through Grafana's getValueFormat so it inherits the same
// automatic prefixing (Kb/s, Mb/s, Gb/s…) the link labels use (#327). Without a
// unit, keep the raw number — the pre-#327 behavior.
const formatScaleValue = (value: number, unit?: string): string => {
  if (!unit) {
    return String(value);
  }
  const formatted = getValueFormat(unit)(value);
  return `${formatted.text}${formatted.suffix ?? ''}`;
};

interface ColorScaleProps {
  thresholds: Threshold[];
  settings: WeathermapSettings;
}

// TODO: Fix auto-updating to scale that happens before we've had onBlur called on the ColorForm.
const ColorScale: React.FC<ColorScaleProps> = (props: ColorScaleProps) => {
  const { thresholds, settings } = props;
  const styles = useStyles2(getStyles);
  const theme = useTheme2();

  // Calculate the height of a scale's sub-rectangle
  const scaleHeights: { [num: number]: string } = {};

  if (settings.scale) {
    // Double check scale existence, since sometimes it doesn't before we get here.
    const minBandHeight = (settings.scale.fontSizing?.threshold ?? 12) + 4;
    const isValueMode = settings.colorScaleMode === 'value';

    if (isValueMode || thresholds.length === 0) {
      thresholds.forEach((_, i) => {
        scaleHeights[i] = Math.max(settings.scale.size.height / Math.max(thresholds.length, 1), minBandHeight).toString() + 'px';
      });
    } else {
      const maxThreshold = thresholds[thresholds.length - 1]?.percent ?? 100;
      const ceiling = Math.max(101, maxThreshold + 1);
      thresholds.forEach((threshold, i) => {
        const current: number = threshold.percent;
        const next: number = thresholds[i + 1] !== undefined ? thresholds[i + 1].percent : ceiling;
        let height: number = ((next - current) / ceiling) * settings.scale.size.height;
        height = Math.max(height, minBandHeight);
        scaleHeights[i] = height.toString() + 'px';
      });
    }
  }

  if (settings.scale && settings.scale.fontSizing) {
    // Explicit font color wins (#278); otherwise keep the automatic contrast
    // against the panel background color (best effort — it cannot see
    // background images or the map content underneath).
    const fontColor =
      settings.scale.fontColor ||
      theme.colors.getContrastText(
        settings.panel.backgroundColor.startsWith('image')
          ? settings.panel.backgroundColor.split('|', 3)[1]
          : settings.panel.backgroundColor
      );
    return (
      <div
        data-testid="color-scale"
        className={cx(
          styles.colorScaleContainer,
          css`
            top: ${settings.scale.position.y}%;
            left: ${settings.scale.position.x}%;
          `,
          settings.scale.backgroundColor
            ? css`
                background: ${settings.scale.backgroundColor};
                border: 1px solid ${theme.colors.border.weak};
                border-radius: ${theme.shape.radius.default};
              `
            : css``
        )}
      >
        <div
          className={cx(
            styles.colorBoxTitle,
            css`
              font-size: ${settings.scale.fontSizing.title}px;
              color: ${fontColor};
            `
          )}
        >
          {settings.scale.title}
        </div>
        {thresholds.map((threshold, i) => {
          const isValueMode = settings.colorScaleMode === 'value';
          let label: string;
          if (isValueMode) {
            const unit = settings.scale.scaleUnit;
            const current = formatScaleValue(threshold.percent, unit);
            label =
              thresholds[i + 1] === undefined
                ? current + '+'
                : current + ' – ' + formatScaleValue(thresholds[i + 1].percent, unit);
          } else {
            label =
              threshold.percent +
              '%' +
              (thresholds[i + 1] === undefined
                ? threshold.percent >= 100
                  ? '+'
                  : ' - 100%'
                : ' - ' + thresholds[i + 1].percent + '%');
          }
          return (
            <div className={styles.colorScaleItem} key={i} data-testid="scale-item">
              <span
                className={cx(
                  styles.colorBox,
                  css`
                    background: ${threshold.color};
                    height: ${scaleHeights[i]};
                    width: ${settings.scale.size.width}px;
                  `
                )}
              ></span>
              <span
                className={cx(
                  styles.colorLabel,
                  css`
                    font-size: ${settings.scale.fontSizing.threshold}px;
                    color: ${fontColor};
                  `
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    );
  } else {
    return <React.Fragment />;
  }
};

const getStyles = (theme: GrafanaTheme2) => {
  return {
    colorScaleContainer: css`
      position: relative;
      padding: ${theme.spacing(1.25)};
      display: flex;
      flex-direction: column;
      /*
        Inherited only: the title and every threshold label set their own color
        (an explicit fontColor, or automatic contrast against the panel
        background). This is the fallback for anything that does not, and is a
        theme token rather than a literal so it follows light/dark switching.
      */
      color: ${theme.colors.text.primary};
      /* Local stacking above the map SVG — not an overlay layer, so no
         theme.zIndex token applies. */
      z-index: 2;
      width: fit-content;
    `,
    colorBoxTitle: css`
      font-weight: bold;
      padding: ${theme.spacing(0.625, 0)};
    `,
    colorScaleItem: css`
      display: flex;
      align-items: center;
    `,
    colorBox: css`
      margin-right: ${theme.spacing(0.625)};
    `,
    colorLabel: css`
      line-height: normal;
      white-space: nowrap;
    `,
  };
};

export default ColorScale;
