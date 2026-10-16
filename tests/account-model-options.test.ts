import { describe, expect, test } from "bun:test";
import { optionForFixedModel } from "../src/components/ai-elements/agent-choice-actions";
import { collapseClaudeContextOptions, groupModelSections } from "../src/components/ai-elements/model-effort-selector.utils";
import { buildModelSelectorValue, type ModelSelectorOption } from "../src/components/ai-elements/model-selector.utils";
import {
  accountSwitchForSelection,
  buildConnectionModelSelectorOptions,
  subscriptionAccountSelection,
  subscriptionAccountsToRemember,
  tagSelectedConnectionOptions,
} from "../src/lib/providers/account-model-options";
import { findModelShortcutOption } from "../src/lib/providers/model-shortcuts";

const VERCEL = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const OTHER = "7a1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4c";
const secretId = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const connection = (label: string, models: string[], baseUrl = "https://ai-gateway.vercel.sh/codex/v1") => ({
  label,
  gateway: { baseUrl, secretId, models },
  apiConnection: { label, kind: "vercel-ai-gateway" as const, models: models.map((id) => ({ id })) },
});
const profiles = [
  { id: "system-default", providerId: "codex" as const, label: "System default" },
  { id: "work", providerId: "codex" as const, label: "Work" },
  { id: VERCEL, providerId: "codex" as const, ...connection("Vercel", ["openai/gpt-oss-120b", "zai/glm-5.3"]) },
  { id: "system-default", providerId: "claude-code" as const, label: "System default" },
];
const row = (model: string, extra: Partial<ModelSelectorOption> = {}): ModelSelectorOption => ({
  key: `codex:${model}`, providerId: "codex", model, label: model, available: true, ...extra,
});

