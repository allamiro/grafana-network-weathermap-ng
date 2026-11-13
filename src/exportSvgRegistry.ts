// Hands a panel's rendered <svg> to the Export editor without querying the
// global document. The panel holds its SVG in a ref and registers it here
// while in panel edit mode; ExportForm looks it up by the weathermap id.
//
// A document-wide lookup (document.getElementById) could match an element
// belonging to another panel or to Grafana itself, and breaks if the id is
// ever duplicated, so plugins must not do it.
const svgs = new Map<string, SVGSVGElement>();

export const registerExportSvg = (id: string, el: SVGSVGElement) => {
  svgs.set(id, el);
};

// Only removes the entry if it still points at this element, so a panel that
// unmounts after another instance re-registered the same id cannot evict it.
export const unregisterExportSvg = (id: string, el: SVGSVGElement) => {
  if (svgs.get(id) === el) {
    svgs.delete(id);
  }
};

export const getExportSvg = (id: string): SVGSVGElement | undefined => svgs.get(id);
