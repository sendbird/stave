import { expect, test, type Page } from "@playwright/test";

async function seedShell(page: Page) {
  await page.addInitScript(() => {
    const workspaceSnapshot = {
      activeTaskId: "task-base-ui",
      openTaskTabIds: ["task-base-ui"],
      activeSurface: { kind: "task", taskId: "task-base-ui" },
      tasks: [
        {
          id: "task-base-ui",
          title: "Base UI migration",
          provider: "claude-code",
          updatedAt: "2026-07-24T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-base-ui": [] },
    };

    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-07-24T00:00:00.000Z",
          snapshot: workspaceSnapshot,
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
              updatedAt: "2026-07-24T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
          settings: {
            autoRoutingEnabled: true,
            autoRoutingObjective: 0.5,
          },
          ...workspaceSnapshot,
        },
        version: 0,
      }),
    );

    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
        getCodexModelCatalog: async () => ({
          ok: true,
          models: [],
          detail: "",
        }),
      },
      terminal: {
        runCommand: async () => ({
          ok: true,
          code: 0,
          stdout: "",
          stderr: "",
        }),
      },
      sourceControl: {
        getStatus: async () => ({
          ok: true,
          branch: "main",
          items: [],
          hasConflicts: false,
          stderr: "",
        }),
      },
    };
  });
}

test("app menu, command palette, and shortcut drawer preserve keyboard focus", async ({
  page,
}, testInfo) => {
  await seedShell(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const menuTrigger = page.getByRole("button", { name: "Open Stave menu" });
  await menuTrigger.focus();
  await menuTrigger.press("Enter");

  const homeItem = page.getByRole("menuitem", { name: "Home" });
  await expect(homeItem).toBeFocused();
  await page.keyboard.press("ArrowDown");

  const commandPaletteItem = page.getByRole("menuitem", {
    name: /Command Palette/,
  });
  await expect(commandPaletteItem).toBeFocused();
  await page.keyboard.press("Enter");

  const commandPalette = page.getByRole("dialog", {
    name: "Command Palette",
  });
  await expect(commandPalette).toBeVisible();
  await expect(
    page.getByPlaceholder("Find a command, task, workspace, or setting…"),
  ).toBeFocused();
  await expect
    .poll(async () => (await commandPalette.boundingBox())?.width ?? 0)
    .toBeGreaterThan(600);
  await commandPalette.screenshot({
    path: testInfo.outputPath("command-palette.png"),
  });

  await page.keyboard.press("Escape");
  await expect(commandPalette).toBeHidden();
  await expect(menuTrigger).toBeFocused();

  await menuTrigger.press("Enter");
  await page.getByRole("menuitem", { name: "Keyboard shortcuts" }).click();

  const shortcutDrawer = page.getByRole("dialog", {
    name: "Keyboard reference",
  });
  await expect(shortcutDrawer).toBeVisible();
  const shortcutSearch = page.getByRole("textbox", {
    name: "Search keyboard shortcuts",
  });
  await shortcutSearch.fill("command palette");
  await expect(shortcutDrawer.getByText("Open command palette")).toBeVisible();
  await shortcutDrawer.screenshot({
    path: testInfo.outputPath("keyboard-reference.png"),
  });
  await page.keyboard.press("Escape");
  await expect(shortcutDrawer).toBeHidden();
  await expect(menuTrigger).toBeFocused();

  await menuTrigger.press("Enter");
  await expect(homeItem).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(homeItem).toBeHidden();
  await expect(menuTrigger).toBeFocused();

  const displayModeTrigger = page.getByRole("button", {
    name: "workspace-item-display-mode",
  });
  await displayModeTrigger.focus();
  await displayModeTrigger.press("Enter");

  const expandedMode = page.getByRole("menuitemradio", {
    name: "Expanded",
  });
  const compactMode = page.getByRole("menuitemradio", {
    name: "Compact",
  });
  await expect(expandedMode).toBeFocused();
  await expect(expandedMode).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowDown");
  await expect(compactMode).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(compactMode).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(displayModeTrigger).toBeFocused();
});

test("command palette persists pins and recent commands from the keyboard", async ({
  page,
}) => {
  await seedShell(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.keyboard.press("Control+Shift+P");
  let commandPalette = page.getByRole("dialog", {
    name: "Command Palette",
  });
  let commandInput = commandPalette.getByPlaceholder(
    "Find a command, task, workspace, or setting…",
  );
  await commandInput.fill("Open Settings");

  const pinButton = commandPalette.getByRole("button", {
    name: "Pin Open Settings",
  });
  await expect(pinButton).toBeEnabled();
  await expect(pinButton).toHaveAttribute("aria-keyshortcuts", "Alt+P");
  await commandInput.press("Alt+p");
  await expect(
    commandPalette.getByRole("button", { name: "Unpin Open Settings" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const persisted = JSON.parse(
          window.localStorage.getItem("stave-store") ?? "{}",
        ) as {
          state?: {
            settings?: { commandPalettePinnedCommandIds?: string[] };
          };
        };
        return persisted.state?.settings?.commandPalettePinnedCommandIds ?? [];
      }),
    )
    .toContain("settings.open");

  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+Shift+P");
  commandPalette = page.getByRole("dialog", { name: "Command Palette" });
  const pinnedGroup = commandPalette
    .getByText("Pinned", { exact: true })
    .locator("..");
  await expect(
    pinnedGroup.getByText("Open Settings", { exact: true }),
  ).toBeVisible();

  commandInput = commandPalette.getByPlaceholder(
    "Find a command, task, workspace, or setting…",
  );
  await expect(
    commandPalette.getByRole("button", { name: "Unpin Open Settings" }),
  ).toBeVisible();
  await commandInput.press("Alt+p");
  await expect(
    commandPalette.getByRole("button", { name: "Pin Open Settings" }),
  ).toBeVisible();

  await commandInput.fill("Open Keyboard Shortcuts");
  await commandPalette
    .getByText("Open Keyboard Shortcuts", { exact: true })
    .click();
  const shortcutDrawer = page.getByRole("dialog", {
    name: "Keyboard reference",
  });
  await expect(shortcutDrawer).toBeVisible();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+Shift+P");
  commandPalette = page.getByRole("dialog", { name: "Command Palette" });
  const recentGroup = commandPalette
    .getByText("Recent", { exact: true })
    .locator("..");
  await expect(
    recentGroup.getByText("Open Keyboard Shortcuts", { exact: true }),
  ).toBeVisible();
});

test("settings sliders respond to keyboard input and persist scalar values", async ({
  page,
}) => {
  await seedShell(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.keyboard.press("Control+Shift+P");
  const commandPalette = page.getByRole("dialog", {
    name: "Command Palette",
  });
  const commandInput = commandPalette.getByPlaceholder(
    "Find a command, task, workspace, or setting…",
  );
  await commandInput.fill("Open Settings: Models");
  await commandPalette
    .getByText("Open Settings: Models", { exact: true })
    .click();

  const objectiveSlider = page.getByRole("slider", {
    name: "Auto routing objective",
  });
  await expect(objectiveSlider).toHaveAttribute("aria-valuenow", "0.5");
  await objectiveSlider.focus();
  await objectiveSlider.press("ArrowRight");
  await expect(objectiveSlider).toHaveAttribute("aria-valuenow", "0.55");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const persisted = JSON.parse(
          window.localStorage.getItem("stave-store") ?? "{}",
        ) as {
          state?: { settings?: { autoRoutingObjective?: number } };
        };
        return persisted.state?.settings?.autoRoutingObjective;
      }),
    )
    .toBe(0.55);
});