describe("model picker with an API connection", () => {
  test("a runtime set to a connection reads the sign-in catalog it used last", () => {
    expect(subscriptionAccountSelection({ codexAccountProfileId: VERCEL }, profiles)).toEqual({
      claudeAccountProfileId: "system-default",
      codexAccountProfileId: "system-default",
    });
    const remembered = subscriptionAccountsToRemember({ codexAccountProfileId: "work" }, profiles);
    expect(remembered).toEqual({ "claude-code": "system-default", codex: "work" });
    expect(subscriptionAccountSelection({ codexAccountProfileId: VERCEL }, profiles, remembered).codexAccountProfileId).toBe("work");
    // A connection is never remembered as the sign-in account.
    expect(subscriptionAccountsToRemember({ codexAccountProfileId: VERCEL }, profiles)).toEqual({ "claude-code": "system-default" });
  });

  test("each connection is its own group whose rows carry the connection account", () => {
    const options = buildConnectionModelSelectorOptions({ profiles, selection: {}, availabilityByProvider: { codex: false } });
    expect(options.map((option) => [option.model, option.accountProfileId, option.group, option.available])).toEqual([
      ["openai/gpt-oss-120b", VERCEL, "Vercel · API billing", true],
      ["zai/glm-5.3", VERCEL, "Vercel · API billing", true],
    ]);
    expect(options[0]!.key).toBe(`codex:openai/gpt-oss-120b@${VERCEL}`);
    expect(buildModelSelectorValue({ providerId: "codex", model: "openai/gpt-oss-120b", accountProfileId: VERCEL }).key).toBe(options[0]!.key);
    expect(buildModelSelectorValue({ providerId: "codex", model: "gpt-6.1-sol" }).key).toBe("codex:gpt-6.1-sol");
  });

  test("a signed-out runtime still offers its connections; the selected connection keeps its own availability", () => {
    // Signed out of the sign-in account: the connection is the way to keep working.
    expect(buildConnectionModelSelectorOptions({ profiles, selection: { codexAccountProfileId: "work" }, availabilityByProvider: { codex: false } })
      .every((option) => option.available)).toBe(true);
    // The selected connection cannot read its key: its rows say so.
    expect(buildConnectionModelSelectorOptions({ profiles, selection: { codexAccountProfileId: VERCEL }, availabilityByProvider: { codex: false } })
      .every((option) => !option.available)).toBe(true);
  });

  test("picking a connection model selects the connection; a runtime model returns to the sign-in account", () => {
    const remembered = { codex: "work" };
    expect(accountSwitchForSelection({ option: { providerId: "codex", accountProfileId: VERCEL }, selection: { codexAccountProfileId: "work" }, profiles, remembered }))
      .toEqual({ codexAccountProfileId: VERCEL });
    expect(accountSwitchForSelection({ option: { providerId: "codex" }, selection: { codexAccountProfileId: VERCEL }, profiles, remembered }))
      .toEqual({ codexAccountProfileId: "work" });
    expect(accountSwitchForSelection({ option: { providerId: "codex" }, selection: { codexAccountProfileId: "work" }, profiles, remembered })).toBeNull();
    expect(accountSwitchForSelection({ option: { providerId: "codex", accountProfileId: VERCEL }, selection: { codexAccountProfileId: VERCEL }, profiles })).toBeNull();
    expect(accountSwitchForSelection({ option: { providerId: "codex", isAuto: true }, selection: { codexAccountProfileId: VERCEL }, profiles })).toBeNull();
    expect(accountSwitchForSelection({ option: { providerId: "cursor" }, selection: {}, profiles })).toBeNull();
    // A removed remembered account falls back to System default.
    expect(accountSwitchForSelection({ option: { providerId: "codex" }, selection: { codexAccountProfileId: VERCEL }, profiles: profiles.filter((p) => p.id !== "work"), remembered }))
      .toEqual({ codexAccountProfileId: "system-default" });
  });

  test("choosing an Agent resolves its model on the selected account and never switches it", () => {
    const account = tagSelectedConnectionOptions([row("openai/gpt-oss-120b", { isDefault: true }), row("zai/glm-5.3")], { codexAccountProfileId: VERCEL }, profiles);
    expect(account.map((option) => option.key)).toEqual([`codex:openai/gpt-oss-120b@${VERCEL}`, `codex:zai/glm-5.3@${VERCEL}`]);
    const fixed = optionForFixedModel({ providerId: "codex" } as never, account);
    expect(fixed?.accountProfileId).toBe(VERCEL);
    expect(accountSwitchForSelection({ option: fixed!, selection: { codexAccountProfileId: VERCEL }, profiles })).toBeNull();
    // On a sign-in account nothing is tagged, so nothing switches either.
    const own = tagSelectedConnectionOptions([row("gpt-6.1-sol")], { codexAccountProfileId: "work" }, profiles);
    expect(own[0]!.accountProfileId).toBeUndefined();
    expect(accountSwitchForSelection({ option: own[0]!, selection: { codexAccountProfileId: "work" }, profiles })).toBeNull();
  });

  test("the picker names every connection above its rows, beside the runtime's own rows", () => {
    const sections = groupModelSections([
      row("gpt-6.1-sol"),
      row("openai/gpt-oss-120b", { key: `codex:openai/gpt-oss-120b@${VERCEL}`, accountProfileId: VERCEL, group: "Vercel · API billing" }),
      row("gpt-6-luna"),
      row("openai/gpt-oss-120b", { key: `codex:openai/gpt-oss-120b@${OTHER}`, accountProfileId: OTHER, group: "Company · API billing" }),
    ]);
    expect(sections.map((section) => [section.key, section.heading ?? null, section.options.map((option) => option.model)])).toEqual([
      ["", null, ["gpt-6.1-sol", "gpt-6-luna"]],
      [VERCEL, "Vercel · API billing", ["openai/gpt-oss-120b"]],
      [OTHER, "Company · API billing", ["openai/gpt-oss-120b"]],
    ]);
    // A list of one OpenCode provider keeps its single heading.
    expect(groupModelSections([row("a", { group: "Anthropic" }), row("b", { group: "Anthropic" })])[0]!.heading).toBe("Anthropic");
  });

  test("Claude rows with the same ID on different accounts both stay", () => {
    const claude = (model: string, accountProfileId?: string): ModelSelectorOption => ({
      key: `claude-code:${model}${accountProfileId ? `@${accountProfileId}` : ""}`, providerId: "claude-code", model, label: model, available: true,
      ...(accountProfileId ? { accountProfileId } : {}),
    });
    const collapsed = collapseClaudeContextOptions({
      options: [claude("claude-sonnet-5"), claude("claude-sonnet-5[1m]"), claude("claude-sonnet-5", VERCEL), claude("claude-sonnet-5", OTHER)],
      context1M: false,
    });
    expect(collapsed.map((option) => option.key)).toEqual([
      "claude-code:claude-sonnet-5",
      `claude-code:claude-sonnet-5@${VERCEL}`,
      `claude-code:claude-sonnet-5@${OTHER}`,
    ]);
  });

  test("a shortcut saved as provider:model reaches that model on a connection", () => {
    const options = [row("gpt-6.1-sol"), row("openai/gpt-oss-120b", { key: `codex:openai/gpt-oss-120b@${VERCEL}`, accountProfileId: VERCEL })];
    expect(findModelShortcutOption({ slotIndex: 0, shortcutKeys: ["codex:openai/gpt-oss-120b"], options })?.accountProfileId).toBe(VERCEL);
    expect(findModelShortcutOption({ slotIndex: 0, shortcutKeys: ["codex:gpt-6.1-sol"], options })?.key).toBe("codex:gpt-6.1-sol");
  });
});
