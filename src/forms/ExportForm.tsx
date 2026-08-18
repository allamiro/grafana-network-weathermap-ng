import React, { useRef } from 'react';
import { InlineFieldRow, Button, useStyles2 } from '@grafana/ui';
import { GrafanaTheme2, StandardEditorProps } from '@grafana/data';
import { Weathermap } from 'types';
import { css } from '@emotion/css';

interface Settings {}

interface Props extends StandardEditorProps<Weathermap, Settings> {}

export const ExportForm = ({ value, onChange }: Props) => {
  const styles = useStyles2(getStyles);

  // The download anchor is part of this component's own JSX (below) and is
  // driven through a ref. It used to be created, appended to document.body,
  // clicked and removed imperatively — that reaches outside the component's
  // subtree and mutates the document behind React's back, so an unmount or an
  // exception between append and remove would strand the node in the DOM.
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const generateDownloadLink = (href: string, download: string) => {
    const anchor = downloadRef.current;
    if (!anchor) {
      return;
    }
    anchor.href = href;
    anchor.download = download;
    anchor.click();
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
      // be resolved outside this page — leave both untouched. URL schemes
      // are case-insensitive, so normalize before checking.
      const scheme = href.trim().toLowerCase();
      if (!href || scheme.startsWith('data:') || scheme.startsWith('blob:')) {
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
        {/*
          Hidden, but rendered and owned by React. href/download are set on it
          immediately before the programmatic click; a display:none anchor still
          activates via HTMLElement.click().
        */}
        <a ref={downloadRef} className={styles.downloadAnchor} target="_blank" rel="noreferrer" aria-hidden="true" />
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
    downloadAnchor: css`
      display: none;
    `,
  };
};
