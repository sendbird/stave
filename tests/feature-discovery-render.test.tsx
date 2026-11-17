import { afterEach, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n } from "@/i18n";
import { FeatureEnableHint } from "@/components/session/FeatureEnableHint";
import { normalizeDismissedFeatureTips, selectCheckpointTipMessageId } from "@/lib/feature-tips";
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
    for (const feature of ["steering", "checkpoints"] as const) {
      const html = renderToStaticMarkup(createElement(FeatureEnableHint, { feature, onEnable: () => {} }));
      expect(html).toContain(`data-feature-hint="${feature}"`);
      expect(html).toContain(language === "en" ? "Enable" : "켜기");
      expect(html).not.toContain("featureDiscovery.");
      expect(html).toContain(feature === "checkpoints" ? (language === "en" ? "future turns" : "이후 턴") : (language === "en" ? "running turn" : "실행 중인 턴"));
      expect(html).toContain(language === "en" ? 'aria-label="Dismiss tip"' : 'aria-label="팁 닫기"');
    }
  });
}

test("a dismissed tip and turned-off tips render nothing", () => {
  app.settings = { ...originalSettings, dismissedFeatureTips: ["checkpoints"] };
  expect(renderToStaticMarkup(createElement(FeatureEnableHint, { feature: "checkpoints", onEnable: () => {} }))).toBe("");
  expect(renderToStaticMarkup(createElement(FeatureEnableHint, { feature: "steering", onEnable: () => {} }))).toContain('data-feature-hint="steering"');
  app.settings = { ...originalSettings, featureTipsEnabled: false };
  expect(renderToStaticMarkup(createElement(FeatureEnableHint, { feature: "steering", onEnable: () => {} }))).toBe("");
});

test("the checkpoint tip appears once, on the latest finished Claude reply", () => {
  const messages = [
    { id: "u1", role: "user" as const, providerId: "user" as const },
    { id: "a1", role: "assistant" as const, providerId: "claude-code" as const },
    { id: "u2", role: "user" as const, providerId: "user" as const },
    { id: "a2", role: "assistant" as const, providerId: "claude-code" as const },
    { id: "u3", role: "user" as const, providerId: "user" as const },
  ];
  expect(selectCheckpointTipMessageId({ messages, checkpointingEnabled: false })).toBe("a2");
  expect(selectCheckpointTipMessageId({ messages, checkpointingEnabled: false, activeTurnId: "turn" })).toBeNull();
  expect(selectCheckpointTipMessageId({ messages, checkpointingEnabled: true })).toBeNull();
  expect(selectCheckpointTipMessageId({ messages: [...messages, { id: "a3", role: "assistant", providerId: "codex" }], checkpointingEnabled: false })).toBeNull();
});

test("stored dismissed tips keep known ids only", () => {
  expect(normalizeDismissedFeatureTips(["steering", "unknown", "steering"])).toEqual(["steering"]);
  expect(normalizeDismissedFeatureTips("checkpoints")).toEqual([]);
});
