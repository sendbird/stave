import { expect, test } from "@playwright/test";
type LifecycleWindow = Window & { traceLifecycle: { advance(): void; complete(): void } };

for (const provider of ["claude-code", "codex", "cursor", "kiro"] as const) {
  for (const locale of ["en", "ko"] as const) {
    test(`trace progress and completion: ${provider}/${locale}`, async ({ page }) => {
      await page.goto("/?stavePreview=agent-messages");
      await page.evaluate(async ({ provider, locale }) => {
        const { applyAppLocale } = await import("/src/i18n/index.ts");
        applyAppLocale(locale);
        document.documentElement.classList.toggle("dark", locale === "ko");
        document.documentElement.dataset.uiDensity = locale === "ko" ? "compact" : "regular";
        const { mountTraceLifecycle } = await import("/tests/e2e/fixtures/trace-lifecycle.tsx");
        (window as unknown as LifecycleWindow).traceLifecycle = mountTraceLifecycle(provider);
        await document.fonts.ready;
      }, { provider, locale });
      const host = page.locator("[data-trace-lifecycle]");
      const trigger = host.locator("button[aria-expanded]").first();
      await expect(trigger).toContainText(locale === "en" ? "Reading search.ts" : "search.ts");
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await page.evaluate(() => (window as unknown as LifecycleWindow).traceLifecycle.advance());
      await expect(trigger).toContainText(locale === "en" ? "Editing styles.css" : "styles.css");
      await page.evaluate(() => (window as unknown as LifecycleWindow).traceLifecycle.complete());
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(trigger).toContainText("Updated the search styles");
      await expect(trigger).toContainText(locale === "en" ? "2 tool calls" : "도구 2");
      await trigger.evaluate(async (element) => {
        await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
      });
      for (const width of [390, 1100]) {
        await page.setViewportSize({ width, height: 900 });
        const geometry = await trigger.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const children = [...element.children].map((e) => e.getBoundingClientRect());
          return { overflow: Math.max(...children.map((r) => r.right - box.right)), offset: Math.max(...children.map((r) => Math.abs(r.top + r.height / 2 - box.top - box.height / 2))) };
        });
        expect(geometry.overflow).toBeLessThanOrEqual(1);
        expect(geometry.offset).toBeLessThanOrEqual(2);
      }
      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(host.getByText("search.ts", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => [...document.fonts].filter((font) => font.status === "error").length)).toBe(0);
    });
  }
}
