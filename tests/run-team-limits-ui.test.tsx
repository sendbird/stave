import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n } from "@/i18n";
import { RunTeamLimits } from "@/components/agent-runs/RunTeamLimits";
import { AdaptiveRunPolicySchema, TEAM_LIMITS } from "@/lib/agent-runs/resources";

const policy = AdaptiveRunPolicySchema.parse({ version: 2, profile: "balanced", providerId: "codex", allowedModels: ["gpt-6.1-sol"],
  modelLocked: true, effortLocked: true, initialEffort: "high", teamTurns: 30,
  concurrentHelpers: 3, totalHelpers: 8, parentReserve: 1, maxChanges: 2, cooldownTurns: 2 });
const resources = { rootRunId: "root", policy, teamTurns: TEAM_LIMITS.maxTeamTurns,
  spent: 3, reserved: 2, remaining: TEAM_LIMITS.maxTeamTurns - 5, helpersLaunched: 1, activeHelpers: 1, reservations: [] };

test("both locales show the helper limits and member pins, without a turn budget or meter", async () => {
  const original = i18n.language;
  try {
    for (const locale of ["en", "ko"]) {
      await i18n.changeLanguage(locale);
      const html = renderToStaticMarkup(createElement(RunTeamLimits, { resources }));
      expect(html).toContain("1 / 3");
      expect(html).toContain("1 / 8");
      expect(html).toContain('aria-expanded="false"');
      expect(html).toContain('hidden=""');
      expect(html).not.toContain('role="meter"');
      expect(html).not.toContain(String(resources.remaining));
      // The guard against loops is explained on demand, not counted down.
      expect(html).toContain(String(TEAM_LIMITS.maxTeamTurns));
      expect(html).toContain(locale === "en" ? "pinned" : "고정");
      expect(html).not.toContain("Auto adjust");
    }
  } finally { await i18n.changeLanguage(original); }
});

test("spent turns never turn the section into a warning", () => {
  const calm = renderToStaticMarkup(createElement(RunTeamLimits, { resources }));
  const spent = renderToStaticMarkup(createElement(RunTeamLimits, { resources: { ...resources, spent: TEAM_LIMITS.maxTeamTurns - 1, reserved: 0, remaining: 1 } }));
  expect(spent).toBe(calm);
});
