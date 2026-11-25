import { expect, test, type Page } from "@playwright/test";

const SCRATCH = process.env.STAVE_E2E_SCREENSHOT_DIR;

/** One repository whose parent workspace delegated two children, one of which delegated a grandchild. */
async function seed(page: Page) {
  await page.addInitScript(() => {
    const repositoryPath = "/tmp/delegated-nesting";
    const ids = ["base", "parent", "other", "child-a", "child-b", "grandchild"];
    const names: Record<string, string> = { base: "Default", parent: "Parent work", other: "Other work",
      "child-a": "subagent-review-a-very-long-delegation-key-that-must-truncate-cleanly", "child-b": "subagent-docs", grandchild: "subagent-nested" };
    const workspaces = ids.map((id) => ({ id, name: names[id]!, updatedAt: "2026-11-01T00:00:00.000Z" }));
    const state = {
      repositoryPath, repositoryName: "Repository", workspaces, lastOpenedAt: "2026-11-01T00:00:00.000Z", defaultBranch: "main",
      activeWorkspaceId: "base",
      workspaceBranchById: Object.fromEntries(ids.map((id) => [id, id === "base" ? "main" : id])),
      workspacePathById: Object.fromEntries(ids.map((id) => [id, id === "base" ? repositoryPath : `${repositoryPath}/.stave/workspaces/${id}`])),
      workspaceDefaultById: { base: true },
    };
    localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify(workspaces.map((workspace) => ({ ...workspace, snapshot: { activeTaskId: "", tasks: [], messagesByTask: {}, openTaskTabIds: [] } }))));
    localStorage.setItem("stave-store", JSON.stringify({ state: { ...state, recentRepositories: [], tasks: [], messagesByTask: {}, activeTaskId: "" }, version: 0 }));
    const link = (child: string, parent: string, phase: string) => ({ childWorkspaceId: child, parentWorkspaceId: parent, parentTaskId: `task-${parent}`,
      childTaskId: `task-${child}`, phase, runId: `child-task:task-${parent}:${child}`, createdAt: "2026-11-01T00:00:00.000Z" });
    (window as unknown as { api: unknown }).api = {
      provider: { streamTurn: async () => [] },
      terminal: { runCommand: async () => ({ ok: false, code: 1, stdout: "", stderr: "" }) },
      sourceControl: { getStatus: async () => ({ ok: true, branch: "main", items: [], hasConflicts: false, stderr: "" }), getHistory: async () => ({ ok: true, items: [], stderr: "" }) },
      // The ledger read main serves (`delegations:list-workspace-links`).
      runs: { listDelegatedWorkspaceLinks: async () => [link("child-a", "parent", "running"), link("child-b", "parent", "completed"), link("grandchild", "child-a", "waiting")] },
    };
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const sidebar = page.getByTestId("project-workspace-sidebar");
  await expect(sidebar.locator('[data-workspace-item="grandchild"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return sidebar;
}

const left = (page: Page, id: string) => page.locator(`[data-workspace-item="${id}"]`).evaluate((element) => element.getBoundingClientRect().left);
const token = (page: Page, name: string) => page.evaluate((name) => {
  const probe = document.createElement("div");
  probe.style.width = `var(${name})`;
  document.body.append(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}, name);

for (const [theme, density] of [["light", "regular"], ["dark", "compact"]] as const) {
  test(`delegated children nest under their parent with token indentation (${theme}/${density})`, async ({ page }) => {
    const sidebar = await seed(page);
    await page.evaluate(async ({ theme, density }) => {
      const { useAppStore } = await import("/src/store/app.store.ts");
      useAppStore.getState().updateSettings({ patch: { themeMode: theme, uiDensity: density } });
      await document.fonts.ready;
    }, { theme, density });

    // Display order: each child right after its parent, the grandchild under its own parent.
    const order = await sidebar.locator("[data-workspace-item]").evaluateAll((rows) => rows.map((row) => `${row.getAttribute("data-workspace-depth")}:${row.getAttribute("data-workspace-item")}`));
    expect(order).toEqual(["0:base", "0:parent", "1:child-a", "2:grandchild", "1:child-b", "0:other"]);

    // Indentation is exactly the AUI space tokens, per level.
    const [space16, space32] = [await token(page, "--aui-space-16"), await token(page, "--aui-space-32")];
    const base = await left(page, "parent");
    expect(await left(page, "other")).toBeCloseTo(base, 1);
    expect((await left(page, "child-a")) - base).toBeCloseTo(space16, 1);
    expect((await left(page, "child-b")) - base).toBeCloseTo(space16, 1);
    expect((await left(page, "grandchild")) - base).toBeCloseTo(space32, 1);

    // The parent shows every nested workspace in its count; the child shows its own.
    const parentToggle = sidebar.getByTestId("workspace-children-toggle-parent");
    await expect(parentToggle).toHaveText("3");
    await expect(parentToggle).toHaveAttribute("aria-expanded", "true");
    await expect(sidebar.getByTestId("workspace-children-toggle-child-a")).toHaveText("1");
    await expect(sidebar.getByTestId("workspace-children-toggle-other")).toHaveCount(0);
    // The nested rows' delegation phase is their status mark.
    await expect(page.locator('[id$="-status"]').filter({ hasText: /./ })).not.toHaveCount(0);

    // The narrow sidebar truncates a long child name with an ellipsis inside its row.
    await page.evaluate(async () => {
      const { useAppStore } = await import("/src/store/app.store.ts");
      useAppStore.getState().setLayout({ patch: { workspaceSidebarWidth: 220 } });
    });
    await expect(sidebar).toHaveCSS("width", "220px");
    const label = sidebar.locator('[data-workspace-item="child-a"]').getByText(/subagent-review-a-very-long/).first();
    const truncation = await label.evaluate((element) => {
      const style = getComputedStyle(element);
      const row = element.closest("[data-workspace-item]")!.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      return { overflowed: element.scrollWidth > element.clientWidth, textOverflow: style.textOverflow, inside: box.right <= row.right + 0.5 };
    });
    expect(truncation).toEqual({ overflowed: true, textOverflow: "ellipsis", inside: true });
    if (SCRATCH) await sidebar.screenshot({ path: `${SCRATCH}/sidebar-nesting-${theme}.png` });

    // Collapsing the parent hides every nested row and keeps the count.
    await parentToggle.click();
    await expect(parentToggle).toHaveAttribute("aria-expanded", "false");
    await expect(parentToggle).toHaveText("3");
    await expect(sidebar.locator("[data-workspace-item]")).toHaveCount(3);
    await parentToggle.click();
    await expect(sidebar.locator("[data-workspace-item]")).toHaveCount(6);
  });
}

test("archiving a parent found by search still lists the nested workspaces the search hides", async ({ page }) => {
  const sidebar = await seed(page);
  await sidebar.getByTestId("search-workspaces").fill("Parent work");
  await expect(sidebar.locator('[data-workspace-item="parent"]')).toBeVisible();
  await expect(sidebar.locator('[data-workspace-item="child-a"]')).toHaveCount(0);
  await sidebar.locator('[data-workspace-item="parent"]').hover();
  await sidebar.getByTestId("workspace-actions-parent").click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  const nested = page.getByTestId("archive-nested-workspaces");
  await expect(nested).toBeVisible();
  // Deepest first, as they are archived: every nested workspace, not only the rows the search shows.
  await expect(nested.locator("li")).toHaveText(["subagent-nested", "subagent-docs", /^subagent-review-a-very-long/]);
});
