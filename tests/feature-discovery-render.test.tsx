import { afterEach, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n } from "@/i18n";
import { FeatureEnableHint } from "@/components/session/FeatureEnableHint";

afterEach(() => i18n.changeLanguage("en"));

for (const language of ["en", "ko"]) {
  test(`feature enable links explain future behavior in ${language}`, async () => {
    await i18n.changeLanguage(language);
    for (const feature of ["steering", "checkpoints"] as const) {
      const html = renderToStaticMarkup(createElement(FeatureEnableHint, { feature, onEnable: () => {} }));
      expect(html).toContain(`data-feature-hint="${feature}"`);
      expect(html).toContain(language === "en" ? "Enable" : "켜기");
      expect(html).not.toContain("featureDiscovery.");
      expect(html).toContain(feature === "checkpoints" ? (language === "en" ? "future turns" : "이후 턴") : (language === "en" ? "running turn" : "실행 중인 턴"));
    }
  });
}
