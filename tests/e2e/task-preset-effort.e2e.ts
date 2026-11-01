import { expect, test, type Locator } from "@playwright/test";

test("catalog changes refresh open menus, settings, launch labels and memoized shortcuts", async ({ page }) => {
  async function setPresets() {
    await page.evaluate(async () => {
      const { useAppStore } = await import("/src/store/app.store.ts");
      useAppStore.setState((state) => ({ settings: { ...state.settings, taskPresets: [
        { id: "dynamic", label: "Dynamic", kind: "task", provider: "codex", model: "gpt-6-astra" },
        { id: "saved", label: "Saved", kind: "task", provider: "codex", model: "gpt-6-astra", effort: "high" },
        { id: "owned", label: "Owned", kind: "task", provider: "codex", model: "gpt-6.1-sol" },
      ] } }));
    });
  }
  async function updateCatalog(level: string, supported: string[]) {
    return page.evaluate(async ({ level, supported }) => {
      const catalog = await import("/src/lib/providers/model-catalog.ts");
      const { useAppStore } = await import("/src/store/app.store.ts");
      const { resolveTaskPresetRuntimeOverrides } = await import("/src/lib/task-presets.ts");
      catalog.registerDynamicDisplayNames(new Map([["gpt-6-astra", "Catalog Astra"]]));
      catalog.registerDynamicDefaultReasoningEfforts(new Map([["gpt-6-astra", level], ["gpt-6.1-sol", "low"]]));
      catalog.registerDynamicSupportedReasoningEfforts(new Map([["gpt-6-astra", supported]]));
      return useAppStore.getState().settings.taskPresets.map((preset) =>
        resolveTaskPresetRuntimeOverrides(preset).codexReasoningEffort);
    }, { level, supported });
  }
  await page.goto("/tests/e2e/fixtures/task-presets.html");
  await page.getByTestId("preset-launcher").waitFor();
  await setPresets();
  const launcher = page.getByTestId("preset-launcher").getByRole("button");
  const meta = page.getByRole("region").locator('[data-preset-id="dynamic"] p').last();
  await expect(launcher.first()).toHaveAccessibleName(/Dynamic.*Effort: Medium/);
  await launcher.last().click();
  const menu = page.getByRole("menu");
  await expect(menu.locator('[data-preset-id="dynamic"]')).toContainText("Effort: Medium");
  for (const [level, supported, expected, saved] of [
    ["high", ["low", "medium", "high"], "High", "High"],
    ["low", ["low", "medium"], "Low", "Low"],
    ["medium", ["low", "medium", "high"], "Medium", "High"],
  ] as const) {
    expect(await updateCatalog(level, [...supported])).toEqual([level, saved.toLowerCase(), "high"]);
    await expect(launcher.first()).toHaveAccessibleName(new RegExp(`Dynamic.*Catalog Astra.*Effort: ${expected}`));
    await expect(meta).toContainText(`Catalog Astra · Effort: ${expected}`);
    await expect(menu.locator('[data-preset-id="dynamic"]')).toContainText(`Catalog Astra · Effort: ${expected}`);
    await expect(menu.locator('[data-preset-id="saved"]')).toContainText(`Effort: ${saved}`);
    await expect(menu.locator('[data-preset-id="owned"]')).toContainText("Effort: High");
  }
  await page.keyboard.press("Escape");
  await launcher.first().hover();
  await expect(page.getByRole("tooltip").filter({ hasText: "Catalog Astra" })).toContainText("Catalog Astra · Effort: Medium");
  await page.goto("/tests/e2e/fixtures/task-presets.html?shortcuts=1");
  const drawer = page.getByTestId("keyboard-shortcuts-drawer");
  await expect(drawer).toBeVisible();
  await setPresets();
  const shortcut = drawer.locator("[data-keybinding-id]").filter({ hasText: "Dynamic" });
  await expect(shortcut).toContainText("Effort: Medium");
  await updateCatalog("high", ["low", "medium", "high"]);
  await expect(shortcut).toContainText("Catalog Astra · Effort: High");
});

// Check the actual text boxes, not just DOM text that ellipsis can hide.
async function expectUnclipped(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect.poll(() => locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const bounds = element.getBoundingClientRect();
    return Math.max(
      element.scrollWidth - element.clientWidth,
      element.scrollHeight - element.clientHeight,
      ...[...range.getClientRects()].map((rect) =>
        Math.max(bounds.left - rect.left, rect.right - bounds.right, rect.bottom - bounds.bottom)),
    );
  })).toBeLessThanOrEqual(1); // fractional font metrics can round by one CSS pixel
}

