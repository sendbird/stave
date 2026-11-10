import { expect, test } from "@playwright/test";


for (const lang of ["en", "ko"]) for (const theme of ["light", "dark"]) for (const density of ["regular", "compact"]) test(`saved Tars outputs and report ${lang} ${theme} ${density}`, async ({ page }, testInfo) => {

  await page.setViewportSize({ width: 1440, height: 1000 });
  // Old reports have live links only. This is the actual report/output component's unchanged external-link branch.
  await page.goto(`/?stavePreview=tars&outputs=true&artifacts=before&lang=${lang}&theme=${theme}&density=${density}`);
  await expect(page.locator('[data-tars-tray] [data-tars-output="link"]').filter({ hasText: "Original" })).toHaveAttribute("data-tars-output-opens", "external");
  await page.evaluate(() => document.fonts.ready);
  if (process.env.STAVE_COLLECT_HTML_EVIDENCE === "1" && density === "regular") await page.screenshot({ path: testInfo.outputPath(`before-${lang}-${theme}.png`) });
  await page.goto(`/?stavePreview=tars&outputs=true&artifacts=after&lang=${lang}&theme=${theme}&density=${density}`);
  const original = page.locator('[data-tars-tray] [data-tars-output="link"]').filter({ hasText: "Original" });
  await expect(original).toHaveAttribute("data-tars-output-opens", "saved");
  await original.getByRole("button").click();
  const dialog = page.getByRole("dialog");
  const frame = dialog.frameLocator('iframe[title="Original"]');
  await expect(frame.getByRole("heading")).toHaveText("Original example");
  await frame.getByRole("button").click();
  await expect(frame.getByRole("button")).toHaveText("Clicked");
  await expect(dialog.locator('[data-artifact-presentation="example"]')).toBeVisible();
  // No automatic server launch. A missing execution workspace cannot take away the saved page.
  await dialog.getByRole("button", { name: lang === "ko" ? "실제 앱 실행" : "Start real app", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(frame.getByRole("heading")).toHaveText("Original example");
  await page.evaluate(() => document.fonts.ready);
  if (process.env.STAVE_COLLECT_HTML_EVIDENCE === "1" && density === "regular") await page.screenshot({ path: testInfo.outputPath(`after-${lang}-${theme}.png`) });
  for (const width of [560, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    expect(await dialog.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await expect(frame.getByRole("heading")).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-tars-tray] [data-tars-output="link"]').filter({ hasText: "Revised" }).getByRole("button").click();
  await expect(dialog.frameLocator('iframe[title="Revised"]').getByRole("heading")).toHaveText("Revised example");
  await page.keyboard.press("Escape");
  // The completion card uses the shared saved opener as well.
  await page.locator('[data-tars-result="completed"] [data-saved-html-open]').filter({ hasText: "Original" }).click();
  await expect(dialog.frameLocator('iframe[title="Original"]').getByRole("heading")).toHaveText("Original example");
  await page.keyboard.press("Escape");
  // The report uses the same saved opener as Outputs.
  await page.locator('[data-tars-tray] [data-tars-output="report"]').filter({ hasText: "Show the saved card" }).getByRole("button").click();
  await page.locator('[data-tars-report] [data-saved-html-open]').filter({ hasText: "Original" }).click();
  await expect(dialog.frameLocator('iframe[title="Original"]').getByRole("heading")).toHaveText("Original example");
});

test("live app process uses the existing scripts bridge only after a click, and start failure preserves the saved preview", async ({ page }) => {
  await page.goto("/?stavePreview=tars&outputs=true&artifacts=after");
  await expect(page.locator('[data-tars-tray] [data-tars-output="link"]').filter({ hasText: "Original" })).toBeVisible();
  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    useAppStore.setState({ recentRepositories: [{ repositoryPath: "/tmp/preview", repositoryName: "Preview", lastOpenedAt: "", defaultBranch: "main", activeWorkspaceId: "missing-execution-workspace", workspaces: [{ id: "missing-execution-workspace", name: "App preview", createdAt: "", updatedAt: "" }], workspacePathById: { "missing-execution-workspace": "/tmp/preview" }, workspaceBranchById: { "missing-execution-workspace": "main" }, workspaceDefaultById: {} }] });
    const facts = { calls: [] as unknown[], configCalls: [] as unknown[], fail: false };
    (window as unknown as { artifactLaunch: typeof facts }).artifactLaunch = facts;
    window.api = { ...window.api, scripts: { ...window.api?.scripts,
      getConfig: async (args) => { facts.configCalls.push(args); return { ok: true, config: { services: [{ id: "dev", kind: "service" }] } }; },
      runEntry: async (args) => { facts.calls.push(args); return { ok: !facts.fail }; },
    } } as typeof window.api;
  });
  await page.locator('[data-tars-tray] [data-tars-output="link"]').filter({ hasText: "Original" }).getByRole("button").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.frameLocator('iframe[title="Original"]').getByRole("heading")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { artifactLaunch: { calls: unknown[] } }).artifactLaunch.calls.length)).toBe(0);
  await dialog.getByRole("button", { name: "Start real app", exact: true }).click();
  await expect(dialog.getByRole("link", { name: "Open real app", exact: true })).toBeVisible();
  const calls = await page.evaluate(() => (window as unknown as { artifactLaunch: { calls: unknown[]; configCalls: unknown[] } }).artifactLaunch);
  expect(calls.calls).toEqual([{ workspaceId: "missing-execution-workspace", repositoryPath: "/tmp/preview", workspacePath: "/tmp/preview", workspaceName: "App preview", branch: "main", scriptId: "dev", scriptKind: "service" }]);
  expect(calls.configCalls).toEqual([{ repositoryPath: "/tmp/preview", workspacePath: "/tmp/preview" }]);
  await page.evaluate(() => { (window as unknown as { artifactLaunch: { fail: boolean } }).artifactLaunch.fail = true; });
  await dialog.getByRole("button", { name: "Start real app", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.frameLocator('iframe[title="Original"]').getByRole("heading")).toHaveText("Original example");
  await expect(dialog.getByRole("link", { name: "Open real app", exact: true })).toHaveCount(0);
});
