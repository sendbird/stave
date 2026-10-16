import { afterEach, describe, expect, test } from "bun:test";
import { buildModelSelectorValue } from "../src/components/ai-elements/model-selector.utils";
import {
  accountSwitchForSelection,
  buildConnectionModelSelectorOptions,
  resetRememberedSubscriptionAccounts,
  subscriptionAccountSelection,
} from "../src/lib/providers/account-model-options";

const VERCEL = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const gateway = { baseUrl: "https://ai-gateway.vercel.sh/codex/v1", secretId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", models: ["openai/gpt-oss-120b", "zai/glm-5.3"] };
const apiConnection = { label: "Vercel", kind: "vercel-ai-gateway" as const, models: [{ id: "openai/gpt-oss-120b" }, { id: "zai/glm-5.3" }] };
const profiles = [
  { id: "system-default", providerId: "codex" as const, label: "System default" },
  { id: "work", providerId: "codex" as const, label: "Work" },
  { id: VERCEL, providerId: "codex" as const, label: "Vercel", gateway, apiConnection },
  { id: "system-default", providerId: "claude-code" as const, label: "System default" },
];

afterEach(() => resetRememberedSubscriptionAccounts());

describe("model picker with an API connection", () => {
  test("a runtime set to a connection still reads its subscription catalog", () => {
    expect(subscriptionAccountSelection({ codexAccountProfileId: VERCEL }, profiles)).toEqual({
      claudeAccountProfileId: "system-default",
      codexAccountProfileId: "system-default",
    });
    // The subscription account used last is the one the runtime returns to.
    subscriptionAccountSelection({ codexAccountProfileId: "work" }, profiles);
    expect(subscriptionAccountSelection({ codexAccountProfileId: VERCEL }, profiles).codexAccountProfileId).toBe("work");
  });

  test("each connection is its own group whose rows carry the connection account", () => {
    const options = buildConnectionModelSelectorOptions({ profiles, availabilityByProvider: { codex: true } });
    expect(options.map((option) => [option.providerId, option.model, option.accountProfileId, option.group])).toEqual([
      ["codex", "openai/gpt-oss-120b", VERCEL, "Vercel · API billing"],
      ["codex", "zai/glm-5.3", VERCEL, "Vercel · API billing"],
    ]);
    // A connection row never shares a key with the runtime's own row for the same id.
    expect(options[0]!.key).toBe(`codex:openai/gpt-oss-120b@${VERCEL}`);
    expect(buildModelSelectorValue({ providerId: "codex", model: "openai/gpt-oss-120b", accountProfileId: VERCEL }).key).toBe(options[0]!.key);
    expect(buildModelSelectorValue({ providerId: "codex", model: "gpt-6.1-sol" }).key).toBe("codex:gpt-6.1-sol");
  });

  test("picking a connection model selects the connection; a runtime model returns to the subscription", () => {
    // The composer reads the picker while Work is selected, as it does on every render.
    subscriptionAccountSelection({ codexAccountProfileId: "work" }, profiles);
    expect(accountSwitchForSelection({ option: { providerId: "codex", accountProfileId: VERCEL }, selection: { codexAccountProfileId: "work" }, profiles }))
      .toEqual({ codexAccountProfileId: VERCEL });
    expect(accountSwitchForSelection({ option: { providerId: "codex" }, selection: { codexAccountProfileId: VERCEL }, profiles }))
      .toEqual({ codexAccountProfileId: "work" });
    // Already on the right account, Auto, and runtimes without accounts change nothing.
    expect(accountSwitchForSelection({ option: { providerId: "codex" }, selection: { codexAccountProfileId: "work" }, profiles })).toBeNull();
    expect(accountSwitchForSelection({ option: { providerId: "codex", accountProfileId: VERCEL }, selection: { codexAccountProfileId: VERCEL }, profiles })).toBeNull();
    expect(accountSwitchForSelection({ option: { providerId: "codex", isAuto: true }, selection: { codexAccountProfileId: VERCEL }, profiles })).toBeNull();
    expect(accountSwitchForSelection({ option: { providerId: "cursor" }, selection: {}, profiles })).toBeNull();
  });

  test("a removed remembered account falls back to System default", () => {
    subscriptionAccountSelection({ codexAccountProfileId: "work" }, profiles);
    const withoutWork = profiles.filter((profile) => profile.id !== "work");
    expect(accountSwitchForSelection({ option: { providerId: "codex" }, selection: { codexAccountProfileId: VERCEL }, profiles: withoutWork }))
      .toEqual({ codexAccountProfileId: "system-default" });
  });
});