test("editing or cancelling effort keeps preset descriptions in sync", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/task-presets.html");
  const meta = page.getByRole("region").locator('[data-preset-id="claude"] p').last();
  await page.getByRole("button", { name: "Edit Planning", exact: true }).click();
  const form = page.locator("form");
  await expect(form.getByRole("combobox").nth(2)).toContainText("Claude Opus 5.5");
  const effort = form.getByRole("combobox").last();
  await expect(effort).toContainText("Max");
  await effort.click();
  await page.getByRole("option", { name: "Low", exact: true }).click();
  await form.getByRole("button", { name: /Save preset/i }).click();
  await expect(meta).toContainText("Claude Opus 5.5 · Effort: Low");
  await page.getByRole("button", { name: "Edit Planning", exact: true }).click();
  await effort.click();
  await page.getByRole("option", { name: "High", exact: true }).click();
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(meta).toContainText("Effort: Low");
  const launcher = page.getByTestId("preset-launcher").getByRole("button");
  await expect(launcher.first()).toHaveAccessibleName(/Claude Opus 5.5 · Effort: Low/);
  await launcher.last().click();
  await expect(page.getByRole("menu").locator('[data-preset-id="claude"]')).toContainText("Claude Opus 5.5 · Effort: Low");
});

for (const locale of ["en", "ko"] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const density of ["regular", "compact"] as const) {
      test(`preset model and effort stay visible: ${locale}/${theme}/${density}`, async ({ page }) => {
        await page.goto(`/tests/e2e/fixtures/task-presets.html?locale=${locale}&theme=${theme}&density=${density}`);
        const effort = locale === "ko" ? "추론 강도" : "Effort";
        // SettingsCard's root is a region; use the preset rows independently of its tag.
        const settingsRows = page.getByRole("region").locator("[data-preset-id]");
        await expect(settingsRows).toHaveCount(6);
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => [...document.fonts].filter((font) => font.status === "error").map((font) => font.family))).toEqual([]);
        for (const width of [560, 960]) {
          await page.setViewportSize({ width, height: 1000 });
          for (const [id, model, level] of [
            ["claude", "Claude Opus 5.5", locale === "ko" ? "최대" : "Max"],
            ["codex", "GPT-6.1 Sol", locale === "ko" ? "높음" : "High"],
            ["cursor", "Composer 2", locale === "ko" ? "높음" : "High"],
            ["kiro", "Auto", locale === "ko" ? "보통" : "Medium"],
            ["opencode", "Openai/gpt 6.1 SOL", locale === "ko" ? "기본값 (모델별)" : "Default (per model)"],
          ]) {
            const text = page.getByRole("region").locator(`[data-preset-id="${id}"] p`).last();
            await expect(text).toContainText(`${model} · ${effort}: ${level}`);
            await expectUnclipped(text);
          }
          await expect(settingsRows.last()).not.toContainText(effort);
          await page.getByTestId("preset-launcher").getByRole("button").last().click();
          const menu = page.getByRole("menu");
          const items = menu.locator("[data-preset-id]");
          await expect(items).toHaveCount(6);
          for (const id of ["claude", "codex", "cursor", "kiro", "opencode"]) {
            const item = menu.locator(`[data-preset-id="${id}"]`);
            await expect(item).toContainText(effort);
            await expectUnclipped(item.locator("div").last());
            const box = await item.boundingBox();
            expect(box!.x).toBeGreaterThanOrEqual(0);
            expect(box!.x + box!.width).toBeLessThanOrEqual(width);
          }
          await expect(items.last()).not.toContainText(effort);
          await page.keyboard.press("ArrowDown");
          await expect(menu.locator('[data-highlighted][data-preset-id="claude"]')).toHaveCount(1);
          await page.keyboard.press("Escape");
          await expect(menu).toBeHidden();
        }
        await page.getByTestId("preset-launcher").getByRole("button").first().hover();
        const max = locale === "ko" ? "최대" : "Max";
        const high = locale === "ko" ? "높음" : "High";
        await expect(page.getByRole("tooltip")).toContainText(`Claude Opus 5.5 · ${effort}: ${max}`);
        await page.goto(`/tests/e2e/fixtures/task-presets.html?locale=${locale}&theme=${theme}&density=${density}&shortcuts=1`);
        const drawer = page.getByTestId("keyboard-shortcuts-drawer");
        for (const text of [`Claude Opus 5.5 · ${effort}: ${max}`, `GPT-6.1 Sol · ${effort}: ${high}`]) {
          const label = drawer.locator("p").filter({ hasText: text });
          await expectUnclipped(label);
        }
      });
    }
  }
}
