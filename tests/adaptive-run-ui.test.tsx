import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n } from "@/i18n";
import { AdaptiveRunSummary } from "@/components/agent-runs/AdaptiveRunSummary";
import { AdaptiveRunPolicySchema } from "@/lib/agent-runs/resources";

test("both locales distinguish spent, reserved and unknown billing and render member pins", async () => {
  const policy = AdaptiveRunPolicySchema.parse({ version: 1, profile: "balanced", providerId: "codex", allowedModels: ["gpt-6.1-sol"],
    modelLocked: true, effortLocked: true, initialEffort: "high", teamTurns: 30,
    concurrentHelpers: 2, totalHelpers: 4, parentReserve: 1, maxChanges: 2, cooldownTurns: 2 });
  const original = i18n.language;
  try {
    for (const locale of ["en", "ko"]) {
      await i18n.changeLanguage(locale);
      const html = renderToStaticMarkup(createElement(AdaptiveRunSummary, { resources: { rootRunId: "root", policy,
        spent: 3, reserved: 20, remaining: 7, helpersLaunched: 1, activeHelpers: 1, reservations: [] } }));
      expect(html).toContain("3 / 30"); expect(html).toContain("20"); expect(html).toContain("7");
      expect(html).toContain(locale === "en" ? "pinned" : "고정");
      expect(html).toContain(locale === "en" ? "unknown" : "미상");
    }
  } finally { await i18n.changeLanguage(original); }
});
