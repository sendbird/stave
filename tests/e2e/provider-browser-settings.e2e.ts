import { test, expect } from "@playwright/test";

for (const locale of ["en", "ko"] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const density of ["regular", "compact"] as const) {
      test(`browse connection containment and status: ${locale}/${theme}/${density}`, async ({ page }) => {
        await page.goto(`/?stavePreview=aui-regressions&theme=${theme}`);
        await expect(page.locator("main svg").first()).toBeVisible();
        await page.evaluate(async ({ locale, density, theme }) => {
          const { React, createRoot } = await import("/tests/e2e/segmented-runtime.ts");
          const { ProviderBrowserAccessSettingsCard } = await import("/src/components/layout/ProviderBrowserAccessSettingsCard.tsx");
          const { StaveDesignProvider } = await import("/src/components/system/StaveDesignProvider.tsx");
          const { applyAppLocale } = await import("/src/i18n/index.ts");
          applyAppLocale(locale);
          const { applyThemeClass } = await import("/src/lib/themes/apply.ts");
          applyThemeClass({ enabled: theme === "dark" });
          document.getElementById("root")!.style.display = "none";
          document.documentElement.dataset.uiDensity = density;
          const host = document.createElement("div");
          host.id = "browser-settings-host";
          document.body.append(host);
          window.api = { ...window.api, tooling: { ...window.api?.tooling, checkBrowseConnection: async () => ({ installed: true, relay: "running", browsers: [{ id: "chrome", name: "Chrome on laptop" }] }) } };
          function Harness() {
            const [backend, setBackend] = React.useState<"native" | "browse">("browse");
            return React.createElement(StaveDesignProvider, null, React.createElement(ProviderBrowserAccessSettingsCard, {
              backend, onBackendChange: setBackend, mode: "explicit", autoArm: false,
              onAutoArmChange: () => {}, onModeChange: () => {}, autoFallbackDomains: "", onAutoFallbackDomainsChange: () => {},
            }));
          }
          createRoot(host).render(React.createElement(Harness));
          await document.fonts.ready;
        }, { locale, density, theme });
        const host = page.locator("#browser-settings-host");
        const check = host.getByRole("button", { name: locale === "en" ? "Check connection" : "연결 확인", exact: true });
        await expect(check).toBeVisible();
        expect(await page.locator("html").evaluate((element) => element.classList.contains("dark"))).toBe(theme === "dark");
        expect(await page.evaluate(() => [...document.fonts].filter((font) => font.status === "error").map((font) => font.family))).toEqual([]);
        for (const width of [320, 800]) {
          await host.evaluate((element, width) => { element.style.width = `${width}px`; }, width);
          expect(await host.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
          const setup = check.locator("..");
          const gapDelta = await setup.evaluate(async (element) => {
            const { vars } = await import("/src/components/aui/tokens/tokens.stylex.ts");
            const probe = document.createElement("div");
            probe.style.columnGap = vars["--aui-space-8"];
            element.append(probe);
            const expected = Number.parseFloat(getComputedStyle(probe).columnGap);
            probe.remove();
            return Math.abs(Number.parseFloat(getComputedStyle(element).gap) - expected);
          });
          // Half a CSS pixel allows subpixel token resolution, not spacing drift.
          expect(gapDelta).toBeLessThanOrEqual(0.5);
          const box = await check.boundingBox();
          const parent = await host.boundingBox();
          expect(box!.x + box!.width).toBeLessThanOrEqual(parent!.x + parent!.width + 1);
        }
        await check.click();
        await expect(host.getByRole("status")).toContainText("Chrome on laptop");
        await host.getByRole("radio", { name: locale === "en" ? "Provider Chrome connection (Claude Code, Codex)" : "프로바이더 Chrome 연결 (Claude Code, Codex)", exact: true }).click();
        await expect(check).toHaveCount(0);
      });
    }
  }
}
