import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n } from "@/i18n";
import { RunTeamLimits } from "@/components/agent-runs/RunTeamLimits";
import { AdaptiveRunPolicySchema } from "@/lib/agent-runs/resources";

test("both locales show the shared budget, the frozen helper limits and member pins", async () => {
  const policy = AdaptiveRunPolicySchema.parse({ version: 2, profile: "balanced", providerId: "codex", allowedModels: ["gpt-6.1-sol"],
    modelLocked: true, effortLocked: true, initialEffort: "high", teamTurns: 30,
    concurrentHelpers: 3, totalHelpers: 8, parentReserve: 1, maxChanges: 2, cooldownTurns: 2 });
  const original = i18n.language;
  try {
    for (const locale of ["en", "ko"]) {
      await i18n.changeLanguage(locale);
      // Extend raised the run's max turns to 40; the budget shows the raised total.
      const html = renderToStaticMarkup(createElement(RunTeamLimits, { resources: { rootRunId: "root", policy, teamTurns: 40,
        spent: 3, reserved: 20, remaining: 17, helpersLaunched: 1, activeHelpers: 1, reservations: [] } }));
      expect(html).toContain("40"); expect(html).toContain("20"); expect(html).toContain("17");
      expect(html).toContain(locale === "en" ? "1 of 3 working" : "동시 3개 중 1개");
      expect(html).toContain(locale === "en" ? "1 of 8 called" : "전체 8개 중 1개");
      expect(html).toContain(locale === "en" ? "pinned" : "고정");
      expect(html).not.toContain("Auto adjust");
    }
  } finally { await i18n.changeLanguage(original); }
});
