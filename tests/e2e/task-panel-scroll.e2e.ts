import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The Task panel is one scrolling column. A wheel anywhere over it, a live
 * turn's activity list included, moves that column: no part of the panel may
 * hold the wheel without scrolling itself. The tabs stay at the top of the
 * column while the selected view scrolls under them.
 */
async function open(page: Page, query: string) {
  await page.setViewportSize({ width: 460, height: 520 });
  await page.goto(`/?stavePreview=task-panel&panelWidth=372&${query}`);
  const frame = page.getByTestId("task-panel-frame");
  await expect(frame).toBeVisible();
  return frame;
}

async function wheelOver(page: Page, target: Locator) {
  const box = await target.boundingBox();
  // A tall view runs past the rail's floor; stay on the part that is on screen.
  await page.mouse.move(box!.x + box!.width / 2, box!.y + Math.min(box!.height / 2, 60));
  await page.mouse.wheel(0, 200);
}

test("a wheel over a live turn's activity list scrolls the task panel", async ({ page }) => {
  const frame = await open(page, "task=agent-run&background=1&lang=en");
  const scroller = frame.getByTestId("task-panel-scroll");
  const list = frame.getByTestId("turn-activity-list");
  await expect(list).toBeVisible();
  expect(await scroller.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  // The list is as tall as its rows: it has nothing of its own to scroll.
  expect(await list.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  await wheelOver(page, list);
  await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
});

for (const section of ["activity", "steps", "subagents", "background", "outputs"] as const) {
  test(`a wheel over ${section} scrolls the column and keeps the tabs in reach`, async ({ page }) => {
    const frame = await open(page, "task=agent-run&background=1&stuck=1&lang=en");
    const scroller = frame.getByTestId("task-panel-scroll");
    await frame.getByTestId(`task-section-${section}`).click();
    const panel = frame.getByRole("tabpanel");
    await expect(panel).toBeVisible();
    await scroller.evaluate((node) => { node.scrollTop = 0; });
    if (!(await scroller.evaluate((node) => node.scrollHeight > node.clientHeight + 40))) return;
    await wheelOver(page, panel);
    await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await scroller.evaluate((node) => { node.scrollTop = node.scrollHeight; });
    // Scrolled to the end, the strip still sits at the top of the column.
    const [strip, column] = await Promise.all([frame.getByRole("tablist").boundingBox(), scroller.boundingBox()]);
    if (await scroller.evaluate((node) => node.scrollTop > 200)) expect(Math.abs(strip!.y - column!.y)).toBeLessThanOrEqual(1);
    await expect(frame.getByTestId("task-section-activity")).toBeInViewport();
  });
}
