import { expect, test } from "bun:test";
import { configuredGatewayCatalog, loadProviderModelCatalog } from "../src/lib/providers/use-provider-model-catalogs";
import { useProviderAccounts } from "../src/lib/providers/use-provider-accounts";
import { claudeModelForcesAdaptiveThinking, claudeFastModeEnabled } from "../src/lib/providers/claude-model-requirements";
import { modelAcceptsExplicitEffort } from "../src/lib/providers/model-effort";

test("Gateway selection uses only its configured models and native selection restores the catalog", async () => {
  const before = useProviderAccounts.getState().profiles;
  const id = "11111111-1111-4111-8111-111111111111";
  try {
    useProviderAccounts.setState({ profiles: [...before, { id, providerId: "claude-code", kind: "managed", label: "Gateway", gateway: { baseUrl: "https://gateway.example.test", secretId: id, models: ["anthropic/claude-sonnet-5"] } }] });
    const args = { providerId: "claude-code" as const, runtimeOptions: { claudeAccountProfileId: id } };
    expect(configuredGatewayCatalog(args)?.models).toEqual(["anthropic/claude-sonnet-5"]);
    expect((await loadProviderModelCatalog(args)).models).toEqual(["anthropic/claude-sonnet-5"]);
    expect(configuredGatewayCatalog({ providerId: "claude-code" })).toBeUndefined();
    expect((await loadProviderModelCatalog({ providerId: "claude-code" })).models.length).toBeGreaterThan(1);
  } finally { useProviderAccounts.setState({ profiles: before }); }
});

test("Gateway routing prefixes retain native model requirements", () => {
  for (const prefix of ["", "anthropic/", "claude-code/anthropic/"]) {
    expect(modelAcceptsExplicitEffort({ providerId: "claude-code", model: `${prefix}claude-haiku-4-5` })).toBe(false);
    expect(claudeModelForcesAdaptiveThinking(`${prefix}claude-sonnet-5-5[1m]`)).toBe(true);
    expect(claudeFastModeEnabled(true, `${prefix}claude-sonnet-5-5`)).toBe(false);
    expect(modelAcceptsExplicitEffort({ providerId: "claude-code", model: `${prefix}claude-haiku-5-5` })).toBe(true);
    expect(claudeModelForcesAdaptiveThinking(`${prefix}claude-haiku-5-5`)).toBe(true);
    expect(claudeFastModeEnabled(true, `${prefix}claude-haiku-5-5`)).toBe(false);
  }
  expect(claudeModelForcesAdaptiveThinking("claude-haiku-4-5")).toBe(false);
  expect(claudeFastModeEnabled(true, "claude-opus-5-5")).toBe(true);
});
