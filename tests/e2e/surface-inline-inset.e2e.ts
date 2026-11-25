import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Full-bleed surfaces share one inline inset, `space16`: the page header
 * (`GlobalPageHeader` placement `surface`), the toolbar under it and the first
 * column or band of the body all start and end on the same edges. Before,
 * the header used 20px while toolbars used 16px and list columns 12px.
 */
async function token(page: Page, name: string) {
  return page.evaluate((name) => {
    const probe = document.createElement("div");
    probe.style.width = `var(${name})`;
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  }, name);
}

/** Where an element's content starts and ends, as distances from the surface's edges. */
async function insets(element: Locator, surface: Locator) {
  const outer = await surface.boundingBox();
  return element.evaluate((node, outer) => {
    const box = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      left: box.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth) - outer!.x,
      right: outer!.x + outer!.width - (box.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth)),
    };
  }, outer);
}

async function expectSharedInset(page: Page, bands: Locator[]) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const header = page.locator('[data-placement="surface"]');
  const surface = header.locator("xpath=..");
  const inset = await token(page, "--aui-space-16");
  for (const band of [header, ...bands]) {
    const edges = await insets(band.first(), surface);
    expect(Math.abs(edges.left - inset)).toBeLessThanOrEqual(0.5);
  }
  // The header and the toolbar also end on the same inset.
  for (const band of [header, bands[0]!]) {
    const edges = await insets(band.first(), surface);
    expect(Math.abs(edges.right - inset)).toBeLessThanOrEqual(0.5);
  }
}

for (const theme of ["light", "dark"]) {
  test(`Schedules header, toolbar and schedule list share the 16px inset (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?stavePreview=schedules&theme=${theme}`);
    await expect(page.locator('[data-placement="surface"]')).toBeVisible();
    await expectSharedInset(page, [
      page.locator('[class*="centerStyles.toolbar"]'),
      page.locator('[class*="centerStyles.masterColumn"]'),
    ]);
  });

  test(`Agents header, toolbar and agent list share the 16px inset (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?stavePreview=agents&surface=1&theme=${theme}`);
    await expect(page.locator('[data-placement="surface"]')).toBeVisible();
    await expectSharedInset(page, [
      page.locator('[class*="centerStyles.toolbar"]'),
      page.locator('[class*="workflowStyles.master"]'),
    ]);
  });
}

test("Fleet header, toolbar and attention band share the 16px inset", async ({ page }) => {
  await page.addInitScript(() => {
    const repositoryPath = "/tmp/fleet-inset";
    const updatedAt = new Date().toISOString();
    const tasks = [{ id: "task-1", title: "Task 1", provider: "codex", updatedAt, unread: false, archivedAt: null, controlMode: "interactive", controlOwner: "stave" }];
    const workspace = { id: "ws", name: "ws", updatedAt };
    const snapshot = { activeTaskId: "task-1", tasks, messagesByTask: {}, openTaskTabIds: ["task-1"] };
    localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify([{ ...workspace, snapshot }]));
    localStorage.setItem("stave-store", JSON.stringify({ state: { ...snapshot, repositoryPath, repositoryName: "Fleet inset", workspaces: [workspace],
      activeWorkspaceId: workspace.id, workspacePathById: { [workspace.id]: repositoryPath }, workspaceDefaultById: { [workspace.id]: true } }, version: 0 }));
    (window as unknown as { api: unknown }).api = { provider: { streamTurn: async () => [] }, terminal: { runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }) },
      sourceControl: { getStatus: async () => ({ ok: true, branch: "main", items: [], hasConflicts: false, stderr: "" }), getHistory: async () => ({ ok: true, items: [], stderr: "" }) } };
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByTestId("top-bar").getByRole("button", { name: "Open Fleet View" }).click();
  await expect(page.locator("[data-fleet-view-root='true']")).toBeVisible();
  await expectSharedInset(page, [
    page.locator('[class*="fleetStyles.toolbar"]'),
    page.locator('[class*="attentionStyles.header"]'),
  ]);
});
