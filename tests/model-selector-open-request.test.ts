import { describe, expect, test } from "bun:test";
import { isModelSelectorOpenRequestReady } from "@/components/ai-elements/model-selector-open-request";

const GROUP = "Company gateway · API billing";
const option = (providerId: "claude-code" | "codex", group?: string) => ({ providerId, isAuto: false, ...(group ? { group } : {}) });

describe("a model selector open request", () => {
  test("waits while the provider has no tab, as right after an account switch", () => {
    const request = { providerId: "codex" as const, group: GROUP };
    // Codex availability was reset by the switch: only Claude is listed.
    expect(isModelSelectorOpenRequestReady({ request, providerIds: ["claude-code"], options: [option("claude-code")] })).toBe(false);
    // Codex is back but still lists its previous account's models.
    expect(isModelSelectorOpenRequestReady({ request, providerIds: ["claude-code", "codex"], options: [option("claude-code"), option("codex")] })).toBe(false);
    // The connection's group arrived.
    expect(isModelSelectorOpenRequestReady({ request, providerIds: ["claude-code", "codex"], options: [option("claude-code"), option("codex", GROUP)] })).toBe(true);
  });

  test("a request without a group needs only the tab; Auto's option does not count", () => {
    expect(isModelSelectorOpenRequestReady({ request: { providerId: "codex" }, providerIds: ["codex"], options: [] })).toBe(true);
    expect(isModelSelectorOpenRequestReady({
      request: { providerId: "codex", group: GROUP },
      providerIds: ["codex"],
      options: [{ providerId: "codex", isAuto: true, group: GROUP }],
    })).toBe(false);
  });
});
