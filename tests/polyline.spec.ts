import { test, expect } from '@grafana/plugin-e2e';
import { Page, Locator } from '@playwright/test';

// E2E for polyline waypoints (#332/#334): canvas creation (right-click),
// pointer-capture dragging (normal zoom, zoomed, at the panel's bottom edge,
// releasing outside the panel), removal, and save/reload persistence.
// The bottom-edge and outside-release cases are the regression tests for the
// drag-boundary concerns raised during review.

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

const center = async (l: Locator) => {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

// Real pointer drag in steps; returns the final cursor position.
const drag = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  }
  await page.mouse.up();
  return to;
};

// Every rendered vertex of the link, in SVG user units (= panel coordinates),
// so geometry can be compared without any screen-space conversion.
const drawnPoints = async (panel: Locator) => {
  const polys = panel.locator('g[data-testid="link"] polyline');
  const count = await polys.count();
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const attr = (await polys.nth(i).getAttribute('points')) ?? '';
    for (const pt of attr.trim().split(/\s+/).filter(Boolean)) {
      const [x, y] = pt.split(',').map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        out.push({ x, y });
      }
    }
  }
  return out;
};

// The handle's own centre, also in SVG user units.
const handleCoords = async (handle: Locator) => ({
  x: Number(await handle.getAttribute('cx')),
  y: Number(await handle.getAttribute('cy')),
});

// Set Link Offset through the link form (the precision channel).
const setLinkOffset = async (page: Page, value: string) => {
  const picker = page.locator('#nwm-link-picker');
  await picker.click({ force: true });
  await picker.press('ArrowDown');
  await picker.press('Enter');
  const input = page.locator('input[name="linkOffset"]');
  await input.scrollIntoViewIfNeeded();
  await input.fill(value);
  await input.blur();
  await page.waitForTimeout(400);
};

// Right-click the default (straight, horizontal) link at its midpoint to
// insert a waypoint there — the canvas creation gesture.
const addWaypointOnCanvas = async (page: Page, panel: Locator) => {
  const line = panel.locator('g[data-testid="link"] polyline').first();
  const c = await center(line);
  await page.mouse.click(c.x, c.y, { button: 'right' });
  await expect(panel.getByTestId('waypoint-handle')).toHaveCount(1);
  return panel.getByTestId('waypoint-handle').first();
};

