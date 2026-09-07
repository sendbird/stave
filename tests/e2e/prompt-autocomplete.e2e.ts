import { expect, test } from "@playwright/test";

function seedWorkspace(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
    const testState = { streamTurnCalls: 0 };
    (
      window as unknown as {
        __stavePromptAutocompleteTestState?: typeof testState;
      }
    ).__stavePromptAutocompleteTestState = testState;
    // Keep the browser-only dev bridge from replacing this deterministic
    // fixture with host lookups that are unavailable in Playwright.
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => {
          testState.streamTurnCalls += 1;
          return [];
        },
      },
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

test("saves the current multiline prompt as a reusable macro without sending it", async ({
  page,
}) => {
  await seedWorkspace(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const prompt = "Review the current patch.\nKeep the public API unchanged.";
  const editor = page.locator('[data-prompt-lexical-editor="true"]');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type("Review the current patch.");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("Keep the public API unchanged.");

  await page.getByRole("button", { name: "Insert a saved macro" }).click();
  await page
    .getByRole("menuitem", { name: /^Save current prompt as macro/ })
    .click();

  const macroEditor = page.getByRole("dialog", {
    name: "Save current prompt as macro",
  });
  await expect(macroEditor).toBeVisible();
  await expect(macroEditor.locator("#macro-editor-body")).toHaveValue(prompt);

  await macroEditor.locator("#macro-editor-label").fill("Review current patch");
  await expect(
    macroEditor.locator("#macro-editor-slug"),
  ).toHaveValue("review-current-patch");
  await macroEditor.getByRole("button", { name: "Save macro" }).click();
  await expect(macroEditor).toBeHidden();

  await expect
    .poll(() => editor.evaluate((element) => element.innerText))
    .toBe(prompt);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const stored = JSON.parse(
          window.localStorage.getItem("stave-store") ?? "{}",
        ) as {
          state?: {
            settings?: {
              macros?: Array<{ body?: string; insertMode?: string }>;
            };
          };
        };
        return stored.state?.settings?.macros?.[0];
      }),
    )
    .toMatchObject({ body: prompt, insertMode: "replace" });

  await editor.fill("Temporary draft that should be replaced.");
  await expect
    .poll(() => editor.evaluate((element) => element.innerText))
    .toBe("Temporary draft that should be replaced.");
  await page.getByRole("button", { name: "Insert a saved macro" }).click();
  await page
    .getByRole("menuitem")
    .filter({ hasText: "Review current patch" })
    .click();

  await expect
    .poll(() => editor.evaluate((element) => element.innerText))
    .toBe(prompt);
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            __stavePromptAutocompleteTestState?: {
              streamTurnCalls: number;
            };
          }
        ).__stavePromptAutocompleteTestState?.streamTurnCalls ?? -1,
    ),
  ).toBe(0);
});
