import { test, expect } from '@grafana/plugin-e2e';

test.describe('Network Weathermap Panel', () => {
  test('should display panel without errors', async ({ panelEditPage, selectors }) => {
    await panelEditPage.datasource.set('-- Dashboard --');
    await panelEditPage.setVisualization('Network Weathermap');
    await expect(panelEditPage.panel.locator).toBeVisible();
  });
});
