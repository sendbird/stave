import { expect, test, type Page } from "@playwright/test";

async function seedWorkspace(page: Page) {
  await page.addInitScript(() => {
    const workspaceSnapshot = {
      activeTaskId: "task-popup-layout",
      openTaskTabIds: ["task-popup-layout", "task-popup-secondary"],
      activeSurface: { kind: "task", taskId: "task-popup-layout" },
      tasks: [
        {
          id: "task-popup-layout",
          title: "Popup layout",
          provider: "claude-code",
          updatedAt: "2026-07-25T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
        {
          id: "task-popup-secondary",
          title: "Secondary task",
          provider: "codex",
          updatedAt: "2026-07-25T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: {
        "task-popup-layout": [],
        "task-popup-secondary": [],
      },
    };

    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-07-25T00:00:00.000Z",
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
              updatedAt: "2026-07-25T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
          settings: { autoRoutingEnabled: true },
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
      scripts: {
        getConfig: async () => ({
          ok: true,
          config: null,
        }),
        getStatus: async () => ({
          ok: true,
          statuses: [],
        }),
        onEvent: () => () => {},
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

test("StyleX composer lanes preserve size, reveal and draft across themes", async ({ page }, testInfo) => {
  await seedWorkspace(page);
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.goto("/");
  const prompt = page.getByRole("textbox", { name: "Prompt" });
  await expect(prompt).toBeVisible();
  await prompt.fill("Keep this draft while inspecting controls");
  const wing = page.locator('[data-composer-frame-wing="right"]');
  await expect(wing).toBeVisible();
  const button = wing.locator('[data-composer-control="true"]').first();
  const label = button.locator('[data-composer-control-label]');
  for (const dark of [false, true]) {
    await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
    await page.mouse.move(0, 0);
    await prompt.focus();
    await expect.poll(() => label.evaluate((node) => getComputedStyle(node).opacity)).toBe("0");
    const before = await prompt.boundingBox();
    await button.hover();
    await expect.poll(() => label.evaluate((node) => getComputedStyle(node).opacity)).toBe("1");
    await expect.poll(() => button.evaluate((node) => getComputedStyle(node).height)).toBe("32px");
    const after = await prompt.boundingBox();
    expect(after!.x).toBeCloseTo(before!.x, 1);
    expect(after!.width).toBeCloseTo(before!.width, 1);
    expect(after!.height).toBeCloseTo(before!.height, 1);
    await button.focus();
    await page.mouse.move(0, 0);
    await expect.poll(() => label.evaluate((node) => getComputedStyle(node).opacity)).toBe("1");
    await page.locator('[data-composer-frame="true"]').screenshot({ path: testInfo.outputPath(`stylex-composer-${dark ? "dark" : "light"}.png`) });
    await expect(prompt).toHaveText("Keep this draft while inspecting controls");
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => label.evaluate((node) => getComputedStyle(node).translate)).toBe("0px");
});

test("icon-triggered menus keep a usable width and full-width rows", async ({
  page,
}) => {
  await seedWorkspace(page);
  await page.setViewportSize({ width: 720, height: 640 });
  await page.goto("/");

  const workspaceToolsIcon = page
    .getByRole("button", { name: "Workspace Tools" })
    .locator("svg");
  const terminalIcon = page
    .getByRole("button", { name: "Terminal", exact: true })
    .locator("svg");
  await expect(workspaceToolsIcon).toHaveClass(/lucide-blocks/);
  await expect(terminalIcon).toHaveClass(/lucide-square-terminal/);

  const trigger = page.getByRole("button", {
    name: "open-workspace-path-actions",
  });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const popup = page.locator('[data-slot="dropdown-menu-content"]');
  const openInFinderItem = page.getByRole("menuitem", {
    name: "Open in Finder",
  });
  await expect(popup).toBeVisible();
  await expect(openInFinderItem).toBeVisible();

  const popupBox = await popup.boundingBox();
  const itemBox = await openInFinderItem.boundingBox();
  expect(popupBox).not.toBeNull();
  expect(itemBox).not.toBeNull();
  expect(popupBox!.width).toBeGreaterThanOrEqual(128);
  expect(popupBox!.width).toBeLessThanOrEqual(712);
  const horizontalInset = await popup.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth]
      .reduce((sum, value) => sum + parseFloat(value), 0);
  });
  expect(itemBox!.width).toBeGreaterThanOrEqual(popupBox!.width - horizontalInset - 1);

  await openInFinderItem.hover();
  await expect(openInFinderItem).toHaveAttribute("data-highlighted", "");
  await expect
    .poll(() =>
      openInFinderItem.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    )
    .not.toBe("rgba(0, 0, 0, 0)");
  await expect(openInFinderItem).toHaveCSS("text-align", "start");
});

test("local change review keeps actions visible while its body scrolls", async ({
  page,
}) => {
  await seedWorkspace(page);
  await page.setViewportSize({ width: 720, height: 640 });
  await page.goto("/");

  await page.getByRole("button", { name: "Review local changes" }).click();

  const dialog = page.getByRole("dialog", { name: "Review local changes" });
  const scrollArea = dialog.locator(':scope > div[data-review-scroll="true"]');
  const footer = dialog.locator('[data-slot="dialog-footer"]');
  const submit = dialog.getByRole("button", { name: "Review changes" });

  await expect(dialog).toBeVisible();
  await expect(scrollArea).toBeVisible();
  await expect(submit).toBeVisible();

  const scrollBounds = await scrollArea.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(scrollBounds.scrollHeight).toBeGreaterThan(scrollBounds.clientHeight);

  const viewportHeight = page.viewportSize()!.height;
  const dialogBox = await dialog.boundingBox();
  const footerBox = await footer.boundingBox();
  const submitBox = await submit.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(submitBox).not.toBeNull();
  expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(viewportHeight);
  expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(viewportHeight);
  expect(submitBox!.y + submitBox!.height).toBeLessThanOrEqual(viewportHeight);

  await scrollArea.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() => scrollArea.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
});

test("workspace tools no-result views share one empty-state pattern", async ({
  page,
}) => {
  await seedWorkspace(page);
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto("/");

  await page
    .getByRole("button", { name: "Workspace Tools", exact: true })
    .click();

  const panel = page.getByRole("region", { name: "Workspace tools", exact: true });
  // Workspace hydration may restore the initial pane after the first click.
  await expect(async () => {
    if (!await panel.isVisible()) await page.getByRole("button", { name: "Workspace Tools", exact: true }).click();
    await expect(panel).toBeVisible();
  }).toPass();

  const assertEmptyState = async (title: string, description: string) => {
    const emptyState = panel
      .locator('[data-slot="empty"]')
      .filter({ hasText: title });

    await expect(emptyState).toBeVisible();
    await expect(emptyState.locator('[data-slot="empty-icon"]')).toBeVisible();
    await expect(emptyState.locator('[data-slot="empty-title"]')).toHaveText(
      title,
    );
    await expect(
      emptyState.locator('[data-slot="empty-description"]'),
    ).toHaveText(description);

    return emptyState.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        alignItems: style.alignItems,
        gap: style.gap,
        justifyContent: style.justifyContent,
        padding: style.padding,
        textAlign: style.textAlign,
      };
    });
  };

  const processStyle = await assertEmptyState(
    "No processes configured",
    "Add a long-running process such as a dev server in Workspace Tools settings. Start it here and leave it running while you work.",
  );

  await panel.getByRole("tab", { name: "Commands", exact: true }).click();
  const commandStyle = await assertEmptyState(
    "No commands configured",
    "Add a one-shot command in Workspace Tools settings. Run it from this tab when you need it.",
  );

  await panel.getByRole("tab", { name: "Runs", exact: true }).click();
  const runsStyle = await assertEmptyState(
    "No recent activity",
    "Completed commands and processes, including their output, appear here.",
  );

  expect(commandStyle).toEqual(processStyle);
  expect(runsStyle).toEqual(processStyle);
});

