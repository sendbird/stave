import { expect, test } from "@playwright/test";

function seedWorkspace(
  page: import("@playwright/test").Page,
  settings: Record<string, unknown> = {},
  /**
   * Delays one provider's catalog so it resolves while the selector is already
   * open. That is the only way to reproduce a late `args.options` identity
   * change from a test.
   */
  lateCatalog: { providerId?: string; delayMs?: number } = {},
) {
  return page.addInitScript((seed) => {
    const settingsOverride = seed.settings;
    const lateCatalogProviderId = seed.lateCatalog.providerId;
    const lateCatalogDelayMs = seed.lateCatalog.delayMs ?? 0;
    (window as unknown as { api?: Record<string, unknown> }).api = {
      provider: {
        streamTurn: async () => [],
        getCodexModelCatalog: async () => ({
          ok: true,
          models: [],
          detail: "",
        }),
        getModelCatalog: async ({ providerId }: { providerId: string }) => {
          if (providerId === lateCatalogProviderId && lateCatalogDelayMs > 0) {
            await new Promise((resolve) => {
              setTimeout(resolve, lateCatalogDelayMs);
            });
          }
          return {
          providerId,
          ok: true,
          detail: "fixture catalog",
          models:
            providerId === "cursor"
              ? [
                  {
                    model: "auto",
                    displayName: "Auto",
                    description: "",
                    hidden: false,
                    isDefault: true,
                    defaultEffort: null,
                    supportedEfforts: [],
                  },
                  {
                    model: "gpt-5.4[context=272k,reasoning=medium,fast=false]",
                    displayName: "GPT 5.4 · 272K · Medium",
                    description: "",
                    hidden: false,
                    isDefault: false,
                    defaultEffort: "medium",
                    supportedEfforts: [],
                  },
                  {
                    model: "gpt-5.4[context=272k,reasoning=high,fast=false]",
                    displayName: "GPT 5.4 · 272K · High",
                    description: "",
                    hidden: false,
                    isDefault: false,
                    defaultEffort: "high",
                    supportedEfforts: [],
                  },
                  {
                    model: "gpt-5.4[context=272k,reasoning=high,fast=true]",
                    displayName: "GPT 5.4 · 272K · High · Fast",
                    description: "",
                    hidden: false,
                    isDefault: false,
                    defaultEffort: "high",
                    supportedEfforts: [],
                  },
                  ...Array.from({ length: 13 }, (_, index) => ({
                    model: `cursor-archive-${index + 1}`,
                    displayName: `Cursor Archive ${index + 1}`,
                    description: "",
                    hidden: false,
                    isDefault: false,
                    defaultEffort: null,
                    supportedEfforts: [],
                  })),
                ]
              : providerId === "kiro"
                ? [
                    {
                      model: "auto",
                      displayName: "Auto",
                      description: "",
                      hidden: false,
                      isDefault: true,
                      defaultEffort: null,
                      supportedEfforts: [],
                    },
                    {
                      model: "kiro-fixture-model",
                      displayName: "Kiro Fixture Model",
                      description: "",
                      hidden: false,
                      isDefault: false,
                      defaultEffort: "medium",
                      supportedEfforts: [
                        "low",
                        "medium",
                        "high",
                        "xhigh",
                        "max",
                      ],
                    },
                    ...Array.from({ length: 13 }, (_, index) => ({
                      model: `kiro-archive-${index + 1}`,
                      displayName: `Kiro Archive ${index + 1}`,
                      description: "",
                      hidden: false,
                      isDefault: false,
                      defaultEffort: "medium",
                      supportedEfforts: ["medium"],
                    })),
                  ]
                : [],
          };
        },
      },
    };
    const workspaceSnapshot = {
      activeTaskId: "task-model-effort",
      openTaskTabIds: ["task-model-effort"],
      activeSurface: { kind: "task", taskId: "task-model-effort" },
      tasks: [
        {
          id: "task-model-effort",
          title: "Model effort selector",
          provider: "claude-code",
          updatedAt: "2026-07-23T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-model-effort": [] },
    };
    window.localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-main",
          name: "main",
          updatedAt: "2026-07-23T00:00:00.000Z",
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
              updatedAt: "2026-07-23T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-main",
          workspaceBranchById: { "ws-main": "main" },
          workspacePathById: { "ws-main": "/tmp/stave-project" },
          workspaceDefaultById: { "ws-main": true },
          settings: { autoRoutingEnabled: true, ...settingsOverride },
          ...workspaceSnapshot,
        },
        version: 0,
      }),
    );
  }, { settings, lateCatalog });
}

