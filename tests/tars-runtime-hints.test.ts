import { expect, test } from "bun:test";
import { buildTarsRuntimeHints, tarsAccountSelection } from "../src/lib/tars/runtime-hints";
import { TarsMessageInputSchema, TarsConversationSettingsSchema, type TarsConversationSettings } from "../src/lib/tars/conversation";
import { buildTarsExecutionResources } from "../src/lib/tars/execution-resources";
import { buildSecondaryProviderRuntimeOptions } from "../electron/providers/secondary-run-executor";
import { currentProviderAccountId, withRequestAccountScope } from "../electron/provider-accounts/runtime-scope";
import { defaultSettings } from "../src/store/app-settings";

test("both providers accept product defaults and omit the disabled token budget sentinel", () => {
  expect(() => buildTarsRuntimeHints("codex", defaultSettings)).not.toThrow();
  const hints = buildTarsRuntimeHints("claude-code", defaultSettings);
  expect(hints.claudeTaskBudgetTokens).toBeUndefined();
  expect(buildTarsRuntimeHints("claude-code", { ...defaultSettings, claudeTaskBudgetTokens: 12_000 }).claudeTaskBudgetTokens).toBe(12_000);
  expect(() => buildTarsRuntimeHints("claude-code", { claudeTaskBudgetTokens: -1 })).toThrow();
});

test("settings projection keeps the chosen account and reasoning preferences while omitting all secret and authority fields", () => {
  const settings = { codexAccountProfileId: "system-default", codexBinaryPath: "/tmp/custom-codex", codexReasoningEffort: "minimal",
    codexFastMode: true, codexReasoningSummary: "concise", claudeAccountProfileId: "system-default", claudeEffort: "high",
    boundSecretIds: ["secret-id"], secretEnv: { EXAMPLE: "private" }, codexApprovalPolicy: "never", toolsDisabled: false };
  expect(buildTarsRuntimeHints("codex", settings)).toEqual({ codexAccountProfileId: "system-default", codexBinaryPath: "/tmp/custom-codex",
    codexReasoningEffort: "low", codexFastMode: true, codexReasoningSummary: "concise" });
  expect(buildTarsRuntimeHints("claude-code", settings)).toEqual({ claudeAccountProfileId: "system-default", claudeEffort: "high" });
  expect(buildTarsRuntimeHints("claude-code", { claudeBinaryPath: "", codexFastMode: true })).toEqual({});
});

test("conversation settings validate the runtime allowlist rather than accepting arbitrary settings", () => {
  const input = { providerId: "codex", model: "selected", maxTurns: 30 };
  expect(TarsConversationSettingsSchema.safeParse({ ...input, runtimeHints: { codexFastMode: true } }).success).toBe(true);
  expect(TarsConversationSettingsSchema.safeParse({ ...input, runtimeHints: { bearerToken: "private" } }).success).toBe(false);
});

 test("send accepts words and retry identity only", () => {
  const input = { requestId: "one", text: "Discuss the plan" };
  expect(TarsMessageInputSchema.safeParse(input).success).toBe(true);
  for (const extra of [{ mode: "delegate" }, { workspaceId: "source" }, { providerId: "codex" }, { runtimeHints: {} }, { maxTurns: 30 }])
    expect(TarsMessageInputSchema.safeParse({ ...input, ...extra }).success).toBe(false);
});

test.each(["codex", "claude-code"] as const)("the %s account shown is the saved account that runs, not a later app default", (providerId) => {
  const accountKey = providerId === "codex" ? "codexAccountProfileId" : "claudeAccountProfileId";
  const work = "123e4567-e89b-42d3-a456-426614174000";
  const policy = { maxAttempts: 1, timeoutMs: 1_000, maxTurns: 1, maxOutputBytes: 1_000, maxEvents: 8 };
  // Reasoning turns resolve the account the way the host does for a secondary execution.
  const reasoningAccount = (settings: TarsConversationSettings) => withRequestAccountScope({ runtimeOptions:
    buildSecondaryProviderRuntimeOptions({ providerId, model: settings.model, policy, runtimeHints: settings.runtimeHints }) },
  () => currentProviderAccountId(providerId));
  // Configured while the app default was System default, so no account was saved.
  const implicit: TarsConversationSettings = { providerId, model: "chosen-model", maxTurns: 30, runtimeHints: buildTarsRuntimeHints(providerId, defaultSettings) };
  expect(implicit.runtimeHints?.[accountKey]).toBeUndefined();
  // The app default later changes to another account.
  const appSettings = { ...defaultSettings, [accountKey]: work };
  for (const [saved, expected] of [[implicit, "system-default"], [{ ...implicit, runtimeHints: { [accountKey]: work } }, work]] as const) {
    const shown = tarsAccountSelection(saved, appSettings);
    expect(shown).toMatchObject({ accountId: expected, accountKey, runtimeOptions: { [accountKey]: expected } });
    expect(buildTarsExecutionResources(saved).accounts).toEqual({ [accountKey]: expected });
    expect(reasoningAccount(saved)).toBe(expected);
  }
});
