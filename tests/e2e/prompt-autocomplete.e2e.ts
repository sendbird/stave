import { expect, test } from "@playwright/test";

function seedWorkspace(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
    // Keep the browser-only dev bridge from replacing this deterministic
    // fixture with host lookups that are unavailable in Playwright.
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: { streamTurn: async () => [] },
      terminal: {
        runCommand: async () => ({
          ok: true,
          code: 0,
          stdout: "",
          stderr: "",
        }),
      },
    };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-03-06T01:00:00.000Z",
          snapshot: {
            activeTaskId: "task-1",
            openTaskTabIds: ["task-1"],
            activeSurface: { kind: "task", taskId: "task-1" },
            tasks: [
              {
                id: "task-1",
                title: "Autocomplete task",
                provider: "claude-code",
                updatedAt: "2026-03-06T01:00:00.000Z",
                unread: false,
                archivedAt: null,
              },
            ],
            messagesByTask: { "task-1": [] },
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
          activeTaskId: "task-1",
          openTaskTabIds: ["task-1"],
          activeSurface: { kind: "task", taskId: "task-1" },
          tasks: [
            {
              id: "task-1",
              title: "Autocomplete task",
              provider: "claude-code",
              updatedAt: "2026-03-06T01:00:00.000Z",
              unread: false,
              archivedAt: null,
            },
          ],
          messagesByTask: { "task-1": [] },
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

  // The provider browser is a first-class reference beside Lens.
  await page.keyboard.type("and @");
  const webItem = page.getByRole("option", { name: /Connected browser/ });
  await expect(webItem).toBeVisible();
  await webItem.click();
  await expect(editor).toContainText("Connected browser");
});

test("grows and scrolls the prompt after multiline input", async ({ page }) => {
  await seedWorkspace(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const editor = page.locator('[data-prompt-lexical-editor="true"]');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type("line 1");

  const initialHeight = await editor.evaluate(
    (element) => element.getBoundingClientRect().height,
  );

  for (let line = 2; line <= 8; line += 1) {
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type(`line ${line}`);
  }

  const grownHeight = await editor.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  expect(grownHeight).toBeGreaterThan(initialHeight);

  for (let line = 9; line <= 16; line += 1) {
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type(`line ${line}`);
  }

  const scrollState = await editor.evaluate((element) => ({
    overflowY: getComputedStyle(element).overflowY,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
  expect(scrollState.overflowY).toBe("auto");
  expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);

  await editor.hover();
  await page.mouse.wheel(0, 800);
  await expect
    .poll(() => editor.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(scrollState.scrollTop);
});