test("selects a model and effort in one click across provider tabs", async ({
  page,
}, testInfo) => {
  await seedWorkspace(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const modelTrigger = page.getByRole("button", { name: /^Model:/ });
  await expect(modelTrigger).toBeVisible();
  await modelTrigger.focus();
  await modelTrigger.press("Enter");

  const selector = page.getByRole("dialog", {
    name: "Model and effort selector",
  });
  await expect(selector).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Search models" }),
  ).toBeFocused();
  const selectorStyle = await selector.evaluate((surface) => ({
    backdropFilter: getComputedStyle(surface).backdropFilter,
    shadow: getComputedStyle(surface).boxShadow,
  }));
  expect(selectorStyle.backdropFilter).toBe("none");
  expect(selectorStyle.shadow).toContain("0px 18px 48px");
  expect(await selector.evaluate((surface) => surface.offsetWidth)).toBe(640);

  const providerTabs = page.getByRole("tablist", { name: "Model provider" });
  const autoButton = page.getByRole("button", { name: "Stave Auto" });
  await expect(autoButton).toBeVisible();
  const providerTabsBox = await providerTabs.boundingBox();
  const autoButtonBox = await autoButton.boundingBox();
  expect(providerTabsBox).not.toBeNull();
  expect(autoButtonBox).not.toBeNull();
  expect(autoButtonBox?.x).toBeGreaterThanOrEqual(
    (providerTabsBox?.x ?? 0) + (providerTabsBox?.width ?? 0),
  );
  const providerTabBoxes = await providerTabs
    .getByRole("tab")
    .evaluateAll((tabs) =>
      tabs.map((tab) => {
        const box = tab.getBoundingClientRect();
        return {
          x: box.x,
          y: box.y,
          height: tab instanceof HTMLElement ? tab.offsetHeight : 0,
        };
      }),
    );
  expect(providerTabBoxes).toHaveLength(4);
  expect(new Set(providerTabBoxes.map((box) => Math.round(box.x))).size).toBe(
    1,
  );
  expect(providerTabBoxes.every((box) => box.height >= 44)).toBe(true);
  expect(providerTabBoxes[1]?.y).toBeGreaterThan(providerTabBoxes[0]?.y ?? 0);
  expect(
    Math.abs(
      (await selector.evaluate((element) => element.offsetHeight)) -
        (await providerTabs.evaluate((element) => element.offsetHeight)),
    ),
  ).toBeLessThanOrEqual(2);
  const claudeTab = providerTabs.getByRole("tab", { name: /Claude/ });
  const codexTab = providerTabs.getByRole("tab", { name: /Codex/ });
  await claudeTab.focus();
  await claudeTab.press("ArrowDown");
  await expect(codexTab).toBeFocused();
  await codexTab.press("Enter");
  await expect(codexTab).toHaveAttribute("aria-selected", "true");
  await codexTab.press("ArrowUp");
  await expect(claudeTab).toBeFocused();
  await claudeTab.press("Enter");
  await expect(claudeTab).toHaveAttribute("aria-selected", "true");
  await expect(
    providerTabs.getByRole("tab", { name: /Cursor/ }).locator("img"),
  ).toHaveAttribute("src", /cursor-color\.svg$/);
  await expect(
    providerTabs.getByRole("tab", { name: /Kiro/ }).locator("img"),
  ).toHaveAttribute("src", /kiro-color\.svg$/);
  const cursorTab = providerTabs.getByRole("tab", { name: /Cursor/ });
  const searchInput = page.getByRole("textbox", { name: "Search models" });
  await searchInput.fill("opus");
  const selectorHeights = [
    await selector.evaluate((element) => element.offsetHeight),
  ];
  await cursorTab.hover();
  await expect(cursorTab).toHaveAttribute("aria-selected", "true");
  await expect(searchInput).toHaveValue("");
  await expect(page.locator("[data-cursor-model-row]").first()).toBeVisible();
  selectorHeights.push(
    await selector.evaluate((element) => element.offsetHeight),
  );
  await claudeTab.hover();
  await expect(claudeTab).toHaveAttribute("aria-selected", "true");
  selectorHeights.push(
    await selector.evaluate((element) => element.offsetHeight),
  );
  await cursorTab.hover();
  await expect(cursorTab).toHaveAttribute("aria-selected", "true");
  selectorHeights.push(
    await selector.evaluate((element) => element.offsetHeight),
  );
  await claudeTab.hover();
  await expect(claudeTab).toHaveAttribute("aria-selected", "true");
  selectorHeights.push(
    await selector.evaluate((element) => element.offsetHeight),
  );
  expect(new Set(selectorHeights).size).toBe(1);

  const effortGrid = page.getByRole("grid", {
    name: "Model and reasoning effort",
  });
  expect(
    await effortGrid
      .getByRole("rowheader")
      .first()
      .evaluate((rowHeader) => rowHeader.offsetWidth),
  ).toBe(264);
  const opusMax = effortGrid.getByRole("gridcell", {
    name: "Claude Opus 5, Max effort",
  });
  const cellGeometry = await opusMax.evaluate((cell) => {
    const swatch = cell.firstElementChild;
    return {
      button: { width: cell.offsetWidth, height: cell.offsetHeight },
      swatch: {
        width: swatch instanceof HTMLElement ? swatch.offsetWidth : 0,
        height: swatch instanceof HTMLElement ? swatch.offsetHeight : 0,
      },
    };
  });
  expect(cellGeometry).toEqual({
    button: { width: 44, height: 44 },
    swatch: { width: 32, height: 32 },
  });
  await opusMax.click();
  await expect(selector).toBeHidden();
  await expect(modelTrigger).toHaveAccessibleName(/Claude Opus 5.*Effort: Max/);
  const contextButton = page.getByRole("button", { name: /^1M context:/ });
  await expect(contextButton).toHaveAttribute("aria-pressed", "false");
  await contextButton.click();
  await expect(contextButton).toHaveAttribute("aria-pressed", "true");
  await expect(modelTrigger).toHaveAccessibleName(/Claude Opus 5.*Effort: Max/);
  await contextButton.click();
  await expect(contextButton).toHaveAttribute("aria-pressed", "false");

  await modelTrigger.click();
  await codexTab.click();
  await effortGrid
    .getByRole("gridcell", { name: "GPT-5.6 Sol, Ultra effort" })
    .click();
  await expect(modelTrigger).toHaveAccessibleName(
    /GPT-5\.6 Sol.*Effort: Ultra/,
  );
  const fastButton = page.getByRole("button", { name: /^Fast mode:/ });
  await expect(fastButton).toHaveAttribute("aria-pressed", "false");
  await fastButton.click();
  await expect(fastButton).toHaveAttribute("aria-pressed", "true");

  await modelTrigger.click();
  await providerTabs.getByRole("tab", { name: /Cursor/ }).click();
  await page.getByRole("textbox", { name: "Search models" }).fill("gpt 5.4");
  const cursorRow = page.locator('[data-cursor-model-row="gpt-5.4"]');
  const cursorToolbar = cursorRow.getByRole("toolbar", {
    name: "GPT 5.4 configuration",
  });
  await expect(cursorToolbar.locator('button[tabindex="0"]')).toHaveCount(1);
  await expect(cursorRow).toContainText("272K");
  await expect(cursorRow).toContainText("Fast");
  await selector.screenshot({
    path: testInfo.outputPath("cursor-model-configurations.png"),
  });
  const cursorHigh = cursorRow.getByRole("button", {
    name: "GPT 5.4, High effort",
  });
  await cursorHigh.click();
  await expect(modelTrigger).toHaveAccessibleName(/Model: GPT 5.4/);

  await modelTrigger.click();
  await providerTabs.getByRole("tab", { name: /Cursor/ }).click();
  await page.getByRole("textbox", { name: "Search models" }).fill("gpt 5.4");
  const cursorFast = page
    .locator('[data-cursor-model-row="gpt-5.4"]')
    .getByRole("button", { name: "GPT 5.4, Fast off" });
  await expect(cursorFast).toBeEnabled();
  const cursorModelButton = page
    .locator('[data-cursor-model-row="gpt-5.4"]')
    .getByRole("button", { name: "GPT 5.4, selected" });
  await cursorModelButton.focus();
  await cursorModelButton.press("ArrowRight");
  await expect(cursorFast).toBeFocused();
  await cursorFast.click();
  await expect(modelTrigger).toHaveAccessibleName(/Model: GPT 5.4/);
  await expect(modelTrigger).not.toHaveAccessibleName(/High.*Fast/);
  await expect(page.getByRole("button", { name: /^Fast mode:/ })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: /^1M context:/ })).toHaveCount(
    0,
  );

  await modelTrigger.click();
  await providerTabs.getByRole("tab", { name: /Cursor/ }).click();
  const showAllModels = page.getByRole("button", {
    name: /Show all models/,
  });
  await expect(showAllModels).toBeVisible();
  await showAllModels.click();
  await expect(page.locator("[data-cursor-model-row]")).toHaveCount(15);
  expect(
    await selector.evaluate(
      (element) => element.getBoundingClientRect().height,
    ),
  ).toBeLessThanOrEqual(400);
  await providerTabs.getByRole("tab", { name: /Kiro/ }).click();
  await page.getByRole("button", { name: /Show all models/ }).click();
  await expect
    .poll(() =>
      effortGrid.evaluate((element) => Number(element.getAttribute("aria-rowcount"))),
    )
    .toBeGreaterThan(6);
  const kiroListScroller = effortGrid.locator("..").locator("..");
  const kiroScrollState = await kiroListScroller.evaluate((element) => ({
    clientHeight: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
  expect(kiroScrollState.overflowY).toBe("auto");
  expect(kiroScrollState.scrollHeight).toBeGreaterThan(
    kiroScrollState.clientHeight,
  );
  await kiroListScroller.hover();
  await page.mouse.wheel(0, 800);
  await expect
    .poll(() => kiroListScroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(kiroScrollState.scrollTop);
  const kiroHigh = effortGrid.getByRole("gridcell", {
    name: "Kiro Fixture Model, High effort",
  });
  await kiroHigh.focus();
  await kiroHigh.press("ArrowRight");
  await expect(
    effortGrid.getByRole("gridcell", {
      name: "Kiro Fixture Model, X-High effort",
    }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(
    effortGrid.getByRole("gridcell", {
      name: "Kiro Fixture Model, Low effort",
    }),
  ).toBeFocused();
  await kiroHigh.click();
  await expect(modelTrigger).toHaveAccessibleName(
    /Kiro Fixture Model.*Effort: High/,
  );

  const modelControl = page.locator('[data-model-effort-control="true"]');
  const controlGeometry = await modelControl.evaluate((group) => {
    const buttons = Array.from(
      group.querySelectorAll<HTMLButtonElement>(":scope > button"),
    );
    return {
      groupHeight: group.getBoundingClientRect().height,
      buttonHeights: buttons.map(
        (button) => button.getBoundingClientRect().height,
      ),
    };
  });
  expect(controlGeometry.groupHeight).toBe(36);
  // Each capability button is its own 36px control now, not a segment clipped
  // inside a shared group box.
  expect(controlGeometry.buttonHeights.every((height) => height === 36)).toBe(
    true,
  );
  await modelControl.screenshot({
    path: testInfo.outputPath("model-capability-control.png"),
  });

  await modelTrigger.click();
  await expect(selector).toBeVisible();
  await expect
    .poll(() =>
      selector.evaluate((element) => getComputedStyle(element).opacity),
    )
    .toBe("1");
  await page.screenshot({
    path: testInfo.outputPath("model-effort-matrix.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /Stave Auto/ }).click();
  await expect(selector).toBeHidden();
  await expect(modelTrigger).toBeFocused();
  await expect(modelTrigger).toHaveAccessibleName(
    /Stave chooses the provider, model, and effort/,
  );
  await expect(page.getByRole("button", { name: /^Fast mode:/ })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: /^1M context:/ })).toHaveCount(
    0,
  );
});

test("keeps the searchable model list within a narrow viewport", async ({
  page,
}, testInfo) => {
  await seedWorkspace(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("button", { name: /^Model:/ }).click();
  const selector = page.getByRole("dialog", {
    name: "Model and effort selector",
  });
  await expect(selector).toBeVisible();
  await expect
    .poll(() =>
      selector.evaluate((element) => getComputedStyle(element).opacity),
    )
    .toBe("1");
  await expect(
    page.getByRole("textbox", { name: "Search models" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Stave Auto" })).toBeVisible();
  await expect(
    page
      .getByRole("tablist", { name: "Model provider" })
      .getByRole("tab", { name: /Kiro/ }),
  ).toBeVisible();
  expect(
    await selector.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  const selectorBox = await selector.boundingBox();
  expect(selectorBox).not.toBeNull();
  expect((selectorBox?.x ?? 0) + (selectorBox?.width ?? 0)).toBeLessThanOrEqual(
    390,
  );
  expect(selectorBox?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect(
    (selectorBox?.y ?? 0) + (selectorBox?.height ?? 0),
  ).toBeLessThanOrEqual(844);
  const gridScroller = page
    .getByRole("grid", { name: "Model and reasoning effort" })
    .locator("..");
  expect(
    await gridScroller.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("model-effort-matrix-narrow.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  const splitControl = page.locator('[data-model-effort-control="true"]');
  expect(
    await splitControl.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await splitControl.screenshot({
    path: testInfo.outputPath("model-capability-control-narrow.png"),
  });
});

test("preserves the selector surface and contrast in light mode", async ({
  page,
}, testInfo) => {
  await seedWorkspace(page, { themeMode: "light" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: /^Model:/ }).click();
  const selector = page.getByRole("dialog", {
    name: "Model and effort selector",
  });
  await expect(selector).toBeVisible();
  await expect
    .poll(() =>
      selector.evaluate((element) => getComputedStyle(element).opacity),
    )
    .toBe("1");
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  await expect(
    page.getByRole("textbox", { name: "Search models" }),
  ).toBeFocused();
  expect(
    await selector.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);

  const colors = await selector.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      foreground: style.color,
    };
  });
  expect(colors.background).not.toBe(colors.foreground);
  await page.screenshot({
    path: testInfo.outputPath("model-effort-selector-light.png"),
    fullPage: true,
  });
});

test("keeps the Kiro provider settings usable at a narrow viewport", async ({
  page,
}) => {
  await seedWorkspace(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: "open-settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Providers" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await settings
    .getByRole("tablist")
    .last()
    .getByRole("tab", { name: "Kiro", exact: true })
    .click();

  await expect(
    settings.getByRole("heading", { name: "Kiro Runtime Controls" }),
  ).toBeVisible();
  await expect(settings.getByPlaceholder("kiro-cli")).toBeVisible();
  await expect(
    settings.getByRole("combobox", { name: "Settings section" }),
  ).toBeVisible();
  expect(
    await settings.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  const runtimeCardWidth = await settings
    .getByRole("heading", { name: "Kiro Runtime Controls" })
    .evaluate(
      (heading) =>
        heading.closest("section")?.getBoundingClientRect().width ?? 0,
    );
  expect(runtimeCardWidth).toBeGreaterThan(320);
});

test("configures Cursor and Kiro Worker models from runtime catalogs", async ({
  page,
}, testInfo) => {
  await seedWorkspace(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: "open-settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Providers" }).click();
  const workerCard = settings.locator("#settings-field-worker");
  await expect(workerCard).toBeVisible();

  const cursorTab = workerCard.getByRole("tab", { name: "Cursor" });
  const kiroTab = workerCard.getByRole("tab", { name: "Kiro" });
  await expect(cursorTab).toBeVisible();
  await expect(kiroTab).toBeVisible();
  await cursorTab.click();

  let modelTrigger = workerCard.getByRole("combobox", {
    name: "Worker model",
  });
  await modelTrigger.click();
  await page
    .getByRole("option", {
      name: /GPT 5\.4\[context=272k,reasoning=high,fast=true\]/,
    })
    .click();
  await expect(modelTrigger).toContainText(
    "GPT 5.4[context=272k,reasoning=high,fast=true]",
  );
  await expect(workerCard).toContainText("has no selectable reasoning effort");

  await cursorTab.focus();
  await cursorTab.press("ArrowRight");
  await expect(kiroTab).toBeFocused();
  await kiroTab.press("Enter");
  await expect(kiroTab).toHaveAttribute("aria-selected", "true");
  modelTrigger = workerCard.getByRole("combobox", { name: "Worker model" });
  await modelTrigger.click();
  await page.getByRole("option", { name: /Kiro Fixture Model/ }).click();
  await expect(modelTrigger).toContainText("Kiro Fixture Model");

  await page.setViewportSize({ width: 390, height: 844 });
  await workerCard.scrollIntoViewIfNeeded();
  expect(
    await settings.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await workerCard.screenshot({
    path: testInfo.outputPath("worker-provider-settings.png"),
  });
});

test("hides and pins models from Settings without losing them from the catalog", async ({
  page,
}) => {
  await seedWorkspace(page, {
    modelVisibility: {
      cursor: { "gpt-5.4": false, "cursor-archive-5": true },
    },
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: /^Model:/ }).click();
  const selector = page.getByRole("dialog", {
    name: "Model and effort selector",
  });
  await expect(selector).toBeVisible();
  const loadedCursorTab = selector
    .getByRole("tablist", { name: "Model provider" })
    .getByRole("tab", { name: "Cursor, 15 models" });
  await expect(loadedCursorTab).toBeVisible({ timeout: 20_000 });
  await loadedCursorTab.click();

  // Hovering a provider tab switches providers and clears the query, so park the
  // pointer off the rail before touching the search field.
  const searchModels = page.getByRole("textbox", { name: "Search models" });
  await searchModels.hover();

  await expect(
    page.locator('[data-cursor-model-row="cursor-archive-5"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-cursor-model-row="gpt-5.4"]'),
  ).toHaveCount(0);
  await expect(page.locator("[data-cursor-model-row]")).toHaveCount(3);

  // Turning a model off narrows the default list, never the catalog: search and
  // the expansion still reach it.
  await searchModels.fill("gpt 5.4");
  await expect(
    page.locator('[data-cursor-model-row="gpt-5.4"]'),
  ).toBeVisible();
  await searchModels.fill("");
  // The footer only mounts once the query is actually empty again, so wait on
  // the input's own value rather than on a row count that a stale render can
  // also satisfy.
  await expect(searchModels).toHaveValue("");
  await expect(page.locator("[data-cursor-model-row]")).toHaveCount(3);
  const showAllModels = selector.getByRole("button", {
    name: /Show all models/,
  });
  await expect(showAllModels).toBeVisible();
  await showAllModels.click();
  await expect(page.locator("[data-cursor-model-row]")).toHaveCount(15);
  await page.keyboard.press("Escape");
  await expect(selector).toBeHidden();

  await page.getByRole("button", { name: "open-settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Models" }).click();
  const visibilityCard = settings.locator("#settings-field-model-visibility");
  await expect(visibilityCard).toBeVisible();
  await visibilityCard.getByRole("tab", { name: "Cursor" }).click();

  const pinnedSwitch = visibilityCard
    .locator('[data-model-visibility-row="cursor-archive-5"]')
    .getByRole("switch");
  await expect(pinnedSwitch).toHaveAttribute("aria-checked", "true");
  const hiddenSwitch = visibilityCard
    .locator('[data-model-visibility-row="gpt-5.4"]')
    .getByRole("switch");
  await expect(hiddenSwitch).toHaveAttribute("aria-checked", "false");

  await hiddenSwitch.click();
  await expect(hiddenSwitch).toHaveAttribute("aria-checked", "true");
  await visibilityCard
    .getByRole("button", { name: "Reset to current models" })
    .click();
  await expect(pinnedSwitch).toHaveAttribute("aria-checked", "false");
  await expect(hiddenSwitch).toHaveAttribute("aria-checked", "true");
});

test("offers approval presets for Cursor and Kiro from the composer and Settings", async ({
  page,
}) => {
  await seedWorkspace(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  // Switch the task onto Cursor so the composer resolves the Cursor presets.
  await page.getByRole("button", { name: /^Model:/ }).click();
  const selector = page.getByRole("dialog", {
    name: "Model and effort selector",
  });
  await expect(selector).toBeVisible();
  const approvalCursorTab = selector
    .getByRole("tablist", { name: "Model provider" })
    .getByRole("tab", { name: "Cursor, 15 models" });
  await expect(approvalCursorTab).toBeVisible({ timeout: 20_000 });
  await approvalCursorTab.click();
  const cursorRow = page.locator('[data-cursor-model-row="gpt-5.4"]');
  await expect(cursorRow).toBeVisible();
  await cursorRow.getByRole("button", { name: /^GPT 5\.4/ }).first().click();
  await expect(selector).toBeHidden();

  // Cursor gets all three tiers; the pill starts on the conservative default.
  const cursorPill = page.getByRole("button", {
    name: /^Cursor (Manual|Guided|Auto|Custom):/,
  });
  await expect(cursorPill).toBeVisible();
  await expect(cursorPill).toHaveAccessibleName(/^Cursor Manual:/);
  await cursorPill.click();
  const modePopover = page.getByRole("dialog", { name: "Cursor mode presets" });
  await expect(modePopover).toBeVisible();
  for (const tier of ["Manual", "Guided", "Auto"]) {
    await expect(
      modePopover.getByRole("button", { name: new RegExp(`^${tier}`) }),
    ).toBeVisible();
  }
  await modePopover.getByRole("button", { name: /^Auto/ }).click();
  await expect(cursorPill).toHaveAccessibleName(/^Cursor Auto:/);

  await page.getByRole("button", { name: "open-settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Providers" }).click();
  const providerTabs = settings.getByRole("tablist").last();
  await providerTabs.getByRole("tab", { name: "Kiro", exact: true }).click();

  // Kiro deliberately exposes two tiers, because its partial-trust flag cannot
  // be verified. A Guided control here would promise something unenforceable.
  const kiroApproval = settings.getByRole("radiogroup", {
    name: /Approval Preset/,
  });
  await expect(
    kiroApproval.getByRole("radio", { name: /^Manual/ }),
  ).toBeVisible();
  await expect(
    kiroApproval.getByRole("radio", { name: /^Auto/ }),
  ).toBeVisible();
  await expect(
    kiroApproval.getByRole("radio", { name: /^Guided/ }),
  ).toHaveCount(0);

  await providerTabs.getByRole("tab", { name: "Cursor", exact: true }).click();
  const cursorApproval = settings.getByRole("radiogroup", {
    name: /Approval Preset/,
  });
  // The composer pill writes a per-model override, so the Settings card still
  // shows the workspace default. Same layering as Claude and Codex.
  await expect(
    cursorApproval.getByRole("radio", { name: /^Manual/ }),
  ).toHaveAttribute("aria-checked", "true");
  await cursorApproval.getByRole("radio", { name: /^Guided/ }).click();
  await expect(
    cursorApproval.getByRole("radio", { name: /^Guided/ }),
  ).toHaveAttribute("aria-checked", "true");
});

test("keeps the open selector's provider tab and search when a catalog resolves late", async ({
  page,
}) => {
  // Invariant: a catalog that resolves after the popover opened must not be
  // treated as a fresh open. Only the open transition may reset the provider tab
  // and the query, because anything else erases a search the user is mid-way
  // through typing.
  await seedWorkspace(page, {}, { providerId: "kiro", delayMs: 2500 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: /^Model:/ }).click();
  const selector = page.getByRole("dialog", {
    name: "Model and effort selector",
  });
  await expect(selector).toBeVisible();
  const cursorTab = selector
    .getByRole("tablist", { name: "Model provider" })
    .getByRole("tab", { name: "Cursor, 15 models" });
  await expect(cursorTab).toBeVisible({ timeout: 20_000 });
  await cursorTab.click();

  const searchModels = page.getByRole("textbox", { name: "Search models" });
  await searchModels.hover();
  await searchModels.fill("archive 7");
  await expect(
    page.locator('[data-cursor-model-row="cursor-archive-7"]'),
  ).toBeVisible();

  // Outlast the delayed catalog so its state update definitely lands.
  await expect(
    selector
      .getByRole("tablist", { name: "Model provider" })
      .getByRole("tab", { name: /^Kiro, \d+ models$/ }),
  ).toBeVisible({ timeout: 20_000 });

  await expect(cursorTab).toHaveAttribute("aria-selected", "true");
  await expect(searchModels).toHaveValue("archive 7");
  await expect(
    page.locator('[data-cursor-model-row="cursor-archive-7"]'),
  ).toBeVisible();
});