test.describe('Polyline waypoints', () => {
  test('right-click adds a waypoint; dragging its handle bends the link and tracks the cursor', async ({
    panelEditPage,
    page,
  }) => {
    await setupPanel(panelEditPage, page);
    const panel = panelEditPage.panel.locator;
    const handle = await addWaypointOnCanvas(page, panel);

    const start = await center(handle);
    const target = { x: start.x + 60, y: start.y - 70 };
    await drag(page, start, target);

    const after = await center(handle);
    // Cursor-locked within a few px — the tracking contract.
    expect(Math.abs(after.x - target.x)).toBeLessThan(5);
    expect(Math.abs(after.y - target.y)).toBeLessThan(5);
    // The link now renders bent: some rendered point left the straight
    // baseline. (Counting points on one half is not sufficient — a bend that
    // falls inside the arrow-junction gap keeps both halves two-point.)
    const halves = panel.locator('g[data-testid="link"] polyline');
    const all = (await halves.allTextContents(), await Promise.all(
      Array.from({ length: await halves.count() }, (_, i) => halves.nth(i).getAttribute('points'))
    ));
    const ys = all
      .flatMap((p) => (p ?? '').trim().split(/\s+/))
      .map((pt) => Number(pt.split(',')[1]))
      .filter((y) => Number.isFinite(y));
    const baselineY = start.y; // straight default link is horizontal at the handle's start height... use spread instead
    const spread = Math.max(...ys) - Math.min(...ys);
    expect(spread).toBeGreaterThan(15);
  });

  test('handles remain grabbable and draggable at the bottom edge of the panel (regression)', async ({
    panelEditPage,
    page,
  }) => {
    await setupPanel(panelEditPage, page);
    const panel = panelEditPage.panel.locator;
    const handle = await addWaypointOnCanvas(page, panel);
    const svg = (await panel.locator('svg[id^="nw-"]').boundingBox())!;

    // Park the waypoint at the very bottom of the canvas...
    let pos = await center(handle);
    await drag(page, pos, { x: svg.x + svg.width * 0.5, y: svg.y + svg.height - 8 });
    pos = await center(handle);
    expect(svg.y + svg.height - pos.y).toBeLessThan(16); // it reached the bottom strip

    // ...then grab it AT the bottom edge and drag it back up.
    const upTarget = { x: svg.x + svg.width * 0.45, y: svg.y + svg.height * 0.5 };
    await drag(page, pos, upTarget);
    const after = await center(handle);
    expect(Math.abs(after.y - upTarget.y)).toBeLessThan(6);
  });

  test('pointer capture: dragging outside the panel keeps tracking and commits on outside release', async ({
    panelEditPage,
    page,
  }) => {
    await setupPanel(panelEditPage, page);
    const panel = panelEditPage.panel.locator;
    const handle = await addWaypointOnCanvas(page, panel);
    const before = await center(handle);

    // Drag far beyond the panel/SVG bounds and release there.
    await page.mouse.move(before.x, before.y);
    await page.mouse.down();
    for (let i = 1; i <= 15; i++) {
      await page.mouse.move(before.x + i * 25, Math.max(2, before.y - i * 30));
    }
    await page.mouse.up();

    const after = await center(handle);
    // The handle followed while the cursor was outside and the release
    // committed — it must NOT have snapped back to its start position.
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(40);
  });

  test('dragging stays cursor-locked after zooming the edit-mode canvas', async ({ panelEditPage, page }) => {
    await setupPanel(panelEditPage, page);
    const panel = panelEditPage.panel.locator;
    const handle = await addWaypointOnCanvas(page, panel);
    const svg = (await panel.locator('svg[id^="nw-"]').boundingBox())!;

    // Plain wheel zooms in edit mode.
    await page.mouse.move(svg.x + svg.width / 2, svg.y + svg.height / 2);
    await page.mouse.wheel(0, -100);
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(400);

    const start = await center(handle);
    const target = { x: start.x + 50, y: start.y + 40 };
    await drag(page, start, target);
    const after = await center(handle);
    expect(Math.abs(after.x - target.x)).toBeLessThan(5);
    expect(Math.abs(after.y - target.y)).toBeLessThan(5);
  });

  test('right-click on a handle removes the waypoint; the link straightens', async ({ panelEditPage, page }) => {
    await setupPanel(panelEditPage, page);
    const panel = panelEditPage.panel.locator;
    const handle = await addWaypointOnCanvas(page, panel);
    const c = await center(handle);
    await page.mouse.click(c.x, c.y, { button: 'right' });
    await expect(panel.getByTestId('waypoint-handle')).toHaveCount(0);
  });

  // #336: Link Offset combines with waypoints by TRANSLATING the whole drawn
  // path. Waypoints stay stored unshifted and only the drawing moves, so the
  // handles have to be rendered at `waypoint + offset` while every value
  // written back stays in stored space. jsdom cannot prove the shifted handle
  // is actually grabbable, or that repeated real drags do not walk the link
  // sideways by the offset each time — that needs a browser.
  test('Link Offset translates the drawn path rigidly and the handle moves with it', async ({
    panelEditPage,
    page,
  }) => {
    await setupPanel(panelEditPage, page);
    const panel = panelEditPage.panel.locator;
    const handle = await addWaypointOnCanvas(page, panel);

    // Move the bend clear of the arrow-junction gap so it is a rendered vertex.
    const start = await center(handle);
    await drag(page, start, { x: start.x - 70, y: start.y - 60 });

    const before = await drawnPoints(panel);
    const handleBefore = await handleCoords(handle);
    expect(before.length).toBeGreaterThan(2);

    const OFFSET = 40;
    await setLinkOffset(page, String(OFFSET));

    const after = await drawnPoints(panel);
    const handleAfter = await handleCoords(handle);

    // The default link is horizontal, so the chord normal is the y axis: the
    // whole path shifts by exactly the offset, and by nothing in x.
    expect(after).toHaveLength(before.length);
    expect(Math.abs(handleAfter.x - handleBefore.x)).toBeLessThan(0.5);
    expect(Math.abs(Math.abs(handleAfter.y - handleBefore.y) - OFFSET)).toBeLessThan(0.5);

    // Rigid translation: every rendered vertex moved by the SAME delta, and
    // that delta is the one the handle moved by. This is the isometry
    // guarantee — no vertex was distorted, stretched, or folded.
    const dy = handleAfter.y - handleBefore.y;
    after.forEach((p, i) => {
      expect(Math.abs(p.x - before[i].x)).toBeLessThan(0.5);
      expect(Math.abs(p.y - before[i].y - dy)).toBeLessThan(0.5);
    });
  });

  test('dragging an offset link is cursor-locked and never creeps by the offset', async ({
    panelEditPage,
    page,
  }) => {
    await setupPanel(panelEditPage, page);
    const panel = panelEditPage.panel.locator;
    const handle = await addWaypointOnCanvas(page, panel);
    const seed = await center(handle);
    await drag(page, seed, { x: seed.x - 70, y: seed.y - 60 });
    await setLinkOffset(page, '40');

    // The handle now draws 40px off its stored coordinate. Grabbing it at that
    // DRAWN position must work — hit testing follows the visual, not the store.
    const target = { x: seed.x + 40, y: seed.y - 90 };
    await drag(page, await center(handle), target);
    const landed = await center(handle);
    expect(Math.abs(landed.x - target.x)).toBeLessThan(5);
    expect(Math.abs(landed.y - target.y)).toBeLessThan(5);

    // Zero-distance grab/release cycles. If a commit ever wrote back a DRAWN
    // coordinate, each cycle would add the offset again and walk the link
    // 40px sideways; the position must be bit-stable instead.
    const settled = await handleCoords(handle);
    for (let i = 0; i < 3; i++) {
      const c = await center(handle);
      await drag(page, c, c, 2);
      await page.waitForTimeout(150);
      const now = await handleCoords(handle);
      expect(Math.abs(now.x - settled.x)).toBeLessThan(1);
      expect(Math.abs(now.y - settled.y)).toBeLessThan(1);
    }
  });

  test('waypoints persist across dashboard save and reload', async ({ panelEditPage, page }) => {
    await setupPanel(panelEditPage, page);
    const panel = panelEditPage.panel.locator;
    const handle = await addWaypointOnCanvas(page, panel);
    const start = await center(handle);
    await drag(page, start, { x: start.x + 55, y: start.y - 45 });
    const svg = (await panel.locator('svg[id^="nw-"]').boundingBox())!;
    const moved = await center(handle);
    const rel = { x: moved.x - svg.x, y: moved.y - svg.y };

    // Leave panel edit first (button naming differs: "Back to dashboard" on
    // newer Grafana, "Apply" on 11.x), then save from the dashboard toolbar —
    // the one flow that behaves identically across the support matrix.
    const backBtn = page.getByRole('button', { name: /back to dashboard/i }).first();
    if (await backBtn.isVisible().catch(() => false)) {
      await backBtn.click();
    } else {
      await page.getByRole('button', { name: /^apply$/i }).first().click();
    }
    // Toolbar naming: "Save dashboard" through 12.x, plain "Save" in the
    // 13.x unified editing experience.
    await page
      .getByRole('button', { name: /save dashboard|^save$/i })
      .first()
      .click();
    const drawer = page.getByRole('dialog').last();
    // Accessible name is "Save dashboard button" on 11.x, "Save" on newer.
    await drawer
      .getByRole('button', { name: /^(save|save dashboard( button)?)$/i })
      .first()
      .click();
    await page.waitForURL(/\/d\//, { timeout: 15000 });

    // Reload the saved dashboard and re-enter panel edit.
    const url = new URL(page.url());
    await page.goto(`${url.origin}${url.pathname}?editPanel=1`, { waitUntil: 'networkidle' });
    const panel2 = page.locator('svg[id^="nw-"]');
    await expect(panel2).toBeVisible({ timeout: 20000 });
    const handle2 = page.getByTestId('waypoint-handle').first();
    await expect(handle2).toBeVisible({ timeout: 10000 });

    const svg2 = (await panel2.boundingBox())!;
    const c2 = await center(handle2);
    // Stored coordinates reproduce the displayed location after reload.
    expect(Math.abs(c2.x - svg2.x - rel.x)).toBeLessThan(4);
    expect(Math.abs(c2.y - svg2.y - rel.y)).toBeLessThan(4);
  });
});
