import { expect, test } from "@playwright/test";

test("the usage wizard's step rail: current step, revisitable steps, focus follows, position in words", async ({ page }, testInfo) => {
  await page.goto("/?stavePreview=ads-regressions");
  await expect(page.locator("main svg").first()).toBeVisible();
  await page.evaluate(async () => {
    const resources = performance.getEntriesByType("resource");
    const moduleUrl = (name: string) => resources.find((entry) => new URL(entry.name).pathname.endsWith(`/deps/${name}.js`))!.name;
    const React = (await import(moduleUrl("react"))).default;
    const { createRoot } = (await import(moduleUrl("react-dom_client"))).default;
    const { SettingsAutoRoutingWizard } = await import("/src/components/layout/settings-dialog-auto-routing-wizard.tsx");
    const { StaveDesignProvider } = await import("/src/components/system/StaveDesignProvider.tsx");
    const { DEFAULT_CLAUDE_OPUS_MODEL, DEFAULT_CLAUDE_HAIKU_MODEL } = await import("/src/lib/providers/model-catalog.ts");
    document.getElementById("root")!.style.display = "none";
    const host = document.createElement("div");
    host.style.cssText = "padding:24px;width:760px";
    document.body.append(host);
    const samples = [
      ...["Plan the architecture for the new notifications module", "Plan how we should split the monolith into packages", "Plan the rollout of the new theme editor step by step"]
        .map((prompt) => ({ prompt, providerId: "claude-code", model: DEFAULT_CLAUDE_OPUS_MODEL, effort: "medium" })),
      ...["Fix the failing CI pipeline on main", "The lint job fails in CI, fix it", "CI is red because of the typecheck step, fix it"]
        .map((prompt) => ({ prompt, providerId: "claude-code", model: DEFAULT_CLAUDE_HAIKU_MODEL })),
    ];
    createRoot(host).render(React.createElement(StaveDesignProvider, null,
      React.createElement(SettingsAutoRoutingWizard, { samplesOverride: samples })));
    await document.fonts.ready;
  });
  const rail = page.getByRole("navigation", { name: "Setup steps" });
  await expect(rail).toBeVisible();
  // The status line is the step's accessible description.
  await expect(rail).toContainText("6 prompts read");
  await expect(page.getByText("Step 1 of 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue to review" }).click();
  // Focus moves to the new step, not left on a button that is gone.
  await expect(page.getByRole("heading", { name: "Step 2 of 3: Review" })).toBeFocused();
  await expect(page.getByText("Step 2 of 3", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("auto-routing-stepper.png") });
  // A finished step is a button back to it.
  await rail.getByRole("button", { name: /Scan/ }).click();
  await expect(page.getByRole("heading", { name: "Step 1 of 3: Scan" })).toBeFocused();
  await expect(rail.getByRole("button", { name: /Scan/ })).toHaveAttribute("aria-current", "step");
});
