import { test, expect } from '@grafana/plugin-e2e';
import { Page } from '@playwright/test';

// Baseline E2E for the core panel interactions (#38). A fresh panel
// initializes with two nodes (Node A, Node B) joined by one link; nodes added
// through the editor are labeled 'Test Label'.

// No datasource needed: the baseline tests only exercise the editor and the
// rendered map, and a fresh panel initializes its own default weathermap.
// The visualization picker is driven with accessible-role locators because
// plugin-e2e's setVisualization selector map lags the Grafana 12.4 picker UI.
const setupPanel = async (page: Page) => {
  await page.getByRole('button', { name: /Change visualization/i }).click();
  await page.getByText('Network Weathermap NG', { exact: true }).first().click();
};

test.describe('Network Weathermap Panel', () => {
  test('should display panel without errors', async ({ panelEditPage, page }) => {
    await setupPanel(page);
    await expect(panelEditPage.panel.locator).toBeVisible();
    // The default map renders both initial nodes.
    await expect(panelEditPage.panel.locator.getByText('Node A')).toBeVisible();
    await expect(panelEditPage.panel.locator.getByText('Node B')).toBeVisible();
  });

  test('can add a node via the editor', async ({ panelEditPage, page }) => {
    await setupPanel(page);
    await expect(panelEditPage.panel.locator.getByText('Node A')).toBeVisible();

    await page.getByRole('button', { name: 'Add Node' }).click();

    // The new node appears on the map with the default label.
    await expect(panelEditPage.panel.locator.getByText('Test Label')).toBeVisible();
  });

  test('can add a link between two nodes', async ({ panelEditPage, page }) => {
    await setupPanel(page);
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
    await setupPanel(page);

    // Add a threshold (defaults to 0%) — the in-panel legend shows it.
    await page.getByRole('button', { name: 'Add Scale Value' }).click();
    await expect(panelEditPage.panel.locator.getByText('0%', { exact: false })).toBeVisible();

    // Change the threshold; the legend follows on commit (blur).
    const threshold = page.getByLabel('Weathermap Threshold 0');
    await threshold.fill('42');
    await threshold.blur();
    await expect(panelEditPage.panel.locator.getByText('42%', { exact: false })).toBeVisible();
  });
});
