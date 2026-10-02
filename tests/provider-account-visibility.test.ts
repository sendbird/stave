import { describe, expect, test } from "bun:test";
import {
  canSwitchProviderAccount,
  describeProviderSessionAccount,
  shouldShowProviderAccountPicker,
} from "@/lib/providers/provider-account-selection";
import { SYSTEM_ACCOUNT_PROFILE_ID, type ProviderAccountProfile } from "@/lib/providers/provider-accounts";

const system: ProviderAccountProfile = { id: SYSTEM_ACCOUNT_PROFILE_ID, providerId: "claude-code", label: "System default", kind: "system" };
const work: ProviderAccountProfile = { id: "11111111-1111-4111-8111-111111111111", providerId: "claude-code", label: "Work", kind: "managed" };
const removedId = "22222222-2222-4222-8222-222222222222";

describe("account pickers", () => {
  test("a single account offers no choice, a second one does", () => {
    expect(canSwitchProviderAccount([system])).toBe(false);
    expect(canSwitchProviderAccount([system, work])).toBe(true);
    expect(shouldShowProviderAccountPicker({ options: [system], selectedId: SYSTEM_ACCOUNT_PROFILE_ID })).toBe(false);
    expect(shouldShowProviderAccountPicker({ options: [system, work], selectedId: SYSTEM_ACCOUNT_PROFILE_ID })).toBe(true);
  });

  test("a removed selection keeps the picker as the way back", () => {
    expect(shouldShowProviderAccountPicker({ options: [system], selectedId: removedId })).toBe(true);
    // Providers without Stave accounts have no options and never draw one.
    expect(shouldShowProviderAccountPicker({ options: [], selectedId: removedId })).toBe(false);
  });
});

describe("session account names", () => {
  const profiles = [system, work, { ...system, providerId: "codex" as const }];
  const describe = (providerId: Parameters<typeof describeProviderSessionAccount>[0]["providerId"], accountProfileId: string, profilesLoaded = true) =>
    describeProviderSessionAccount({ providerId, accountProfileId, profiles, profilesLoaded });

  test("names nothing for System default or a provider without accounts", () => {
    expect(describe("claude-code", SYSTEM_ACCOUNT_PROFILE_ID)).toBeNull();
    expect(describe("codex", SYSTEM_ACCOUNT_PROFILE_ID)).toBeNull();
    expect(describe("cursor", SYSTEM_ACCOUNT_PROFILE_ID)).toBeNull();
    expect(describe("kiro", work.id)).toBeNull();
  });

  test("names another account by its label and a removed one without its id", () => {
    expect(describe("claude-code", work.id)).toBe("Work");
    // Same id under another provider is not that account.
    expect(describe("codex", work.id)).toBe("Removed account");
    expect(describe("claude-code", removedId)).toBe("Removed account");
  });

  test("does not call an account removed before the list has loaded", () => {
    expect(describe("claude-code", removedId, false)).toBeNull();
    expect(describe("claude-code", work.id, false)).toBe("Work");
  });
});