test("composer focus and tab hover polish do not shift layout", async ({
  page,
}) => {
  await seedWorkspace(page);
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto("/");

  const prompt = page.getByRole("textbox", { name: "Prompt" });
  const promptPlaceholder = page.locator(
    '[data-prompt-lexical-placeholder="true"]',
  );
  const promptShell = page.locator(".prompt-input-shell");
  await expect(prompt).toBeVisible();
  await expect(promptPlaceholder).toBeVisible();
  await expect(promptShell).toBeVisible();
  const promptTypography = await prompt.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
    };
  });
  const placeholderTypography = await promptPlaceholder.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
    };
  });
  expect(promptTypography.fontSize).toBe("18px");
  expect(promptTypography.lineHeight).toBe("32px");
  expect(placeholderTypography.fontSize).toBe("15px");
  expect(placeholderTypography.lineHeight).toBe("24px");

  // The composer is focused on first render. Establish a real resting state
  // before comparing its geometry and surface treatment.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await expect(prompt).not.toBeFocused();
  await page.waitForTimeout(220);

  const shellBeforeFocus = await promptShell.boundingBox();
  const shadowBeforeFocus = await promptShell.evaluate(
    (element) => getComputedStyle(element).boxShadow,
  );
  expect(shellBeforeFocus).not.toBeNull();

  await prompt.click();
  await page.waitForTimeout(220);

  const shellAfterFocus = await promptShell.boundingBox();
  const focusedSurface = await promptShell.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      boxShadow: style.boxShadow,
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty,
      transform: style.transform,
    };
  });
  expect(shellAfterFocus).not.toBeNull();
  expect(shellAfterFocus!.x).toBeCloseTo(shellBeforeFocus!.x, 2);
  expect(shellAfterFocus!.y).toBeCloseTo(shellBeforeFocus!.y, 2);
  expect(shellAfterFocus!.width).toBeCloseTo(shellBeforeFocus!.width, 2);
  expect(shellAfterFocus!.height).toBeCloseTo(shellBeforeFocus!.height, 2);
  expect(focusedSurface.transform).toBe("none");
  expect(focusedSurface.boxShadow).not.toBe(shadowBeforeFocus);
  expect(focusedSurface.transitionProperty).toContain("box-shadow");
  expect(focusedSurface.transitionDuration).not.toBe("0s");

  const activeTab = page.locator(".dockview-theme-stave .dv-tab.dv-active-tab");
  const tabRail = activeTab.locator(
    "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' dv-tabs-and-actions-container ')][1]",
  );
  const activeTabBox = await activeTab.first().boundingBox();
  const tabRailBox = await tabRail.first().boundingBox();
  expect(activeTabBox).not.toBeNull();
  expect(tabRailBox).not.toBeNull();
  expect(activeTabBox!.y + activeTabBox!.height).toBeCloseTo(
    tabRailBox!.y + tabRailBox!.height,
    2,
  );
  await expect
    .poll(() =>
      tabRail
        .first()
        .evaluate((element) => getComputedStyle(element).boxShadow),
    )
    .toBe("none");
  const activeTabIndicator = await activeTab.first().evaluate((element) => ({
    boxShadow: getComputedStyle(element).boxShadow,
    primary: getComputedStyle(document.documentElement)
      .getPropertyValue("--primary")
      .trim(),
  }));
  expect(activeTabIndicator.boxShadow).toContain("inset");
  expect(activeTabIndicator.boxShadow).toContain("-2px");
  expect(activeTabIndicator.boxShadow).toContain(activeTabIndicator.primary);
  await activeTab.first().click();
  const activeTabFocusEdge = await activeTab.first().evaluate((element) => {
    const pseudoStyle = getComputedStyle(element, "::after");
    return {
      outlineStyle: pseudoStyle.outlineStyle,
      outlineWidth: pseudoStyle.outlineWidth,
    };
  });
  expect(activeTabFocusEdge.outlineStyle).toBe("none");
  expect(activeTabFocusEdge.outlineWidth).toBe("0px");

  const inactiveTab = page.locator(
    ".dockview-theme-stave .dv-tab.dv-inactive-tab",
  );
  await expect(inactiveTab.first()).toBeVisible();
  await inactiveTab.first().hover();
  const inactiveTabStyle = await inactiveTab.first().evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      boxShadow: style.boxShadow,
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
    };
  });
  expect(inactiveTabStyle.boxShadow).toBe("none");
  expect(inactiveTabStyle.boxShadow).not.toContain("0px 0px 0px 1px");
  expect(inactiveTabStyle.borderTopWidth).toBe(
    inactiveTabStyle.borderBottomWidth,
  );
  expect(inactiveTabStyle.borderLeftWidth).toBe(
    inactiveTabStyle.borderRightWidth,
  );
});
