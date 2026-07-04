import { test, expect } from '@grafana/plugin-e2e';
import { Page } from '@playwright/test';

// Baseline E2E for the core panel interactions (#38). A fresh panel
// initializes with two nodes (Node A, Node B) joined by one link; nodes added
// through the editor are labeled 'Test Label'.

// No datasource needed: the baseline tests only exercise the editor and the
// rendered map, and a fresh panel initializes its own default weathermap.
// The viz picker toggle differs across Grafana versions: 11.x/12.4 render a
// "Change visualization" button (which plugin-e2e's selector map misses),
// while newer versions match plugin-e2e's own setVisualization flow. Try the
// button briefly, then fall back to the library.
const setupPanel = async (
  panelEditPage: { setVisualization: (n: string) => Promise<void> },
  page: Page
) => {
  // Pre-check which picker UI is present instead of catching: a failure
  // inside either path must surface, not silently fall through.
  const changeViz = page.getByRole('button', { name: /Change visualization/i });
  const hasButton = await changeViz
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (hasButton) {
    await changeViz.click();
    await page.getByText('Network Weathermap NG', { exact: true }).first().click();
  } else {
    await panelEditPage.setVisualization('Network Weathermap NG');
  }
};

test.describe('Network Weathermap Panel', () => {
  test('should display panel without errors', async ({ panelEditPage, page }) => {
    await setupPanel(panelEditPage, page);
    await expect(panelEditPage.panel.locator).toBeVisible();
    // The default map renders both initial nodes.
    await expect(panelEditPage.panel.locator.getByText('Node A')).toBeVisible();
    await expect(panelEditPage.panel.locator.getByText('Node B')).toBeVisible();
  });

  test('can add a node via the editor', async ({ panelEditPage, page }) => {
    await setupPanel(panelEditPage, page);
    await expect(panelEditPage.panel.locator.getByText('Node A')).toBeVisible();

    await page.getByRole('button', { name: 'Add Node' }).click();

    // The new node appears on the map with the default label.
    await expect(panelEditPage.panel.locator.getByText('Test Label')).toBeVisible();
  });

  test('can add a link between two nodes', async ({ panelEditPage, page }) => {
    await setupPanel(panelEditPage, page);
    // The default map already renders one link between Node A and Node B.
    await expect(panelEditPage.panel.locator.getByTestId('link')).toHaveCount(1);

    // Add Link creates a self-link on Node A and opens its editor; a
    // self-link is not drawn, so rewire its Z side to Node B.
    await page.getByRole('button', { name: 'Add Link' }).click();
    const zSide = page.locator('#nwm-link-side-Z');
    await zSide.fill('Node B');
    await zSide.press('Enter');

    // The second A->B link is now drawn on the map.
    await expect(panelEditPage.panel.locator.getByTestId('link')).toHaveCount(2);
  });

  test('color scale updates when a threshold is changed', async ({ panelEditPage, page }) => {
    await setupPanel(panelEditPage, page);

    // Add a threshold (defaults to 0%) — the in-panel legend shows it.
    await page.getByRole('button', { name: 'Add Scale Value' }).click();
    await expect(panelEditPage.panel.locator.getByText('0%', { exact: false })).toBeVisible();

    // Change the threshold; the legend follows on commit (blur). Locate by
    // the stable element id — the aria-label embeds the current percent and
    // changes while typing.
    const threshold = page.locator('#nwm-scale-threshold-0');
    await threshold.fill('42');
    await threshold.blur();
    await expect(panelEditPage.panel.locator.getByText('42%', { exact: false })).toBeVisible();
  });
});
