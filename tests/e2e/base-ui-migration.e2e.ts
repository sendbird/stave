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
}, testInfo) => {
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

  // Settings is code split (`AppShell` lazy-loads `SettingsDialog`), so the
  // surface can still be showing the Suspense fallback right after the command
  // palette entry is activated. Wait for the dialog itself the way the other
  // settings specs do implicitly through their first click — assertions below
  // keep the default 5s budget so slider state stays strictly verified.
  const settingsDialog = page.getByRole("dialog", {
    name: "Settings",
    exact: true,
  });
  const waitStart = Date.now();
  await settingsDialog.waitFor();
  console.log(`settings dialog mounted in ${Date.now() - waitStart}ms`);

  const objectiveSlider = page.getByRole("slider", {
    name: "Auto routing objective",
  });
  await expect(objectiveSlider).toHaveAttribute("aria-valuenow", "0.5");
  const settingsMain = settingsDialog.locator("main");
  await expect(settingsMain).toBeInViewport({ ratio: 0.9 });
  const sliderSurface = objectiveSlider.locator("xpath=ancestor::*[@data-slot='slider'][1]");
  await sliderSurface.scrollIntoViewIfNeeded();
  await expect(sliderSurface).toBeInViewport();
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
  await settingsDialog.screenshot({ path: testInfo.outputPath("ads-settings.png") });
});


test("workspace date selection supports keyboard changes and clearing", async ({ page }, testInfo) => {
  await seedShell(page);
  await page.addInitScript(() => {
    const information = { customFields: [{ id: "due-date", label: "Due date", type: "date", value: "2026-09-06" }] };
    const workspaces = JSON.parse(localStorage.getItem("stave:workspace-fallback:v1")!);
    workspaces[0].snapshot.workspaceInformation = information;
    localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify(workspaces));
    const store = JSON.parse(localStorage.getItem("stave-store")!);
    store.state.workspaceInformation = information;
    localStorage.setItem("stave-store", JSON.stringify(store));
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Information", exact: true }).click();
  const label = page.getByPlaceholder("Label", { exact: true }).filter({ visible: true });
  if (!await label.count()) await page.getByRole("button", { name: /Custom Fields/ }).click();
  const dateButton = page.getByRole("button", { name: "Sep 6, 2026", exact: true });
  await dateButton.click();
  const selected = page.getByRole("button", { name: "September 6, 2026", exact: true });
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  await selected.focus();
  await selected.press("ArrowRight");
  const next = page.getByRole("button", { name: "September 7, 2026", exact: true });
  await expect(next).toBeFocused();
  await next.press("Enter");
  await expect(next).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("group", { name: "September 2026", exact: true }).screenshot({ path: testInfo.outputPath("ads-calendar.png") });
  await next.press("Enter");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Pick a date", exact: true })).toBeVisible();
});

test("notification actions use the visible toast control and dismiss on activation", async ({ page }) => {
  await seedShell(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Open Stave menu" })).toBeVisible();
  await page.evaluate(async () => {
    const modulePath = "/src/lib/notifications/toast.ts";
    const { toast } = await import(modulePath);
    toast.error("Check failed", {
      id: "review-notification", duration: 0,
      description: "Open the task to inspect the result.",
      action: { label: "Open task", onClick: () => { document.documentElement.dataset.toastAction = "opened"; } },
    });
  });
  // High-priority notices announce separately until focus enters the viewport.
  await expect(page.getByRole("alert").filter({ hasText: "Check failed" })).toBeVisible();
  await page.keyboard.press("F6");
  const action = page.getByRole("button", { name: "Open task", exact: true });
  await expect(action).toBeVisible();
  await action.focus();
  await action.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-toast-action", "opened");
  await expect(page.locator("[role=alertdialog]")).toBeHidden();
});
