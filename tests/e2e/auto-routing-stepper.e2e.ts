import { expect, test, type Page } from "@playwright/test";

type Locale = "en" | "ko";

/** Mounts the usage wizard with six fixed samples, in a 760px column. */
async function mountWizard(page: Page, args: { locale: Locale; dark: boolean } = { locale: "en", dark: false }) {
  await page.goto("/?stavePreview=aui-regressions");
  await expect(page.locator("main svg").first()).toBeVisible();
  if (args.dark) {
    await page.getByRole("button", { name: "Light", exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  }
  await page.evaluate(async (locale) => {
    const resources = performance.getEntriesByType("resource");
    const moduleUrl = (name: string) => resources.find((entry) => new URL(entry.name).pathname.endsWith(`/deps/${name}.js`))!.name;
    const React = (await import(moduleUrl("react"))).default;
    const { createRoot } = (await import(moduleUrl("react-dom_client"))).default;
    const { SettingsAutoRoutingWizard } = await import("/src/components/layout/settings-dialog-auto-routing-wizard.tsx");
    const { StaveDesignProvider } = await import("/src/components/system/StaveDesignProvider.tsx");
    const { DEFAULT_CLAUDE_OPUS_MODEL, DEFAULT_CLAUDE_HAIKU_MODEL } = await import("/src/lib/providers/model-catalog.ts");
    const runtimePath = "/src/i18n/runtime.ts";
    const { i18n } = await import(runtimePath);
    await i18n.changeLanguage(locale);
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
  }, args.locale);
}

test("the usage wizard's step rail: current step, revisitable steps, focus follows, position in words", async ({ page }, testInfo) => {
  await mountWizard(page);
  const rail = page.getByRole("navigation", { name: "Setup steps" });
  await expect(rail).toBeVisible();
  // The status line shows under the step's name.
  await expect(rail.getByText("6 prompts read", { exact: true })).toBeVisible();
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

const DESCRIPTIONS: Record<Locale, string[]> = {
  en: ["6 prompts read", "Choose the rules", "Save the profile"],
  ko: ["프롬프트 6개 읽음", "규칙 고르기", "프로필 저장"],
};

const RAIL: Record<Locale, string> = { en: "Setup steps", ko: "설정 단계" };
const CONTINUE: Record<Locale, string> = { en: "Continue to review", ko: "리뷰로 계속" };

for (const locale of ["en", "ko"] as const) {
  for (const dark of [false, true]) {
    test(`each step shows its status line under its name, on one rail with connectors (${locale}, ${dark ? "dark" : "light"})`, async ({ page }) => {
      await mountWizard(page, { locale, dark });
      const rail = page.getByRole("navigation", { name: RAIL[locale] });
      await expect(rail).toBeVisible();
      // On the Review step: Scan complete, Review current, Apply pending.
      await page.getByRole("button", { name: CONTINUE[locale] }).click();
      await expect(rail.locator('li[data-step-status="complete"]')).toHaveCount(1);

      const steps = await rail.evaluate((nav) =>
        [...nav.querySelectorAll<HTMLLIElement>("li")].map((item) => {
          const box = (element: Element | null) => {
            const rect = element!.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
          };
          const title = item.querySelector('[data-aui-slot="title"]');
          const description = item.querySelector<HTMLElement>('[data-aui-slot="description"]')!;
          const marker = item.querySelector(".aui-stepper-indicator");
          const connector = getComputedStyle(item, "::after");
          return {
            status: item.dataset.stepStatus,
            body: box(item.firstElementChild),
            title: box(title),
            description: box(description),
            descriptionText: description.textContent,
            descriptionClipped: description.scrollWidth > description.clientWidth + 1,
            descriptionColor: getComputedStyle(description).color,
            marker: marker ? box(marker) : null,
            connector: {
              display: connector.display,
              width: Number.parseFloat(connector.width),
              top: Number.parseFloat(connector.top),
            },
            itemTop: item.getBoundingClientRect().top,
          };
        }),
      );

      expect(steps.map((step) => step.status)).toEqual(["complete", "current", "pending"]);
      expect(steps.map((step) => step.descriptionText)).toEqual(DESCRIPTIONS[locale]);
      const [first] = steps;
      for (const step of steps) {
        // Visible under the name, not a 1px assistive-only box.
        expect(step.description.width).toBeGreaterThan(8);
        expect(step.description.height).toBeGreaterThan(8);
        expect(step.descriptionClipped).toBe(false);
        expect(step.description.top).toBeGreaterThanOrEqual(step.title.bottom - 1);
        expect(Math.abs(step.description.left - step.title.left)).toBeLessThanOrEqual(1);
        expect(step.description.bottom).toBeLessThanOrEqual(step.body.bottom + 0.5);
        // The marker centres on the two-line copy block.
        expect(step.marker).not.toBeNull();
        const copyCentre = (step.title.top + step.description.bottom) / 2;
        expect(Math.abs(step.marker!.top + step.marker!.height / 2 - copyCentre)).toBeLessThanOrEqual(1.5);
        // One rail: every chip on the same line and the same height.
        expect(Math.abs(step.body.top - first!.body.top)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(step.body.height - first!.body.height)).toBeLessThanOrEqual(0.5);
      }
      // A connector joins each step to the next, through the chips' middle.
      for (const step of steps.slice(0, -1)) {
        expect(step.connector.display).not.toBe("none");
        expect(step.connector.width).toBeGreaterThan(0);
        expect(Math.abs(step.itemTop + step.connector.top - (step.body.top + step.body.height / 2))).toBeLessThanOrEqual(1);
      }
      expect(steps.at(-1)!.connector.display).toBe("none");
    });
  }
}
