import { afterEach, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n } from "@/i18n";
import { FeatureEnableHint } from "@/components/session/FeatureEnableHint";
import { normalizeDismissedFeatureTips } from "@/lib/feature-tips";
import { useAppStore } from "@/store/app.store";

/* Server rendering reads the store's initial state, so settings are seeded there. */
const app = useAppStore.getInitialState();
const originalSettings = app.settings;
afterEach(() => {
  app.settings = originalSettings;
  return i18n.changeLanguage("en");
});

for (const language of ["en", "ko"]) {
  test(`feature enable links explain future behavior in ${language}`, async () => {
    await i18n.changeLanguage(language);
    for (const feature of ["steering"] as const) {
      const html = renderToStaticMarkup(createElement(FeatureEnableHint, { feature, onEnable: () => {} }));
      expect(html).toContain(`data-feature-hint="${feature}"`);
      expect(html).toContain(language === "en" ? "Enable" : "켜기");
      expect(html).not.toContain("featureDiscovery.");
      expect(html).toContain(language === "en" ? "running turn" : "실행 중인 턴");
      expect(html).toContain(language === "en" ? 'aria-label="Dismiss tip"' : 'aria-label="팁 닫기"');
    }
  });
}

test("a dismissed tip and turned-off tips render nothing", () => {
  expect(renderToStaticMarkup(createElement(FeatureEnableHint, { feature: "steering", onEnable: () => {} }))).toContain('data-feature-hint="steering"');
  app.settings = { ...originalSettings, dismissedFeatureTips: ["steering"] };
  expect(renderToStaticMarkup(createElement(FeatureEnableHint, { feature: "steering", onEnable: () => {} }))).toBe("");
  app.settings = { ...originalSettings, featureTipsEnabled: false };
  expect(renderToStaticMarkup(createElement(FeatureEnableHint, { feature: "steering", onEnable: () => {} }))).toBe("");
});

test("stored dismissed tips keep known ids only", () => {
  expect(normalizeDismissedFeatureTips(["steering", "unknown", "steering"])).toEqual(["steering"]);
  expect(normalizeDismissedFeatureTips("steering")).toEqual([]);
  // The retired file-checkpoint tip: turn snapshots restore files for every provider.
  expect(normalizeDismissedFeatureTips(["checkpoints", "steering"])).toEqual(["steering"]);
});
