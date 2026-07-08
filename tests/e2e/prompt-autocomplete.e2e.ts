import { expect, test } from "@playwright/test";

function seedWorkspace(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-03-06T01:00:00.000Z",
          snapshot: {
            activeTaskId: "",
            tasks: [],
            messagesByTask: {},
          },
        },
      ]),
    );
    window.localStorage.setItem(
      "stave-store",
      JSON.stringify({
        state: {
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          workspaces: [
            {
              id: "ws-main",
              name: "main",
              updatedAt: "2026-03-06T01:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
          activeTaskId: "",
          tasks: [],
          messagesByTask: {},
        },
        version: 0,
      }),
    );
  });
}

test("clicking an @ autocomplete popover item inserts the reference token", async ({
  page,
}) => {
  await seedWorkspace(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page
    .getByTestId("session-area")
    .getByRole("button", { name: /New Task/ })
    .click();

  const editor = page.locator('[data-prompt-lexical-editor="true"]');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type("Check @");

  const lensItem = page.getByRole("option", { name: /Lens browser/ });
  await expect(lensItem).toBeVisible();
  await lensItem.click();

  // The inserted token renders as a chip labelled with the reference name.
  await expect(editor).toContainText("Lens browser");
  await expect(editor).toContainText("Check");

  // A second reference picked from further down the list must also insert.
  await page.keyboard.type("and @");
  const customItem = page.getByRole("option", { name: /Custom fields/ });
  await expect(customItem).toBeVisible();
  await customItem.click();
  await expect(editor).toContainText("Custom fields");
});
