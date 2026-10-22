import { expect, test } from "@playwright/test";

/**
 * The right rail is one toolbar: a single stop in the Tab order, with the
 * arrow keys moving between its toggles and wrapping at either end. Every
 * toggle says whether it is pressed.
 */
test("the right rail is one Tab stop and the arrows move between its toggles", async ({ page }) => {
  await page.addInitScript(() => {
    const workspaceId = "workspace-1";
    const workspace = { id: workspaceId, name: "main", updatedAt: "2026-07-31T00:00:00.000Z" };
    const snapshot = { activeTaskId: "", openTaskTabIds: [], tasks: [], messagesByTask: {} };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([{ ...workspace, snapshot }]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          repositoryPath: "/tmp/stave-project",
          repositoryName: "stave-project",
          defaultBranch: "main",
          workspaces: [workspace],
          activeWorkspaceId: workspaceId,
          workspaceBranchById: { [workspaceId]: "main" },
          workspacePathById: { [workspaceId]: "/tmp/stave-project" },
          workspaceDefaultById: { [workspaceId]: true },
          ...snapshot,
        },
        version: 0,
      }),
    );
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const rail = page.getByTestId("workspace-bar");
  await expect(rail.getByRole("toolbar", { name: "Workspace panels" })).toBeVisible();
  await expect(rail.locator("button[aria-pressed]")).toHaveCount(8);
  await expect(rail.locator('button[tabindex="0"]')).toHaveCount(1);

  const explorer = rail.getByRole("button", { name: "Explorer" });
  await explorer.focus();
  await page.keyboard.press("ArrowDown");
  await expect(rail.getByRole("button", { name: "Source Control" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(explorer).toBeFocused();
  // The arrows wrap: up from the first toggle is the last one.
  await page.keyboard.press("ArrowUp");
  await expect(rail.getByRole("button", { name: "Terminal" })).toBeFocused();

  // The toggle that had focus keeps the rail's one tab stop, so Tab and
  // Shift+Tab come back to it, and Tab leaves the rail in one step.
  await expect(rail.locator('button[tabindex="0"]')).toHaveCount(1);
  await expect(rail.getByRole("button", { name: "Terminal" })).toHaveAttribute("tabindex", "0");
  await page.keyboard.press("Tab");
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(document.activeElement?.closest("[data-testid='workspace-bar']"))),
    )
    .toBe(false);
});
