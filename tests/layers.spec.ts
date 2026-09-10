import { test, expect } from '@grafana/plugin-e2e';
import { Page, Locator } from '@playwright/test';

// E2E for layer visibility (#269): the three Panel Options → Layers switches
// take effect on the live map, hide the element rather than merely dimming it,
// and leave every other layer alone. The unit suite covers the read-time
// defaults; this covers the actual switch → rendered SVG path through Grafana.

const setupPanel = async (
  panelEditPage: { setVisualization: (n: string) => Promise<void> },
  page: Page
) => {
  const changeViz = page.getByRole('button', { name: /Change visualization/i });
  const hasButton = await changeViz
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (hasButton) {
    await changeViz.click({ timeout: 5000 });
    await page.getByText('Network Weathermap NG', { exact: true }).first().click();
  } else {
    await panelEditPage.setVisualization('Network Weathermap NG');
  }
};

// Target the switch by its own test id, not by walking up from the label
// text: the wrapper markup around InlineField differs between Grafana 11 and
// 12, and a DOM-shape-dependent locator only fails on one of them.
const layerSwitch = (page: Page, layer: string) => page.getByTestId(`layer-${layer}`);

// Flip it through the knob — the <label> Grafana's Switch renders immediately
// after its input — rather than clicking the input itself. Two reasons, one
// per Grafana generation:
//   * the input is visually hidden, and on Grafana 11 it has no viewport box
//     at all, so a mouse click is rejected ("outside of the viewport") even
//     with force;
//   * `label[for=<id>]` is ambiguous — the surrounding InlineField renders a
//     label pointing at the same input, so on Grafana 13 that matches two
//     elements and trips strict mode.
// The sibling relationship holds inside the Switch component in every
// supported version, and is what a real user clicks.
const toggle = async (page: Page, layer: string) => {
  const sw = layerSwitch(page, layer);
  const before = await sw.isChecked();
  const knob = sw.locator('xpath=following-sibling::label[1]');
  const target = (await knob.count()) === 1 ? knob : sw;
  await target.scrollIntoViewIfNeeded();
  await target.click();
  await expect(sw).toBeChecked({ checked: !before });
};

const nodeLabels = (panel: Locator) => panel.locator('svg text', { hasText: /Node/ });
// Value labels carry their own test id: keying off the italic font style only
// worked while they were the sole italic element on the map.
const valueLabels = (panel: Locator) => panel.locator('g[data-testid="link-value-label"]');
const portLabels = (panel: Locator) => panel.locator('svg text', { hasText: 'xe-0/0/9' });

// Give the default link a port label so all three layers have something to
// hide on a freshly created panel.
const setPortLabel = async (page: Page, text: string) => {
  const picker = page.locator('#nwm-link-picker');
  await picker.click({ force: true });
  await picker.press('ArrowDown');
  await picker.press('Enter');
  const input = page.locator('input[name="AportLabel"]');
  await input.scrollIntoViewIfNeeded();
  await input.fill(text);
  await input.blur();
};

test.describe('Layer visibility', () => {
  test('a new panel shows every layer, and each switch hides only its own', async ({ panelEditPage, page }) => {
    await setupPanel(panelEditPage, page);
    const panel = panelEditPage.panel.locator;
    await setPortLabel(page, 'xe-0/0/9');

    // Everything visible by default.
    await expect(nodeLabels(panel).first()).toBeVisible();
    await expect(valueLabels(panel).first()).toBeVisible();
    await expect(portLabels(panel).first()).toBeVisible();

    await toggle(page, 'nodeLabels');
    await expect(nodeLabels(panel)).toHaveCount(0);
    await expect(valueLabels(panel).first()).toBeVisible();
    await expect(portLabels(panel).first()).toBeVisible();

    await toggle(page, 'portLabels');
    await expect(portLabels(panel)).toHaveCount(0);
    await expect(valueLabels(panel).first()).toBeVisible();

    await toggle(page, 'valueLabels');
    await expect(valueLabels(panel)).toHaveCount(0);

    // The map itself is untouched — this hides labels, not content. (Checked
    // by geometry rather than toBeVisible: after scrolling the options pane the
    // panel can sit outside the viewport while still rendering correctly.)
    const line = panel.locator('g[data-testid="link"] polyline').first();
    await expect(line).toHaveAttribute('points', /\d+(\.\d+)?,\d+/);
  });

  test('turning a layer back on restores the labels it hid', async ({ panelEditPage, page }) => {
    await setupPanel(panelEditPage, page);
    const panel = panelEditPage.panel.locator;
    // Wait for the map to draw before reading the baseline: an unpolled read
    // here races the first render and reports zero labels on a fast machine.
    await expect(nodeLabels(panel).first()).toBeVisible();
    const before = await nodeLabels(panel).allTextContents();
    expect(before.length).toBeGreaterThan(0);

    await toggle(page, 'nodeLabels');
    await expect(nodeLabels(panel)).toHaveCount(0);

    await toggle(page, 'nodeLabels');
    await expect(nodeLabels(panel)).toHaveCount(before.length);
    expect(await nodeLabels(panel).allTextContents()).toEqual(before);
  });

  test('a hidden label is gone from the DOM, not just invisible', async ({ panelEditPage, page }) => {
    await setupPanel(panelEditPage, page);
    const panel = panelEditPage.panel.locator;
    // Prove they were drawn first, otherwise a count of zero would also be
    // satisfied by a map that simply had not rendered yet.
    await expect(valueLabels(panel).first()).toBeVisible();

    await toggle(page, 'valueLabels');
    await expect(valueLabels(panel)).toHaveCount(0);
    // Nothing left behind that would still hit-test under the cursor.
    const html = (await panel.locator('svg[id^="nw-"]').first().innerHTML()) ?? '';
    expect(html).not.toContain('link-value-label');
  });
});
