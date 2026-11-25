import { expect, test, type Locator } from "@playwright/test";

async function expectVisiblePanel(panel: Locator, source: string, title: string) {
  await expect(panel).toHaveAttribute("data-agent-source", source);
  await expect(panel).toContainText(title);
  // The source surface and its popovers must leave the panel reachable.
  await expect.poll(() => panel.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
}

test("a candidate opens its own live progress beside the comparison", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/compare-run-panel.html?fullShell");
  const candidate = page.locator("section").filter({ has: page.getByRole("heading", { name: "Responsive columns" }) });
  await candidate.getByRole("button", { name: "View progress" }).click();
  const panel = page.getByTestId("agent-progress-panel");
  await expectVisiblePanel(panel, "compare-candidate", "Responsive columns");
  await expect(panel).toContainText("Run command · bun test tests/billing");
  await expect(panel).toContainText("80k in · 8k out");
});

test("Tars opens the selected run's progress from its work tray", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 900 });
  await page.goto("/?stavePreview=tars&tray=true&live=true&fullShell");
  await page.locator("[data-tars-running-status]").click();
  const card = page.locator('[data-tars-card="billing"]');
  const title = card.locator("[data-tars-card-title]");
  if (await title.getAttribute("aria-expanded") !== "true") await title.click();
  await card.getByRole("button", { name: "View progress" }).click();
  const panel = page.getByTestId("agent-progress-panel");
  await expectVisiblePanel(panel, "tars", "Fix the billing export on empty invoice lists");
  await expect(panel).toContainText("Reproduce");
});
