import { expect, test, type Page } from "@playwright/test";

type ComposerCase = { framed?: boolean; minimal?: boolean; isTurnActive?: boolean };

for (const width of [560, 1600]) {
  test(`side question sits above the composer's right edge at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 970 });
    await page.goto("/?stavePreview=composer-frame&case=idle");
    await page.getByTestId("composer-side-question").click();
    const panel = page.getByTestId("side-chat");
    await expect(panel).toBeInViewport();
    const card = (await panel.boundingBox())!;
    const composer = (await page.getByTestId("preview-composer-measure").boundingBox())!;
    expect(card.y).toBeGreaterThanOrEqual(0);
    expect(card.y + card.height).toBeLessThan(composer.y);
    expect(composer.y - card.y - card.height).toBeLessThanOrEqual(24);
    expect(Math.abs(card.x + card.width - composer.x - composer.width)).toBeLessThanOrEqual(1);
  });
}

test("composer preview exposes the real side question without replacing its tree", async ({ page }) => {
  await page.setViewportSize({ width: 852, height: 970 });
  await page.goto("/?stavePreview=composer-frame&case=idle");
  const prompt = page.getByRole("textbox", { name: "Prompt", exact: true });
  await expect(prompt).toBeVisible();
  const draft = await prompt.innerText();
  const trigger = page.getByTestId("composer-side-question");
  await expect(trigger).toBeVisible();
  await trigger.click();
  const panel = page.getByTestId("side-chat");
  await expect(panel.getByRole("textbox", { name: "Side question", exact: true })).toBeFocused();
  await panel.getByRole("button", { name: "Close side question", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeInViewport();
  await expect(prompt).toHaveText(draft);
  await page.getByRole("button", { name: "Running", exact: true }).click();
  await trigger.click();
  await expect(panel).toBeVisible();
  await panel.getByRole("textbox", { name: "Side question", exact: true }).press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  expect(await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store/app.store.ts");
    return useAppStore.getState().activeTurnIdsByTask["preview-task"];
  })).toBe("preview-turn");
});

async function mountControls(page: Page, composer: ComposerCase = {}) {
  await page.goto("/?stavePreview=composer-frame&case=idle");
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
  await page.evaluate(async (composer) => {
    // Use the app's optimized module URLs, including their version query.
    const resources = performance.getEntriesByType("resource");
    const moduleUrl = (name: string) => resources.find((entry) => new URL(entry.name).pathname.endsWith(`/deps/${name}.js`))!.name;
    const React = (await import(moduleUrl("react"))).default;
    const { createRoot } = (await import(moduleUrl("react-dom_client"))).default;
    const { useAppStore } = await import("/src/store/app.store.ts");
    const { PromptInput } = await import("/src/components/ai-elements/prompt-input.tsx");
    const { StaveDesignProvider } = await import("/src/components/system/StaveDesignProvider.tsx");
    const { SideChatPanel } = await import("/src/components/session/side-chat/SideChatPanel.tsx");
    const { ProviderBrowserAccessSettingsCard } = await import("/src/components/layout/ProviderBrowserAccessSettingsCard.tsx");
    const { ChoiceButtons } = await import("/src/components/layout/settings-dialog.shared.tsx");
    const { MessageSquare } = await import("/node_modules/.vite/deps/lucide-react.js");
    const { registerPaneHostController } = await import("/src/components/panes/pane-host-controller.ts");
    registerPaneHostController({ openSurface: () => true, closeSurface: () => {} });
    const events = { submits: 0, aborts: 0 };
    (window as unknown as { questionEvents: typeof events }).questionEvents = events;
    useAppStore.setState((state: { tasks: unknown[] }) => ({
      tasks: [...state.tasks, { id: "ux-task", provider: "codex", title: "UX task" }],
      activeSurface: { kind: "task", taskId: "ux-task" },
      activeTaskId: "ux-task",
      messagesByTask: { "ux-task": [{ id: "m1", role: "user", content: "Check this task", parts: [] }] },
      messageCountByTask: { "ux-task": 1 },
      activeTurnIdsByTask: composer.isTurnActive ? { "ux-task": "running-turn" } : {},
      promptDraftByTask: { "ux-task": { text: "Keep this draft" } },
    }));
    document.getElementById("root")!.style.display = "none";
    const el = document.createElement("div");
    el.id = "ux-controls";
    el.style.cssText = "position:fixed;inset:0;z-index:100;background:var(--background);color:var(--foreground);padding:24px;overflow:auto";
    document.body.append(el);
    function Controls() {
      const [mode, setMode] = React.useState("always");
      const [value, setValue] = React.useState("Keep this draft");
      const model = { key: "codex:test", providerId: "codex", model: "test", label: "Test model" };
      return React.createElement(React.Fragment, null,
        // The panel belongs to the transcript region, above the composer dock.
        React.createElement("div", { style: { position: "relative", height: 360 } },
          React.createElement(SideChatPanel, { taskId: "ux-task", host: "conversation" }),
        ),
        React.createElement(PromptInput, {
          ...composer, value, onValueChange: setValue, selectedModel: model, modelOptions: [model],
          attachedFilePaths: [], onAttachFilesChange: () => {}, onModelSelect: () => {},
          onSubmit: () => { events.submits++; }, onAbort: () => { events.aborts++; },
          // Old placement data must not hide a fixed toolbar action.
          composerControlPlacements: { sideQuestion: "hidden" },
        }),
        React.createElement(ProviderBrowserAccessSettingsCard, { mode, onModeChange: setMode, autoArm: false, onAutoArmChange: () => {}, autoFallbackDomains: "", onAutoFallbackDomainsChange: () => {} }),
        React.createElement(ChoiceButtons, { value: "icon", onChange: () => {}, "aria-label": "Icon choices", options: [{ value: "icon", label: "Icon choice", description: "An icon on a neutral plate", icon: React.createElement(MessageSquare) }] }),
      );
    }
    createRoot(el).render(React.createElement(StaveDesignProvider, null, React.createElement(Controls)));
  }, composer);
  await expect(page.getByTestId("composer-side-question")).toBeVisible();
}

for (const variant of [
  { name: "classic", framed: false, minimal: false, width: 1280 },
  { name: "framed", framed: true, minimal: false, width: 560 },
  { name: "minimal", framed: false, minimal: true, width: 560 },
]) {
  for (const isTurnActive of [false, true]) {
    test(`${variant.name} toolbar opens a side question in one click while ${isTurnActive ? "running" : "idle"}, preserving the draft`, async ({ page }) => {
      await page.setViewportSize({ width: variant.width, height: 900 });
      await mountControls(page, { framed: variant.framed, minimal: variant.minimal, isTurnActive });
      const trigger = page.getByTestId("composer-side-question");
      await expect(trigger).toHaveCount(1);
      const bounds = await trigger.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(variant.width);
      await trigger.click();
      const panel = page.getByTestId("side-chat");
      await expect(panel).toHaveCount(1);
      await expect(panel.getByRole("textbox", { name: "Side question" })).toBeFocused();
      expect(await page.evaluate(async () => {
        const { useAppStore } = await import("/src/store/app.store.ts");
        return { draft: useAppStore.getState().promptDraftByTask["ux-task"].text, events: (window as unknown as { questionEvents: unknown }).questionEvents };
      })).toEqual({ draft: "Keep this draft", events: { submits: 0, aborts: 0 } });
      await panel.getByRole("textbox", { name: "Side question" }).press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(page.getByRole("textbox", { name: "Prompt", exact: true })).toHaveText("Keep this draft");
      await trigger.click();
      await expect(panel).toBeVisible();
      await panel.getByRole("button", { name: "Close" }).click();
    });
  }
}

test("selected choice descriptions and neutral icon plates use their surface foreground across all built-in themes", async ({ page }) => {
  await mountControls(page);
  const failures = await page.evaluate(async () => {
    const { applyCustomTheme, applyThemeClass } = await import("/src/lib/themes/apply.ts");
    const { BUILTIN_CUSTOM_THEMES } = await import("/src/lib/themes/builtin-themes.ts");
    const failures: unknown[] = [];
    for (const theme of [null, { id: "dark", baseMode: "dark" }, ...BUILTIN_CUSTOM_THEMES]) {
      applyThemeClass({ enabled: theme?.baseMode === "dark" });
      applyCustomTheme({ theme: theme && "tokens" in theme ? theme : null });
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const selected = document.querySelector('#ux-controls [role="radio"][aria-checked="true"]')!;
      const paragraphs = [...selected.querySelectorAll("p")];
      const expected = getComputedStyle(selected).color;
      const surfaceProbe = document.createElement("span");
      surfaceProbe.style.backgroundColor = "var(--primary)";
      document.body.append(surfaceProbe);
      if (getComputedStyle(selected).backgroundColor !== getComputedStyle(surfaceProbe).backgroundColor) failures.push({ theme: theme?.id ?? "light", surface: getComputedStyle(selected).backgroundColor, expected: getComputedStyle(surfaceProbe).backgroundColor });
      surfaceProbe.remove();
      if (!paragraphs.every((p) => getComputedStyle(p).color === expected)) failures.push({ theme: theme?.id ?? "light", expected, actual: paragraphs.map((p) => getComputedStyle(p).color) });
      const icon = document.querySelector('#ux-controls [aria-label="Icon choices"] svg')!;
      const probe = document.createElement("span");
      probe.style.color = "var(--ads-color-text)";
      document.body.append(probe);
      if (getComputedStyle(icon).color !== getComputedStyle(probe).color) failures.push({ theme: theme?.id ?? "light", icon: getComputedStyle(icon).color });
      probe.remove();
    }
    return failures;
  });
  expect(failures).toEqual([]);
  // Changing the selected option must restore the previous card's muted text.
  await page.getByRole("radio", { name: /^Only with @web/ }).click();
  await expect(page.getByRole("radio", { name: /^Only with @web/ })).toBeChecked();
  await expect.poll(() => page.getByRole("radio", { name: /^Always/ }).evaluate((el) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--ads-color-text-muted)";
    document.body.append(probe);
    const matches = getComputedStyle(el.querySelectorAll("p")[1]!).color === getComputedStyle(probe).color;
    probe.remove();
    return matches;
  })).toBe(true);
});
