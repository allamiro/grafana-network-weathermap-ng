import React from 'react';
import { InlineFieldRow, Button, useStyles2 } from '@grafana/ui';
import { GrafanaTheme2, StandardEditorProps } from '@grafana/data';
import { Weathermap } from 'types';
import { css } from '@emotion/css';

interface Settings {}

interface Props extends StandardEditorProps<Weathermap, Settings> {}

export const ExportForm = ({ value, onChange }: Props) => {
  const styles = useStyles2(getStyles);

  const generateDownloadLink = (href: string, download: string) => {
    let downloadLink = document.createElement('a');
    downloadLink.href = href;
    downloadLink.download = download;
    downloadLink.target = '_blank';

    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  const handleSVGExport = async () => {
    const svg = document.getElementById(`nw-${value.id}_`);

    // The SVG element may be missing (e.g. panel not yet rendered). Guard
    // against it so the editor does not crash on export.
    if (!svg) {
      return;
    }

    let data = svg.outerHTML || '';
    const preface = '<?xml version="1.0" standalone="no"?>\r\n';

    // Inline each icon as a data URL so the exported SVG is self-contained.
    // A failed fetch (offline icon host, CORS) keeps the original href and
    // must not abort the whole export.
    const icons = svg.getElementsByTagName('image');
    for (let i = 0; i < icons.length; i++) {
      // href may live on the SVG animated property or a plain (xlink:)href
      // attribute depending on how the image was authored.
      const href =
        icons[i].href?.baseVal || icons[i].getAttribute('href') || icons[i].getAttribute('xlink:href') || '';
      // data: is already self-contained; blob: is session-scoped and cannot
      // be resolved outside this page — leave both untouched.
      if (!href || href.startsWith('data:') || href.startsWith('blob:')) {
        continue;
      }
      try {
        // Resolves relative, root-relative, and absolute URLs correctly
        // (the old origin + '/' + href concatenation broke absolute URLs).
        const iconURL = new URL(href, document.location.origin);
        const iconData = await fetch(iconURL.toString());
        if (!iconData.ok) {
          continue;
        }
        const iconString = await iconData.text();
        const base64String = 'data:image/svg+xml;base64,' + window.btoa(iconString);
        data = data.replace(href, base64String);
      } catch (e) {
        // Keep the original href for this icon and continue with the rest.
        continue;
      }
    }

    const svgBlob = new Blob([preface, data], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    generateDownloadLink(svgUrl, `network-weathermap-${new Date().toISOString()}.svg`);
  };

  const handleJSONExport = () => {
    const data = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(value, null, 2));
    generateDownloadLink(data, `network-weathermap-${new Date().toISOString()}.json`);
  };

  if (value) {
    return (
      <React.Fragment>
        <InlineFieldRow>
          <Button onClick={handleSVGExport} className={styles.exportButton}>
            Export SVG
          </Button>
          <Button onClick={handleJSONExport} className={styles.exportJSONButton}>
            Export JSON
          </Button>
        </InlineFieldRow>
      </React.Fragment>
    );
  } else {
    return <React.Fragment />;
  }
};

const getStyles = (theme: GrafanaTheme2) => {
  return {
    exportButton: css`
      margin: ${theme.spacing(1)} 0;
      margin-right: ${theme.spacing(1)};
    `,
    exportJSONButton: css`
      margin: ${theme.spacing(1)} 0;
    `,
  };
};
