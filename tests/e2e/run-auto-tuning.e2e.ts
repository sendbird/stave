import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark", "dracula"]) {
  test(`auto adjust lives in the right wing and preserves the draft (${theme})`, async ({ page }, testInfo) => {
    await page.goto(`/?stavePreview=composer-frame&case=idle&agent=implementer&theme=${theme}&w=1000`);
    const button = page.getByTestId("run-auto-tuning-control");
    await expect(page.locator('[data-composer-frame-slot="right"]').getByTestId("run-auto-tuning-control")).toBeVisible();
    await expect(button).toHaveAccessibleName("Auto adjust: Off");
    await button.click();
    const toggle = page.getByRole("checkbox", { name: "Enable automatic adjustment" });
    await toggle.check();
    await expect(button).toHaveAccessibleName("Auto adjust: On");
    expect(await page.evaluate(async () => {
      const path = "/src/store/app.store.ts";
      const { useAppStore } = await import(path);
      return useAppStore.getState().promptDraftByTask["preview-task"]?.runtimeOverrides?.agentRunAdaptive;
    })).toBe(true);
    await page.getByRole("dialog").screenshot({ path: testInfo.outputPath("auto-adjust.png") });
    await page.keyboard.press("Escape");
    await expect(button).toBeFocused();
    await button.press("Enter");
    await toggle.uncheck();
    await expect(button).toHaveAccessibleName("Auto adjust: Off");
  });
}

test("compact and classic layouts keep the button and popup within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 440, height: 800 });
  await page.goto("/?stavePreview=composer-frame&case=idle&agent=implementer&theme=dark&w=420");
  const button = page.getByTestId("run-auto-tuning-control");
  await expect(button).toBeVisible();
  await expect(page.locator('[data-composer-frame-slot="right"]')).toHaveCount(0);
  await button.click();
  await expect(page.getByRole("checkbox", { name: "Enable automatic adjustment" })).toBeVisible();
  const bounds = await page.getByRole("dialog").boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(440);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Framed", exact: true }).click();
  await expect(page.getByRole("button", { name: "Classic", exact: true })).toBeVisible();
  await expect(button).toBeVisible();
});

test("a live run shows its host policy, locks changes, then restores the next-run draft", async ({ page }) => {
  await page.goto("/?stavePreview=composer-frame&case=idle&agent=implementer&theme=dark&w=1000");
  const button = page.getByTestId("run-auto-tuning-control");
  await button.click();
  const toggle = page.getByRole("checkbox", { name: "Enable automatic adjustment" });
  await toggle.check();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Agent run", exact: true }).click();
  // A non-adjusting host run must not inherit the draft's enabled state.
  await expect(button).toHaveAccessibleName("Auto adjust: Off");
  await button.click();
  await expect(toggle).toBeDisabled();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByText("This run keeps its starting settings.", { exact: false })).toBeVisible();
  await page.evaluate(async () => {
    const path = "/src/store/agent-runs-store.ts";
    const resourcePath = "/src/lib/agent-runs/resources.ts";
    const { useAgentRunsStore } = await import(path);
    const { projectResourceBudget } = await import(resourcePath);
    const state = useAgentRunsStore.getState();
    const id = state.agentRunIdByTask["preview-workspace:preview-task"];
    const detail = state.details[id];
    useAgentRunsStore.setState({ details: { ...state.details, [id]: { ...detail, resources: projectResourceBudget(id, {
      version: 1, profile: "balanced", providerId: "claude-code", allowedModels: ["claude-sonnet-4-6"],
      modelLocked: false, effortLocked: false, initialEffort: null, teamTurns: 30,
      concurrentHelpers: 2, totalHelpers: 4, parentReserve: 1, maxChanges: 2, cooldownTurns: 2,
    }, []) } } });
  });
  await expect(button).toHaveAccessibleName("Auto adjust: On");
  await expect(toggle).toBeChecked();
  await expect(toggle).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Idle", exact: true }).click();
  await expect(button).toHaveAccessibleName("Auto adjust: On");
  await button.click();
  await expect(toggle).toBeEnabled();
});

test("switching to Chat hides auto adjust", async ({ page }) => {
  await page.goto("/?stavePreview=composer-frame&case=idle&theme=light");
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
  await expect(page.getByTestId("run-auto-tuning-control")).toHaveCount(0);
  await page.goto("/?stavePreview=composer-frame&case=idle&agent=implementer&theme=light");
  await expect(page.getByTestId("run-auto-tuning-control")).toBeVisible();
  await page.getByTestId("run-auto-tuning-control").click();
  await page.getByRole("checkbox", { name: "Enable automatic adjustment" }).check();
  await page.keyboard.press("Escape");
  await page.evaluate(async () => {
    const path = "/src/store/agent-assignments-store.ts";
    const { useAgentAssignmentsStore } = await import(path);
    useAgentAssignmentsStore.setState({ byTaskId: {} });
  });
  await expect(page.getByTestId("run-auto-tuning-control")).toHaveCount(0);
});

test("the Korean button uses a short name and explains automatic model adjustment", async ({ page }) => {
  await page.goto("/?stavePreview=composer-frame&case=idle&agent=implementer&theme=light&w=1000");
  await expect(page.getByTestId("run-auto-tuning-control")).toBeVisible();
  await page.evaluate(async () => {
    const path = "/src/i18n/runtime.ts";
    const { i18n } = await import(path);
    await i18n.changeLanguage("ko");
  });
  const button = page.getByRole("button", { name: "자동 조정: 끔", exact: true });
  await button.click();
  await expect(page.getByText("모델 자동 조정", { exact: true })).toBeVisible();
  const toggle = page.getByRole("checkbox", { name: "자동 조정 사용", exact: true });
  await toggle.check();
  await expect(button).toHaveCount(0);
  await expect(page.getByRole("button", { name: "자동 조정: 켬", exact: true })).toBeVisible();
});
