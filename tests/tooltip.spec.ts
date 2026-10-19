import { test, expect } from '@grafana/plugin-e2e';
import { APIRequestContext, Locator, Page } from '@playwright/test';
import dashboard from './fixtures/tooltip-dashboard.json';

// Link and node tooltips on real Grafana (#375, #377, #380).
//
// The fixture dashboard queries TestData's raw_frame scenario (it runs in the
// browser, so no backend data is needed) for the shape that broke in #375: a
// "Traffic" frame with two labelled value fields bound to the link's A and Z
// sides, next to a differently named "Link Status" frame. Grafana prefixes
// display names with the frame name only when frame names differ, so the full
// panel binds "Traffic value router-a: 1010x" while the tooltip graph only
// sees Traffic frames; before the fix, hovering cached the prefix-less name
// back into data.series and the next hover, link values and node status lost
// their bindings.

const DATASOURCE = { name: 'WM E2E TestData', type: 'grafana-testdata-datasource', uid: 'wm-e2e-testdata' };

const provision = async (request: APIRequestContext) => {
  const ds = await request.post('/api/datasources', { data: { ...DATASOURCE, access: 'proxy' } });
  // 409: already created by an earlier test in this run.
  expect([200, 409]).toContain(ds.status());
  const dash = await request.post('/api/dashboards/db', { data: { dashboard, overwrite: true } });
  expect(dash.status()).toBe(200);
};

const firstLink = (page: Page) => page.getByTestId('link').first().locator(':scope > *').first();

const hoverAway = (page: Page) => page.mouse.move(2, 2);

// The link tooltip is the parent of its "Usage - ..." line; the graph is a
// sibling of that line.
const linkTooltip = (page: Page): Locator => page.getByText(/^Usage - /).locator('xpath=..');

test.describe('Tooltips', () => {
  test.beforeEach(async ({ request, gotoDashboardPage }) => {
    await provision(request);
    await gotoDashboardPage({ uid: dashboard.uid });
  });

  test('the link tooltip shows values and its graph on every hover (#375)', async ({ page }) => {
    // The link's first child is its hit area (transparent, so Playwright calls
    // it hidden); wait for the map, then hover the hit area with force.
    await expect(page.locator('svg[id^="nw-"]')).toBeVisible({ timeout: 20000 });
    const link = firstLink(page);

    for (let hover = 1; hover <= 3; hover++) {
      await link.hover({ force: true });
      const tooltip = linkTooltip(page);
      await expect(tooltip.getByText(/^Usage - /)).toHaveText(/40\s+b\/s/);
      await expect(tooltip.getByText(/^Usage - /)).toHaveText(/10\s+b\/s/);
      // The graph is a uPlot canvas inside the tooltip.
      await expect(tooltip.locator('canvas').first()).toBeVisible();
      await hoverAway(page);
      await expect(page.getByText(/^Usage - /)).toHaveCount(0);
    }
  });

  test('node status keeps resolving after a link hover (#377)', async ({ page }) => {
    // Node B's status is bound to "Traffic value router-a: 10105" (value 10,
    // so up). An unresolved status query falls back to statusDown (#ff0000),
    // which is what a corrupted cached name produced. The panel re-renders
    // when the hover ends, so no refresh is needed; a refresh would re-query
    // fresh frames and hide the bug.
    const svg = page.locator('svg[id^="nw-"]');
    await expect(svg).toBeVisible({ timeout: 20000 });
    const downNodes = svg.locator('rect[stroke="#ff0000"]');
    await expect(downNodes).toHaveCount(0);

    for (let hover = 1; hover <= 2; hover++) {
      await firstLink(page).hover({ force: true });
      await expect(page.getByText(/^Usage - /)).toBeVisible();
      await hoverAway(page);
      await expect(page.getByText(/^Usage - /)).toHaveCount(0);
      await expect(downNodes).toHaveCount(0);
    }
    await expect(svg.getByText(/^10\s+b\/s$/).first()).toBeVisible();
    await expect(svg).not.toContainText('n/a');
  });

  test('a node tooltip metric without a unit shows the bare number (#380)', async ({ page }) => {
    const node = page.locator('svg[id^="nw-"]').getByText('Node A', { exact: true });
    await expect(node).toBeVisible({ timeout: 20000 });
    await node.hover({ force: true });
    const tooltip = page.getByTestId('weathermap-node-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Status: 1');
    await expect(tooltip).not.toContainText('undefined');
  });
});
